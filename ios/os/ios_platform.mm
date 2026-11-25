// Clean-room iOS OS Platform Implementation for MarathonRecomp v1.0.0
// Replaces os/macos/* calls that rely on macOS-only APIs or non-writable bundle paths.
// Includes:
// - Persistent Documents/MarathonRecomp/ios_debug.log diagnostics & ARM64 Mach freeze watchdog
// - Zero-stall UIKit lifecycle pause/resume (prevents Metal 00000006 background GPU faults on screen lock / app switch)
// - Native ProMotion 120Hz CADisplayLink driver + event-driven Thermal Guardian (prevents thermal cliff & battery drain)
// - First-launch iOS hardware auto-detection (Tier 3 ProMotion 120Hz flagship for iPhone 15 Pro / 16 Pro)
// - Buffered non-blocking logging + low-overhead per-frame heartbeat

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <QuartzCore/QuartzCore.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreFoundation/CoreFoundation.h>
#import <os/log.h>
#include <dlfcn.h>
#include <execinfo.h>
#include <fcntl.h>
#include <mach-o/dyld.h>
#include <mach/mach.h>
#include <pthread.h>
#include <pthread/qos.h>
#include <signal.h>
#include <sys/param.h>
#include <sys/sysctl.h>
#include <time.h>
#include <unistd.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstring>
#include <exception>
#include <filesystem>
#include <mutex>
#include <string>
#include <string_view>
#include <thread>

#include <ios_virtual_controller.h>
#include <os/locale.h>
#include <os/logger.h>
#include <os/media.h>
#include <os/process.h>
#include <os/user.h>
#include <os/version.h>

// Lightweight CADisplayLink driver that explicitly declares CAFrameRateRange to iOS ProMotion LTPO
// (without an active CAFrameRateRange hint, iPhone 15 Pro / 16 Pro frequently throttle Metal layers to 60Hz/80Hz).
@interface MarathonProMotionDriver : NSObject
@property (nonatomic, strong) CADisplayLink *displayLink;
- (void)applyTargetFps:(int)fps suspended:(BOOL)suspended;
@end

@implementation MarathonProMotionDriver
- (void)onTick:(__unused CADisplayLink *)link {
    // Intentionally empty: solely drives CoreAnimation ProMotion LTPO CAFrameRateRange negotiation.
}

- (void)applyTargetFps:(int)fps suspended:(BOOL)suspended {
    if (!self.displayLink) {
        self.displayLink = [CADisplayLink displayLinkWithTarget:self selector:@selector(onTick:)];
        [self.displayLink addToRunLoop:[NSRunLoop mainRunLoop] forMode:NSRunLoopCommonModes];
    }
    if (suspended) {
        self.displayLink.paused = YES;
        return;
    }
    if (@available(iOS 15.0, *)) {
        CAFrameRateRange range;
        if (fps >= 100) {
            range = CAFrameRateRangeMake(80.0f, 120.0f, 120.0f);
        } else if (fps >= 80) {
            range = CAFrameRateRangeMake(60.0f, 90.0f, 90.0f);
        } else if (fps >= 45) {
            range = CAFrameRateRangeMake(48.0f, 60.0f, 60.0f);
        } else {
            range = CAFrameRateRangeMake(30.0f, 30.0f, 30.0f);
        }
        self.displayLink.preferredFrameRateRange = range;
    }
    self.displayLink.paused = NO;
}
@end

