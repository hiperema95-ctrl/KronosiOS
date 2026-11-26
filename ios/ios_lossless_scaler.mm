// Native iOS Metal Lossless Scaling Engine for MarathonRecomp v1.0.0
// Pure Metal.framework runtime-compiled MSL shaders (zero external framework risk on Feather/LiveContainer):
//   1) ls_luma_downsample4x : 4x anti-aliased BT.709 luma downsample (BGRA8 -> R8Unorm)
//   2) ls_optical_flow      : 2-stage coarse-to-fine 3x3 SAD block matching (±32px full-res)
//                             with static-HUD zero-motion bias & scene-cut rejection
//   3) ls_flow_smooth       : 3x3 outlier-trimmed spatial flow smoothing (RG16Float)
//   4) ls_present_vs / fs   : Bidirectional motion-compensated frame interpolation +
//                             occlusion-confidence guard + 5-tap anti-ringing RCAS sharpening
//
// Temporal presentation architecture (zero GPU read/write hazards, zero drawable starvation):
//   - 3-slot MTLStorageModePrivate ring buffer on the SAME MTLCommandQueue as Plume
//   - 2x (60 -> 120 FPS): Engine presents interp(t=0.5)+RCAS immediately, CADisplayLink presents real(t=1.0)+RCAS 8.33ms later
//   - 3x (40 -> 120 FPS): Engine presents interp(t=0.333)+RCAS immediately, CADisplayLink presents t=0.667 & t=1.0 at +8.33ms/+16.67ms
//   - 2x Eco (30 -> 60):  Engine presents interp(t=0.5)+RCAS immediately, CADisplayLink presents t=1.0 16.67ms later
//   - Thermal Guardian synergy: X2_120 seamlessly shifts 60x2 -> 40x3 under Serious heat (stays 120 FPS!),
//     and 30x2 under Critical heat, automatically restoring 60x2 once cooled.

#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#import <QuartzCore/CAMetalLayer.h>
#import <os/lock.h>
#include <time.h>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstring>

#include <ios_lossless_scaler.h>
#include <ios_virtual_controller.h>

