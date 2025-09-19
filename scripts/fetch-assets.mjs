#!/usr/bin/env node
// Purpose: Regenerate pixel-profile atlases from Kenney CC0 packs without committing binaries.
// Why: Codex forbids binary diffs, so we download CC0 ZIPs per profile and rebuild atlases locally while leaving runtime fallbacks intact.
// Assets: CC0 (Kenney.nl / OpenGameArt CC0)

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import zlib from "node:zlib";
import { PNG } from "pngjs";

const __filename = fileURLToPath(new URL(import.meta.url));
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const GAME_ROOT = path.join(PROJECT_ROOT, "phaser-vertical-slice");
const ASSET_ROOT = path.join(GAME_ROOT, "public", "assets");
const RAW_DIR = path.join(ASSET_ROOT, "raw");
const ATLAS_DIR = path.join(ASSET_ROOT, "atlas");
const FALLBACK_DIR = path.join(ASSET_ROOT, "fallback");
const TILEMAP_DIR = path.join(ASSET_ROOT, "tilemaps");

const DEFAULT_PROFILE = "pixel";
const PROFILE_ENV = process.env.ASSET_PROFILE;

const PROFILES = {
  pixel: [
    {
      name: "platformer-art-pixel-redux",
      url: "https://kenney.nl/media/pages/assets/platformer-art-pixel-redux/dce56322cf-1677696736/kenney_platformer-art-pixel-redux.zip",
      pick: ["Tiles*", "Background*"]
    },
    {
      name: "platformer-characters",
      url: "https://kenney.nl/media/pages/assets/platformer-characters/1a82b3514c-1677693768/kenney_platformer-characters.zip",
      pick: ["PNG*"]
    },
    {
      name: "particle-pack",
      url: "https://www.kenney.nl/media/pages/assets/particle-pack/1dd3d4cbe2-1677578741/kenney_particle-pack.zip",
      pick: ["PNG (Transparent)*"]
    },
    {
      name: "ui-pack-rpg-expansion",
      url: "https://kenney.nl/media/pages/assets/ui-pack-rpg-expansion/885ad5ccc0-1677661824/kenney_ui-pack-rpg-expansion.zip",
      pick: ["PNG/icon*"]
    }
  ],
  minimal: [
    {
      name: "platformer-art-pixel-redux",
      url: "https://kenney.nl/media/pages/assets/platformer-art-pixel-redux/dce56322cf-1677696736/kenney_platformer-art-pixel-redux.zip",
      pick: ["Tiles*"]
    },
    {
      name: "particle-pack",
      url: "https://www.kenney.nl/media/pages/assets/particle-pack/1dd3d4cbe2-1677578741/kenney_particle-pack.zip",
      pick: ["PNG (Transparent)*"]
    }
  ]
};

function log(message, ...args) {
  const ts = new Date().toISOString().replace(/T/, " ").replace(/\..+/, "");
  console.log(`[assets ${ts}] ${message}`, ...args);
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (err) {
    return false;
  }
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function escapeForRegExp(value) {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function patternToRegExp(pattern) {
  if (!pattern) {
    return /.*/i;
  }
  const escaped = escapeForRegExp(pattern).replace(/\\\*/g, ".*?");
  return new RegExp(`^${escaped}$`, "i");
}

function matchesPattern(relativePath, patterns) {
  if (!patterns || patterns.length === 0) {
    return true;
  }
  return patterns.some((pattern) => patternToRegExp(pattern).test(relativePath));
}

function resolveProfile(profileArg) {
  const requested = (profileArg || PROFILE_ENV || DEFAULT_PROFILE).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PROFILES, requested)) {
    const available = Object.keys(PROFILES).join(", ");
    throw new Error(`Unknown asset profile '${requested}'. Available: ${available}`);
  }
  return requested;
}

function prepareSources(profileName) {
  const sources = PROFILES[profileName] || [];
  return sources.map((entry) => ({
    ...entry,
    fileName: `${entry.name}.zip`
  }));
}

async function downloadSource(source, rebuild = false) {
  const target = path.join(RAW_DIR, source.fileName);
  if (!rebuild && (await fileExists(target))) {
    return { ok: true, path: target, downloaded: false };
  }

  try {
    log(`Downloading ${source.url}`);
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!/zip/i.test(contentType) && !source.url.toLowerCase().endsWith(".zip")) {
      throw new Error(`Unexpected content-type '${contentType || "<none>"}'`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(target, buffer);
    log(`Saved ${source.fileName} (${buffer.length} bytes)`);
    return { ok: true, path: target, downloaded: true };
  } catch (err) {
    log(`Failed to download ${source.url}: ${err.message}`);
    return { ok: false, path: target, error: err };
  }
}

async function extractWithUnzip(zipFile, outDir) {
  try {
    await ensureDir(outDir);
    await new Promise((resolve, reject) => {
      const proc = spawn("unzip", ["-qo", zipFile, "-d", outDir], { stdio: "ignore" });
      proc.on("error", reject);
      proc.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`unzip exited with code ${code}`));
        }
      });
    });
    return true;
  } catch (err) {
    log(`unzip unavailable for ${zipFile}: ${err.message}`);
    return false;
  }
}

