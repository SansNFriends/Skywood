#!/usr/bin/env node
// Assets: CC0 (Kenney.nl / OpenGameArt CC0)

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import zlib from "node:zlib";

const __filename = fileURLToPath(new URL(import.meta.url));
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const GAME_ROOT = path.join(PROJECT_ROOT, "phaser-vertical-slice");
const ASSET_ROOT = path.join(GAME_ROOT, "public", "assets");
const RAW_DIR = path.join(ASSET_ROOT, "raw");
const ATLAS_DIR = path.join(ASSET_ROOT, "atlas");
const FALLBACK_DIR = path.join(ASSET_ROOT, "fallback");
const TILEMAP_DIR = path.join(ASSET_ROOT, "tilemaps");

const SOURCES = [
  {
    url: "https://kenney.nl/assets/platformer-pack-redux",
    fileName: "kenney-platformer-pack-redux.zip"
  },
  {
    url: "https://kenney.nl/assets/abstract-platformer",
    fileName: "kenney-abstract-platformer.zip"
  },
  {
    url: "https://kenney.nl/assets/particle-pack",
    fileName: "kenney-particle-pack.zip"
  },
  {
    url: "https://kenney.nl/assets/rpg-ui",
    fileName: "kenney-rpg-ui.zip"
  }
];

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
    const subdir = path.join(extractRoot, path.basename(result.path, ".zip"));
    if (!rebuild && (await fileExists(subdir))) {
      continue;
    }
    const success = await extractWithUnzip(result.path, subdir);
    if (success) {
      log(`Extracted ${path.basename(result.path)} -> ${subdir}`);
    }
  }
}

function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c >>>= 1;
      }
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = createCRC32Table();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    const byte = buffer[i];
    const index = (crc ^ byte) & 0xff;
    crc = (CRC_TABLE[index] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const chunk = Buffer.alloc(8 + data.length + 4);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  const crcValue = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  chunk.writeUInt32BE(crcValue >>> 0, chunk.length - 4);
  return chunk;
}

function encodePNG(width, height, data) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowIndex = y * (stride + 1);
    raw[rowIndex] = 0; // filter type none
    const srcIndex = y * stride;
    for (let x = 0; x < stride; x += 1) {
      raw[rowIndex + 1 + x] = data[srcIndex + x];
    }
  }

  const idatData = zlib.deflateSync(raw, { level: 9 });
  const chunks = [
    header,
    createChunk("IHDR", ihdr),
    createChunk("IDAT", idatData),
    createChunk("IEND", Buffer.alloc(0))
  ];
  return Buffer.concat(chunks);
}

