// Native Apple MetalFX Upscaling (MTLFXTemporalScaler / MTLFXSpatialScaler)
// + Native MetalFX Frame Interpolation (MTLFXFrameInterpolator, iOS 26+ with safe fallback)
// + Dedicated MTLSharedEvent ProMotion 120Hz Frame Pacer for iPhone 16 Pro (A18 Pro)
#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// MetalFX upscaling mode (mirrors Config::MetalFXUpscaling / EMetalFXUpscaling)
enum MarathonIOSMetalFXUpscaleMode {
    MARATHON_IOS_MFX_OFF = 0,       // Native bypass (direct gamma pass)
    MARATHON_IOS_MFX_TEMPORAL = 1,  // Apple MTLFXTemporalScaler (falls back to Spatial if unsupported)
    MARATHON_IOS_MFX_SPATIAL = 2    // Apple MTLFXSpatialScaler
};

// MetalFX Frame Generation toggle (mirrors Config::FrameGeneration / EFrameGeneration)
enum MarathonIOSFrameGenMode {
    MARATHON_IOS_FG_OFF = 0,        // Native base frames only
    MARATHON_IOS_FG_ON_2X = 1       // Native Apple MTLFXFrameInterpolator 2x (baseFpsLimit -> 2x output)
};

// Runtime configuration struct exposed to in-game Video Options & C++ callers
typedef struct MarathonIOSMetalFXConfig {
    bool upscalingEnabled;          // True when MTLFXTemporalScaler or MTLFXSpatialScaler is active
    int upscaleMode;                // MarathonIOSMetalFXUpscaleMode
    float renderScale;              // Internal 3D scene scale: 0.50 .. 1.00 (default 0.75)
    bool frameGenEnabled;           // Native Apple MTLFXFrameInterpolator 2x toggle
    int baseFpsLimit;               // Base engine render cap: 60 FPS (output 120 FPS with 2x FrameGen)
    float outputResolutionScale;    // Output swapchain scale relative to native display: 0.75 .. 1.00
} MarathonIOSMetalFXConfig;

// Per-frame input packet passed from MarathonRecomp/gpu/video.cpp (ExecuteCommandList)
// BEFORE Plume ends the frame command buffer, keeping CAMetalLayer.framebufferOnly = YES (AFBC enabled!)
typedef struct MarathonIOSMetalFXFrameInput {
    void* commandQueueMtl;          // id<MTLCommandQueue>
    void* metalLayerPtr;            // CAMetalLayer*
    void* commandBufferMtl;         // id<MTLCommandBuffer> (Plume frame command buffer, encoders flushed)
    void* sceneColorTexMtl;         // id<MTLTexture> (g_intermediaryBackBufferTexture, pure 3D scene, NO ImGui)
    void* depthTexMtl;              // id<MTLTexture> (g_depthStencil Depth32Float_Stencil8, optional)
    void* uiOverlayTexMtl;          // id<MTLTexture> (g_iosUiOverlayTexture premultiplied RGBA, optional)
    void* drawableTexMtl;           // id<MTLTexture> (CAMetalDrawable.texture, framebufferOnly = YES)
    uint32_t internalWidth;         // Internal 3D render resolution width (RenderResolution::GetInternalSize())
    uint32_t internalHeight;        // Internal 3D render resolution height
    uint32_t outputWidth;           // Swapchain drawable width
    uint32_t outputHeight;          // Swapchain drawable height
    int32_t viewportOffsetX;        // Letterbox / aspect-ratio viewport X offset on drawable
    int32_t viewportOffsetY;        // Letterbox / aspect-ratio viewport Y offset on drawable
    uint32_t viewportWidth;         // Active viewport width on drawable
    uint32_t viewportHeight;        // Active viewport height on drawable
    float gamma;                    // Config::Brightness inverse gamma value
    float deltaTimeSec;             // Frame delta time in seconds
    bool isLoading;                 // True on loading screens / transitions -> forces MetalFX reset = YES
    bool hasValidCameraMatrices;    // Optional: true if currViewProj & prevViewProj are populated
    bool cameraJitterApplied;       // True only if guest projection matrix was jittered with Halton offset
    float jitterOffsetX;            // Exact sub-pixel Halton X offset applied to projection (0 if unjittered)
    float jitterOffsetY;            // Exact sub-pixel Halton Y offset applied to projection (0 if unjittered)
    float currViewProj[16];         // Optional current frame column-major View-Projection matrix
    float prevViewProj[16];         // Optional previous frame column-major View-Projection matrix
} MarathonIOSMetalFXFrameInput;