async function extractSources(results, rebuild = false) {
  const extractRoot = path.join(RAW_DIR, "extracted");
  if (rebuild && (await fileExists(extractRoot))) {
    await fs.rm(extractRoot, { recursive: true, force: true });
  }
  await ensureDir(extractRoot);

  for (const result of results) {
    if (!result.ok) {
      continue;
    }
    const baseName = path.basename(result.path, ".zip");
    const subdir = path.join(extractRoot, baseName);
    if (!rebuild && (await fileExists(subdir))) {
      continue;
    }
    const success = await extractWithUnzip(result.path, subdir);
    if (success) {
      log(`Extracted ${path.basename(result.path)} -> ${subdir}`);
    }
  }
}

async function walkDir(dirPath, relativePrefix = "") {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "__MACOSX") {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    const relative = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const nested = await walkDir(fullPath, relative);
      files.push(...nested);
    } else {
      files.push({ fullPath, relative: toPosix(relative) });
    }
  }
  return files;
}

async function collectProfileFiles(profileSources) {
  const extractRoot = path.join(RAW_DIR, "extracted");
  const collected = [];
  for (const source of profileSources) {
    const sourceDir = path.join(extractRoot, source.name);
    if (!(await fileExists(sourceDir))) {
      log(`Source directory missing, skipping ${source.name}`);
      continue;
    }
    const entries = await walkDir(sourceDir);
    for (const entry of entries) {
      if (!entry.relative.toLowerCase().endsWith(".png")) {
        continue;
      }
      if (!matchesPattern(entry.relative, source.pick)) {
        continue;
      }
      collected.push({
        source: source.name,
        relativePath: entry.relative,
        fullPath: entry.fullPath
      });
    }
  }
  return collected;
}
function selectKenneyInputs(files) {
  const lower = (value) => value.toLowerCase();
  const findBySuffix = (suffix) => files.find((file) => lower(file.relativePath).endsWith(lower(suffix)));
  const filterByPrefix = (sourceName, prefix) =>
    files
      .filter((file) => file.source === sourceName && lower(file.relativePath).startsWith(lower(prefix)))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return {
    playerSheet: findBySuffix("PNG/Player/player_tilesheet.png"),
    zombieSheet: findBySuffix("PNG/Zombie/zombie_tilesheet.png"),
    particleFiles: files.filter((file) => file.source === "particle-pack" && lower(file.relativePath).includes("png (transparent)/")),
    tileFiles: filterByPrefix("platformer-art-pixel-redux", "Tiles/"),
    backgroundSheet: findBySuffix("Backgrounds/backgrounds.png"),
    iconFiles: files.filter((file) => file.source === "ui-pack-rpg-expansion" && lower(file.relativePath).startsWith("png/icon"))
  };
}

async function loadPng(filePath) {
  const buffer = await fs.readFile(filePath);
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: png.data };
}

