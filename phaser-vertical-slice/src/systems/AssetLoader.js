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

const RUNTIME_FALLBACKS = {
  [ASSET_KEYS.ATLAS.CORE]: {
    frameSize: 64,
    frames: [
      ...Array.from({ length: 8 }, (_, index) => ({
        name: `player/idle_0${index}`,
        color: 0x5c7cfa
      })),
      ...Array.from({ length: 8 }, (_, index) => ({
        name: `player/run_0${index}`,
        color: 0x4f9ef6
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        name: `player/jump_0${index}`,
        color: 0x8fd0ff
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        name: `player/fall_0${index}`,
        color: 0x7cb6ff
      })),
      { name: "projectile/basic", color: 0xffc857 },
      { name: "mob/idle_00", color: 0xd45d79 }
    ]
  },
  [ASSET_KEYS.ATLAS.WORLD]: {
    frameSize: 48,
    frames: [
      { name: "tiles/ground_00", color: 0x8c6239 },
      { name: "tiles/ground_edge", color: 0xb57f50 },
      { name: "tiles/platform", color: 0x5f8a5e },
      { name: "decor/shrub_00", color: 0x2d6a4f }
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
  static registerCore(loader) {
    const scene = loader?.scene || null;

    ATLASES.forEach((atlas) => {
      loader.atlas(atlas.key, atlas.textureURL, atlas.dataURL);
    });

    AUDIO_SPRITES.forEach((sprite) => {
      loader.audioSprite(sprite.key, sprite.jsonURL, sprite.audioURLs, {
        instances: 8
      });
    });

    TILEMAPS.forEach((entry) => {
      loader.tilemapTiledJSON(entry.key, entry.mapURL);
    });

    IMAGES.forEach((image) => {
      loader.image(image.key, image.url);
    });
    loader.once(Phaser.Loader.Events.COMPLETE, () => {
      ensureAtlases(scene);
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