function toColorComponents(color, alpha = 1) {
  if (typeof color === "object" && color !== null) {
    const r = Math.max(0, Math.min(255, Math.round(color.r ?? 0)));
    const g = Math.max(0, Math.min(255, Math.round(color.g ?? 0)));
    const b = Math.max(0, Math.min(255, Math.round(color.b ?? 0)));
    const a = Math.max(0, Math.min(255, Math.round((color.a ?? alpha) * 255)));
    return { r, g, b, a };
  }
  const value = Number(color) >>> 0;
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255)));
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
    const rOuter2 = radius * radius;
    const rInner2 = (radius - thickness) * (radius - thickness);
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + radius));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const dist2 = dx * dx + dy * dy;
        if (dist2 <= rOuter2 && dist2 >= rInner2) {
          this.setPixel(x, y, color, alpha);
        }
      }
    }
  }

  fillTriangle(ax, ay, bx, by, cx, cy, color, alpha = 1) {
    const minX = Math.floor(Math.max(0, Math.min(ax, bx, cx)));
    const maxX = Math.ceil(Math.min(this.width - 1, Math.max(ax, bx, cx)));
    const minY = Math.floor(Math.max(0, Math.min(ay, by, cy)));
    const maxY = Math.ceil(Math.min(this.height - 1, Math.max(ay, by, cy)));

    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (area === 0) {
      return;
    }

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const w0 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
        const w1 = (cx - bx) * (y - by) - (cy - by) * (x - bx);
        const w2 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
        const hasNeg = w0 < 0 || w1 < 0 || w2 < 0;
        const hasPos = w0 > 0 || w1 > 0 || w2 > 0;
        if (!(hasNeg && hasPos)) {
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

  const sway = Math.sin((variant / 8) * Math.PI * 2) * 2;
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
  const phase = variant / 8;
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

function drawPlayerJumpFrame(view, variant) {
  drawPlayerFrame(view, variant);
  view.fillRect(22, 38, 10, 16, 0x22336f, 1);
  view.fillRect(34, 38, 10, 16, 0x22336f, 1);
  view.fillRect(20, 24, 8, 8, 0xffe3c4, 1);
  view.fillRect(36, 24, 8, 8, 0xffe3c4, 1);
}

function drawPlayerFallFrame(view, variant) {
  drawPlayerFrame(view, variant);
  view.fillRect(20, 40, 12, 18, 0x1d2744, 1);
  view.fillRect(36, 40, 12, 18, 0x1d2744, 1);
  view.fillRect(24, 24, 6, 10, 0xffcfa0, 1);
  view.fillRect(34, 24, 6, 10, 0xffcfa0, 1);
}

function drawPlayerAttackFrame(view, variant) {
  drawPlayerFrame(view, variant);
  view.fillRect(42, 20, 16, 8, 0xffcfa0, 1);
  view.fillRect(46, 18, 6, 20, 0xf4f4f4, 1);
  view.strokeRect(46, 18, 6, 20, 0x7a7a7a, 1, 0.9);
}

function drawPlayerHitFrame(view, variant) {
  drawPlayerFrame(view, variant);
  view.fillCircle(32, 32, 28, 0xff4d57, 0.25);
  view.strokeCircle(32, 32, 28, 0xff4d57, 2, 0.5);
}

function drawPlayerDieFrame(view, variant) {
  view.fill(0x000000, 0);
  const t = variant / 6;
  view.drawVerticalGradient(16, 32, 32, 12, 0xff6b6b, 0x331313);
  view.strokeRect(16, 32, 32, 12, 0x150606, 1, 0.8);
  view.fillCircle(32, 24, 18, 0x3f4d75, 0.7);
  view.strokeCircle(32, 24, 18, 0x151b2c, 2, 0.8);
  view.fillCircle(24, 22, 4, 0xffffff, 0.8 - t * 0.6);
  view.fillCircle(40, 22, 4, 0xffffff, 0.8 - t * 0.6);
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
  view.fillCircle(16, 16, radius, 0xfdf2cc, 0.75 - variant * 0.08);
  view.strokeCircle(16, 16, radius, 0xe2b45f, 1, 0.45);
}

function drawHitFx(view, variant) {
  view.fill(0x000000, 0);
  const radius = 10 + variant * 2;
  view.fillCircle(24, 24, radius, 0xff6f6f, 0.6 - variant * 0.05);
  view.strokeCircle(24, 24, radius, 0xfff3f3, 2, 0.8);
}

function drawIconPotion(view, colors) {
  view.fill(0x000000, 0);
  view.fillCircle(24, 26, 14, colors.glass ?? 0xe6fff7, 0.95);
  view.strokeCircle(24, 26, 14, colors.outline ?? 0x14302a, 1, 0.9);
  view.fillCircle(24, 28, 10, colors.liquid ?? 0x65ebb8, 0.92);
  view.fillRect(18, 10, 12, 12, colors.glass ?? 0xe6fff7, 1);
  view.strokeRect(18, 10, 12, 12, colors.outline ?? 0x14302a, 1, 0.8);
  view.fillRect(18, 6, 12, 4, colors.stopper ?? 0x2f7d61, 1);
}

function drawIconCrystal(view, colors) {
  view.fill(0x000000, 0);
  view.fillTriangle(24, 4, 8, 36, 40, 36, colors.primary ?? 0x82d6ff, 1);
  view.fillTriangle(8, 36, 24, 60, 40, 36, colors.secondary ?? 0x2c6cff, 1);
  view.strokeRect(8, 20, 32, 24, colors.outline ?? 0x162745, 1, 0.8);
}

function drawIconShard(view, colors) {
  view.fill(0x000000, 0);
  view.fillTriangle(12, 52, 22, 8, 44, 20, colors.primary ?? 0xffa45c, 1);
  view.fillTriangle(12, 52, 44, 20, 38, 56, colors.secondary ?? 0xff6f4e, 1);
  view.strokeRect(12, 18, 28, 34, colors.outline ?? 0x3a0d08, 1, 0.9);
}

function drawIconScroll(view, colors) {
  view.fill(0x000000, 0);
  view.fillRect(10, 12, 28, 24, colors.parchment ?? 0xf7e5bf, 1);
  view.strokeRect(10, 12, 28, 24, colors.outline ?? 0x3a2a12, 1, 0.9);
  view.fillRect(10, 22, 28, 6, colors.trim ?? 0xc69c56, 0.9);
  view.fillCircle(12, 12, 6, colors.outline ?? 0x3a2a12, 0.95);
  view.fillCircle(36, 36, 6, colors.outline ?? 0x3a2a12, 0.95);
  view.fillCircle(24, 24, 6, colors.glow ?? 0x8bd7ff, 0.8);
}

function drawWorldGround(view, palette, variation) {
  view.fill(0x000000, 0);
  const topColor = palette.top ?? 0x5f4127;
  const bottomColor = palette.bottom ?? 0x2f1e11;
  view.drawVerticalGradient(0, 0, view.width, view.height, topColor, bottomColor);
  if (variation % 2 === 0) {
    view.fillRect(0, view.height - 6, view.width, 2, palette.highlight ?? 0xb47f45, 0.7);
  }
}

function drawWorldGrass(view, palette, variation) {
  drawWorldGround(view, palette, variation);
  const grassColor = palette.grass ?? 0x5bd65b;
  for (let x = 0; x < view.width; x += 1) {
    const height = 3 + ((x + variation * 3) % 4);
    view.fillRect(x, height, 1, view.height - height, grassColor, 0.8);
  }
}

function drawWorldDecor(view, palette) {
  view.fill(0x000000, 0);
  view.fillCircle(view.width / 2, view.height / 2, view.width / 2.5, palette.primary ?? 0x6bd0ff, 0.85);
  view.strokeCircle(view.width / 2, view.height / 2, view.width / 2.5, palette.outline ?? 0x1a3a55, 2, 0.9);
}

function buildCoreAtlas() {
  const builder = new AtlasBuilder(1024, 1024, { padding: 4 });

  for (let i = 0; i < 8; i += 1) {
    builder.addFrame(`player/idle_0${i}`, 64, 64, (view) => drawPlayerFrame(view, i));
  }
  for (let i = 0; i < 8; i += 1) {
    builder.addFrame(`player/run_0${i}`, 64, 64, (view) => drawPlayerRunFrame(view, i));
  }
  for (let i = 0; i < 4; i += 1) {
    builder.addFrame(`player/jump_0${i}`, 64, 64, (view) => drawPlayerJumpFrame(view, i));
  }
  for (let i = 0; i < 4; i += 1) {
    builder.addFrame(`player/fall_0${i}`, 64, 64, (view) => drawPlayerFallFrame(view, i));
  }
  for (let i = 0; i < 4; i += 1) {
    builder.addFrame(`player/attack_0${i}`, 64, 64, (view) => drawPlayerAttackFrame(view, i));
  }
  for (let i = 0; i < 4; i += 1) {
    builder.addFrame(`player/hit_0${i}`, 64, 64, (view) => drawPlayerHitFrame(view, i));
  }
  for (let i = 0; i < 4; i += 1) {
    builder.addFrame(`player/die_0${i}`, 64, 64, (view) => drawPlayerDieFrame(view, i));
  }

  for (let i = 0; i < 6; i += 1) {
    builder.addFrame(`mob/idle_0${i}`, 64, 64, (view) => drawMobIdle(view, i));
  }

  builder.addFrame("projectile/basic", 48, 48, drawProjectile);

  for (let i = 0; i < 6; i += 1) {
    builder.addFrame(`fx/dust_0${i}`, 32, 32, (view) => drawDustFx(view, i));
  }
  for (let i = 0; i < 8; i += 1) {
    builder.addFrame(`fx/hit_0${i}`, 48, 48, (view) => drawHitFx(view, i));
  }

  builder.addFrame("ui/icons/skyroot_tonic", 48, 48, (view) =>
    drawIconPotion(view, {
      glass: 0xd4fff2,
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
      glow: 0x8bd7ff,
      outline: 0x3a2a12
    })
  );

  builder.addFrame("ui/icons/placeholder", 48, 48, (view) => {
    view.fill(0x1b2235, 0.92);
    view.strokeRect(4, 4, 40, 40, 0x4d5a7d, 2, 0.85);
  });

  return builder.toAtlas("core.png");
}

function buildWorldAtlas(tileInfo) {
  const tileSize = Math.max(8, Math.round(tileInfo.width || 48));
  const tileCount = Math.max(16, Math.round(tileInfo.tilecount || 32));
  const columns = Math.max(4, Math.round(tileInfo.columns || Math.ceil(Math.sqrt(tileCount))));
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
    const frameName = index < tileCount * 0.75 ? `tiles/ground_${index.toString().padStart(2, "0")}` : `decor/decor_${index.toString().padStart(2, "0")}`;
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
      width: tileset?.tilewidth ?? 48,
      height: tileset?.tileheight ?? 48,
      columns: tileset?.columns ?? 8,
      tilecount: tileset?.tilecount ?? 32
    };
  } catch (err) {
    log(`Tile metadata fallback: ${err.message}`);
    return { width: 48, height: 48, columns: 8, tilecount: 32 };
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      rebuild: { type: "boolean", default: false }
    }
  });

  await ensureDir(RAW_DIR);
  await ensureDir(ATLAS_DIR);
  await ensureDir(FALLBACK_DIR);

  const downloadResults = [];
  for (const source of SOURCES) {
    const result = await downloadSource(source, values.rebuild);
    downloadResults.push(result);
  }
  await extractSources(downloadResults, values.rebuild);

  const tileInfo = await detectTileInfo();
  log(`Detected tile size ${tileInfo.width}x${tileInfo.height} (${tileInfo.columns} cols, ${tileInfo.tilecount} tiles)`);

  const coreAtlas = buildCoreAtlas();
  const worldAtlas = buildWorldAtlas(tileInfo);

  await writeAtlasOutputs("core", coreAtlas);
  const tileSheetPath = path.join(TILEMAP_DIR, "skywood_tileset.png");
  await writeAtlasOutputs("world", worldAtlas, { tileSheetPath });

  log("Atlas pipeline completed (placeholder graphics ready)");
}

main().catch((err) => {
  console.error("Asset pipeline failed", err);
  process.exitCode = 1;
});