function extractRegion(image, x, y, width, height) {
  const data = new Uint8Array(width * height * 4);
  const sourceWidth = image.width;
  for (let row = 0; row < height; row += 1) {
    const sourceIndex = ((y + row) * sourceWidth + x) * 4;
    const destIndex = row * width * 4;
    data.set(image.data.subarray(sourceIndex, sourceIndex + width * 4), destIndex);
  }
  return { width, height, data };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function resampleImage(image, targetWidth, targetHeight) {
  const output = new Uint8Array(targetWidth * targetHeight * 4);
  const scale = Math.min(targetWidth / image.width, targetHeight / image.height);
  const drawWidth = Math.max(1, Math.round(image.width * scale));
  const drawHeight = Math.max(1, Math.round(image.height * scale));
  const offsetX = Math.floor((targetWidth - drawWidth) / 2);
  const offsetY = Math.floor((targetHeight - drawHeight) / 2);
  for (let y = 0; y < drawHeight; y += 1) {
    const sourceY = clamp(Math.floor(y / scale), 0, image.height - 1);
    for (let x = 0; x < drawWidth; x += 1) {
      const sourceX = clamp(Math.floor(x / scale), 0, image.width - 1);
      const destIndex = ((offsetY + y) * targetWidth + (offsetX + x)) * 4;
      const sourceIndex = (sourceY * image.width + sourceX) * 4;
      output[destIndex] = image.data[sourceIndex];
      output[destIndex + 1] = image.data[sourceIndex + 1];
      output[destIndex + 2] = image.data[sourceIndex + 2];
      output[destIndex + 3] = image.data[sourceIndex + 3];
    }
  }
  return { width: targetWidth, height: targetHeight, data: output };
}

function blitImage(destData, destWidth, srcData, srcWidth, srcHeight, destX, destY) {
  for (let row = 0; row < srcHeight; row += 1) {
    const srcIndex = row * srcWidth * 4;
    const destIndex = ((destY + row) * destWidth + destX) * 4;
    destData.set(srcData.subarray(srcIndex, srcIndex + srcWidth * 4), destIndex);
  }
}

function toColorComponents(color, alpha = 1) {
  if (typeof color === "object" && color) {
    return {
      r: color.r ?? 0,
      g: color.g ?? 0,
      b: color.b ?? 0,
      a: clamp(color.a ?? Math.round(alpha * 255), 0, 255)
    };
  }
  const value = Number(color) >>> 0;
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  const a = clamp(Math.round(alpha * 255), 0, 255);
  return { r, g, b, a };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(colorA, colorB, t) {
  const compA = toColorComponents(colorA);
  const compB = toColorComponents(colorB);
  return {
    r: Math.round(lerp(compA.r, compB.r, t)),
    g: Math.round(lerp(compA.g, compB.g, t)),
    b: Math.round(lerp(compA.b, compB.b, t)),
    a: Math.round(lerp(compA.a, compB.a, t))
  };
}

function tintImage(image, tint) {
  const { r: tr, g: tg, b: tb } = toColorComponents(tint, 1);
  const data = new Uint8Array(image.width * image.height * 4);
  for (let index = 0; index < image.data.length; index += 4) {
    const r = image.data[index];
    const g = image.data[index + 1];
    const b = image.data[index + 2];
    const a = image.data[index + 3];
    const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    data[index] = clamp(Math.round(tr * brightness), 0, 255);
    data[index + 1] = clamp(Math.round(tg * brightness), 0, 255);
    data[index + 2] = clamp(Math.round(tb * brightness), 0, 255);
    data[index + 3] = a;
  }
  return { width: image.width, height: image.height, data };
}

function encodePNG(width, height, data) {
  const chunks = [];
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  chunks.push(signature);

  function crc32(buffer) {
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i += 1) {
      crc ^= buffer[i];
      for (let j = 0; j < 8; j += 1) {
        const mask = -(crc & 1);
        crc = (crc >>> 1) ^ (0xedb88320 & mask);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function createChunk(type, chunkData) {
    const chunk = Buffer.alloc(8 + chunkData.length + 4);
    chunk.writeUInt32BE(chunkData.length, 0);
    chunk.write(type, 4, 4, "ascii");
    chunkData.copy(chunk, 8);
    const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), chunkData]));
    chunk.writeUInt32BE(crc, chunk.length - 4);
    return chunk;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  chunks.push(createChunk("IHDR", ihdr));

  const rawBytesPerRow = width * 4;
  const filtered = Buffer.alloc((rawBytesPerRow + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const sourceIndex = y * rawBytesPerRow;
    const destIndex = y * (rawBytesPerRow + 1);
    filtered[destIndex] = 0;
    Buffer.from(data.subarray(sourceIndex, sourceIndex + rawBytesPerRow)).copy(filtered, destIndex + 1);
  }
  const compressed = zlib.deflateSync(filtered, { level: 9 });
  chunks.push(createChunk("IDAT", compressed));
  chunks.push(createChunk("IEND", Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

class CanvasView {
  constructor(data, atlasWidth, atlasHeight, originX, originY, width, height) {
    this.data = data;
    this.atlasWidth = atlasWidth;
    this.atlasHeight = atlasHeight;
    this.originX = originX;
    this.originY = originY;
    this.width = width;
    this.height = height;
  }

  setPixel(localX, localY, color, alpha = 1) {
    if (localX < 0 || localY < 0 || localX >= this.width || localY >= this.height) {
      return;
    }
    const globalX = this.originX + localX;
    const globalY = this.originY + localY;
    if (globalX < 0 || globalY < 0 || globalX >= this.atlasWidth || globalY >= this.atlasHeight) {
      return;
    }
    const { r, g, b, a } = toColorComponents(color, alpha);
    const index = (globalY * this.atlasWidth + globalX) * 4;
    this.data[index] = r;
    this.data[index + 1] = g;
    this.data[index + 2] = b;
    this.data[index + 3] = a;
  }

  fill(color, alpha = 1) {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        this.setPixel(x, y, color, alpha);
      }
    }
  }

  fillRect(x, y, width, height, color, alpha = 1) {
    const maxX = Math.min(this.width, x + width);
    const maxY = Math.min(this.height, y + height);
    for (let yy = Math.max(0, y); yy < maxY; yy += 1) {
      for (let xx = Math.max(0, x); xx < maxX; xx += 1) {
        this.setPixel(xx, yy, color, alpha);
      }
    }
  }

  strokeRect(x, y, width, height, color, thickness = 1, alpha = 1) {
    for (let i = 0; i < thickness; i += 1) {
      this.fillRect(x + i, y + i, width - i * 2, 1, color, alpha);
      this.fillRect(x + i, y + height - 1 - i, width - i * 2, 1, color, alpha);
      this.fillRect(x + i, y + 1 + i, 1, height - 2 - i * 2, color, alpha);
      this.fillRect(x + width - 1 - i, y + 1 + i, 1, height - 2 - i * 2, color, alpha);
    }
  }

  fillCircle(cx, cy, radius, color, alpha = 1) {
    const r2 = radius * radius;
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + radius));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          this.setPixel(x, y, color, alpha);
        }
      }
    }
  }

  strokeCircle(cx, cy, radius, color, thickness = 1, alpha = 1) {
    const outer2 = radius * radius;
    const innerRadius = Math.max(0, radius - thickness);
    const inner2 = innerRadius * innerRadius;
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + radius));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const dist2 = dx * dx + dy * dy;
        if (dist2 <= outer2 && dist2 >= inner2) {
          this.setPixel(x, y, color, alpha);
        }
      }
    }
  }

  drawVerticalGradient(x, y, width, height, topColor, bottomColor) {
    for (let yy = 0; yy < height; yy += 1) {
      const t = height <= 1 ? 0 : yy / (height - 1);
      const color = lerpColor(topColor, bottomColor, t);
      for (let xx = 0; xx < width; xx += 1) {
        this.setPixel(x + xx, y + yy, color);
      }
    }
  }
}

class AtlasBuilder {
  constructor(width, height, options = {}) {
    this.width = width;
    this.height = height;
    this.padding = options.padding ?? 2;
    this.data = new Uint8Array(width * height * 4);
    this.cursorX = this.padding;
    this.cursorY = this.padding;
    this.rowHeight = 0;
    this.frames = {};
  }

