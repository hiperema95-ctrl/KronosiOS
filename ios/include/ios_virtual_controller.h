// Clean-room Sonic '06 Action-Gauge Virtual Controller, Lifecycle, Hardware Auto-Config & Diagnostics bridge for iOS
#pragma once

#include <cstdint>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum MarathonIOSCharacterTheme {
    MARATHON_THEME_SONIC  = 0, // Electric Cobalt Blue & Crisp White
    MARATHON_THEME_SHADOW = 1, // Chaos Crimson Red & Obsidian Black
    MARATHON_THEME_SILVER = 2  // Psychokinetic Pure White & Bright Cyan
} MarathonIOSCharacterTheme;

typedef struct MarathonTouchGamepadState {
    uint32_t buttons;     // XAMINPUT_GAMEPAD_* bitmask
    uint8_t leftTrigger;  // 0..255
    uint8_t rightTrigger; // 0..255
    int16_t thumbLX;      // -32768..32767
    int16_t thumbLY;      // -32768..32767
    int16_t thumbRX;      // -32768..32767
    int16_t thumbRY;      // -32768..32767
} MarathonTouchGamepadState;

typedef struct MarathonIOSHardwareProfile {
    int tier;                  // 0 = Compact (<=4GB), 1 = Mid (6GB), 2 = Flagship (>=8GB)
    int maxRefreshHz;          // 60 or 120 (ProMotion)
    int recommendedFps;        // 30 or 60 (thermal-friendly default; 30/60/120 selectable in Video Options)
    float screenScale;         // Native Retina scale (e.g. 2.0 or 3.0)
    float recommendedResScale; // Optimal mobile ResolutionScale for crisp visuals + low heat
    int recommendedAA;         // 0 = Off, 1 = MSAA2x
    int recommendedShadowRes;  // 0 = x512, 1 = x1024
    int recommendedReflection; // 0 = Eighth, 1 = Quarter
    int recommendedRadialBlur; // 0 = Off, 1 = Original
    int recommendedAF;         // 2 or 4
    uint32_t ramMiB;           // Total physical RAM in MiB
    bool isPad;                // True on iPad
} MarathonIOSHardwareProfile;

void MarathonIOS_AttachVirtualController(void* sdlWindowPtr);
void MarathonIOS_SetVirtualControllerVisible(bool visible);
void MarathonIOS_SetCharacterTheme(int theme);
void MarathonIOS_GetVirtualControllerState(MarathonTouchGamepadState* outState);
void MarathonIOS_TriggerHapticRumble(uint16_t lowFreqMotor, uint16_t highFreqMotor);
void MarathonIOS_ResetVirtualControllerInputs(void);
void MarathonIOS_GetFPSOverlayAnchorPoints(float* outWinX, float* outWinY);

// On-device diagnostics, lifecycle pause/resume, ProMotion FPS pacing & hardware auto-config (ios/os/ios_platform.mm)
void MarathonIOS_LogLine(const char* tag, const char* msg);
void MarathonIOS_Heartbeat(const char* phase);
void MarathonIOS_RenderHeartbeat(const char* phase);
bool MarathonIOS_IsAppSuspended(void);
void MarathonIOS_SetAppSuspended(bool suspended);
void MarathonIOS_WaitUntilActive(void);
void MarathonIOS_SetTargetFPS(int fps);
int MarathonIOS_GetTargetFPS(void);
void MarathonIOS_GetHardwareProfile(MarathonIOSHardwareProfile* outProfile);

#ifdef __cplusplus
}
#endif
