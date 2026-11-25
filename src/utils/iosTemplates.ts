/**
 * Native iOS (Objective-C++, CMake, Info.plist, Entitlements) clean-room templates
 * for sonicnext-dev/MarathonRecomp v1.0.0.
 *
 * Key architectural upgrades over third-party forks:
 * - Direct .xiso / .iso selection in the base-game launcher step (no PC extraction required)
 * - Streaming pread() ISOFileSystem avoiding 6+ GB mmap virtual address exhaustion on iOS
 * - Separate DLC step preserving upstream 7-pack STFS/XContent & folder validation
 * - Full NFD-Extended multi-file/multi-folder UIDocumentPickerViewController bridge
 * - Native Metal 3 via Plume (or optional MoltenVK), CoreHaptics Xbox 360 touch controller,
 *   and zero-copyright public repository structure.
 */

export interface MarathonIosTemplateParams {
  appName: string;
  bundleId: string;
  appVersion: string;
  deploymentTarget: '17.0' | '17.4' | '18.0';
  rendererBackend: 'metal3-native' | 'moltenvk-metal3';
  enable120HzProMotion: boolean;
  enableIncreasedMemoryLimit: boolean;
  enableVirtualGamepad: boolean;
  enableDirectXisoImport: boolean;
  enableFileSharingApp: boolean;
  targetInstaller: 'both' | 'feather' | 'livecontainer';
}

export function generateInfoPlist(p: MarathonIosTemplateParams): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleDisplayName</key>
    <string>${p.appName}</string>
    <key>CFBundleExecutable</key>
    <string>MarathonRecomp</string>
    <key>CFBundleIdentifier</key>
    <string>${p.bundleId}</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>${p.appName}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${p.appVersion}</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundleIconName</key>
    <string>AppIcon</string>
    <key>CFBundleIcons</key>
    <dict>
        <key>CFBundlePrimaryIcon</key>
        <dict>
            <key>CFBundleIconName</key>
            <string>AppIcon</string>
            <key>CFBundleIconFiles</key>
            <array>
                <string>AppIcon60x60</string>
            </array>
        </dict>
    </dict>
    <key>CFBundleIcons~ipad</key>
    <dict>
        <key>CFBundlePrimaryIcon</key>
        <dict>
            <key>CFBundleIconName</key>
            <string>AppIcon</string>
            <key>CFBundleIconFiles</key>
            <array>
                <string>AppIcon60x60</string>
                <string>AppIcon76x76</string>
            </array>
        </dict>
    </dict>
    <key>LSRequiresIPhoneOS</key>
    <true/>
    <key>MinimumOSVersion</key>
    <string>${p.deploymentTarget}</string>
    <key>UIDeviceFamily</key>
    <array>
        <integer>1</integer>
        <integer>2</integer>
    </array>
    <key>UILaunchScreen</key>
    <dict/>
    <key>UIApplicationSupportsIndirectInputEvents</key>
    <true/>
    <key>UIRequiredDeviceCapabilities</key>
    <array>
        <string>arm64</string>
        <string>metal</string>
    </array>
    <key>UIRequiresFullScreen</key>
    <true/>
    <key>UIStatusBarHidden</key>
    <true/>
    <key>UIViewControllerBasedStatusBarAppearance</key>
    <false/>
    <key>UISupportedInterfaceOrientations</key>
    <array>
        <string>UIInterfaceOrientationLandscapeLeft</string>
        <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
    <key>UISupportedInterfaceOrientations~ipad</key>
    <array>
        <string>UIInterfaceOrientationLandscapeLeft</string>
        <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
    <key>CADisableMinimumFrameDurationOnPhone</key>
    <${p.enable120HzProMotion ? 'true' : 'false'}/>
    <key>UIFileSharingEnabled</key>
    <${p.enableFileSharingApp ? 'true' : 'false'}/>
    <key>LSSupportsOpeningDocumentsInPlace</key>
    <${p.enableFileSharingApp ? 'true' : 'false'}/>
    <key>UISupportsDocumentBrowser</key>
    <false/>
    <key>GCSupportsControllerUserInteraction</key>
    <true/>
    <key>GCSupportedGameControllers</key>
    <array>
        <dict>
            <key>ProfileName</key>
            <string>ExtendedGamepad</string>
        </dict>
    </array>
    <key>UTImportedTypeDeclarations</key>
    <array>
        <dict>
            <key>UTTypeIdentifier</key>
            <string>com.marathonrecomp.xbox360-xiso</string>
            <key>UTTypeDescription</key>
            <string>Xbox 360 XISO Disc Image</string>
            <key>UTTypeConformsTo</key>
            <array>
                <string>public.disk-image</string>
                <string>public.data</string>
            </array>
            <key>UTTypeTagSpecification</key>
            <dict>
                <key>public.filename-extension</key>
                <array>
                    <string>xiso</string>
                    <string>iso</string>
                </array>
            </dict>
        </dict>
    </array>
</dict>
</plist>
`;
}

export function generateEntitlementsPlist(p: MarathonIosTemplateParams): string {
  const memEntries = p.enableIncreasedMemoryLimit
    ? `    <key>com.apple.developer.kernel.increased-memory-limit</key>
    <true/>
    <key>com.apple.developer.kernel.extended-virtual-addressing</key>
    <true/>
    <key>get-task-allow</key>
    <true/>`
    : `    <key>com.apple.developer.kernel.extended-virtual-addressing</key>
    <true/>
    <key>get-task-allow</key>
    <true/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${memEntries}
</dict>
</plist>
`;
}

export function generateNfdHeader(): string {
  return `// Clean-room Native File Dialog Extended (NFD) compatible header for iOS 17+
// Implements single and multi-selection file/folder APIs used by MarathonRecomp v1.0.0 installer_wizard.cpp
#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef char nfdu8char_t;
typedef nfdu8char_t nfdnchar_t;
typedef size_t nfdfiltersize_t;
typedef size_t nfdpathsetsize_t;

typedef struct {
    const nfdu8char_t* name;
    const nfdu8char_t* spec;
} nfdu8filteritem_t;

typedef nfdu8filteritem_t nfdnfilteritem_t;
typedef void nfdpathset_t;

typedef enum {
    NFD_ERROR = 0,
    NFD_OKAY = 1,
    NFD_CANCEL = 2
} nfdresult_t;

nfdresult_t NFD_Init(void);
void NFD_Quit(void);
const char* NFD_GetError(void);
void NFD_ClearError(void);

void NFD_FreePathU8(nfdu8char_t* filePath);
#define NFD_FreePathN NFD_FreePathU8

nfdresult_t NFD_OpenDialogU8(
    nfdu8char_t** outPath,
    const nfdu8filteritem_t* filterList,
    nfdfiltersize_t filterCount,
    const nfdu8char_t* defaultPath
);

nfdresult_t NFD_PickFolderU8(
    nfdu8char_t** outPath,
    const nfdu8char_t* defaultPath
);

nfdresult_t NFD_OpenDialogMultipleN(
    const nfdpathset_t** outPaths,
    const nfdnfilteritem_t* filterList,
    nfdfiltersize_t filterCount,
    const nfdnchar_t* defaultPath
);

nfdresult_t NFD_PickFolderMultipleN(
    const nfdpathset_t** outPaths,
    const nfdnchar_t* defaultPath
);

nfdresult_t NFD_PathSet_GetCount(const nfdpathset_t* pathSet, nfdpathsetsize_t* count);
nfdresult_t NFD_PathSet_GetPathN(const nfdpathset_t* pathSet, nfdpathsetsize_t index, nfdnchar_t** outPath);
void NFD_PathSet_FreePathN(nfdnchar_t* filePath);
void NFD_PathSet_Free(const nfdpathset_t* pathSet);

// iOS-specific helper: sets launcher hint so SelectGame prioritizes direct .xiso/.iso
// while SelectDLC allows multi-selection of Xbox 360 STFS DLC packages or folders.
typedef enum {
    MARATHON_IOS_PICKER_MODE_GENERIC = 0,
    MARATHON_IOS_PICKER_MODE_GAME_XISO = 1,
    MARATHON_IOS_PICKER_MODE_DLC_SEPARATE = 2
} MarathonIOSPickerMode;

void MarathonIOS_SetPickerMode(MarathonIOSPickerMode mode);

#ifdef __cplusplus
}
#endif
`;
}

export function generateNfdIosMm(p: MarathonIosTemplateParams): string {
  return `// Clean-room iOS UIDocumentPickerViewController bridge for MarathonRecomp v1.0.0
// Inspired by hiperema95-ctrl/edgyios:
// - Direct .xiso / .iso selection in SelectGame (no external unpacking required!)
// - Zero-copy local detection inside Documents/MarathonRecomp/
// - APFS O(1) clone/move via asCopy:YES for Feather & LiveContainer compatibility
// - Full multi-file & folder support for separate Xbox 360 DLC installation in SelectDLC

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#include <nfd.h>

#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

struct MarathonPathSet {
    std::vector<std::string> paths;
};

static std::string g_lastNfdError;
static MarathonIOSPickerMode g_pickerMode = MARATHON_IOS_PICKER_MODE_GENERIC;

extern "C" void MarathonIOS_SetPickerMode(MarathonIOSPickerMode mode) {
    g_pickerMode = mode;
}

static char* DuplicateCString(const std::string& str) {
    char* copy = static_cast<char*>(std::malloc(str.size() + 1));
    if (!copy) return nullptr;
    std::memcpy(copy, str.c_str(), str.size() + 1);
    return copy;
}

@interface MarathonDocumentPickerDelegate : NSObject <UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate>
@property (nonatomic, assign) BOOL pickFolder;
@property (nonatomic, assign) BOOL usedCopyMode;
@property (nonatomic, assign) BOOL finished;
@property (nonatomic, assign) BOOL cancelled;
@property (nonatomic, strong) NSMutableArray<NSString *> *resolvedPaths;
@end

@implementation MarathonDocumentPickerDelegate

- (instancetype)init {
    self = [super init];
    if (self) {
        _resolvedPaths = [NSMutableArray array];
    }
    return self;
}

- (void)finishCancelled:(BOOL)cancelled {
    self.cancelled = cancelled;
    self.finished = YES;
}

- (NSString *)stageURLForMarathon:(NSURL *)url {
    if (!url) return nil;
    BOOL accessed = [url startAccessingSecurityScopedResource];
    NSFileManager *fm = [NSFileManager defaultManager];
    NSURL *docs = [[fm URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask] firstObject];

    NSString *subDir = (g_pickerMode == MARATHON_IOS_PICKER_MODE_DLC_SEPARATE)
        ? @"MarathonRecomp/imports/dlc"
        : @"MarathonRecomp/imports/game";
    NSURL *importDir = [docs URLByAppendingPathComponent:subDir isDirectory:YES];
    [fm createDirectoryAtURL:importDir withIntermediateDirectories:YES attributes:nil error:nil];

    NSString *resolved = nil;
    // 1. Already inside Documents/ -> use directly with zero extra disk usage
    if ([url.path hasPrefix:docs.path]) {
        resolved = url.path;
    } else if (self.pickFolder) {
        // 2. Folder picker uses asCopy:NO -> retain security-scoped access directly without copying gigabytes on main thread
        if (accessed) {
            static NSMutableArray<NSURL *> *g_retainedScopedURLs = nil;
            if (!g_retainedScopedURLs) g_retainedScopedURLs = [NSMutableArray array];
            [g_retainedScopedURLs addObject:url];
        }
        resolved = url.path;
    } else {
        NSURL *destURL = [importDir URLByAppendingPathComponent:url.lastPathComponent];
        [fm removeItemAtURL:destURL error:nil];
        NSError *fsErr = nil;

        // 3. With asCopy:YES iOS already creates an APFS CoW clone in tmp/Inbox;
        //    moveItemAtURL is O(1) instant even for 6.5 GB Xbox 360 .xiso images!
        if (self.usedCopyMode && [fm moveItemAtURL:url toURL:destURL error:&fsErr]) {
            resolved = destURL.path;
        } else if ([fm copyItemAtURL:url toURL:destURL error:&fsErr]) {
            resolved = destURL.path;
        } else {
            // 4. Fallback: retain security-scoped URL directly
            if (accessed) {
                static NSMutableArray<NSURL *> *g_retainedScopedURLs = nil;
                if (!g_retainedScopedURLs) g_retainedScopedURLs = [NSMutableArray array];
                [g_retainedScopedURLs addObject:url];
            }
            resolved = url.path;
        }
    }

    if (accessed && ![resolved isEqualToString:url.path]) {
        [url stopAccessingSecurityScopedResource];
    }
    return resolved;
}

