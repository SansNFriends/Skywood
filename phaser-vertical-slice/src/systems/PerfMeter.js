import Phaser from "../phaser.js";

const UPDATE_INTERVAL_MS = 200;

export default class PerfMeter {
  constructor(scene) {
    this.scene = scene;
    this.elapsed = 0;
    this.text = scene.add.text(12, 12, "", {
      fontFamily: "Consolas, Courier New, monospace",
      fontSize: "14px",
      color: "#9effa9",
      align: "left"
    });
    this.text.setDepth(1000);
    this.text.setScrollFactor(0);
    this.text.setOrigin(0, 0);
    this.text.setShadow(1, 1, "#000000", 2, true, true);

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.handleUpdate, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  handleUpdate(_time, delta) {
    this.elapsed += delta;
    if (this.elapsed < UPDATE_INTERVAL_MS) {
      return;
    }

    const fps = this.scene.game.loop.actualFps;
    const frameMs = this.scene.game.loop.delta;
    const snapshot =
      typeof this.scene.getPerfSnapshot === "function" ? this.scene.getPerfSnapshot() : null;

    const lines = [`FPS ${fps.toFixed(1)}`, `MS ${frameMs.toFixed(2)}`];

    if (snapshot) {
      const objects = snapshot.objects ?? this.scene.children.list.length;
      const mobsVisible = snapshot.mobsVisible ?? snapshot.mobs ?? 0;
      const mobsActive = snapshot.mobsActive ?? mobsVisible;
      const projectiles = snapshot.projectiles ?? 0;
      lines.push(`OBJ ${objects}`);
      lines.push(`MOB ${mobsVisible}/${mobsActive}`);
      lines.push(`PRJ ${projectiles}`);
      const projectilePool = snapshot.pools?.projectile;
      if (projectilePool) {
        lines.push(
          `PP ${Math.max(0, projectilePool.live ?? 0)}/${Math.max(0, projectilePool.free ?? 0)}`
        );
      }
      const textPool = snapshot.pools?.damageText;
      if (textPool) {
        lines.push(
          `TP ${Math.max(0, textPool.live ?? 0)}/${Math.max(0, textPool.free ?? 0)}`
        );
      }
    } else {
      const objectCount = this.scene.children.list.length;
      lines.push(`OBJ ${objectCount}`);
    }

    this.text.setText(lines.join("\n"));

    this.elapsed = 0;
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.handleUpdate, this);
    this.text?.destroy();
    this.text = null;
    this.scene = null;
  }
}