  allocate(frameWidth, frameHeight) {
    const paddedWidth = frameWidth + this.padding;
    if (this.cursorX + paddedWidth >= this.width) {
      this.cursorX = this.padding;
      this.cursorY += this.rowHeight + this.padding;
      this.rowHeight = 0;
    }
    if (this.cursorY + frameHeight + this.padding >= this.height) {
      throw new Error(`Atlas overflow: need ${frameWidth}x${frameHeight}`);
    }
    const originX = this.cursorX;
    const originY = this.cursorY;
    this.cursorX += frameWidth + this.padding;
    if (frameHeight > this.rowHeight) {
      this.rowHeight = frameHeight;
    }
    return { x: originX, y: originY };
  }

  addFrame(name, width, height, drawFn) {
    const { x, y } = this.allocate(width, height);
    const view = new CanvasView(this.data, this.width, this.height, x, y, width, height);
    drawFn(view);
    this.frames[name] = {
      frame: { x, y, w: width, h: height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: width, h: height },
      sourceSize: { w: width, h: height },
      pivot: { x: 0.5, y: 0.5 }
    };
  }

  addImageFrame(name, image) {
    const width = Math.max(1, Math.round(image.width));
    const height = Math.max(1, Math.round(image.height));
    const { x, y } = this.allocate(width, height);
    blitImage(this.data, this.width, image.data, width, height, x, y);
    this.frames[name] = {
      frame: { x, y, w: width, h: height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: width, h: height },
      sourceSize: { w: width, h: height },
      pivot: { x: 0.5, y: 0.5 }
    };
  }

  buildMeta(imageName) {
    return {
      app: "Skywood Atlas Builder",
      version: "1.0",
      image: imageName,
      format: "RGBA8888",
      size: { w: this.width, h: this.height },
      scale: "1"
    };
  }

  toAtlas(imageName) {
    const buffer = encodePNG(this.width, this.height, this.data);
    const json = {
      frames: this.frames,
      meta: this.buildMeta(imageName)
    };
    return { buffer, json };
  }
}

function padFrame(index) {
  return index.toString().padStart(2, "0");
}

function selectByRegex(files, regex, count) {
  const filtered = files.filter((file) => regex.test(file.relativePath)).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return filtered.slice(0, count);
}

async function buildKenneyCoreAtlas(selection) {
  if (!selection.playerSheet) {
    throw new Error("Missing platformer character sheet");
  }

  const playerSheet = await loadPng(selection.playerSheet.fullPath);
  const columns = 10;
  const rows = 5;
  const frameWidth = Math.floor(playerSheet.width / columns);
  const frameHeight = Math.floor(playerSheet.height / rows);

  const builder = new AtlasBuilder(1024, 1024, { padding: 4 });
  let totalFrames = 0;

  const sliceRow = (rowIndex, startColumn, count) => {
    const frames = [];
    for (let i = 0; i < count; i += 1) {
      const column = (startColumn + i) % columns;
      const x = column * frameWidth;
      const y = rowIndex * frameHeight;
      frames.push(extractRegion(playerSheet, x, y, frameWidth, frameHeight));
    }
    return frames;
  };

  sliceRow(0, 0, 8).forEach((frame, index) => {
    builder.addImageFrame(`player/idle_${padFrame(index)}`, resampleImage(frame, 64, 64));
    totalFrames += 1;
  });

  const runFrames = sliceRow(1, 0, 10);
  for (let i = 0; i < 12; i += 1) {
    const frame = runFrames[i % runFrames.length];
    builder.addImageFrame(`player/run_${padFrame(i)}`, resampleImage(frame, 64, 64));
    totalFrames += 1;
  }

  sliceRow(2, 0, 4).forEach((frame, index) => {
    builder.addImageFrame(`player/jump_${padFrame(index)}`, resampleImage(frame, 64, 64));
    totalFrames += 1;
  });
  sliceRow(2, 4, 4).forEach((frame, index) => {
    builder.addImageFrame(`player/fall_${padFrame(index)}`, resampleImage(frame, 64, 64));
    totalFrames += 1;
  });

  if (selection.zombieSheet) {
    const zombieSheet = await loadPng(selection.zombieSheet.fullPath);
    const zFrameWidth = Math.floor(zombieSheet.width / columns);
    const zFrameHeight = Math.floor(zombieSheet.height / rows);
    const mobFrame = extractRegion(zombieSheet, 0, 0, zFrameWidth, zFrameHeight);
    builder.addImageFrame("mob/idle_00", resampleImage(mobFrame, 64, 64));
  } else {
    const fallbackMob = extractRegion(playerSheet, 0, 0, frameWidth, frameHeight);
    builder.addImageFrame("mob/idle_00", resampleImage(fallbackMob, 64, 64));
  }
  totalFrames += 1;

  const dustFiles = selectByRegex(selection.particleFiles, /dirt_\d+\.png$/i, 6);
  const hitFiles = selectByRegex(selection.particleFiles, /spark_\d+\.png$/i, 8);
  const trailFiles = selectByRegex(selection.particleFiles, /trace_\d+\.png$/i, 6);
  const projectileFile = selectByRegex(selection.particleFiles, /magic_\d+\.png$/i, 1)[0] || dustFiles[0];

  const loadAndAdd = async (files, prefix) => {
    for (let i = 0; i < files.length; i += 1) {
      const image = await loadPng(files[i].fullPath);
      builder.addImageFrame(`${prefix}_${padFrame(i)}`, resampleImage(image, 48, 48));
      totalFrames += 1;
    }
  };

  await loadAndAdd(dustFiles, "fx/dust");
  await loadAndAdd(hitFiles, "fx/hit");
  await loadAndAdd(trailFiles, "fx/trail");

  if (projectileFile) {
    const image = await loadPng(projectileFile.fullPath);
    builder.addImageFrame("projectile/basic", resampleImage(image, 48, 48));
    totalFrames += 1;
  }

  const iconMap = [
    { frame: "ui/icons/skyroot_tonic", file: "iconCircle_blue.png", tint: 0x65ebb8 },
    { frame: "ui/icons/azure_focus", file: "iconCircle_blue.png", tint: 0x2c6cff },
    { frame: "ui/icons/ember_shard", file: "iconCircle_brown.png", tint: 0xff6f4e },
    { frame: "ui/icons/wingburst_scroll", file: "iconCross_beige.png", tint: 0xf4e1ba },
    { frame: "ui/icons/placeholder", file: "iconCircle_grey.png", tint: 0x9da3b5 }
  ];

  for (const iconSpec of iconMap) {
    const iconFile = selection.iconFiles.find((file) => file.relativePath.toLowerCase().endsWith(iconSpec.file.toLowerCase()));
    if (!iconFile) {
      continue;
    }
    const image = await loadPng(iconFile.fullPath);
    const tinted = tintImage(image, iconSpec.tint);
    builder.addImageFrame(iconSpec.frame, resampleImage(tinted, 48, 48));
    totalFrames += 1;
  }

  return { atlas: builder.toAtlas("core.png"), stats: { frames: totalFrames } };
}

