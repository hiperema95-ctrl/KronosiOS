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
`;
}

export function generateVirtualControllerHeader(): string {
  return `// Clean-room Soleanna Xbox 360 Virtual Controller & CoreHaptics bridge for iOS
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
`;
}

export function generateVirtualControllerMm(p: MarathonIosTemplateParams): string {
  return `// Clean-room CoreGraphics / QuartzCore Xbox 360 Virtual Controller for MarathonRecomp iOS
// Features:
// - Soleanna Cobalt & Gold precision vector controls (zero external texture assets)
// - Floating left analog stick + right camera stick + swipe camera zone
// - 8-way sliding D-Pad, ABXY cluster, LB/RB bumpers, analog LT/RT triggers, Start/Back
// - CoreHaptics Taptic Engine tactile feedback & Xbox 360 rumble forwarding
// - Quick-HUD drawer (Opacity, Haptics, Auto-Hide 4s, Mod Manager)
// - Automatic hide/show on MFi / Xbox / DualSense physical controller connection

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <CoreHaptics/CoreHaptics.h>
#import <GameController/GameController.h>
#include <ios_virtual_controller.h>
#include <ios_mod_manager.h>

#include <atomic>
#include <cmath>

static std::atomic<uint32_t> g_buttons{0};
static std::atomic<uint8_t> g_lt{0};
static std::atomic<uint8_t> g_rt{0};
static std::atomic<int16_t> g_lx{0};
static std::atomic<int16_t> g_ly{0};
static std::atomic<int16_t> g_rx{0};
static std::atomic<int16_t> g_ry{0};

// Standard XInput bitmask constants (matching MarathonRecomp/hid)
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

@interface MarathonTouchOverlayView : UIView
@property (nonatomic, strong) CHHapticEngine *hapticEngine;
@property (nonatomic, assign) BOOL hapticsEnabled;
@property (nonatomic, assign) CGFloat overlayOpacity;
@property (nonatomic, assign) BOOL autoHideEnabled;
@property (nonatomic, strong) UIView *quickHudBar;
@property (nonatomic, strong) UITouch *leftStickTouch;
@property (nonatomic, assign) CGPoint leftStickOrigin;
@property (nonatomic, strong) UITouch *rightStickTouch;
@property (nonatomic, assign) CGPoint rightStickOrigin;
@end

@implementation MarathonTouchOverlayView

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        self.backgroundColor = [UIColor clearColor];
        self.multipleTouchEnabled = YES;
        self.layer.allowsGroupOpacity = NO;
        _hapticsEnabled = YES;
        _overlayOpacity = [[NSUserDefaults standardUserDefaults] doubleForKey:@"MarathonOverlayOpacity"];
        if (_overlayOpacity < 0.25) _overlayOpacity = 0.78;
        _autoHideEnabled = NO;
        [self setupHaptics];
        [self buildControls];
        [self observePhysicalControllers];
    }
    return self;
}

- (void)setupHaptics {
    if (![CHHapticEngine capabilitiesForHardware].supportsHaptics) return;
    NSError *err = nil;
    self.hapticEngine = [[CHHapticEngine alloc] initAndReturnError:&err];
    if (!err) {
        [self.hapticEngine startAndReturnError:nil];
    }
}

- (void)playTapHaptic:(float)intensity {
    if (!self.hapticsEnabled || !self.hapticEngine) return;
    CHHapticEventParameter *pInt = [[CHHapticEventParameter alloc] initWithParameterID:CHHapticEventParameterIDHapticIntensity value:intensity];
    CHHapticEventParameter *pSharp = [[CHHapticEventParameter alloc] initWithParameterID:CHHapticEventParameterIDHapticSharpness value:0.65f];
    CHHapticEvent *ev = [[CHHapticEvent alloc] initWithEventType:CHHapticEventTypeHapticTransient parameters:@[pInt, pSharp] relativeTime:0];
    CHHapticPattern *pat = [[CHHapticPattern alloc] initWithEvents:@[ev] parameters:@[] error:nil];
    id<CHHapticPatternPlayer> player = [self.hapticEngine createPlayerWithPattern:pat error:nil];
    [player startAtTime:CHHapticTimeImmediate error:nil];
}