namespace {

static std::mutex g_logFileMutex;
static FILE* g_logFile = nullptr;
static int g_logFd = -1;
static std::atomic<bool> g_logDirty{false};
static std::atomic<uint64_t> g_bootMonotonicMs{0};
static std::atomic<bool> g_diagInitialized{false};

static std::atomic<bool> g_watchdogArmed{false};
static std::atomic<uint64_t> g_lastMainHbMs{0};
static std::atomic<const char*> g_lastMainPhase{"boot"};
static std::atomic<uint64_t> g_lastRenderHbMs{0};
static std::atomic<const char*> g_lastRenderPhase{"idle"};
static std::atomic<uint64_t> g_hbFrameCount{0};
static std::atomic<int> g_stallDumpStage{0};

// App foreground/background lifecycle state (prevents kIOGPUCommandBufferCallbackErrorBackgroundExecutionNotPermitted)
static std::atomic<bool> g_appSuspended{false};
static std::atomic<bool> g_lifecycleRegistered{false};
static std::mutex g_suspendMutex;
static std::condition_variable g_suspendCv;

// ProMotion LTPO target FPS & event-driven Thermal Guardian state
static std::atomic<int> g_targetFps{120};
static std::atomic<int> g_thermalState{0}; // 0=Nominal, 1=Fair, 2=Serious, 3=Critical
static std::atomic<int> g_effectiveTargetFps{120};
static MarathonProMotionDriver *g_proMotionDriver = nil;

static uint64_t MonotonicNowMs() {
    struct timespec ts{};
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return static_cast<uint64_t>(ts.tv_sec) * 1000ULL + static_cast<uint64_t>(ts.tv_nsec) / 1000000ULL;
}

static uint64_t CurrentTidHash() {
    uint64_t tid = 0;
    pthread_threadid_np(nullptr, &tid);
    return tid;
}

static bool IsUrgentLogTag(const char* tag) {
    if (!tag) return false;
    return std::strcmp(tag, "ERR") == 0 ||
           std::strcmp(tag, "WARN") == 0 ||
           std::strcmp(tag, "BOOT") == 0 ||
           std::strcmp(tag, "LIFECYCLE") == 0 ||
           std::strcmp(tag, "WATCHDOG") == 0 ||
           std::strcmp(tag, "METAL_ERR") == 0 ||
           std::strcmp(tag, "METAL_WARN") == 0 ||
           std::strcmp(tag, "METAL_INFO") == 0 ||
           std::strcmp(tag, "THERMAL") == 0 ||
           std::strcmp(tag, "AUTOCFG") == 0 ||
           std::strcmp(tag, "TERMINATE") == 0 ||
           std::strcmp(tag, "NS_EXC") == 0;
}

static void WriteRawLogLocked(const char* tag, const char* msg) {
    if (!g_logFile) return;
    uint64_t now = MonotonicNowMs();
    uint64_t boot = g_bootMonotonicMs.load(std::memory_order_relaxed);
    double elapsedSec = (now >= boot) ? (static_cast<double>(now - boot) / 1000.0) : 0.0;
    std::fprintf(g_logFile, "[+%8.3fs][T:%06llx][%s] %s\n",
                 elapsedSec,
                 static_cast<unsigned long long>(CurrentTidHash() & 0xFFFFFFULL),
                 tag ? tag : "INFO",
                 msg ? msg : "");
    // Avoid synchronous NAND fflush() on gameplay INFO spam at 120 FPS; watchdog flushes every 2s.
    if (IsUrgentLogTag(tag)) {
        std::fflush(g_logFile);
        g_logDirty.store(false, std::memory_order_relaxed);
    } else {
        g_logDirty.store(true, std::memory_order_relaxed);
    }
}

static int ComputeEffectiveTargetFps(int userFps, int thermal) {
    int eff = userFps;
    // Gentle Thermal Guardian: prevents Apple's sudden OS thermal cliff (~30fps throttle)
    // by easing 120 -> 90 FPS (ProMotion LTPO) under Serious heat and 60 FPS under Critical heat.
    if (thermal >= 3 && eff > 60) {
        eff = 60;
    } else if (thermal == 2 && eff > 90) {
        eff = 90;
    }
    return eff;
}

static void RefreshThermalAndProMotion(bool logChange) {
    int thermal = 0;
    switch ([NSProcessInfo processInfo].thermalState) {
        case NSProcessInfoThermalStateNominal:  thermal = 0; break;
        case NSProcessInfoThermalStateFair:     thermal = 1; break;
        case NSProcessInfoThermalStateSerious:  thermal = 2; break;
        case NSProcessInfoThermalStateCritical: thermal = 3; break;
        default:                                thermal = 0; break;
    }
    int prevThermal = g_thermalState.exchange(thermal, std::memory_order_acq_rel);
    int userFps = g_targetFps.load(std::memory_order_acquire);
    int eff = ComputeEffectiveTargetFps(userFps, thermal);
    int prevEff = g_effectiveTargetFps.exchange(eff, std::memory_order_acq_rel);

    MarathonIOS_ApplyProMotionRefreshRate(eff);

    if (logChange && (prevThermal != thermal || prevEff != eff)) {
        static const char* kThermalNames[4] = { "Nominal", "Fair", "Serious", "Critical" };
        char buf[160];
        std::snprintf(buf, sizeof(buf),
                      "Thermal=%s -> effectiveFPS=%d (userTarget=%d)",
                      kThermalNames[thermal & 3], eff, userFps);
        MarathonIOS_LogLine("THERMAL", buf);
    }
}

static void SafeWriteFd(int fd, const char* str) {
    if (fd < 0 || !str) return;
    size_t len = std::strlen(str);
    while (len > 0) {
        ssize_t n = write(fd, str, len);
        if (n <= 0) break;
        str += n;
        len -= static_cast<size_t>(n);
    }
}

static void SignalCrashHandler(int sig) {
    int fd = g_logFd;
    if (fd >= 0) {
        char hdr[160];
        std::snprintf(hdr, sizeof(hdr),
                      "\n================ FATAL SIGNAL %d ================\n"
                      "MainPhase=%s | RenderPhase=%s | Frames=%llu\n",
                      sig,
                      g_lastMainPhase.load(std::memory_order_relaxed),
                      g_lastRenderPhase.load(std::memory_order_relaxed),
                      static_cast<unsigned long long>(g_hbFrameCount.load(std::memory_order_relaxed)));
        SafeWriteFd(fd, hdr);
        void* frames[64];
        int count = backtrace(frames, 64);
        backtrace_symbols_fd(frames, count, fd);
        SafeWriteFd(fd, "================ END SIGNAL ================\n");
        fsync(fd);
    }
    signal(sig, SIG_DFL);
    raise(sig);
}

static void FormatSymbol(uintptr_t addr, char* outBuf, size_t outSize) {
    Dl_info info{};
    if (addr != 0 && dladdr(reinterpret_cast<const void*>(addr), &info) != 0) {
        const char* img = info.dli_fname ? std::strrchr(info.dli_fname, '/') : nullptr;
        const char* imgName = img ? (img + 1) : (info.dli_fname ? info.dli_fname : "?");
        if (info.dli_sname) {
            uintptr_t off = addr - reinterpret_cast<uintptr_t>(info.dli_saddr);
            std::snprintf(outBuf, outSize, "%s!%s+0x%lx", imgName, info.dli_sname, static_cast<unsigned long>(off));
        } else {
            uintptr_t off = addr - reinterpret_cast<uintptr_t>(info.dli_fbase);
            std::snprintf(outBuf, outSize, "%s+0x%lx", imgName, static_cast<unsigned long>(off));
        }
    } else {
        std::snprintf(outBuf, outSize, "0x%lx", static_cast<unsigned long>(addr));
    }
}

static void DumpAllThreadsToLog(uint64_t stallMs) {
    std::lock_guard<std::mutex> lock(g_logFileMutex);
    if (!g_logFile) return;

    uint64_t now = MonotonicNowMs();
    uint64_t renderAge = now - g_lastRenderHbMs.load(std::memory_order_relaxed);
    std::fprintf(g_logFile,
                 "\n================ FREEZE WATCHDOG: STALL %llums (frames=%llu) ================\n"
                 "MainPhase=%s (age=%llums) | RenderPhase=%s (age=%llums)\n",
                 static_cast<unsigned long long>(stallMs),
                 static_cast<unsigned long long>(g_hbFrameCount.load(std::memory_order_relaxed)),
                 g_lastMainPhase.load(std::memory_order_relaxed),
                 static_cast<unsigned long long>(stallMs),
                 g_lastRenderPhase.load(std::memory_order_relaxed),
                 static_cast<unsigned long long>(renderAge));

    thread_act_array_t threads = nullptr;
    mach_msg_type_number_t threadCount = 0;
    mach_port_t selfThread = mach_thread_self();
    kern_return_t kr = task_threads(mach_task_self(), &threads, &threadCount);
    if (kr == KERN_SUCCESS && threads != nullptr) {
        std::fprintf(g_logFile, "Active Mach threads: %u\n", static_cast<unsigned int>(threadCount));
        for (mach_msg_type_number_t i = 0; i < threadCount; ++i) {
            if (threads[i] == selfThread) {
                mach_port_deallocate(mach_task_self(), threads[i]);
                continue;
            }
            thread_basic_info_data_t basicInfo{};
            mach_msg_type_number_t basicCount = THREAD_BASIC_INFO_COUNT;
            int runState = -1;
            int cpuUsage = 0;
            if (thread_info(threads[i], THREAD_BASIC_INFO,
                            reinterpret_cast<thread_info_t>(&basicInfo), &basicCount) == KERN_SUCCESS) {
                runState = basicInfo.run_state;
                cpuUsage = basicInfo.cpu_usage;
            }
#if defined(__aarch64__) || defined(__arm64__)
            arm_thread_state64_t ts{};
            mach_msg_type_number_t stateCount = ARM_THREAD_STATE64_COUNT;
            if (thread_get_state(threads[i], ARM_THREAD_STATE64,
                                 reinterpret_cast<thread_state_t>(&ts), &stateCount) == KERN_SUCCESS) {
                uintptr_t pc = static_cast<uintptr_t>(arm_thread_state64_get_pc(ts));
                uintptr_t lr = static_cast<uintptr_t>(arm_thread_state64_get_lr(ts));
                char pcSym[192]{};
                char lrSym[192]{};
                FormatSymbol(pc, pcSym, sizeof(pcSym));
                FormatSymbol(lr, lrSym, sizeof(lrSym));
                std::fprintf(g_logFile,
                             "  [T#%02u port=0x%x state=%d cpu=%d] PC=%s | LR=%s\n",
                             static_cast<unsigned int>(i),
                             static_cast<unsigned int>(threads[i]),
                             runState, cpuUsage, pcSym, lrSym);
            } else {
                std::fprintf(g_logFile, "  [T#%02u port=0x%x state=%d cpu=%d] (thread_get_state unavailable)\n",
                             static_cast<unsigned int>(i),
                             static_cast<unsigned int>(threads[i]),
                             runState, cpuUsage);
            }
#else
            std::fprintf(g_logFile, "  [T#%02u port=0x%x state=%d cpu=%d]\n",
                         static_cast<unsigned int>(i),
                         static_cast<unsigned int>(threads[i]),
                         runState, cpuUsage);
#endif
            mach_port_deallocate(mach_task_self(), threads[i]);
        }
        vm_deallocate(mach_task_self(),
                      reinterpret_cast<vm_address_t>(threads),
                      static_cast<vm_size_t>(threadCount) * sizeof(thread_act_t));
    } else {
        std::fprintf(g_logFile, "task_threads failed: kr=%d\n", static_cast<int>(kr));
    }
    mach_port_deallocate(mach_task_self(), selfThread);

    std::fprintf(g_logFile, "================ END FREEZE WATCHDOG ================\n");
    std::fflush(g_logFile);
    if (g_logFd >= 0) fsync(g_logFd);
}

static void RegisterIOSLifecycleObservers() {
    bool expected = false;
    if (!g_lifecycleRegistered.compare_exchange_strong(expected, true)) return;

    auto registerBlock = ^{
        NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
        [nc addObserverForName:UIApplicationWillResignActiveNotification
                        object:nil
                         queue:[NSOperationQueue mainQueue]
                    usingBlock:^(__unused NSNotification *note) {
            MarathonIOS_SetAppSuspended(true);
        }];
        [nc addObserverForName:UIApplicationDidEnterBackgroundNotification
                        object:nil
                         queue:[NSOperationQueue mainQueue]
                    usingBlock:^(__unused NSNotification *note) {
            MarathonIOS_SetAppSuspended(true);
        }];
        [nc addObserverForName:UIApplicationDidBecomeActiveNotification
                        object:nil
                         queue:[NSOperationQueue mainQueue]
                    usingBlock:^(__unused NSNotification *note) {
            MarathonIOS_SetAppSuspended(false);
        }];
        [nc addObserverForName:NSProcessInfoThermalStateDidChangeNotification
                        object:nil
                         queue:[NSOperationQueue mainQueue]
                    usingBlock:^(__unused NSNotification *note) {
            RefreshThermalAndProMotion(true);
        }];
        RefreshThermalAndProMotion(false);
    };

    if ([NSThread isMainThread]) {
        registerBlock();
    } else {
        dispatch_async(dispatch_get_main_queue(), registerBlock);
    }
}

static void StartFreezeWatchdogThread() {
    std::thread([]() {
        pthread_setname_np("MarathonIOSWatchdog");
        // Pin watchdog strictly to Apple Silicon E-cores (zero interference with 120 FPS P-cores)
        pthread_set_qos_class_self_np(QOS_CLASS_BACKGROUND, 0);
        static constexpr uint64_t kThresholdsMs[3] = { 4000, 12000, 30000 };
        uint32_t tick = 0;
        while (true) {
            std::this_thread::sleep_for(std::chrono::seconds(1));
            ++tick;
            if ((tick & 1u) == 0u && g_logDirty.exchange(false, std::memory_order_relaxed)) {
                std::lock_guard<std::mutex> lock(g_logFileMutex);
                if (g_logFile) std::fflush(g_logFile);
            }
            if (!g_watchdogArmed.load(std::memory_order_acquire)) continue;
            if (g_appSuspended.load(std::memory_order_acquire)) {
                uint64_t nowPaused = MonotonicNowMs();
                g_lastMainHbMs.store(nowPaused, std::memory_order_release);
                g_lastRenderHbMs.store(nowPaused, std::memory_order_release);
                g_stallDumpStage.store(0, std::memory_order_relaxed);
                continue;
            }
            uint64_t now = MonotonicNowMs();
            uint64_t last = g_lastMainHbMs.load(std::memory_order_acquire);
            if (now <= last) continue;
            uint64_t stallMs = now - last;
            int stage = g_stallDumpStage.load(std::memory_order_relaxed);
            if (stage < 3 && stallMs >= kThresholdsMs[stage]) {
                g_stallDumpStage.store(stage + 1, std::memory_order_relaxed);
                DumpAllThreadsToLog(stallMs);
            }
        }
    }).detach();
}

static void EnsureDiagnosticsInitialized() {
    if (g_diagInitialized.load(std::memory_order_acquire)) return;
    bool expected = false;
    if (!g_diagInitialized.compare_exchange_strong(expected, true)) return;

    g_bootMonotonicMs.store(MonotonicNowMs(), std::memory_order_relaxed);
    g_lastMainHbMs.store(g_bootMonotonicMs.load(), std::memory_order_relaxed);
    g_lastRenderHbMs.store(g_bootMonotonicMs.load(), std::memory_order_relaxed);

    std::filesystem::path root = os::process::GetExecutableRoot();
    std::filesystem::path logPath = root / "ios_debug.log";
    std::filesystem::path prevPath = root / "ios_debug_prev.log";

    std::error_code ec;
    if (std::filesystem::exists(logPath, ec)) {
        std::filesystem::rename(logPath, prevPath, ec);
    }

    {
        std::lock_guard<std::mutex> lock(g_logFileMutex);
        g_logFile = std::fopen(logPath.c_str(), "wb");
        if (g_logFile) {
            g_logFd = fileno(g_logFile);
            char hwModel[64] = "unknown";
            size_t hwLen = sizeof(hwModel) - 1;
            sysctlbyname("hw.machine", hwModel, &hwLen, nullptr, 0);
            NSOperatingSystemVersion osVer = [[NSProcessInfo processInfo] operatingSystemVersion];
            unsigned long long ramMiB = [[NSProcessInfo processInfo] physicalMemory] / (1024ULL * 1024ULL);
            std::fprintf(g_logFile,
                         "=== MarathonRecomp iOS Debug Log ===\n"
                         "Device: %s | iOS %ld.%ld.%ld | RAM: %llu MiB\n"
                         "LogPath: %s\n"
                         "====================================\n",
                         hwModel,
                         static_cast<long>(osVer.majorVersion),
                         static_cast<long>(osVer.minorVersion),
                         static_cast<long>(osVer.patchVersion),
                         ramMiB,
                         logPath.c_str());
            std::fflush(g_logFile);
        }
    }

    signal(SIGSEGV, SignalCrashHandler);
    signal(SIGBUS,  SignalCrashHandler);
    signal(SIGABRT, SignalCrashHandler);
    signal(SIGILL,  SignalCrashHandler);
    signal(SIGTRAP, SignalCrashHandler);
    signal(SIGFPE,  SignalCrashHandler);

    std::set_terminate([]() {
        std::lock_guard<std::mutex> lock(g_logFileMutex);
        WriteRawLogLocked("TERMINATE", "std::terminate invoked (unhandled C++ exception)");
        if (g_logFd >= 0) {
            void* frames[48];
            int count = backtrace(frames, 48);
            backtrace_symbols_fd(frames, count, g_logFd);
            fsync(g_logFd);
        }
        std::abort();
    });

    NSSetUncaughtExceptionHandler([](NSException *ex) {
        std::lock_guard<std::mutex> lock(g_logFileMutex);
        std::string info = std::string(ex.name ? ex.name.UTF8String : "NSException") + ": " +
                           (ex.reason ? ex.reason.UTF8String : "(no reason)");
        WriteRawLogLocked("NS_EXC", info.c_str());
        for (NSString *sym in ex.callStackSymbols) {
            WriteRawLogLocked("NS_EXC", sym.UTF8String);
        }
        if (g_logFd >= 0) fsync(g_logFd);
    });

    RegisterIOSLifecycleObservers();
    StartFreezeWatchdogThread();
}

} // anonymous namespace

