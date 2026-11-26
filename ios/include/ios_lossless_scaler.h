// Native iOS Metal Lossless Scaling Engine (Spatial RCAS Upscaling + Optical-Flow 2x/3x Frame Generation)
// Designed for Apple Silicon ProMotion 120Hz OLED displays (iPhone 15 Pro / 16 Pro / M-series iPad)
#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Mirrors Config::LosslessUpscaling (ELosslessUpscaling)
enum MarathonIOSUpscaleMode {
    MARATHON_IOS_UPSCALE_OFF = 0,         // Manual ResolutionScale, no RCAS sharpening
    MARATHON_IOS_UPSCALE_QUALITY = 1,     // 0.75x internal resolution + subtle RCAS (0.45)
    MARATHON_IOS_UPSCALE_BALANCED = 2,    // 0.65x internal resolution + crisp RCAS (0.65)
    MARATHON_IOS_UPSCALE_PERFORMANCE = 3  // 0.55x internal resolution + strong RCAS (0.80)
};

// Mirrors Config::FrameGeneration (EFrameGeneration)
enum MarathonIOSFrameGenMode {
    MARATHON_IOS_FG_OFF = 0,       // Native frames only (no optical-flow generation)
    MARATHON_IOS_FG_X2_120 = 1,    // 60 FPS engine -> 120 FPS output (2x, lowest latency)
    MARATHON_IOS_FG_X3_120 = 2,    // 40 FPS engine -> 120 FPS output (3x, ~67% less engine heat)
    MARATHON_IOS_FG_X2_ECO60 = 3   // 30 FPS engine -> 60 FPS output  (2x Eco, max battery life)
};

void MarathonIOS_SetUpscaleMode(int mode);
int MarathonIOS_GetUpscaleMode(void);
float MarathonIOS_GetUpscaleResolutionScale(int mode);

void MarathonIOS_SetFrameGenMode(int mode);
int MarathonIOS_GetFrameGenMode(void);

// Thermal-aware base engine FPS (60/40/30) and output display FPS (120/60); returns 0 when Frame Generation is Off.
int MarathonIOS_GetFrameGenBaseFPS(void);
int MarathonIOS_GetFrameGenOutputFPS(void);
int MarathonIOS_GetFrameGenMultiplier(void);

// True when RCAS or Frame Generation needs to read CAMetalLayer drawables (switches framebufferOnly = NO).
bool MarathonIOS_NeedsReadableDrawable(void);

// Invoked inside Plume MetalSwapChain::present() right after waitSemaphores are encoded into presentBuffer.
// Returns true if Lossless Scaling encoded the blit / optical-flow / RCAS render pass into presentBuffer.
bool MarathonIOS_LosslessPresentFrame(void* commandQueueMtl,
                                      void* metalLayerPtr,
                                      void* presentCmdBufferMtl,
                                      void* drawableMtl);

// Invoked by MarathonProMotionDriver CADisplayLink on exact 120Hz/60Hz VSync ticks to present queued sub-frames.
void MarathonIOS_LosslessOnDisplayLinkTick(double timestampSec);

// Records display presentation timestamps so ShowFPS can display actual output FPS (e.g. "60/120 2x").
void MarathonIOS_LosslessRecordPresentedFrame(void);
double MarathonIOS_GetMeasuredOutputFPS(void);

// Immediately drains pending sub-frames when entering background so zero Metal work is submitted while suspended.
void MarathonIOS_LosslessOnSuspendChanged(bool suspended);

// Re-syncs ProMotion LTPO CADisplayLink refresh rate when Frame Generation mode changes.
void MarathonIOS_NotifyFrameGenChanged(void);

#ifdef __cplusplus
}
#endif
