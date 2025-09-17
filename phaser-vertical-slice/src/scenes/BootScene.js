import Phaser from "../phaser.js";

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  create() {
    const scaleManager = this.scale;

    if (scaleManager && typeof scaleManager.lockOrientation === "function") {
      try {
        const result = scaleManager.lockOrientation("landscape");
        if (result && typeof result.catch === "function") {
          result.catch(() => {
            // Ignore orientation lock rejection (desktop browsers).
          });
        }
      } catch (err) {
        console.warn("[Skywood] Orientation lock not supported:", err);
      }
    }

    this.scene.start("PreloadScene");
  }
}
