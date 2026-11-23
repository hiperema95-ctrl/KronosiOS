#!/usr/bin/env bash
# Clean-Room iOS Port Patcher for sonicnext-dev/MarathonRecomp v1.0.0
# Architecture inspired by hiperema95-ctrl/edgyios (zero-fork overlay)
# - Direct .xiso / .iso import in SelectGame (streaming pread ISOFileSystem, no PC unpacking!)
# - Separate DLC import preserved in SelectDLC (7 official Xbox 360 DLC packs)
# - Native iOS 17+ Metal 3 AIR shader target + Plume UIWindow/CAMetalLayer bridge
# - Writable Documents/MarathonRecomp sandbox + Apple libc++ std::atomic_ref polyfill

set -euo pipefail

UPSTREAM_DIR="$1"
PORT_DIR="$2"
DEPS_DIR="$3"

echo "==> [1/8] Creazione stub VCPKG_ROOT per cross-compilazione iOS..."
mkdir -p "${DEPS_DIR}/vcpkg-ios-stub/scripts/buildsystems"
cat << 'EOF_VCPKG' > "${DEPS_DIR}/vcpkg-ios-stub/scripts/buildsystems/vcpkg.cmake"
# Stub vcpkg.cmake per cross-compilazione iOS arm64 su GitHub Actions
message(STATUS "MarathonRecomp iOS: utilizzo librerie statiche iOS arm64 native al posto di vcpkg desktop.")
EOF_VCPKG

echo "==> [2/8] Copia layer nativo iOS (OS, NFD Files Picker XISO/DLC, CURL NSURLSession, Controller, Mod Manager, CMake)..."
mkdir -p "${UPSTREAM_DIR}/MarathonRecomp/os/ios"
mkdir -p "${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include/curl"
mkdir -p "${UPSTREAM_DIR}/ios" "${UPSTREAM_DIR}/cmake"

cp "${PORT_DIR}/ios/os/ios_platform.mm" "${UPSTREAM_DIR}/MarathonRecomp/os/ios/ios_platform.mm"
cp "${PORT_DIR}/ios/nfd_ios.mm" "${UPSTREAM_DIR}/MarathonRecomp/os/ios/nfd_ios.mm"
cp "${PORT_DIR}/ios/curl_ios_stub.mm" "${UPSTREAM_DIR}/MarathonRecomp/os/ios/curl_ios_stub.mm"
cp "${PORT_DIR}/ios/ios_virtual_controller.mm" "${UPSTREAM_DIR}/MarathonRecomp/os/ios/ios_virtual_controller.mm"
cp "${PORT_DIR}/ios/ios_mod_manager.mm" "${UPSTREAM_DIR}/MarathonRecomp/os/ios/ios_mod_manager.mm"

cp "${PORT_DIR}/ios/include/nfd.h" "${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include/nfd.h"
cp "${PORT_DIR}/ios/include/curl/curl.h" "${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include/curl/curl.h"
cp "${PORT_DIR}/ios/include/ios_virtual_controller.h" "${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include/ios_virtual_controller.h"
cp "${PORT_DIR}/ios/include/ios_mod_manager.h" "${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include/ios_mod_manager.h"

cp "${PORT_DIR}/ios/Info.plist" "${UPSTREAM_DIR}/ios/Info.plist"
cp "${PORT_DIR}/ios/Entitlements.plist" "${UPSTREAM_DIR}/ios/Entitlements.plist"
cp "${PORT_DIR}/cmake/MarathonRecompIOS.cmake" "${UPSTREAM_DIR}/cmake/MarathonRecompIOS.cmake"
cp "${PORT_DIR}/cmake/iOSPortTarget.cmake" "${UPSTREAM_DIR}/cmake/iOSPortTarget.cmake"

echo "==> [3/8] Patch XenosRecomp AIR Compiler per target iOS Metal SDK (-sdk iphoneos -mios-version-min=17.0)..."
python3 - "${UPSTREAM_DIR}/tools/XenosRecomp/XenosRecomp/air_compiler.cpp" << 'PY_XENOS'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
if p.exists():
    src = p.read_text(encoding="utf-8")
    if "XENOS_RECOMP_METAL_IOS" not in src:
        src = src.replace(
            '"-sdk", "macosx", "metal",',
            '"-sdk", "iphoneos", "metal", "-mios-version-min=17.0",'
        )
        src = src.replace(
            'posix_spawn(&pid, argv[0], nullptr, nullptr, const_cast<char**>(argv), nullptr)',
            'posix_spawn(&pid, argv[0], nullptr, nullptr, const_cast<char**>(argv), environ)'
        )
        if "extern char** environ;" not in src:
            src = '#include <unistd.h>\nextern char** environ;\n' + src
        p.write_text(src, encoding="utf-8")
        print("Patched XenosRecomp/air_compiler.cpp for iPhoneOS Metal SDK.")
PY_XENOS

echo "==> [4/8] Patch ISOFileSystem: Streaming pread() su iOS per immagini .xiso/.iso da 6+ GB senza limiti mmap..."
python3 - "${UPSTREAM_DIR}/MarathonRecomp/install/iso_file_system.h" "${UPSTREAM_DIR}/MarathonRecomp/install/iso_file_system.cpp" << 'PY_ISO'
import sys, pathlib

h_path = pathlib.Path(sys.argv[1])
cpp_path = pathlib.Path(sys.argv[2])