namespace {

struct LSFlowParams {
    uint32_t lumaWidth;
    uint32_t lumaHeight;
    uint32_t flowWidth;
    uint32_t flowHeight;
};

struct LSPresentParams {
    float alpha;
    float rcasSharpness;
    float invTexW;
    float invTexH;
};

struct PendingSubFrame {
    uint32_t prevSlot;
    uint32_t currSlot;
    uint32_t flowSlot;
    float alpha;
    float rcasSharpness;
    double dueAfterSec;
};

static const char * const kLosslessScalerMSL = R"MSL(
#include <metal_stdlib>
using namespace metal;

struct LSFlowParams {
    uint lumaWidth;
    uint lumaHeight;
    uint flowWidth;
    uint flowHeight;
};

struct LSPresentParams {
    float alpha;
    float rcasSharpness;
    float invTexW;
    float invTexH;
};

struct LSVSOut {
    float4 position [[position]];
    float2 uv;
};

// 1. 4x4 anti-aliased BT.709 luma downsample via 4 bilinear taps
kernel void ls_luma_downsample4x(
    texture2d<half, access::sample> srcTex [[texture(0)]],
    texture2d<half, access::write>  dstLuma [[texture(1)]],
    constant LSFlowParams& params [[buffer(0)]],
    uint2 gid [[thread_position_in_grid]])
{
    if (gid.x >= params.lumaWidth || gid.y >= params.lumaHeight) {
        return;
    }
    constexpr sampler linSamp(coord::normalized, address::clamp_to_edge, filter::linear);
    float2 invLuma = float2(1.0f / float(params.lumaWidth), 1.0f / float(params.lumaHeight));
    float2 center = (float2(gid) + 0.5f) * invLuma;
    float2 off = 0.25f * invLuma;

    half3 c0 = srcTex.sample(linSamp, center + float2(-off.x, -off.y)).rgb;
    half3 c1 = srcTex.sample(linSamp, center + float2( off.x, -off.y)).rgb;
    half3 c2 = srcTex.sample(linSamp, center + float2(-off.x,  off.y)).rgb;
    half3 c3 = srcTex.sample(linSamp, center + float2( off.x,  off.y)).rgb;
    half3 avg = (c0 + c1 + c2 + c3) * 0.25h;
    half luma = dot(avg, half3(0.2126h, 0.7152h, 0.0722h));
    dstLuma.write(half4(luma, 0.0h, 0.0h, 1.0h), gid);
}

inline float evalBlockSAD(
    texture2d<half, access::sample> prevLuma,
    texture2d<half, access::sample> currLuma,
    sampler samp,
    float2 baseUv,
    float2 shiftUv,
    float2 stepUv)
{
    float sad = 0.0f;
    for (int dy = -1; dy <= 1; ++dy) {
        for (int dx = -1; dx <= 1; ++dx) {
            float2 o = float2(float(dx), float(dy)) * stepUv;
            float p = float(prevLuma.sample(samp, baseUv + o).r);
            float c = float(currLuma.sample(samp, baseUv + shiftUv + o).r);
            sad += fabs(p - c);
        }
    }
    return sad * (1.0f / 9.0f);
}

// 2. 2-stage coarse-to-fine 3x3 SAD optical flow (±8 quarter-res px = ±32 full-res px for high-speed Sonic)
kernel void ls_optical_flow(
    texture2d<half, access::sample> prevLuma [[texture(0)]],
    texture2d<half, access::sample> currLuma [[texture(1)]],
    texture2d<half, access::write>  dstFlow [[texture(2)]],
    constant LSFlowParams& params [[buffer(0)]],
    uint2 gid [[thread_position_in_grid]])
{
    if (gid.x >= params.flowWidth || gid.y >= params.flowHeight) {
        return;
    }
    constexpr sampler linSamp(coord::normalized, address::clamp_to_edge, filter::linear);
    float2 invLuma = float2(1.0f / float(params.lumaWidth), 1.0f / float(params.lumaHeight));
    float2 invFlow = float2(1.0f / float(params.flowWidth), 1.0f / float(params.flowHeight));
    float2 baseUv = (float2(gid) + 0.5f) * invFlow;

    float zeroSad = evalBlockSAD(prevLuma, currLuma, linSamp, baseUv, float2(0.0f), invLuma);
    float bestSad = zeroSad;
    int2 bestCoarse = int2(0, 0);

    // Early out for completely static pixels (HUD, pause menus, skybox)
    if (zeroSad > 0.008f) {
        // Stage 1: coarse search (step = 2, range [-6, +6])
        for (int sy = -6; sy <= 6; sy += 2) {
            for (int sx = -6; sx <= 6; sx += 2) {
                if (sx == 0 && sy == 0) continue;
                float2 shift = float2(float(sx), float(sy)) * invLuma;
                float s = evalBlockSAD(prevLuma, currLuma, linSamp, baseUv, shift, invLuma);
                // Mild distance regularization suppresses false matches in flat textures
                float reg = (abs(sx) + abs(sy)) * 0.0008f;
                if (s + reg < bestSad) {
                    bestSad = s + reg;
                    bestCoarse = int2(sx, sy);
                }
            }
        }

        // Stage 2: fine search (step = 1, ±2 around best coarse -> total ±8 quarter-res = ±32 full-res px)
        int2 bestFine = bestCoarse;
        float fineSad = bestSad;
        for (int dy = -2; dy <= 2; ++dy) {
            for (int dx = -2; dx <= 2; ++dx) {
                if (dx == 0 && dy == 0) continue;
                int2 cand = clamp(bestCoarse + int2(dx, dy), int2(-8), int2(8));
                float2 shift = float2(float(cand.x), float(cand.y)) * invLuma;
                float s = evalBlockSAD(prevLuma, currLuma, linSamp, baseUv, shift, invLuma);
                float reg = (abs(cand.x) + abs(cand.y)) * 0.0006f;
                if (s + reg < fineSad) {
                    fineSad = s + reg;
                    bestFine = cand;
                }
            }
        }
        bestCoarse = bestFine;
        bestSad = fineSad;
    }

    // Static-HUD zero-motion bias + scene-cut rejection
    float2 mv = float2(0.0f);
    if (zeroSad > bestSad * 1.15f + 0.015f && bestSad < 0.42f) {
        mv = float2(float(bestCoarse.x), float(bestCoarse.y)) * invLuma;
    }
    dstFlow.write(half4(half(mv.x), half(mv.y), 0.0h, 1.0h), gid);
}

// 3. 3x3 outlier-trimmed spatial flow smoother (removes blockiness while keeping HUD edges static)
kernel void ls_flow_smooth(
    texture2d<half, access::read>  srcFlow [[texture(0)]],
    texture2d<half, access::write> dstFlow [[texture(1)]],
    constant LSFlowParams& params [[buffer(0)]],
    uint2 gid [[thread_position_in_grid]])
{
    if (gid.x >= params.flowWidth || gid.y >= params.flowHeight) {
        return;
    }
    int2 maxCoord = int2(int(params.flowWidth) - 1, int(params.flowHeight) - 1);
    float2 center = float2(srcFlow.read(gid).rg);
    float2 accum = center * 2.0f;
    float weightSum = 2.0f;
    int zeroNeighbors = 0;

    for (int dy = -1; dy <= 1; ++dy) {
        for (int dx = -1; dx <= 1; ++dx) {
            if (dx == 0 && dy == 0) continue;
            int2 p = clamp(int2(gid) + int2(dx, dy), int2(0), maxCoord);
            float2 n = float2(srcFlow.read(uint2(p)).rg);
            if (dot(n, n) < 1e-7f) {
                zeroNeighbors++;
            }
            float dist = length(n - center);
            float w = 1.0f / (1.0f + dist * 40.0f);
            accum += n * w;
            weightSum += w;
        }
    }

    float2 smoothed = accum / weightSum;
    if (dot(center, center) < 1e-7f && zeroNeighbors >= 4) {
        smoothed = float2(0.0f);
    }
    dstFlow.write(half4(half(smoothed.x), half(smoothed.y), 0.0h, 1.0h), gid);
}

// 4. Fullscreen triangle vertex shader
vertex LSVSOut ls_present_vs(uint vid [[vertex_id]]) {
    LSVSOut out;
    float2 pos = float2((vid == 1) ? 3.0f : -1.0f, (vid == 2) ? 3.0f : -1.0f);
    out.position = float4(pos, 0.0f, 1.0f);
    out.uv = float2(pos.x * 0.5f + 0.5f, 0.5f - pos.y * 0.5f);
    return out;
}

inline half3 sampleWarped(
    float2 uv,
    float2 mv,
    float alpha,
    texture2d<half, access::sample> prevTex,
    texture2d<half, access::sample> currTex,
    sampler samp)
{
    if (alpha >= 0.995f) {
        return currTex.sample(samp, uv).rgb;
    }
    float2 uv0 = clamp(uv - mv * alpha, float2(0.0f), float2(1.0f));
    float2 uv1 = clamp(uv + mv * (1.0f - alpha), float2(0.0f), float2(1.0f));
    half3 c0 = prevTex.sample(samp, uv0).rgb;
    half3 c1 = currTex.sample(samp, uv1).rgb;

    // Occlusion / scene-cut guard: falls back smoothly to currTex on disocclusions to prevent ghosting
    half3 diff = abs(c0 - c1);
    half maxDiff = max(diff.r, max(diff.g, diff.b));
    half conf = 1.0h - smoothstep(0.14h, 0.34h, maxDiff);
    half3 blended = mix(c0, c1, half(alpha));
    return mix(c1, blended, conf);
}

inline half rcasLuma(half3 c) {
    return dot(c, half3(0.299h, 0.587h, 0.114h));
}

// 5. Motion-compensated interpolation + integrated 5-tap anti-ringing RCAS spatial sharpening
fragment half4 ls_present_fs(
    LSVSOut in [[stage_in]],
    texture2d<half, access::sample> prevTex [[texture(0)]],
    texture2d<half, access::sample> currTex [[texture(1)]],
    texture2d<half, access::sample> flowTex [[texture(2)]],
    constant LSPresentParams& params [[buffer(0)]])
{
    constexpr sampler linSamp(coord::normalized, address::clamp_to_edge, filter::linear);
    float2 uv = in.uv;
    float2 mv = (params.alpha < 0.995f) ? float2(flowTex.sample(linSamp, uv).rg) : float2(0.0f);

    half3 e = sampleWarped(uv, mv, params.alpha, prevTex, currTex, linSamp);
    if (params.rcasSharpness <= 0.01f) {
        return half4(saturate(e), 1.0h);
    }

    float2 dx = float2(params.invTexW, 0.0f);
    float2 dy = float2(0.0f, params.invTexH);
    half3 b = sampleWarped(uv - dy, mv, params.alpha, prevTex, currTex, linSamp);
    half3 d = sampleWarped(uv - dx, mv, params.alpha, prevTex, currTex, linSamp);
    half3 f = sampleWarped(uv + dx, mv, params.alpha, prevTex, currTex, linSamp);
    half3 h = sampleWarped(uv + dy, mv, params.alpha, prevTex, currTex, linSamp);

    half lE = rcasLuma(e);
    half lB = rcasLuma(b);
    half lD = rcasLuma(d);
    half lF = rcasLuma(f);
    half lH = rcasLuma(h);

    half minL = min(lE, min(min(lB, lD), min(lF, lH)));
    half maxL = max(lE, max(max(lB, lD), max(lF, lH)));

    // Contrast-adaptive negative sharpening lobe with strict neighborhood clamp (zero halo/ringing!)
    half amp = clamp(min(minL, 1.0h - maxL) / max(maxL, 0.001h), 0.0h, 1.0h);
    amp = sqrt(amp);
    half w = -amp * half(params.rcasSharpness) * 0.22h;
    half3 sharp = (e + w * (b + d + f + h)) / (1.0h + 4.0h * w);

    half3 minRGB = min(e, min(min(b, d), min(f, h)));
    half3 maxRGB = max(e, max(max(b, d), max(f, h)));
    return half4(saturate(clamp(sharp, minRGB, maxRGB)), 1.0h);
}
)MSL";

