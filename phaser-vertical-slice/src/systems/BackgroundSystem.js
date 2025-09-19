import Phaser from "../phaser.js";
import { ASSET_KEYS } from "./AssetLoader.js";
import { GFX, QUALITY_LEVELS } from "../config/graphics.js";

const SKY_TEXTURE_KEY = "bg.dynamic.sky";
const FOG_TEXTURE_KEY = "bg.dynamic.fog";
const WATER_TEXTURE_KEY = "bg.dynamic.water";
const PLACEHOLDER_PREFIX = "bg.placeholder.";

const BASE_LAYER_DEFINITIONS = [
  {
    id: "sky",
    type: "gradient",
    depth: -120,
    parallaxRatioX: 0,
    parallaxRatioY: 0,
    alpha: 1,
    widthScale: 1,
    heightScale: 1
  },
  {
    id: "far",
    texture: ASSET_KEYS.IMAGE.PARALLAX_FAR,
    depth: -110,
    parallaxRatioX: 0.08,
    parallaxRatioY: 0,
    widthScale: 1.15,
    heightScale: 1.1,
    animate: { scrollX: 0.0018 }
  },
  {
    id: "clouds",
    texture: ASSET_KEYS.IMAGE.PARALLAX_MID,
    depth: -105,
    parallaxRatioX: 0.18,
    parallaxRatioY: 0.02,
    widthScale: 1.25,
    heightScale: 1.1,
    tint: 0xbfd6ff,
    animate: { scrollX: 0.02 }
  },
  {
    id: "midForest",
    texture: ASSET_KEYS.IMAGE.PARALLAX_NEAR,
    depth: -95,
    parallaxRatioX: 0.32,
    parallaxRatioY: 0.015,
    widthScale: 1.2,
    heightScale: 0.85,
    align: "bottom"
  },
  {
    id: "fog",
    type: "fog",
    depth: -90,
    parallaxRatioX: 0.52,
    parallaxRatioY: 0,
    widthScale: 1.4,
    heightScale: 0.9,
    align: "center",
    alpha: 0.55,
    blendMode: Phaser.BlendModes.SCREEN,
    animate: {
      scrollX: 0.016,
      alphaPulse: { min: 0.35, max: 0.72, duration: 5200 }
    }
  },
  {
    id: "nearForest",
    texture: ASSET_KEYS.IMAGE.PARALLAX_FOREST,
    depth: -85,
    parallaxRatioX: 0.68,
    parallaxRatioY: 0.02,
    widthScale: 1.25,
    heightScale: 0.95,
    align: "bottom"
  },
  {
    id: "foreground",
    texture: ASSET_KEYS.IMAGE.PARALLAX_FOREGROUND,
    depth: -80,
    parallaxRatioX: 0.92,
    parallaxRatioY: 0,
    widthScale: 1.3,
    heightScale: 1,
    align: "bottom",
    alpha: 0.9,
    animate: { sway: { amplitude: 6, duration: 2600 } }
  }
];

function destroyGameObject(go) {
  if (go && typeof go.destroy === "function") {
    go.destroy();
  }
}

