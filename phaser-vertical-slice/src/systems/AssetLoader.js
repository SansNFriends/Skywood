
// Purpose: Manage atlas/audio loading with runtime fallbacks when generated assets are absent.
// Why: The repository ignores binaries, so scenes rely on synthesized textures if fetch-assets has not run.

// Assets: CC0 (Kenney.nl / OpenGameArt CC0)
import Phaser from "../phaser.js";

function resolveAssetBasePath() {
  if (typeof window !== "undefined" && window.location) {
    try {
      const resolved = new URL("./public/", window.location.href);
      return resolved.pathname.replace(/\/+$/, "");
    } catch (err) {
      console.warn("[Skywood] Failed to resolve public asset path, falling back.", err);
    }
  }

  return "public";
}

const ASSET_BASE_PATH = resolveAssetBasePath();

export const ASSET_KEYS = Object.freeze({
  ATLAS: {
    CORE: "atlas.core",
    WORLD: "atlas.world"
  },
  AUDIO: {
    CORE_SFX: "audio.core-sfx"
  },
  MAP: {
    SKYWOOD: "map.skywood"
  },
  IMAGE: {
    PARALLAX_FAR: "bg.layer.far",
    PARALLAX_MID: "bg.layer.mid",
    PARALLAX_NEAR: "bg.layer.near",
    PARALLAX_FOREST: "bg.layer.forest",
    PARALLAX_FOREGROUND: "bg.layer.foreground",
    TILESET_SKYWOOD: "tileset.skywood"
  }
});

const ATLASES = [
  {
    key: ASSET_KEYS.ATLAS.CORE,
    textureURL: `${ASSET_BASE_PATH}/assets/atlas/core.png`,
    dataURL: `${ASSET_BASE_PATH}/assets/atlas/core.json`
  },
  {
    key: ASSET_KEYS.ATLAS.WORLD,
    textureURL: `${ASSET_BASE_PATH}/assets/atlas/world.png`,
    dataURL: `${ASSET_BASE_PATH}/assets/atlas/world.json`
  }
];


const padFrameIndex = (value) => value.toString().padStart(2, "0");

const RUNTIME_FALLBACKS = {
  [ASSET_KEYS.ATLAS.CORE]: {
    frameSize: 64,
    frames: [
      ...Array.from({ length: 8 }, (_, index) => ({

        name: `player/idle_${padFrameIndex(index)}`,
        color: 0x5c7cfa
      })),
      ...Array.from({ length: 12 }, (_, index) => ({
        name: `player/run_${padFrameIndex(index)}`,
        color: 0x4f9ef6
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        name: `player/jump_${padFrameIndex(index)}`,
        color: 0x8fd0ff
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        name: `player/fall_${padFrameIndex(index)}`,
        color: 0x7cb6ff
      })),
      { name: "mob/idle_00", color: 0xd45d79 },
      { name: "projectile/basic", color: 0xffc857 },
      ...Array.from({ length: 6 }, (_, index) => ({
        name: `fx/dust_${padFrameIndex(index)}`,
        color: 0xc9f2ff
      })),
      ...Array.from({ length: 8 }, (_, index) => ({
        name: `fx/hit_${padFrameIndex(index)}`,
        color: 0xff728d
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        name: `fx/trail_${padFrameIndex(index)}`,
        color: 0x9ac4ff
      })),
      { name: "ui/icons/skyroot_tonic", color: 0x65ebb8 },
      { name: "ui/icons/azure_focus", color: 0x2c6cff },
      { name: "ui/icons/ember_shard", color: 0xff6f4e },
      { name: "ui/icons/wingburst_scroll", color: 0xf4e1ba },
      { name: "ui/icons/placeholder", color: 0x4d5a7d }

    ]
  },
  [ASSET_KEYS.ATLAS.WORLD]: {
    frameSize: 48,
    frames: [

      ...Array.from({ length: 32 }, (_, index) => ({
        name: `tiles/ground_${padFrameIndex(index)}`,
        color: (0x8c6239 + index * 137) & 0xffffff
      })),
      ...Array.from({ length: 16 }, (_, index) => ({
        name: `decor/decor_${padFrameIndex(index)}`,
        color: (0x2d6a4f + index * 73) & 0xffffff
      }))

    ]
  }
};

const AUDIO_SPRITES = [
  {
    key: ASSET_KEYS.AUDIO.CORE_SFX,
    jsonURL: `${ASSET_BASE_PATH}/assets/audio/core_sfx.json`,
    audioURLs: [`${ASSET_BASE_PATH}/assets/audio/core_sfx.wav`]
  }
];

