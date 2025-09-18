import Phaser from "../phaser.js";
import { ensureItemIconTexture, getItemDefinition } from "../data/ItemCatalog.js";

const { Bodies } = Phaser.Physics.Matter.Matter;

const TERRAIN_CATEGORY = 0x0002;
const LOOT_CATEGORY = 0x0010;
const STEP_SCALE = 1 / 60;
const PLACEHOLDER_KEY = "ui.item.placeholder";

function ensurePlaceholderTexture(scene) {
  if (scene.textures.exists(PLACEHOLDER_KEY)) {
    return PLACEHOLDER_KEY;
  }
  const gfx = scene.make.graphics({ add: false });
  gfx.fillStyle(0x2f3646, 0.95);
  gfx.fillCircle(20, 20, 18);
  gfx.lineStyle(3, 0x93a4bf, 0.9);
  gfx.strokeCircle(20, 20, 18);
  gfx.generateTexture(PLACEHOLDER_KEY, 40, 40);
  gfx.destroy();
  return PLACEHOLDER_KEY;
}

export default class LootDrop extends Phaser.Physics.Matter.Sprite {
  constructor(scene, x, y) {
    const textureKey = ensurePlaceholderTexture(scene);
    super(scene.matter.world, x, y, textureKey);

    this.scene = scene;
    this.itemId = null;
    this.quantity = 0;
    this.definition = null;
    this.highlighted = false;
    this.pickupRadius = 72;
    this.baseScale = 0.52;

    const body = Bodies.circle(0, 0, 14, {
      friction: 0.7,
      frictionAir: 0.035,
      restitution: 0.16,
      label: "loot-drop"
    });
    this.setExistingBody(body);
    if (this.body) {
      this.body.collisionFilter.category = LOOT_CATEGORY;
      this.body.collisionFilter.mask = TERRAIN_CATEGORY;
      this.body.ignoreGravity = true;
    }

    this.setFixedRotation();
    this.setStatic(true);
    this.setIgnoreGravity(true);
    this.setDepth(18);
    this.setScale(this.baseScale);
    this.setAlpha(0.92);
    this.setVisible(false);
    this.setActive(false);

    scene.add.existing(this);
  }

  spawn(itemId, quantity, x, y) {
    const definition = getItemDefinition(itemId);
    if (definition) {
      ensureItemIconTexture(this.scene, definition);
      if (definition.iconKey && this.scene.textures.exists(definition.iconKey)) {
        this.setTexture(definition.iconKey);
      }
    }

    this.definition = definition || null;
    this.itemId = itemId || null;
    this.quantity = Math.max(1, Math.round(quantity || 1));
    this.setPosition(x, y);
    this.setVelocity(0, 0);
    this.setAngularVelocity(0);
    this.setAngle(0);
    this.setIgnoreGravity(false);
    this.setStatic(false);
    this.setVisible(true);
    this.setActive(true);
    this.setAlpha(0.92);
    this.setScale(this.baseScale);
    this.highlighted = false;

    const horizontal = Phaser.Math.FloatBetween(-220, 220);
    const vertical = Phaser.Math.FloatBetween(180, 260);
    this.setVelocity(horizontal * STEP_SCALE, -vertical * STEP_SCALE);
    this.setAngularVelocity(Phaser.Math.FloatBetween(-0.18, 0.18));
    this.setFriction(0.7);
    this.setFrictionAir(0.035);
    this.setBounce(0.18);
    return this;
  }

  setHighlight(active) {
    if (this.highlighted === active) {
      return;
    }
    this.highlighted = active;
    if (active) {
      this.setScale(this.baseScale * 1.12);
      this.setAlpha(1);
    } else {
      this.setScale(this.baseScale);
      this.setAlpha(0.92);
    }
  }

  resetState() {
    this.itemId = null;
    this.quantity = 0;
    this.definition = null;
    this.highlighted = false;
    this.setScale(this.baseScale);
    this.setAlpha(0.92);
    this.setVelocity(0, 0);
    this.setAngularVelocity(0);
    this.setAngle(0);
    this.setIgnoreGravity(true);
    this.setStatic(true);
    this.setActive(false);
    this.setVisible(false);
    this.setPosition(-1000, -1000);
  }
}