static std::atomic<int> g_upscaleMode{MARATHON_IOS_UPSCALE_OFF};
static std::atomic<int> g_frameGenMode{MARATHON_IOS_FG_OFF};
static std::atomic<bool> g_lsSuspended{false};
static std::atomic<void*> g_cachedLayerRaw{nullptr};

// Rolling output presentation FPS estimator (thread-safe via os_unfair_lock)
static os_unfair_lock g_fpsLock = OS_UNFAIR_LOCK_INIT;
static double g_presentStamps[64] = {};
static uint32_t g_presentStampHead = 0;
static uint32_t g_presentStampCount = 0;
static std::atomic<double> g_measuredOutFps{0.0};

static double MonotonicNowSec() {
    struct timespec ts{};
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return static_cast<double>(ts.tv_sec) + static_cast<double>(ts.tv_nsec) * 1e-9;
}

static float GetRcasSharpnessForMode(int mode) {
    switch (mode) {
        case MARATHON_IOS_UPSCALE_QUALITY:     return 0.45f;
        case MARATHON_IOS_UPSCALE_BALANCED:    return 0.65f;
        case MARATHON_IOS_UPSCALE_PERFORMANCE: return 0.80f;
        default:                               return 0.0f;
    }
}

static void ComputeEffectiveFGSchedule(int fgMode, int thermal, int& outBaseFps, int& outDisplayFps, int& outMult) {
    if (fgMode == MARATHON_IOS_FG_X2_120) {
        if (thermal >= 3) {
            // Critical heat: drop gracefully to 30 -> 60 FPS Eco
            outBaseFps = 30; outDisplayFps = 60; outMult = 2;
        } else if (thermal == 2) {
            // Serious heat: shift 60x2 -> 40x3 (keeps locked 120 FPS while slashing engine load another 33%!)
            outBaseFps = 40; outDisplayFps = 120; outMult = 3;
        } else {
            outBaseFps = 60; outDisplayFps = 120; outMult = 2;
        }
    } else if (fgMode == MARATHON_IOS_FG_X3_120) {
        if (thermal >= 3) {
            outBaseFps = 30; outDisplayFps = 60; outMult = 2;
        } else {
            outBaseFps = 40; outDisplayFps = 120; outMult = 3;
        }
    } else if (fgMode == MARATHON_IOS_FG_X2_ECO60) {
        outBaseFps = 30; outDisplayFps = 60; outMult = 2;
    } else {
        outBaseFps = 0; outDisplayFps = 0; outMult = 1;
    }
}

