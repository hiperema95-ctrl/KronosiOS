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

echo "==> [2/8] Copia layer nativo iOS (OS, NFD Files Picker XISO/DLC, Controller, Mod Manager, CMake)..."
mkdir -p "${UPSTREAM_DIR}/MarathonRecomp/os/ios"
mkdir -p "${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include"
mkdir -p "${UPSTREAM_DIR}/ios" "${UPSTREAM_DIR}/cmake"

cp "${PORT_DIR}/ios/os/ios_platform.mm" "${UPSTREAM_DIR}/MarathonRecomp/os/ios/ios_platform.mm"
cp "${PORT_DIR}/ios/nfd_ios.mm" "${UPSTREAM_DIR}/MarathonRecomp/os/ios/nfd_ios.mm"
cp "${PORT_DIR}/ios/ios_virtual_controller.mm" "${UPSTREAM_DIR}/MarathonRecomp/os/ios/ios_virtual_controller.mm"
cp "${PORT_DIR}/ios/ios_mod_manager.mm" "${UPSTREAM_DIR}/MarathonRecomp/os/ios/ios_mod_manager.mm"

cp "${PORT_DIR}/ios/include/nfd.h" "${UPSTREAM_DIR}/MarathonRecomp/ios_compat/include/nfd.h"
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
#include <type_traits>
namespace std {
template <typename T>
class atomic_ref {
    T* ptr_;
public:
    explicit atomic_ref(T& obj) noexcept : ptr_(&obj) {}
    T load(memory_order m = memory_order_seq_cst) const noexcept { return __atomic_load_n(ptr_, static_cast<int>(m)); }
    void store(T val, memory_order m = memory_order_seq_cst) const noexcept { __atomic_store_n(ptr_, val, static_cast<int>(m)); }
    T exchange(T val, memory_order m = memory_order_seq_cst) const noexcept { return __atomic_exchange_n(ptr_, val, static_cast<int>(m)); }
    bool compare_exchange_strong(T& exp, T des, memory_order s = memory_order_seq_cst, memory_order f = memory_order_seq_cst) const noexcept {
        return __atomic_compare_exchange_n(ptr_, &exp, des, false, static_cast<int>(s), static_cast<int>(f));
    }
    bool compare_exchange_weak(T& exp, T des, memory_order s = memory_order_seq_cst, memory_order f = memory_order_seq_cst) const noexcept {
        return __atomic_compare_exchange_n(ptr_, &exp, des, true, static_cast<int>(s), static_cast<int>(f));
    }
    T fetch_add(T v, memory_order m = memory_order_seq_cst) const noexcept { return __atomic_fetch_add(ptr_, v, static_cast<int>(m)); }
    T fetch_sub(T v, memory_order m = memory_order_seq_cst) const noexcept { return __atomic_fetch_sub(ptr_, v, static_cast<int>(m)); }
    T fetch_or(T v, memory_order m = memory_order_seq_cst) const noexcept { return __atomic_fetch_or(ptr_, v, static_cast<int>(m)); }
    T fetch_and(T v, memory_order m = memory_order_seq_cst) const noexcept { return __atomic_fetch_and(ptr_, v, static_cast<int>(m)); }
};
} // namespace std
#endif
'''
        sa.write_text(sa_src + polyfill, encoding="utf-8")
        print("Patched stdafx.h with Apple libc++ std::atomic_ref polyfill.")
PY_PATHS

echo "==> [7/8] Patch thirdparty/plume per UIWindow / CAMetalLayer / ProMotion su iOS..."
python3 - "${UPSTREAM_DIR}/thirdparty/plume/plume_apple.mm" "${UPSTREAM_DIR}/thirdparty/plume/CMakeLists.txt" << 'PY_PLUME'
import sys, pathlib
mm = pathlib.Path(sys.argv[1])
if mm.exists():
    src = mm.read_text(encoding="utf-8")
    if "TARGET_OS_IOS" not in src:
        ios_guard = '''#include <TargetConditionals.h>
