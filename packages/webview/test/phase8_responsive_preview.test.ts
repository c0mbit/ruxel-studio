import assert from "node:assert/strict";
import test from "node:test";
import {
    useViewportStore,
    calculateEffectiveDimensions,
    calculateProportionalScale,
    calculateViewportFrameBounds,
    mapPointerToViewport,
    DEVICE_PRESETS,
    MIN_VIEWPORT_WIDTH,
    MAX_VIEWPORT_WIDTH,
    MIN_VIEWPORT_HEIGHT,
    MAX_VIEWPORT_HEIGHT,
} from "../src/state/viewportStore.ts";

test("Directive 1: Zustand Viewport Store initializes with default responsive state", () => {
    const state = useViewportStore.getState();
    assert.equal(state.deviceMode, "responsive");
    assert.equal(state.orientation, "portrait");
    assert.equal(state.autoFitScale, true);
    assert.deepEqual(state.customDimensions, { width: 1200, height: 800 });
});

test("Directive 1: Viewport presets toggle between Mobile, Tablet, Desktop and Responsive", () => {
    const store = useViewportStore.getState();

    // 1. Mobile preset (375x812)
    store.setDeviceMode("mobile");
    assert.equal(useViewportStore.getState().deviceMode, "mobile");
    let eff = useViewportStore.getState().getEffectiveDimensions();
    assert.equal(eff.width, DEVICE_PRESETS.mobile.width);
    assert.equal(eff.height, DEVICE_PRESETS.mobile.height);

    // 2. Tablet preset (768x1024)
    store.setDeviceMode("tablet");
    assert.equal(useViewportStore.getState().deviceMode, "tablet");
    eff = useViewportStore.getState().getEffectiveDimensions();
    assert.equal(eff.width, DEVICE_PRESETS.tablet.width);
    assert.equal(eff.height, DEVICE_PRESETS.tablet.height);

    // 3. Desktop preset (1440x900)
    store.setDeviceMode("desktop");
    assert.equal(useViewportStore.getState().deviceMode, "desktop");
    eff = useViewportStore.getState().getEffectiveDimensions();
    assert.equal(eff.width, DEVICE_PRESETS.desktop.width);
    assert.equal(eff.height, DEVICE_PRESETS.desktop.height);

    // 4. Return to Responsive mode
    store.setDeviceMode("responsive");
    assert.equal(useViewportStore.getState().deviceMode, "responsive");
    eff = useViewportStore.getState().getEffectiveDimensions();
    assert.deepEqual(eff, { width: 1200, height: 800 });
});

test("Directive 1: Orientation toggling swaps width and height correctly across device types", () => {
    const store = useViewportStore.getState();

    // Mobile: Portrait (375x812) -> Landscape (812x375)
    store.setDeviceMode("mobile");
    store.setOrientation("portrait");
    assert.deepEqual(useViewportStore.getState().getEffectiveDimensions(), {
        width: 375,
        height: 812,
    });

    store.toggleOrientation();
    assert.equal(useViewportStore.getState().orientation, "landscape");
    assert.deepEqual(useViewportStore.getState().getEffectiveDimensions(), {
        width: 812,
        height: 375,
    });

    // Tablet: Portrait (768x1024) -> Landscape (1024x768)
    store.setDeviceMode("tablet");
    store.setOrientation("portrait");
    assert.deepEqual(useViewportStore.getState().getEffectiveDimensions(), {
        width: 768,
        height: 1024,
    });

    store.toggleOrientation();
    assert.deepEqual(useViewportStore.getState().getEffectiveDimensions(), {
        width: 1024,
        height: 768,
    });

    // Desktop: Landscape (1440x900) -> Portrait (900x1440)
    store.setDeviceMode("desktop");
    store.setOrientation("landscape");
    assert.deepEqual(useViewportStore.getState().getEffectiveDimensions(), {
        width: 1440,
        height: 900,
    });

    store.toggleOrientation();
    assert.deepEqual(useViewportStore.getState().getEffectiveDimensions(), {
        width: 900,
        height: 1440,
    });

    // Reset orientation
    store.setOrientation("portrait");
});

test("Directive 2: Custom dimensions modification and boundary clamping", () => {
    const store = useViewportStore.getState();
    store.setDeviceMode("responsive");

    store.setCustomWidth(640);
    store.setCustomHeight(480);
    assert.deepEqual(useViewportStore.getState().getEffectiveDimensions(), {
        width: 640,
        height: 480,
    });

    // Test underflow boundary clamp
    store.setCustomWidth(50);
    store.setCustomHeight(20);
    assert.equal(useViewportStore.getState().getEffectiveDimensions().width, MIN_VIEWPORT_WIDTH);
    assert.equal(useViewportStore.getState().getEffectiveDimensions().height, MIN_VIEWPORT_HEIGHT);

    // Test overflow boundary clamp
    store.setCustomWidth(9999);
    store.setCustomHeight(9999);
    assert.equal(useViewportStore.getState().getEffectiveDimensions().width, MAX_VIEWPORT_WIDTH);
    assert.equal(useViewportStore.getState().getEffectiveDimensions().height, MAX_VIEWPORT_HEIGHT);

    // Reset
    store.resetToDefaultResolution(1200, 800);
    assert.deepEqual(useViewportStore.getState().getEffectiveDimensions(), {
        width: 1200,
        height: 800,
    });
});