if h_path.exists() and cpp_path.exists():
    h_src = h_path.read_text(encoding="utf-8")
    if "MARATHON_IOS_STREAMING_XISO" not in h_src:
        h_src = h_src.replace(
            "MemoryMappedFile mappedFile;",
            "#if defined(MARATHON_IOS_STREAMING_XISO) && MARATHON_IOS_STREAMING_XISO\n"
            "    int isoFd = -1;\n"
            "    size_t isoFileSize = 0;\n"
            "    ~ISOFileSystem();\n"
            "#else\n"
            "    MemoryMappedFile mappedFile;\n"
            "#endif"
        )
        h_path.write_text(h_src, encoding="utf-8")
        print("Patched iso_file_system.h for streaming pread() on iOS.")

    cpp_src = cpp_path.read_text(encoding="utf-8")
    if "MARATHON_IOS_STREAMING_XISO" not in cpp_src:
        streaming_impl = r'''
#if defined(MARATHON_IOS_STREAMING_XISO) && MARATHON_IOS_STREAMING_XISO
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
#include <stack>
#include <cstring>

static bool ReadExactAt(int fd, size_t offset, void* outBuf, size_t len) {
    uint8_t* dst = static_cast<uint8_t*>(outBuf);
    size_t done = 0;
    while (done < len) {
        ssize_t n = pread(fd, dst + done, len - done, static_cast<off_t>(offset + done));
        if (n <= 0) return false;
        done += static_cast<size_t>(n);
    }
    return true;
}

ISOFileSystem::~ISOFileSystem() {
    if (isoFd >= 0) {
        close(isoFd);
        isoFd = -1;
    }
}

ISOFileSystem::ISOFileSystem(const std::filesystem::path &isoPath) {
    isoFd = open(isoPath.c_str(), O_RDONLY);
    if (isoFd < 0) return;

    struct stat st{};
    if (fstat(isoFd, &st) != 0 || st.st_size <= 0) {
        close(isoFd);
        isoFd = -1;
        return;
    }
    isoFileSize = static_cast<size_t>(st.st_size);

    constexpr size_t XeSectorSize = 2048;
    static const size_t PossibleOffsets[] = {
        0x00000000, // Standard XISO / Redump stripped
        0x0000FB20, // XGD3 offset
        0x00020600, // XGD2 / XGD3 variant
        0x02080000, // XGD3 full dump
        0x0FD90000  // XGD2 full Redump ISO
    };
    const char RefMagic[] = "MICROSOFT*XBOX*MEDIA";
    char magicBuf[20]{};
    size_t gameOffset = 0;
    bool magicFound = false;

    for (size_t cand : PossibleOffsets) {
        size_t magicOff = cand + (32 * XeSectorSize);
        if (magicOff + 28 > isoFileSize) continue;
        if (ReadExactAt(isoFd, magicOff, magicBuf, 20) && std::memcmp(magicBuf, RefMagic, 20) == 0) {
            gameOffset = cand;
            magicFound = true;
            break;
        }
    }

    if (!magicFound) {
        close(isoFd);
        isoFd = -1;
        return;
    }

    uint32_t rootInfo[2]{};
    if (!ReadExactAt(isoFd, gameOffset + (32 * XeSectorSize) + 20, rootInfo, sizeof(rootInfo))) {
        close(isoFd);
        isoFd = -1;
        return;
    }
    uint32_t rootSector = rootInfo[0];
    uint32_t rootSize = rootInfo[1];
    if (rootSize < 13 || rootSize > 32 * 1024 * 1024) {
        close(isoFd);
        isoFd = -1;
        return;
    }

    struct Step { std::string base; size_t dirOff; size_t entryOff; };
    std::stack<Step> stack;
    stack.push({ "", gameOffset + static_cast<size_t>(rootSector) * XeSectorSize, 0 });

    while (!stack.empty()) {
        Step step = stack.top();
        stack.pop();

        uint8_t hdr[14]{};
        if (!ReadExactAt(isoFd, step.dirOff + step.entryOff, hdr, sizeof(hdr))) continue;

        uint16_t nodeL = *reinterpret_cast<uint16_t*>(&hdr[0]);
        uint16_t nodeR = *reinterpret_cast<uint16_t*>(&hdr[2]);
        uint32_t sector = *reinterpret_cast<uint32_t*>(&hdr[4]);
        uint32_t length = *reinterpret_cast<uint32_t*>(&hdr[8]);
        uint8_t attrs = hdr[12];
        uint8_t nameLen = hdr[13];

        char nameBuf[256]{};
        if (nameLen > 0 && !ReadExactAt(isoFd, step.dirOff + step.entryOff + 14, nameBuf, nameLen)) continue;
        std::string fullName = step.base + std::string(nameBuf, nameLen);

        if (nodeR != 0 && nodeR != 0xFFFF) stack.push({ step.base, step.dirOff, static_cast<size_t>(nodeR) * 4 });
        if (nodeL != 0 && nodeL != 0xFFFF) stack.push({ step.base, step.dirOff, static_cast<size_t>(nodeL) * 4 });

        if (attrs & 0x10) {
            if (length > 0) stack.push({ fullName + "/", gameOffset + static_cast<size_t>(sector) * XeSectorSize, 0 });
        } else {
            fileMap[fullName] = { gameOffset + static_cast<size_t>(sector) * XeSectorSize, static_cast<size_t>(length) };
        }
    }
    name = isoPath.filename().string();
}

bool ISOFileSystem::load(const std::string &path, uint8_t *fileData, size_t fileDataMaxByteCount) const {
    if (isoFd < 0) return false;
    auto it = fileMap.find(path);
    if (it == fileMap.end()) return false;
    size_t off = std::get<0>(it->second);
    size_t sz  = std::get<1>(it->second);
    if (sz > fileDataMaxByteCount) return false;
    return ReadExactAt(isoFd, off, fileData, sz);
}

size_t ISOFileSystem::getSize(const std::string &path) const {
    auto it = fileMap.find(path);
    return it == fileMap.end() ? 0 : std::get<1>(it->second);
}

bool ISOFileSystem::exists(const std::string &path) const {
    return fileMap.find(path) != fileMap.end();
}

const std::string &ISOFileSystem::getName() const { return name; }
bool ISOFileSystem::empty() const { return fileMap.empty(); }
std::unique_ptr<ISOFileSystem> ISOFileSystem::create(const std::filesystem::path &isoPath) {
    auto fs = std::make_unique<ISOFileSystem>(isoPath);
    return fs->empty() ? nullptr : std::move(fs);
}
#else
'''
        cpp_path.write_text(streaming_impl + cpp_src + "\n#endif\n", encoding="utf-8")
        print("Patched iso_file_system.cpp with streaming pread() XISO reader for iOS.")