async function buildKenneyWorldAtlas(selection) {
  if (!selection.tileFiles || selection.tileFiles.length === 0) {
    throw new Error("No tile PNG files found");
  }

  const tileSize = 48;
  const tileFrames = [];
  const tilesToUse = selection.tileFiles.slice(0, 64);
  for (const file of tilesToUse) {
    const image = await loadPng(file.fullPath);
    tileFrames.push(resampleImage(image, tileSize, tileSize));
  }

  let decorFrames = [];
  const extraDecor = selection.tileFiles.slice(64, 80);
  for (const file of extraDecor) {
    const image = await loadPng(file.fullPath);
    decorFrames.push(resampleImage(image, tileSize, tileSize));
  }

  if (decorFrames.length < 8 && selection.backgroundSheet) {
    const background = await loadPng(selection.backgroundSheet.fullPath);
    const sliceWidth = Math.floor(background.width / 4);
    const sliceHeight = Math.floor(background.height / 2);
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const region = extractRegion(background, col * sliceWidth, row * sliceHeight, sliceWidth, sliceHeight);
        decorFrames.push(resampleImage(region, tileSize, tileSize));
      }
    }
  }

  const allFrames = [...tileFrames, ...decorFrames];
  const totalCount = allFrames.length;
  const columns = Math.max(8, Math.ceil(Math.sqrt(totalCount)));
  const rows = Math.ceil(totalCount / columns);
  const width = columns * tileSize;
  const height = rows * tileSize;
  const data = new Uint8Array(width * height * 4);
  const frames = {};

  allFrames.forEach((frame, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * tileSize;
    const y = row * tileSize;
    blitImage(data, width, frame.data, tileSize, tileSize, x, y);
    const name = index < tileFrames.length
      ? `tiles/ground_${padFrame(index)}`
      : `decor/decor_${padFrame(index - tileFrames.length)}`;
    frames[name] = {
      frame: { x, y, w: tileSize, h: tileSize },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: tileSize, h: tileSize },
      sourceSize: { w: tileSize, h: tileSize },
      pivot: { x: 0.5, y: 0.5 }
    };
  });

  const buffer = encodePNG(width, height, data);
  const json = {
    frames,
    meta: {
      app: "Skywood Atlas Builder",
      version: "1.0",
      image: "world.png",
      format: "RGBA8888",
      size: { w: width, h: height },
      scale: "1"
    }
  };

  return {
    atlas: { buffer, json },
    stats: { frames: totalCount, columns, rows, tileSize }
  };
}

function drawPlayerFrame(view, variant) {
  const bodyColor = 0x3f5bd6;
  const accentColor = 0x9ac4ff;
  const trimColor = 0x1a234a;
  const bootColor = 0x2f1f45;
  const hairColor = 0xffcd73;
  const faceColor = 0xffe3c4;

  view.fill(0x000000, 0);
  view.drawVerticalGradient(16, 12, 32, 32, 0x3149b0, bodyColor);
  view.strokeRect(16, 12, 32, 32, trimColor, 2, 0.92);
  view.fillCircle(32, 16, 10, faceColor, 1);
  view.fillCircle(32, 12, 12, hairColor, 1);

  const sway = Math.sin((variant / 12) * Math.PI * 2) * 2;
  view.fillRect(18 + sway, 42, 12, 18, bootColor, 1);
  view.fillRect(34 + sway, 42, 12, 18, bootColor, 1);
  view.strokeRect(18 + sway, 42, 12, 18, trimColor, 1, 0.8);
  view.strokeRect(34 + sway, 42, 12, 18, trimColor, 1, 0.8);

  view.fillCircle(22 + sway, 26, 6, accentColor, 0.85);
  view.fillCircle(42 + sway, 26, 6, accentColor, 0.85);
  view.strokeCircle(22 + sway, 26, 6, trimColor, 1, 0.8);
  view.strokeCircle(42 + sway, 26, 6, trimColor, 1, 0.8);
}