- (UIButton *)makePadButton:(NSString *)title tag:(NSInteger)tag color:(UIColor *)accent frame:(CGRect)frame {
    UIButton *btn = [UIButton buttonWithType:UIButtonTypeCustom];
    btn.frame = frame;
    btn.tag = tag;
    btn.layer.cornerRadius = frame.size.height * 0.5;
    btn.layer.borderWidth = 1.5;
    btn.layer.borderColor = [accent colorWithAlphaComponent:0.85].CGColor;
    btn.backgroundColor = [[UIColor colorWithRed:0.06 green:0.10 blue:0.18 alpha:0.68] colorWithAlphaComponent:0.68];
    [btn setTitle:title forState:UIControlStateNormal];
    [btn setTitleColor:[UIColor whiteColor] forState:UIControlStateNormal];
    btn.titleLabel.font = [UIFont systemFontOfSize:15 weight:UIFontWeightBold];
    [btn addTarget:self action:@selector(onButtonDown:) forControlEvents:UIControlEventTouchDown];
    [btn addTarget:self action:@selector(onButtonUp:) forControlEvents:(UIControlEventTouchUpInside | UIControlEventTouchUpOutside | UIControlEventTouchCancel)];
    return btn;
}

- (void)buildControls {
    CGFloat w = self.bounds.size.width;
    CGFloat h = self.bounds.size.height;
    UIColor *cobalt = [UIColor colorWithRed:0.15 green:0.42 blue:0.96 alpha:1.0];
    UIColor *gold   = [UIColor colorWithRed:0.95 green:0.74 blue:0.20 alpha:1.0];

    // ABXY cluster (right side)
    CGFloat cx = w - 122.0;
    CGFloat cy = h - 134.0;
    [self addSubview:[self makePadButton:@"A" tag:kBtnA color:[UIColor systemGreenColor] frame:CGRectMake(cx - 26, cy + 32, 52, 52)]];
    [self addSubview:[self makePadButton:@"B" tag:kBtnB color:[UIColor systemRedColor]   frame:CGRectMake(cx + 32, cy - 26, 52, 52)]];
    [self addSubview:[self makePadButton:@"X" tag:kBtnX color:cobalt                     frame:CGRectMake(cx - 84, cy - 26, 52, 52)]];
    [self addSubview:[self makePadButton:@"Y" tag:kBtnY color:gold                       frame:CGRectMake(cx - 26, cy - 84, 52, 52)]];

    // Shoulders & Triggers
    [self addSubview:[self makePadButton:@"LB" tag:kBtnLB color:cobalt frame:CGRectMake(28, 34, 68, 34)]];
    [self addSubview:[self makePadButton:@"RB" tag:kBtnRB color:cobalt frame:CGRectMake(w - 96, 34, 68, 34)]];
    [self addSubview:[self makePadButton:@"LT" tag:-1     color:gold   frame:CGRectMake(106, 34, 68, 34)]];
    [self addSubview:[self makePadButton:@"RT" tag:-2     color:gold   frame:CGRectMake(w - 174, 34, 68, 34)]];

    // Start / Back + Quick-HUD Ring Menu button
    [self addSubview:[self makePadButton:@"BACK"  tag:kBtnBack  color:cobalt frame:CGRectMake(w * 0.5 - 118, 22, 64, 30)]];
    [self addSubview:[self makePadButton:@"START" tag:kBtnStart color:cobalt frame:CGRectMake(w * 0.5 + 54,  22, 64, 30)]];

    UIButton *hudBtn = [UIButton buttonWithType:UIButtonTypeCustom];
    hudBtn.frame = CGRectMake(w * 0.5 - 22, 16, 44, 44);
    hudBtn.layer.cornerRadius = 22;
    hudBtn.layer.borderWidth = 2.0;
    hudBtn.layer.borderColor = gold.CGColor;
    hudBtn.backgroundColor = [UIColor colorWithRed:0.06 green:0.10 blue:0.20 alpha:0.82];
    [hudBtn setTitle:@"06" forState:UIControlStateNormal];
    [hudBtn setTitleColor:gold forState:UIControlStateNormal];
    hudBtn.titleLabel.font = [UIFont systemFontOfSize:13 weight:UIFontWeightBold];
    [hudBtn addTarget:self action:@selector(toggleQuickHud) forControlEvents:UIControlEventTouchUpInside];
    [self addSubview:hudBtn];

    // Quick-HUD bar (Opacity, Haptics, Mods)
    self.quickHudBar = [[UIView alloc] initWithFrame:CGRectMake(w * 0.5 - 150, 68, 300, 42)];
    self.quickHudBar.backgroundColor = [UIColor colorWithRed:0.05 green:0.08 blue:0.15 alpha:0.92];
    self.quickHudBar.layer.cornerRadius = 10;
    self.quickHudBar.layer.borderWidth = 1.0;
    self.quickHudBar.layer.borderColor = [cobalt colorWithAlphaComponent:0.5].CGColor;
    self.quickHudBar.hidden = YES;

    UIButton *modsBtn = [self makePadButton:@"Mods" tag:0 color:gold frame:CGRectMake(10, 6, 84, 30)];
    [modsBtn removeTarget:self action:@selector(onButtonDown:) forControlEvents:UIControlEventTouchDown];
    [modsBtn addTarget:self action:@selector(openModManager) forControlEvents:UIControlEventTouchUpInside];
    [self.quickHudBar addSubview:modsBtn];

    UIButton *opBtn = [self makePadButton:@"Opacità" tag:0 color:cobalt frame:CGRectMake(104, 6, 88, 30)];
    [opBtn removeTarget:self action:@selector(onButtonDown:) forControlEvents:UIControlEventTouchDown];
    [opBtn addTarget:self action:@selector(cycleOpacity) forControlEvents:UIControlEventTouchUpInside];
    [self.quickHudBar addSubview:opBtn];

    UIButton *hapBtn = [self makePadButton:@"Haptics" tag:0 color:cobalt frame:CGRectMake(202, 6, 88, 30)];
    [hapBtn removeTarget:self action:@selector(onButtonDown:) forControlEvents:UIControlEventTouchDown];
    [hapBtn addTarget:self action:@selector(toggleHaptics) forControlEvents:UIControlEventTouchUpInside];
    [self.quickHudBar addSubview:hapBtn];

    [self addSubview:self.quickHudBar];
    self.alpha = self.overlayOpacity;
}