extern "C" {

void MarathonIOS_LogLine(const char* tag, const char* msg) {
    EnsureDiagnosticsInitialized();
    std::lock_guard<std::mutex> lock(g_logFileMutex);
    WriteRawLogLocked(tag, msg);
}

void MarathonIOS_Heartbeat(const char* phase) {
    if (!g_diagInitialized.load(std::memory_order_acquire)) {
        EnsureDiagnosticsInitialized();
    }
    if (phase) {
        g_lastMainPhase.store(phase, std::memory_order_relaxed);
    }
    // Only sample clock_gettime once per completed frame (eliminates 480 syscalls/sec at 120 FPS)
    const bool isFrameEnd = (phase && std::strcmp(phase, "Video::Present:Done") == 0);
    if (isFrameEnd || !g_watchdogArmed.load(std::memory_order_relaxed)) {
        g_lastMainHbMs.store(MonotonicNowMs(), std::memory_order_release);
        if (isFrameEnd) {
            g_hbFrameCount.fetch_add(1, std::memory_order_relaxed);
        }
        if (g_stallDumpStage.load(std::memory_order_relaxed) != 0) {
            g_stallDumpStage.store(0, std::memory_order_relaxed);
            MarathonIOS_LogLine("WATCHDOG", "Heartbeat resumed after stall.");
        }
        g_watchdogArmed.store(true, std::memory_order_release);
    }
}

void MarathonIOS_RenderHeartbeat(const char* phase) {
    if (phase) {
        g_lastRenderPhase.store(phase, std::memory_order_relaxed);
    }
    static std::atomic<uint32_t> s_renderTick{0};
    if ((s_renderTick.fetch_add(1, std::memory_order_relaxed) & 7u) == 0u) {
        g_lastRenderHbMs.store(MonotonicNowMs(), std::memory_order_release);
    }
}

bool MarathonIOS_IsAppSuspended(void) {
    return g_appSuspended.load(std::memory_order_acquire);
}

void MarathonIOS_SetAppSuspended(bool suspended) {
    EnsureDiagnosticsInitialized();
    bool prev = g_appSuspended.exchange(suspended, std::memory_order_acq_rel);
    if (prev == suspended) return;

    if (suspended) {
        MarathonIOS_ResetVirtualControllerInputs();
        MarathonIOS_ApplyProMotionRefreshRate(g_effectiveTargetFps.load(std::memory_order_acquire));
        MarathonIOS_LogLine("LIFECYCLE", "App suspended (lock/background) — pausing Metal submissions & ProMotion cleanly");
    } else {
        uint64_t now = MonotonicNowMs();
        g_lastMainHbMs.store(now, std::memory_order_release);
        g_lastRenderHbMs.store(now, std::memory_order_release);
        g_stallDumpStage.store(0, std::memory_order_relaxed);
        {
            std::lock_guard<std::mutex> lock(g_suspendMutex);
        }
        g_suspendCv.notify_all();
        RefreshThermalAndProMotion(false);
        MarathonIOS_LogLine("LIFECYCLE", "App active (foreground/unlocked) — resuming Metal rendering immediately");
    }
}

void MarathonIOS_WaitUntilActive(void) {
    if (!g_appSuspended.load(std::memory_order_acquire)) return;

    if ([NSThread isMainThread]) {
        // Pump CFRunLoop so UIKit's UIApplicationDidBecomeActiveNotification is delivered immediately (zero deadlock!)
        while (g_appSuspended.load(std::memory_order_acquire)) {
            CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.025, true);
            uint64_t now = MonotonicNowMs();
            g_lastMainHbMs.store(now, std::memory_order_release);
        }
        uint64_t now = MonotonicNowMs();
        g_lastMainHbMs.store(now, std::memory_order_release);
        g_lastRenderHbMs.store(now, std::memory_order_release);
    } else {
        std::unique_lock<std::mutex> lock(g_suspendMutex);
        g_suspendCv.wait(lock, []() {
            return !g_appSuspended.load(std::memory_order_acquire);
        });
    }
}

