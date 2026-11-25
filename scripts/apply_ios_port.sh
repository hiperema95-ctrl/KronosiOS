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
            '"-sdk", "macosx", "metallib",',
            '"-sdk", "iphoneos", "metallib",'
        )
        src = src.replace(
            'posix_spawn(&pid, argv[0], nullptr, nullptr, const_cast<char**>(argv), nullptr)',
            'posix_spawn(&pid, argv[0], nullptr, nullptr, const_cast<char**>(argv), environ)'
        )
        header = "// XENOS_RECOMP_METAL_IOS\n"
        if "extern char** environ;" not in src:
            header += "#include <unistd.h>\nextern char** environ;\n"
        src = header + src
        p.write_text(src, encoding="utf-8")
        print("Patched XenosRecomp/air_compiler.cpp for iPhoneOS Metal SDK (metal + metallib).")
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
            "    ~ISOFileSystem() override;\n"
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
#include "iso_file_system.h"
#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <stack>
#include <sys/stat.h>
#include <unistd.h>

static bool ReadExactAt(int fd, size_t offset, void* outBuf, size_t len) {
    uint8_t* dst = static_cast<uint8_t*>(outBuf);
    size_t done = 0;
    while (done < len) {
        ssize_t n = pread(fd, dst + done, len - done, static_cast<off_t>(offset + done));
        if (n < 0) {
            if (errno == EINTR) continue;
            return false;
        }
        if (n == 0) return false;
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

        uint16_t nodeL = 0, nodeR = 0;
        uint32_t sector = 0, length = 0;
        std::memcpy(&nodeL, &hdr[0], sizeof(nodeL));
        std::memcpy(&nodeR, &hdr[2], sizeof(nodeR));
        std::memcpy(&sector, &hdr[4], sizeof(sector));
        std::memcpy(&length, &hdr[8], sizeof(length));
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
    if (fs->empty()) return nullptr;
    return fs;
}
#else
'''
        cpp_path.write_text(streaming_impl + cpp_src + "\n#endif\n", encoding="utf-8")
        print("Patched iso_file_system.cpp with streaming pread() XISO reader for iOS.")
PY_ISO

echo "==> [5/8] Patch UI Touch Smartphone (InstallerWizard tap diretto + ButtonWindow touch senza simboli mouse/tastiera + MessageWindow + HID + Crediti iOS multilingua)..."
python3 - \
  "${UPSTREAM_DIR}/MarathonRecomp/ui/installer_wizard.cpp" \
  "${UPSTREAM_DIR}/MarathonRecomp/ui/button_window.h" \
  "${UPSTREAM_DIR}/MarathonRecomp/ui/button_window.cpp" \
  "${UPSTREAM_DIR}/MarathonRecomp/ui/message_window.cpp" \
  "${UPSTREAM_DIR}/MarathonRecomp/hid/hid.cpp" \
  "${UPSTREAM_DIR}/MarathonRecomp/kernel/memory.cpp" \
  "${UPSTREAM_DIR}/MarathonRecomp/locale/locale.cpp" \
  "${UPSTREAM_DIR}/MarathonRecomp/ui/imgui_utils.cpp" << 'PY_WIZ'
import sys, pathlib

wiz_p = pathlib.Path(sys.argv[1])
bw_h  = pathlib.Path(sys.argv[2])
bw_c  = pathlib.Path(sys.argv[3])
mw_c  = pathlib.Path(sys.argv[4])
hid_c = pathlib.Path(sys.argv[5])
mem_c = pathlib.Path(sys.argv[6])
loc_c = pathlib.Path(sys.argv[7])
imu_c = pathlib.Path(sys.argv[8])

# 5a. ui/button_window.h & .cpp: hit-test touch + modalità input iOS (Touch senza simboli mouse/tastiera, Keyboard solo su tasto reale, Gamepad su controller)
if bw_h.exists() and bw_c.exists():
    bwh = bw_h.read_text(encoding="utf-8")
    if "HitTest(" not in bwh:
        bwh = bwh.replace(
            "static void Close();",
            "static void Close();\n"
            "#if defined(MARATHON_IOS_PORT)\n"
            "    enum class EIOSInputMode : int\n"
            "    {\n"
            "        Touch = 0,\n"
            "        Keyboard = 1,\n"
            "        Gamepad = 2\n"
            "    };\n"
            "    static inline EIOSInputMode s_iosInputMode = EIOSInputMode::Touch;\n"
            "#endif\n"
            "    static inline float s_hitMinX = 0.0f;\n"
            "    static inline float s_hitMinY = 0.0f;\n"
            "    static inline float s_hitMaxX = 0.0f;\n"
            "    static inline float s_hitMaxY = 0.0f;\n"
            "    static bool HitTest(float x, float y);"
        )
        bw_h.write_text(bwh, encoding="utf-8")
    bwc = bw_c.read_text(encoding="utf-8")
    if "ButtonWindow::HitTest" not in bwc:
        old_bw_inc = "#include <app.h>"
        new_bw_inc = (
            "#include <app.h>\n"
            "#if defined(MARATHON_IOS_PORT)\n"
            "#include <sdl_listener.h>\n\n"
            "class SDLEventListenerForIOSButtonMode : public SDLEventListener\n"
            "{\n"
            "public:\n"
            "    bool OnSDLEvent(SDL_Event* event) override\n"
            "    {\n"
            "        if (!event || App::s_isInit)\n"
            "            return false;\n\n"
            "        switch (event->type)\n"
            "        {\n"
            "            case SDL_EVENT_KEY_DOWN:\n"
            "                ButtonWindow::s_iosInputMode = ButtonWindow::EIOSInputMode::Keyboard;\n"
            "                break;\n\n"
            "            case SDL_EVENT_GAMEPAD_BUTTON_DOWN:\n"
            "                ButtonWindow::s_iosInputMode = ButtonWindow::EIOSInputMode::Gamepad;\n"
            "                break;\n\n"
            "            case SDL_EVENT_GAMEPAD_AXIS_MOTION:\n"
            "                if (event->gaxis.value > 16384 || event->gaxis.value < -16384)\n"
            "                    ButtonWindow::s_iosInputMode = ButtonWindow::EIOSInputMode::Gamepad;\n"
            "                break;\n\n"
            "            case SDL_EVENT_FINGER_DOWN:\n"
            "            case SDL_EVENT_FINGER_MOTION:\n"
            "            case SDL_EVENT_MOUSE_BUTTON_DOWN:\n"
            "            case SDL_EVENT_MOUSE_MOTION:\n"
            "                ButtonWindow::s_iosInputMode = ButtonWindow::EIOSInputMode::Touch;\n"
            "                break;\n\n"
            "            default:\n"
            "                break;\n"
            "        }\n\n"
            "        return false;\n"
            "    }\n"
            "}\n"
            "g_sdlEventListenerForIOSButtonMode;\n"
            "#endif"
        )
        assert old_bw_inc in bwc, "Failed to locate #include <app.h> in button_window.cpp"
        bwc = bwc.replace(old_bw_inc, new_bw_inc, 1)

        old_bw_locale = "    auto buttonLocale = &Localise(g_buttonKey);"
        new_bw_locale = (
            "    auto buttonLocale = &Localise(g_buttonKey);\n"
            "#if defined(MARATHON_IOS_PORT)\n"
            "    if (!App::s_isInit && s_iosInputMode == EIOSInputMode::Touch)\n"
            "    {\n"
            "        if (g_buttonKey == \"Button_SelectBack\" || g_buttonKey == \"Button_Back\")\n"
            "        {\n"
            "            buttonLocale = &Localise(\"Common_Back\");\n"
            "        }\n"
            "        else if (g_buttonKey == \"Button_Cancel\")\n"
            "        {\n"
            "            buttonLocale = &Localise(\"Common_Cancel\");\n"
            "        }\n"
            "        else if (g_buttonKey == \"Button_SelectQuit\")\n"
            "        {\n"
            "            buttonLocale = &Localise(\"Common_Quit\");\n"
            "        }\n"
            "        else\n"
            "        {\n"
            "            s_hitMinX = s_hitMinY = s_hitMaxX = s_hitMaxY = 0.0f;\n"
            "            return;\n"
            "        }\n"
            "    }\n"
            "#endif"
        )
        assert old_bw_locale in bwc, "Failed to locate buttonLocale in button_window.cpp"
        bwc = bwc.replace(old_bw_locale, new_bw_locale, 1)

        bwc = bwc.replace(
            "drawList->AddImage(g_upTexButtonWindow.get(), windowEdgeMin, windowEdgeMax, GET_UV_COORDS(windowEdgeUVs), windowColour);",
            "drawList->AddImage(g_upTexButtonWindow.get(), windowEdgeMin, windowEdgeMax, GET_UV_COORDS(windowEdgeUVs), windowColour);\n"
            "    s_hitMinX = windowEdgeMin.x;\n"
            "    s_hitMinY = windowEdgeMin.y;\n"
            "    s_hitMaxX = windowStretchMax.x;\n"
            "    s_hitMaxY = windowStretchMax.y;"
        )
        bwc = bwc.replace(
            "void ButtonWindow::Close()\n{\n    s_isVisible = false;\n    g_buttonKey.clear();\n}",
            "void ButtonWindow::Close()\n{\n    s_isVisible = false;\n    s_hitMinX = s_hitMinY = s_hitMaxX = s_hitMaxY = 0.0f;\n    g_buttonKey.clear();\n}\n\n"
            "bool ButtonWindow::HitTest(float x, float y)\n{\n"
            "    if (!s_isVisible || s_hitMaxX <= s_hitMinX || s_hitMaxY <= s_hitMinY)\n"
            "        return false;\n"
            "    const float pad = 20.0f;\n"
            "    return x >= (s_hitMinX - pad) && x <= (s_hitMaxX + pad) &&\n"
            "           y >= (s_hitMinY - pad) && y <= (s_hitMaxY + pad);\n"
            "}"
        )
        bw_c.write_text(bwc, encoding="utf-8")
        print("Patched button_window.{h,cpp} for touch-first iOS installer (no mouse/keyboard icons unless keyboard/controller is used).")

# 5b. ui/installer_wizard.cpp: tap diretto sulle scritte delle opzioni + tap su ButtonWindow Indietro + skip tutorial desktop + XISO/DLC picker mode
if wiz_p.exists():
    src = wiz_p.read_text(encoding="utf-8")
    if "MARATHON_IOS_DIRECT_TOUCH_UI" not in src:
        src = (
            "#if defined(MARATHON_IOS_PORT)\n"
            "#define MARATHON_IOS_DIRECT_TOUCH_UI 1\n"
            'extern "C" void MarathonIOS_MapWindowPointToImGui(float winX, float winY, float* outX, float* outY);\n'
            "#endif\n" + src
        )
        old_mouse = '''            case SDL_EVENT_MOUSE_BUTTON_DOWN:
            case SDL_EVENT_MOUSE_MOTION:
            {
                for (size_t i = 0; i < g_currentCursorRects.size(); i++)
                {
                    auto &currentRect = g_currentCursorRects[i];

                    if (ImGui::IsMouseHoveringRect(currentRect.first, currentRect.second, false))
                    {
                        newCursorIndex = int(i);

                        if (event->type == SDL_EVENT_MOUSE_BUTTON_DOWN && event->button.button == SDL_BUTTON_LEFT)
                            g_currentCursorAccepted = true;

                        break;
                    }
                }

                if (newCursorIndex < 0)
                    g_currentCursorIndex = -1;

                break;
            }'''
        new_mouse = '''            case SDL_EVENT_MOUSE_BUTTON_DOWN:
            case SDL_EVENT_MOUSE_MOTION:
            {
#if defined(MARATHON_IOS_PORT)
                float rawX = (event->type == SDL_EVENT_MOUSE_BUTTON_DOWN) ? event->button.x : event->motion.x;
                float rawY = (event->type == SDL_EVENT_MOUSE_BUTTON_DOWN) ? event->button.y : event->motion.y;
                float tapX = 0.0f, tapY = 0.0f;
                MarathonIOS_MapWindowPointToImGui(rawX, rawY, &tapX, &tapY);

                // Tap sul bottone "Indietro / Back / Cancel / Quit" in basso a destra
                if (event->type == SDL_EVENT_MOUSE_BUTTON_DOWN &&
                    event->button.button == SDL_BUTTON_LEFT &&
                    g_currentPage != WizardPage::InstallSucceeded &&
                    ButtonWindow::HitTest(tapX, tapY))
                {
                    g_currentCursorBack = true;
                    break;
                }

                // Hit-test a 2 passaggi: prima tap esatto sulla scritta/pill dell'opzione, poi margine touch verticale sul più vicino
                int exactIdx = -1;
                for (size_t i = 0; i < g_currentCursorRects.size(); i++)
                {
                    auto &currentRect = g_currentCursorRects[i];
                    if (tapX >= currentRect.first.x && tapX <= currentRect.second.x &&
                        tapY >= currentRect.first.y && tapY <= currentRect.second.y)
                    {
                        exactIdx = int(i);
                        break;
                    }
                }
                if (exactIdx < 0)
                {
                    const float touchPadY = 10.0f;
                    float bestDist = FLT_MAX;
                    for (size_t i = 0; i < g_currentCursorRects.size(); i++)
                    {
                        auto &currentRect = g_currentCursorRects[i];
                        if (tapX >= currentRect.first.x && tapX <= currentRect.second.x &&
                            tapY >= (currentRect.first.y - touchPadY) && tapY <= (currentRect.second.y + touchPadY))
                        {
                            float centerY = (currentRect.first.y + currentRect.second.y) * 0.5f;
                            float dist = std::abs(tapY - centerY);
                            if (dist < bestDist)
                            {
                                bestDist = dist;
                                exactIdx = int(i);
                            }
                        }
                    }
                }
                if (exactIdx >= 0)
                {
                    newCursorIndex = exactIdx;
                    if (event->type == SDL_EVENT_MOUSE_BUTTON_DOWN && event->button.button == SDL_BUTTON_LEFT)
                        g_currentCursorAccepted = true;
                }
                if (newCursorIndex < 0 && event->type == SDL_EVENT_MOUSE_BUTTON_DOWN)
                    g_currentCursorIndex = -1;
#else
                for (size_t i = 0; i < g_currentCursorRects.size(); i++)
                {
                    auto &currentRect = g_currentCursorRects[i];
                    if (ImGui::IsMouseHoveringRect(currentRect.first, currentRect.second, false))
                    {
                        newCursorIndex = int(i);
                        if (event->type == SDL_EVENT_MOUSE_BUTTON_DOWN && event->button.button == SDL_BUTTON_LEFT)
                            g_currentCursorAccepted = true;
                        break;
                    }
                }
                if (newCursorIndex < 0)
                    g_currentCursorIndex = -1;
#endif
                break;
            }'''
        assert old_mouse in src, "Failed to locate SDL_EVENT_MOUSE_BUTTON_DOWN in installer_wizard.cpp"
        src = src.replace(old_mouse, new_mouse, 1)

        # Reset cursore quando si cambia pagina su iOS (nessuna evidenziazione fantasma)
        src = src.replace(
            "static void SetCurrentPage(WizardPage page)\n{\n    g_currentPage = page;",
            "static void SetCurrentPage(WizardPage page)\n{\n    g_currentPage = page;\n#if defined(MARATHON_IOS_PORT)\n    g_currentCursorIndex = -1;\n    g_currentCursorAccepted = false;\n#endif",
            1
        )
        # Salta i popup tutorial mouse desktop su iOS così "Aggiungi file" apre subito il selettore XISO/File iOS
        src = src.replace(
            "    NFD_Init();",
            "    NFD_Init();\n#if defined(MARATHON_IOS_PORT)\n    g_pickerTutorialCleared[0] = true;\n    g_pickerTutorialCleared[1] = true;\n#endif",
            1
        )
        # Imposta modalità picker iOS (XISO diretto in SelectGame vs DLC separati in SelectDLC)
        old_open = "result = NFD_OpenDialogMultipleN(&pathSet, nullptr, 0, nullptr);"
        new_open = '''#if defined(MARATHON_IOS_PORT)
        MarathonIOS_SetPickerMode(
            g_currentPage == WizardPage::SelectDLC
                ? MARATHON_IOS_PICKER_MODE_DLC_SEPARATE
                : MARATHON_IOS_PICKER_MODE_GAME_XISO
        );
#endif
        result = NFD_OpenDialogMultipleN(&pathSet, nullptr, 0, nullptr);'''
        assert old_open in src, "Failed to locate NFD_OpenDialogMultipleN in installer_wizard.cpp"
        src = src.replace(old_open, new_open, 1)

        wiz_p.write_text(src, encoding="utf-8")
        print("Patched installer_wizard.cpp: direct 1-tap touch options, tappable Back button, instant iOS XISO picker.")

# 5c. ui/message_window.cpp: tap diretto 1-touch sui pulsanti OK / Sì / No dei dialoghi
if mw_c.exists():
    msrc = mw_c.read_text(encoding="utf-8")
    if "MARATHON_IOS_MSG_TOUCH" not in msrc:
        msrc = (
            "#if defined(MARATHON_IOS_PORT)\n"
            "#define MARATHON_IOS_MSG_TOUCH 1\n"
            "#include <ui/button_window.h>\n"
            'extern "C" void MarathonIOS_MapWindowPointToImGui(float winX, float winY, float* outX, float* outY);\n'
            "static std::vector<std::pair<ImVec2, ImVec2>> g_iosMsgButtonRects{};\n"
            "#endif\n" + msrc
        )
        old_mw_click = '''            case SDL_EVENT_MOUSE_BUTTON_DOWN:
            {
                // Only accept left mouse button.
                if (event->button.button != SDL_BUTTON_LEFT)
                    break;

                // Only accept mouse buttons when an item is selected.
                if (g_selectedRowIndex == -1)
                    break;

                g_isAccepted = true;

                break;
            }'''
        new_mw_click = '''            case SDL_EVENT_MOUSE_BUTTON_DOWN:
            {
                if (event->button.button != SDL_BUTTON_LEFT)
                    break;
#if defined(MARATHON_IOS_PORT)
                float tapX = 0.0f, tapY = 0.0f;
                MarathonIOS_MapWindowPointToImGui(event->button.x, event->button.y, &tapX, &tapY);
                const float padY = 12.0f;
                bool hit = false;
                for (size_t i = 0; i < g_iosMsgButtonRects.size(); i++)
                {
                    auto& r = g_iosMsgButtonRects[i];
                    if (tapX >= r.first.x && tapX <= r.second.x &&
                        tapY >= (r.first.y - padY) && tapY <= (r.second.y + padY))
                    {
                        g_selectedRowIndex = int(i);
                        g_isAccepted = true;
                        hit = true;
                        break;
                    }
                }
                if (!hit && ButtonWindow::HitTest(tapX, tapY))
                {
                    g_isDeclined = true;
                }
#else
                if (g_selectedRowIndex == -1)
                    break;

                g_isAccepted = true;
#endif
                break;
            }'''
        assert old_mw_click in msrc, "Failed to locate SDL_EVENT_MOUSE_BUTTON_DOWN in message_window.cpp"
        msrc = msrc.replace(old_mw_click, new_mw_click, 1)

        old_mw_loop = '''    for (auto& button : g_buttons)
        DrawButton(rowCount++, windowMarginY, itemPadding, itemWidth, itemHeight, button);'''
        new_mw_loop = '''#if defined(MARATHON_IOS_PORT)
    g_iosMsgButtonRects.clear();
    {
        auto clipMin = drawList->GetClipRectMin();
        auto clipMax = drawList->GetClipRectMax();
        for (int i = 0; i < static_cast<int>(g_buttons.size()); i++)
        {
            float y0 = clipMin.y + windowMarginY + (itemHeight + itemPadding) * i;
            g_iosMsgButtonRects.emplace_back(ImVec2(clipMin.x, y0), ImVec2(clipMax.x, y0 + itemHeight));
        }
    }
#endif
    for (auto& button : g_buttons)
        DrawButton(rowCount++, windowMarginY, itemPadding, itemWidth, itemHeight, button);'''
        assert old_mw_loop in msrc, "Failed to locate DrawButton loop in message_window.cpp"
        msrc = msrc.replace(old_mw_loop, new_mw_loop, 1)

        # Non resettare g_selectedRowIndex su iOS se g_isAccepted è già stato confermato dal tap diretto!
        msrc = msrc.replace(
            "        // Invalidate index if the mouse cursor is outside of the list box.\n        if (!ImGui::IsMouseHoveringRect(listMin, listMax, false))\n            g_selectedRowIndex = -1;",
            "        // Invalidate index if the mouse cursor is outside of the list box.\n        if (!g_isAccepted && !ImGui::IsMouseHoveringRect(listMin, listMax, false))\n            g_selectedRowIndex = -1;",
            1
        )
        mw_c.write_text(msrc, encoding="utf-8")
        print("Patched message_window.cpp for direct 1-tap smartphone dialog confirmation.")

# 5d. hid/hid.cpp: cabla il virtual controller Sonic '06 + rumble CoreHaptics e non blocca mai l'input su iOS
if hid_c.exists():
    hsrc = hid_c.read_text(encoding="utf-8")
    if "MARATHON_IOS_VIRTUAL_GAMEPAD" not in hsrc:
        assert '#include "hid.h"' in hsrc, "Failed to locate #include \"hid.h\" in hid/hid.cpp"
        hsrc = hsrc.replace(
            '#include "hid.h"',
            '#include "hid.h"\n'
            '#if defined(MARATHON_IOS_PORT)\n'
            '#define MARATHON_IOS_VIRTUAL_GAMEPAD 1\n'
            '#include <algorithm>\n'
            '#include <cstdlib>\n'
            '#include <ios_virtual_controller.h>\n'
            'static inline int16_t MergeTouchAxis(int16_t phys, int16_t virt)\n'
            '{\n'
            '    return (std::abs(static_cast<int>(virt)) > std::abs(static_cast<int>(phys))) ? virt : phys;\n'
            '}\n'
            '#endif',
            1
        )
        old_get_state = '''        if (const auto pUser = GetManager()->GetUser(in_userIndex))
        {
            XAMINPUT_STATE state
            {
                .dwPacketNumber = packetNumber++,
                .Gamepad = pUser->GetState()
            };

            *out_pState = state;

            return true;
        }

        return false;'''
        new_get_state = '''        XAMINPUT_GAMEPAD gamepad{};
        bool hasUser = false;
        if (const auto pUser = GetManager()->GetUser(in_userIndex))
        {
            gamepad = pUser->GetState();
            hasUser = true;
        }
#if defined(MARATHON_IOS_PORT)
        if (in_userIndex == 0)
        {
            MarathonTouchGamepadState vpad{};
            MarathonIOS_GetVirtualControllerState(&vpad);
            gamepad.wButtons |= static_cast<uint16_t>(vpad.buttons & 0xFFFFu);
            gamepad.bLeftTrigger = std::max(gamepad.bLeftTrigger, vpad.leftTrigger);
            gamepad.bRightTrigger = std::max(gamepad.bRightTrigger, vpad.rightTrigger);
            gamepad.sThumbLX = MergeTouchAxis(gamepad.sThumbLX, vpad.thumbLX);
            gamepad.sThumbLY = MergeTouchAxis(gamepad.sThumbLY, vpad.thumbLY);
            gamepad.sThumbRX = MergeTouchAxis(gamepad.sThumbRX, vpad.thumbRX);
            gamepad.sThumbRY = MergeTouchAxis(gamepad.sThumbRY, vpad.thumbRY);
            hasUser = true;
        }
#endif
        if (hasUser)
        {
            XAMINPUT_STATE state
            {
                .dwPacketNumber = packetNumber++,
                .Gamepad = gamepad
            };

            *out_pState = state;

            return true;
        }

        return false;'''
        assert old_get_state in hsrc, "Failed to locate HID::GetState body in hid/hid.cpp"
        hsrc = hsrc.replace(old_get_state, new_get_state, 1)

        old_set_state = '''        if (const auto pUser = GetManager()->GetUser(in_userIndex))
        {
            pUser->SetVibration(*in_pVibration);
            return true;
        }

        return false;'''
        new_set_state = '''#if defined(MARATHON_IOS_PORT)
        if (in_userIndex == 0)
        {
            MarathonIOS_TriggerHapticRumble(in_pVibration->wLeftMotorSpeed, in_pVibration->wRightMotorSpeed);
        }
#endif
        if (const auto pUser = GetManager()->GetUser(in_userIndex))
        {
            pUser->SetVibration(*in_pVibration);
            return true;
        }

#if defined(MARATHON_IOS_PORT)
        return (in_userIndex == 0);
#else
        return false;
#endif'''
        assert old_set_state in hsrc, "Failed to locate HID::SetState body in hid/hid.cpp"
        hsrc = hsrc.replace(old_set_state, new_set_state, 1)

        hsrc = hsrc.replace(
            "return GameWindow::s_isFocused || Config::AllowBackgroundInput;",
            "#if defined(MARATHON_IOS_PORT)\n        return true;\n#else\n        return GameWindow::s_isFocused || Config::AllowBackgroundInput;\n#endif",
            1
        )
        hid_c.write_text(hsrc, encoding="utf-8")
        print("Patched hid/hid.cpp: wired Sonic '06 virtual gamepad + CoreHaptics rumble + always-active iOS input.")

# 5e. kernel/memory.cpp: FIX CRASH IMMEDIATO SU FEATHER (mmap restituisce MAP_FAILED = (void*)-1, NON nullptr!)
if mem_c.exists():
    ksrc = mem_c.read_text(encoding="utf-8")
    if "MARATHON_IOS_MMAP_GUARD" not in ksrc:
        old_mmap = '''    base = (uint8_t*)mmap((void*)0x100000000ull, PPC_MEMORY_SIZE, PROT_READ | PROT_WRITE, MAP_ANON | MAP_PRIVATE, -1, 0);

    if (base == (uint8_t*)MAP_FAILED)
        base = (uint8_t*)mmap(NULL, PPC_MEMORY_SIZE, PROT_READ | PROT_WRITE, MAP_ANON | MAP_PRIVATE, -1, 0);

    if (base == nullptr)
        return;'''
        new_mmap = '''    // MARATHON_IOS_MMAP_GUARD: mmap() restituisce MAP_FAILED ((void*)-1), non nullptr!
    // Senza questo controllo, su Feather senza EVA entitlement il costruttore statico scriveva a (void*)-1 crashando prima di main().
    base = (uint8_t*)mmap((void*)0x100000000ull, PPC_MEMORY_SIZE, PROT_READ | PROT_WRITE, MAP_ANON | MAP_PRIVATE, -1, 0);
    if (base == (uint8_t*)MAP_FAILED)
        base = (uint8_t*)mmap(NULL, PPC_MEMORY_SIZE, PROT_READ | PROT_WRITE, MAP_ANON | MAP_PRIVATE, -1, 0);

    if (base == (uint8_t*)MAP_FAILED || base == nullptr)
    {
        base = nullptr;
        return;
    }'''
        assert old_mmap in ksrc, "Failed to locate mmap guard in kernel/memory.cpp"
        ksrc = ksrc.replace(old_mmap, new_mmap, 1)
        mem_c.write_text(ksrc, encoding="utf-8")
        print("Patched kernel/memory.cpp: fixed MAP_FAILED pre-main crash on Feather.")

# 5f. locale/locale.cpp: crediti multilingua del porting iOS ("Porting iOS creato da hiperema") nella schermata InstallSucceeded
if loc_c.exists():
    lsrc = loc_c.read_text(encoding="utf-8")
    if "MARATHON_IOS_PORT_CREDITS" not in lsrc:
        old_credits_locale = r'''    {
        "Installer_Page_InstallSucceeded",
        {
            { ELanguage::English,  "Installation complete!\n\nThis project is brought to you by:" },
            { ELanguage::Japanese, "インストール完了！\n\nプロジェクト制作：" },
            { ELanguage::German,   "Installation abgeschlossen!\n\nDieses Projekt wird präsentiert von:" },
            { ELanguage::French,   "Installation terminée !\n\nCe projet vous est présenté par :" },
            { ELanguage::Spanish,  "¡Instalación completada!\n\nEste proyecto ha sido posible gracias a:" },
            { ELanguage::Italian,  "Installazione completata!\n\nQuesto progetto è stato creato da:" }
        }
    },'''
        new_credits_locale = r'''    // MARATHON_IOS_PORT_CREDITS
    {
        "Installer_Page_InstallSucceeded",
        {
            { ELanguage::English,  "Installation complete!\niOS port created by hiperema\n\nThis project is brought to you by:" },
            { ELanguage::Japanese, "インストール完了！\niOS版制作：hiperema\n\nプロジェクト制作：" },
            { ELanguage::German,   "Installation abgeschlossen!\niOS-Port erstellt von hiperema\n\nDieses Projekt wird präsentiert von:" },
            { ELanguage::French,   "Installation terminée !\nPortage iOS créé par hiperema\n\nCe projet vous est présenté par :" },
            { ELanguage::Spanish,  "¡Instalación completada!\nPort para iOS creado por hiperema\n\nEste proyecto ha sido posible gracias a:" },
            { ELanguage::Italian,  "Installazione completata!\nPorting iOS creato da hiperema\n\nQuesto progetto è stato creato da:" }
        }
    },'''
        assert old_credits_locale in lsrc, "Failed to locate Installer_Page_InstallSucceeded in locale/locale.cpp"
        lsrc = lsrc.replace(old_credits_locale, new_credits_locale, 1)
        loc_c.write_text(lsrc, encoding="utf-8")
        print("Patched locale/locale.cpp with multilingual iOS port credits (hiperema).")

# 5g. ui/imgui_utils.cpp: su iOS nell'installatore non mostrare mai simboli mouse; simboli tastiera SOLO in modalità Keyboard, controller in modalità Gamepad
if imu_c.exists():
    isrc = imu_c.read_text(encoding="utf-8")
    if "MARATHON_IOS_INSTALLER_HID_ICONS" not in isrc:
        assert "#include <ui/black_bar.h>" in isrc, "Failed to locate #include <ui/black_bar.h> in ui/imgui_utils.cpp"
        isrc = isrc.replace(
            "#include <ui/black_bar.h>",
            "#include <ui/black_bar.h>\n#if defined(MARATHON_IOS_PORT)\n#include <ui/button_window.h>\n#endif",
            1
        )
        old_hid_icons = '''    if (!App::s_isInit)
    {
        if (const auto pMutator = HID::GetManager()->GetUser(0)->GetMutator())
        {
            const auto type = pMutator->GetType();
            const auto isKeyboard = type == HID::PeripheralType::Keyboard;
            const auto isMouse = type == HID::PeripheralType::Mouse;

            if (isKeyboard || isMouse)
            {
                buttonTexture = &g_upTexKbm;
                buttonTextureWidth = uint16_t(84);
                buttonTextureHeight = uint16_t(28);
            }

            if (isKeyboard)
            {
                buttonCrops = &g_buttonCropsKeyboard;
            }
            else if (isMouse)
            {
                buttonCrops = &g_buttonCropsMouse;
            }
        }
    }'''
        new_hid_icons = '''    // MARATHON_IOS_INSTALLER_HID_ICONS
#if defined(MARATHON_IOS_PORT)
    if (!App::s_isInit)
    {
        if (ButtonWindow::s_iosInputMode == ButtonWindow::EIOSInputMode::Keyboard)
        {
            buttonTexture = &g_upTexKbm;
            buttonTextureWidth = uint16_t(84);
            buttonTextureHeight = uint16_t(28);
            buttonCrops = &g_buttonCropsKeyboard;
        }
    }
#else
    if (!App::s_isInit)
    {
        if (const auto pMutator = HID::GetManager()->GetUser(0)->GetMutator())
        {
            const auto type = pMutator->GetType();
            const auto isKeyboard = type == HID::PeripheralType::Keyboard;
            const auto isMouse = type == HID::PeripheralType::Mouse;

            if (isKeyboard || isMouse)
            {
                buttonTexture = &g_upTexKbm;
                buttonTextureWidth = uint16_t(84);
                buttonTextureHeight = uint16_t(28);
            }

            if (isKeyboard)
            {
                buttonCrops = &g_buttonCropsKeyboard;
            }
            else if (isMouse)
            {
                buttonCrops = &g_buttonCropsMouse;
            }
        }
    }
#endif'''
        assert old_hid_icons in isrc, "Failed to locate GetHidInterpTextData block in ui/imgui_utils.cpp"
        isrc = isrc.replace(old_hid_icons, new_hid_icons, 1)
        imu_c.write_text(isrc, encoding="utf-8")
        print("Patched ui/imgui_utils.cpp: disabled mouse icons in iOS installer, keyboard icons only on real keyboard input.")
PY_WIZ

echo "==> [6/8] Patch paths.cpp, paths.h, config.cpp, file_system.cpp, imports.cpp (FIX FREEZE ARM64!), app.cpp e stdafx.h..."
python3 - \
  "${UPSTREAM_DIR}/MarathonRecomp/user/paths.cpp" \
  "${UPSTREAM_DIR}/MarathonRecomp/stdafx.h" \
  "${UPSTREAM_DIR}/MarathonRecomp/user/config.cpp" \
  "${UPSTREAM_DIR}/MarathonRecomp/user/paths.h" \
  "${UPSTREAM_DIR}/MarathonRecomp/kernel/io/file_system.cpp" \
  "${UPSTREAM_DIR}/MarathonRecomp/kernel/imports.cpp" \
  "${UPSTREAM_DIR}/MarathonRecomp/app.cpp" << 'PY_PATHS'
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

cfg_p = pathlib.Path(sys.argv[3])
if cfg_p.exists():
    csrc = cfg_p.read_text(encoding="utf-8")
    if "MARATHON_IOS_SAFE_CONFIG_DIR" not in csrc:
        old_cfg_dir = '''    if (!std::filesystem::exists(userPath))
        std::filesystem::create_directory(userPath);'''
        new_cfg_dir = '''    // MARATHON_IOS_SAFE_CONFIG_DIR: usa create_directories con error_code per evitare eccezioni al primo avvio su LiveContainer
    std::error_code cfgDirEc;
    if (!userPath.empty() && !std::filesystem::exists(userPath, cfgDirEc))
        std::filesystem::create_directories(userPath, cfgDirEc);'''
        assert old_cfg_dir in csrc, "Failed to locate create_directory in user/config.cpp"
        csrc = csrc.replace(old_cfg_dir, new_cfg_dir, 1)
        cfg_p.write_text(csrc, encoding="utf-8")
        print("Patched user/config.cpp: non-throwing create_directories in Config::Save().")

ph_p = pathlib.Path(sys.argv[4])
if ph_p.exists():
    ph_src = ph_p.read_text(encoding="utf-8")
    if "MARATHON_IOS_PATH_CACHE_FIX" not in ph_src:
        old_bpc = '''inline void BuildPathCache(const std::string& gamePath) {
    for (const auto& entry : std::filesystem::recursive_directory_iterator(gamePath)) {
        std::string fullPath = entry.path().string();
        std::string key = toLower(fullPath);
        g_pathCache[key] = entry.path();
    }
}'''
        new_bpc = '''// MARATHON_IOS_PATH_CACHE_FIX: non-throwing iterator + lexically_normal() per APFS case-sensitive su iOS
inline void BuildPathCache(const std::string& gamePath) {
    std::error_code ec;
    for (const auto& entry : std::filesystem::recursive_directory_iterator(gamePath, ec)) {
        std::string fullPath = entry.path().lexically_normal().string();
        std::string key = toLower(fullPath);
        g_pathCache[key] = entry.path();
    }
}'''
        assert old_bpc in ph_src, "Failed to locate BuildPathCache in user/paths.h"
        ph_src = ph_src.replace(old_bpc, new_bpc, 1)
        ph_p.write_text(ph_src, encoding="utf-8")
        print("Patched user/paths.h: non-throwing BuildPathCache with lexically_normal().")

fs_p = pathlib.Path(sys.argv[5])
if fs_p.exists():
    fsrc = fs_p.read_text(encoding="utf-8")
    if "MARATHON_IOS_CASE_INSENSITIVE_FS" not in fsrc:
        old_open_fallback = '''    if (!fileStream.is_open()) {
        std::filesystem::path cachedPath = FindInPathCache(filePath.string());
        if (!cachedPath.empty()) {
            fileStream.open(cachedPath, fileOpenMode);
        }
    }'''
        new_open_fallback = '''    // MARATHON_IOS_CASE_INSENSITIVE_FS: aggiorna filePath con cachedPath su APFS case-sensitive (altrimenti XGetFileSizeA fallisce!)
    if (!fileStream.is_open()) {
        std::filesystem::path cachedPath = FindInPathCache(filePath.lexically_normal().string());
        if (!cachedPath.empty()) {
            fileStream.open(cachedPath, fileOpenMode);
            if (fileStream.is_open()) {
                filePath = std::move(cachedPath);
            }
        }
    }'''
        assert old_open_fallback in fsrc, "Failed to locate FindInPathCache fallback in kernel/io/file_system.cpp"
        fsrc = fsrc.replace(old_open_fallback, new_open_fallback, 1)

        old_attrs = '''uint32_t XGetFileAttributesA(const char* lpFileName)
{
    std::filesystem::path filePath = FileSystem::ResolvePath(lpFileName, true);
    if (std::filesystem::is_directory(filePath))
        return FILE_ATTRIBUTE_DIRECTORY;
    else if (std::filesystem::is_regular_file(filePath))
        return FILE_ATTRIBUTE_NORMAL;
    else
        return INVALID_FILE_ATTRIBUTES;
}'''
        new_attrs = '''uint32_t XGetFileAttributesA(const char* lpFileName)
{
    std::filesystem::path filePath = FileSystem::ResolvePath(lpFileName, true);
    std::error_code ec;
    if (!std::filesystem::exists(filePath, ec))
    {
        std::filesystem::path cachedPath = FindInPathCache(filePath.lexically_normal().string());
        if (!cachedPath.empty())
            filePath = std::move(cachedPath);
    }
    if (std::filesystem::is_directory(filePath, ec))
        return FILE_ATTRIBUTE_DIRECTORY;
    else if (std::filesystem::is_regular_file(filePath, ec))
        return FILE_ATTRIBUTE_NORMAL;
    else
        return INVALID_FILE_ATTRIBUTES;
}'''
        assert old_attrs in fsrc, "Failed to locate XGetFileAttributesA in kernel/io/file_system.cpp"
        fsrc = fsrc.replace(old_attrs, new_attrs, 1)
        fs_p.write_text(fsrc, encoding="utf-8")
        print("Patched kernel/io/file_system.cpp: case-insensitive APFS filePath update + non-throwing XGetFileAttributesA.")

# 6b. kernel/imports.cpp: FIX CRITICO DEADLOCK CASUALE SU ARM64 (compare_exchange_weak spurious failure -> wait(true) / wait(0) infinito!)
imp_p = pathlib.Path(sys.argv[6])
if imp_p.exists():
    isrc = imp_p.read_text(encoding="utf-8")
    if "MARATHON_IOS_ARM64_CAS_FIX" not in isrc:
        old_ev_wait = '''        else if (timeout == INFINITE)
        {
            if (manualReset)
            {
                signaled.wait(false);
            }
            else
            {
                while (true)
                {
                    bool expected = true;
                    if (signaled.compare_exchange_weak(expected, false))
                        break;

                    signaled.wait(expected);
                }
            }
        }
        else
        {
            assert(false && "Unhandled timeout value.");
        }'''
        new_ev_wait = '''        // MARATHON_IOS_ARM64_CAS_FIX: su ARM64 LL/SC compare_exchange_weak può fallire spuriamente lasciando expected==true -> signaled.wait(true) freeza per sempre!
        else if (timeout == INFINITE)
        {
            if (manualReset)
            {
                while (!signaled.load())
                    signaled.wait(false);
            }
            else
            {
                while (true)
                {
                    bool expected = true;
                    if (signaled.compare_exchange_strong(expected, false))
                        break;

                    if (!expected)
                        signaled.wait(false);
                }
            }
        }
        else
        {
            auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout);
            while (true)
            {
                if (manualReset)
                {
                    if (signaled.load())
                        return STATUS_SUCCESS;
                }
                else
                {
                    bool expected = true;
                    if (signaled.compare_exchange_strong(expected, false))
                        return STATUS_SUCCESS;
                }
                if (std::chrono::steady_clock::now() >= deadline)
                    return STATUS_TIMEOUT;
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
            }
        }'''
        assert old_ev_wait in isrc, "Failed to locate Event::Wait in kernel/imports.cpp"
        isrc = isrc.replace(old_ev_wait, new_ev_wait, 1)

        old_sem_wait = '''        if (timeout == 0)
        {
            uint32_t currentCount = count.load();
            if (currentCount != 0)
            {
                if (count.compare_exchange_weak(currentCount, currentCount - 1))
                    return STATUS_SUCCESS;
            }

            return STATUS_TIMEOUT;
        }
        else if (timeout == INFINITE)
        {
            uint32_t currentCount;
            while (true)
            {
                currentCount = count.load();
                if (currentCount != 0)
                {
                    if (count.compare_exchange_weak(currentCount, currentCount - 1))
                        return STATUS_SUCCESS;
                }
                else
                {
                    count.wait(0);
                }
            }

            return STATUS_SUCCESS;
        }
        else
        {
            assert(false && "Unhandled timeout value.");
            return STATUS_TIMEOUT;
        }'''
        new_sem_wait = '''        if (timeout == 0)
        {
            uint32_t currentCount = count.load();
            while (currentCount != 0)
            {
                if (count.compare_exchange_strong(currentCount, currentCount - 1))
                    return STATUS_SUCCESS;
            }

            return STATUS_TIMEOUT;
        }
        else if (timeout == INFINITE)
        {
            uint32_t currentCount;
            while (true)
            {
                currentCount = count.load();
                if (currentCount != 0)
                {
                    if (count.compare_exchange_strong(currentCount, currentCount - 1))
                        return STATUS_SUCCESS;
                }
                else
                {
                    count.wait(0);
                }
            }

            return STATUS_SUCCESS;
        }
        else
        {
            auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout);
            while (true)
            {
                uint32_t currentCount = count.load();
                if (currentCount != 0)
                {
                    if (count.compare_exchange_strong(currentCount, currentCount - 1))
                        return STATUS_SUCCESS;
                    continue;
                }
                if (std::chrono::steady_clock::now() >= deadline)
                    return STATUS_TIMEOUT;
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
            }
        }'''
        assert old_sem_wait in isrc, "Failed to locate Semaphore::Wait in kernel/imports.cpp"
        isrc = isrc.replace(old_sem_wait, new_sem_wait, 1)

        old_enter_cs = '''    while (true) 
    {
        be<uint32_t> previousOwner = 0;

        if (owningThread.compare_exchange_weak(previousOwner, thisThread) || previousOwner == thisThread)
        {
            cs->RecursionCount = cs->RecursionCount.get() + 1;
            return;
        }

        owningThread.wait(previousOwner);
    }'''
        new_enter_cs = '''    while (true)
    {
        be<uint32_t> previousOwner = 0;

        if (owningThread.compare_exchange_strong(previousOwner, thisThread) || previousOwner == thisThread)
        {
            cs->RecursionCount = cs->RecursionCount.get() + 1;
            return;
        }

        if (previousOwner != 0)
            owningThread.wait(previousOwner);
    }'''
        assert old_enter_cs in isrc, "Failed to locate RtlEnterCriticalSection in kernel/imports.cpp"
        isrc = isrc.replace(old_enter_cs, new_enter_cs, 1)

        old_try_cs = "    if (owningThread.compare_exchange_weak(previousOwner, thisThread) || previousOwner == thisThread)"
        new_try_cs = "    if (owningThread.compare_exchange_strong(previousOwner, thisThread) || previousOwner == thisThread)"
        assert old_try_cs in isrc, "Failed to locate RtlTryEnterCriticalSection in kernel/imports.cpp"
        isrc = isrc.replace(old_try_cs, new_try_cs, 1)

        isrc = isrc.replace(
            "if (spinLockRef.compare_exchange_weak(expected, g_ppcContext->r13.u32))",
            "if (spinLockRef.compare_exchange_strong(expected, g_ppcContext->r13.u32))"
        )
        imp_p.write_text(isrc, encoding="utf-8")
        print("Patched kernel/imports.cpp: fixed ARM64 compare_exchange_weak spurious-failure deadlocks in Event::Wait, Semaphore::Wait, RtlEnterCriticalSection.")

# 6c. app.cpp: Heartbeat Freeze Watchdog + rilevamento dinamico personaggio Sonic / Shadow / Silver per il tema del controller
app_p = pathlib.Path(sys.argv[7])
if app_p.exists():
    asrc = app_p.read_text(encoding="utf-8")
    if "MARATHON_IOS_CHARACTER_THEME" not in asrc:
        assert '#include "app.h"' in asrc, "Failed to locate #include \"app.h\" in app.cpp"
        asrc = asrc.replace(
            '#include "app.h"',
            '#include "app.h"\n'
            '#if defined(MARATHON_IOS_PORT)\n'
            '#define MARATHON_IOS_CHARACTER_THEME 1\n'
            '#include <string_view>\n'
            '#include <ios_virtual_controller.h>\n'
            '#endif',
            1
        )
        old_app_upd = '''void App::Update(double in_deltaTime)
{
    if (HostThread::GetCurrentID() == g_mainThreadId)'''
        new_app_upd = '''void App::Update(double in_deltaTime)
{
#if defined(MARATHON_IOS_PORT)
    MarathonIOS_Heartbeat("App::Update");
#endif
    if (HostThread::GetCurrentID() == g_mainThreadId)'''
        assert old_app_upd in asrc, "Failed to locate App::Update in app.cpp"
        asrc = asrc.replace(old_app_upd, new_app_upd, 1)

        old_gamemode = '''    if (const auto pGameMode = pDoc->GetDocMode<Sonicteam::GameMode>("GameMode"))
    {
        switch (pGameMode->GetGame()->m_State)'''
        new_gamemode = '''    if (const auto pGameMode = pDoc->GetDocMode<Sonicteam::GameMode>("GameMode"))
    {
#if defined(MARATHON_IOS_PORT)
        if (const auto pGame = pGameMode->GetGame())
        {
            std::string_view charName;
            if (pGame->m_spActorManager.get() != nullptr && pGame->m_PlayerData[0].ActorID != 0)
            {
                if (const auto pPlayer = pGame->GetPlayer(0))
                {
                    if (!pPlayer->m_Name.empty())
                        charName = pPlayer->m_Name.c_str();
                }
            }
            if (charName.empty() && !pGame->m_PlayerInfo[0].StartPlayer.empty())
            {
                charName = pGame->m_PlayerInfo[0].StartPlayer.c_str();
            }
            if (!charName.empty())
            {
                int theme = MARATHON_THEME_SONIC;
                if (charName.find("shadow") != std::string_view::npos ||
                    charName.find("rouge") != std::string_view::npos ||
                    charName.find("omega") != std::string_view::npos)
                {
                    theme = MARATHON_THEME_SHADOW;
                }
                else if (charName.find("silver") != std::string_view::npos ||
                         charName.find("blaze") != std::string_view::npos ||
                         charName.find("amy") != std::string_view::npos)
                {
                    theme = MARATHON_THEME_SILVER;
                }
                static int s_lastIOSTheme = -1;
                if (theme != s_lastIOSTheme)
                {
                    s_lastIOSTheme = theme;
                    MarathonIOS_SetCharacterTheme(theme);
                }
            }
        }
#endif
        switch (pGameMode->GetGame()->m_State)'''
        assert old_gamemode in asrc, "Failed to locate GameMode block in app.cpp"
        asrc = asrc.replace(old_gamemode, new_gamemode, 1)
        app_p.write_text(asrc, encoding="utf-8")
        print("Patched app.cpp: added Freeze Watchdog heartbeat + dynamic Sonic/Shadow/Silver controller theming.")

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
    static auto* buckets = new WaitBucket[256]();
    const std::uint64_t h = static_cast<std::uint64_t>(reinterpret_cast<std::uintptr_t>(addr)) * 0x9E3779B97F4A7C15ull;
    const auto idx = static_cast<std::size_t>((h >> 56) & 255u);
    return buckets[idx];
}
constexpr memory_order fail_order_from_success(memory_order o) noexcept {
    if (o == memory_order_acq_rel) return memory_order_acquire;
    if (o == memory_order_release) return memory_order_relaxed;
    return o;
}
constexpr memory_order load_order_for_wait(memory_order o) noexcept {
    return (o == memory_order_relaxed) ? memory_order_acquire : o;
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
        const memory_order loadOrder = marathon_atomic_detail::load_order_for_wait(m);
        T cur = load(loadOrder);
        if (std::memcmp(&cur, &old, sizeof(T)) != 0) return;
        auto& bucket = marathon_atomic_detail::get_wait_bucket(ptr_);
        std::unique_lock<std::mutex> lk(bucket.mtx);
        for (;;) {
            cur = load(loadOrder);
            if (std::memcmp(&cur, &old, sizeof(T)) != 0) break;
            bucket.cv.wait(lk);
        }
    }

    // In a hashed wait-bucket table, multiple distinct addresses share one condition_variable.
    // notify_one() MUST call bucket.cv.notify_all() so a waiter on a colliding critical section
    // can never steal the wakeup and permanently deadlock another Xbox 360 guest thread.
    void notify_one() const noexcept {
        auto& bucket = marathon_atomic_detail::get_wait_bucket(ptr_);
        {
            std::lock_guard<std::mutex> lk(bucket.mtx);
        }
        bucket.cv.notify_all();
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
        print("Patched stdafx.h with deadlock-free C++20 Apple libc++ std::atomic_ref polyfill (256 buckets, notify_all).")
PY_PATHS

echo "==> [7/8] Patch thirdparty/plume (UIKit CAMetalLayer landscape fix + ProMotion), SDL3 UIKit LiveContainer layout/rotation, game_window.cpp e video.cpp..."
python3 - \
  "${UPSTREAM_DIR}/thirdparty/plume/plume_apple.mm" \
  "${UPSTREAM_DIR}/thirdparty/plume/plume_metal.cpp" \
  "${UPSTREAM_DIR}/thirdparty/plume/CMakeLists.txt" \
  "${UPSTREAM_DIR}/MarathonRecomp/ui/game_window.cpp" \
  "${UPSTREAM_DIR}/MarathonRecomp/gpu/video.cpp" \
  "${UPSTREAM_DIR}/thirdparty/SDL/src/video/uikit/SDL_uikitvideo.m" \
  "${UPSTREAM_DIR}/thirdparty/SDL/src/video/uikit/SDL_uikitmetalview.m" \
  "${UPSTREAM_DIR}/thirdparty/SDL/src/video/uikit/SDL_uikitwindow.m" << 'PY_PLUME'
import sys, pathlib

mm = pathlib.Path(sys.argv[1])
metal_cpp = pathlib.Path(sys.argv[2])
cm = pathlib.Path(sys.argv[3])
gw_cpp = pathlib.Path(sys.argv[4])
vid_cpp = pathlib.Path(sys.argv[5])
sdl_uikit = pathlib.Path(sys.argv[6])
sdl_metalview = pathlib.Path(sys.argv[7])
sdl_window = pathlib.Path(sys.argv[8])

# 1. plume_apple.mm: UIKit + CAMetalLayer real bounds*contentsScale (fixes LiveContainer portrait-squished half-screen!)
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
#include <atomic>

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

static std::atomic<uint32_t> g_iosMetalCachedW{0};
static std::atomic<uint32_t> g_iosMetalCachedH{0};
static std::atomic<bool> g_iosMetalSyncPending{false};

// Safely syncs UIWindow + SDL_uikitmetalview + CAMetalLayer on main thread (fixes LiveContainer portrait-squished half-screen!)
static void syncIOSMetalViewOnMainThread(CAMetalLayer *metalLayer) {
    if (!metalLayer) return;

    UIView *metalView = [metalLayer.delegate isKindOfClass:[UIView class]] ? (UIView *)metalLayer.delegate : nil;
    UIWindow *win = metalView ? metalView.window : nil;

    if (@available(iOS 13.0, *)) {
        UIWindowScene *scene = win ? win.windowScene : nil;
        if (scene) {
            CGRect sceneBounds = scene.coordinateSpace.bounds;
            // On iOS 16+ inside LiveContainer, host scene may still be Portrait right after launch; gently request Landscape.
            if (@available(iOS 16.0, *)) {
                if (sceneBounds.size.height > sceneBounds.size.width) {
                    static int s_rotateAttempts = 0;
                    static CFAbsoluteTime s_lastRotateReq = 0.0;
                    CFAbsoluteTime now = CFAbsoluteTimeGetCurrent();
                    if (s_rotateAttempts < 5 && (now - s_lastRotateReq) >= 0.35) {
                        s_rotateAttempts++;
                        s_lastRotateReq = now;
                        if (win.rootViewController) {
                            [win.rootViewController setNeedsUpdateOfSupportedInterfaceOrientations];
                        }
                        UIWindowSceneGeometryPreferencesIOS *prefs =
                            [[UIWindowSceneGeometryPreferencesIOS alloc] initWithInterfaceOrientations:UIInterfaceOrientationMaskLandscape];
                        [scene requestGeometryUpdateWithPreferences:prefs errorHandler:^(NSError *error) {
                            (void)error;
                        }];
                    }
                }
            }
            // Keep UIWindow.frame aligned with UIWindowScene.coordinateSpace.bounds (never stuck at Portrait 402x874 on Landscape 874x402!)
            if (sceneBounds.size.width > 0 && sceneBounds.size.height > 0 &&
                !CGRectEqualToRect(win.frame, sceneBounds)) {
                win.frame = sceneBounds;
                [win setNeedsLayout];
                [win layoutIfNeeded];
            }
        }
    }

    // Never mutate metalLayer.frame directly on a UIView-backed layer; update via UIView when unrotated.
    if (metalView && metalView.superview && CGAffineTransformIsIdentity(metalView.transform)) {
        CGRect superBounds = metalView.superview.bounds;
        if (superBounds.size.width > 0 && superBounds.size.height > 0 &&
            !CGRectEqualToRect(metalView.frame, superBounds)) {
            metalView.frame = superBounds;
            [metalView setNeedsLayout];
            [metalView layoutIfNeeded];
        }
    }

    CGRect bounds = metalView ? metalView.bounds : metalLayer.bounds;
    CGFloat scale = getIOSScaleFactor(win);
    if (scale <= 0.0) scale = 1.0;
    if (metalLayer.contentsScale != scale) {
        metalLayer.contentsScale = scale;
    }

    uint32_t w = (uint32_t)std::lround(bounds.size.width * scale);
    uint32_t h = (uint32_t)std::lround(bounds.size.height * scale);
    if (w > 0 && h > 0) {
        CGSize expected = CGSizeMake((CGFloat)w, (CGFloat)h);
        if (!CGSizeEqualToSize(metalLayer.drawableSize, expected)) {
            metalLayer.drawableSize = expected;
        }
        g_iosMetalCachedW.store(w, std::memory_order_release);
        g_iosMetalCachedH.store(h, std::memory_order_release);
    }
}

void getIOSMetalLayerSize(void *layerPtr, uint32_t &dstWidth, uint32_t &dstHeight) {
    CAMetalLayer *metalLayer = (__bridge CAMetalLayer *)layerPtr;
    if (!metalLayer) {
        dstWidth = 0;
        dstHeight = 0;
        return;
    }

    if ([NSThread isMainThread]) {
        syncIOSMetalViewOnMainThread(metalLayer);
    } else {
        // Trigger non-blocking main-thread layout sync from render thread (never dispatch_sync -> zero deadlocks!)
        bool expected = false;
        if (g_iosMetalSyncPending.compare_exchange_strong(expected, true, std::memory_order_acq_rel)) {
            dispatch_async(dispatch_get_main_queue(), ^{
                syncIOSMetalViewOnMainThread(metalLayer);
                g_iosMetalSyncPending.store(false, std::memory_order_release);
            });
        }
    }

    uint32_t w = g_iosMetalCachedW.load(std::memory_order_acquire);
    uint32_t h = g_iosMetalCachedH.load(std::memory_order_acquire);
    if (w == 0 || h == 0) {
        CGRect b = metalLayer.bounds;
        CGFloat sc = metalLayer.contentsScale > 0.0 ? metalLayer.contentsScale : 1.0;
        w = (uint32_t)std::lround(b.size.width * sc);
        h = (uint32_t)std::lround(b.size.height * sc);
        if (w == 0 || h == 0) {
            CGSize ds = metalLayer.drawableSize;
            w = (uint32_t)std::lround(ds.width);
            h = (uint32_t)std::lround(ds.height);
        }
    }
    dstWidth = w;
    dstHeight = h;
}

static void readIOSWindowMetrics(void *windowHandle, CocoaWindowAttributes &outAttrs, int &outRefreshRate) {
    UIWindow *uiWindow = (__bridge UIWindow *)windowHandle;
    UIScreen *screen = uiWindow ? uiWindow.screen : nil;
    if (!screen) screen = [UIScreen mainScreen];
    // Prefer rootViewController.view.bounds (matches rotated container in LiveContainer) over raw uiWindow.bounds
    CGRect bounds = CGRectZero;
    if (uiWindow && uiWindow.rootViewController && uiWindow.rootViewController.view) {
        bounds = uiWindow.rootViewController.view.bounds;
    }
    if (bounds.size.width <= 0 || bounds.size.height <= 0) {
        bounds = uiWindow ? uiWindow.bounds : (screen ? screen.bounds : CGRectMake(0, 0, 1280, 720));
    }
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
        print("Patched thirdparty/plume/plume_apple.mm with CAMetalLayer real pixel sizing + UIKit ProMotion.")

# 2. plume_metal.cpp: guard macOS-only Metal APIs + read CAMetalLayer size + sync actual nextDrawable texture size on iOS
if metal_cpp.exists():
    msrc = metal_cpp.read_text(encoding="utf-8")
    if "MARATHON_PLUME_IOS_METAL_PATCH" not in msrc:
        assert "namespace plume {" in msrc, "Failed to locate namespace plume in plume_metal.cpp"
        msrc = msrc.replace(
            "namespace plume {",
            "// MARATHON_PLUME_IOS_METAL_PATCH\n"
            "#if !PLUME_MACOS\n"
            'extern "C" void MarathonIOS_LogLine(const char* tag, const char* msg);\n'
            "#endif\n"
            "namespace plume {\n"
            "#if !PLUME_MACOS\n"
            "    void getIOSMetalLayerSize(void *layerPtr, uint32_t &dstWidth, uint32_t &dstHeight);\n"
            "#endif",
            1
        )
        msrc = msrc.replace(
            "        layer->setDisplaySyncEnabled(vsyncEnabled);",
            "#if PLUME_MACOS\n        layer->setDisplaySyncEnabled(vsyncEnabled);\n#else\n        (void)vsyncEnabled;\n#endif"
        )
        msrc = msrc.replace(
            "        return layer->displaySyncEnabled();",
            "#if PLUME_MACOS\n        return layer->displaySyncEnabled();\n#else\n        return true;\n#endif"
        )
        # Use real CAMetalLayer size in MetalSwapChain::getWindowSize on iOS
        old_gws = '''    void MetalSwapChain::getWindowSize(uint32_t &dstWidth, uint32_t &dstHeight) const {
        MetalAutoreleasePool releasePool;
        CocoaWindowAttributes attributes;
        windowWrapper->getWindowAttributes(&attributes);
        dstWidth = attributes.width;
        dstHeight = attributes.height;
    }'''
        new_gws = '''    void MetalSwapChain::getWindowSize(uint32_t &dstWidth, uint32_t &dstHeight) const {
        MetalAutoreleasePool releasePool;
#if !PLUME_MACOS
        if (layer != nullptr) {
            uint32_t lw = 0, lh = 0;
            getIOSMetalLayerSize(layer, lw, lh);
            if (lw > 0 && lh > 0) {
                dstWidth = lw;
                dstHeight = lh;
                return;
            }
        }
#endif
        CocoaWindowAttributes attributes;
        windowWrapper->getWindowAttributes(&attributes);
        dstWidth = attributes.width;
        dstHeight = attributes.height;
    }'''
        assert old_gws in msrc, "Failed to locate MetalSwapChain::getWindowSize in plume_metal.cpp"
        msrc = msrc.replace(old_gws, new_gws, 1)

        # Also check CAMetalLayer drawableSize in MetalSwapChain::needsResize on iOS
        old_needs_resize = '''    bool MetalSwapChain::needsResize() const {
        MetalAutoreleasePool releasePool;
        uint32_t windowWidth, windowHeight;
        getWindowSize(windowWidth, windowHeight);
        return (layer == nullptr) || (width != windowWidth) || (height != windowHeight);
    }'''
        new_needs_resize = '''    bool MetalSwapChain::needsResize() const {
        MetalAutoreleasePool releasePool;
        uint32_t windowWidth, windowHeight;
        getWindowSize(windowWidth, windowHeight);
        if ((layer == nullptr) || (width != windowWidth) || (height != windowHeight)) {
            return true;
        }
#if !PLUME_MACOS
        const CGSize ds = layer->drawableSize();
        if (static_cast<uint32_t>(ds.width + 0.5) != width || static_cast<uint32_t>(ds.height + 0.5) != height) {
            return true;
        }
#endif
        return false;
    }'''
        assert old_needs_resize in msrc, "Failed to locate MetalSwapChain::needsResize in plume_metal.cpp"
        msrc = msrc.replace(old_needs_resize, new_needs_resize, 1)

        # 2a. MetalShader: avoid dispatch_get_main_queue() destructor & dispatch_data_t leak during parallel PSO compilation
        old_shader_dispatch = '''        NS::Error *error = nullptr;
        const dispatch_data_t dispatchData = dispatch_data_create(data, size, dispatch_get_main_queue(), ^{});
        library = device->mtl->newLibrary(dispatchData, &error);'''
        new_shader_dispatch = '''        NS::Error *error = nullptr;
        const dispatch_data_t dispatchData = dispatch_data_create(data, size, nullptr, DISPATCH_DATA_DESTRUCTOR_DEFAULT);
        library = device->mtl->newLibrary(dispatchData, &error);
        if (dispatchData != nullptr) {
            dispatch_release(dispatchData);
        }'''
        assert old_shader_dispatch in msrc, "Failed to locate dispatch_data_create in MetalShader"
        msrc = msrc.replace(old_shader_dispatch, new_shader_dispatch, 1)

        msrc = msrc.replace(
            "        functionName->release();\n        library->release();",
            "        if (functionName != nullptr) functionName->release();\n        if (library != nullptr) library->release();",
            1
        )

        # 2b. MetalSwapChain::present: transfer drawable ownership, remove cross-thread currentAvailableDrawableIndex race, log Metal errors
        old_present_drawable = '''        const MetalDrawable &drawable = drawables[textureIndex];
        assert(drawable.mtl != nullptr && "Cannot present without a valid drawable.");

        // Create a new command buffer just for presenting
        MTL::CommandBuffer *presentBuffer = commandQueue->mtl->commandBufferWithUnretainedReferences();
        presentBuffer->setLabel(MTLSTR("Present Command Buffer"));
        presentBuffer->enqueue();

        for (uint32_t i = 0; i < waitSemaphoreCount; i++) {
            MetalCommandSemaphore *interfaceSemaphore = static_cast<MetalCommandSemaphore *>(waitSemaphores[i]);
            presentBuffer->encodeWait(interfaceSemaphore->mtl, interfaceSemaphore->mtlEventValue++);
        }

        const uint64_t presentId = ++currentPresentId;

        // According to Apple, presenting via scheduled handler is more performant than using the presentDrawable method.
        // We grab the underlying drawable because we might've acquired a new one by now and the old one would have been released.
        CA::MetalDrawable *drawableMtl = drawable.mtl->retain();'''
        new_present_drawable = '''        MetalDrawable &drawable = drawables[textureIndex];
        CA::MetalDrawable *drawableMtl = drawable.mtl;
        drawable.mtl = nullptr;
        if (drawableMtl == nullptr) {
            return false;
        }

        // Create a new command buffer just for presenting
        MTL::CommandBuffer *presentBuffer = commandQueue->mtl->commandBufferWithUnretainedReferences();
        presentBuffer->setLabel(MTLSTR("Present Command Buffer"));
        presentBuffer->enqueue();

        for (uint32_t i = 0; i < waitSemaphoreCount; i++) {
            MetalCommandSemaphore *interfaceSemaphore = static_cast<MetalCommandSemaphore *>(waitSemaphores[i]);
            presentBuffer->encodeWait(interfaceSemaphore->mtl, interfaceSemaphore->mtlEventValue++);
        }

        const uint64_t presentId = ++currentPresentId;'''
        assert old_present_drawable in msrc, "Failed to locate drawable retain in MetalSwapChain::present"
        msrc = msrc.replace(old_present_drawable, new_present_drawable, 1)

        old_present_done = '''        presentBuffer->addCompletedHandler([drawableMtl, presentId, this](MTL::CommandBuffer* cmdBuffer) {
            currentAvailableDrawableIndex = (currentAvailableDrawableIndex + 1) % MAX_DRAWABLES;
            drawableMtl->release();'''
        new_present_done = '''        presentBuffer->addCompletedHandler([drawableMtl, presentId, this](MTL::CommandBuffer* cmdBuffer) {
#if !PLUME_MACOS
            if (cmdBuffer && cmdBuffer->status() == MTL::CommandBufferStatusError) {
                const char* errDesc = (cmdBuffer->error() && cmdBuffer->error()->localizedDescription())
                    ? cmdBuffer->error()->localizedDescription()->utf8String() : "unknown present error";
                MarathonIOS_LogLine("METAL_ERR", errDesc);
            }
#endif
            drawableMtl->release();'''
        assert old_present_done in msrc, "Failed to locate presentBuffer completed handler in plume_metal.cpp"
        msrc = msrc.replace(old_present_done, new_present_done, 1)

        # 2c. MetalSwapChain::acquireTexture: release stale slot before nextDrawable(), advance index cleanly on render thread, validate dimensions
        old_acq_full = '''        // Create a command buffer just to encode the signal
        MetalAutoreleasePool releasePool;
        MTL::CommandBuffer *acquireBuffer = commandQueue->mtl->commandBufferWithUnretainedReferences();
        acquireBuffer->setLabel(MTLSTR("Acquire Drawable Command Buffer"));
        const MetalCommandSemaphore *interfaceSemaphore = static_cast<MetalCommandSemaphore *>(signalSemaphore);
        acquireBuffer->enqueue();
        acquireBuffer->encodeSignalEvent(interfaceSemaphore->mtl, interfaceSemaphore->mtlEventValue);
        acquireBuffer->commit();

        CA::MetalDrawable *nextDrawable = layer->nextDrawable();
        if (nextDrawable == nullptr) {
            fprintf(stderr, "No more drawables available for rendering.\\n");
            return false;
        }

        // Set the texture index and drawable data
        *textureIndex = currentAvailableDrawableIndex;
        MetalDrawable &drawable = drawables[currentAvailableDrawableIndex];
        drawable.desc.width = width;
        drawable.desc.height = height;
        drawable.desc.flags = RenderTextureFlag::RENDER_TARGET;
        drawable.desc.format = mapRenderFormat(nextDrawable->texture()->pixelFormat());
        if (drawable.mtl) {
            // Release our reference before replacing.
            drawable.mtl->release();
        }
        drawable.mtl = nextDrawable;

        drawable.mtl->retain();

        return true;'''
        new_acq_full = '''        MetalAutoreleasePool releasePool;
        const uint32_t slotIndex = currentAvailableDrawableIndex;
        MetalDrawable &drawable = drawables[slotIndex];
        if (drawable.mtl != nullptr) {
            // Release any previous drawable before asking iOS CAMetalLayer (3-drawable pool) for the next one.
            drawable.mtl->release();
            drawable.mtl = nullptr;
        }

        CA::MetalDrawable *nextDrawable = layer->nextDrawable();
        if (nextDrawable == nullptr) {
            fprintf(stderr, "No more drawables available for rendering.\\n");
            return false;
        }
#if !PLUME_MACOS
        if (nextDrawable->texture() != nullptr) {
            const uint32_t texW = static_cast<uint32_t>(nextDrawable->texture()->width());
            const uint32_t texH = static_cast<uint32_t>(nextDrawable->texture()->height());
            if (texW != width || texH != height) {
                return false;
            }
        }
#endif
        // Signal acquire semaphore only once a valid drawable has been obtained.
        MTL::CommandBuffer *acquireBuffer = commandQueue->mtl->commandBufferWithUnretainedReferences();
        acquireBuffer->setLabel(MTLSTR("Acquire Drawable Command Buffer"));
        const MetalCommandSemaphore *interfaceSemaphore = static_cast<MetalCommandSemaphore *>(signalSemaphore);
        acquireBuffer->enqueue();
        acquireBuffer->encodeSignalEvent(interfaceSemaphore->mtl, interfaceSemaphore->mtlEventValue);
        acquireBuffer->commit();

        // Set the texture index and drawable data, then advance round-robin index safely on render thread
        *textureIndex = slotIndex;
        currentAvailableDrawableIndex = (slotIndex + 1) % MAX_DRAWABLES;
        drawable.desc.width = width;
        drawable.desc.height = height;
        drawable.desc.flags = RenderTextureFlag::RENDER_TARGET;
        drawable.desc.format = mapRenderFormat(nextDrawable->texture()->pixelFormat());
        drawable.mtl = nextDrawable;
        drawable.mtl->retain();

        return true;'''
        assert old_acq_full in msrc, "Failed to locate acquireTexture body in plume_metal.cpp"
        msrc = msrc.replace(old_acq_full, new_acq_full, 1)

        # 2d. Log Metal command buffer errors & GPU fence stalls >5s on iOS
        old_exec_done = '''        if (signalFence != nullptr) {
            interfaceCommandList->mtl->addCompletedHandler([signalFence](MTL::CommandBuffer* cmdBuffer) {
                dispatch_semaphore_signal(static_cast<MetalCommandFence *>(signalFence)->semaphore);
            });
        }'''
        new_exec_done = '''        if (signalFence != nullptr) {
            interfaceCommandList->mtl->addCompletedHandler([signalFence](MTL::CommandBuffer* cmdBuffer) {
#if !PLUME_MACOS
                if (cmdBuffer && cmdBuffer->status() == MTL::CommandBufferStatusError) {
                    const char* errDesc = (cmdBuffer->error() && cmdBuffer->error()->localizedDescription())
                        ? cmdBuffer->error()->localizedDescription()->utf8String() : "unknown GPU command buffer error";
                    MarathonIOS_LogLine("METAL_ERR", errDesc);
                }
#endif
                dispatch_semaphore_signal(static_cast<MetalCommandFence *>(signalFence)->semaphore);
            });
        }'''
        assert old_exec_done in msrc, "Failed to locate executeCommandLists completed handler in plume_metal.cpp"
        msrc = msrc.replace(old_exec_done, new_exec_done, 1)

        old_wait_fence = '''    void MetalCommandQueue::waitForCommandFence(RenderCommandFence *fence) {
        MetalAutoreleasePool releasePool;
        const MetalCommandFence *metalFence = static_cast<MetalCommandFence *>(fence);
        dispatch_semaphore_wait(metalFence->semaphore, DISPATCH_TIME_FOREVER);
    }'''
        new_wait_fence = '''    void MetalCommandQueue::waitForCommandFence(RenderCommandFence *fence) {
        MetalAutoreleasePool releasePool;
        const MetalCommandFence *metalFence = static_cast<MetalCommandFence *>(fence);
#if !PLUME_MACOS
        while (dispatch_semaphore_wait(metalFence->semaphore, dispatch_time(DISPATCH_TIME_NOW, 5LL * NSEC_PER_SEC)) != 0) {
            MarathonIOS_LogLine("METAL_WARN", "waitForCommandFence stalled >5s waiting for GPU completion");
        }
#else
        dispatch_semaphore_wait(metalFence->semaphore, DISPATCH_TIME_FOREVER);
#endif
    }'''
        assert old_wait_fence in msrc, "Failed to locate MetalCommandQueue::waitForCommandFence in plume_metal.cpp"
        msrc = msrc.replace(old_wait_fence, new_wait_fence, 1)

        # 2e. Disable unguarded cross-thread MTLResidencySet on iOS 18+ so Plume uses its thread-safe per-encoder useResource() path
        old_ios_residency = "        const bool supportsResidencySets = osVersion.majorVersion >= 18 && mtl->supportsFamily(MTL::GPUFamilyApple6);"
        new_ios_residency = "        const bool supportsResidencySets = false; // MARATHON_IOS_DISABLE_RESIDENCY_SET: evita commit() non protetti tra thread su iOS 18+"
        assert old_ios_residency in msrc, "Failed to locate iOS supportsResidencySets in plume_metal.cpp"
        msrc = msrc.replace(old_ios_residency, new_ios_residency, 1)

        # 2f. Defensive null-guards for MetalQueryPool, timestampCounterSet, and residencySet on iOS GPUs
        old_qp = '''        MTL::CounterSampleBufferDescriptor *sampleBufferDesc = MTL::CounterSampleBufferDescriptor::alloc()->init();
        sampleBufferDesc->setCounterSet(device->timestampCounterSet);
        sampleBufferDesc->setStorageMode(MTL::StorageModeShared);
        sampleBufferDesc->setSampleCount(queryCount);
        sampleBuffer = device->mtl->newCounterSampleBuffer(sampleBufferDesc, nullptr);
        sampleBufferDesc->release();

        results.resize(queryCount, 0);
    }

    MetalQueryPool::~MetalQueryPool() {
        MetalAutoreleasePool releasePool;
        sampleBuffer->release();
    }

    void MetalQueryPool::queryResults() {
        MetalAutoreleasePool releasePool;
        const NS::Data* data = sampleBuffer->resolveCounterRange(NS::Range(0, results.size()));
        std::memcpy(results.data(), data->mutableBytes(), results.size() * sizeof(uint64_t));
    }'''
        new_qp = '''        if (device->timestampCounterSet != nullptr) {
            MTL::CounterSampleBufferDescriptor *sampleBufferDesc = MTL::CounterSampleBufferDescriptor::alloc()->init();
            sampleBufferDesc->setCounterSet(device->timestampCounterSet);
            sampleBufferDesc->setStorageMode(MTL::StorageModeShared);
            sampleBufferDesc->setSampleCount(queryCount);
            sampleBuffer = device->mtl->newCounterSampleBuffer(sampleBufferDesc, nullptr);
            sampleBufferDesc->release();
        } else {
            sampleBuffer = nullptr;
        }

        results.resize(queryCount, 0);
    }

    MetalQueryPool::~MetalQueryPool() {
        MetalAutoreleasePool releasePool;
        if (sampleBuffer != nullptr) {
            sampleBuffer->release();
        }
    }

    void MetalQueryPool::queryResults() {
        if (sampleBuffer == nullptr) {
            return;
        }
        MetalAutoreleasePool releasePool;
        const NS::Data* data = sampleBuffer->resolveCounterRange(NS::Range(0, results.size()));
        if (data != nullptr && data->mutableBytes() != nullptr) {
            std::memcpy(results.data(), data->mutableBytes(), results.size() * sizeof(uint64_t));
        }
    }'''
        assert old_qp in msrc, "Failed to locate MetalQueryPool in plume_metal.cpp"
        msrc = msrc.replace(old_qp, new_qp, 1)

        old_wt = '''        const MetalQueryPool *interfaceQueryPool = static_cast<const MetalQueryPool *>(queryPool);

        MTL::ComputeCommandEncoder *computeEncoder = activeComputeEncoder != nullptr ? activeComputeEncoder : activeResolveComputeEncoder;'''
        new_wt = '''        const MetalQueryPool *interfaceQueryPool = static_cast<const MetalQueryPool *>(queryPool);
        if (interfaceQueryPool->sampleBuffer == nullptr) {
            return;
        }

        MTL::ComputeCommandEncoder *computeEncoder = activeComputeEncoder != nullptr ? activeComputeEncoder : activeResolveComputeEncoder;'''
        assert old_wt in msrc, "Failed to locate MetalCommandList::writeTimestamp in plume_metal.cpp"
        msrc = msrc.replace(old_wt, new_wt, 1)

        msrc = msrc.replace(
            "    MTL::CounterSet* MetalDevice::findTimestampCounterSet() const {\n        for (uint32_t setIndex = 0; setIndex < mtl->counterSets()->count(); setIndex++){",
            "    MTL::CounterSet* MetalDevice::findTimestampCounterSet() const {\n        if (mtl->counterSets() == nullptr) return nullptr;\n        for (uint32_t setIndex = 0; setIndex < mtl->counterSets()->count(); setIndex++){",
            1
        )
        msrc = msrc.replace(
            "    void MetalDevice::addResource(MTL::Resource *resource, bool addressable) {\n        if (residencySet != nullptr || addressable) {",
            "    void MetalDevice::addResource(MTL::Resource *resource, bool addressable) {\n        if (resource == nullptr) return;\n        if (residencySet != nullptr || addressable) {",
            1
        )
        msrc = msrc.replace(
            "    void MetalDevice::removeResource(MTL::Resource *resource, bool addressable) {\n        if (residencySet != nullptr || addressable) {",
            "    void MetalDevice::removeResource(MTL::Resource *resource, bool addressable) {\n        if (resource == nullptr) return;\n        if (residencySet != nullptr || addressable) {",
            1
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
        print("Patched thirdparty/plume/plume_metal.cpp for iOS Metal (disabled unguarded residencySet, race-free drawables, GPU error logging, queryPool safety).")

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

# 4. MarathonRecomp/ui/game_window.cpp: Fullscreen Landscape Metal SDL flags + UIKit window + live window size sync
if gw_cpp.exists():
    gsrc = gw_cpp.read_text(encoding="utf-8")
    if "SDL_PROP_WINDOW_UIKIT_WINDOW_POINTER" not in gsrc:
        # 4a. Set Landscape orientations & touch-to-mouse hints before SDL_InitSubSystem(SDL_INIT_VIDEO)
        gsrc = gsrc.replace(
            "    if (!SDL_InitSubSystem(SDL_INIT_VIDEO) && sdlVideoDriver)",
            "#if defined(MARATHON_IOS_PORT)\n"
            '    SDL_SetHint(SDL_HINT_ORIENTATIONS, "LandscapeLeft LandscapeRight");\n'
            '    SDL_SetHint(SDL_HINT_TOUCH_MOUSE_EVENTS, "1");\n'
            '    SDL_SetHint(SDL_HINT_MOUSE_TOUCH_EVENTS, "0");\n'
            '    SDL_SetHint(SDL_HINT_IOS_HIDE_HOME_INDICATOR, "2");\n'
            "#endif\n"
            "    if (!SDL_InitSubSystem(SDL_INIT_VIDEO) && sdlVideoDriver)",
            1
        )
        # 4b. UIKit window handle & Metal layer
        gsrc = gsrc.replace(
            "#elif defined(__APPLE__)\n    s_renderWindow.window = SDL_GetPointerProperty(SDL_GetWindowProperties(s_pWindow), SDL_PROP_WINDOW_COCOA_WINDOW_POINTER, nullptr);\n    s_renderWindow.view = SDL_Metal_GetLayer(SDL_Metal_CreateView(s_pWindow));",
            "#elif defined(MARATHON_IOS_PORT)\n    s_renderWindow.window = SDL_GetPointerProperty(SDL_GetWindowProperties(s_pWindow), SDL_PROP_WINDOW_UIKIT_WINDOW_POINTER, nullptr);\n    s_renderWindow.view = SDL_Metal_GetLayer(SDL_Metal_CreateView(s_pWindow));\n#elif defined(__APPLE__)\n    s_renderWindow.window = SDL_GetPointerProperty(SDL_GetWindowProperties(s_pWindow), SDL_PROP_WINDOW_COCOA_WINDOW_POINTER, nullptr);\n    s_renderWindow.view = SDL_Metal_GetLayer(SDL_Metal_CreateView(s_pWindow));",
            1
        )
        # 4c. Sync actual iOS window size & focus right after SDL_ShowWindow
        gsrc = gsrc.replace(
            "    SDL_ShowWindow(s_pWindow);",
            "    SDL_ShowWindow(s_pWindow);\n#if defined(MARATHON_IOS_PORT)\n    SDL_GetWindowSize(s_pWindow, &s_width, &s_height);\n    s_isFocused = true;\n#endif",
            1
        )
        # 4d. Always create fullscreen high-DPI Metal window on iOS (keep flags in scope for subsequent lines)
        gsrc = gsrc.replace(
            "    SDL_WindowFlags flags = SDL_WINDOW_HIDDEN | SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY;",
            "    SDL_WindowFlags flags =\n"
            "#if defined(MARATHON_IOS_PORT)\n"
            "        SDL_WINDOW_FULLSCREEN | SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY | SDL_WINDOW_METAL;\n"
            "    return flags;\n"
            "#else\n"
            "        SDL_WINDOW_HIDDEN | SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY;\n"
            "#endif",
            1
        )
        # 4e. Also handle SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED on iOS rotation
        gsrc = gsrc.replace(
            "        case SDL_EVENT_WINDOW_RESIZED:\n            g_isResizing = true;\n            Config::WindowSize = -1;\n            GameWindow::s_width = event->window.data1;\n            GameWindow::s_height = event->window.data2;",
            "        case SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED:\n        case SDL_EVENT_WINDOW_RESIZED:\n            g_isResizing = true;\n            Config::WindowSize = -1;\n            SDL_GetWindowSize(GameWindow::s_pWindow, &GameWindow::s_width, &GameWindow::s_height);",
            1
        )
        gw_cpp.write_text(gsrc, encoding="utf-8")
        print("Patched MarathonRecomp/ui/game_window.cpp for iOS Fullscreen Landscape Metal + live resize sync.")

# 5. MarathonRecomp/gpu/video.cpp: pure Metal 3 + live ImGui touch coordinate scaling + watchdog heartbeats + MarathonIOS_MapWindowPointToImGui
if vid_cpp.exists():
    vsrc = vid_cpp.read_text(encoding="utf-8")
    if "MARATHON_IOS_NATIVE_METAL" not in vsrc:
        vsrc = (
            "#if defined(MARATHON_IOS_PORT)\n"
            "#include <ios_virtual_controller.h>\n"
            "#endif\n" + vsrc
        )
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
        # Live SDL_GetWindowSize in DrawImGui() + viewport sync on iOS rotation
        old_mouse_scale = '''    uint32_t width = g_swapChain->getWidth();
    uint32_t height = g_swapChain->getHeight();
    float mousePosScaleX = static_cast<float>(width) / static_cast<float>(GameWindow::s_width);
    float mousePosScaleY = static_cast<float>(height) / static_cast<float>(GameWindow::s_height);'''
        new_mouse_scale = '''    uint32_t width = g_swapChain->getWidth();
    uint32_t height = g_swapChain->getHeight();
#if defined(MARATHON_IOS_PORT)
    if (width > 0 && height > 0 && (Video::s_viewportWidth == 0 || Video::s_viewportHeight == 0 ||
        (Config::AspectRatio != EAspectRatio::Original && (Video::s_viewportWidth != width || Video::s_viewportHeight != height))))
    {
        Video::ComputeViewportDimensions();
        io.DisplaySize = { static_cast<float>(Video::s_viewportWidth), static_cast<float>(Video::s_viewportHeight) };
    }
    int liveWinW = GameWindow::s_width;
    int liveWinH = GameWindow::s_height;
    if (GameWindow::s_pWindow != nullptr)
    {
        SDL_GetWindowSize(GameWindow::s_pWindow, &liveWinW, &liveWinH);
        if (liveWinW > 0 && liveWinH > 0)
        {
            GameWindow::s_width = liveWinW;
            GameWindow::s_height = liveWinH;
        }
    }
    float mousePosScaleX = (liveWinW > 0) ? (static_cast<float>(width) / static_cast<float>(liveWinW)) : 1.0f;
    float mousePosScaleY = (liveWinH > 0) ? (static_cast<float>(height) / static_cast<float>(liveWinH)) : 1.0f;
#else
    float mousePosScaleX = static_cast<float>(width) / static_cast<float>(GameWindow::s_width);
    float mousePosScaleY = static_cast<float>(height) / static_cast<float>(GameWindow::s_height);
#endif'''
        assert old_mouse_scale in vsrc, "Failed to locate DrawImGui mousePosScale in gpu/video.cpp"
        vsrc = vsrc.replace(old_mouse_scale, new_mouse_scale, 1)

        # Freeze watchdog heartbeats in Video::Present() & RenderThread ExecuteCommandList
        old_vid_present = '''void Video::Present()
{
    g_readyForCommands = false;

    g_renderQueue.enqueue(RenderCommands::ExecutePendingStretchRectCommands{});

    DrawImGui();

    g_renderQueue.enqueue(RenderCommands::ExecuteCommandList{});

    g_executedCommandList.wait(false);
    g_executedCommandList = false;'''
        new_vid_present = '''void Video::Present()
{
#if defined(MARATHON_IOS_PORT)
    MarathonIOS_Heartbeat("Video::Present:Begin");
#endif
    g_readyForCommands = false;

    g_renderQueue.enqueue(RenderCommands::ExecutePendingStretchRectCommands{});

    DrawImGui();

    g_renderQueue.enqueue(RenderCommands::ExecuteCommandList{});

#if defined(MARATHON_IOS_PORT)
    MarathonIOS_Heartbeat("Video::Present:WaitRender");
#endif
    g_executedCommandList.wait(false);
    g_executedCommandList = false;
#if defined(MARATHON_IOS_PORT)
    MarathonIOS_Heartbeat("Video::Present:SwapPresent");
#endif'''
        assert old_vid_present in vsrc, "Failed to locate Video::Present in gpu/video.cpp"
        vsrc = vsrc.replace(old_vid_present, new_vid_present, 1)

        old_vid_fence = '''    if (g_commandListStates[g_frame])
    {
        g_frameFenceProfiler.Begin();
        g_queue->waitForCommandFence(g_commandFences[g_frame].get());'''
        new_vid_fence = '''    if (g_commandListStates[g_frame])
    {
#if defined(MARATHON_IOS_PORT)
        MarathonIOS_Heartbeat("Video::Present:WaitFence");
#endif
        g_frameFenceProfiler.Begin();
        g_queue->waitForCommandFence(g_commandFences[g_frame].get());'''
        assert old_vid_fence in vsrc, "Failed to locate waitForCommandFence in gpu/video.cpp"
        vsrc = vsrc.replace(old_vid_fence, new_vid_fence, 1)

        vsrc = vsrc.replace(
            "    g_renderQueue.enqueue(RenderCommands::BeginCommandList{});",
            "    g_renderQueue.enqueue(RenderCommands::BeginCommandList{});\n#if defined(MARATHON_IOS_PORT)\n    MarathonIOS_Heartbeat(\"Video::Present:Done\");\n#endif",
            1
        )
        vsrc = vsrc.replace(
            "static void ProcRenderCommand(const RenderCommands::ExecuteCommandList& cmd)\n{",
            "static void ProcRenderCommand(const RenderCommands::ExecuteCommandList& cmd)\n{\n#if defined(MARATHON_IOS_PORT)\n    MarathonIOS_RenderHeartbeat(\"Render:ExecuteCommandList\");\n#endif",
            1
        )

        # Export exact 0-frame-lag touch coordinate mapper for InstallerWizard & MessageWindow
        vsrc += '''
#if defined(MARATHON_IOS_PORT)
extern "C" void MarathonIOS_MapWindowPointToImGui(float winX, float winY, float* outX, float* outY)
{
    if (!outX || !outY) return;
    if (!g_swapChain)
    {
        *outX = winX;
        *outY = winY;
        return;
    }
    int liveWinW = GameWindow::s_width;
    int liveWinH = GameWindow::s_height;
    if (GameWindow::s_pWindow != nullptr)
    {
        SDL_GetWindowSize(GameWindow::s_pWindow, &liveWinW, &liveWinH);
        if (liveWinW > 0 && liveWinH > 0)
        {
            GameWindow::s_width = liveWinW;
            GameWindow::s_height = liveWinH;
        }
    }
    uint32_t width = g_swapChain->getWidth();
    uint32_t height = g_swapChain->getHeight();
    float scaleX = (liveWinW > 0) ? (static_cast<float>(width) / static_cast<float>(liveWinW)) : 1.0f;
    float scaleY = (liveWinH > 0) ? (static_cast<float>(height) / static_cast<float>(liveWinH)) : 1.0f;
    float offsetX = (static_cast<float>(width) - static_cast<float>(Video::s_viewportWidth)) / 2.0f;
    float offsetY = (static_cast<float>(height) - static_cast<float>(Video::s_viewportHeight)) / 2.0f;
    *outX = winX * scaleX - offsetX;
    *outY = winY * scaleY - offsetY;
}
#endif
'''
        vid_cpp.write_text(vsrc, encoding="utf-8")
        print("Patched MarathonRecomp/gpu/video.cpp for pure Metal 3 + watchdog heartbeats + live iOS touch coordinate mapping.")

# 6. SDL_uikitvideo.m: filter external AirPlay/HDMI scenes in UIKit_GetActiveWindowScene (Feather stability)
if sdl_uikit.exists():
    ssrc = sdl_uikit.read_text(encoding="utf-8")
    if "MARATHON_IOS_AIRPLAY_SCENE_FIX" not in ssrc:
        old_scene = '''            if ([scene isKindOfClass:[UIWindowScene class]]) {
                UIWindowScene *windowScene = (UIWindowScene *)scene;
                if (windowScene.activationState == UISceneActivationStateForegroundActive) {'''
        new_scene = '''            /* MARATHON_IOS_AIRPLAY_SCENE_FIX */
            if ([scene isKindOfClass:[UIWindowScene class]]) {
                UIWindowScene *windowScene = (UIWindowScene *)scene;
                if (![windowScene.session.role isEqualToString:UIWindowSceneSessionRoleApplication]) continue;
                if (windowScene.activationState == UISceneActivationStateForegroundActive) {'''
        if old_scene in ssrc:
            ssrc = ssrc.replace(old_scene, new_scene, 1)
            sdl_uikit.write_text(ssrc, encoding="utf-8")
            print("Patched SDL_uikitvideo.m to filter non-application window scenes on iOS.")

# 7. SDL_uikitmetalview.m: initialize Metal view with live UIWindowScene/computed frame & sync superview/window bounds in layoutSubviews
if sdl_metalview.exists():
    mvsrc = sdl_metalview.read_text(encoding="utf-8")
    if "MARATHON_IOS_METALVIEW_LAYOUT_FIX" not in mvsrc:
        assert '#import "SDL_uikitwindow.h"' in mvsrc, "Failed to locate SDL_uikitwindow.h import in SDL_uikitmetalview.m"
        mvsrc = mvsrc.replace(
            '#import "SDL_uikitwindow.h"',
            '#import "SDL_uikitvideo.h"\n#import "SDL_uikitwindow.h"',
            1
        )
        old_layout = '''- (void)layoutSubviews
{
    [super layoutSubviews];
    [self updateDrawableSize];
}'''
        new_layout = '''- (void)layoutSubviews
{
    /* MARATHON_IOS_METALVIEW_LAYOUT_FIX */
    [super layoutSubviews];
#ifndef SDL_PLATFORM_VISIONOS
    if (@available(iOS 13.0, tvOS 13.0, *)) {
        UIWindow *win = self.window;
        UIWindowScene *scene = win ? win.windowScene : nil;
        if (scene) {
            CGRect sceneBounds = scene.coordinateSpace.bounds;
            if (sceneBounds.size.width > 0 && sceneBounds.size.height > 0 &&
                !CGRectEqualToRect(win.frame, sceneBounds)) {
                win.frame = sceneBounds;
            }
        }
    }
    if (self.superview && CGAffineTransformIsIdentity(self.transform)) {
        CGRect superBounds = self.superview.bounds;
        if (superBounds.size.width > 0 && superBounds.size.height > 0 &&
            !CGRectEqualToRect(self.frame, superBounds)) {
            self.frame = superBounds;
        }
    }
#endif
    [self updateDrawableSize];
}'''
        assert old_layout in mvsrc, "Failed to locate layoutSubviews in SDL_uikitmetalview.m"
        mvsrc = mvsrc.replace(old_layout, new_layout, 1)

        old_init = '''        metalview = [[SDL_uikitmetalview alloc] initWithFrame:data.uiwindow.bounds
                                                        scale:scale];'''
        new_init = '''        CGRect viewFrame = data.uiwindow.bounds;
#ifndef SDL_PLATFORM_VISIONOS
        if (@available(iOS 13.0, tvOS 13.0, *)) {
            UIWindowScene *scene = data.uiwindow.windowScene;
            if (scene && scene.coordinateSpace.bounds.size.width > 0 && scene.coordinateSpace.bounds.size.height > 0) {
                viewFrame = scene.coordinateSpace.bounds;
                if (!CGRectEqualToRect(data.uiwindow.frame, viewFrame)) {
                    data.uiwindow.frame = viewFrame;
                }
            }
        }
        if (viewFrame.size.width <= 0 || viewFrame.size.height <= 0) {
            viewFrame = UIKit_ComputeViewFrame(window, data.uiwindow.screen);
        }
#endif
        metalview = [[SDL_uikitmetalview alloc] initWithFrame:viewFrame
                                                        scale:scale];'''
        assert old_init in mvsrc, "Failed to locate initWithFrame in SDL_uikitmetalview.m"
        mvsrc = mvsrc.replace(old_init, new_init, 1)
        sdl_metalview.write_text(mvsrc, encoding="utf-8")
        print("Patched SDL_uikitmetalview.m for LiveContainer scene-aligned frame + layoutSubviews sync.")

# 8. SDL_uikitwindow.m: actively request iOS 16+ Landscape geometry update + sync UIWindow.frame in UIKit_ShowWindow
if sdl_window.exists():
    wsrc = sdl_window.read_text(encoding="utf-8")
    if "MARATHON_IOS_WINDOW_ROTATION_FIX" not in wsrc:
        old_show = '''void UIKit_ShowWindow(SDL_VideoDevice *_this, SDL_Window *window)
{
    @autoreleasepool {
        SDL_UIKitWindowData *data = (__bridge SDL_UIKitWindowData *)window->internal;
        [data.uiwindow makeKeyAndVisible];'''
        new_show = '''void UIKit_ShowWindow(SDL_VideoDevice *_this, SDL_Window *window)
{
    @autoreleasepool {
        /* MARATHON_IOS_WINDOW_ROTATION_FIX */
        SDL_UIKitWindowData *data = (__bridge SDL_UIKitWindowData *)window->internal;
        [data.uiwindow makeKeyAndVisible];
#if !defined(SDL_PLATFORM_TVOS) && !defined(SDL_PLATFORM_VISIONOS)
        if (@available(iOS 16.0, *)) {
            [data.viewcontroller setNeedsUpdateOfSupportedInterfaceOrientations];
            UIWindowScene *scene = data.uiwindow.windowScene;
            if (scene) {
                NSUInteger orients = UIKit_GetSupportedOrientations(window);
                BOOL supportsLandscape = (orients & UIInterfaceOrientationMaskLandscape) != 0;
                BOOL supportsPortrait = (orients & (UIInterfaceOrientationMaskPortrait | UIInterfaceOrientationMaskPortraitUpsideDown)) != 0;
                if (supportsLandscape && !supportsPortrait) {
                    UIWindowSceneGeometryPreferencesIOS *prefs =
                        [[UIWindowSceneGeometryPreferencesIOS alloc] initWithInterfaceOrientations:UIInterfaceOrientationMaskLandscape];
                    [scene requestGeometryUpdateWithPreferences:prefs errorHandler:^(NSError *error) {
                        (void)error;
                    }];
                }
            }
        }
        if (@available(iOS 13.0, *)) {
            UIWindowScene *scene = data.uiwindow.windowScene;
            if (scene) {
                CGRect sceneBounds = scene.coordinateSpace.bounds;
                if (sceneBounds.size.width > 0 && sceneBounds.size.height > 0 &&
                    !CGRectEqualToRect(data.uiwindow.frame, sceneBounds)) {
                    data.uiwindow.frame = sceneBounds;
                }
            }
        }
        [data.uiwindow setNeedsLayout];
        [data.uiwindow layoutIfNeeded];
#endif'''
        assert old_show in wsrc, "Failed to locate UIKit_ShowWindow in SDL_uikitwindow.m"
        wsrc = wsrc.replace(old_show, new_show, 1)
        sdl_window.write_text(wsrc, encoding="utf-8")
        print("Patched SDL_uikitwindow.m with iOS 16+ Landscape geometry request + UIWindow frame sync.")
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
    # 3b. First elseif (APPLE): OS sources (abilita -fobjc-arc su tutti i .mm iOS per prevenire crash MRC al primo avvio!)
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
        '    set_source_files_properties(${MARATHON_RECOMP_OS_CXX_SOURCES} PROPERTIES\n'
        '        SKIP_PRECOMPILE_HEADERS ON\n'
        '        COMPILE_OPTIONS "-fobjc-arc"\n'
        '    )\n'
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

# 6. main.cpp: include <SDL3/SDL_main.h> + writable Documents/MarathonRecomp cwd on iOS (fixes Feather read-only bundle!) + attach touch gamepad on game start
if main_cpp.exists():
    msrc = main_cpp.read_text(encoding="utf-8")
    if "SDL3/SDL_main.h" not in msrc:
        msrc = (
            "#if defined(MARATHON_IOS_PORT)\n"
            "#include <SDL3/SDL_main.h>\n"
            "#include <ios_virtual_controller.h>\n"
            "#endif\n" + msrc
        )
        msrc = msrc.replace(
            "std::filesystem::current_path(os::process::GetExecutablePath().parent_path(), ec);",
            "#if defined(MARATHON_IOS_PORT)\n"
            "        std::filesystem::current_path(os::process::GetWorkingDirectory(), ec);\n"
            "#else\n"
            "        std::filesystem::current_path(os::process::GetExecutablePath().parent_path(), ec);\n"
            "#endif",
            1
        )
        msrc = msrc.replace(
            "    if (timeDifferenceSeconds > TimeBetweenUpdateChecksInSeconds)\n"
            "    {\n"
            "        UpdateChecker::initialize();\n"
            "        UpdateChecker::start();\n"
            "        Config::LastChecked = timeNow;\n"
            "        Config::Save();\n"
            "    }",
            "#if !defined(MARATHON_IOS_PORT)\n"
            "    if (timeDifferenceSeconds > TimeBetweenUpdateChecksInSeconds)\n"
            "    {\n"
            "        UpdateChecker::initialize();\n"
            "        UpdateChecker::start();\n"
            "        Config::LastChecked = timeNow;\n"
            "        Config::Save();\n"
            "    }\n"
            "#else\n"
            "    // MARATHON_IOS_SKIP_DESKTOP_UPDATE_CHECK: evita il thread UpdateChecker desktop al primo avvio su LiveContainer\n"
            "    (void)timeDifferenceSeconds;\n"
            "    (void)timeNow;\n"
            "#endif",
            1
        )
        msrc = msrc.replace(
            "    KiSystemStartup();",
            "#if defined(MARATHON_IOS_PORT)\n"
            "    MarathonIOS_LogLine(\"BOOT\", \"Starting KiSystemStartup()...\");\n"
            "#endif\n"
            "    KiSystemStartup();",
            1
        )
        msrc = msrc.replace(
            "GuestThread::Start({ entry, 0, 0 });",
            "#if defined(MARATHON_IOS_PORT)\n"
            "    MarathonIOS_LogLine(\"BOOT\", \"Attaching Sonic '06 virtual controller and starting GuestThread...\");\n"
            "    MarathonIOS_AttachVirtualController(nullptr);\n"
            "#endif\n"
            "    GuestThread::Start({ entry, 0, 0 });",
            1
        )
        main_cpp.write_text(msrc, encoding="utf-8")
        print("Patched main.cpp: SDL3/SDL_main.h, writable iOS cwd, skip desktop UpdateChecker on first launch, boot diagnostics, and virtual controller attach.")
PY_CMAKE

echo "==> Patch iOS Clean-Room applicata con successo!"
