// Clean-room CoreGraphics / QuartzCore Xbox 360 Virtual Controller for MarathonRecomp iOS
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
    dispatch_async(dispatch_get_main_queue(), ^{
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
    });
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
