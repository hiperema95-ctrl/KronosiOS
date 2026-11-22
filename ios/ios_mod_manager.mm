// Native UIKit Mod Manager sheet reading Documents/MarathonRecomp/mods and profiles.json
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