void MarathonIOS_ApplyProMotionRefreshRate(int targetFps) {
    const BOOL suspended = g_appSuspended.load(std::memory_order_acquire) ? YES : NO;
    static std::atomic<int> s_lastAppliedKey{-1};
    const int key = (targetFps << 1) | (suspended ? 1 : 0);
    if (s_lastAppliedKey.exchange(key, std::memory_order_acq_rel) == key) return;

    auto updateBlock = ^{
        if (!g_proMotionDriver) {
            g_proMotionDriver = [[MarathonProMotionDriver alloc] init];
        }
        [g_proMotionDriver applyTargetFps:targetFps suspended:suspended];
    };
    if ([NSThread isMainThread]) {
        updateBlock();
    } else {
        dispatch_async(dispatch_get_main_queue(), updateBlock);
    }
}

void MarathonIOS_SetTargetFPS(int fps) {
    int normalized = 60;
    if (fps <= 35) normalized = 30;
    else if (fps >= 100) normalized = 120;
    else normalized = 60;

    const int prev = g_targetFps.exchange(normalized, std::memory_order_acq_rel);
    const int eff = ComputeEffectiveTargetFps(normalized, g_thermalState.load(std::memory_order_acquire));
    const int prevEff = g_effectiveTargetFps.exchange(eff, std::memory_order_acq_rel);
    if (prev != normalized || prevEff != eff) {
        MarathonIOS_ApplyProMotionRefreshRate(eff);
    }
}