- (void)documentPicker:(UIDocumentPickerViewController *)controller didPickDocumentsAtURLs:(NSArray<NSURL *> *)urls {
    for (NSURL *url in urls) {
        NSString *staged = [self stageURLForMarathon:url];
        if (staged.length > 0) {
            [self.resolvedPaths addObject:staged];
        }
    }
    [self finishCancelled:(self.resolvedPaths.count == 0)];
}

- (void)documentPickerWasCancelled:(UIDocumentPickerViewController *)controller {
    [self finishCancelled:YES];
}

- (void)presentationControllerDidDismiss:(UIPresentationController *)presentationController {
    [self finishCancelled:YES];
}

@end

static UIViewController* GetTopViewController(void) {
    UIWindow *keyWindow = nil;
    for (UIScene *scene in [UIApplication sharedApplication].connectedScenes) {
        if (scene.activationState == UISceneActivationStateForegroundActive &&
            [scene isKindOfClass:[UIWindowScene class]]) {
            UIWindowScene *ws = (UIWindowScene *)scene;
            if (![ws.session.role isEqualToString:UIWindowSceneSessionRoleApplication]) continue;
            for (UIWindow *w in ws.windows) {
                if (w.isKeyWindow) { keyWindow = w; break; }
            }
            if (!keyWindow) keyWindow = ws.windows.firstObject;
        }
    }
    UIViewController *top = keyWindow.rootViewController;
    while (top.presentedViewController) {
        top = top.presentedViewController;
    }
    return top;
}

static NSArray<NSURL *> *ScanLocalXisoCandidates(void) {
    NSMutableArray<NSURL *> *found = [NSMutableArray array];
    NSFileManager *fm = [NSFileManager defaultManager];
    NSURL *docs = [[fm URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask] firstObject];
    if (!docs) return found;

    NSArray<NSURL *> *dirs = @[
        docs,
        [docs URLByAppendingPathComponent:@"MarathonRecomp" isDirectory:YES],
        [docs URLByAppendingPathComponent:@"MarathonRecomp/imports/game" isDirectory:YES]
    ];

    for (NSURL *dir in dirs) {
        NSArray<NSURL *> *items = [fm contentsOfDirectoryAtURL:dir
                                    includingPropertiesForKeys:@[NSURLIsDirectoryKey]
                                                       options:NSDirectoryEnumerationSkipsHiddenFiles
                                                         error:nil];
        for (NSURL *item in items) {
            NSNumber *isDir = nil;
            [item getResourceValue:&isDir forKey:NSURLIsDirectoryKey error:nil];
            if (isDir.boolValue) continue;
            NSString *ext = item.pathExtension.lowercaseString;
            if ([ext isEqualToString:@"xiso"] || [ext isEqualToString:@"iso"]) {
                [found addObject:item];
            }
        }
    }
    return found;
}

static MarathonDocumentPickerDelegate *g_activeDelegate = nil;

static nfdresult_t RunIOSPicker(std::vector<std::string>& outPaths, BOOL folderMode, BOOL allowMultiple) {
    outPaths.clear();

    MarathonDocumentPickerDelegate *delegate = [[MarathonDocumentPickerDelegate alloc] init];
    delegate.pickFolder = folderMode;
    delegate.usedCopyMode = !folderMode;
    delegate.finished = NO;
    delegate.cancelled = YES;
    g_activeDelegate = delegate;

    void (^presentSystemPicker)(UIViewController *) = ^(UIViewController *presenter) {
        NSArray<UTType *> *types = folderMode
            ? @[UTTypeFolder]
            : @[UTTypeDiskImage, UTTypeData, UTTypeContent, UTTypeItem];

        UIDocumentPickerViewController *picker =
            [[UIDocumentPickerViewController alloc] initForOpeningContentTypes:types asCopy:!folderMode];
        picker.delegate = delegate;
        picker.allowsMultipleSelection = allowMultiple;
        picker.modalPresentationStyle = UIModalPresentationFormSheet;
        picker.presentationController.delegate = delegate;
        [presenter presentViewController:picker animated:YES completion:nil];
    };

    dispatch_async(dispatch_get_main_queue(), ^{
        UIViewController *presenter = GetTopViewController();
        if (!presenter) {
            g_lastNfdError = "No active UIViewController found to present Files picker";
            [delegate finishCancelled:YES];
            return;
        }

${p.enableDirectXisoImport ? `        // Direct XISO quick-select sheet (edgyios pattern):
        // If user already placed a Sonic '06 .xiso/.iso in Files -> On My iPhone -> MarathonRecomp,
        // offer instant zero-copy selection without duplicating 6.5 GB!
        if (!folderMode && g_pickerMode == MARATHON_IOS_PICKER_MODE_GAME_XISO) {
            NSArray<NSURL *> *localIsos = ScanLocalXisoCandidates();
            if (localIsos.count > 0) {
                UIAlertController *sheet = [UIAlertController
                    alertControllerWithTitle:@"Seleziona Immagine XISO / ISO"
                                     message:@"Trovati file Xbox 360 in Documenti/MarathonRecomp. Seleziona direttamente il file .xiso senza scompattarlo:"
                              preferredStyle:UIAlertControllerStyleActionSheet];
                for (NSURL *isoURL in localIsos) {
                    UIAlertAction *pickLocal = [UIAlertAction
                        actionWithTitle:isoURL.lastPathComponent
                                  style:UIAlertActionStyleDefault
                                handler:^(__unused UIAlertAction *action) {
                                    [delegate.resolvedPaths addObject:isoURL.path];
                                    [delegate finishCancelled:NO];
                                }];
                    [sheet addAction:pickLocal];
                }
                [sheet addAction:[UIAlertAction
                    actionWithTitle:@"Sfoglia App File (.xiso / .iso)..."
                              style:UIAlertActionStyleDefault
                            handler:^(__unused UIAlertAction *action) {
                                presentSystemPicker(presenter);
                            }]];
                [sheet addAction:[UIAlertAction
                    actionWithTitle:@"Annulla"
                              style:UIAlertActionStyleCancel
                            handler:^(__unused UIAlertAction *action) {
                                [delegate finishCancelled:YES];
                            }]];
                if (sheet.popoverPresentationController) {
                    sheet.popoverPresentationController.sourceView = presenter.view;
                    sheet.popoverPresentationController.sourceRect = CGRectMake(
                        CGRectGetMidX(presenter.view.bounds),
                        CGRectGetMidY(presenter.view.bounds), 1, 1);
                }
                [presenter presentViewController:sheet animated:YES completion:nil];
                return;
            }
        }` : `        // Standard system document picker`}

        presentSystemPicker(presenter);
    });

    // Pump runloop safely until picker completes (called from MarathonRecomp installer thread/main)
    while (!delegate.finished) {
        if ([NSThread isMainThread]) {
            [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode
                                     beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.02]];
        } else {
            [NSThread sleepForTimeInterval:0.02];
        }
    }

    nfdresult_t result = NFD_CANCEL;
    if (!delegate.cancelled && delegate.resolvedPaths.count > 0) {
        for (NSString *path in delegate.resolvedPaths) {
            outPaths.emplace_back(path.fileSystemRepresentation);
        }
        result = NFD_OKAY;
    }

    g_activeDelegate = nil;
    return result;
}

extern "C" {

nfdresult_t NFD_Init(void) {
    g_lastNfdError.clear();
    return NFD_OKAY;
}

void NFD_Quit(void) {}

const char* NFD_GetError(void) {
    return g_lastNfdError.empty() ? nullptr : g_lastNfdError.c_str();
}

void NFD_ClearError(void) {
    g_lastNfdError.clear();
}

void NFD_FreePathU8(nfdu8char_t* filePath) {
    std::free(filePath);
}

nfdresult_t NFD_OpenDialogU8(
    nfdu8char_t** outPath,
    const nfdu8filteritem_t*,
    nfdfiltersize_t,
    const nfdu8char_t*
) {
    if (!outPath) return NFD_ERROR;
    *outPath = nullptr;
    std::vector<std::string> picked;
    auto res = RunIOSPicker(picked, NO, NO);
    if (res == NFD_OKAY && !picked.empty()) {
        *outPath = DuplicateCString(picked.front());
        return *outPath ? NFD_OKAY : NFD_ERROR;
    }
    return res;
}

nfdresult_t NFD_PickFolderU8(nfdu8char_t** outPath, const nfdu8char_t*) {
    if (!outPath) return NFD_ERROR;
    *outPath = nullptr;
    std::vector<std::string> picked;
    auto res = RunIOSPicker(picked, YES, NO);
    if (res == NFD_OKAY && !picked.empty()) {
        *outPath = DuplicateCString(picked.front());
        return *outPath ? NFD_OKAY : NFD_ERROR;
    }
    return res;
}

nfdresult_t NFD_OpenDialogMultipleN(
    const nfdpathset_t** outPaths,
    const nfdnfilteritem_t*,
    nfdfiltersize_t,
    const nfdnchar_t*
) {
    if (!outPaths) return NFD_ERROR;
    *outPaths = nullptr;
    auto* set = new MarathonPathSet();
    BOOL allowMulti = (g_pickerMode == MARATHON_IOS_PICKER_MODE_DLC_SEPARATE) ? YES : NO;
    auto res = RunIOSPicker(set->paths, NO, allowMulti);
    if (res == NFD_OKAY && !set->paths.empty()) {
        *outPaths = set;
        return NFD_OKAY;
    }
    delete set;
    return res;
}

nfdresult_t NFD_PickFolderMultipleN(const nfdpathset_t** outPaths, const nfdnchar_t*) {
    if (!outPaths) return NFD_ERROR;
    *outPaths = nullptr;
    auto* set = new MarathonPathSet();
    auto res = RunIOSPicker(set->paths, YES, YES);
    if (res == NFD_OKAY && !set->paths.empty()) {
        *outPaths = set;
        return NFD_OKAY;
    }
    delete set;
    return res;
}

nfdresult_t NFD_PathSet_GetCount(const nfdpathset_t* pathSet, nfdpathsetsize_t* count) {
    if (!pathSet || !count) return NFD_ERROR;
    auto* set = static_cast<const MarathonPathSet*>(pathSet);
    *count = set->paths.size();
    return NFD_OKAY;
}

nfdresult_t NFD_PathSet_GetPathN(const nfdpathset_t* pathSet, nfdpathsetsize_t index, nfdnchar_t** outPath) {
    if (!pathSet || !outPath) return NFD_ERROR;
    auto* set = static_cast<const MarathonPathSet*>(pathSet);
    if (index >= set->paths.size()) return NFD_ERROR;
    *outPath = DuplicateCString(set->paths[index]);
    return *outPath ? NFD_OKAY : NFD_ERROR;
}

void NFD_PathSet_FreePathN(nfdnchar_t* filePath) {
    std::free(filePath);
}

void NFD_PathSet_Free(const nfdpathset_t* pathSet) {
    delete static_cast<const MarathonPathSet*>(pathSet);
}

} // extern "C"
`;
}

export function generateIosPlatformMm(): string {
  return `// Clean-room iOS OS Platform Implementation for MarathonRecomp v1.0.0
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
    std::fprintf(g_logFile, "[+%8.3fs][T:%06llx][%s] %s\\n",
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
                      "\\n================ FATAL SIGNAL %d ================\\n"
                      "MainPhase=%s | RenderPhase=%s | Frames=%llu\\n",
                      sig,
                      g_lastMainPhase.load(std::memory_order_relaxed),
                      g_lastRenderPhase.load(std::memory_order_relaxed),
                      static_cast<unsigned long long>(g_hbFrameCount.load(std::memory_order_relaxed)));
        SafeWriteFd(fd, hdr);
        void* frames[64];
        int count = backtrace(frames, 64);
        backtrace_symbols_fd(frames, count, fd);
        SafeWriteFd(fd, "================ END SIGNAL ================\\n");
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
                 "\\n================ FREEZE WATCHDOG: STALL %llums (frames=%llu) ================\\n"
                 "MainPhase=%s (age=%llums) | RenderPhase=%s (age=%llums)\\n",
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
        std::fprintf(g_logFile, "Active Mach threads: %u\\n", static_cast<unsigned int>(threadCount));
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
                             "  [T#%02u port=0x%x state=%d cpu=%d] PC=%s | LR=%s\\n",
                             static_cast<unsigned int>(i),
                             static_cast<unsigned int>(threads[i]),
                             runState, cpuUsage, pcSym, lrSym);
            } else {
                std::fprintf(g_logFile, "  [T#%02u port=0x%x state=%d cpu=%d] (thread_get_state unavailable)\\n",
                             static_cast<unsigned int>(i),
                             static_cast<unsigned int>(threads[i]),
                             runState, cpuUsage);
            }
