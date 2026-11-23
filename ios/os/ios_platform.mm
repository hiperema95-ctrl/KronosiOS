// Clean-room iOS OS Platform Implementation for MarathonRecomp v1.0.0
// Replaces os/macos/* calls that rely on macOS-only APIs or non-writable bundle paths.

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreFoundation/CoreFoundation.h>
#import <os/log.h>
#include <mach-o/dyld.h>
#include <sys/param.h>
#include <unistd.h>

#include <filesystem>
#include <string>
#include <string_view>

#include <os/locale.h>
#include <os/logger.h>
#include <os/media.h>
#include <os/process.h>
#include <os/user.h>
#include <os/version.h>

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
    g_marathonLog = os_log_create("com.marathonrecomp.ios", "engine");
}

void Log(const std::string_view str, ELogType type, const char* func) {
    if (!g_marathonLog) Init();
    std::string msg(str);
    if (func) {
        os_log_with_type(g_marathonLog,
                         type == ELogType::Error ? OS_LOG_TYPE_ERROR : OS_LOG_TYPE_INFO,
                         "[%{public}s] %{public}s", func, msg.c_str());
    } else {
        os_log_with_type(g_marathonLog,
                         type == ELogType::Error ? OS_LOG_TYPE_ERROR : OS_LOG_TYPE_INFO,
                         "%{public}s", msg.c_str());
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
