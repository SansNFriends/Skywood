import Phaser from "../phaser.js";
import { ASSET_KEYS } from "../systems/AssetLoader.js";

export default class Projectile extends Phaser.Physics.Matter.Sprite {
  constructor(scene, x, y) {
    super(scene.matter.world, x, y, ASSET_KEYS.ATLAS.CORE, "projectile_basic");
    this.scene = scene;
    this.setIgnoreGravity(true);
    this.setDepth(30);
    this.lifespan = 800;
    this.speed = 420;
    this.dir = 1;
    this.damage = 18;

    const body = Phaser.Physics.Matter.Matter.Bodies.circle(0, 0, 10, {
      isSensor: true
    });
    this.setExistingBody(body);

    scene.add.existing(this);
  }

  fire(x, y, dir) {
    this.setPosition(x, y);
    this.dir = dir >= 0 ? 1 : -1;
    this.lifespan = 800;
    this.damage = 18;
    this.setVelocity((this.speed * this.dir) / 60, 0);
    this.setActive(true);
    this.setVisible(true);
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    this.lifespan -= delta;
    if (this.lifespan <= 0) {
      this.setActive(false);
      this.setVisible(false);
      this.setVelocity(0, 0);
      this.emit("despawn", this);
    }
  }
}