#else
            std::fprintf(g_logFile, "  [T#%02u port=0x%x state=%d cpu=%d]\\n",
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
        std::fprintf(g_logFile, "task_threads failed: kr=%d\\n", static_cast<int>(kr));
    }
    mach_port_deallocate(mach_task_self(), selfThread);

    std::fprintf(g_logFile, "================ END FREEZE WATCHDOG ================\\n");
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
                         "=== MarathonRecomp iOS Debug Log ===\\n"
                         "Device: %s | iOS %ld.%ld.%ld | RAM: %llu MiB\\n"
                         "LogPath: %s\\n"
                         "====================================\\n",
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
`;
}

export function generateVirtualControllerHeader(): string {
  return `// Clean-room Sonic '06 Action-Gauge Virtual Controller, CoreHaptics & Diagnostics bridge for iOS
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
`;
}

export function generateVirtualControllerMm(_p: MarathonIosTemplateParams): string {
  return `// Clean-room Sonic '06 Action-Gauge Virtual Controller for MarathonRecomp iOS
// Features:
// - Responsive landscape layout via layoutSubviews + safeAreaInsets (iPhone, Dynamic Island, iPad, LiveContainer)
// - Dynamic Sonic '06 character theming with smooth animated transitions:
//     * Sonic  -> Electric Cobalt Blue & Crisp White
//     * Shadow -> Chaos Crimson Red & Obsidian Black
//     * Silver -> Psychokinetic Pure White & Bright Azure/Cyan
// - Soleanna Action-Gauge concentric analog stick with glowing cardinal notches & floating snap-back knob
// - Ergonomic 8-way sliding chamfered D-Pad, ABXY diamond cluster, LB/RB/LT/RT shoulders, sleek Back/Start
// - Open right-side touch camera zone with subtle ghost tracking ring
// - CoreHaptics Taptic Engine feedback & throttled Xbox 360 rumble forwarding
// - Automatic hide/show on MFi / Xbox / DualSense physical controller connection

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <QuartzCore/QuartzCore.h>
#import <CoreHaptics/CoreHaptics.h>
#import <GameController/GameController.h>
#include <ios_virtual_controller.h>

#include <atomic>
#include <cmath>
#include <time.h>

static std::atomic<uint32_t> g_buttons{0};
static std::atomic<uint8_t> g_lt{0};
static std::atomic<uint8_t> g_rt{0};
static std::atomic<int16_t> g_lx{0};
static std::atomic<int16_t> g_ly{0};
static std::atomic<int16_t> g_rx{0};
static std::atomic<int16_t> g_ry{0};
static std::atomic<int> g_currentTheme{MARATHON_THEME_SONIC};

// Standard XAMINPUT_GAMEPAD_* bitmask constants (matching MarathonRecomp/hid)
static constexpr uint32_t kBtnDPadUp    = 0x0001;
static constexpr uint32_t kBtnDPadDown  = 0x0002;
static constexpr uint32_t kBtnDPadLeft  = 0x0004;
static constexpr uint32_t kBtnDPadRight = 0x0008;
static constexpr uint32_t kBtnStart     = 0x0010;
static constexpr uint32_t kBtnBack      = 0x0020;
static constexpr uint32_t kBtnLB        = 0x0100;
static constexpr uint32_t kBtnRB        = 0x0200;
static constexpr uint32_t kBtnA         = 0x1000;
static constexpr uint32_t kBtnB         = 0x2000;
static constexpr uint32_t kBtnX         = 0x4000;
static constexpr uint32_t kBtnY         = 0x8000;

static constexpr NSInteger kTagLT = -1;
static constexpr NSInteger kTagRT = -2;

static void GetPaletteForTheme(int theme,
                               UIColor **outPrimary,
                               UIColor **outSecondary,
                               UIColor **outFill,
                               UIColor **outKnobFill,
                               UIColor **outLabel,
                               UIColor **outPressedFill) {
    switch (theme) {
        case MARATHON_THEME_SHADOW:
            // Shadow the Hedgehog: Chaos Crimson Red & Obsidian Jet Black
            *outPrimary     = [UIColor colorWithRed:0.92 green:0.11 blue:0.18 alpha:1.0];
            *outSecondary   = [UIColor colorWithRed:1.00 green:0.78 blue:0.24 alpha:0.92];
            *outFill        = [UIColor colorWithRed:0.05 green:0.04 blue:0.05 alpha:0.74];
            *outKnobFill    = [UIColor colorWithRed:0.14 green:0.03 blue:0.05 alpha:0.94];
            *outLabel       = [UIColor colorWithRed:1.00 green:0.94 blue:0.94 alpha:1.0];
            *outPressedFill = [UIColor colorWithRed:0.86 green:0.10 blue:0.16 alpha:0.62];
            break;
        case MARATHON_THEME_SILVER:
            // Silver the Hedgehog: Psychokinetic Pure White & Bright Azure/Cyan
            *outPrimary     = [UIColor colorWithRed:0.24 green:0.86 blue:1.00 alpha:1.0];
            *outSecondary   = [UIColor colorWithRed:0.96 green:0.99 blue:1.00 alpha:0.98];
            *outFill        = [UIColor colorWithRed:0.09 green:0.22 blue:0.30 alpha:0.56];
            *outKnobFill    = [UIColor colorWithRed:0.92 green:0.98 blue:1.00 alpha:0.90];
            *outLabel       = [UIColor colorWithRed:0.98 green:1.00 blue:1.00 alpha:1.0];
            *outPressedFill = [UIColor colorWithRed:0.32 green:0.90 blue:1.00 alpha:0.58];
            break;
        case MARATHON_THEME_SONIC:
        default:
            // Sonic the Hedgehog: Electric Cobalt Blue & Crisp Pure White
            *outPrimary     = [UIColor colorWithRed:0.10 green:0.48 blue:1.00 alpha:1.0];
            *outSecondary   = [UIColor colorWithRed:0.96 green:0.98 blue:1.00 alpha:0.98];
            *outFill        = [UIColor colorWithRed:0.04 green:0.11 blue:0.26 alpha:0.64];
            *outKnobFill    = [UIColor colorWithRed:0.12 green:0.46 blue:0.98 alpha:0.92];
            *outLabel       = [UIColor colorWithRed:1.00 green:1.00 blue:1.00 alpha:1.0];
            *outPressedFill = [UIColor colorWithRed:0.16 green:0.58 blue:1.00 alpha:0.62];
            break;
    }
}

// ============================================================================
// Sonic '06 Action-Gauge Concentric Analog Stick View
// ============================================================================
@interface Sonic06StickView : UIView
@property (nonatomic, strong) CAShapeLayer *outerRingLayer;
@property (nonatomic, strong) CAShapeLayer *actionArcLayer;
@property (nonatomic, strong) CAShapeLayer *notchesLayer;
@property (nonatomic, strong) UIView *knobView;
@property (nonatomic, strong) CAShapeLayer *knobCoreRing;
@property (nonatomic, assign) CGPoint normalizedVector;
- (void)applyThemePrimary:(UIColor *)primary secondary:(UIColor *)secondary fill:(UIColor *)fill knobFill:(UIColor *)knobFill;
- (void)setStickVectorX:(CGFloat)nx y:(CGFloat)ny animated:(BOOL)animated;
@end

@implementation Sonic06StickView

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        self.userInteractionEnabled = NO;
        self.backgroundColor = [UIColor clearColor];

        _outerRingLayer = [CAShapeLayer layer];
        _outerRingLayer.lineWidth = 2.2;
        [self.layer addSublayer:_outerRingLayer];

        _actionArcLayer = [CAShapeLayer layer];
        _actionArcLayer.fillColor = [UIColor clearColor].CGColor;
        _actionArcLayer.lineWidth = 3.2;
        _actionArcLayer.lineCap = kCALineCapRound;
        [self.layer addSublayer:_actionArcLayer];

        _notchesLayer = [CAShapeLayer layer];
        _notchesLayer.fillColor = [UIColor clearColor].CGColor;
        _notchesLayer.lineWidth = 1.6;
        _notchesLayer.lineCap = kCALineCapRound;
        [self.layer addSublayer:_notchesLayer];

        _knobView = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 52, 52)];
        _knobView.userInteractionEnabled = NO;
        _knobView.layer.borderWidth = 2.2;
        _knobView.layer.shadowRadius = 8.0;
        _knobView.layer.shadowOpacity = 0.55;
        _knobView.layer.shadowOffset = CGSizeZero;
        [self addSubview:_knobView];

        _knobCoreRing = [CAShapeLayer layer];
        _knobCoreRing.fillColor = [UIColor clearColor].CGColor;
        _knobCoreRing.lineWidth = 1.5;
        [_knobView.layer addSublayer:_knobCoreRing];
    }
    return self;
}

- (void)layoutSubviews {
    [super layoutSubviews];
    CGFloat w = self.bounds.size.width;
    CGFloat h = self.bounds.size.height;
    CGFloat r = MIN(w, h) * 0.5 - 3.0;
    CGPoint c = CGPointMake(w * 0.5, h * 0.5);

    self.outerRingLayer.frame = self.bounds;
    self.outerRingLayer.path = [UIBezierPath bezierPathWithArcCenter:c radius:r startAngle:0 endAngle:M_PI * 2.0 clockwise:YES].CGPath;

    // Sonic '06 Action-Gauge twin glowing speed arcs
    UIBezierPath *arcPath = [UIBezierPath bezierPath];
    [arcPath addArcWithCenter:c radius:(r - 6.0) startAngle:(-M_PI * 0.78) endAngle:(-M_PI * 0.22) clockwise:YES];
    [arcPath moveToPoint:CGPointMake(c.x + (r - 6.0) * cos(M_PI * 0.22), c.y + (r - 6.0) * sin(M_PI * 0.22))];
    [arcPath addArcWithCenter:c radius:(r - 6.0) startAngle:(M_PI * 0.22) endAngle:(M_PI * 0.78) clockwise:YES];
    self.actionArcLayer.frame = self.bounds;
    self.actionArcLayer.path = arcPath.CGPath;

    // Cardinal directional notches (N/S/E/W)
    UIBezierPath *notches = [UIBezierPath bezierPath];
    CGFloat innerR = r - 13.0;
    CGFloat outerR = r - 5.0;
    for (int i = 0; i < 4; ++i) {
        CGFloat ang = i * (M_PI * 0.5);
        [notches moveToPoint:CGPointMake(c.x + cos(ang) * innerR, c.y + sin(ang) * innerR)];
        [notches addLineToPoint:CGPointMake(c.x + cos(ang) * outerR, c.y + sin(ang) * outerR)];
    }
    self.notchesLayer.frame = self.bounds;
    self.notchesLayer.path = notches.CGPath;

    CGFloat knobDim = MIN(w, h) * 0.42;
    self.knobView.bounds = CGRectMake(0, 0, knobDim, knobDim);
    self.knobView.layer.cornerRadius = knobDim * 0.5;
    self.knobCoreRing.frame = self.knobView.bounds;
    self.knobCoreRing.path = [UIBezierPath bezierPathWithOvalInRect:CGRectInset(self.knobView.bounds, 6.0, 6.0)].CGPath;

    [self setStickVectorX:self.normalizedVector.x y:self.normalizedVector.y animated:NO];
}

