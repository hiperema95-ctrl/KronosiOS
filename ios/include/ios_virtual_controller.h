// Clean-room Sonic '06 Action-Gauge Virtual Controller, CoreHaptics & Diagnostics bridge for iOS
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

void MarathonIOS_AttachVirtualController(void* sdlWindowPtr);
void MarathonIOS_SetVirtualControllerVisible(bool visible);
void MarathonIOS_SetCharacterTheme(int theme);
void MarathonIOS_GetVirtualControllerState(MarathonTouchGamepadState* outState);
void MarathonIOS_TriggerHapticRumble(uint16_t lowFreqMotor, uint16_t highFreqMotor);

// On-device diagnostics & freeze watchdog (implemented in ios/os/ios_platform.mm)
void MarathonIOS_LogLine(const char* tag, const char* msg);
void MarathonIOS_Heartbeat(const char* phase);
void MarathonIOS_RenderHeartbeat(const char* phase);

#ifdef __cplusplus
}
#endif
