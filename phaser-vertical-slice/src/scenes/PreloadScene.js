import Phaser from "../phaser.js";
import AssetLoader from "../systems/AssetLoader.js";

const BAR_WIDTH = 420;
const BAR_HEIGHT = 18;

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "PreloadScene" });

    this.progressBox = null;
    this.progressBar = null;
    this.statusText = null;
    this.percentText = null;

    this.updateProgress = this.updateProgress.bind(this);
    this.handleLoadComplete = this.handleLoadComplete.bind(this);
  }

  preload() {
    this.cameras.main.setBackgroundColor("#1b1b22");

    this.createUi();
    AssetLoader.attachDiagnostics(this);
    AssetLoader.registerCore(this.load);

    this.load.on(Phaser.Loader.Events.PROGRESS, this.updateProgress);
    this.load.once(Phaser.Loader.Events.COMPLETE, this.handleLoadComplete);
  }

  createUi() {
    const centerX = this.cameras.main.centerX;
    const centerY = this.cameras.main.centerY;

    const box = this.add.graphics();
    box.fillStyle(0x23232d, 0.9);
    box.fillRoundedRect(centerX - BAR_WIDTH / 2 - 8, centerY - BAR_HEIGHT / 2 - 8, BAR_WIDTH + 16, BAR_HEIGHT + 16, 8);
    box.lineStyle(2, 0x3d88ff, 1);
    box.strokeRoundedRect(centerX - BAR_WIDTH / 2 - 8, centerY - BAR_HEIGHT / 2 - 8, BAR_WIDTH + 16, BAR_HEIGHT + 16, 8);

    const bar = this.add.graphics();

    const status = this.add.text(centerX, centerY - 40, "Preparing assets...", {
      fontFamily: "Rubik, 'Segoe UI', sans-serif",
      fontSize: "20px",
      color: "#f5f5f5"
    }).setOrigin(0.5, 0.5);

    const percent = this.add.text(centerX, centerY + 28, "0%", {
      fontFamily: "Rubik, 'Segoe UI', sans-serif",
      fontSize: "18px",
      color: "#9bd1ff"
    }).setOrigin(0.5, 0.5);

    this.progressBox = box;
    this.progressBar = bar;
    this.statusText = status;
    this.percentText = percent;
  }

  updateProgress(value) {
    if (!this.progressBar) {
      return;
    }

    const centerX = this.cameras.main.centerX;
    const centerY = this.cameras.main.centerY;

    this.progressBar.clear();
    this.progressBar.fillStyle(0x6fd86f, 1);
    this.progressBar.fillRoundedRect(centerX - BAR_WIDTH / 2, centerY - BAR_HEIGHT / 2, BAR_WIDTH * value, BAR_HEIGHT, 6);

    if (this.percentText) {
      this.percentText.setText(`${Math.floor(value * 100)}%`);
    }
  }

  handleLoadComplete() {
    if (this.statusText) {
      this.statusText.setText("Finalizing...");
    }

    AssetLoader.ensureFonts()
      .catch((err) => {
        console.warn("[Skywood] Font loading skipped:", err);
      })
      .finally(() => {
        this.time.delayedCall(120, () => {
          this.scene.start("GameScene");
        });
      });
  }

  shutdown() {
    this.load.off(Phaser.Loader.Events.PROGRESS, this.updateProgress);
    this.load.off(Phaser.Loader.Events.COMPLETE, this.handleLoadComplete);
    this.progressBar?.destroy();
    this.progressBox?.destroy();
    this.statusText?.destroy();
    this.percentText?.destroy();
  }
}