function ensureGradientTexture(scene, width, height) {
  const textures = scene.textures;
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  let canvas;
  if (textures.exists(SKY_TEXTURE_KEY)) {
    canvas = textures.get(SKY_TEXTURE_KEY);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.resize(w, h);
    }
  } else {
    canvas = textures.createCanvas(SKY_TEXTURE_KEY, w, h);
  }
  const ctx = canvas?.getContext();
  if (!ctx) {
    return SKY_TEXTURE_KEY;
  }
  ctx.clearRect(0, 0, w, h);
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "#101726");
  gradient.addColorStop(0.45, "#1e2b41");
  gradient.addColorStop(1, "#0f1924");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  const arcCount = 4;
  for (let i = 0; i < arcCount; i += 1) {
    const radius = (w + h) * 0.06 + i * 18;
    ctx.beginPath();
    ctx.arc(w * 0.82, h * 0.18 + i * 24, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  canvas.refresh();
  return SKY_TEXTURE_KEY;
}

function ensureFogTexture(scene) {
  const textures = scene.textures;
  if (textures.exists(FOG_TEXTURE_KEY)) {
    return FOG_TEXTURE_KEY;
  }
  const size = 256;
  const canvas = textures.createCanvas(FOG_TEXTURE_KEY, size, size);
  const ctx = canvas?.getContext();
  if (!ctx) {
    return FOG_TEXTURE_KEY;
  }
  const gradient = ctx.createLinearGradient(0, 0, size, 0);
  gradient.addColorStop(0, "rgba(205, 224, 255, 0.03)");
  gradient.addColorStop(0.5, "rgba(180, 205, 240, 0.12)");
  gradient.addColorStop(1, "rgba(205, 224, 255, 0.03)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 2;
  for (let y = 12; y < size; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) {
      const offset = Math.sin((x / size) * Math.PI * 2 + y * 0.05) * 6;
      ctx.lineTo(x, y + offset);
    }
    ctx.stroke();
  }

  canvas.refresh();
  return FOG_TEXTURE_KEY;
}

function ensureWaterTexture(scene) {
  const textures = scene.textures;
  if (textures.exists(WATER_TEXTURE_KEY)) {
    return WATER_TEXTURE_KEY;
  }
  const width = 256;
  const height = 128;
  const canvas = textures.createCanvas(WATER_TEXTURE_KEY, width, height);
  const ctx = canvas?.getContext();
  if (!ctx) {
    return WATER_TEXTURE_KEY;
  }
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#0b1a2c");
  gradient.addColorStop(0.5, "#14314f");
  gradient.addColorStop(1, "#0a1a30");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1;
  for (let y = 16; y < height; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= width; x += 8) {
      const wave = Math.sin((x / width) * Math.PI * 2 + y * 0.08) * 3;
      ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }

  canvas.refresh();
  return WATER_TEXTURE_KEY;
}

function ensurePlaceholderTexture(scene, id) {
  const key = `${PLACEHOLDER_PREFIX}${id}`;
  const textures = scene.textures;
  if (textures.exists(key)) {
    return key;
  }
  const size = 64;
  const canvas = textures.createCanvas(key, size, size);
  const ctx = canvas?.getContext();
  if (!ctx) {
    return key;
  }
  ctx.fillStyle = "#2b3045";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, size - 8, size - 8);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(8, 8, size - 16, size - 16);
  ctx.setLineDash([]);
  canvas.refresh();
  return key;
}

function resolveLayerCount(config) {
  if (!config?.enableParallax) {
    return 1;
  }
  const target = Math.round(config.parallaxLayers ?? BASE_LAYER_DEFINITIONS.length);
  return Phaser.Math.Clamp(target, 1, BASE_LAYER_DEFINITIONS.length);
}

function wrapOffset(value) {
  if (value > 100000 || value < -100000) {
    return 0;
  }
  return value;
}

export default class BackgroundSystem {
  constructor(scene, gfxConfig = GFX) {
    this.scene = scene;
    this.gfx = gfxConfig;
    this.layers = [];
    this.effects = [];
    this.enabled = false;
    this.viewportWidth = scene.scale?.width ?? 1280;
    this.viewportHeight = scene.scale?.height ?? 720;
    this.resizeHandler = null;
    this.lastLayerCount = 0;
    this.lastEnvAnim = Boolean(this.gfx.enableEnvAnim);
    this.lastParallaxEnabled = Boolean(this.gfx.enableParallax);
    this.lastQuality = this.gfx.quality;
  }

  enable() {
    if (!this.scene || this.enabled) {
      return;
    }
    this.enabled = true;
    this.buildLayers();
    this.resize(this.viewportWidth, this.viewportHeight);
    const scaleManager = this.scene.scale;
    if (scaleManager?.on) {
      this.resizeHandler = (gameSize) => {
        this.resize(gameSize.width, gameSize.height);
      };
      scaleManager.on(Phaser.Scale.Events.RESIZE, this.resizeHandler, this);
    }
    this.lastLayerCount = resolveLayerCount(this.gfx);
    this.lastEnvAnim = Boolean(this.gfx.enableEnvAnim);
    this.lastParallaxEnabled = Boolean(this.gfx.enableParallax);
    this.lastQuality = this.gfx.quality;
  }