- (void)applyThemePrimary:(UIColor *)primary secondary:(UIColor *)secondary fill:(UIColor *)fill knobFill:(UIColor *)knobFill {
    self.outerRingLayer.strokeColor = [primary colorWithAlphaComponent:0.90].CGColor;
    self.outerRingLayer.fillColor = fill.CGColor;
    self.actionArcLayer.strokeColor = [secondary colorWithAlphaComponent:0.88].CGColor;
    self.notchesLayer.strokeColor = [secondary colorWithAlphaComponent:0.55].CGColor;
    self.knobView.backgroundColor = knobFill;
    self.knobView.layer.borderColor = secondary.CGColor;
    self.knobView.layer.shadowColor = primary.CGColor;
    self.knobCoreRing.strokeColor = [primary colorWithAlphaComponent:0.85].CGColor;
}

- (void)setStickVectorX:(CGFloat)nx y:(CGFloat)ny animated:(BOOL)animated {
    self.normalizedVector = CGPointMake(nx, ny);
    CGFloat w = self.bounds.size.width;
    CGFloat h = self.bounds.size.height;
    CGFloat travel = MIN(w, h) * 0.31;
    CGPoint target = CGPointMake(w * 0.5 + nx * travel, h * 0.5 - ny * travel);
    if (animated) {
        [UIView animateWithDuration:0.14 delay:0 options:(UIViewAnimationOptionBeginFromCurrentState | UIViewAnimationOptionCurveEaseOut) animations:^{
            self.knobView.center = target;
        } completion:nil];
    } else {
        self.knobView.center = target;
    }
}

@end

// ============================================================================
// Sonic '06 8-Way Sliding Chamfered D-Pad View
// ============================================================================
@interface Sonic06DPadView : UIView
@property (nonatomic, strong) CAShapeLayer *crossLayer;
@property (nonatomic, strong) CAShapeLayer *upHighlight;
@property (nonatomic, strong) CAShapeLayer *downHighlight;
@property (nonatomic, strong) CAShapeLayer *leftHighlight;
@property (nonatomic, strong) CAShapeLayer *rightHighlight;
@property (nonatomic, assign) uint32_t activeMask;
@property (nonatomic, copy) void (^onDirectionMaskChanged)(uint32_t newMask);
- (void)applyThemePrimary:(UIColor *)primary secondary:(UIColor *)secondary fill:(UIColor *)fill;
@end

@implementation Sonic06DPadView

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        self.backgroundColor = [UIColor clearColor];
        self.multipleTouchEnabled = NO;

        _crossLayer = [CAShapeLayer layer];
        _crossLayer.lineWidth = 1.8;
        _crossLayer.lineJoin = kCALineJoinRound;
        [self.layer addSublayer:_crossLayer];

        _upHighlight    = [CAShapeLayer layer];
        _downHighlight  = [CAShapeLayer layer];
        _leftHighlight  = [CAShapeLayer layer];
        _rightHighlight = [CAShapeLayer layer];
        for (CAShapeLayer *hl in @[_upHighlight, _downHighlight, _leftHighlight, _rightHighlight]) {
            hl.opacity = 0.0f;
            [self.layer addSublayer:hl];
        }
    }
    return self;
}

- (void)layoutSubviews {
    [super layoutSubviews];
    CGFloat w = self.bounds.size.width;
    CGFloat h = self.bounds.size.height;
    CGFloat arm = w * 0.34;
    CGFloat lo = (w - arm) * 0.5;
    CGFloat hi = lo + arm;

    UIBezierPath *cross = [UIBezierPath bezierPath];
    [cross moveToPoint:CGPointMake(lo, 2)];
    [cross addLineToPoint:CGPointMake(hi, 2)];
    [cross addLineToPoint:CGPointMake(hi, lo)];
    [cross addLineToPoint:CGPointMake(w - 2, lo)];
    [cross addLineToPoint:CGPointMake(w - 2, hi)];
    [cross addLineToPoint:CGPointMake(hi, hi)];
    [cross addLineToPoint:CGPointMake(hi, h - 2)];
    [cross addLineToPoint:CGPointMake(lo, h - 2)];
    [cross addLineToPoint:CGPointMake(lo, hi)];
    [cross addLineToPoint:CGPointMake(2, hi)];
    [cross addLineToPoint:CGPointMake(2, lo)];
    [cross addLineToPoint:CGPointMake(lo, lo)];
    [cross closePath];

    self.crossLayer.frame = self.bounds;
    self.crossLayer.path = cross.CGPath;

    CGFloat pad = 4.0;
    self.upHighlight.frame    = self.bounds;
    self.upHighlight.path     = [UIBezierPath bezierPathWithRoundedRect:CGRectMake(lo + pad, pad, arm - pad * 2, lo - pad) cornerRadius:4].CGPath;
    self.downHighlight.frame  = self.bounds;
    self.downHighlight.path   = [UIBezierPath bezierPathWithRoundedRect:CGRectMake(lo + pad, hi, arm - pad * 2, (h - hi) - pad) cornerRadius:4].CGPath;
    self.leftHighlight.frame  = self.bounds;
    self.leftHighlight.path   = [UIBezierPath bezierPathWithRoundedRect:CGRectMake(pad, lo + pad, lo - pad, arm - pad * 2) cornerRadius:4].CGPath;
    self.rightHighlight.frame = self.bounds;
    self.rightHighlight.path  = [UIBezierPath bezierPathWithRoundedRect:CGRectMake(hi, lo + pad, (w - hi) - pad, arm - pad * 2) cornerRadius:4].CGPath;
}

- (void)applyThemePrimary:(UIColor *)primary secondary:(UIColor *)secondary fill:(UIColor *)fill {
    self.crossLayer.strokeColor = [primary colorWithAlphaComponent:0.90].CGColor;
    self.crossLayer.fillColor = fill.CGColor;
    CGColorRef hlColor = [secondary colorWithAlphaComponent:0.75].CGColor;
    self.upHighlight.fillColor    = hlColor;
    self.downHighlight.fillColor  = hlColor;
    self.leftHighlight.fillColor  = hlColor;
    self.rightHighlight.fillColor = hlColor;
}

- (void)updateDirectionForPoint:(CGPoint)pt {
    CGFloat cx = self.bounds.size.width * 0.5;
    CGFloat cy = self.bounds.size.height * 0.5;
    CGFloat dx = pt.x - cx;
    CGFloat dy = pt.y - cy;
    CGFloat deadzone = MIN(cx, cy) * 0.18;
    uint32_t mask = 0;
    if (std::hypot(dx, dy) >= deadzone) {
        CGFloat angle = std::atan2(dy, dx); // radians, 0 = right, -pi/2 = up
        // 8-way sectors (67.5 deg half-width allows clean diagonals)
        if (dx > deadzone * 0.6 && std::fabs(angle) < M_PI * 0.375) mask |= kBtnDPadRight;
        if (dx < -deadzone * 0.6 && std::fabs(angle) > M_PI * 0.625) mask |= kBtnDPadLeft;
        if (dy < -deadzone * 0.6 && angle > -M_PI * 0.875 && angle < -M_PI * 0.125) mask |= kBtnDPadUp;
        if (dy > deadzone * 0.6 && angle > M_PI * 0.125 && angle < M_PI * 0.875) mask |= kBtnDPadDown;
    }
    [self setActiveMask:mask];
}

- (void)setActiveMask:(uint32_t)mask {
    if (_activeMask == mask) return;
    _activeMask = mask;
    self.upHighlight.opacity    = (mask & kBtnDPadUp)    ? 1.0f : 0.0f;
    self.downHighlight.opacity  = (mask & kBtnDPadDown)  ? 1.0f : 0.0f;
    self.leftHighlight.opacity  = (mask & kBtnDPadLeft)  ? 1.0f : 0.0f;
    self.rightHighlight.opacity = (mask & kBtnDPadRight) ? 1.0f : 0.0f;
    if (self.onDirectionMaskChanged) {
        self.onDirectionMaskChanged(mask);
    }
}

- (void)touchesBegan:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
    UITouch *t = [touches anyObject];
    if (t) [self updateDirectionForPoint:[t locationInView:self]];
}

- (void)touchesMoved:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
    UITouch *t = [touches anyObject];
    if (t) [self updateDirectionForPoint:[t locationInView:self]];
}

- (void)touchesEnded:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
    [self setActiveMask:0];
}

- (void)touchesCancelled:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
    [self setActiveMask:0];
}

@end

// ============================================================================
// Sonic '06 Bevel Glass Button (ABXY / Shoulders / Start / Back)
// ============================================================================
@interface Sonic06PadButton : UIButton
@property (nonatomic, strong) UIColor *xboxDotColor;
@property (nonatomic, strong) UIColor *normalFillColor;
@property (nonatomic, strong) UIColor *pressedFillColor;
@property (nonatomic, strong) CAShapeLayer *innerRingLayer;
@property (nonatomic, strong) CAShapeLayer *accentDotLayer;
@property (nonatomic, assign) BOOL isPillStyle;
- (void)applyThemePrimary:(UIColor *)primary secondary:(UIColor *)secondary fill:(UIColor *)fill pressedFill:(UIColor *)pressedFill labelColor:(UIColor *)labelColor;
- (void)setPressedVisual:(BOOL)pressed;
@end

@implementation Sonic06PadButton

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        self.adjustsImageWhenHighlighted = NO;
        self.layer.borderWidth = 2.0;
        self.layer.shadowRadius = 7.0;
        self.layer.shadowOpacity = 0.42;
        self.layer.shadowOffset = CGSizeZero;

        _innerRingLayer = [CAShapeLayer layer];
        _innerRingLayer.fillColor = [UIColor clearColor].CGColor;
        _innerRingLayer.lineWidth = 1.0;
        [self.layer addSublayer:_innerRingLayer];

        _accentDotLayer = [CAShapeLayer layer];
        [self.layer addSublayer:_accentDotLayer];
    }
    return self;
}

- (void)layoutSubviews {
    [super layoutSubviews];
    CGFloat corner = self.isPillStyle ? (self.bounds.size.height * 0.45) : (self.bounds.size.height * 0.5);
    self.layer.cornerRadius = corner;

    self.innerRingLayer.frame = self.bounds;
    CGRect inset = CGRectInset(self.bounds, 4.5, 4.5);
    self.innerRingLayer.path = [UIBezierPath bezierPathWithRoundedRect:inset cornerRadius:MAX(2.0, corner - 4.0)].CGPath;

    if (self.xboxDotColor) {
        CGFloat dotR = 3.2;
        CGRect dotRect = CGRectMake(self.bounds.size.width * 0.5 - dotR, self.bounds.size.height - 10.5, dotR * 2, dotR * 2);
        self.accentDotLayer.frame = self.bounds;
        self.accentDotLayer.path = [UIBezierPath bezierPathWithOvalInRect:dotRect].CGPath;
        self.accentDotLayer.fillColor = self.xboxDotColor.CGColor;
        self.accentDotLayer.hidden = NO;
    } else {
        self.accentDotLayer.hidden = YES;
    }
}

- (void)applyThemePrimary:(UIColor *)primary secondary:(UIColor *)secondary fill:(UIColor *)fill pressedFill:(UIColor *)pressedFill labelColor:(UIColor *)labelColor {
    self.normalFillColor = fill;
    self.pressedFillColor = pressedFill;
    self.backgroundColor = fill;
    self.layer.borderColor = [primary colorWithAlphaComponent:0.92].CGColor;
    self.layer.shadowColor = primary.CGColor;
    self.innerRingLayer.strokeColor = [secondary colorWithAlphaComponent:0.42].CGColor;
    [self setTitleColor:labelColor forState:UIControlStateNormal];
}

- (void)setPressedVisual:(BOOL)pressed {
    self.backgroundColor = pressed ? (self.pressedFillColor ?: self.normalFillColor) : self.normalFillColor;
    [UIView animateWithDuration:0.08 delay:0 options:UIViewAnimationOptionBeginFromCurrentState animations:^{
        self.transform = pressed ? CGAffineTransformMakeScale(0.90, 0.90) : CGAffineTransformIdentity;
    } completion:nil];
}

@end

// ============================================================================
// Main Virtual Controller Overlay View
// ============================================================================
@interface MarathonTouchOverlayView : UIView
@property (nonatomic, strong) CHHapticEngine *hapticEngine;
@property (nonatomic, assign) BOOL hapticsReady;

@property (nonatomic, strong) Sonic06StickView *leftStickView;
@property (nonatomic, strong) Sonic06DPadView *dpadView;
@property (nonatomic, strong) UIView *cameraGhostRing;