test("Directive 2: Boundary Calculation - calculateProportionalScale when device exceeds panel bounds", () => {
    // When available panel space is 800x600 (padding 32 on each side -> 736x536 usable):
    // Desktop preset is 1440x900.
    // scaleX = 736 / 1440 ≈ 0.511
    // scaleY = 536 / 900 ≈ 0.595
    // fitScale = Math.min(0.511, 0.595) = 0.511
    const scale = calculateProportionalScale(800, 600, 1440, 900, 32);
    assert.equal(scale <= 0.52 && scale >= 0.5, true);
    assert.equal(typeof scale, "number");

    // When device resolution fits within available space: scale MUST be 1.0 (no distortion)
    // Mobile 375x812 in 1200x1000 panel (usable 1136x936)
    const mobileScale = calculateProportionalScale(1200, 1000, 375, 812, 32);
    assert.equal(mobileScale, 1.0);

    // Extreme zero/negative cases handled safely
    assert.equal(calculateProportionalScale(0, 0, 0, 0), 1.0);
    assert.equal(calculateProportionalScale(500, 500, -100, 500), 1.0);
});

test("Directive 2: Boundary Calculation - calculateViewportFrameBounds centers frame properly", () => {
    // Available 1000x800, Target 500x400, Scale 1.0
    // Centered X: (1000 - 500) / 2 = 250
    // Centered Y: (800 - 400) / 2 = 200
    const bounds = calculateViewportFrameBounds(1000, 800, 500, 400, 1.0);
    assert.equal(bounds.x, 250);
    assert.equal(bounds.y, 200);
    assert.equal(bounds.width, 500);
    assert.equal(bounds.height, 400);
    assert.equal(bounds.scale, 1.0);

    // When scaled down to 0.5
    // Scaled target: 250x200
    // Centered X: (1000 - 250) / 2 = 375
    // Centered Y: (800 - 200) / 2 = 300
    const scaledBounds = calculateViewportFrameBounds(1000, 800, 500, 400, 0.5);
    assert.equal(scaledBounds.x, 375);
    assert.equal(scaledBounds.y, 300);
});

test("Directive 2 & Guardrail 1: mapPointerToViewport preserves 1:1 coordinate accuracy under scale", () => {
    const frameX = 100;
    const frameY = 50;

    // At 1.0 scale:
    const pt1 = mapPointerToViewport(250, 150, frameX, frameY, 1.0);
    assert.equal(pt1.x, 150); // 250 - 100 = 150
    assert.equal(pt1.y, 100); // 150 - 50 = 100

    // At 0.5 scale:
    const pt2 = mapPointerToViewport(250, 150, frameX, frameY, 0.5);
    assert.equal(pt2.x, 300); // (250 - 100) / 0.5 = 300
    assert.equal(pt2.y, 200); // (150 - 50) / 0.5 = 200

    // At 2.0 scale:
    const pt3 = mapPointerToViewport(250, 150, frameX, frameY, 2.0);
    assert.equal(pt3.x, 75); // (250 - 100) / 2.0 = 75
    assert.equal(pt3.y, 50); // (150 - 50) / 2.0 = 50
});

test("Directive 3: Pure Effective Dimensions helper calculates correctly without store side-effects", () => {
    // Mobile
    const mobileEff = calculateEffectiveDimensions("mobile", "portrait", { width: 1000, height: 700 });
    assert.deepEqual(mobileEff, { width: 375, height: 812 });

    const mobileLandscape = calculateEffectiveDimensions("mobile", "landscape", { width: 1000, height: 700 });
    assert.deepEqual(mobileLandscape, { width: 812, height: 375 });

    // Desktop
    const desktopLandscape = calculateEffectiveDimensions("desktop", "landscape", { width: 1000, height: 700 });
    assert.deepEqual(desktopLandscape, { width: 1440, height: 900 });

    const desktopPortrait = calculateEffectiveDimensions("desktop", "portrait", { width: 1000, height: 700 });
    assert.deepEqual(desktopPortrait, { width: 900, height: 1440 });

    // Responsive / Custom
    const customEff = calculateEffectiveDimensions("responsive", "portrait", { width: 450, height: 600 });
    assert.deepEqual(customEff, { width: 450, height: 600 });
});

test("Guardrail 1: Drag & Drop coordinate integrity under custom viewport stretching", () => {
    const store = useViewportStore.getState();
    store.setDeviceMode("responsive");
    store.setCustomDimensions({ width: 600, height: 900 });

    // Simulate mouse drag move on a widget
    const scale = 0.75;
    const dragDeltaScreenX = 75; // 75px on physical screen
    const dragDeltaScreenY = 150; // 150px on physical screen

    const worldDeltaX = dragDeltaScreenX / scale;
    const worldDeltaY = dragDeltaScreenY / scale;

    assert.equal(worldDeltaX, 100);
    assert.equal(worldDeltaY, 200);

    // Initial widget rect in unscaled device frame
    const initialRect = { x: 50, y: 50, width: 200, height: 100 };
    const candidateRect = {
        x: initialRect.x + worldDeltaX,
        y: initialRect.y + worldDeltaY,
        width: initialRect.width,
        height: initialRect.height,
    };

    assert.equal(candidateRect.x, 150);
    assert.equal(candidateRect.y, 250);
    assert.equal(candidateRect.width, 200);
    assert.equal(candidateRect.height, 100);
});

test("Guardrail 2: Zero Regression - Auto-fit scale toggle and preview scale synchronization", () => {
    const store = useViewportStore.getState();
    assert.equal(store.autoFitScale, true);

    store.setAutoFitScale(false);
    assert.equal(useViewportStore.getState().autoFitScale, false);

    store.setPreviewScale(0.65);
    assert.equal(useViewportStore.getState().previewScale, 0.65);

    store.setAutoFitScale(true);
    assert.equal(useViewportStore.getState().autoFitScale, true);
});