  disable() {
    if (!this.enabled) {
      return;
    }
    this.enabled = false;
    this.clearLayers();
    const scaleManager = this.scene?.scale;
    if (this.resizeHandler && scaleManager?.off) {
      scaleManager.off(Phaser.Scale.Events.RESIZE, this.resizeHandler, this);
      this.resizeHandler = null;
    }
  }

  destroy() {
    this.disable();
    this.scene = null;
  }

  refreshFromConfig() {
    if (!this.enabled) {
      this.enable();
      return;
    }
    const desiredLayers = resolveLayerCount(this.gfx);
    const envChanged = this.lastEnvAnim !== Boolean(this.gfx.enableEnvAnim);
    const parallaxChanged = this.lastParallaxEnabled !== Boolean(this.gfx.enableParallax);
    const qualityChanged = this.lastQuality !== this.gfx.quality;
    if (desiredLayers !== this.lastLayerCount || envChanged || parallaxChanged || qualityChanged) {
      this.clearLayers();
      this.buildLayers();
      this.resize(this.viewportWidth, this.viewportHeight);
      this.lastLayerCount = desiredLayers;
      this.lastEnvAnim = Boolean(this.gfx.enableEnvAnim);
      this.lastParallaxEnabled = Boolean(this.gfx.enableParallax);
      this.lastQuality = this.gfx.quality;
      return;
    }
    if (envChanged) {
      this.lastEnvAnim = Boolean(this.gfx.enableEnvAnim);
    }
    if (parallaxChanged) {
      this.lastParallaxEnabled = Boolean(this.gfx.enableParallax);
    }
    if (qualityChanged) {
      this.lastQuality = this.gfx.quality;
    }
  }

  buildLayers() {
    if (!this.scene) {
      return;
    }
    const targetCount = resolveLayerCount(this.gfx);
    const width = this.scene.scale?.width ?? this.viewportWidth;
    const height = this.scene.scale?.height ?? this.viewportHeight;
    for (let i = 0; i < targetCount; i += 1) {
      const definition = BASE_LAYER_DEFINITIONS[i];
      if (!definition) {
        break;
      }
      const layer = this.createLayer(definition, width, height);
      if (layer) {
        this.layers.push(layer);
      }
    }
    this.setupEffects(width, height);
  }

  createLayer(definition, width, height) {
    const layer = {
      def: definition,
      gameObject: null,
      animState: { offsetX: 0, offsetY: 0, alphaTime: 0, swayTime: 0 },
      ratioX: definition.parallaxRatioX ?? definition.parallax?.x ?? 0,
      ratioY: definition.parallaxRatioY ?? definition.parallax?.y ?? 0,
      baseX: 0,
      baseY: 0
    };
    if (definition.type === "gradient") {
      const textureKey = ensureGradientTexture(this.scene, width, height);
      const image = this.scene.add.image(0, 0, textureKey);
      image.setOrigin(0, 0);
      image.setScrollFactor(0);
      image.setDepth(definition.depth ?? -100);
      image.setAlpha(definition.alpha ?? 1);
      layer.gameObject = image;
    } else if (definition.type === "fog") {
      const textureKey = ensureFogTexture(this.scene);
      const sprite = this.scene.add.tileSprite(0, 0, width, height, textureKey);
      sprite.setOrigin(0, 0);
      sprite.setScrollFactor(0);
      sprite.setDepth(definition.depth ?? -90);
      sprite.setAlpha(definition.alpha ?? 0.6);
      if (definition.blendMode !== undefined) {
        sprite.setBlendMode(definition.blendMode);
      }
      layer.gameObject = sprite;
    } else {
      const textureKey = this.resolveTexture(definition.texture, definition.id);
      const sprite = this.scene.add.tileSprite(0, 0, width, height, textureKey);
      sprite.setOrigin(0, 0);
      sprite.setScrollFactor(0);
      sprite.setDepth(definition.depth ?? -80);
      if (definition.alpha !== undefined) {
        sprite.setAlpha(definition.alpha);
      }
      if (definition.tint !== undefined) {
        sprite.setTint(definition.tint);
      }
      layer.gameObject = sprite;
    }
    if (!layer.gameObject) {
      return null;
    }
    layer.gameObject.setName(`bg-layer-${definition.id}`);
    this.applyLayout(layer, width, height);
    return layer;
  }