@property (nonatomic, strong) Sonic06PadButton *btnA;
@property (nonatomic, strong) Sonic06PadButton *btnB;
@property (nonatomic, strong) Sonic06PadButton *btnX;
@property (nonatomic, strong) Sonic06PadButton *btnY;
@property (nonatomic, strong) Sonic06PadButton *btnLB;
@property (nonatomic, strong) Sonic06PadButton *btnRB;
@property (nonatomic, strong) Sonic06PadButton *btnLT;
@property (nonatomic, strong) Sonic06PadButton *btnRT;
@property (nonatomic, strong) Sonic06PadButton *btnBack;
@property (nonatomic, strong) Sonic06PadButton *btnStart;
@property (nonatomic, strong) NSArray<Sonic06PadButton *> *allButtons;

@property (nonatomic, strong) UITouch *leftStickTouch;
@property (nonatomic, assign) CGPoint leftStickOrigin;
@property (nonatomic, strong) UITouch *rightStickTouch;
@property (nonatomic, assign) CGPoint rightStickOrigin;

@property (nonatomic, assign) CGRect leftStickZone;
@property (nonatomic, assign) CGRect rightCameraZone;
@property (nonatomic, assign) int activeTheme;

- (void)applyTheme:(int)theme animated:(BOOL)animated;
- (void)playTapHaptic:(float)intensity sharpness:(float)sharpness;
@end

@implementation MarathonTouchOverlayView

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        self.backgroundColor = [UIColor clearColor];
        self.multipleTouchEnabled = YES;
        self.layer.allowsGroupOpacity = NO;
        _activeTheme = g_currentTheme.load(std::memory_order_relaxed);

        [self setupHaptics];
        [self buildControls];
        [self applyTheme:_activeTheme animated:NO];
        [self observePhysicalControllers];
        self.alpha = 0.84;
    }
    return self;
}

- (void)setupHaptics {
    if (![CHHapticEngine capabilitiesForHardware].supportsHaptics) return;
    NSError *err = nil;
    self.hapticEngine = [[CHHapticEngine alloc] initAndReturnError:&err];
    if (err || !self.hapticEngine) return;

    __weak typeof(self) weakSelf = self;
    self.hapticEngine.stoppedHandler = ^(CHHapticEngineStoppedReason reason) {
        (void)reason;
        weakSelf.hapticsReady = NO;
    };
    self.hapticEngine.resetHandler = ^{
        NSError *startErr = nil;
        [weakSelf.hapticEngine startAndReturnError:&startErr];
        weakSelf.hapticsReady = (startErr == nil);
    };

    NSError *startErr = nil;
    [self.hapticEngine startAndReturnError:&startErr];
    self.hapticsReady = (startErr == nil);
}

- (void)playTapHaptic:(float)intensity sharpness:(float)sharpness {
    if (!self.hapticEngine) return;
    if (!self.hapticsReady) {
        NSError *startErr = nil;
        [self.hapticEngine startAndReturnError:&startErr];
        self.hapticsReady = (startErr == nil);
        if (!self.hapticsReady) return;
    }
    CHHapticEventParameter *pInt = [[CHHapticEventParameter alloc] initWithParameterID:CHHapticEventParameterIDHapticIntensity value:intensity];
    CHHapticEventParameter *pSharp = [[CHHapticEventParameter alloc] initWithParameterID:CHHapticEventParameterIDHapticSharpness value:sharpness];
    CHHapticEvent *ev = [[CHHapticEvent alloc] initWithEventType:CHHapticEventTypeHapticTransient parameters:@[pInt, pSharp] relativeTime:0];
    NSError *err = nil;
    CHHapticPattern *pat = [[CHHapticPattern alloc] initWithEvents:@[ev] parameters:@[] error:&err];
    if (err || !pat) return;
    id<CHHapticPatternPlayer> player = [self.hapticEngine createPlayerWithPattern:pat error:&err];
    if (!err && player) {
        [player startAtTime:CHHapticTimeImmediate error:nil];
    }
}

- (Sonic06PadButton *)makeButton:(NSString *)title tag:(NSInteger)tag fontSize:(CGFloat)fontSize pill:(BOOL)pill xboxDot:(UIColor *)dotColor {
    Sonic06PadButton *btn = [Sonic06PadButton buttonWithType:UIButtonTypeCustom];
    btn.tag = tag;
    btn.isPillStyle = pill;
    btn.xboxDotColor = dotColor;
    [btn setTitle:title forState:UIControlStateNormal];
    btn.titleLabel.font = [UIFont systemFontOfSize:fontSize weight:UIFontWeightHeavy];
    [btn addTarget:self action:@selector(onButtonDown:) forControlEvents:UIControlEventTouchDown];
    [btn addTarget:self action:@selector(onButtonUp:) forControlEvents:(UIControlEventTouchUpInside | UIControlEventTouchUpOutside | UIControlEventTouchCancel)];
    [self addSubview:btn];
    return btn;
}

- (void)buildControls {
    // Left Analog Stick (Sonic '06 Action-Gauge concentric ring)
    self.leftStickView = [[Sonic06StickView alloc] initWithFrame:CGRectZero];
    [self addSubview:self.leftStickView];

    // 8-Way Sliding D-Pad
    self.dpadView = [[Sonic06DPadView alloc] initWithFrame:CGRectZero];
    __weak typeof(self) weakSelf = self;
    self.dpadView.onDirectionMaskChanged = ^(uint32_t newMask) {
        constexpr uint32_t dpadAll = kBtnDPadUp | kBtnDPadDown | kBtnDPadLeft | kBtnDPadRight;
        uint32_t prev = g_buttons.load(std::memory_order_relaxed);
        while (!g_buttons.compare_exchange_weak(prev, (prev & ~dpadAll) | (newMask & dpadAll), std::memory_order_relaxed)) {}
        if (newMask != 0) {
            [weakSelf playTapHaptic:0.35f sharpness:0.70f];
        }
    };
    [self addSubview:self.dpadView];

    // Subtle right camera ghost ring (only visible while dragging camera)
    self.cameraGhostRing = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 56, 56)];
    self.cameraGhostRing.userInteractionEnabled = NO;
    self.cameraGhostRing.layer.cornerRadius = 28;
    self.cameraGhostRing.layer.borderWidth = 1.6;
    self.cameraGhostRing.backgroundColor = [UIColor clearColor];
    self.cameraGhostRing.alpha = 0.0;
    [self addSubview:self.cameraGhostRing];

    // ABXY Diamond (with subtle Xbox 360 accent dot harmonizing with active Sonic/Shadow/Silver theme)
    self.btnA = [self makeButton:@"A" tag:kBtnA fontSize:18 pill:NO xboxDot:[UIColor colorWithRed:0.22 green:0.88 blue:0.38 alpha:0.95]];
    self.btnB = [self makeButton:@"B" tag:kBtnB fontSize:18 pill:NO xboxDot:[UIColor colorWithRed:0.98 green:0.26 blue:0.26 alpha:0.95]];
    self.btnX = [self makeButton:@"X" tag:kBtnX fontSize:18 pill:NO xboxDot:[UIColor colorWithRed:0.22 green:0.62 blue:1.00 alpha:0.95]];
    self.btnY = [self makeButton:@"Y" tag:kBtnY fontSize:18 pill:NO xboxDot:[UIColor colorWithRed:1.00 green:0.82 blue:0.18 alpha:0.95]];

    // Shoulders & Analog Triggers
    self.btnLB = [self makeButton:@"LB" tag:kBtnLB fontSize:13 pill:YES xboxDot:nil];
    self.btnLT = [self makeButton:@"LT" tag:kTagLT fontSize:13 pill:YES xboxDot:nil];
    self.btnRB = [self makeButton:@"RB" tag:kBtnRB fontSize:13 pill:YES xboxDot:nil];
    self.btnRT = [self makeButton:@"RT" tag:kTagRT fontSize:13 pill:YES xboxDot:nil];

    // Sleek Start & Back (NO "06" button or Mods menu)
    self.btnBack  = [self makeButton:@"BACK"  tag:kBtnBack  fontSize:11 pill:YES xboxDot:nil];
    self.btnStart = [self makeButton:@"START" tag:kBtnStart fontSize:11 pill:YES xboxDot:nil];

    self.allButtons = @[
        self.btnA, self.btnB, self.btnX, self.btnY,
        self.btnLB, self.btnLT, self.btnRB, self.btnRT,
        self.btnBack, self.btnStart
    ];
}

- (void)applyTheme:(int)theme animated:(BOOL)animated {
    self.activeTheme = theme;
    UIColor *primary = nil, *secondary = nil, *fill = nil, *knobFill = nil, *label = nil, *pressedFill = nil;
    GetPaletteForTheme(theme, &primary, &secondary, &fill, &knobFill, &label, &pressedFill);

    void (^applyBlock)(void) = ^{
        [self.leftStickView applyThemePrimary:primary secondary:secondary fill:fill knobFill:knobFill];
        [self.dpadView applyThemePrimary:primary secondary:secondary fill:fill];
        self.cameraGhostRing.layer.borderColor = [primary colorWithAlphaComponent:0.72].CGColor;
        for (Sonic06PadButton *btn in self.allButtons) {
            [btn applyThemePrimary:primary secondary:secondary fill:fill pressedFill:pressedFill labelColor:label];
        }
    };

    if (animated) {
        [UIView animateWithDuration:0.35 animations:applyBlock];
    } else {
        applyBlock();
    }
}

- (void)safeAreaInsetsDidChange {
    [super safeAreaInsetsDidChange];
    [self setNeedsLayout];
}

- (void)layoutSubviews {
    [super layoutSubviews];
    CGFloat w = self.bounds.size.width;
    CGFloat h = self.bounds.size.height;
    if (w <= 0 || h <= 0) return;

    UIEdgeInsets safe = self.safeAreaInsets;
    CGFloat leftPad   = MAX(safe.left, 18.0) + 6.0;
    CGFloat rightPad  = MAX(safe.right, 18.0) + 6.0;
    CGFloat topPad    = MAX(safe.top, 12.0) + 6.0;
    CGFloat bottomPad = MAX(safe.bottom, 12.0) + 8.0;

    BOOL isCompact = (MIN(w, h) < 420.0); // iPhone vs iPad sizing
    CGFloat stickSize = isCompact ? 132.0 : 158.0;
    CGFloat dpadSize  = isCompact ? 86.0  : 102.0;
    CGFloat abxyBtn   = isCompact ? 54.0  : 62.0;
    CGFloat abxyStep  = isCompact ? 54.0  : 64.0;
    CGFloat shW       = isCompact ? 64.0  : 78.0;
    CGFloat shH       = isCompact ? 34.0  : 40.0;
    CGFloat menuW     = isCompact ? 62.0  : 74.0;
    CGFloat menuH     = isCompact ? 28.0  : 32.0;

    // 1. Left Analog Stick (bottom-left ergonomic thumb anchor)
    CGFloat stickX = leftPad + 12.0;
    CGFloat stickY = h - bottomPad - stickSize - 8.0;
    self.leftStickView.frame = CGRectMake(stickX, stickY, stickSize, stickSize);

    // Generous left-stick touch capture area around the base
    self.leftStickZone = CGRectMake(0, MAX(topPad + shH + 14.0, stickY - 56.0),
                                    stickX + stickSize + 36.0,
                                    h - MAX(topPad + shH + 14.0, stickY - 56.0));

    // 2. 8-Way D-Pad (cleanly positioned to the inner-right of the left stick, bottom edge)
    CGFloat dpadX = CGRectGetMaxX(self.leftStickView.frame) + (isCompact ? 18.0 : 28.0);
    CGFloat dpadY = h - bottomPad - dpadSize - 4.0;
    self.dpadView.frame = CGRectMake(dpadX, dpadY, dpadSize, dpadSize);

    // 3. ABXY Diamond Cluster (bottom-right ergonomic thumb arc)
    CGFloat clusterCX = w - rightPad - abxyStep - abxyBtn * 0.5 - 8.0;
    CGFloat clusterCY = h - bottomPad - abxyStep - abxyBtn * 0.5 - 10.0;
    self.btnA.frame = CGRectMake(clusterCX - abxyBtn * 0.5, clusterCY + abxyStep - abxyBtn * 0.5, abxyBtn, abxyBtn);
    self.btnB.frame = CGRectMake(clusterCX + abxyStep - abxyBtn * 0.5, clusterCY - abxyBtn * 0.5, abxyBtn, abxyBtn);
    self.btnX.frame = CGRectMake(clusterCX - abxyStep - abxyBtn * 0.5, clusterCY - abxyBtn * 0.5, abxyBtn, abxyBtn);
    self.btnY.frame = CGRectMake(clusterCX - abxyBtn * 0.5, clusterCY - abxyStep - abxyBtn * 0.5, abxyBtn, abxyBtn);

    // 4. Top-Left Shoulders (LB + LT side-by-side) & Top-Right Shoulders (RT + RB)
    self.btnLB.frame = CGRectMake(leftPad, topPad, shW, shH);
    self.btnLT.frame = CGRectMake(leftPad + shW + 10.0, topPad, shW, shH);

    self.btnRB.frame = CGRectMake(w - rightPad - shW, topPad, shW, shH);
    self.btnRT.frame = CGRectMake(w - rightPad - shW * 2.0 - 10.0, topPad, shW, shH);

    // 5. Top-Center BACK & START pills (clean pair, no "06" button)
    CGFloat centerX = w * 0.5;
    self.btnBack.frame  = CGRectMake(centerX - menuW - 12.0, topPad + 2.0, menuW, menuH);
    self.btnStart.frame = CGRectMake(centerX + 12.0,         topPad + 2.0, menuW, menuH);

    // 6. Right-side camera swipe zone (open right region between shoulders and ABXY)
    CGFloat camMinX = w * 0.56;
    CGFloat camMinY = topPad + shH + 10.0;
    self.rightCameraZone = CGRectMake(camMinX, camMinY, w - camMinX, h - camMinY);
}