PY_ISO

echo "==> [5/8] Patch installer_wizard.cpp: Selezione diretta .xiso in SelectGame + DLC separati in SelectDLC..."
python3 - "${UPSTREAM_DIR}/MarathonRecomp/ui/installer_wizard.cpp" << 'PY_WIZ'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
if p.exists():
    src = p.read_text(encoding="utf-8")
    if "MARATHON_IOS_PICKER_MODE_GAME_XISO" not in src:
        # Imposta modalità picker iOS prima di aprire NFD in SelectGame vs SelectDLC
        old_open = "result = NFD_OpenDialogMultipleN(&pathSet, nullptr, 0, nullptr);"
        new_open = '''#if defined(MARATHON_IOS_PORT)
        MarathonIOS_SetPickerMode(
            g_currentPage == WizardPage::SelectDLC
                ? MARATHON_IOS_PICKER_MODE_DLC_SEPARATE
                : MARATHON_IOS_PICKER_MODE_GAME_XISO
        );
#endif
        result = NFD_OpenDialogMultipleN(&pathSet, nullptr, 0, nullptr);'''
        if old_open in src:
            src = src.replace(old_open, new_open, 1)
            p.write_text(src, encoding="utf-8")
            print("Patched installer_wizard.cpp for direct XISO game picker + separate DLC picker on iOS.")
PY_WIZ

echo "==> [6/8] Patch paths.cpp, paths.h e stdafx.h (Documents/MarathonRecomp + Apple libc++ std::atomic_ref)..."
python3 - "${UPSTREAM_DIR}/MarathonRecomp/user/paths.cpp" "${UPSTREAM_DIR}/MarathonRecomp/stdafx.h" << 'PY_PATHS'
import sys, pathlib

p = pathlib.Path(sys.argv[1])
if p.exists():
    src = p.read_text(encoding="utf-8")
    if "MARATHON_IOS_PORT" not in src:
        src = src.replace(
            'std::filesystem::path configPath = homePath / "Library" / "Application Support";',
            '#if defined(MARATHON_IOS_PORT)\n'
            '        std::filesystem::path configPath = homePath / "Documents";\n'
            '        std::error_code iosEc;\n'
            '        std::filesystem::create_directories(configPath / USER_DIRECTORY, iosEc);\n'
            '#else\n'
            '        std::filesystem::path configPath = homePath / "Library" / "Application Support";\n'
            '#endif'
        )
        src = src.replace(
            "return g_userPath;",
            "static std::filesystem::path s_userPath = BuildUserPath();\n    return s_userPath;"
        )
        p.write_text(src, encoding="utf-8")
        print("Patched user/paths.cpp for writable iOS Documents/MarathonRecomp + SIOF safety.")

sa = pathlib.Path(sys.argv[2])
if sa.exists():
    sa_src = sa.read_text(encoding="utf-8")
    if "MARATHON_IOS_ATOMIC_REF_POLYFILL" not in sa_src:
        polyfill = '''
#if defined(__APPLE__) && defined(__cplusplus) && !defined(__cpp_lib_atomic_ref) && !defined(MARATHON_IOS_ATOMIC_REF_POLYFILL)
#define MARATHON_IOS_ATOMIC_REF_POLYFILL 1
#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <mutex>
#include <type_traits>
namespace std {
namespace marathon_atomic_detail {
struct WaitBucket {
    std::mutex mtx;
    std::condition_variable cv;
};
inline WaitBucket& get_wait_bucket(const void* addr) noexcept {
    static auto* buckets = new WaitBucket[64]();
    const auto idx = (reinterpret_cast<std::uintptr_t>(addr) >> 2) & 63u;
    return buckets[idx];
}
constexpr memory_order fail_order_from_success(memory_order o) noexcept {
    if (o == memory_order_acq_rel) return memory_order_acquire;
    if (o == memory_order_release) return memory_order_relaxed;
    return o;
}
} // namespace marathon_atomic_detail

template <typename T>
class atomic_ref {
    static_assert(std::is_trivially_copyable_v<T>, "std::atomic_ref requires a trivially copyable type");
    T* ptr_;
public:
    using value_type = T;
    static constexpr std::size_t required_alignment = alignof(T);
    static constexpr bool is_always_lock_free = __atomic_always_lock_free(sizeof(T), nullptr);

    explicit atomic_ref(T& obj) noexcept : ptr_(&obj) {}
    atomic_ref(const atomic_ref&) noexcept = default;
    atomic_ref& operator=(const atomic_ref&) = delete;

    bool is_lock_free() const noexcept {
        return __atomic_is_lock_free(sizeof(T), ptr_);
    }

    T load(memory_order m = memory_order_seq_cst) const noexcept {
        T out{};
        __atomic_load(ptr_, &out, static_cast<int>(m));
        return out;
    }

    void store(T val, memory_order m = memory_order_seq_cst) const noexcept {
        __atomic_store(ptr_, &val, static_cast<int>(m));
    }

    T operator=(T desired) const noexcept {
        store(desired);
        return desired;
    }

    operator T() const noexcept {
        return load();
    }

    T exchange(T val, memory_order m = memory_order_seq_cst) const noexcept {
        T prev{};
        __atomic_exchange(ptr_, &val, &prev, static_cast<int>(m));
        return prev;
    }

    bool compare_exchange_strong(T& exp, T des, memory_order s, memory_order f) const noexcept {
        return __atomic_compare_exchange(ptr_, &exp, &des, false, static_cast<int>(s), static_cast<int>(f));
    }

    bool compare_exchange_strong(T& exp, T des, memory_order o = memory_order_seq_cst) const noexcept {
        return compare_exchange_strong(exp, des, o, marathon_atomic_detail::fail_order_from_success(o));
    }

    bool compare_exchange_weak(T& exp, T des, memory_order s, memory_order f) const noexcept {
        return __atomic_compare_exchange(ptr_, &exp, &des, true, static_cast<int>(s), static_cast<int>(f));
    }

    bool compare_exchange_weak(T& exp, T des, memory_order o = memory_order_seq_cst) const noexcept {
        return compare_exchange_weak(exp, des, o, marathon_atomic_detail::fail_order_from_success(o));
    }

    void wait(T old, memory_order m = memory_order_seq_cst) const noexcept {
        T cur = load(m);
        if (std::memcmp(&cur, &old, sizeof(T)) != 0) return;
        auto& bucket = marathon_atomic_detail::get_wait_bucket(ptr_);
        std::unique_lock<std::mutex> lk(bucket.mtx);
        for (;;) {
            cur = load(m);
            if (std::memcmp(&cur, &old, sizeof(T)) != 0) break;
            bucket.cv.wait(lk);
        }
    }

    void notify_one() const noexcept {
        auto& bucket = marathon_atomic_detail::get_wait_bucket(ptr_);
        {
            std::lock_guard<std::mutex> lk(bucket.mtx);
        }
        bucket.cv.notify_one();
    }

    void notify_all() const noexcept {
        auto& bucket = marathon_atomic_detail::get_wait_bucket(ptr_);
        {
            std::lock_guard<std::mutex> lk(bucket.mtx);
        }
        bucket.cv.notify_all();
    }

    T fetch_add(T v, memory_order m = memory_order_seq_cst) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) {
        return __atomic_fetch_add(ptr_, v, static_cast<int>(m));
    }
    T fetch_sub(T v, memory_order m = memory_order_seq_cst) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) {
        return __atomic_fetch_sub(ptr_, v, static_cast<int>(m));
    }
    T fetch_or(T v, memory_order m = memory_order_seq_cst) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) {
        return __atomic_fetch_or(ptr_, v, static_cast<int>(m));
    }
    T fetch_and(T v, memory_order m = memory_order_seq_cst) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) {
        return __atomic_fetch_and(ptr_, v, static_cast<int>(m));
    }
    T fetch_xor(T v, memory_order m = memory_order_seq_cst) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) {
        return __atomic_fetch_xor(ptr_, v, static_cast<int>(m));
    }
    T operator+=(T v) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_add(v) + v; }
    T operator-=(T v) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_sub(v) - v; }
    T operator|=(T v) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_or(v) | v; }
    T operator&=(T v) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_and(v) & v; }
    T operator^=(T v) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_xor(v) ^ v; }
    T operator++() const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_add(1) + 1; }
    T operator++(int) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_add(1); }
    T operator--() const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_sub(1) - 1; }
    T operator--(int) const noexcept requires (std::is_integral_v<T> && !std::is_same_v<T, bool>) { return fetch_sub(1); }
};
} // namespace std
#endif
'''
        sa.write_text(sa_src + polyfill, encoding="utf-8")
        print("Patched stdafx.h with full C++20 Apple libc++ std::atomic_ref polyfill.")