struct LosslessMetalState {
    os_unfair_lock lock = OS_UNFAIR_LOCK_INIT;
    id<MTLDevice> device = nil;
    id<MTLCommandQueue> queue = nil;
    __weak CAMetalLayer *layer = nil;

    id<MTLLibrary> library = nil;
    id<MTLComputePipelineState> lumaPSO = nil;
    id<MTLComputePipelineState> flowPSO = nil;
    id<MTLComputePipelineState> smoothPSO = nil;
    id<MTLRenderPipelineState> presentPSO = nil;
    MTLPixelFormat presentFormat = MTLPixelFormatInvalid;
    bool compileFailed = false;

    uint32_t texW = 0;
    uint32_t texH = 0;
    uint32_t lumaW = 0;
    uint32_t lumaH = 0;
    uint32_t flowW = 0;
    uint32_t flowH = 0;

    // 3-slot private ring buffer prevents any GPU read/write race between render thread and CADisplayLink
    id<MTLTexture> ringTex[3] = { nil, nil, nil };
    id<MTLTexture> ringLuma[3] = { nil, nil, nil };
    id<MTLTexture> flowRaw = nil;
    id<MTLTexture> flowSmooth[2] = { nil, nil };

    uint32_t writeSlot = 0;
    uint32_t lastSlot = 0;
    uint32_t flowWriteSlot = 0;
    bool hasHistory = false;

    // Up to 2 pending sub-frames (3x mode queues t=0.667 and t=1.0)
    PendingSubFrame pending[2] = {};
    uint32_t pendingCount = 0;
};

static LosslessMetalState g_ls;

static void RequestLayerFramebufferModeUpdate() {
    CAMetalLayer *layer = nil;
    os_unfair_lock_lock(&g_ls.lock);
    layer = g_ls.layer;
    os_unfair_lock_unlock(&g_ls.lock);
    if (!layer) return;

    const BOOL wantFramebufferOnly = MarathonIOS_NeedsReadableDrawable() ? NO : YES;
    auto applyBlock = ^{
        if (layer.framebufferOnly != wantFramebufferOnly) {
            layer.framebufferOnly = wantFramebufferOnly;
        }
    };
    if ([NSThread isMainThread]) {
        applyBlock();
    } else {
        dispatch_async(dispatch_get_main_queue(), applyBlock);
    }
}

static bool EnsurePipelinesLocked(id<MTLDevice> dev, MTLPixelFormat targetFmt) {
    if (g_ls.compileFailed || !dev) return false;
    if (g_ls.device != dev) {
        g_ls.device = dev;
        g_ls.library = nil;
        g_ls.lumaPSO = nil;
        g_ls.flowPSO = nil;
        g_ls.smoothPSO = nil;
        g_ls.presentPSO = nil;
        g_ls.presentFormat = MTLPixelFormatInvalid;
        g_ls.texW = 0;
        g_ls.texH = 0;
        g_ls.hasHistory = false;
        g_ls.pendingCount = 0;
    }

    if (!g_ls.library) {
        MTLCompileOptions *opts = [[MTLCompileOptions alloc] init];
        opts.fastMathEnabled = YES;
        NSError *err = nil;
        NSString *mslSource = [NSString stringWithUTF8String:kLosslessScalerMSL];
        g_ls.library = mslSource ? [dev newLibraryWithSource:mslSource options:opts error:&err] : nil;
        if (!g_ls.library) {
            g_ls.compileFailed = true;
            const char *msg = (err && err.localizedDescription) ? err.localizedDescription.UTF8String : "MSL compile failed";
            MarathonIOS_LogLine("METAL_ERR", msg);
            return false;
        }

        id<MTLFunction> fLuma = [g_ls.library newFunctionWithName:@"ls_luma_downsample4x"];
        id<MTLFunction> fFlow = [g_ls.library newFunctionWithName:@"ls_optical_flow"];
        id<MTLFunction> fSmooth = [g_ls.library newFunctionWithName:@"ls_flow_smooth"];
        if (!fLuma || !fFlow || !fSmooth) {
            g_ls.compileFailed = true;
            MarathonIOS_LogLine("METAL_ERR", "LosslessScaler: missing compute shader entry points");
            return false;
        }
        g_ls.lumaPSO = [dev newComputePipelineStateWithFunction:fLuma error:&err];
        g_ls.flowPSO = [dev newComputePipelineStateWithFunction:fFlow error:&err];
        g_ls.smoothPSO = [dev newComputePipelineStateWithFunction:fSmooth error:&err];
        if (!g_ls.lumaPSO || !g_ls.flowPSO || !g_ls.smoothPSO) {
            g_ls.compileFailed = true;
            MarathonIOS_LogLine("METAL_ERR", "LosslessScaler: failed to create compute PSOs");
            return false;
        }
        MarathonIOS_LogLine("METAL_INFO", "LosslessScaler: compiled native Metal optical-flow + RCAS pipelines.");
    }

    if (!g_ls.presentPSO || g_ls.presentFormat != targetFmt) {
        id<MTLFunction> vs = [g_ls.library newFunctionWithName:@"ls_present_vs"];
        id<MTLFunction> fs = [g_ls.library newFunctionWithName:@"ls_present_fs"];
        MTLRenderPipelineDescriptor *rpd = [[MTLRenderPipelineDescriptor alloc] init];
        rpd.vertexFunction = vs;
        rpd.fragmentFunction = fs;
        rpd.colorAttachments[0].pixelFormat = targetFmt;
        NSError *err = nil;
        g_ls.presentPSO = [dev newRenderPipelineStateWithDescriptor:rpd error:&err];
        if (!g_ls.presentPSO) {
            g_ls.compileFailed = true;
            const char *msg = (err && err.localizedDescription) ? err.localizedDescription.UTF8String : "present PSO failed";
            MarathonIOS_LogLine("METAL_ERR", msg);
            return false;
        }
        g_ls.presentFormat = targetFmt;
    }

    return true;
}