int MarathonIOS_GetTargetFPS(void) {
    return g_targetFps.load(std::memory_order_acquire);
}

int MarathonIOS_GetEffectiveTargetFPS(void) {
    return g_effectiveTargetFps.load(std::memory_order_acquire);
}

int MarathonIOS_GetThermalState(void) {
    return g_thermalState.load(std::memory_order_acquire);
}

void MarathonIOS_GetHardwareProfile(MarathonIOSHardwareProfile* outProfile) {
    if (!outProfile) return;
    EnsureDiagnosticsInitialized();

    const uint64_t ramBytes = [[NSProcessInfo processInfo] physicalMemory];
    const uint32_t ramMiB = static_cast<uint32_t>(ramBytes / (1024ULL * 1024ULL));

    __block int maxHz = 60;
    __block float scale = 2.0f;
    __block bool isPad = false;
    auto queryUI = ^{
        UIScreen *screen = [UIScreen mainScreen];
        if (screen) {
            maxHz = static_cast<int>([screen maximumFramesPerSecond]);
            if (maxHz < 60) maxHz = 60;
            scale = static_cast<float>(screen.nativeScale);
            if (scale < 1.0f) scale = 2.0f;
        }
        isPad = ([UIDevice currentDevice].userInterfaceIdiom == UIUserInterfaceIdiomPad);
    };
    if ([NSThread isMainThread]) {
        queryUI();
    } else {
        dispatch_sync(dispatch_get_main_queue(), queryUI);
    }

    MarathonIOSHardwareProfile p{};
    p.ramMiB = ramMiB;
    p.maxRefreshHz = maxHz;
    p.screenScale = scale;
    p.isPad = isPad;

    // Smart mobile thermal tiering (paired with 2.0x Retina CAMetalLayer cap = 1748x804 on iPhone 16 Pro):
    // - Eliminates wasteful 3x Retina (2622x1206) + MSAA4x + 4096 shadows + 16x AF thermal meltdown
    // - Unlocks cool, locked 120 FPS ProMotion on iPhone 15 Pro / 16 Pro / M-series ProMotion iPads
    if (ramMiB >= 7500 && maxHz >= 120) {
        // Tier 3: ProMotion 120Hz Flagship (iPhone 15 Pro / 16 Pro / 16 Pro Max / ProMotion M-series iPad)
        p.tier = 3;
        p.recommendedFps = 120;
        p.recommendedResScale = isPad ? 0.80f : 0.85f; // ~1486x683 internal on iPhone 16 Pro (crisper than 720p, <50% fillrate)
        p.recommendedAA = 0;         // Off (avoids TBDR MSAA tile bandwidth & heat)
        p.recommendedShadowRes = 1;  // x1024
        p.recommendedReflection = 1; // Quarter
        p.recommendedRadialBlur = 1; // Original
        p.recommendedAF = 4;
    } else if (ramMiB >= 7500) {
        // Tier 2: 60Hz Flagship (iPhone 16 / 16 Plus / 60Hz 8GB iPad)
        p.tier = 2;
        p.recommendedFps = 60;
        p.recommendedResScale = isPad ? 0.85f : 0.90f;
        p.recommendedAA = 0;
        p.recommendedShadowRes = 1;  // x1024
        p.recommendedReflection = 1; // Quarter
        p.recommendedRadialBlur = 1; // Original
        p.recommendedAF = 4;
    } else if (ramMiB >= 5500) {
        // Tier 1: Mid-High (iPhone 13 Pro / 14 / 15 / 6GB iPad)
        p.tier = 1;
        p.recommendedFps = 60;
        p.recommendedResScale = 0.75f;
        p.recommendedAA = 0;
        p.recommendedShadowRes = 1;  // x1024
        p.recommendedReflection = 1; // Quarter
        p.recommendedRadialBlur = 1; // Original
        p.recommendedAF = 4;
    } else {
        // Tier 0: Compact / 4GB devices
        p.tier = 0;
        p.recommendedFps = 30;
        p.recommendedResScale = 0.60f;
        p.recommendedAA = 0;
        p.recommendedShadowRes = 0;  // x512
        p.recommendedReflection = 0; // Eighth
        p.recommendedRadialBlur = 0; // Off
        p.recommendedAF = 2;
    }

    *outProfile = p;

    char buf[256];
    std::snprintf(buf, sizeof(buf),
                  "tier=%d ram=%uMiB hz=%d scale=%.1fx pad=%d -> fps=%d resScale=%.2f AA=%d shadow=%d refl=%d blur=%d AF=%d",
                  p.tier, p.ramMiB, p.maxRefreshHz, p.screenScale, p.isPad ? 1 : 0,
                  p.recommendedFps, p.recommendedResScale, p.recommendedAA,
                  p.recommendedShadowRes, p.recommendedReflection, p.recommendedRadialBlur, p.recommendedAF);
    MarathonIOS_LogLine("AUTOCFG", buf);
}

} // extern "C"