PY_PATHS

echo "==> [7/8] Patch thirdparty/plume (UIKit al posto di AppKit/IOKit, Metal iOS API, ProMotion) + video.cpp + game_window.cpp..."
python3 - \
  "${UPSTREAM_DIR}/thirdparty/plume/plume_apple.mm" \
  "${UPSTREAM_DIR}/thirdparty/plume/plume_metal.cpp" \
  "${UPSTREAM_DIR}/thirdparty/plume/CMakeLists.txt" \
  "${UPSTREAM_DIR}/MarathonRecomp/ui/game_window.cpp" \
  "${UPSTREAM_DIR}/MarathonRecomp/gpu/video.cpp" << 'PY_PLUME'
import sys, pathlib

mm = pathlib.Path(sys.argv[1])
metal_cpp = pathlib.Path(sys.argv[2])
cm = pathlib.Path(sys.argv[3])
gw_cpp = pathlib.Path(sys.argv[4])
vid_cpp = pathlib.Path(sys.argv[5])

# 1. plume_apple.mm: replace AppKit/IOKit with full UIKit UIWindow / UIScreen (120Hz ProMotion) on iOS
if mm.exists():
    src = mm.read_text(encoding="utf-8")
    if "MARATHON_PLUME_IOS_UIKIT" not in src:
        ios_impl = r'''#include <TargetConditionals.h>
#if TARGET_OS_IOS && !TARGET_OS_MACCATALYST
#define MARATHON_PLUME_IOS_UIKIT 1
#include "plume_apple.h"
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <QuartzCore/QuartzCore.h>
#include <cmath>

namespace plume {

RenderDeviceVendor getRenderDeviceVendor(uint64_t) {
    return RenderDeviceVendor::APPLE;
}

static CGFloat getIOSScaleFactor(UIWindow *uiWindow) {
#ifdef PLUME_APPLE_RETINA_ENABLED
    UIScreen *screen = uiWindow ? uiWindow.screen : nil;
    if (!screen) screen = [UIScreen mainScreen];
    return screen ? screen.nativeScale : 1.0;
#else
    (void)uiWindow;
    return 1.0;
#endif
}

static void readIOSWindowMetrics(void *windowHandle, CocoaWindowAttributes &outAttrs, int &outRefreshRate) {
    UIWindow *uiWindow = (__bridge UIWindow *)windowHandle;
    UIScreen *screen = uiWindow ? uiWindow.screen : nil;
    if (!screen) screen = [UIScreen mainScreen];
    CGRect bounds = uiWindow ? uiWindow.bounds : (screen ? screen.bounds : CGRectMake(0, 0, 1280, 720));
    CGFloat scale = getIOSScaleFactor(uiWindow);
    outAttrs.x = (int)std::lround(bounds.origin.x);
    outAttrs.y = (int)std::lround(bounds.origin.y);
    outAttrs.width = (int)std::lround(bounds.size.width * scale);
    outAttrs.height = (int)std::lround(bounds.size.height * scale);
    outRefreshRate = screen ? (int)[screen maximumFramesPerSecond] : 60;
    if (outRefreshRate <= 0) outRefreshRate = 60;
}

CocoaWindow::CocoaWindow(void *window)
    : windowHandle(window), cachedRefreshRate(60) {
    cachedAttributes = {0, 0, 1280, 720};
    if ([NSThread isMainThread]) {
        int hz = 60;
        readIOSWindowMetrics(windowHandle, cachedAttributes, hz);
        cachedRefreshRate.store(hz);
    } else {
        updateWindowAttributesInternal(true);
        updateRefreshRateInternal(true);
    }
}

CocoaWindow::~CocoaWindow() {}

void CocoaWindow::updateWindowAttributesInternal(bool forceSync) {
    auto updateBlock = ^{
        CocoaWindowAttributes attrs{};
        int hz = 60;
        readIOSWindowMetrics(windowHandle, attrs, hz);
        std::lock_guard<std::mutex> lock(attributesMutex);
        cachedAttributes = attrs;
        cachedRefreshRate.store(hz);
    };
    if (forceSync) {
        dispatch_sync(dispatch_get_main_queue(), updateBlock);
    } else {
        dispatch_async(dispatch_get_main_queue(), updateBlock);
    }
}

void CocoaWindow::updateRefreshRateInternal(bool forceSync) {
    auto updateBlock = ^{
        UIWindow *uiWindow = (__bridge UIWindow *)windowHandle;
        UIScreen *screen = uiWindow ? uiWindow.screen : [UIScreen mainScreen];
        int hz = screen ? (int)[screen maximumFramesPerSecond] : 60;
        cachedRefreshRate.store(hz > 0 ? hz : 60);
    };
    if (forceSync) {
        dispatch_sync(dispatch_get_main_queue(), updateBlock);
    } else {
        dispatch_async(dispatch_get_main_queue(), updateBlock);
    }
}

void CocoaWindow::getWindowAttributes(CocoaWindowAttributes *attributes) const {
    if (!attributes) return;
    if ([NSThread isMainThread]) {
        CocoaWindowAttributes attrs{};
        int hz = 60;
        readIOSWindowMetrics(windowHandle, attrs, hz);
        std::lock_guard<std::mutex> lock(attributesMutex);
        const_cast<CocoaWindow *>(this)->cachedAttributes = attrs;
        const_cast<CocoaWindow *>(this)->cachedRefreshRate.store(hz);
        *attributes = attrs;
    } else {
        {
            std::lock_guard<std::mutex> lock(attributesMutex);
            *attributes = cachedAttributes;
        }
        const_cast<CocoaWindow *>(this)->updateWindowAttributesInternal(false);
    }
}

int CocoaWindow::getRefreshRate() const {
    if ([NSThread isMainThread]) {
        UIWindow *uiWindow = (__bridge UIWindow *)windowHandle;
        UIScreen *screen = uiWindow ? uiWindow.screen : [UIScreen mainScreen];
        int hz = screen ? (int)[screen maximumFramesPerSecond] : 60;
        if (hz <= 0) hz = 60;
        const_cast<CocoaWindow *>(this)->cachedRefreshRate.store(hz);
        return hz;
    }
    int rate = cachedRefreshRate.load();
    const_cast<CocoaWindow *>(this)->updateRefreshRateInternal(false);
    return rate > 0 ? rate : 60;
}

void CocoaWindow::toggleFullscreen() {
    // iOS apps always run fullscreen inside UIWindowScene.
}

} // namespace plume
#else
'''
        mm.write_text(ios_impl + src + "\n#endif\n", encoding="utf-8")
        print("Patched thirdparty/plume/plume_apple.mm with native UIKit UIWindow/ProMotion implementation for iOS.")