// Pass-through touches outside controls/zones so ImGui menus in the center remain tappable
- (UIView *)hitTest:(CGPoint)point withEvent:(UIEvent *)event {
    if (self.hidden || !self.userInteractionEnabled || self.alpha < 0.01) {
        return nil;
    }
    // Check explicit subviews (buttons & D-Pad) first
    for (UIView *sub in [self.subviews reverseObjectEnumerator]) {
        if (!sub.userInteractionEnabled || sub.hidden || sub.alpha < 0.01) continue;
        CGPoint local = [sub convertPoint:point fromView:self];
        UIView *hit = [sub hitTest:local withEvent:event];
        if (hit) return hit;
    }
    // Capture touches in left stick zone or right camera swipe zone
    if (CGRectContainsPoint(self.leftStickZone, point) ||
        CGRectContainsPoint(self.rightCameraZone, point)) {
        return self;
    }
    return nil;
}

- (void)onButtonDown:(Sonic06PadButton *)sender {
    [sender setPressedVisual:YES];
    [self playTapHaptic:0.50f sharpness:0.68f];
    if (sender.tag == kTagLT) { g_lt.store(255, std::memory_order_relaxed); return; }
    if (sender.tag == kTagRT) { g_rt.store(255, std::memory_order_relaxed); return; }
    g_buttons.fetch_or(static_cast<uint32_t>(sender.tag), std::memory_order_relaxed);
}

- (void)onButtonUp:(Sonic06PadButton *)sender {
    [sender setPressedVisual:NO];
    if (sender.tag == kTagLT) { g_lt.store(0, std::memory_order_relaxed); return; }
    if (sender.tag == kTagRT) { g_rt.store(0, std::memory_order_relaxed); return; }
    g_buttons.fetch_and(~static_cast<uint32_t>(sender.tag), std::memory_order_relaxed);
}

- (void)observePhysicalControllers {
    NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
    [nc addObserverForName:GCControllerDidConnectNotification
                    object:nil
                     queue:[NSOperationQueue mainQueue]
                usingBlock:^(__unused NSNotification *note) {
        self.hidden = ([GCController controllers].count > 0);
    }];
    [nc addObserverForName:GCControllerDidDisconnectNotification
                    object:nil
                     queue:[NSOperationQueue mainQueue]
                usingBlock:^(__unused NSNotification *note) {
        self.hidden = ([GCController controllers].count > 0);
    }];
}

- (void)updateLeftStickForPoint:(CGPoint)pt {
    CGFloat maxR = MAX(42.0, self.leftStickView.bounds.size.width * 0.36);
    CGFloat dx = pt.x - self.leftStickOrigin.x;
    CGFloat dy = -(pt.y - self.leftStickOrigin.y); // Xbox 360 +Y is Up
    CGFloat dist = std::hypot(dx, dy);
    if (dist > maxR) {
        dx = (dx / dist) * maxR;
        dy = (dy / dist) * maxR;
    }
    CGFloat nx = dx / maxR;
    CGFloat ny = dy / maxR;
    g_lx.store(static_cast<int16_t>(std::lround(nx * 32767.0)), std::memory_order_relaxed);
    g_ly.store(static_cast<int16_t>(std::lround(ny * 32767.0)), std::memory_order_relaxed);
    [self.leftStickView setStickVectorX:nx y:ny animated:NO];
}

- (void)touchesBegan:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
    for (UITouch *t in touches) {
        CGPoint pt = [t locationInView:self];
        if (!self.leftStickTouch && CGRectContainsPoint(self.leftStickZone, pt)) {
            self.leftStickTouch = t;
            // Anchor to visible stick center if tapped near it; otherwise smooth floating origin
            CGPoint center = self.leftStickView.center;
            CGFloat distFromCenter = std::hypot(pt.x - center.x, pt.y - center.y);
            if (distFromCenter <= self.leftStickView.bounds.size.width * 0.58) {
                self.leftStickOrigin = center;
                [self updateLeftStickForPoint:pt];
            } else {
                self.leftStickOrigin = pt;
            }
        } else if (!self.rightStickTouch && CGRectContainsPoint(self.rightCameraZone, pt)) {
            self.rightStickTouch = t;
            self.rightStickOrigin = pt;
            self.cameraGhostRing.center = pt;
            [UIView animateWithDuration:0.12 animations:^{
                self.cameraGhostRing.alpha = 0.55;
            }];
        }
    }
}

- (void)touchesMoved:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
    constexpr CGFloat kCamRadius = 62.0;
    for (UITouch *t in touches) {
        CGPoint pt = [t locationInView:self];
        if (t == self.leftStickTouch) {
            [self updateLeftStickForPoint:pt];
        } else if (t == self.rightStickTouch) {
            CGFloat dx = pt.x - self.rightStickOrigin.x;
            CGFloat dy = -(pt.y - self.rightStickOrigin.y);
            CGFloat dist = std::hypot(dx, dy);
            if (dist > kCamRadius) {
                dx = (dx / dist) * kCamRadius;
                dy = (dy / dist) * kCamRadius;
            }
            g_rx.store(static_cast<int16_t>(std::lround((dx / kCamRadius) * 32767.0)), std::memory_order_relaxed);
            g_ry.store(static_cast<int16_t>(std::lround((dy / kCamRadius) * 32767.0)), std::memory_order_relaxed);
            self.cameraGhostRing.center = CGPointMake(self.rightStickOrigin.x + dx * 0.35,
                                                      self.rightStickOrigin.y - dy * 0.35);
        }
    }
}

- (void)touchesEnded:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
    for (UITouch *t in touches) {
        if (t == self.leftStickTouch) {
            self.leftStickTouch = nil;
            g_lx.store(0, std::memory_order_relaxed);
            g_ly.store(0, std::memory_order_relaxed);
            [self.leftStickView setStickVectorX:0 y:0 animated:YES];
        } else if (t == self.rightStickTouch) {
            self.rightStickTouch = nil;
            g_rx.store(0, std::memory_order_relaxed);
            g_ry.store(0, std::memory_order_relaxed);
            [UIView animateWithDuration:0.16 animations:^{
                self.cameraGhostRing.alpha = 0.0;
            }];
        }
    }
}

- (void)touchesCancelled:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
    [self touchesEnded:touches withEvent:event];
}

@end

static MarathonTouchOverlayView *g_overlayView = nil;
static std::atomic<uint64_t> g_lastRumbleMs{0};

static UIWindow *FindActiveAppWindow() {
    UIWindow *fallback = nil;
    for (UIScene *s in [UIApplication sharedApplication].connectedScenes) {
        if (![s isKindOfClass:[UIWindowScene class]]) continue;
        UIWindowScene *ws = (UIWindowScene *)s;
        if (![ws.session.role isEqualToString:UIWindowSceneSessionRoleApplication]) continue;
        for (UIWindow *w in ws.windows) {
            if (w.isKeyWindow) return w;
            if (!fallback && !w.hidden) fallback = w;
        }
    }
    return fallback;
}

static void AttachVirtualControllerAttempt(int remainingAttempts) {
    dispatch_async(dispatch_get_main_queue(), ^{
        UIWindow *keyWin = FindActiveAppWindow();
        if (!keyWin) {
            if (remainingAttempts > 0) {
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.25 * NSEC_PER_SEC)),
                               dispatch_get_main_queue(), ^{
                    AttachVirtualControllerAttempt(remainingAttempts - 1);
                });
            }
            return;
        }
        UIView *hostView = keyWin.rootViewController ? keyWin.rootViewController.view : keyWin;
        if (g_overlayView) {
            if (g_overlayView.superview != hostView) {
                [g_overlayView removeFromSuperview];
                g_overlayView.frame = hostView.bounds;
                [hostView addSubview:g_overlayView];
                [g_overlayView setNeedsLayout];
            }
            return;
        }
        g_overlayView = [[MarathonTouchOverlayView alloc] initWithFrame:hostView.bounds];
        g_overlayView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
        g_overlayView.hidden = ([GCController controllers].count > 0);
        [hostView addSubview:g_overlayView];
        [g_overlayView setNeedsLayout];
        [g_overlayView layoutIfNeeded];
    });
}

extern "C" {

void MarathonIOS_AttachVirtualController(void*) {
    AttachVirtualControllerAttempt(12);
}

void MarathonIOS_SetVirtualControllerVisible(bool visible) {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (g_overlayView) {
            g_overlayView.hidden = !visible || ([GCController controllers].count > 0);
        }
    });
}

void MarathonIOS_SetCharacterTheme(int theme) {
    if (theme < MARATHON_THEME_SONIC || theme > MARATHON_THEME_SILVER) {
        theme = MARATHON_THEME_SONIC;
    }
    int prev = g_currentTheme.exchange(theme, std::memory_order_relaxed);
    if (prev == theme) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        if (g_overlayView) {
            [g_overlayView applyTheme:theme animated:YES];
        }
    });
}

void MarathonIOS_GetVirtualControllerState(MarathonTouchGamepadState* outState) {
    if (!outState) return;
    outState->buttons      = g_buttons.load(std::memory_order_relaxed);
    outState->leftTrigger  = g_lt.load(std::memory_order_relaxed);
    outState->rightTrigger = g_rt.load(std::memory_order_relaxed);
    outState->thumbLX      = g_lx.load(std::memory_order_relaxed);
    outState->thumbLY      = g_ly.load(std::memory_order_relaxed);
    outState->thumbRX      = g_rx.load(std::memory_order_relaxed);
    outState->thumbRY      = g_ry.load(std::memory_order_relaxed);
}

void MarathonIOS_TriggerHapticRumble(uint16_t lowFreqMotor, uint16_t highFreqMotor) {
    float intensity = std::fmin(1.0f, (static_cast<float>(lowFreqMotor) + static_cast<float>(highFreqMotor)) / 65535.0f);
    if (intensity < 0.12f) return;

    // Throttle continuous Xbox 360 rumble updates to ~16 Hz so we never flood the main queue
    struct timespec ts{};
    clock_gettime(CLOCK_MONOTONIC, &ts);
    uint64_t nowMs = static_cast<uint64_t>(ts.tv_sec) * 1000ULL + static_cast<uint64_t>(ts.tv_nsec) / 1000000ULL;
    uint64_t last = g_lastRumbleMs.load(std::memory_order_relaxed);
    if (nowMs - last < 60) return;
    if (!g_lastRumbleMs.compare_exchange_strong(last, nowMs, std::memory_order_relaxed)) return;

    float sharpness = (highFreqMotor > lowFreqMotor) ? 0.78f : 0.35f;
    dispatch_async(dispatch_get_main_queue(), ^{
        if (g_overlayView && !g_overlayView.hidden) {
            [g_overlayView playTapHaptic:intensity sharpness:sharpness];
        }
    });
}

} // extern "C"
`;
}

export function generateModManagerFiles(): { header: string; mm: string } {
  const header = `// Clean-room iOS Mod Manager interface for Documents/MarathonRecomp/mods
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