const TILEMAPS = [
  {
    key: ASSET_KEYS.MAP.SKYWOOD,
    mapURL: `${ASSET_BASE_PATH}/assets/tilemaps/skywood_map.json?v=12`
  }
];

const IMAGES = [
  { key: ASSET_KEYS.IMAGE.PARALLAX_FAR, url: `${ASSET_BASE_PATH}/assets/backgrounds/layer_far.png` },
  { key: ASSET_KEYS.IMAGE.PARALLAX_MID, url: `${ASSET_BASE_PATH}/assets/backgrounds/layer_mid.png` },
  { key: ASSET_KEYS.IMAGE.PARALLAX_NEAR, url: `${ASSET_BASE_PATH}/assets/backgrounds/layer_near.png` },
  { key: ASSET_KEYS.IMAGE.PARALLAX_FOREST, url: `${ASSET_BASE_PATH}/assets/backgrounds/layer_forest.png` },
  { key: ASSET_KEYS.IMAGE.PARALLAX_FOREGROUND, url: `${ASSET_BASE_PATH}/assets/backgrounds/layer_foreground.png` },
  { key: ASSET_KEYS.IMAGE.TILESET_SKYWOOD, url: `${ASSET_BASE_PATH}/assets/tilemaps/skywood_tileset.png?v=13` }
];

const DEFAULT_TILESET_META = Object.freeze({
  tileWidth: 48,
  tileHeight: 48,
  columns: 8,
  tileCount: 48
});

async function checkUrlExists(url) {
  if (!url || typeof fetch !== "function") {
    return false;
  }

  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (response.ok) {
      return true;
    }

    if (response.status === 405 || response.status === 501) {
      const fallbackResponse = await fetch(url, { method: "GET", cache: "no-store" });
      if (fallbackResponse.ok) {
        try {
          await fallbackResponse.body?.cancel?.();
        } catch (err) {
          // Ignore cancellation failure; body will be GC'd.
        }
        return true;
      }
    }
  } catch (err) {
    // Network or protocol failure; treat as missing asset.
  }

  return false;
}

function detectTileMetadataFromCache(scene) {
  const defaults = { ...DEFAULT_TILESET_META };
  if (!scene?.cache?.tilemap) {
    return defaults;
  }

  try {
    const cached = scene.cache.tilemap.get(ASSET_KEYS.MAP.SKYWOOD);
    const data = cached?.data ?? cached;
    if (!data) {
      return defaults;
    }
    const tileset = Array.isArray(data.tilesets) ? data.tilesets[0] : null;
    return {
      tileWidth: tileset?.tilewidth ?? data.tilewidth ?? defaults.tileWidth,
      tileHeight: tileset?.tileheight ?? data.tileheight ?? defaults.tileHeight,
      columns: tileset?.columns ?? defaults.columns,
      tileCount: tileset?.tilecount ?? defaults.tileCount
    };
  } catch (err) {
    return defaults;
  }
}

function ensureTilesetTexture(scene) {
  if (!scene) {
    return;
  }

  const textures = scene.textures;
  if (textures.exists(ASSET_KEYS.IMAGE.TILESET_SKYWOOD)) {
    return;
  }

  const meta = detectTileMetadataFromCache(scene);
  const tileWidth = Math.max(8, Math.round(meta.tileWidth));
  const tileHeight = Math.max(8, Math.round(meta.tileHeight));
  const columns = Math.max(1, Math.round(meta.columns));
  const tileCount = Math.max(columns, Math.round(meta.tileCount));
  const rows = Math.ceil(tileCount / columns);
  const width = columns * tileWidth;
  const height = rows * tileHeight;
  const canvas = textures.createCanvas(ASSET_KEYS.IMAGE.TILESET_SKYWOOD, width, height);
  const ctx = canvas?.getContext();
  if (!ctx) {
    return;
  }

  ctx.fillStyle = "#121a29";
  ctx.fillRect(0, 0, width, height);

  for (let index = 0; index < tileCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * tileWidth;
    const y = row * tileHeight;
    const hue = (index * 37) % 360;
    const lightness = 34 + (index % 3) * 6;
    const saturation = 48 + (index % 5) * 6;
    ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    ctx.fillRect(x + 2, y + 2, tileWidth - 4, tileHeight - 4);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1.5, y + 1.5, tileWidth - 3, tileHeight - 3);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 3.5, y + 3.5, tileWidth - 7, tileHeight - 7);
  }

  canvas.refresh();
}

