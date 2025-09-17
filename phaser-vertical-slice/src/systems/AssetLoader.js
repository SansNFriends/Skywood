import Phaser from "../phaser.js";

const ASSET_BASE_PATH = "public";

export const ASSET_KEYS = Object.freeze({
  ATLAS: {
    CORE: "atlas.core"
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
  }
];

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
  { key: ASSET_KEYS.IMAGE.TILESET_SKYWOOD, url: `${ASSET_BASE_PATH}/assets/tilemaps/skywood_tileset.png?v=12` }
];

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
