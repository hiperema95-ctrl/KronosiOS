import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BUILD_CONFIG,
  DEFAULT_MOD_PROFILES,
  MARATHON_DLC_CATALOG,
  XISO_MAGIC,
  convertGoogleDriveUrl,
  generateModProfileJson,
  generatePortRepository,
  inspectXisoCandidate,
  validateBuildConfig,
} from './portGenerator';
import { buildZipBytes, computeCrc32 } from './zipBuilder';

test('DEFAULT_BUILD_CONFIG uses com.hiperema.kronos06.ios and passes validation with zero issues', () => {
  assert.equal(DEFAULT_BUILD_CONFIG.bundleId, 'com.hiperema.kronos06.ios');
  const issues = validateBuildConfig(DEFAULT_BUILD_CONFIG);
  assert.equal(issues.length, 0);
});

test('validateBuildConfig flags invalid bundle ID, app version, and non-GitHub URL', () => {
  const issues = validateBuildConfig({
    ...DEFAULT_BUILD_CONFIG,
    appName: '!',
    bundleId: 'invalid_bundle',
    appVersion: 'v1',
    upstreamRepoUrl: 'http://example.com/repo',
    upstreamRef: '',
  });
  assert.equal(issues.length, 5);
  assert.ok(issues.some((i) => i.field === 'bundleId'));
  assert.ok(issues.some((i) => i.field === 'appVersion'));
});

test('generatePortRepository creates all required clean-room overlay files for MarathonRecomp v1.0.0', () => {
  const files = generatePortRepository(DEFAULT_BUILD_CONFIG);
  const paths = new Set(files.map((f) => f.path));

  const expected = [
    '.github/workflows/build-ios-ipa.yml',
    'scripts/apply_ios_port.sh',
    'ios/nfd_ios.mm',
    'ios/include/nfd.h',
    'ios/curl_ios_stub.mm',
    'ios/include/curl/curl.h',
    'ios/os/ios_platform.mm',
    'ios/ios_virtual_controller.mm',
    'ios/include/ios_virtual_controller.h',
    'ios/ios_mod_manager.mm',
    'ios/include/ios_mod_manager.h',
    'ios/ios_lossless_scaler.mm',
    'ios/include/ios_lossless_scaler.h',
    'ios/Info.plist',
    'ios/Entitlements.plist',
    'cmake/MarathonRecompIOS.cmake',
    'cmake/iOSPortTarget.cmake',
    '.gitignore',
    'README.md',
    'LEGAL.md',
  ];

  for (const exp of expected) {
    assert.ok(paths.has(exp), `Missing expected generated file: ${exp}`);
  }
  const plist = files.find((f) => f.path === 'ios/Info.plist')!.content;
  assert.match(plist, /com\.hiperema\.kronos06\.ios/);
});