function drawPlayerRunFrame(view, variant) {
  const phase = variant / 12;
  const legOffset = Math.sin(phase * Math.PI * 2) * 6;
  const armOffset = Math.cos(phase * Math.PI * 2) * 6;

  drawPlayerFrame(view, variant);
  view.fillRect(18 + legOffset, 42, 12, 18, 0x281a39, 1);
  view.fillRect(34 - legOffset, 42, 12, 18, 0x281a39, 1);
  view.strokeRect(18 + legOffset, 42, 12, 18, 0x151026, 1, 0.9);
  view.strokeRect(34 - legOffset, 42, 12, 18, 0x151026, 1, 0.9);
  view.fillRect(16 + armOffset, 24, 10, 6, 0xffe0c0, 1);
  view.fillRect(38 - armOffset, 24, 10, 6, 0xffe0c0, 1);
}

function drawPlayerJumpFrame(view) {
  drawPlayerFrame(view, 0);
  view.fillRect(22, 38, 10, 16, 0x22336f, 1);
  view.fillRect(34, 38, 10, 16, 0x22336f, 1);
  view.fillRect(20, 24, 8, 8, 0xffe3c4, 1);
  view.fillRect(36, 24, 8, 8, 0xffe3c4, 1);
}

function drawPlayerFallFrame(view) {
  drawPlayerFrame(view, 0);
  view.fillRect(20, 40, 12, 18, 0x1d2744, 1);
  view.fillRect(36, 40, 12, 18, 0x1d2744, 1);
  view.fillRect(24, 24, 6, 10, 0xffcfa0, 1);
  view.fillRect(34, 24, 6, 10, 0xffcfa0, 1);
}

function drawMobIdle(view, variant) {
  view.fill(0x000000, 0);
  const bodyColor = 0x62d67a;
  const outline = 0x215b2f;
  view.drawVerticalGradient(12, 14, 40, 36, 0x7af091, bodyColor);
  view.strokeRect(12, 14, 40, 36, outline, 2, 0.9);
  view.fillCircle(24, 24, 6, 0xffffff, 1);
  view.fillCircle(40, 24, 6, 0xffffff, 1);
  const blink = variant % 4 === 0;
  view.fillRect(22, 24, 4, blink ? 2 : 6, 0x212121, 1);
  view.fillRect(38, 24, 4, blink ? 2 : 6, 0x212121, 1);
  view.fillRect(22, 40, 20, 6, 0x215b2f, 1);
}

function drawProjectile(view) {
  view.fill(0x000000, 0);
  view.fillCircle(32, 32, 12, 0xffc33c, 1);
  view.strokeCircle(32, 32, 12, 0xc67a1f, 2, 0.9);
  view.fillCircle(32, 32, 6, 0xffffff, 0.9);
}

function drawDustFx(view, variant) {
  view.fill(0x000000, 0);
  const radius = 8 + variant;
  view.fillCircle(32, 32, radius, 0xffffff, 0.2 + variant * 0.06);
  view.strokeCircle(32, 32, radius, 0xffffff, 2, 0.5);
}

function drawHitFx(view, variant) {
  view.fill(0x000000, 0);
  const count = 6 + variant;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const length = 12 + variant * 4;
    const x = 32 + Math.cos(angle) * length;
    const y = 32 + Math.sin(angle) * length;
    view.fillRect(x, y, 3, 3, 0xff6f6f, 1);
  }
}

function drawTrailFx(view, variant) {
  view.fill(0x000000, 0);
  const height = 16 + variant * 4;
  view.fillRect(30, 16, 4, height, 0x9ac4ff, 0.6);
  view.fillRect(34, 12, 4, height, 0x65ebb8, 0.6);
}

function drawIconPotion(view, palette) {
  view.fill(0x000000, 0);
  view.drawVerticalGradient(12, 8, 24, 32, palette.glass, palette.glassShadow || palette.glass);
  view.strokeRect(12, 8, 24, 32, palette.outline, 2, 0.9);
  view.fillRect(16, 12, 16, 24, palette.liquid, 0.9);
  view.strokeRect(16, 12, 16, 24, palette.outline, 1, 0.8);
  view.fillRect(20, 4, 8, 6, palette.stopper, 1);
}

function drawIconCrystal(view, palette) {
  view.fill(0x000000, 0);
  view.fillRect(20, 8, 8, 32, palette.primary, 1);
  view.strokeRect(20, 8, 8, 32, palette.outline, 2, 0.9);
  view.fillRect(24, 16, 10, 20, palette.secondary, 0.8);
  view.fillRect(14, 16, 6, 20, palette.secondary, 0.6);
}

function drawIconShard(view, palette) {
  view.fill(0x000000, 0);
  view.fillRect(18, 10, 12, 28, palette.primary, 1);
  view.strokeRect(18, 10, 12, 28, palette.outline, 2, 0.9);
  view.fillRect(14, 20, 6, 12, palette.secondary, 0.8);
  view.fillRect(30, 20, 6, 12, palette.secondary, 0.8);
}

function drawIconScroll(view, palette) {
  view.fill(0x000000, 0);
  view.fillRect(10, 12, 28, 24, palette.parchment, 1);
  view.strokeRect(10, 12, 28, 24, palette.outline, 2, 0.9);
  view.fillRect(10, 12, 28, 6, palette.trim, 1);
  view.fillRect(10, 30, 28, 6, palette.trim, 1);
}