static bool EnsureTexturesLocked(id<MTLDevice> dev, uint32_t w, uint32_t h, MTLPixelFormat colorFmt) {
    if (w == 0 || h == 0) return false;
    if (g_ls.texW == w && g_ls.texH == h && g_ls.ringTex[0] != nil &&
        g_ls.ringTex[0].pixelFormat == colorFmt) {
        return true;
    }

    g_ls.texW = w;
    g_ls.texH = h;
    g_ls.lumaW = std::max<uint32_t>(16, (w + 3) / 4);
    g_ls.lumaH = std::max<uint32_t>(16, (h + 3) / 4);
    g_ls.flowW = std::max<uint32_t>(8, (g_ls.lumaW + 1) / 2);
    g_ls.flowH = std::max<uint32_t>(8, (g_ls.lumaH + 1) / 2);
    g_ls.hasHistory = false;
    g_ls.pendingCount = 0;

    MTLTextureDescriptor *colorDesc = [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:colorFmt width:w height:h mipmapped:NO];
    colorDesc.storageMode = MTLStorageModePrivate;
    colorDesc.usage = MTLTextureUsageShaderRead;

    MTLTextureDescriptor *lumaDesc = [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatR8Unorm width:g_ls.lumaW height:g_ls.lumaH mipmapped:NO];
    lumaDesc.storageMode = MTLStorageModePrivate;
    lumaDesc.usage = MTLTextureUsageShaderRead | MTLTextureUsageShaderWrite;

    MTLTextureDescriptor *flowDesc = [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatRG16Float width:g_ls.flowW height:g_ls.flowH mipmapped:NO];
    flowDesc.storageMode = MTLStorageModePrivate;
    flowDesc.usage = MTLTextureUsageShaderRead | MTLTextureUsageShaderWrite;

    for (int i = 0; i < 3; ++i) {
        g_ls.ringTex[i] = [dev newTextureWithDescriptor:colorDesc];
        g_ls.ringLuma[i] = [dev newTextureWithDescriptor:lumaDesc];
        if (!g_ls.ringTex[i] || !g_ls.ringLuma[i]) return false;
    }
    g_ls.flowRaw = [dev newTextureWithDescriptor:flowDesc];
    g_ls.flowSmooth[0] = [dev newTextureWithDescriptor:flowDesc];
    g_ls.flowSmooth[1] = [dev newTextureWithDescriptor:flowDesc];
    if (!g_ls.flowRaw || !g_ls.flowSmooth[0] || !g_ls.flowSmooth[1]) return false;

    char buf[160];
    std::snprintf(buf, sizeof(buf),
                  "LosslessScaler: allocated 3-slot private ring %ux%u (luma %ux%u, flow %ux%u)",
                  w, h, g_ls.lumaW, g_ls.lumaH, g_ls.flowW, g_ls.flowH);
    MarathonIOS_LogLine("METAL_INFO", buf);
    return true;
}

static void EncodePresentPass(
    id<MTLCommandBuffer> cmdBuf,
    id<MTLTexture> targetTex,
    id<MTLRenderPipelineState> pso,
    id<MTLTexture> prevTex,
    id<MTLTexture> currTex,
    id<MTLTexture> flowTex,
    float alpha,
    float rcasSharpness)
{
    MTLRenderPassDescriptor *rpd = [MTLRenderPassDescriptor renderPassDescriptor];
    rpd.colorAttachments[0].texture = targetTex;
    rpd.colorAttachments[0].loadAction = MTLLoadActionDontCare;
    rpd.colorAttachments[0].storeAction = MTLStoreActionStore;

    id<MTLRenderCommandEncoder> enc = [cmdBuf renderCommandEncoderWithDescriptor:rpd];
    if (!enc) return;

    LSPresentParams params{
        alpha,
        rcasSharpness,
        1.0f / static_cast<float>(targetTex.width),
        1.0f / static_cast<float>(targetTex.height)
    };
    [enc setRenderPipelineState:pso];
    [enc setFragmentTexture:prevTex atIndex:0];
    [enc setFragmentTexture:currTex atIndex:1];
    [enc setFragmentTexture:flowTex atIndex:2];
    [enc setFragmentBytes:&params length:sizeof(params) atIndex:0];
    [enc drawPrimitives:MTLPrimitiveTypeTriangle vertexStart:0 vertexCount:3];
    [enc endEncoding];
}

} // anonymous namespace