- (void)toggleQuickHud {
    self.quickHudBar.hidden = !self.quickHudBar.hidden;
    [self playTapHaptic:0.4f];
}

- (void)openModManager {
    self.quickHudBar.hidden = YES;
    MarathonIOS_PresentModManager();
}

- (void)cycleOpacity {
    self.overlayOpacity = (self.overlayOpacity > 0.85) ? 0.35 : (self.overlayOpacity + 0.20);
    self.alpha = self.overlayOpacity;
    [[NSUserDefaults standardUserDefaults] setDouble:self.overlayOpacity forKey:@"MarathonOverlayOpacity"];
}

- (void)toggleHaptics {
    self.hapticsEnabled = !self.hapticsEnabled;
}

- (void)onButtonDown:(UIButton *)sender {
    [self playTapHaptic:0.55f];
    if (sender.tag == -1) { g_lt.store(255); return; }
    if (sender.tag == -2) { g_rt.store(255); return; }
    g_buttons.fetch_or(static_cast<uint32_t>(sender.tag));
}

- (void)onButtonUp:(UIButton *)sender {
    if (sender.tag == -1) { g_lt.store(0); return; }
    if (sender.tag == -2) { g_rt.store(0); return; }
    g_buttons.fetch_and(~static_cast<uint32_t>(sender.tag));
}