function drawWorldGrass(view, palette, seed) {
  view.fillRect(0, 0, view.width, view.height, palette.bottom, 1);
  const blades = 6 + (seed % 3);
  for (let i = 0; i < blades; i += 1) {
    const x = 4 + (i * 6 + seed * 3) % (view.width - 8);
    view.fillRect(x, 8, 4, 24, palette.grass, 1);
  }
  view.fillRect(0, view.height - 8, view.width, 8, palette.top, 1);
}

function drawWorldGround(view, palette, seed) {
  view.fillRect(0, 0, view.width, view.height, palette.bottom, 1);
  for (let y = 0; y < view.height; y += 4) {
    const t = y / view.height;
    const color = lerpColor(palette.highlight, palette.bottom, t);
    view.fillRect(0, y, view.width, 4, color, 1);
  }
  view.fillRect(0, 0, view.width, 8, palette.top, 1);
}

function drawWorldDecor(view, palette) {
  view.fill(0x000000, 0);
  view.fillCircle(12, 24, 8, palette.primary, 1);
  view.fillCircle(32, 18, 10, palette.primary, 0.9);
  view.fillCircle(24, 34, 12, palette.primary, 0.8);
  view.strokeRect(0, 0, view.width, view.height, palette.outline || 0x1a2235, 2, 0.7);
}

function buildPlaceholderCoreAtlas() {
  const builder = new AtlasBuilder(1024, 1024, { padding: 4 });
  for (let i = 0; i < 8; i += 1) {
    builder.addFrame(`player/idle_${padFrame(i)}`, 64, 64, (view) => drawPlayerFrame(view, i));
  }
  for (let i = 0; i < 12; i += 1) {
    builder.addFrame(`player/run_${padFrame(i)}`, 64, 64, (view) => drawPlayerRunFrame(view, i));
  }
  for (let i = 0; i < 4; i += 1) {
    builder.addFrame(`player/jump_${padFrame(i)}`, 64, 64, drawPlayerJumpFrame);
    builder.addFrame(`player/fall_${padFrame(i)}`, 64, 64, drawPlayerFallFrame);
  }
  builder.addFrame("mob/idle_00", 64, 64, (view) => drawMobIdle(view, 0));
  builder.addFrame("projectile/basic", 48, 48, drawProjectile);
  for (let i = 0; i < 6; i += 1) {
    builder.addFrame(`fx/dust_${padFrame(i)}`, 48, 48, (view) => drawDustFx(view, i));
    builder.addFrame(`fx/trail_${padFrame(i)}`, 48, 48, (view) => drawTrailFx(view, i));
  }
  for (let i = 0; i < 8; i += 1) {
    builder.addFrame(`fx/hit_${padFrame(i)}`, 48, 48, (view) => drawHitFx(view, i));
  }

  builder.addFrame("ui/icons/skyroot_tonic", 48, 48, (view) =>
    drawIconPotion(view, {
      glass: 0xd4fff2,
      glassShadow: 0x7ad1b2,
      liquid: 0x65ebb8,
      stopper: 0x2f7d61,
      outline: 0x14302a
    })
  );
  builder.addFrame("ui/icons/azure_focus", 48, 48, (view) =>
    drawIconCrystal(view, {
      primary: 0x84d0ff,
      secondary: 0x2c6cff,
      outline: 0x162745
    })
  );
  builder.addFrame("ui/icons/ember_shard", 48, 48, (view) =>
    drawIconShard(view, {
      primary: 0xffa45c,
      secondary: 0xff6f4e,
      outline: 0x3a0d08
    })
  );
  builder.addFrame("ui/icons/wingburst_scroll", 48, 48, (view) =>
    drawIconScroll(view, {
      parchment: 0xf4e1ba,
      trim: 0xc69c56,
      outline: 0x3a2a12
    })
  );
  builder.addFrame("ui/icons/placeholder", 48, 48, (view) => {
    view.fill(0x1b2235, 0.92);
    view.strokeRect(4, 4, 40, 40, 0x4d5a7d, 2, 0.85);
  });

  return builder.toAtlas("core.png");
}

function buildPlaceholderWorldAtlas(tileInfo) {
  const tileSize = Math.max(8, Math.round(tileInfo.width || 48));
  const tileCount = Math.max(32, Math.round(tileInfo.tilecount || 48));
  const columns = Math.max(8, Math.round(tileInfo.columns || Math.ceil(Math.sqrt(tileCount))));
  const rows = Math.ceil(tileCount / columns);
  const width = columns * tileSize;
  const height = rows * tileSize;
  const data = new Uint8Array(width * height * 4);
  const frames = {};

  const palettes = [
    { top: 0x7a583c, bottom: 0x3b2416, highlight: 0xb37a4d, grass: 0x6fe86f },
    { top: 0x4c486b, bottom: 0x241f36, highlight: 0x9b96d6, grass: 0x8ad0ff },
    { top: 0x4d6d3c, bottom: 0x1e3716, highlight: 0x81c46a, grass: 0x5bd65b }
  ];

  for (let index = 0; index < tileCount; index += 1) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const originX = col * tileSize;
    const originY = row * tileSize;
    const view = new CanvasView(data, width, height, originX, originY, tileSize, tileSize);
    const palette = palettes[index % palettes.length];
    if (index < tileCount * 0.5) {
      drawWorldGrass(view, palette, index);
    } else if (index < tileCount * 0.75) {
      drawWorldGround(view, palette, index);
    } else {
      drawWorldDecor(view, {
        primary: palette.highlight ?? 0xb37a4d,
        outline: 0x1a2235
      });
    }
    const frameName = index < tileCount * 0.75
      ? `tiles/ground_${padFrame(index)}`
      : `decor/decor_${padFrame(index - Math.floor(tileCount * 0.75))}`;
    frames[frameName] = {
      frame: { x: originX, y: originY, w: tileSize, h: tileSize },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: tileSize, h: tileSize },
      sourceSize: { w: tileSize, h: tileSize },
      pivot: { x: 0.5, y: 0.5 }
    };
  }

  const buffer = encodePNG(width, height, data);
  const json = {
    frames,
    meta: {
      app: "Skywood Atlas Builder",
      version: "1.0",
      image: "world.png",
      format: "RGBA8888",
      size: { w: width, h: height },
      scale: "1"
    }
  };

  return { buffer, json, tileSize, columns, rows };
}

