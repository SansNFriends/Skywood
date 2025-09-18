import Phaser from "../phaser.js";
import { ASSET_KEYS } from "../systems/AssetLoader.js";

export default class Projectile extends Phaser.Physics.Matter.Sprite {
  constructor(scene, x, y) {
    super(scene.matter.world, x, y, ASSET_KEYS.ATLAS.CORE, "projectile_basic");
    this.scene = scene;
    this.setDepth(30);
    this.lifespan = 800;
    this.speed = 420;
    this.dir = 1;
    this.damage = 18;
    this.constantVelocityX = 0;
    this._velocity = { x: 0, y: 0 };

    const body = Phaser.Physics.Matter.Matter.Bodies.circle(0, 0, 10, {
      isSensor: true
    });
    this.setExistingBody(body);
    this.setIgnoreGravity(true);

    scene.add.existing(this);
  }

  fire(x, y, dir) {
    this.setPosition(x, y);
    this.dir = dir >= 0 ? 1 : -1;
    this.lifespan = 800;
    this.damage = 18;
    this.constantVelocityX = (this.speed * this.dir) / 60;
    this._velocity.x = this.constantVelocityX;
    this._velocity.y = 0;
    this.setIgnoreGravity(true);
    Phaser.Physics.Matter.Matter.Body.setVelocity(this.body, this._velocity);
    this.setActive(true);
    this.setVisible(true);
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (this.active && this.body) {
      this._velocity.x = this.constantVelocityX;
      this._velocity.y = 0;
      Phaser.Physics.Matter.Matter.Body.setVelocity(this.body, this._velocity);
    }
    this.lifespan -= delta;
    if (this.lifespan <= 0) {
      this.setActive(false);
      this.setVisible(false);
      this.setVelocity(0, 0);
      this.emit("despawn", this);
    }
  }
}
