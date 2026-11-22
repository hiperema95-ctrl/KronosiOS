// Clean-room Soleanna Xbox 360 Virtual Controller & CoreHaptics bridge for iOS
#pragma once

#include <cstdint>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct MarathonTouchGamepadState {
    uint32_t buttons;     // XINPUT_GAMEPAD_* bitmask
    uint8_t leftTrigger;  // 0..255
    uint8_t rightTrigger; // 0..255
    int16_t thumbLX;      // -32768..32767
    int16_t thumbLY;      // -32768..32767
    int16_t thumbRX;      // -32768..32767
    int16_t thumbRY;      // -32768..32767
} MarathonTouchGamepadState;

void MarathonIOS_AttachVirtualController(void* sdlWindowPtr);
void MarathonIOS_SetVirtualControllerVisible(bool visible);
void MarathonIOS_GetVirtualControllerState(MarathonTouchGamepadState* outState);
void MarathonIOS_TriggerHapticRumble(uint16_t lowFreqMotor, uint16_t highFreqMotor);

#ifdef __cplusplus
}
#endif