async function writeAtlasOutputs(name, atlas, options = {}) {
  await ensureDir(ATLAS_DIR);
  await ensureDir(FALLBACK_DIR);
  const atlasPath = path.join(ATLAS_DIR, `${name}.png`);
  const jsonPath = path.join(ATLAS_DIR, `${name}.json`);
  await fs.writeFile(atlasPath, atlas.buffer);
  await fs.writeFile(jsonPath, JSON.stringify(atlas.json, null, 2));
  log(`Wrote atlas ${name} (${atlas.buffer.length} bytes)`);

  const fallbackAtlasPath = path.join(FALLBACK_DIR, `${name}.png`);
  const fallbackJsonPath = path.join(FALLBACK_DIR, `${name}.json`);
  await fs.writeFile(fallbackAtlasPath, atlas.buffer);
  await fs.writeFile(fallbackJsonPath, JSON.stringify(atlas.json));
  log(`Updated fallback atlas ${name}`);

  if (options.tileSheetPath) {
    await fs.writeFile(options.tileSheetPath, atlas.buffer);
    log(`Synced tile sheet -> ${options.tileSheetPath}`);
  }
}

async function detectTileInfo() {
  const mapPath = path.join(TILEMAP_DIR, "skywood_map.json");
  try {
    const raw = await fs.readFile(mapPath, "utf8");
    const parsed = JSON.parse(raw);
    const tileset = Array.isArray(parsed.tilesets) ? parsed.tilesets[0] : null;
    return {
      width: tileset?.tilewidth ?? parsed.tilewidth ?? 48,
      height: tileset?.tileheight ?? parsed.tileheight ?? 48,
      columns: tileset?.columns ?? 8,
      tilecount: tileset?.tilecount ?? 48
    };
  } catch (err) {
    log(`Tile metadata fallback: ${err.message}`);
    return { width: 48, height: 48, columns: 8, tilecount: 48 };
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      rebuild: { type: "boolean", default: false },
      profile: { type: "string" }
    }
  });

  const profileName = resolveProfile(values.profile);
  log(`Starting asset pipeline (profile=${profileName}, rebuild=${values.rebuild ? "true" : "false"})`);

  await ensureDir(RAW_DIR);
  await ensureDir(ATLAS_DIR);
  await ensureDir(FALLBACK_DIR);

  const sources = prepareSources(profileName);
  const downloadResults = [];
  for (const source of sources) {
    const result = await downloadSource(source, values.rebuild);
    downloadResults.push(result);
  }
  await extractSources(downloadResults, values.rebuild);

  const collectedFiles = await collectProfileFiles(sources);
  log(`Collected ${collectedFiles.length} PNG candidates from CC0 packs`);

  const tileInfo = await detectTileInfo();
  log(`Tile metadata -> ${tileInfo.width}x${tileInfo.height}, columns=${tileInfo.columns}, count=${tileInfo.tilecount}`);

  let coreAtlas;
  let worldAtlas;
  let summary = null;
  try {
    const selection = selectKenneyInputs(collectedFiles);
    const coreResult = await buildKenneyCoreAtlas(selection);
    const worldResult = await buildKenneyWorldAtlas(selection);
    coreAtlas = coreResult.atlas;
    worldAtlas = worldResult.atlas;
    summary = {
      coreFrames: coreResult.stats.frames,
      worldFrames: worldResult.stats.frames,
      columns: worldResult.stats.columns,
      rows: worldResult.stats.rows,
      tileSize: worldResult.stats.tileSize
    };
    log(`[kenney] frames -> core=${summary.coreFrames}, world=${summary.worldFrames} (grid ${summary.columns}x${summary.rows})`);
  } catch (err) {
    log(`Kenney atlas build failed, using procedural fallback: ${err.message}`);
    coreAtlas = buildPlaceholderCoreAtlas();
    worldAtlas = buildPlaceholderWorldAtlas(tileInfo);
  }

  await writeAtlasOutputs("core", coreAtlas);
  const tileSheetPath = path.join(TILEMAP_DIR, "skywood_tileset.png");
  await writeAtlasOutputs("world", worldAtlas, { tileSheetPath });

  const drawCalls = 2;
  if (summary) {
    log(`[summary] profile=${profileName} coreFrames=${summary.coreFrames} worldFrames=${summary.worldFrames} atlasSize=1024x1024 drawCalls≈${drawCalls}`);
  } else {
    log(`[summary] profile=${profileName} procedural fallback atlases drawCalls≈${drawCalls}`);
  }
}

main().catch((err) => {
  console.error("Asset pipeline failed", err);
  process.exitCode = 1;
});