  resolveTexture(textureKey, fallbackId) {
    if (textureKey && this.scene.textures.exists(textureKey)) {
      return textureKey;
    }
    return ensurePlaceholderTexture(this.scene, fallbackId);
  }

  applyLayout(layer, width, height) {
    const go = layer.gameObject;
    const def = layer.def;
    if (!go || !def) {
      return;
    }
    if (def.type === "gradient") {
      const textureKey = ensureGradientTexture(this.scene, width, height);
      go.setTexture(textureKey);
      go.setDisplaySize(width, height);
      go.x = 0;
      go.y = 0;
      layer.baseX = 0;
      layer.baseY = 0;
      return;
    }
    if (go instanceof Phaser.GameObjects.TileSprite) {
      const widthScale = def.widthScale ?? 1.2;
      const heightScale = def.heightScale ?? (def.align === "bottom" ? 0.7 : 1);
      const targetWidth = width * widthScale;
      const targetHeight = Math.max(32, height * heightScale);
      go.setSize(targetWidth, targetHeight);
      go.setTileScale(def.tileScaleX ?? 1, def.tileScaleY ?? 1);
      const alignX = def.alignX || "center";
      if (alignX === "left") {
        go.x = 0;
      } else if (alignX === "right") {
        go.x = width - targetWidth;
      } else {
        go.x = (width - targetWidth) * 0.5;
      }
      if (def.align === "bottom") {
        go.y = height - targetHeight;
      } else if (def.align === "center") {
        go.y = (height - targetHeight) * 0.5;
      } else {
        go.y = 0;
      }
      layer.baseX = go.x;
      layer.baseY = go.y;
    } else {
      go.setOrigin(0, 0);
      go.setDisplaySize(width, height);
      go.x = 0;
      go.y = 0;
      layer.baseX = 0;
      layer.baseY = 0;
    }
  }

  setupEffects(width, height) {
    this.effects.forEach((effect) => effect.destroy?.());
    this.effects.length = 0;
    const showWater = (this.gfx.parallaxLayers ?? 0) >= 6 && this.gfx.quality === QUALITY_LEVELS.HIGH;
    if (showWater) {
      const water = this.createWaterEffect(width, height);
      if (water) {
        this.effects.push(water);
      }
    }
  }

  createWaterEffect(width, height) {
    const textureKey = ensureWaterTexture(this.scene);
    const sprite = this.scene.add.tileSprite(0, 0, width * 1.3, Math.max(80, height * 0.28), textureKey);
    sprite.setOrigin(0.5, 1);
    sprite.setScrollFactor(0);
    sprite.setDepth(-87);
    sprite.setAlpha(0.85);
    sprite.setName("bg-effect-water");
    const state = {
      offsetX: 0,
      waveTime: 0,
      baseY: height - Math.max(48, height * 0.18)
    };
    sprite.x = width * 0.5;
    sprite.y = state.baseY;
    return {
      sprite,
      destroy() {
        destroyGameObject(sprite);
      },
      resize: (vw, vh) => {
        const targetWidth = vw * 1.3;
        const targetHeight = Math.max(80, vh * 0.28);
        sprite.setSize(targetWidth, targetHeight);
        sprite.x = vw * 0.5;
        state.baseY = vh - Math.max(48, vh * 0.18);
        sprite.y = state.baseY;
      },
      update: (time, delta, gfx, view) => {
        const scrollRatio = 0.54;
        sprite.tilePositionX = view.scrollX * scrollRatio + state.offsetX;
        if (gfx.enableEnvAnim) {
          state.offsetX = wrapOffset(state.offsetX + 0.05 * delta);
          state.waveTime += delta;
          sprite.y = state.baseY + Math.sin(state.waveTime * 0.004) * 4;
        } else {
          state.offsetX = 0;
          state.waveTime = 0;
          sprite.y = state.baseY;
        }
      }
    };
  }