extern "C" {

void MarathonIOS_SetUpscaleMode(int mode) {
    if (mode < MARATHON_IOS_UPSCALE_OFF || mode > MARATHON_IOS_UPSCALE_PERFORMANCE) {
        mode = MARATHON_IOS_UPSCALE_OFF;
    }
    const int prev = g_upscaleMode.exchange(mode, std::memory_order_acq_rel);
    if (prev != mode) {
        RequestLayerFramebufferModeUpdate();
        char buf[128];
        std::snprintf(buf, sizeof(buf), "LosslessUpscaling=%d (resScale=%.2f, rcas=%.2f)",
                      mode, MarathonIOS_GetUpscaleResolutionScale(mode), GetRcasSharpnessForMode(mode));
        MarathonIOS_LogLine("METAL_INFO", buf);
    }
}

int MarathonIOS_GetUpscaleMode(void) {
    return g_upscaleMode.load(std::memory_order_acquire);
}

float MarathonIOS_GetUpscaleResolutionScale(int mode) {
    switch (mode) {
        case MARATHON_IOS_UPSCALE_QUALITY:     return 0.75f;
        case MARATHON_IOS_UPSCALE_BALANCED:    return 0.65f;
        case MARATHON_IOS_UPSCALE_PERFORMANCE: return 0.55f;
        default:                               return 1.00f;
    }
}

void MarathonIOS_SetFrameGenMode(int mode) {
    if (mode < MARATHON_IOS_FG_OFF || mode > MARATHON_IOS_FG_X2_ECO60) {
        mode = MARATHON_IOS_FG_OFF;
    }
    const int prev = g_frameGenMode.exchange(mode, std::memory_order_acq_rel);
    if (prev != mode) {
        os_unfair_lock_lock(&g_ls.lock);
        g_ls.hasHistory = false;
        g_ls.pendingCount = 0;
        os_unfair_lock_unlock(&g_ls.lock);
        RequestLayerFramebufferModeUpdate();

        int base = 0, outFps = 0, mult = 1;
        ComputeEffectiveFGSchedule(mode, MarathonIOS_GetThermalState(), base, outFps, mult);
        char buf[128];
        std::snprintf(buf, sizeof(buf), "FrameGeneration=%d -> base=%d FPS, output=%d FPS (%dx)",
                      mode, base, outFps, mult);
        MarathonIOS_LogLine("METAL_INFO", buf);
    }
}

int MarathonIOS_GetFrameGenMode(void) {
    return g_frameGenMode.load(std::memory_order_acquire);
}

int MarathonIOS_GetFrameGenBaseFPS(void) {
    int base = 0, outFps = 0, mult = 1;
    ComputeEffectiveFGSchedule(g_frameGenMode.load(std::memory_order_acquire),
                               MarathonIOS_GetThermalState(), base, outFps, mult);
    return base;
}

int MarathonIOS_GetFrameGenOutputFPS(void) {
    int base = 0, outFps = 0, mult = 1;
    ComputeEffectiveFGSchedule(g_frameGenMode.load(std::memory_order_acquire),
                               MarathonIOS_GetThermalState(), base, outFps, mult);
    return outFps;
}

int MarathonIOS_GetFrameGenMultiplier(void) {
    int base = 0, outFps = 0, mult = 1;
    ComputeEffectiveFGSchedule(g_frameGenMode.load(std::memory_order_acquire),
                               MarathonIOS_GetThermalState(), base, outFps, mult);
    return mult;
}

bool MarathonIOS_NeedsReadableDrawable(void) {
    return g_upscaleMode.load(std::memory_order_acquire) != MARATHON_IOS_UPSCALE_OFF ||
           g_frameGenMode.load(std::memory_order_acquire) != MARATHON_IOS_FG_OFF;
}

void MarathonIOS_LosslessRecordPresentedFrame(void) {
    const double now = MonotonicNowSec();
    os_unfair_lock_lock(&g_fpsLock);
    g_presentStamps[g_presentStampHead] = now;
    g_presentStampHead = (g_presentStampHead + 1u) & 63u;
    if (g_presentStampCount < 64u) {
        g_presentStampCount++;
    }
    // Count frames presented within the last 0.50s window
    uint32_t inWindow = 0;
    double oldest = now;
    for (uint32_t i = 0; i < g_presentStampCount; ++i) {
        const double t = g_presentStamps[(g_presentStampHead + 64u - 1u - i) & 63u];
        if (now - t <= 0.50) {
            inWindow++;
            oldest = t;
        } else {
            break;
        }
    }
    const double span = now - oldest;
    if (inWindow >= 3 && span >= 0.08) {
        g_measuredOutFps.store(static_cast<double>(inWindow - 1u) / span, std::memory_order_relaxed);
    }
    os_unfair_lock_unlock(&g_fpsLock);
}

double MarathonIOS_GetMeasuredOutputFPS(void) {
    return g_measuredOutFps.load(std::memory_order_relaxed);
}

void MarathonIOS_LosslessOnSuspendChanged(bool suspended) {
    g_lsSuspended.store(suspended, std::memory_order_release);
    os_unfair_lock_lock(&g_ls.lock);
    g_ls.pendingCount = 0;
    g_ls.hasHistory = false;
    os_unfair_lock_unlock(&g_ls.lock);
}

bool MarathonIOS_LosslessPresentFrame(void* commandQueueMtl,
                                      void* metalLayerPtr,
                                      void* presentCmdBufferMtl,
                                      void* drawableMtl)
{
    if (!commandQueueMtl || !metalLayerPtr || !presentCmdBufferMtl || !drawableMtl) {
        return false;
    }

    CAMetalLayer *layer = (__bridge CAMetalLayer *)metalLayerPtr;
    id<MTLCommandQueue> queue = (__bridge id<MTLCommandQueue>)commandQueueMtl;
    id<MTLCommandBuffer> cmdBuf = (__bridge id<MTLCommandBuffer>)presentCmdBufferMtl;
    id<CAMetalDrawable> drawable = (__bridge id<CAMetalDrawable>)drawableMtl;

    // Always cache layer pointer so toggling Lossless Scaling live in Video Options flips framebufferOnly immediately.
    if (g_cachedLayerRaw.load(std::memory_order_acquire) != metalLayerPtr) {
        os_unfair_lock_lock(&g_ls.lock);
        g_ls.layer = layer;
        g_ls.queue = queue;
        g_cachedLayerRaw.store(metalLayerPtr, std::memory_order_release);
        os_unfair_lock_unlock(&g_ls.lock);
    }

    const int upscaleMode = g_upscaleMode.load(std::memory_order_acquire);
    const int fgMode = g_frameGenMode.load(std::memory_order_acquire);
    if ((upscaleMode == MARATHON_IOS_UPSCALE_OFF && fgMode == MARATHON_IOS_FG_OFF) ||
        g_lsSuspended.load(std::memory_order_acquire)) {
        return false;
    }

    id<MTLTexture> drawableTex = drawable.texture;
    if (!drawableTex) {
        return false;
    }

    // Safety guard on the 1 transition frame while layer.framebufferOnly flips YES -> NO on main thread:
    // skip blit on this single frame so Metal never sees an illegal read from a framebufferOnly drawable.
    if (layer.framebufferOnly) {
        RequestLayerFramebufferModeUpdate();
        return false;
    }

    const float rcasSharpness = GetRcasSharpnessForMode(upscaleMode);
    int baseFps = 0, outFps = 0, mult = 1;
    ComputeEffectiveFGSchedule(fgMode, MarathonIOS_GetThermalState(), baseFps, outFps, mult);
    const bool fgActive = (mult >= 2 && outFps > 0);

    os_unfair_lock_lock(&g_ls.lock);
    g_ls.queue = queue;
    g_ls.layer = layer;

    if (!EnsurePipelinesLocked(queue.device, drawableTex.pixelFormat) ||
        !EnsureTexturesLocked(queue.device,
                              static_cast<uint32_t>(drawableTex.width),
                              static_cast<uint32_t>(drawableTex.height),
                              drawableTex.pixelFormat)) {
        os_unfair_lock_unlock(&g_ls.lock);
        return false;
    }

    const uint32_t currSlot = g_ls.writeSlot;
    const uint32_t prevSlot = g_ls.lastSlot;
    const uint32_t flowSlot = g_ls.flowWriteSlot;
    const bool hadHistory = g_ls.hasHistory;

    id<MTLTexture> currTex = g_ls.ringTex[currSlot];
    id<MTLTexture> prevTex = g_ls.ringTex[prevSlot];
    id<MTLTexture> currLuma = g_ls.ringLuma[currSlot];
    id<MTLTexture> prevLuma = g_ls.ringLuma[prevSlot];
    id<MTLTexture> flowRaw = g_ls.flowRaw;
    id<MTLTexture> flowSmooth = g_ls.flowSmooth[flowSlot];
    id<MTLComputePipelineState> lumaPSO = g_ls.lumaPSO;
    id<MTLComputePipelineState> flowPSO = g_ls.flowPSO;
    id<MTLComputePipelineState> smoothPSO = g_ls.smoothPSO;
    id<MTLRenderPipelineState> presentPSO = g_ls.presentPSO;
    const LSFlowParams flowParams{ g_ls.lumaW, g_ls.lumaH, g_ls.flowW, g_ls.flowH };

    g_ls.lastSlot = currSlot;
    g_ls.writeSlot = (currSlot + 1u) % 3u;
    g_ls.flowWriteSlot = (flowSlot + 1u) & 1u;
    g_ls.hasHistory = true;
    // Clear stale unpresented sub-frames from previous cycle so latency never accumulates
    g_ls.pendingCount = 0;

    if (fgActive && hadHistory) {
        const double nowSec = MonotonicNowSec();
        const double subInterval = 1.0 / static_cast<double>(outFps);
        if (mult == 2) {
            // Engine presents t=0.5 now; CADisplayLink presents crisp real frame t=1.0 one VSync later
            g_ls.pending[0] = PendingSubFrame{ prevSlot, currSlot, flowSlot, 1.0f, rcasSharpness, nowSec + subInterval * 0.55 };
            g_ls.pendingCount = 1;
        } else {
            // 3x mode: engine presents t=0.333 now; CADisplayLink presents t=0.667 and real frame t=1.0
            g_ls.pending[0] = PendingSubFrame{ prevSlot, currSlot, flowSlot, 0.6666667f, rcasSharpness, nowSec + subInterval * 0.55 };
            g_ls.pending[1] = PendingSubFrame{ prevSlot, currSlot, flowSlot, 1.0f,       rcasSharpness, nowSec + subInterval * 1.45 };
            g_ls.pendingCount = 2;
        }
    }
    os_unfair_lock_unlock(&g_ls.lock);

    // 1. Copy finished game frame from CAMetalLayer drawable into private ringTex[currSlot]
    id<MTLBlitCommandEncoder> blit = [cmdBuf blitCommandEncoder];
    if (!blit) return false;
    [blit copyFromTexture:drawableTex
              sourceSlice:0
              sourceLevel:0
             sourceOrigin:MTLOriginMake(0, 0, 0)
               sourceSize:MTLSizeMake(drawableTex.width, drawableTex.height, 1)
                toTexture:currTex
         destinationSlice:0
         destinationLevel:0
        destinationOrigin:MTLOriginMake(0, 0, 0)];
    [blit endEncoding];

    // 2. If Frame Generation is active, compute 4x luma downsample + coarse-to-fine optical flow + spatial smoothing
    if (fgActive) {
        id<MTLComputeCommandEncoder> comp = [cmdBuf computeCommandEncoder];
        if (comp) {
            MTLSize tg = MTLSizeMake(16, 16, 1);
            [comp setComputePipelineState:lumaPSO];
            [comp setTexture:currTex atIndex:0];
            [comp setTexture:currLuma atIndex:1];
            [comp setBytes:&flowParams length:sizeof(flowParams) atIndex:0];
            [comp dispatchThreads:MTLSizeMake(flowParams.lumaWidth, flowParams.lumaHeight, 1) threadsPerThreadgroup:tg];

            if (hadHistory) {
                [comp setComputePipelineState:flowPSO];
                [comp setTexture:prevLuma atIndex:0];
                [comp setTexture:currLuma atIndex:1];
                [comp setTexture:flowRaw atIndex:2];
                [comp setBytes:&flowParams length:sizeof(flowParams) atIndex:0];
                [comp dispatchThreads:MTLSizeMake(flowParams.flowWidth, flowParams.flowHeight, 1) threadsPerThreadgroup:tg];

                [comp setComputePipelineState:smoothPSO];
                [comp setTexture:flowRaw atIndex:0];
                [comp setTexture:flowSmooth atIndex:1];
                [comp setBytes:&flowParams length:sizeof(flowParams) atIndex:0];
                [comp dispatchThreads:MTLSizeMake(flowParams.flowWidth, flowParams.flowHeight, 1) threadsPerThreadgroup:tg];
            }
            [comp endEncoding];
        }
    }

    // 3. Render first presented frame directly into drawableTex:
    //    - FG 2x: interpolated midpoint t=0.5 + RCAS
    //    - FG 3x: interpolated t=0.333 + RCAS
    //    - RCAS-only / first frame: real frame t=1.0 + RCAS
    const float firstAlpha = (fgActive && hadHistory) ? (mult == 3 ? 0.3333333f : 0.5f) : 1.0f;
    if (firstAlpha < 0.995f || rcasSharpness > 0.01f) {
        EncodePresentPass(cmdBuf, drawableTex, presentPSO, prevTex, currTex, flowSmooth, firstAlpha, rcasSharpness);
    }

    return true;
}

void MarathonIOS_LosslessOnDisplayLinkTick(double timestampSec) {
    (void)timestampSec;
    if (g_lsSuspended.load(std::memory_order_acquire) ||
        g_frameGenMode.load(std::memory_order_acquire) == MARATHON_IOS_FG_OFF) {
        return;
    }

    PendingSubFrame job{};
    id<MTLCommandQueue> queue = nil;
    CAMetalLayer *layer = nil;
    id<MTLRenderPipelineState> presentPSO = nil;
    id<MTLTexture> prevTex = nil;
    id<MTLTexture> currTex = nil;
    id<MTLTexture> flowTex = nil;
    bool hasJob = false;

    const double nowSec = MonotonicNowSec();
    os_unfair_lock_lock(&g_ls.lock);
    if (g_ls.pendingCount > 0 && nowSec >= g_ls.pending[0].dueAfterSec &&
        g_ls.queue != nil && g_ls.layer != nil && g_ls.presentPSO != nil) {
        job = g_ls.pending[0];
        if (g_ls.pendingCount == 2) {
            g_ls.pending[0] = g_ls.pending[1];
            g_ls.pendingCount = 1;
        } else {
            g_ls.pendingCount = 0;
        }
        queue = g_ls.queue;
        layer = g_ls.layer;
        presentPSO = g_ls.presentPSO;
        prevTex = g_ls.ringTex[job.prevSlot];
        currTex = g_ls.ringTex[job.currSlot];
        flowTex = g_ls.flowSmooth[job.flowSlot];
        hasJob = (prevTex != nil && currTex != nil && flowTex != nil);
    }
    os_unfair_lock_unlock(&g_ls.lock);

    if (!hasJob || g_lsSuspended.load(std::memory_order_acquire)) {
        return;
    }

    @autoreleasepool {
        id<CAMetalDrawable> subDrawable = [layer nextDrawable];
        if (!subDrawable || !subDrawable.texture) {
            return;
        }
        // Skip cleanly if layer resized mid-flight
        if (subDrawable.texture.width != currTex.width ||
            subDrawable.texture.height != currTex.height) {
            return;
        }
        id<MTLCommandBuffer> cmdBuf = [queue commandBuffer];
        if (!cmdBuf) {
            return;
        }
        cmdBuf.label = @"LosslessScaler SubFrame";
        EncodePresentPass(cmdBuf, subDrawable.texture, presentPSO,
                          prevTex, currTex, flowTex, job.alpha, job.rcasSharpness);
        [cmdBuf addScheduledHandler:^(id<MTLCommandBuffer> _Nonnull cb) {
            (void)cb;
            MarathonIOS_LosslessRecordPresentedFrame();
        }];
        [cmdBuf presentDrawable:subDrawable];
        [cmdBuf commit];
    }
}

} // extern "C"