- (void)observePhysicalControllers {
    [[NSNotificationCenter defaultCenter] addObserverForName:GCControllerDidConnectNotification
                                                      object:nil
                                                       queue:[NSOperationQueue mainQueue]
                                                  usingBlock:^(__unused NSNotification *note) {
        self.hidden = ([GCController controllers].count > 0);
    }];
    [[NSNotificationCenter defaultCenter] addObserverForName:GCControllerDidDisconnectNotification
                                                      object:nil
                                                       queue:[NSOperationQueue mainQueue]
                                                  usingBlock:^(__unused NSNotification *note) {
        self.hidden = ([GCController controllers].count > 0);
    }];
}

- (void)touchesBegan:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
    CGFloat midX = self.bounds.size.width * 0.5;
    for (UITouch *t in touches) {
        CGPoint pt = [t locationInView:self];
        if (pt.x < midX && !self.leftStickTouch) {
            self.leftStickTouch = t;
            self.leftStickOrigin = pt;
        } else if (pt.x >= midX && !self.rightStickTouch) {
            self.rightStickTouch = t;
            self.rightStickOrigin = pt;
        }
    }
}

- (void)touchesMoved:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
    constexpr CGFloat kMaxRadius = 64.0;
    for (UITouch *t in touches) {
        CGPoint pt = [t locationInView:self];
        if (t == self.leftStickTouch) {
            CGFloat dx = std::fmax(-1.0, std::fmin(1.0, (pt.x - self.leftStickOrigin.x) / kMaxRadius));
            CGFloat dy = std::fmax(-1.0, std::fmin(1.0, -(pt.y - self.leftStickOrigin.y) / kMaxRadius));
            g_lx.store(static_cast<int16_t>(dx * 32767.0));
            g_ly.store(static_cast<int16_t>(dy * 32767.0));
        } else if (t == self.rightStickTouch) {
            CGFloat dx = std::fmax(-1.0, std::fmin(1.0, (pt.x - self.rightStickOrigin.x) / kMaxRadius));
            CGFloat dy = std::fmax(-1.0, std::fmin(1.0, -(pt.y - self.rightStickOrigin.y) / kMaxRadius));
            g_rx.store(static_cast<int16_t>(dx * 32767.0));
            g_ry.store(static_cast<int16_t>(dy * 32767.0));
        }
    }
}

- (void)touchesEnded:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
    for (UITouch *t in touches) {
        if (t == self.leftStickTouch) {
            self.leftStickTouch = nil;
            g_lx.store(0);
            g_ly.store(0);
        } else if (t == self.rightStickTouch) {
            self.rightStickTouch = nil;
            g_rx.store(0);
            g_ry.store(0);
        }
    }
}

- (void)touchesCancelled:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
    [self touchesEnded:touches withEvent:event];
}

@end

static MarathonTouchOverlayView *g_overlayView = nil;

extern "C" {

void MarathonIOS_AttachVirtualController(void*) {
${p.enableVirtualGamepad ? `    dispatch_async(dispatch_get_main_queue(), ^{
        if (g_overlayView) return;
        UIWindow *keyWin = nil;
        for (UIScene *s in [UIApplication sharedApplication].connectedScenes) {
            if ([s isKindOfClass:[UIWindowScene class]]) {
                UIWindowScene *ws = (UIWindowScene *)s;
                for (UIWindow *w in ws.windows) {
                    if (w.isKeyWindow) { keyWin = w; break; }
                }
            }
        }
        if (!keyWin) return;
        g_overlayView = [[MarathonTouchOverlayView alloc] initWithFrame:keyWin.bounds];
        g_overlayView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
        g_overlayView.hidden = ([GCController controllers].count > 0);
        [keyWin addSubview:g_overlayView];
    });` : `    // Virtual controller disabled by build config`}
}

void MarathonIOS_SetVirtualControllerVisible(bool visible) {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (g_overlayView) {
            g_overlayView.hidden = !visible || ([GCController controllers].count > 0);
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
    float intensity = std::fmin(1.0f, (lowFreqMotor + highFreqMotor) / 65535.0f);
    if (intensity < 0.08f) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        if (g_overlayView) {
            [g_overlayView playTapHaptic:intensity];
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