test('Step 8/9 workflow and CMake resolve FreeType, FFmpeg 5 archives, NFD, CURL, and IMPORTED host tools on iOS', () => {
  const files = generatePortRepository(DEFAULT_BUILD_CONFIG);
  const workflow = files.find((f) => f.path === '.github/workflows/build-ios-ipa.yml')!.content;
  const iosCmake = files.find((f) => f.path === 'cmake/MarathonRecompIOS.cmake')!.content;
  const patcher = files.find((f) => f.path === 'scripts/apply_ios_port.sh')!.content;
  const platformMm = files.find((f) => f.path === 'ios/os/ios_platform.mm')!.content;

  // Step 9 FreeType iOS sysroot bypass + explicit cache hints
  assert.match(workflow, /CMAKE_FIND_ROOT_PATH_MODE_LIBRARY=BOTH/);
  assert.match(workflow, /CMAKE_FIND_ROOT_PATH_MODE_INCLUDE=BOTH/);
  assert.match(workflow, /FREETYPE_LIBRARY=/);
  assert.match(workflow, /FREETYPE_INCLUDE_DIR_ft2build=/);
  assert.match(workflow, /FREETYPE_INCLUDE_DIR_freetype2=/);

  // Step 8 FFmpeg builds all 5 archives required by upstream ffmpeg target
  assert.match(workflow, /--enable-avformat --enable-avcodec --enable-swscale --enable-avutil --enable-swresample/);

  // CMake iOS helpers define nfd::nfd, ffmpeg, CURL::libcurl, IMPORTED GLOBAL host tools, and DIRECTX_DXC_TOOL
  assert.match(iosCmake, /add_library\(nfd::nfd ALIAS nfd\)/);
  assert.match(iosCmake, /add_library\(CURL::libcurl ALIAS marathon_ios_curl\)/);
  assert.match(iosCmake, /foreach\(component avformat avcodec swscale avutil swresample\)/);
  assert.match(iosCmake, /add_executable\(\$\{_tool_name\} IMPORTED GLOBAL\)/);
  assert.match(iosCmake, /DIRECTX_DXC_TOOL/);

  // Patcher handles thirdparty skip, IMPORTED XenosRecomp guard, iPhoneOS metal SDK, CheckConsole, SDL_main
  assert.match(patcher, /marathon_setup_ios_thirdparty/);
  assert.match(patcher, /marathon_setup_ios_host_tools/);
  assert.match(patcher, /SKIP_PRECOMPILE_HEADERS ON/);
  assert.match(patcher, /MarathonIOS_OpenURL/);
  assert.match(patcher, /SDL3\/SDL_main\.h/);
  assert.match(platformMm, /void CheckConsole\(\)/);

  // Plume iOS UIKit (no AppKit/IOKit), Metal CreateSystemDefaultDevice, UIWindow handle, pure Metal 3, no macOS libusb
  assert.match(workflow, /SDL_HIDAPI_LIBUSB=OFF/);
  assert.match(patcher, /MARATHON_PLUME_IOS_UIKIT/);
  assert.match(patcher, /MARATHON_PLUME_IOS_METAL_PATCH/);
  assert.match(patcher, /SDL_PROP_WINDOW_UIKIT_WINDOW_POINTER/);
  assert.match(patcher, /MARATHON_IOS_NATIVE_METAL/);

  // Auto-trigger workflow on git push to main/master + cancel superseded runs
  assert.match(workflow, /on:\n\s+push:\n\s+branches:\n\s+- main\n\s+- master/);
  assert.match(workflow, /concurrency:\n\s+group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\n\s+cancel-in-progress: true/);

  // Full C++20 std::atomic_ref polyfill for trivially-copyable types (be<uint32_t>), operator=, wait, notify_one/all
  assert.match(patcher, /__atomic_load\(ptr_, &out,/);
  assert.match(patcher, /__atomic_store\(ptr_, &val,/);
  assert.match(patcher, /__atomic_compare_exchange\(ptr_, &exp, &des,/);
  assert.match(patcher, /T operator=\(T desired\) const noexcept/);
  assert.match(patcher, /void wait\(T old,/);
  assert.match(patcher, /void notify_one\(\) const noexcept/);
  assert.match(patcher, /void notify_all\(\) const noexcept/);

  // CURLoption uses int to avoid -Wvarargs UB in curl_easy_setopt
  const curlHeader = files.find((f) => f.path === 'ios/include/curl/curl.h')!.content;
  assert.match(curlHeader, /typedef int CURLoption;/);

  // Step 8 patches FFmpeg with sonicnext-dev/ffmpeg-core xmaframes decoder (AV_CODEC_ID_XMAFRAMES)
  assert.match(workflow, /AV_CODEC_ID_XMAFRAMES/);
  assert.match(workflow, /ff_xmaframes_decoder/);
  assert.match(workflow, /--enable-decoder=xmaframes,/);
  assert.match(workflow, /--enable-parser=vorbis,h264,aac,flac,opus,mpegaudio/);
});

test('config updates propagate dynamically into Info.plist, workflow YAML, and CMake', () => {
  const custom = {
    ...DEFAULT_BUILD_CONFIG,
    appName: 'Sonic06Mobile',
    bundleId: 'com.hiperema.sonic06mobile.app',
    deploymentTarget: '18.0' as const,
    secretMode: 'individual-secrets' as const,
    rendererBackend: 'moltenvk-metal3' as const,
  };
  const files = generatePortRepository(custom);
  const plist = files.find((f) => f.path === 'ios/Info.plist')!.content;
  const workflow = files.find((f) => f.path === '.github/workflows/build-ios-ipa.yml')!.content;
  const cmake = files.find((f) => f.path === 'cmake/MarathonRecompIOS.cmake')!.content;

  assert.match(plist, /com\.hiperema\.sonic06mobile\.app/);
  assert.match(plist, /<string>18\.0<\/string>/);
  assert.match(workflow, /DEFAULT_XEX_URL/);
  assert.match(workflow, /SHADER_ARC_URL/);
  assert.match(workflow, /SHADER_LT_ARC_URL/);
  assert.match(workflow, /MoltenVK-ios\.tar/);
  assert.match(workflow, /drive\.usercontent\.google\.com/);
  assert.match(cmake, /MARATHON_IOS_MOLTENVK=1/);
});

test('convertGoogleDriveUrl converts share, uc, and usercontent URLs into direct download links', () => {
  const share = convertGoogleDriveUrl(
    'https://drive.google.com/file/d/1XyZ_9876543210AbCdEf/view?usp=sharing'
  );
  assert.equal(share.valid, true);
  assert.equal(share.fileId, '1XyZ_9876543210AbCdEf');
  assert.equal(
    share.directUrl,
    'https://drive.usercontent.google.com/download?id=1XyZ_9876543210AbCdEf&export=download&confirm=t'
  );

  const uc = convertGoogleDriveUrl(
    'https://drive.google.com/uc?export=download&id=1XyZ_9876543210AbCdEf'
  );
  assert.equal(uc.valid, true);
  assert.equal(uc.fileId, '1XyZ_9876543210AbCdEf');

  const bad = convertGoogleDriveUrl('https://example.com/not-drive');
  assert.equal(bad.valid, false);
});

test('generated .gitignore and workflow strictly block copyrighted binaries on public repo', () => {
  const files = generatePortRepository(DEFAULT_BUILD_CONFIG);
  const gitignore = files.find((f) => f.path === '.gitignore')!.content;
  const workflow = files.find((f) => f.path === '.github/workflows/build-ios-ipa.yml')!.content;

  for (const token of ['*.xex', '*.xbe', '*.iso', '*.xiso', 'shader.arc', 'shader_lt.arc']) {
    assert.ok(gitignore.includes(token), `.gitignore missing copyright guard for ${token}`);
  }
  assert.match(workflow, /Audit Sicurezza Repo Pubblico/);
  assert.match(workflow, /rm -rf "\$\{GITHUB_WORKSPACE\}\/MarathonRecomp-Upstream\/MarathonRecompLib\/private"/);
});

test('generated apply_ios_port.sh and nfd_ios.mm implement direct XISO streaming and separate DLC mode', () => {
  const files = generatePortRepository(DEFAULT_BUILD_CONFIG);
  const patcher = files.find((f) => f.path === 'scripts/apply_ios_port.sh')!.content;
  const nfd = files.find((f) => f.path === 'ios/nfd_ios.mm')!.content;

  assert.match(patcher, /MARATHON_IOS_STREAMING_XISO/);
  assert.match(patcher, /#if defined\(MARATHON_IOS_STREAMING_XISO\) && MARATHON_IOS_STREAMING_XISO\n#include "iso_file_system\.h"/);
  assert.match(patcher, /MICROSOFT\*XBOX\*MEDIA/);
  assert.match(patcher, /MARATHON_IOS_PICKER_MODE_GAME_XISO/);
  assert.match(patcher, /MARATHON_IOS_PICKER_MODE_DLC_SEPARATE/);
  assert.match(patcher, /MARATHON_IOS_MMAP_GUARD/);
  assert.match(patcher, /getIOSMetalLayerSize/);
  assert.match(patcher, /syncIOSMetalViewOnMainThread/);
  assert.doesNotMatch(patcher, /metalLayer\.frame\s*=\s*superBounds/);
  assert.match(patcher, /MARATHON_IOS_METALVIEW_LAYOUT_FIX/);
  assert.match(patcher, /MARATHON_IOS_WINDOW_ROTATION_FIX/);
  assert.match(patcher, /UIWindowSceneGeometryPreferencesIOS/);
  assert.match(patcher, /MarathonIOS_MapWindowPointToImGui/);
  assert.match(patcher, /ButtonWindow::HitTest/);
  assert.match(patcher, /g_iosMsgButtonRects/);
  assert.match(patcher, /MARATHON_IOS_PORT_CREDITS/);
  assert.match(patcher, /Porting iOS creato da hiperema/);
  assert.match(patcher, /iOS port created by hiperema/);
  assert.match(patcher, /iOS版制作：hiperema/);
  assert.match(patcher, /iOS-Port erstellt von hiperema/);
  assert.match(patcher, /Portage iOS créé par hiperema/);
  assert.match(patcher, /Port para iOS creado por hiperema/);
  assert.match(patcher, /EIOSInputMode/);
  assert.match(patcher, /SDLEventListenerForIOSButtonMode/);
  assert.match(patcher, /MARATHON_IOS_INSTALLER_HID_ICONS/);
  assert.match(patcher, /COMPILE_OPTIONS "-fobjc-arc"/);
  assert.match(patcher, /MARATHON_IOS_SKIP_DESKTOP_UPDATE_CHECK/);
  assert.match(patcher, /MARATHON_IOS_SAFE_CONFIG_DIR/);
  // Post-installer freeze fixes: deadlock-free atomic_ref, APFS case-insensitive FS, Metal drawable ownership & shader loading, iphoneos metallib
  assert.match(patcher, /new WaitBucket\[256\]\(\)/);
  assert.doesNotMatch(patcher, /bucket\.cv\.notify_one\(\)/);
  assert.match(patcher, /load_order_for_wait/);
  assert.match(patcher, /MARATHON_IOS_PATH_CACHE_FIX/);
  assert.match(patcher, /MARATHON_IOS_CASE_INSENSITIVE_FS/);
  assert.match(patcher, /filePath = std::move\(cachedPath\)/);
  assert.match(patcher, /DISPATCH_DATA_DESTRUCTOR_DEFAULT/);
  assert.match(patcher, /dispatch_release\(dispatchData\)/);
  assert.match(patcher, /CA::MetalDrawable \*drawableMtl = drawable\.mtl;\s+drawable\.mtl = nullptr;/);
  assert.match(patcher, /if \(interfaceQueryPool->sampleBuffer == nullptr\)/);
  assert.match(patcher, /"-sdk", "iphoneos", "metallib",/);
  const curlMm = files.find((f) => f.path === 'ios/curl_ios_stub.mm')!.content;
  assert.match(curlMm, /ephemeralSessionConfiguration/);
  assert.match(curlMm, /MarathonCurlAsyncState/);
  assert.match(nfd, /ScanLocalXisoCandidates/);
  assert.match(nfd, /NFD_OpenDialogMultipleN/);

  const plist = files.find((f) => f.path === 'ios/Info.plist')!.content;
  const entitlements = files.find((f) => f.path === 'ios/Entitlements.plist')!.content;
  const workflow = files.find((f) => f.path === '.github/workflows/build-ios-ipa.yml')!.content;
  assert.match(plist, /<key>UILaunchScreen<\/key>\n\s+<dict\/>/);
  assert.match(entitlements, /<key>get-task-allow<\/key>/);
  assert.match(workflow, /xcrun actool/);
  assert.match(workflow, /rm -rf "\$\{APP_DIR\}\/_CodeSignature"/);
});

test('ARM64 freeze fixes, ios_debug.log watchdog, and Sonic 06 themed virtual controller are wired cleanly', () => {
  const files = generatePortRepository(DEFAULT_BUILD_CONFIG);
  const patcher = files.find((f) => f.path === 'scripts/apply_ios_port.sh')!.content;
  const platformMm = files.find((f) => f.path === 'ios/os/ios_platform.mm')!.content;
  const vcHeader = files.find((f) => f.path === 'ios/include/ios_virtual_controller.h')!.content;
  const vcMm = files.find((f) => f.path === 'ios/ios_virtual_controller.mm')!.content;

  // ARM64 LL/SC compare_exchange_weak deadlock fixes in kernel/imports.cpp
  assert.match(patcher, /MARATHON_IOS_ARM64_CAS_FIX/);
  assert.match(patcher, /if \(signaled\.compare_exchange_strong\(expected, false\)\)/);
  assert.match(patcher, /if \(owningThread\.compare_exchange_strong\(previousOwner, thisThread\) \|\| previousOwner == thisThread\)/);
  assert.match(patcher, /if \(previousOwner != 0\)\s+owningThread\.wait\(previousOwner\);/);

  // Metal iOS stability & Invalid Resource (00000009) root-cause fixes
  assert.match(patcher, /MARATHON_IOS_DISABLE_RESIDENCY_SET/);
  assert.match(patcher, /const bool supportsResidencySets = false;/);
  assert.match(patcher, /isDepthPixelFormat/);
  assert.match(patcher, /usage &= ~MTL::TextureUsageShaderWrite;/);
  assert.match(patcher, /usage \|= MTL::TextureUsagePixelFormatView;/);
  assert.match(patcher, /commandQueue->mtl->commandBuffer\(\)/);
  assert.match(patcher, /queue->mtl->commandBuffer\(\)/);
  assert.match(patcher, /mtl->commandBuffer\(\)/);
  assert.match(patcher, /g_iosDescriptorSetMutex/);
  assert.match(patcher, /g_iosAddressableGen/);
  assert.match(patcher, /g_iosDescriptorGen/);
  assert.match(patcher, /bindIOSDescriptorSetResources/);
  assert.match(patcher, /renderEncoder->useResource\(resource, MTL::ResourceUsageRead \| MTL::ResourceUsageWrite, MTL::RenderStageVertex \| MTL::RenderStageFragment\)/);
  assert.match(patcher, /logIOSMetalCmdBufferError\("exec", cmdBuffer\)/);
  assert.match(patcher, /newTexture FAILED:/);
  assert.match(patcher, /newTextureView FAILED:/);
  assert.match(patcher, /waitForCommandFence stalled >5s/);
  assert.match(patcher, /Video::Present:WaitFence/);

  // On-device diagnostic log + crash backtrace + Mach thread-state freeze watchdog
  assert.match(platformMm, /ios_debug\.log/);
  assert.match(platformMm, /ios_debug_prev\.log/);
  assert.match(platformMm, /SignalCrashHandler/);
  assert.match(platformMm, /task_threads\(mach_task_self\(\)/);
  assert.match(platformMm, /ARM_THREAD_STATE64/);
  assert.match(platformMm, /void MarathonIOS_Heartbeat\(const char\* phase\)/);
  assert.match(platformMm, /void MarathonIOS_RenderHeartbeat\(const char\* phase\)/);
  assert.match(platformMm, /void MarathonIOS_LogLine\(const char\* tag, const char\* msg\)/);

  // Virtual controller wired into HID::GetState/SetState + character theme in app.cpp
  assert.match(patcher, /MARATHON_IOS_VIRTUAL_GAMEPAD/);
  assert.match(patcher, /MarathonIOS_GetVirtualControllerState\(&vpad\)/);
  assert.match(patcher, /MarathonIOS_TriggerHapticRumble/);
  assert.match(patcher, /MARATHON_IOS_CHARACTER_THEME/);
  assert.match(patcher, /MarathonIOS_SetCharacterTheme\(theme\)/);

  // Sonic '06 dynamic Sonic / Shadow / Silver virtual controller without "06" / Mods button
  assert.match(vcHeader, /MARATHON_THEME_SONIC\s*=\s*0/);
  assert.match(vcHeader, /MARATHON_THEME_SHADOW\s*=\s*1/);
  assert.match(vcHeader, /MARATHON_THEME_SILVER\s*=\s*2/);
  assert.match(vcHeader, /void MarathonIOS_SetCharacterTheme\(int theme\);/);
  assert.match(vcMm, /Sonic06StickView/);
  assert.match(vcMm, /Sonic06DPadView/);
  assert.match(vcMm, /- \(void\)layoutSubviews/);
  assert.match(vcMm, /self\.safeAreaInsets/);
  assert.doesNotMatch(vcMm, /quickHudBar/);
  assert.doesNotMatch(vcMm, /MarathonIOS_PresentModManager/);
  assert.doesNotMatch(vcMm, /setTitle:@"06"/);
  assert.doesNotMatch(vcMm, /ios_mod_manager\.h/);
});

test('iOS lifecycle pause/resume, hardware thermal auto-config, 30/60/120 FPS ProMotion lock, and low-latency direct multi-touch controller are wired', () => {
  const files = generatePortRepository(DEFAULT_BUILD_CONFIG);
  const patcher = files.find((f) => f.path === 'scripts/apply_ios_port.sh')!.content;
  const platformMm = files.find((f) => f.path === 'ios/os/ios_platform.mm')!.content;
  const vcHeader = files.find((f) => f.path === 'ios/include/ios_virtual_controller.h')!.content;
  const vcMm = files.find((f) => f.path === 'ios/ios_virtual_controller.mm')!.content;
  const plist = files.find((f) => f.path === 'ios/Info.plist')!.content;

  // 1. Zero-stall lock-screen / app-switch lifecycle pause & resume
  assert.match(vcHeader, /bool MarathonIOS_IsAppSuspended\(void\);/);
  assert.match(vcHeader, /void MarathonIOS_WaitUntilActive\(void\);/);
  assert.match(vcHeader, /void MarathonIOS_ResetVirtualControllerInputs\(void\);/);
  assert.match(platformMm, /UIApplicationWillResignActiveNotification/);
  assert.match(platformMm, /UIApplicationDidEnterBackgroundNotification/);
  assert.match(platformMm, /UIApplicationDidBecomeActiveNotification/);
  assert.match(platformMm, /CFRunLoopRunInMode\(kCFRunLoopDefaultMode/);
  assert.match(patcher, /SDL_EVENT_WILL_ENTER_BACKGROUND/);
  assert.match(patcher, /SDL_EVENT_DID_ENTER_FOREGROUND/);
  assert.match(patcher, /if \(MarathonIOS_IsAppSuspended\(\)\)\s*\{\s*MarathonIOS_WaitUntilActive\(\);/);
  assert.match(patcher, /if \(MarathonIOS_IsAppSuspended\(\)\) \{\s*return false;\s*\}/);
  assert.match(patcher, /if \(ctx\.f1\.f64 > 0\.1 \|\| ctx\.f1\.f64 < 0\.0\)/);

  // 2. Smart first-launch iOS hardware auto-config & low-heat pacing
  assert.match(vcHeader, /typedef struct MarathonIOSHardwareProfile/);
  assert.match(platformMm, /void MarathonIOS_GetHardwareProfile\(MarathonIOSHardwareProfile\* outProfile\)/);
  assert.match(patcher, /ApplyIOSHardwareDefaults/);
  assert.match(patcher, /ios_hw_tuned_v3/);
  assert.match(patcher, /std::this_thread::sleep_until\(s_next\)/);

  // 3. 30 / 60 / 120 FPS selector in Options Menu & ProMotion LTPO pacing
  assert.match(plist, /<key>CADisableMinimumFrameDurationOnPhone<\/key>\s*<true\/>/);
  assert.match(patcher, /MARATHON_IOS_FPS_SELECTOR/);
  assert.match(patcher, /DrawOption\(rowCount\+\+, &Config::FPS, true, nullptr, 30, 60, 120, false\);/);
  assert.match(patcher, /kIOSFpsPresets\[3\] = \{ 30, 60, 120 \}/);
  assert.match(patcher, /valueText = fmt::format\("\{\} FPS", config->Value\);/);
  assert.match(patcher, /presentIOSDrawable\(drawableMtl, MarathonIOS_GetEffectiveTargetFPS\(\)\)/);
  assert.match(patcher, /presentAfterMinimumDuration:\(1\.0 \/ 32\.0\)/);
  assert.match(patcher, /presentAfterMinimumDuration:\(1\.0 \/ 65\.0\)/);
  assert.match(patcher, /presentAfterMinimumDuration:\(1\.0 \/ 95\.0\)/);
  assert.match(patcher, /if \(Config::FPS <= 35\) Config::FPS = 30;/);

  // 4. Ultra-responsive direct multi-touch virtual controller (no UIButton lag, ABXY thumb-slide, pre-warmed UIImpactFeedbackGenerator)
  assert.match(vcMm, /struct TrackedTouchSlot/);
  assert.match(vcMm, /hitABXYButtonAtPoint:/);
  assert.match(vcMm, /UIImpactFeedbackGenerator/);
  assert.match(vcMm, /\[CATransaction setDisableActions:YES\]/);
  assert.match(vcMm, /void MarathonIOS_ResetVirtualControllerInputs\(void\)/);
  assert.doesNotMatch(vcMm, /@interface Sonic06PadButton : UIButton/);
});

test('iPhone 16 Pro 120 FPS ProMotion driver, Thermal Guardian, Metal useResources batching, audio/QoS/Jetsam, and ARMv8.5-A tuning are wired', () => {
  const files = generatePortRepository(DEFAULT_BUILD_CONFIG);
  const patcher = files.find((f) => f.path === 'scripts/apply_ios_port.sh')!.content;
  const platformMm = files.find((f) => f.path === 'ios/os/ios_platform.mm')!.content;
  const vcHeader = files.find((f) => f.path === 'ios/include/ios_virtual_controller.h')!.content;
  const iosCmake = files.find((f) => f.path === 'cmake/MarathonRecompIOS.cmake')!.content;

  // 1. ProMotion 120Hz CADisplayLink driver & event-driven Thermal Guardian
  assert.match(vcHeader, /int MarathonIOS_GetEffectiveTargetFPS\(void\);/);
  assert.match(vcHeader, /int MarathonIOS_GetThermalState\(void\);/);
  assert.match(vcHeader, /void MarathonIOS_ApplyProMotionRefreshRate\(int targetFps\);/);
  assert.match(platformMm, /@interface MarathonProMotionDriver : NSObject/);
  assert.match(platformMm, /CAFrameRateRangeMake\(80\.0f, 120\.0f, 120\.0f\)/);
  assert.match(platformMm, /NSProcessInfoThermalStateDidChangeNotification/);
  assert.match(platformMm, /p\.tier = 3;/);
  assert.match(platformMm, /p\.recommendedFps = 120;/);
  assert.match(platformMm, /QOS_CLASS_BACKGROUND/);

  // 2. Batched Metal useResources(), 2.0x Retina cap, triple buffering, framebufferOnly AFBC, throttled UIKit layout sync
  assert.match(patcher, /bindIOSAddressableResources/);
  assert.match(patcher, /->useResources\(/);
  assert.match(patcher, /metalLayer\.maximumDrawableCount = 3;/);
  assert.match(patcher, /const BOOL wantFramebufferOnly = MarathonIOS_NeedsReadableDrawable\(\) \? NO : YES;/);
  assert.match(patcher, /metalLayer\.framebufferOnly = wantFramebufferOnly;/);
  assert.match(patcher, /\(native > 2\.0\) \? 2\.0 : native/);
  assert.match(patcher, /g_iosMetalLastSyncSec/);
  assert.match(patcher, /if \(scale > 2\.0\)/);
  assert.match(patcher, /setDef\(Config::TripleBuffering, ETripleBuffering::On\);/);
  assert.match(patcher, /bufferCount = 3;/);

  // 3. Zero-busy-spin audio + 1024-frame CoreAudio buffer + Apple Silicon P-core QoS + autorelease pools + Jetsam MADV_FREE
  assert.match(patcher, /MARATHON_IOS_AUDIO_OPT/);
  assert.match(patcher, /SDL_HINT_AUDIO_DEVICE_SAMPLE_FRAMES, "1024"/);
  assert.match(patcher, /std::this_thread::sleep_until\(next\);/);
  assert.match(patcher, /MARATHON_IOS_JETSAM_DISCARD/);
  assert.match(patcher, /MarathonIOSDiscardFreedPages/);
  assert.match(patcher, /MADV_FREE/);
  assert.match(patcher, /MARATHON_IOS_QOS_THREAD/);
  assert.match(patcher, /pthread_set_qos_class_self_np\(QOS_CLASS_USER_INTERACTIVE, 0\);/);
  assert.match(patcher, /objc_autoreleasePoolPush\(\)/);
  assert.match(patcher, /objc_autoreleasePoolPop\(/);

  // 4. Apple Silicon ARMv8.5-A codegen (LSE atomics) & host -ffp-model=precise (keeping strict FP in MarathonRecompLib)
  assert.match(iosCmake, /MARATHON_IOS_PROMOTION_120HZ=1/);
  assert.match(iosCmake, /-mcpu=apple-a14/);
  assert.match(iosCmake, /-fno-math-errno/);
  assert.match(patcher, /add_compile_options\(-ffp-model=precise\)/);
});

test('in-game ShowFPS Video option, 6-language localization, top-left safe-area FPS overlay, and on-disk parity are intact', async () => {
  const fs = await import('node:fs');
  const files = generatePortRepository(DEFAULT_BUILD_CONFIG);
  const patcher = files.find((f) => f.path === 'scripts/apply_ios_port.sh')!.content;
  const vcHeader = files.find((f) => f.path === 'ios/include/ios_virtual_controller.h')!.content;
  const vcMm = files.find((f) => f.path === 'ios/ios_virtual_controller.mm')!.content;

  // Native localized Video option directly matching other OptionsMenu rows
  assert.match(patcher, /CONFIG_DEFINE_LOCALISED\("Video", bool, ShowFPS, false, false\);/);
  assert.match(patcher, /CONFIG_DEFINE_LOCALE\(ShowFPS\)/);
  assert.match(patcher, /"Mostra FPS"/);
  assert.match(patcher, /"Show FPS"/);
  assert.match(patcher, /DrawOption\(rowCount\+\+, &Config::ShowFPS, true\);/);

  // Top-left Sonic '06 styled FPS HUD overlay with suspend-spike protection and safe-area mapping
  assert.match(patcher, /MARATHON_IOS_FPS_OVERLAY/);
  assert.match(patcher, /std::chrono::steady_clock::now\(\)/);
  assert.match(patcher, /if \(!g_pFntRodin\)/);
  assert.match(patcher, /MarathonIOS_GetFPSOverlayAnchorPoints\(&anchorWinX, &anchorWinY\);/);
  assert.match(patcher, /MarathonIOS_MapWindowPointToImGui\(anchorWinX, anchorWinY, &posX, &posY\);/);

  // Virtual controller publishes top-left safe-area anchor clearing LB/LT buttons
  assert.match(vcHeader, /void MarathonIOS_GetFPSOverlayAnchorPoints\(float\* outWinX, float\* outWinY\);/);
  assert.match(vcMm, /- \(void\)updateFPSOverlayAnchor;/);
  assert.match(vcMm, /void MarathonIOS_GetFPSOverlayAnchorPoints\(float\* outWinX, float\* outWinY\)/);

  // Generated files stay 100% byte-for-byte in sync with on-disk overlay files
  for (const relPath of [
    'scripts/apply_ios_port.sh',
    'ios/include/ios_lossless_scaler.h',
    'ios/ios_lossless_scaler.mm',
    'ios/include/ios_virtual_controller.h',
    'ios/ios_virtual_controller.mm',
    'ios/os/ios_platform.mm',
    'cmake/MarathonRecompIOS.cmake',
  ]) {
    const generated = files.find((f) => f.path === relPath)!.content;
    const onDisk = fs.readFileSync(relPath, 'utf8');
    assert.equal(generated, onDisk, `Template mismatch with on-disk ${relPath}`);
  }
});

test('native Metal Lossless Scaling (RCAS upscaling + Optical-Flow 2x/3x/2x Eco Frame Generation) is wired end-to-end', () => {
  const files = generatePortRepository(DEFAULT_BUILD_CONFIG);
  const patcher = files.find((f) => f.path === 'scripts/apply_ios_port.sh')!.content;
  const platformMm = files.find((f) => f.path === 'ios/os/ios_platform.mm')!.content;
  const lsHeader = files.find((f) => f.path === 'ios/include/ios_lossless_scaler.h')!.content;
  const lsMm = files.find((f) => f.path === 'ios/ios_lossless_scaler.mm')!.content;

  // 1. Pure Metal.framework runtime MSL shaders (zero MetalFX external link risk, valid C++11 raw string literal)
  assert.match(lsMm, /static const char \* const kLosslessScalerMSL = R"MSL\(/);
  assert.doesNotMatch(lsMm, /@R"MSL\(/);
  assert.match(lsMm, /kernel void ls_luma_downsample4x/);
  assert.match(lsMm, /kernel void ls_optical_flow/);
  assert.match(lsMm, /kernel void ls_flow_smooth/);
  assert.match(lsMm, /fragment half4 ls_present_fs/);
  assert.match(lsMm, /rcasSharpness/);
  assert.match(lsMm, /if \(layer\.framebufferOnly\)/);
  assert.match(lsMm, /MarathonIOS_LosslessOnDisplayLinkTick/);
  assert.match(lsMm, /ComputeEffectiveFGSchedule/);

  // 2. C API header & ProMotion CADisplayLink / lifecycle suspend integration
  assert.match(lsHeader, /MARATHON_IOS_UPSCALE_BALANCED = 2/);
  assert.match(lsHeader, /MARATHON_IOS_FG_X2_120 = 1/);
  assert.match(lsHeader, /MARATHON_IOS_FG_X3_120 = 2/);
  assert.match(lsHeader, /MARATHON_IOS_FG_X2_ECO60 = 3/);
  assert.match(platformMm, /#include <ios_lossless_scaler\.h>/);
  assert.match(platformMm, /MarathonIOS_LosslessOnDisplayLinkTick\(/);
  assert.match(platformMm, /MarathonIOS_LosslessOnSuspendChanged\(suspended\);/);
  assert.match(platformMm, /void MarathonIOS_NotifyFrameGenChanged\(void\)/);
  assert.match(platformMm, /const int fgOut = MarathonIOS_GetFrameGenOutputFPS\(\);/);

  // 3. In-game Video Options (6 languages), Plume present hook, pre-CheckSwapChain base pacing, ShowFPS base/out HUD, CMake source
  assert.match(patcher, /enum class ELosslessUpscaling : uint32_t/);
  assert.match(patcher, /enum class EFrameGeneration : uint32_t/);
  assert.match(patcher, /CONFIG_DEFINE_ENUM_LOCALISED\("Video", ELosslessUpscaling, LosslessUpscaling/);
  assert.match(patcher, /CONFIG_DEFINE_ENUM_LOCALISED\("Video", EFrameGeneration, FrameGeneration/);
  assert.match(patcher, /CONFIG_DEFINE_ENUM_TEMPLATE\(ELosslessUpscaling\)/);
  assert.match(patcher, /CONFIG_DEFINE_ENUM_TEMPLATE\(EFrameGeneration\)/);
  assert.match(patcher, /CONFIG_DEFINE_LOCALE\(LosslessUpscaling\)/);
  assert.match(patcher, /CONFIG_DEFINE_LOCALE\(FrameGeneration\)/);
  assert.match(patcher, /"Bilanciato \(65%\)"/);
  assert.match(patcher, /"3x \(40->120\)"/);
  assert.match(patcher, /DrawOption\(rowCount\+\+, &Config::LosslessUpscaling, true\);/);
  assert.match(patcher, /DrawOption\(rowCount\+\+, &Config::FrameGeneration, true\);/);
  assert.match(patcher, /MarathonIOS_LosslessPresentFrame\(commandQueue->mtl, layer, presentBuffer, drawableMtl\)/);
  assert.match(patcher, /const int32_t fgBaseFps = MarathonIOS_GetFrameGenBaseFPS\(\)/);
  assert.match(patcher, /config == &Config::LosslessUpscaling \|\|/);
  assert.match(patcher, /FPS \{:>2\}\/\{:>3\}  \{\}x/);
  assert.match(patcher, /"os\/ios\/ios_lossless_scaler\.mm"/);
});

test('inspectXisoCandidate validates extensions and detects real MICROSOFT*XBOX*MEDIA magic', () => {
  const invalid = inspectXisoCandidate({ fileName: 'game.zip', sizeBytes: 1024 });
  assert.equal(invalid.valid, false);

  const buf = new Uint8Array(32 * 2048 + 64);
  const magicBytes = new TextEncoder().encode(XISO_MAGIC);
  buf.set(magicBytes, 32 * 2048);

  const validReal = inspectXisoCandidate({
    fileName: 'Sonic06_USA.xiso',
    sizeBytes: 6_800_000_000,
    headerSample: buf,
  });
  assert.equal(validReal.valid, true);
  assert.equal(validReal.magicMatched, true);
  assert.equal(validReal.requiresPcExtraction, false);
  assert.equal(validReal.detectedOffsetHex, '0x00000000');
});

test('MARATHON_DLC_CATALOG covers all 7 official Xbox 360 DLC packs and generateModProfileJson filters enabled mods', () => {
  assert.equal(MARATHON_DLC_CATALOG.length, 7);
  const { profilesJson, defaultProfileJson } = generateModProfileJson(DEFAULT_MOD_PROFILES);
  const parsedProfiles = JSON.parse(profilesJson);
  const parsedDefault = JSON.parse(defaultProfileJson);

  assert.equal(parsedProfiles.ProfileIndex, 0);
  assert.deepEqual(parsedDefault.EnabledMods, ['LegacyOfSolaris_HD_UI', 'SkipIntroLogos']);
});

test('buildZipBytes produces valid PKZIP archive with expected CRC32 and signatures', () => {
  assert.equal(computeCrc32(new TextEncoder().encode('123456789')), 0xcbf43926);

  const files = generatePortRepository(DEFAULT_BUILD_CONFIG);
  const zipBytes = buildZipBytes(
    files.map((f) => ({ path: f.path, content: f.content, executable: f.executable }))
  );

  // Local file header signature PK\x03\x04
  assert.equal(zipBytes[0], 0x50);
  assert.equal(zipBytes[1], 0x4b);
  assert.equal(zipBytes[2], 0x03);
  assert.equal(zipBytes[3], 0x04);

  // EOCD signature PK\x05\x06 at end - 22
  const eocdOffset = zipBytes.length - 22;
  assert.equal(zipBytes[eocdOffset], 0x50);
  assert.equal(zipBytes[eocdOffset + 1], 0x4b);
  assert.equal(zipBytes[eocdOffset + 2], 0x05);
  assert.equal(zipBytes[eocdOffset + 3], 0x06);

  // Entry count matches generated files
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  assert.equal(view.getUint16(eocdOffset + 10, true), files.length);
});