namespace os::locale {

std::string ConvertToUTF8(Encoding in_encoding, const std::string& in_rStr) {
    CFStringEncoding cfEncoding = kCFStringEncodingUTF8;
    switch (in_encoding) {
        case Encoding::ShiftJIS:
            cfEncoding = kCFStringEncodingDOSJapanese;
            break;
        default:
            return in_rStr;
    }

    CFDataRef cfData = CFDataCreateWithBytesNoCopy(
        nullptr,
        reinterpret_cast<const UInt8*>(in_rStr.data()),
        static_cast<CFIndex>(in_rStr.size()),
        kCFAllocatorNull
    );
    if (!cfData) return in_rStr;

    CFStringRef cfStr = CFStringCreateFromExternalRepresentation(nullptr, cfData, cfEncoding);
    CFRelease(cfData);
    if (!cfStr) return in_rStr;

    CFDataRef utf8Data = CFStringCreateExternalRepresentation(nullptr, cfStr, kCFStringEncodingUTF8, 0);
    CFRelease(cfStr);
    if (!utf8Data) return in_rStr;

    std::string result(
        reinterpret_cast<const char*>(CFDataGetBytePtr(utf8Data)),
        static_cast<size_t>(CFDataGetLength(utf8Data))
    );
    CFRelease(utf8Data);
    return result;
}

} // namespace os::locale