#if TARGET_OS_IOS && !TARGET_OS_MACCATALYST
#import <UIKit/UIKit.h>
#import <QuartzCore/CAMetalLayer.h>
#endif
'''
        mm.write_text(ios_guard + src, encoding="utf-8")
        print("Patched thirdparty/plume/plume_apple.mm with UIKit/CAMetalLayer iOS headers.")

cm = pathlib.Path(sys.argv[2])
if cm.exists():
    csrc = cm.read_text(encoding="utf-8")
    if 'NOT CMAKE_SYSTEM_NAME STREQUAL "iOS"' not in csrc and "plume_vulkan.cpp" in csrc:
        csrc = csrc.replace(
            "plume_vulkan.cpp\n    plume_vulkan.h",
            ""
        )
        csrc += '\nif(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")\n    target_sources(plume PRIVATE plume_vulkan.cpp plume_vulkan.h)\nendif()\n'
        cm.write_text(csrc, encoding="utf-8")
        print("Patched thirdparty/plume/CMakeLists.txt to use pure Metal 3 on iOS.")
PY_PLUME

echo "==> [8/8] Integrazione CMake iOS (Host Tools Override + iOS OS Sources + Target Config)..."
python3 - "${UPSTREAM_DIR}/CMakeLists.txt" "${UPSTREAM_DIR}/MarathonRecomp/CMakeLists.txt" "${UPSTREAM_DIR}/MarathonRecompLib/CMakeLists.txt" << 'PY_CMAKE'
import sys, pathlib

root_cm = pathlib.Path(sys.argv[1])
rsrc = root_cm.read_text(encoding="utf-8")
if "MARATHON_IOS_HOST_TOOLS_ONLY" not in rsrc:
    rsrc = rsrc.replace(
        'add_subdirectory("MarathonRecompLib")\nadd_subdirectory("MarathonRecomp")',
        'option(MARATHON_IOS_HOST_TOOLS_ONLY "Build only macOS host tools" OFF)\n'
        'if(NOT MARATHON_IOS_HOST_TOOLS_ONLY)\n'
        '    include("${CMAKE_SOURCE_DIR}/cmake/MarathonRecompIOS.cmake" OPTIONAL)\n'
        '    include("${CMAKE_SOURCE_DIR}/cmake/iOSPortTarget.cmake" OPTIONAL)\n'
        '    add_subdirectory("MarathonRecompLib")\n'
        '    add_subdirectory("MarathonRecomp")\n'
        'endif()'
    )
    root_cm.write_text(rsrc, encoding="utf-8")
    print("Patched root CMakeLists.txt for host-tools/iOS split build.")

app_cm = pathlib.Path(sys.argv[2])
asrc = app_cm.read_text(encoding="utf-8")
if "os/ios/ios_platform.mm" not in asrc:
    asrc = asrc.replace(
        "elseif (APPLE)",
        'elseif (CMAKE_SYSTEM_NAME STREQUAL "iOS")\n'
        '    set(MARATHON_RECOMP_OS_CXX_SOURCES\n'
        '        "os/ios/ios_platform.mm"\n'
        '        "os/ios/nfd_ios.mm"\n'
        '        "os/ios/ios_virtual_controller.mm"\n'
        '        "os/ios/ios_mod_manager.mm"\n'
        '    )\n'
        'elseif (APPLE)'
    )
    asrc += '\nif(COMMAND marathon_configure_ios_target)\n    marathon_configure_ios_target(MarathonRecomp)\nendif()\n'
    app_cm.write_text(asrc, encoding="utf-8")
    print("Patched MarathonRecomp/CMakeLists.txt with iOS native sources and target helper.")

lib_cm = pathlib.Path(sys.argv[3])
lsrc = lib_cm.read_text(encoding="utf-8")
if "MARATHON_HOST_XENON_RECOMP" not in lsrc:
    lsrc = lsrc.replace("$<TARGET_FILE:XenonRecomp>", "${MARATHON_HOST_XENON_RECOMP}")
    lsrc = lsrc.replace("$<TARGET_FILE:XenosRecomp>", "${MARATHON_HOST_XENOS_RECOMP}")
    lsrc = lsrc.replace("$<TARGET_FILE:u8extract>", "${MARATHON_HOST_U8EXTRACT}")
    lib_cm.write_text(lsrc, encoding="utf-8")
    print("Patched MarathonRecompLib/CMakeLists.txt to invoke macOS host recompilers during iOS cross-compile.")
PY_CMAKE

echo "==> Patch iOS Clean-Room applicata con successo!"