  clearLayers() {
    this.layers.forEach((layer) => {
      if (layer?.gameObject) {
        destroyGameObject(layer.gameObject);
      }
    });
    this.layers.length = 0;
    this.effects.forEach((effect) => effect.destroy?.());
    this.effects.length = 0;
  }

  resize(width, height) {
    if (!this.scene) {
      return;
    }
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.layers.forEach((layer) => {
      this.applyLayout(layer, width, height);
    });
    this.effects.forEach((effect) => effect.resize?.(width, height));
  }

  update(time, delta) {
    if (!this.enabled || !this.scene) {
      return;
    }
    const camera = this.scene.cameras?.main;
    if (!camera) {
      return;
    }
    const scrollX = camera.scrollX;
    const scrollY = camera.scrollY;
    const parallaxEnabled = Boolean(this.gfx.enableParallax);
    this.layers.forEach((layer) => {
      const go = layer.gameObject;
      const def = layer.def;
      if (!go || !def) {
        return;
      }
      if (go instanceof Phaser.GameObjects.TileSprite) {
        const ratioX = parallaxEnabled ? layer.ratioX : 0;
        const ratioY = parallaxEnabled ? layer.ratioY : 0;
        go.tilePositionX = scrollX * ratioX + layer.animState.offsetX;
        go.tilePositionY = scrollY * ratioY + layer.animState.offsetY;
      } else {
        go.x = layer.baseX;
        go.y = layer.baseY;
      }

      if (!this.gfx.enableEnvAnim) {
        layer.animState.offsetX = 0;
        layer.animState.offsetY = 0;
        if (def.alpha !== undefined && go.alpha !== def.alpha) {
          go.setAlpha(def.alpha);
        }
        if (def.animate?.sway && go instanceof Phaser.GameObjects.TileSprite) {
          go.y = layer.baseY;
        }
        continue;
      }

      if (def.animate?.scrollX) {
        layer.animState.offsetX = wrapOffset(layer.animState.offsetX + def.animate.scrollX * delta);
      }
      if (def.animate?.scrollY) {
        layer.animState.offsetY = wrapOffset(layer.animState.offsetY + def.animate.scrollY * delta);
      }
      if (def.animate?.alphaPulse && typeof def.animate.alphaPulse.duration === "number") {
        layer.animState.alphaTime += delta;
        const pulse = def.animate.alphaPulse;
        const duration = Math.max(1, pulse.duration);
        const progress = (layer.animState.alphaTime % duration) / duration;
        const wave = (Math.sin(progress * Math.PI * 2 - Math.PI / 2) + 1) * 0.5;
        const min = pulse.min ?? def.alpha ?? 0.3;
        const max = pulse.max ?? def.alpha ?? 0.7;
        const value = Phaser.Math.Linear(min, max, Phaser.Math.Clamp(wave, 0, 1));
        go.setAlpha(value);
      }
      if (def.animate?.sway && go instanceof Phaser.GameObjects.TileSprite) {
        const sway = def.animate.sway;
        const duration = Math.max(1, sway.duration ?? 2000);
        layer.animState.swayTime = (layer.animState.swayTime + delta) % duration;
        const progress = layer.animState.swayTime / duration;
        const offset = Math.sin(progress * Math.PI * 2) * (sway.amplitude ?? 4);
        go.y = layer.baseY + offset;
      }
    });

    const view = { scrollX, scrollY, width: this.viewportWidth, height: this.viewportHeight };
    this.effects.forEach((effect) => effect.update?.(time, delta, this.gfx, view));
  }
}