namespace os::logger {

static os_log_t g_marathonLog = nullptr;

void Init() {
    if (!g_marathonLog) {
        g_marathonLog = os_log_create("com.marathonrecomp.ios", "engine");
    }
    EnsureDiagnosticsInitialized();
}

void Log(const std::string_view str, ELogType type, const char* func) {
    if (!g_marathonLog) Init();
    std::string msg(str);
    const char* level = (type == ELogType::Error) ? "ERR" :
                        (type == ELogType::Warning) ? "WARN" : "INFO";
    if (func) {
        os_log_with_type(g_marathonLog,
                         type == ELogType::Error ? OS_LOG_TYPE_ERROR : OS_LOG_TYPE_INFO,
                         "[%{public}s] %{public}s", func, msg.c_str());
        std::string full = std::string("[") + func + "] " + msg;
        std::lock_guard<std::mutex> lock(g_logFileMutex);
        WriteRawLogLocked(level, full.c_str());
    } else {
        os_log_with_type(g_marathonLog,
                         type == ELogType::Error ? OS_LOG_TYPE_ERROR : OS_LOG_TYPE_INFO,
                         "%{public}s", msg.c_str());
        std::lock_guard<std::mutex> lock(g_logFileMutex);
        WriteRawLogLocked(level, msg.c_str());
    }
}

} // namespace os::logger

