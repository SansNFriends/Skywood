export const QUALITY_LEVELS = Object.freeze({
  LOW: "low",
  MID: "mid",
  HIGH: "high"
});

const DEFAULT_DEBUG_TOGGLE_KEY = "F4";

export const QUALITY_PRESETS = Object.freeze({
  [QUALITY_LEVELS.LOW]: {
    zoom: 1,

    enableParallax: false,
    parallaxLayers: 3,
    enableEnvAnim: false
  },
  [QUALITY_LEVELS.MID]: {
    zoom: 1,
    enableParallax: true,
    parallaxLayers: 6,
    enableEnvAnim: true
  },
  [QUALITY_LEVELS.HIGH]: {
    zoom: 3,
    enableParallax: true,
    parallaxLayers: 7,
    enableEnvAnim: true
  }
});

export const GFX = {
  quality: QUALITY_LEVELS.MID,
  zoom: QUALITY_PRESETS[QUALITY_LEVELS.MID].zoom,
  currentZoom: QUALITY_PRESETS[QUALITY_LEVELS.MID].zoom,
  enableParallax: QUALITY_PRESETS[QUALITY_LEVELS.MID].enableParallax,
  parallaxLayers: QUALITY_PRESETS[QUALITY_LEVELS.MID].parallaxLayers,
  enableEnvAnim: QUALITY_PRESETS[QUALITY_LEVELS.MID].enableEnvAnim,
  showDebugHUD: false,
  debugToggleKey: DEFAULT_DEBUG_TOGGLE_KEY

};

const OPTION_TO_PRESET = Object.freeze({
  Performance: QUALITY_LEVELS.LOW,
  Low: QUALITY_LEVELS.LOW,
  Balanced: QUALITY_LEVELS.MID,
  Mid: QUALITY_LEVELS.MID,
  Medium: QUALITY_LEVELS.MID,
  High: QUALITY_LEVELS.HIGH
});

export function resolveQualityPreset(value) {
  if (value && typeof value === "string") {
    const normalized = value.trim();
    if (QUALITY_PRESETS[normalized]) {
      return normalized;
    }
    const mapped = OPTION_TO_PRESET[normalized];
    if (mapped) {
      return mapped;
    }
  }
  return QUALITY_LEVELS.MID;
}

export function applyGraphicsPreset(presetName) {
  const presetKey = resolveQualityPreset(presetName);
  const preset = QUALITY_PRESETS[presetKey] || QUALITY_PRESETS[QUALITY_LEVELS.MID];
  GFX.quality = presetKey;
  GFX.zoom = preset.zoom;
  GFX.currentZoom = preset.zoom;
  GFX.enableParallax = preset.enableParallax;
  GFX.parallaxLayers = preset.parallaxLayers;
  GFX.enableEnvAnim = preset.enableEnvAnim;
  return { ...GFX };
}

export function updateCurrentZoom(zoom) {
  if (typeof zoom === "number" && Number.isFinite(zoom)) {
    GFX.currentZoom = zoom;
  }
  return GFX.currentZoom;
}

export function setDebugHudVisible(visible) {
  GFX.showDebugHUD = Boolean(visible);
  return GFX.showDebugHUD;
}

export function isDebugHudVisible() {
  return Boolean(GFX.showDebugHUD);
}


export function getDebugToggleKey() {
  const key = typeof GFX.debugToggleKey === "string" ? GFX.debugToggleKey.trim() : "";
  if (!key) {
    return DEFAULT_DEBUG_TOGGLE_KEY;
  }
  return key.toUpperCase();
}