# 2. plume_metal.cpp: guard macOS-only Metal APIs (displaySyncEnabled, MTL::CopyAllDevices)
if metal_cpp.exists():
    msrc = metal_cpp.read_text(encoding="utf-8")
    if "MARATHON_PLUME_IOS_METAL_PATCH" not in msrc:
        msrc = "// MARATHON_PLUME_IOS_METAL_PATCH\n" + msrc
        msrc = msrc.replace(
            "        layer->setDisplaySyncEnabled(vsyncEnabled);",
            "#if PLUME_MACOS\n        layer->setDisplaySyncEnabled(vsyncEnabled);\n#else\n        (void)vsyncEnabled;\n#endif"
        )
        msrc = msrc.replace(
            "        return layer->displaySyncEnabled();",
            "#if PLUME_MACOS\n        return layer->displaySyncEnabled();\n#else\n        return true;\n#endif"
        )
        old_dev_sel = '''        // Device Selection
        NS::Array* devices = MTL::CopyAllDevices();
        MTL::Device *preferredDevice = nullptr;
        for (NS::UInteger i = 0; i < devices->count(); i++) {
            MTL::Device *device = (MTL::Device *)devices->object(i);
            const NS::String *preferredDeviceNameNS = NS::String::string(preferredDeviceName.c_str(), NS::UTF8StringEncoding);
            if (device->name()->isEqualToString(preferredDeviceNameNS)) {
                preferredDevice = device;
                break;
            }
        }

        mtl = preferredDevice ? preferredDevice : MTL::CreateSystemDefaultDevice();
        mtl->retain();
        devices->release();'''
        new_dev_sel = '''        // Device Selection
#if PLUME_MACOS
        NS::Array* devices = MTL::CopyAllDevices();
        MTL::Device *preferredDevice = nullptr;
        for (NS::UInteger i = 0; i < devices->count(); i++) {
            MTL::Device *device = (MTL::Device *)devices->object(i);
            const NS::String *preferredDeviceNameNS = NS::String::string(preferredDeviceName.c_str(), NS::UTF8StringEncoding);
            if (device->name()->isEqualToString(preferredDeviceNameNS)) {
                preferredDevice = device;
                break;
            }
        }

        mtl = preferredDevice ? preferredDevice : MTL::CreateSystemDefaultDevice();
        mtl->retain();
        devices->release();
#else
        (void)preferredDeviceName;
        mtl = MTL::CreateSystemDefaultDevice();
        if (mtl) {
            mtl->retain();
        }
#endif'''
        if old_dev_sel in msrc:
            msrc = msrc.replace(old_dev_sel, new_dev_sel, 1)

        old_iface_devs = '''        // Fill device names.
        const NS::Array* devices = MTL::CopyAllDevices();
        for (NS::UInteger i = 0; i < devices->count(); i++) {
            NS::String* deviceName = ((MTL::Device *)devices->object(i))->name();
            deviceNames.push_back(std::string(deviceName->utf8String()));
        }'''
        new_iface_devs = '''        // Fill device names.
#if PLUME_MACOS
        const NS::Array* devices = MTL::CopyAllDevices();
        for (NS::UInteger i = 0; i < devices->count(); i++) {
            NS::String* deviceName = ((MTL::Device *)devices->object(i))->name();
            deviceNames.push_back(std::string(deviceName->utf8String()));
        }
#else
        MTL::Device* defaultDev = MTL::CreateSystemDefaultDevice();
        if (defaultDev) {
            deviceNames.push_back(std::string(defaultDev->name()->utf8String()));
            defaultDev->release();
        }
#endif'''
        if old_iface_devs in msrc:
            msrc = msrc.replace(old_iface_devs, new_iface_devs, 1)

        metal_cpp.write_text(msrc, encoding="utf-8")
        print("Patched thirdparty/plume/plume_metal.cpp for iOS Metal (CreateSystemDefaultDevice + displaySyncEnabled guard).")

