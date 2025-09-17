const LOCAL_URL = "../public/vendor/phaser.esm.js";
const CDN_URL = "https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.esm.js";

async function loadPhaser() {
  try {
    return await import(LOCAL_URL);
  } catch (localErr) {
    console.warn("[Skywood] Local Phaser load failed, trying CDN fallback.", localErr);
    return import(CDN_URL);
  }
}

const PhaserModule = await loadPhaser();
const PhaserExport = PhaserModule.default ?? PhaserModule;

if (!globalThis.Phaser) {
  globalThis.Phaser = PhaserExport;
}

export default PhaserExport;
export const PhaserNamespace = PhaserExport;