function shouldLoad(map, key) {
  if (!map) {
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    return Boolean(map[key]);
  }
  return true;
}

function getAvailabilitySection(availability, sectionKey) {
  if (!availability || typeof availability !== "object") {
    return null;
  }
  const section = availability[sectionKey];
  return section && typeof section === "object" ? section : null;
}

async function detectAssetAvailability() {
  const availability = {
    atlases: {},
    audio: {},
    images: {}
  };

  const atlasChecks = ATLASES.map(async (atlas) => {
    const [textureExists, dataExists] = await Promise.all([
      checkUrlExists(atlas.textureURL),
      checkUrlExists(atlas.dataURL)
    ]);
    availability.atlases[atlas.key] = textureExists && dataExists;
  });

  const audioChecks = AUDIO_SPRITES.map(async (sprite) => {
    const [jsonExists, ...audioExists] = await Promise.all([
      checkUrlExists(sprite.jsonURL),
      ...sprite.audioURLs.map((url) => checkUrlExists(url))
    ]);
    availability.audio[sprite.key] = Boolean(jsonExists && audioExists.every(Boolean));
  });

  const imageChecks = IMAGES.map(async (image) => {
    const exists = await checkUrlExists(image.url);
    availability.images[image.key] = exists;
  });

  await Promise.allSettled([...atlasChecks, ...audioChecks, ...imageChecks]);

  return availability;
}

function toCssColor(color) {
  if (typeof color === "number") {
    const hex = color.toString(16).padStart(6, "0");
    return `#${hex}`;
  }
  if (typeof color === "string") {
    return color;
  }
  return "#44506b";
}

