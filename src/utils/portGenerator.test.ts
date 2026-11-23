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
  assert.match(nfd, /ScanLocalXisoCandidates/);
  assert.match(nfd, /NFD_OpenDialogMultipleN/);
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
