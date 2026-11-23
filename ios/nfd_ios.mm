// Clean-room iOS UIDocumentPickerViewController bridge for MarathonRecomp v1.0.0
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
    } else {
        NSURL *destURL = [importDir URLByAppendingPathComponent:url.lastPathComponent];
        [fm removeItemAtURL:destURL error:nil];
        NSError *fsErr = nil;

        // 2. With asCopy:YES iOS already creates an APFS CoW clone in tmp/Inbox;
        //    moveItemAtURL is O(1) instant even for 6.5 GB Xbox 360 .xiso images!
        if (self.usedCopyMode && !self.pickFolder && [fm moveItemAtURL:url toURL:destURL error:&fsErr]) {
            resolved = destURL.path;
        } else if ([fm copyItemAtURL:url toURL:destURL error:&fsErr]) {
            resolved = destURL.path;
        } else {
            // 3. Fallback: keep security-scoped direct path (note: caller finishes before app exit)
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

        // Direct XISO quick-select sheet (edgyios pattern):
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
        }

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