# 3. thirdparty/plume/CMakeLists.txt: skip plume_vulkan.cpp on iOS when building pure Metal 3
if cm.exists():
    csrc = cm.read_text(encoding="utf-8")
    if 'NOT CMAKE_SYSTEM_NAME STREQUAL "iOS"' not in csrc and "plume_vulkan.cpp" in csrc:
        csrc = csrc.replace(
            "set(PLUME_SOURCES\n    plume_vulkan.cpp\n    plume_vulkan.h\n)",
            'set(PLUME_SOURCES)\nif(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")\n    list(APPEND PLUME_SOURCES plume_vulkan.cpp plume_vulkan.h)\nendif()'
        )
        cm.write_text(csrc, encoding="utf-8")
        print("Patched thirdparty/plume/CMakeLists.txt to use pure Metal 3 on iOS.")

# 4. MarathonRecomp/ui/game_window.cpp: use SDL_PROP_WINDOW_UIKIT_WINDOW_POINTER on iOS
if gw_cpp.exists():
    gsrc = gw_cpp.read_text(encoding="utf-8")
    if "SDL_PROP_WINDOW_UIKIT_WINDOW_POINTER" not in gsrc:
        gsrc = gsrc.replace(
            "#elif defined(__APPLE__)\n    s_renderWindow.window = SDL_GetPointerProperty(SDL_GetWindowProperties(s_pWindow), SDL_PROP_WINDOW_COCOA_WINDOW_POINTER, nullptr);\n    s_renderWindow.view = SDL_Metal_GetLayer(SDL_Metal_CreateView(s_pWindow));",
            "#elif defined(MARATHON_IOS_PORT)\n    s_renderWindow.window = SDL_GetPointerProperty(SDL_GetWindowProperties(s_pWindow), SDL_PROP_WINDOW_UIKIT_WINDOW_POINTER, nullptr);\n    s_renderWindow.view = SDL_Metal_GetLayer(SDL_Metal_CreateView(s_pWindow));\n#elif defined(__APPLE__)\n    s_renderWindow.window = SDL_GetPointerProperty(SDL_GetWindowProperties(s_pWindow), SDL_PROP_WINDOW_COCOA_WINDOW_POINTER, nullptr);\n    s_renderWindow.view = SDL_Metal_GetLayer(SDL_Metal_CreateView(s_pWindow));"
        )
        gw_cpp.write_text(gsrc, encoding="utf-8")
        print("Patched MarathonRecomp/ui/game_window.cpp for UIKit UIWindow handle on iOS.")

# 5. MarathonRecomp/gpu/video.cpp: use Metal 3 exclusively on iOS native Metal (no CreateVulkanInterface link dep)
if vid_cpp.exists():
    vsrc = vid_cpp.read_text(encoding="utf-8")
    if "MARATHON_IOS_NATIVE_METAL" not in vsrc:
        vsrc = vsrc.replace(
            "#elif defined(MARATHON_RECOMP_METAL)\n                g_backend = (interfaceFunction == CreateVulkanInterface) ? Backend::VULKAN : Backend::METAL;",
            "#elif defined(MARATHON_IOS_NATIVE_METAL)\n                g_backend = Backend::METAL;\n#elif defined(MARATHON_RECOMP_METAL)\n                g_backend = (interfaceFunction == CreateVulkanInterface) ? Backend::VULKAN : Backend::METAL;"
        )
        vsrc = vsrc.replace(
            "#elif defined(MARATHON_RECOMP_METAL)\n    g_backend = Config::GraphicsAPI == EGraphicsAPI::Vulkan ? Backend::VULKAN : Backend::METAL;",
            "#elif defined(MARATHON_IOS_NATIVE_METAL)\n    g_backend = Backend::METAL;\n#elif defined(MARATHON_RECOMP_METAL)\n    g_backend = Config::GraphicsAPI == EGraphicsAPI::Vulkan ? Backend::VULKAN : Backend::METAL;"
        )
        vsrc = vsrc.replace(
            "#elif defined(MARATHON_RECOMP_METAL)\n    interfaceFunctions.push_back((g_backend == Backend::VULKAN) ? CreateVulkanInterface : CreateMetalInterface);\n    interfaceFunctions.push_back((g_backend == Backend::VULKAN) ? CreateMetalInterface : CreateVulkanInterface);",
            "#elif defined(MARATHON_IOS_NATIVE_METAL)\n    interfaceFunctions.push_back(CreateMetalInterface);\n#elif defined(MARATHON_RECOMP_METAL)\n    interfaceFunctions.push_back((g_backend == Backend::VULKAN) ? CreateVulkanInterface : CreateMetalInterface);\n    interfaceFunctions.push_back((g_backend == Backend::VULKAN) ? CreateMetalInterface : CreateVulkanInterface);"
        )
        vid_cpp.write_text(vsrc, encoding="utf-8")
        print("Patched MarathonRecomp/gpu/video.cpp for pure Metal 3 backend on iOS.")