void MarathonIOS_PresentModManager(void);

#ifdef __cplusplus
}
#endif
`;

  const mm = `// Native UIKit Mod Manager sheet reading Documents/MarathonRecomp/mods and profiles.json
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#include <ios_mod_manager.h>

@interface MarathonModManagerVC : UITableViewController
@property (nonatomic, strong) NSMutableArray<NSString *> *modFolders;
@property (nonatomic, strong) NSMutableSet<NSString *> *enabledMods;
@property (nonatomic, strong) NSURL *modsRoot;
@property (nonatomic, strong) NSURL *defaultProfileURL;
@end

@implementation MarathonModManagerVC

- (void)viewDidLoad {
    [super viewDidLoad];
    self.title = @"MarathonRecomp Mods";
    self.navigationItem.rightBarButtonItem = [[UIBarButtonItem alloc]
        initWithBarButtonSystemItem:UIBarButtonSystemItemDone
                             target:self
                             action:@selector(closeSheet)];
    [self loadModsFromDocuments];
}

- (void)loadModsFromDocuments {
    NSFileManager *fm = [NSFileManager defaultManager];
    NSURL *docs = [[fm URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask] firstObject];
    self.modsRoot = [docs URLByAppendingPathComponent:@"MarathonRecomp/mods" isDirectory:YES];
    [fm createDirectoryAtURL:self.modsRoot withIntermediateDirectories:YES attributes:nil error:nil];

    NSURL *profilesDir = [docs URLByAppendingPathComponent:@"MarathonRecomp/profiles" isDirectory:YES];
    [fm createDirectoryAtURL:profilesDir withIntermediateDirectories:YES attributes:nil error:nil];
    self.defaultProfileURL = [profilesDir URLByAppendingPathComponent:@"Default.json"];

    self.modFolders = [NSMutableArray array];
    self.enabledMods = [NSMutableSet set];

    NSData *profileData = [NSData dataWithContentsOfURL:self.defaultProfileURL];
    if (profileData) {
        NSDictionary *json = [NSJSONSerialization JSONObjectWithData:profileData options:0 error:nil];
        NSArray *enabled = json[@"EnabledMods"];
        if ([enabled isKindOfClass:[NSArray class]]) {
            [self.enabledMods addObjectsFromArray:enabled];
        }
    }

    NSArray<NSURL *> *entries = [fm contentsOfDirectoryAtURL:self.modsRoot
                                  includingPropertiesForKeys:@[NSURLIsDirectoryKey]
                                                     options:NSDirectoryEnumerationSkipsHiddenFiles
                                                       error:nil];
    for (NSURL *entry in entries) {
        NSNumber *isDir = nil;
        [entry getResourceValue:&isDir forKey:NSURLIsDirectoryKey error:nil];
        if (isDir.boolValue) {
            [self.modFolders addObject:entry.lastPathComponent];
        }
    }
    [self.modFolders sortUsingSelector:@selector(localizedCaseInsensitiveCompare:)];
}

- (void)persistEnabledMods {
    NSDictionary *payload = @{ @"EnabledMods": [self.enabledMods allObjects] };
    NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:NSJSONWritingPrettyPrinted error:nil];
    [data writeToURL:self.defaultProfileURL atomically:YES];
}

- (void)closeSheet {
    [self persistEnabledMods];
    [self dismissViewControllerAnimated:YES completion:nil];
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    return MAX(1, (NSInteger)self.modFolders.count);
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"ModCell"]
        ?: [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleSubtitle reuseIdentifier:@"ModCell"];
    if (self.modFolders.count == 0) {
        cell.textLabel.text = @"Nessuna mod trovata";
        cell.detailTextLabel.text = @"Copia le cartelle mod in App File -> MarathonRecomp/mods";
        cell.accessoryType = UITableViewCellAccessoryNone;
        return cell;
    }
    NSString *folder = self.modFolders[indexPath.row];
    cell.textLabel.text = folder;
    cell.detailTextLabel.text = @"Documents/MarathonRecomp/mods";
    cell.accessoryType = [self.enabledMods containsObject:folder]
        ? UITableViewCellAccessoryCheckmark
        : UITableViewCellAccessoryNone;
    return cell;
}

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath {
    [tableView deselectRowAtIndexPath:indexPath animated:YES];
    if (self.modFolders.count == 0) return;
    NSString *folder = self.modFolders[indexPath.row];
    if ([self.enabledMods containsObject:folder]) [self.enabledMods removeObject:folder];
    else [self.enabledMods addObject:folder];
    [self persistEnabledMods];
    [tableView reloadRowsAtIndexPaths:@[indexPath] withRowAnimation:UITableViewRowAnimationAutomatic];
}

@end

extern "C" void MarathonIOS_PresentModManager(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        UIWindow *keyWin = nil;
        for (UIScene *s in [UIApplication sharedApplication].connectedScenes) {
            if ([s isKindOfClass:[UIWindowScene class]]) {
                for (UIWindow *w in ((UIWindowScene *)s).windows) {
                    if (w.isKeyWindow) { keyWin = w; break; }
                }
            }
        }
        UIViewController *top = keyWin.rootViewController;
        while (top.presentedViewController) top = top.presentedViewController;
        if (!top) return;

        MarathonModManagerVC *vc = [[MarathonModManagerVC alloc] initWithStyle:UITableViewStyleInsetGrouped];
        UINavigationController *nav = [[UINavigationController alloc] initWithRootViewController:vc];
        nav.modalPresentationStyle = UIModalPresentationPageSheet;
        [top presentViewController:nav animated:YES completion:nil];
    });
}
`;

  return { header, mm };
}

export function generateCurlStubFiles(): { header: string; mm: string } {
  const header = `// Clean-room libcurl compatibility header for MarathonRecomp v1.0.0 on iOS
// Backed by native NSURLSession in ios/curl_ios_stub.mm (used by install/update_checker.cpp)
#pragma once

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void CURL;

typedef enum {
    CURLE_OK = 0,
    CURLE_UNSUPPORTED_PROTOCOL = 1,
    CURLE_FAILED_INIT = 2,
    CURLE_URL_MALFORMAT = 3,
    CURLE_COULDNT_CONNECT = 7,
    CURLE_OUT_OF_MEMORY = 27,
    CURLE_OPERATION_TIMEDOUT = 28,
    CURLE_HTTP_RETURNED_ERROR = 22
} CURLcode;

typedef int CURLoption;
enum {
    CURLOPT_URL = 10002,
    CURLOPT_WRITEDATA = 10001,
    CURLOPT_USERAGENT = 10018,
    CURLOPT_WRITEFUNCTION = 20011,
    CURLOPT_FOLLOWLOCATION = 52
};

#define CURL_GLOBAL_DEFAULT 3L

typedef size_t (*curl_write_callback)(void* contents, size_t size, size_t nmemb, void* userdata);

CURLcode curl_global_init(long flags);
void curl_global_cleanup(void);
CURL* curl_easy_init(void);
CURLcode curl_easy_setopt(CURL* handle, CURLoption option, ...);
CURLcode curl_easy_perform(CURL* handle);
void curl_easy_cleanup(CURL* handle);
const char* curl_easy_strerror(CURLcode code);

// Replaces unavailable std::system("open ...") in UpdateChecker::visitWebsite() on iOS
void MarathonIOS_OpenURL(const char* url);

#ifdef __cplusplus
}
#endif
`;

  const mm = `// Clean-room NSURLSession-backed libcurl compatibility layer for iOS 17+
// Eliminates desktop libcurl dependency while keeping UpdateChecker functional on iOS.

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#include <curl/curl.h>

#include <cstdarg>
#include <memory>
#include <mutex>
#include <string>

struct MarathonCurlHandle {
    std::string url;
    std::string userAgent;
    curl_write_callback writeFn = nullptr;
    void* writeData = nullptr;
    long followLocation = 1;
};

struct MarathonCurlAsyncState {
    std::mutex mtx;
    std::string body;
    NSInteger statusCode = 0;
    bool hasError = false;
    bool hasData = false;
};

extern "C" {

CURLcode curl_global_init(long) {
    return CURLE_OK;
}

void curl_global_cleanup(void) {}

CURL* curl_easy_init(void) {
    return new MarathonCurlHandle();
}

CURLcode curl_easy_setopt(CURL* handle, CURLoption option, ...) {
    if (!handle) return CURLE_FAILED_INIT;
    auto* ctx = static_cast<MarathonCurlHandle*>(handle);
    va_list args;
    va_start(args, option);
    switch (option) {
        case CURLOPT_URL: {
            const char* s = va_arg(args, const char*);
            ctx->url = s ? s : "";
            break;
        }
        case CURLOPT_USERAGENT: {
            const char* s = va_arg(args, const char*);
            ctx->userAgent = s ? s : "";
            break;
        }
        case CURLOPT_WRITEFUNCTION: {
            ctx->writeFn = va_arg(args, curl_write_callback);
            break;
        }
        case CURLOPT_WRITEDATA: {
            ctx->writeData = va_arg(args, void*);
            break;
        }
        case CURLOPT_FOLLOWLOCATION: {
            ctx->followLocation = va_arg(args, long);
            break;
        }
        default:
            break;
    }
    va_end(args);
    return CURLE_OK;
}

CURLcode curl_easy_perform(CURL* handle) {
    if (!handle) return CURLE_FAILED_INIT;
    auto* ctx = static_cast<MarathonCurlHandle*>(handle);
    if (ctx->url.empty()) return CURLE_URL_MALFORMAT;

    @autoreleasepool {
        NSString* urlStr = [NSString stringWithUTF8String:ctx->url.c_str()];
        NSURL* nsUrl = [NSURL URLWithString:urlStr];
        if (!nsUrl) return CURLE_URL_MALFORMAT;

        NSMutableURLRequest* req = [NSMutableURLRequest requestWithURL:nsUrl];
        req.timeoutInterval = 12.0;
        if (!ctx->userAgent.empty()) {
            NSString* ua = [NSString stringWithUTF8String:ctx->userAgent.c_str()];
            [req setValue:ua forHTTPHeaderField:@"User-Agent"];
        }

        // Use an ephemeral NSURLSession (RAM-only, no Library/Caches SQLite DB creation on first launch in LiveContainer)
        // and copy response bytes into heap-owned std::shared_ptr inside the completion handler to guarantee zero use-after-free.
        NSURLSessionConfiguration* cfg = [NSURLSessionConfiguration ephemeralSessionConfiguration];
        cfg.timeoutIntervalForRequest = 12.0;
        cfg.timeoutIntervalForResource = 15.0;
        NSURLSession* session = [NSURLSession sessionWithConfiguration:cfg];

        auto state = std::make_shared<MarathonCurlAsyncState>();
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);

        NSURLSessionDataTask* task = [session
            dataTaskWithRequest:req
              completionHandler:^(NSData* data, NSURLResponse* response, NSError* error) {
                  {
                      std::lock_guard<std::mutex> lock(state->mtx);
                      state->hasError = (error != nil);
                      if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
                          state->statusCode = ((NSHTTPURLResponse*)response).statusCode;
                      }
                      if (data != nil) {
                          state->hasData = true;
                          if (data.length > 0 && data.bytes != nullptr) {
                              state->body.assign(static_cast<const char*>(data.bytes), static_cast<size_t>(data.length));
                          }
                      }
                  }
                  dispatch_semaphore_signal(sem);
              }];
        [task resume];

        if (dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(15 * NSEC_PER_SEC))) != 0) {
            [task cancel];
            [session invalidateAndCancel];
            return CURLE_OPERATION_TIMEDOUT;
        }
        [session finishTasksAndInvalidate];

        std::string bodyCopy;
        NSInteger statusCode = 0;
        bool hasError = false;
        bool hasData = false;
        {
            std::lock_guard<std::mutex> lock(state->mtx);
            hasError = state->hasError;
            hasData = state->hasData;
            statusCode = state->statusCode;
            bodyCopy = std::move(state->body);
        }

        if (hasError || !hasData) {
            return CURLE_COULDNT_CONNECT;
        }
        if (statusCode >= 400) {
            return CURLE_HTTP_RETURNED_ERROR;
        }

        if (ctx->writeFn && !bodyCopy.empty()) {
            ctx->writeFn(bodyCopy.data(), 1, bodyCopy.size(), ctx->writeData);
        }
        return CURLE_OK;
    }
}