namespace os::media {

bool IsExternalMediaPlaying() {
    return [[AVAudioSession sharedInstance] isOtherAudioPlaying] ? true : false;
}

} // namespace os::media

namespace os::process {

std::filesystem::path GetExecutablePath() {
    uint32_t size = PATH_MAX;
    char buf[PATH_MAX] = {};
    if (_NSGetExecutablePath(buf, &size) == 0) {
        return std::filesystem::path(buf);
    }
    return {};
}

std::filesystem::path GetExecutableRoot() {
    NSArray<NSURL *> *paths = [[NSFileManager defaultManager]
        URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask];
    if (paths.count > 0) {
        auto docs = std::filesystem::path(paths.firstObject.fileSystemRepresentation) / "MarathonRecomp";
        std::error_code ec;
        std::filesystem::create_directories(docs, ec);
        return docs;
    }
    return GetExecutablePath().parent_path();
}

std::filesystem::path GetWorkingDirectory() {
    return GetExecutableRoot();
}

bool SetWorkingDirectory(const std::filesystem::path& path) {
    return chdir(path.c_str()) == 0;
}

bool StartProcess(const std::filesystem::path&, const std::vector<std::string>&, std::filesystem::path) {
    // iOS apps cannot spawn child processes. Config restarts are saved to disk;
    // the UI prompts the user to relaunch the app cleanly.
    return false;
}

void CheckConsole() {}

void ShowConsole() {}

} // namespace os::process

namespace os::user {

bool IsDarkTheme() {
    __block bool dark = true;
    auto check = ^{
        UITraitCollection *traits = [UIScreen mainScreen].traitCollection;
        dark = (traits.userInterfaceStyle == UIUserInterfaceStyleDark);
    };
    if ([NSThread isMainThread]) check();
    else dispatch_sync(dispatch_get_main_queue(), check);
    return dark;
}

} // namespace os::user

namespace os::version {

OSVersion GetOSVersion() {
    NSOperatingSystemVersion v = [[NSProcessInfo processInfo] operatingSystemVersion];
    OSVersion out{};
    out.Major = static_cast<uint32_t>(v.majorVersion);
    out.Minor = static_cast<uint32_t>(v.minorVersion);
    out.Build = static_cast<uint32_t>(v.patchVersion);
    return out;
}

} // namespace os::version