function createRuntimeFallback(scene, atlasConfig) {
  if (!scene || !atlasConfig) {
    return;
  }
  const textures = scene.textures;
  if (textures.exists(atlasConfig.key)) {
    return;
  }
  const fallback = RUNTIME_FALLBACKS[atlasConfig.key] || {
    frameSize: 64,
    frames: [{ name: "placeholder", color: 0x44506b }]
  };
  const frameSize = Math.max(8, Math.floor(fallback.frameSize || 64));
  const frames = Array.isArray(fallback.frames) && fallback.frames.length > 0
    ? fallback.frames
    : [{ name: "placeholder", color: 0x44506b }];
  const columns = Math.max(1, Math.ceil(Math.sqrt(frames.length)));
  const rows = Math.max(1, Math.ceil(frames.length / columns));
  const width = columns * frameSize;
  const height = rows * frameSize;
  const canvasKey = `${atlasConfig.key}.runtime`;
  let canvasTexture = textures.exists(canvasKey) ? textures.get(canvasKey) : null;
  if (!canvasTexture) {
    canvasTexture = textures.createCanvas(canvasKey, width, height);
  } else if (canvasTexture.width !== width || canvasTexture.height !== height) {
    textures.remove(canvasKey);
    canvasTexture = textures.createCanvas(canvasKey, width, height);
  }
  const ctx = canvasTexture?.getContext();
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#1d2233";
  ctx.fillRect(0, 0, width, height);

  frames.forEach((frame, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * frameSize;
    const y = row * frameSize;
    const pad = Math.max(2, Math.floor(frameSize * 0.08));
    ctx.fillStyle = toCssColor(frame.color);
    ctx.fillRect(x + pad, y + pad, frameSize - pad * 2, frameSize - pad * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = Math.max(1, frameSize * 0.05);
    ctx.strokeRect(x + pad, y + pad, frameSize - pad * 2, frameSize - pad * 2);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.font = `${Math.max(8, Math.floor(frameSize * 0.28))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = frame.name?.split("/").pop() || "?";
    ctx.fillText(label.slice(0, 3).toUpperCase(), x + frameSize / 2, y + frameSize / 2);
  });

  canvasTexture.refresh();

  const atlasData = {
    frames: {},
    meta: {
      app: "Skywood Runtime Fallback",
      version: "1.0",
      image: `${canvasKey}.png`,
      format: "RGBA8888",
      size: { w: width, h: height },
      scale: "1"
    }
  };

  frames.forEach((frame, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * frameSize;
    const y = row * frameSize;
    atlasData.frames[frame.name || `frame_${index}`] = {
      frame: { x, y, w: frameSize, h: frameSize },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frameSize, h: frameSize },
      sourceSize: { w: frameSize, h: frameSize },
      pivot: { x: 0.5, y: 0.5 }
    };
  });

  textures.addAtlas(atlasConfig.key, canvasTexture.getSourceImage(), atlasData);
}

function ensureAtlases(scene) {
  if (!scene) {
    return;
  }
  const textures = scene.textures;
  ATLASES.forEach((atlas) => {
    if (textures.exists(atlas.key)) {
      return;
    }
    createRuntimeFallback(scene, atlas);
  });
}

const WEB_FONTS = [
  {
    family: "Rubik",
    weights: ["400", "600"],
    source: "https://fonts.googleapis.com/css2?family=Rubik:wght@400;600&display=swap",
    testString: "Skywood Legends"
  }
];

const injectedStylesheets = new Set();

let availabilityCache = null;
let availabilityPromise = null;

function cloneAvailability(availability) {
  if (!availability) {
    return null;
  }
  return {
    atlases: { ...(availability.atlases || {}) },
    audio: { ...(availability.audio || {}) },
    images: { ...(availability.images || {}) }
  };
}

function injectStylesheet(url) {
  if (injectedStylesheets.has(url)) {
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
  injectedStylesheets.add(url);
}

export default class AssetLoader {

  static rememberAvailability(availability) {
    availabilityCache = cloneAvailability(availability);
  }

  static getAvailability() {
    return cloneAvailability(availabilityCache);
  }

  static async detectAvailability() {
    if (availabilityCache) {
      return cloneAvailability(availabilityCache);
    }
    if (!availabilityPromise) {
      availabilityPromise = detectAssetAvailability()
        .then((result) => {
          availabilityCache = cloneAvailability(result);
          return cloneAvailability(result);
        })
        .catch((error) => {
          availabilityPromise = null;
          throw error;
        });
    }
    return availabilityPromise;
  }

  static clearAvailability() {
    availabilityCache = null;
    availabilityPromise = null;
  }

  static registerCore(loader, availabilityOverride = null) {
    const scene = loader?.scene || null;
    const availability = availabilityOverride || availabilityCache;
    const atlasAvailability = getAvailabilitySection(availability, "atlases");
    const imageAvailability = getAvailabilitySection(availability, "images");
    const audioAvailability = getAvailabilitySection(availability, "audio");


    ATLASES.forEach((atlas) => {
      if (shouldLoad(atlasAvailability, atlas.key)) {
        loader.atlas(atlas.key, atlas.textureURL, atlas.dataURL);
      } else {
        createRuntimeFallback(scene, atlas);
      }
    });

    AUDIO_SPRITES.forEach((sprite) => {
      if (shouldLoad(audioAvailability, sprite.key)) {
        loader.audioSprite(sprite.key, sprite.jsonURL, sprite.audioURLs, {
          instances: 8
        });
      }
    });

    TILEMAPS.forEach((entry) => {
      loader.tilemapTiledJSON(entry.key, entry.mapURL);
    });

    IMAGES.forEach((image) => {
      if (shouldLoad(imageAvailability, image.key)) {
        loader.image(image.key, image.url);
      }
    });

    loader.once(Phaser.Loader.Events.COMPLETE, () => {
      ensureAtlases(scene);
      ensureTilesetTexture(scene);

    });
  }

  static attachDiagnostics(scene) {
    const failedFiles = [];
    const loader = scene.load;

    const onFileError = (file) => {
      const failing = file?.src || file?.url || file?.key || "unknown";
      failedFiles.push(failing);
    };

    loader.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onFileError);
    loader.once(Phaser.Loader.Events.COMPLETE, () => {
      loader.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onFileError);
      if (failedFiles.length > 0) {
        console.warn("[Skywood] Some assets failed to load:", failedFiles);
      }
    });
  }

  static async ensureFonts() {
    if (typeof document === "undefined") {
      return;
    }

    const loaders = WEB_FONTS.map((font) => {
      if (font.source) {
        injectStylesheet(font.source);
      }

      if (document.fonts && document.fonts.load) {
        const variants = font.weights?.length ? font.weights : ["400"];
        const promises = variants.map((weight) => {
          const descriptor = `${weight} 16px ${font.family}`;
          return document.fonts.load(descriptor, font.testString || "Skywood Legends");
        });
        return Promise.allSettled(promises);
      }

      return Promise.resolve();
    });

    await Promise.allSettled(loaders);
  }
}