PY_PLUME

echo "==> [8/8] Integrazione CMake iOS (FreeType/FFmpeg/NFD/CURL, Host Tools Override, Metal iOS SDK, SDL_main)..."
python3 - \
  "${UPSTREAM_DIR}/CMakeLists.txt" \
  "${UPSTREAM_DIR}/thirdparty/CMakeLists.txt" \
  "${UPSTREAM_DIR}/MarathonRecomp/CMakeLists.txt" \
  "${UPSTREAM_DIR}/MarathonRecompLib/CMakeLists.txt" \
  "${UPSTREAM_DIR}/MarathonRecomp/install/update_checker.cpp" \
  "${UPSTREAM_DIR}/MarathonRecomp/main.cpp" << 'PY_CMAKE'
import sys, pathlib

root_cm = pathlib.Path(sys.argv[1])
tp_cm = pathlib.Path(sys.argv[2])
app_cm = pathlib.Path(sys.argv[3])
lib_cm = pathlib.Path(sys.argv[4])
upd_cpp = pathlib.Path(sys.argv[5])
main_cpp = pathlib.Path(sys.argv[6])

# 1. Root CMakeLists.txt: include iOS config BEFORE thirdparty/tools, split host tools vs iOS cross-compile
rsrc = root_cm.read_text(encoding="utf-8")
if "MARATHON_IOS_HOST_TOOLS_ONLY" not in rsrc:
    rsrc = rsrc.replace(
        'add_subdirectory(${MARATHON_RECOMP_THIRDPARTY_ROOT})\nadd_subdirectory(${MARATHON_RECOMP_TOOLS_ROOT})',
        'option(MARATHON_IOS_HOST_TOOLS_ONLY "Build only macOS host tools" OFF)\n'
        'include("${CMAKE_SOURCE_DIR}/cmake/MarathonRecompIOS.cmake" OPTIONAL)\n'
        'include("${CMAKE_SOURCE_DIR}/cmake/iOSPortTarget.cmake" OPTIONAL)\n'
        'if(NOT MARATHON_IOS_HOST_TOOLS_ONLY)\n'
        '    add_subdirectory(${MARATHON_RECOMP_THIRDPARTY_ROOT})\n'
        'endif()\n'
        'if(CMAKE_SYSTEM_NAME STREQUAL "iOS")\n'
        '    marathon_setup_ios_host_tools()\n'
        'else()\n'
        '    add_subdirectory(${MARATHON_RECOMP_TOOLS_ROOT})\n'
        '    if(TARGET XenosRecomp)\n'
        '        target_compile_definitions(XenosRecomp PRIVATE MARATHON_RECOMP)\n'
        '    endif()\n'
        'endif()'
    )
    rsrc = rsrc.replace(
        'add_subdirectory("MarathonRecompLib")\nadd_subdirectory("MarathonRecomp")',
        'if(NOT MARATHON_IOS_HOST_TOOLS_ONLY)\n'
        '    add_subdirectory("MarathonRecompLib")\n'
        '    add_subdirectory("MarathonRecomp")\n'
        'endif()'
    )
    root_cm.write_text(rsrc, encoding="utf-8")
    print("Patched root CMakeLists.txt for iOS FreeType/FFmpeg/NFD/CURL + host-tools split build.")

# 2. thirdparty/CMakeLists.txt: skip AppKit nativefiledialog-extended & desktop ffmpeg-core on iOS
tsrc = tp_cm.read_text(encoding="utf-8")
if "marathon_setup_ios_thirdparty" not in tsrc:
    tsrc = tsrc.replace(
        'add_subdirectory("${MARATHON_RECOMP_THIRDPARTY_ROOT}/nativefiledialog-extended")',
        'if(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")\n'
        '    add_subdirectory("${MARATHON_RECOMP_THIRDPARTY_ROOT}/nativefiledialog-extended")\n'
        'endif()'
    )
    tsrc = tsrc.replace(
        'add_subdirectory("${MARATHON_RECOMP_THIRDPARTY_ROOT}/ffmpeg-core")',
        'if(CMAKE_SYSTEM_NAME STREQUAL "iOS")\n'
        '    marathon_setup_ios_thirdparty()\n'
        'else()\n'
        '    add_subdirectory("${MARATHON_RECOMP_THIRDPARTY_ROOT}/ffmpeg-core")\n'
        'endif()'
    )
    tp_cm.write_text(tsrc, encoding="utf-8")
    print("Patched thirdparty/CMakeLists.txt to replace nativefiledialog-extended and ffmpeg-core on iOS.")