// Runtime configuration setters & getters
void MarathonIOS_MetalFXGetConfig(MarathonIOSMetalFXConfig* outConfig);
void MarathonIOS_MetalFXSetConfig(const MarathonIOSMetalFXConfig* inConfig);

void MarathonIOS_SetUpscaleMode(int mode);
int MarathonIOS_GetUpscaleMode(void);

void MarathonIOS_SetRenderScale(float scale);
float MarathonIOS_GetRenderScale(void);

void MarathonIOS_SetFrameGenMode(int mode);
int MarathonIOS_GetFrameGenMode(void);

void MarathonIOS_SetBaseFpsLimit(int fps);
int MarathonIOS_GetBaseFpsLimit(void);

void MarathonIOS_SetOutputResolutionScale(float scale);
float MarathonIOS_GetOutputResolutionScale(void);
double MarathonIOS_GetEffectiveContentScale(double nativeScale);

// Active pipeline state & capability queries
bool MarathonIOS_IsMetalFXActive(void);
bool MarathonIOS_MetalFXOwnsPresentation(void);
bool MarathonIOS_IsFrameGenSupported(void);
bool MarathonIOS_IsFrameGenRuntimeActive(void);
const char* MarathonIOS_GetActiveBackendTag(void);

// Thermal-aware base engine FPS (60) and output display FPS (120); returns 0 when FrameGen is inactive.
int MarathonIOS_GetFrameGenBaseFPS(void);
int MarathonIOS_GetFrameGenOutputFPS(void);
int MarathonIOS_GetFrameGenMultiplier(void);

// Halton (2, 3) 16-sample sub-pixel jitter sequence in [-0.5, +0.5] pixels
void MarathonIOS_GetHaltonJitter(uint64_t frameIndex, float* outX, float* outY);

// Main MetalFX entry point encoded directly into Plume's frame command buffer (zero per-frame allocations!)
// Returns true if MetalFX encoded the upscale / interpolation / UI composite onto drawableTexMtl.
bool MarathonIOS_MetalFXEncodeFrame(const MarathonIOSMetalFXFrameInput* input);

// ProMotion VSync timestamp phase notification from CADisplayLink (zero Metal calls on main thread!)
void MarathonIOS_OnProMotionVSync(double timestampSec, double targetTimestampSec);

// Display presentation FPS telemetry for top-left ShowFPS overlay
void MarathonIOS_LosslessRecordPresentedFrame(void);
double MarathonIOS_GetMeasuredOutputFPS(void);

// Dedicated ios_perf.log 1Hz performance & FrameGen diagnostic telemetry (zero render-thread file I/O)
void MarathonIOS_PerfLogEvent(const char* tag, const char* msg);
void MarathonIOS_PerfRecordBaseFrame(double frameMs, double paceSleepMs, double acquireMs, double encodeMs,
                                     uint32_t swapW, uint32_t swapH, uint32_t vpW, uint32_t vpH,
                                     uint32_t intW, uint32_t intH, int cfgFps, int targetBaseFps,
                                     float resScale, bool vsync);
void MarathonIOS_PerfRecordPlumePresent(void);
void MarathonIOS_PerfRecordPlumeGpuMs(double gpuMs);
void MarathonIOS_PerfRecordWaitFenceMs(double waitMs);
void MarathonIOS_PerfLogTick1Hz(void);

// Lifecycle & config notifications
void MarathonIOS_LosslessOnSuspendChanged(bool suspended);
void MarathonIOS_NotifyFrameGenChanged(void);

#ifdef __cplusplus
}
#endif
