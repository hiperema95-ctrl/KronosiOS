// Clean-room Sonic '06 Action-Gauge Virtual Controller for MarathonRecomp iOS
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
