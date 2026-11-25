// Clean-room iOS OS Platform Implementation for MarathonRecomp v1.0.0
// Replaces os/macos/* calls that rely on macOS-only APIs or non-writable bundle paths.
// Includes persistent Documents/MarathonRecomp/ios_debug.log diagnostics, crash backtrace
// capture, and an ARM64 Mach thread-state freeze watchdog for on-device debugging.

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreFoundation/CoreFoundation.h>
#import <os/log.h>
#include <dlfcn.h>
#include <execinfo.h>
#include <fcntl.h>
#include <mach-o/dyld.h>
#include <mach/mach.h>
#include <pthread.h>
#include <signal.h>
#include <sys/param.h>
#include <sys/sysctl.h>
#include <time.h>
#include <unistd.h>

#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <exception>
#include <filesystem>
#include <mutex>
#include <string>
#include <string_view>
#include <thread>

#include <os/locale.h>
#include <os/logger.h>
#include <os/media.h>
#include <os/process.h>
#include <os/user.h>
#include <os/version.h>

namespace {

static std::mutex g_logFileMutex;
static FILE* g_logFile = nullptr;
static int g_logFd = -1;
static std::atomic<uint64_t> g_bootMonotonicMs{0};
static std::atomic<bool> g_diagInitialized{false};

static std::atomic<bool> g_watchdogArmed{false};
static std::atomic<uint64_t> g_lastMainHbMs{0};
static std::atomic<const char*> g_lastMainPhase{"boot"};
static std::atomic<uint64_t> g_lastRenderHbMs{0};
static std::atomic<const char*> g_lastRenderPhase{"idle"};
static std::atomic<uint64_t> g_hbFrameCount{0};
static std::atomic<int> g_stallDumpStage{0};

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
    std::fflush(g_logFile);
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

static void StartFreezeWatchdogThread() {
    std::thread([]() {
        pthread_setname_np("MarathonIOSWatchdog");
        static constexpr uint64_t kThresholdsMs[3] = { 4000, 12000, 30000 };
        while (true) {
            std::this_thread::sleep_for(std::chrono::seconds(1));
            if (!g_watchdogArmed.load(std::memory_order_acquire)) continue;
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
    EnsureDiagnosticsInitialized();
    g_lastMainHbMs.store(MonotonicNowMs(), std::memory_order_release);
    if (phase) {
        g_lastMainPhase.store(phase, std::memory_order_relaxed);
    }
    if (phase && std::strcmp(phase, "Video::Present:Done") == 0) {
        g_hbFrameCount.fetch_add(1, std::memory_order_relaxed);
    }
    if (g_stallDumpStage.load(std::memory_order_relaxed) != 0) {
        g_stallDumpStage.store(0, std::memory_order_relaxed);
        MarathonIOS_LogLine("WATCHDOG", "Heartbeat resumed after stall.");
    }
    g_watchdogArmed.store(true, std::memory_order_release);
}

void MarathonIOS_RenderHeartbeat(const char* phase) {
    g_lastRenderHbMs.store(MonotonicNowMs(), std::memory_order_release);
    if (phase) {
        g_lastRenderPhase.store(phase, std::memory_order_relaxed);
    }
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