void curl_easy_cleanup(CURL* handle) {
    delete static_cast<MarathonCurlHandle*>(handle);
}

const char* curl_easy_strerror(CURLcode code) {
    switch (code) {
        case CURLE_OK: return "No error";
        case CURLE_URL_MALFORMAT: return "Malformed URL";
        case CURLE_COULDNT_CONNECT: return "Couldn't connect to server";
        case CURLE_OPERATION_TIMEDOUT: return "Operation timed out";
        case CURLE_HTTP_RETURNED_ERROR: return "HTTP server returned error";
        default: return "iOS NSURLSession request error";
    }
}

void MarathonIOS_OpenURL(const char* url) {
    if (!url || !url[0]) return;
    NSString* urlStr = [NSString stringWithUTF8String:url];
    NSURL* nsUrl = [NSURL URLWithString:urlStr];
    if (!nsUrl) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        [[UIApplication sharedApplication] openURL:nsUrl options:@{} completionHandler:nil];
    });
}

} // extern "C"
`;

  return { header, mm };
}

export function generateCMakeFiles(p: MarathonIosTemplateParams): {
  marathonIosCmake: string;
  iosPortTargetCmake: string;
} {
  const isLiveContainerCompat = p.targetInstaller === 'both' || p.targetInstaller === 'livecontainer';
  const rendererDef =
    p.rendererBackend === 'metal3-native'
      ? 'MARATHON_RECOMP_METAL=1\n    MARATHON_IOS_NATIVE_METAL=1'
      : 'MARATHON_IOS_MOLTENVK=1';

  const marathonIosCmake = `# Clean-room iOS arm64 CMake configuration for sonicnext-dev/MarathonRecomp v1.0.0
# Included at root CMakeLists.txt BEFORE thirdparty/ and tools/ so iOS cross-compilation
# finds static FreeType, FFmpeg, NFD, CURL, and macOS host tools cleanly.

option(MARATHON_IOS_PORT "Enable iOS arm64 clean-room port" ON)

if(CMAKE_SYSTEM_NAME STREQUAL "iOS")
    message(STATUS "Configuring MarathonRecomp v1.0.0 for iOS arm64 (Deployment Target: ${p.deploymentTarget})")

    # Allow find_package(Freetype) and static iOS deps outside Xcode iPhoneOS.sdk sysroot
    set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE BOTH)
    set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY BOTH)
    set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE BOTH)
    set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)

    if(DEFINED MARATHON_IOS_FREETYPE_ROOT AND EXISTS "\${MARATHON_IOS_FREETYPE_ROOT}/lib/libfreetype.a")
        list(APPEND CMAKE_FIND_ROOT_PATH "\${MARATHON_IOS_FREETYPE_ROOT}")
        list(APPEND CMAKE_PREFIX_PATH "\${MARATHON_IOS_FREETYPE_ROOT}")
        set(FREETYPE_LIBRARY "\${MARATHON_IOS_FREETYPE_ROOT}/lib/libfreetype.a" CACHE FILEPATH "Static iOS FreeType library" FORCE)
        set(FREETYPE_INCLUDE_DIRS "\${MARATHON_IOS_FREETYPE_ROOT}/include/freetype2" CACHE PATH "Static iOS FreeType headers" FORCE)
        set(FREETYPE_INCLUDE_DIR_ft2build "\${MARATHON_IOS_FREETYPE_ROOT}/include/freetype2" CACHE PATH "FreeType ft2build.h dir" FORCE)
        set(FREETYPE_INCLUDE_DIR_freetype2 "\${MARATHON_IOS_FREETYPE_ROOT}/include/freetype2" CACHE PATH "FreeType freetype2 headers dir" FORCE)
        set(MARATHON_IOS_FREETYPE_LIB "\${MARATHON_IOS_FREETYPE_ROOT}/lib/libfreetype.a")
        message(STATUS "Using static iOS FreeType: \${MARATHON_IOS_FREETYPE_LIB}")
    endif()

    if(DEFINED MARATHON_IOS_FFMPEG_ROOT AND EXISTS "\${MARATHON_IOS_FFMPEG_ROOT}/include/libavcodec/avcodec.h")
        list(APPEND CMAKE_FIND_ROOT_PATH "\${MARATHON_IOS_FFMPEG_ROOT}")
        message(STATUS "Using static iOS FFmpeg (XMA decoder): \${MARATHON_IOS_FFMPEG_ROOT}")
    endif()

    add_compile_definitions(
        MARATHON_IOS_PORT=1
        ${rendererDef}
        ${p.enableDirectXisoImport ? 'MARATHON_IOS_STREAMING_XISO=1' : 'MARATHON_IOS_STREAMING_XISO=0'}
    )

    ${isLiveContainerCompat ? `# Position-independent executable required for both Feather and LiveContainer
    add_compile_options(-fPIC)
    add_link_options(-Wl,-pie)` : `# Standard iOS arm64 executable flags`}

    set(MARATHON_IOS_FRAMEWORKS
        "-framework Foundation"
        "-framework UIKit"
        "-framework Metal"
        "-framework QuartzCore"
        "-framework CoreGraphics"
        "-framework CoreFoundation"
        "-framework CoreHaptics"
        "-framework GameController"
        "-framework AVFoundation"
        "-framework AudioToolbox"
        "-framework UniformTypeIdentifiers"
        "-framework CoreMedia"
        "-framework CoreVideo"
        "-framework VideoToolbox"
        "-framework IOSurface"
        "-framework Security"
    )
endif()

# Called from thirdparty/CMakeLists.txt when cross-compiling for iOS
function(marathon_setup_ios_thirdparty)
    if(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")
        return()
    endif()

    # 1. Native iOS Files Picker (nfd::nfd) replacing desktop nativefiledialog-extended
    if(NOT TARGET nfd)
        add_library(nfd INTERFACE)
        add_library(nfd::nfd ALIAS nfd)
        target_include_directories(nfd INTERFACE
            "\${CMAKE_SOURCE_DIR}/MarathonRecomp/ios_compat/include"
        )
    endif()

    # 2. Static iOS arm64 FFmpeg (ffmpeg) replacing desktop prebuilt ffmpeg-core
    if(NOT TARGET ffmpeg)
        if(NOT DEFINED MARATHON_IOS_FFMPEG_ROOT OR NOT EXISTS "\${MARATHON_IOS_FFMPEG_ROOT}/include/libavcodec/avcodec.h")
            message(FATAL_ERROR "Missing iOS FFmpeg root. Set MARATHON_IOS_FFMPEG_ROOT to the static arm64 FFmpeg install prefix.")
        endif()
        add_library(ffmpeg INTERFACE)
        target_include_directories(ffmpeg INTERFACE "\${MARATHON_IOS_FFMPEG_ROOT}/include")
        foreach(component avformat avcodec swscale avutil swresample)
            set(archive "\${MARATHON_IOS_FFMPEG_ROOT}/lib/lib\${component}.a")
            if(NOT EXISTS "\${archive}")
                message(FATAL_ERROR "Missing static iOS FFmpeg archive: \${archive}")
            endif()
            target_link_libraries(ffmpeg INTERFACE "\${archive}")
        endforeach()
        target_link_libraries(ffmpeg INTERFACE
            z bz2 iconv
            "-framework AudioToolbox"
            "-framework CoreMedia"
            "-framework VideoToolbox"
            "-framework CoreVideo"
            "-framework Security"
        )
    endif()

    # 3. Clean-room NSURLSession libcurl compatibility target (CURL::libcurl)
    if(NOT TARGET CURL::libcurl)
        add_library(marathon_ios_curl INTERFACE)
        add_library(CURL::libcurl ALIAS marathon_ios_curl)
        target_include_directories(marathon_ios_curl INTERFACE
            "\${CMAKE_SOURCE_DIR}/MarathonRecomp/ios_compat/include"
        )
    endif()
endfunction()

# Called from root CMakeLists.txt instead of add_subdirectory(tools) when cross-compiling for iOS
macro(marathon_setup_ios_host_tools)
    if(CMAKE_SYSTEM_NAME STREQUAL "iOS")
        set(_HOST_TOOL_MAP
            "file_to_c:MARATHON_HOST_FILE_TO_C"
            "u8extract:MARATHON_HOST_U8EXTRACT"
            "XenonRecomp:MARATHON_HOST_XENON_RECOMP"
            "XenosRecomp:MARATHON_HOST_XENOS_RECOMP"
        )
        foreach(_entry IN LISTS _HOST_TOOL_MAP)
            string(REPLACE ":" ";" _pair "\${_entry}")
            list(GET _pair 0 _tool_name)
            list(GET _pair 1 _tool_var)
            if(NOT DEFINED \${_tool_var} OR NOT EXISTS "\${\${_tool_var}}")
                message(FATAL_ERROR "Missing macOS host tool \${_tool_name} (\${_tool_var}='\${\${_tool_var}}'). Build host tools first.")
            endif()
            if(NOT TARGET \${_tool_name})
                add_executable(\${_tool_name} IMPORTED GLOBAL)
                set_target_properties(\${_tool_name} PROPERTIES IMPORTED_LOCATION "\${\${_tool_var}}")
            endif()
        endforeach()

        # Cross-compile only the runtime libraries from tools/ needed by MarathonRecomp
        set(THIRDPARTY_ROOT "\${CMAKE_SOURCE_DIR}/tools/XenonRecomp/thirdparty")
        add_subdirectory("\${THIRDPARTY_ROOT}" "xenon-thirdparty")
        add_subdirectory("\${CMAKE_SOURCE_DIR}/tools/XenonRecomp/XenonUtils" "xenon-utils")
        add_subdirectory("\${CMAKE_SOURCE_DIR}/tools/XenosRecomp/thirdparty/zstd/build/cmake" "zstd")

        # Keep host macOS dxc-macos available for compile_shader SPIR-V generation
        set(DXC_HOST_ROOT "\${CMAKE_SOURCE_DIR}/tools/XenosRecomp/thirdparty/dxc-bin")
        if(CMAKE_HOST_SYSTEM_PROCESSOR MATCHES "arm64|aarch64")
            set(DXC_HOST_ARCH arm64)
        else()
            set(DXC_HOST_ARCH x64)
        endif()
        set(DIRECTX_DXC_TOOL
            "DYLD_LIBRARY_PATH=\${DXC_HOST_ROOT}/lib/\${DXC_HOST_ARCH}"
            "\${DXC_HOST_ROOT}/bin/\${DXC_HOST_ARCH}/dxc-macos"
            CACHE INTERNAL "Host macOS DXC compiler for iOS cross-compile" FORCE
        )
    endif()
endmacro()
`;

  const iosPortTargetCmake = `# Target-level iOS linking & app bundle metadata helper
function(marathon_configure_ios_target TARGET_NAME)
    if(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")
        return()
    endif()

    target_include_directories(\${TARGET_NAME} PRIVATE
        "\${CMAKE_SOURCE_DIR}/MarathonRecomp/ios_compat/include"
    )

    target_link_libraries(\${TARGET_NAME} PRIVATE
        \${MARATHON_IOS_FRAMEWORKS}
        \${MARATHON_IOS_FREETYPE_LIB}
        "-lz"
        "-lbz2"
        "-liconv"
    )

    set_target_properties(\${TARGET_NAME} PROPERTIES
        OUTPUT_NAME "MarathonRecomp"
        MACOSX_BUNDLE TRUE
        MACOSX_BUNDLE_INFO_PLIST "\${CMAKE_SOURCE_DIR}/ios/Info.plist"
        XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER "${p.bundleId}"
        XCODE_ATTRIBUTE_IPHONEOS_DEPLOYMENT_TARGET "${p.deploymentTarget}"
        XCODE_ATTRIBUTE_CODE_SIGN_ENTITLEMENTS "\${CMAKE_SOURCE_DIR}/ios/Entitlements.plist"
    )
endfunction()
`;

  return { marathonIosCmake, iosPortTargetCmake };
}