# 3. MarathonRecomp/CMakeLists.txt: SDL_MAIN_HANDLED, iOS OS sources + SKIP_PCH, iOS bundle, CURL stub, iPhoneOS metal SDK
asrc = app_cm.read_text(encoding="utf-8")
if "os/ios/ios_platform.mm" not in asrc:
    # 3a. Let SDL3 drive UIApplicationMain on iOS
    asrc = asrc.replace(
        "add_compile_definitions(\n    SDL_MAIN_HANDLED",
        'if (NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")\n'
        '    add_compile_definitions(SDL_MAIN_HANDLED)\n'
        'endif()\n'
        'add_compile_definitions('
    )
    # 3b. First elseif (APPLE): OS sources
    asrc = asrc.replace(
        'elseif (APPLE)\n    set(MARATHON_RECOMP_OS_CXX_SOURCES',
        'elseif (CMAKE_SYSTEM_NAME STREQUAL "iOS")\n'
        '    set(MARATHON_RECOMP_OS_CXX_SOURCES\n'
        '        "os/ios/ios_platform.mm"\n'
        '        "os/ios/nfd_ios.mm"\n'
        '        "os/ios/curl_ios_stub.mm"\n'
        '        "os/ios/ios_virtual_controller.mm"\n'
        '        "os/ios/ios_mod_manager.mm"\n'
        '    )\n'
        '    set_source_files_properties(${MARATHON_RECOMP_OS_CXX_SOURCES} PROPERTIES SKIP_PRECOMPILE_HEADERS ON)\n'
        'elseif (APPLE)\n    set(MARATHON_RECOMP_OS_CXX_SOURCES',
        1
    )
    # 3c. Second elseif (APPLE): add_executable MACOSX_BUNDLE without macOS icns/plist
    asrc = asrc.replace(
        'elseif (APPLE)\n    # Create version number for app bundle.',
        'elseif (CMAKE_SYSTEM_NAME STREQUAL "iOS")\n'
        '    add_executable(MarathonRecomp MACOSX_BUNDLE ${MARATHON_RECOMP_CXX_SOURCES})\n'
        'elseif (APPLE)\n    # Create version number for app bundle.',
        1
    )
    # 3d. Skip desktop find_package(CURL REQUIRED) on iOS (uses CURL::libcurl NSURLSession stub)
    asrc = asrc.replace(
        "find_package(CURL REQUIRED)",
        'if (NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")\n'
        '    find_package(CURL REQUIRED)\n'
        'endif()'
    )
    # 3e. Compile helper Metal shaders with iPhoneOS SDK on iOS instead of macosx SDK
    asrc = asrc.replace(
        '    set(XCRUN_TOOL "/usr/bin/xcrun")',
        '    set(XCRUN_TOOL "/usr/bin/xcrun")\n'
        '    if (CMAKE_SYSTEM_NAME STREQUAL "iOS")\n'
        '        set(MARATHON_METAL_SDK "iphoneos")\n'
        '        set(MARATHON_METAL_IOS_FLAG "-mios-version-min=17.0")\n'
        '    else()\n'
        '        set(MARATHON_METAL_SDK "macosx")\n'
        '        set(MARATHON_METAL_IOS_FLAG "")\n'
        '    endif()'
    )
    asrc = asrc.replace(
        "COMMAND ${XCRUN_TOOL} -sdk macosx metal -o ${MSL_FILE_OUT_PATH}.ir -c ${MSL_FILE_PATH}",
        "COMMAND ${XCRUN_TOOL} -sdk ${MARATHON_METAL_SDK} metal ${MARATHON_METAL_IOS_FLAG} -o ${MSL_FILE_OUT_PATH}.ir -c ${MSL_FILE_PATH}"
    )
    asrc = asrc.replace(
        "COMMAND ${XCRUN_TOOL} -sdk macosx metallib -o ${MSL_FILE_OUT_PATH}.metallib ${MSL_FILE_OUT_PATH}.ir",
        "COMMAND ${XCRUN_TOOL} -sdk ${MARATHON_METAL_SDK} metallib -o ${MSL_FILE_OUT_PATH}.metallib ${MSL_FILE_OUT_PATH}.ir"
    )
    asrc += '\nif(COMMAND marathon_configure_ios_target)\n    marathon_configure_ios_target(MarathonRecomp)\nendif()\n'
    app_cm.write_text(asrc, encoding="utf-8")
    print("Patched MarathonRecomp/CMakeLists.txt with iOS OS sources, bundle, CURL stub, and iPhoneOS Metal helper shaders.")

# 4. MarathonRecompLib/CMakeLists.txt: do not call target_compile_definitions on IMPORTED XenosRecomp
lsrc = lib_cm.read_text(encoding="utf-8")
if 'NOT CMAKE_SYSTEM_NAME STREQUAL "iOS"' not in lsrc:
    lsrc = lsrc.replace(
        "target_compile_definitions(XenosRecomp PRIVATE MARATHON_RECOMP)",
        'if (NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")\n'
        '    target_compile_definitions(XenosRecomp PRIVATE MARATHON_RECOMP)\n'
        'endif()'
    )
    lib_cm.write_text(lsrc, encoding="utf-8")
    print("Patched MarathonRecompLib/CMakeLists.txt for IMPORTED XenosRecomp compatibility on iOS.")

# 5. update_checker.cpp: std::system() is unavailable on iOS SDK -> use MarathonIOS_OpenURL
if upd_cpp.exists():
    usrc = upd_cpp.read_text(encoding="utf-8")
    if "MarathonIOS_OpenURL" not in usrc:
        usrc = usrc.replace(
            "#elif defined(__APPLE__)\n    std::string command = \"open \" + std::string(VISIT_URL) + \" &\";\n    std::system(command.c_str());",
            "#elif defined(MARATHON_IOS_PORT)\n    MarathonIOS_OpenURL(VISIT_URL);\n#elif defined(__APPLE__)\n    std::string command = \"open \" + std::string(VISIT_URL) + \" &\";\n    std::system(command.c_str());"
        )
        upd_cpp.write_text(usrc, encoding="utf-8")
        print("Patched install/update_checker.cpp to use MarathonIOS_OpenURL instead of unavailable std::system().")

# 6. main.cpp: include <SDL3/SDL_main.h> on iOS so SDL3 bootstraps UIApplicationMain
if main_cpp.exists():
    msrc = main_cpp.read_text(encoding="utf-8")
    if "SDL3/SDL_main.h" not in msrc:
        msrc = "#if defined(MARATHON_IOS_PORT)\n#include <SDL3/SDL_main.h>\n#endif\n" + msrc
        main_cpp.write_text(msrc, encoding="utf-8")
        print("Patched main.cpp with SDL3/SDL_main.h entry point for iOS UIKit.")
PY_CMAKE

echo "==> Patch iOS Clean-Room applicata con successo!"
