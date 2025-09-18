import Phaser from "../phaser.js";
import { ASSET_KEYS } from "../systems/AssetLoader.js";
import CombatStats from "./CombatStats.js";

const { Bodies } = Phaser.Physics.Matter.Matter;
const TO_STEP = 1 / 60;
const toStep = (value) => value * TO_STEP;
const MOB_CATEGORY = 0x0004;
const TERRAIN_CATEGORY = 0x0002;

const MOB_CONFIG = {
  width: 36,
  height: 52,
  patrolSpeed: 90,
  chaseSpeed: 140,
  patrolRange: 160,
  aggroRange: 220,
  attackRange: 40,
  attackLockMs: 220,
  damage: 12,
  maxHP: 60
};

export default class Mob extends Phaser.Physics.Matter.Sprite {
  constructor(scene, x, y) {
    super(scene.matter.world, x, y, ASSET_KEYS.ATLAS.CORE, "mob_idle");

    this.scene = scene;
    this.originX = x;
    this.facing = 1;
    this.state = "idle";
    this.stateTimer = 0;
    this.target = null;
    this.pendingHit = false;
    this.stats = new CombatStats({ maxHP: MOB_CONFIG.maxHP, maxMP: 0 });
    this.hitstunTimer = 0;
    this.knockback = { x: 0, y: 0 };
    this.isCulled = false;

    const body = Bodies.rectangle(0, 0, MOB_CONFIG.width, MOB_CONFIG.height, {
      chamfer: { radius: 6 }
    });
    this.setExistingBody(body);
    if (this.body) {
      this.body.collisionFilter.category = MOB_CATEGORY;
      this.body.collisionFilter.mask = TERRAIN_CATEGORY;
    }
    this.setFixedRotation();
    this.setFriction(0);
    this.setFrictionStatic(0);
    this.setFrictionAir(0.025);
    this.setIgnoreGravity(false);
    this.setDepth(25);

    this.patrolMin = x - MOB_CONFIG.patrolRange * 0.5;
    this.patrolMax = x + MOB_CONFIG.patrolRange * 0.5;

    scene.add.existing(this);
  }

  setTarget(target) {
    this.target = target;
  }

  setPatrolBounds(minX, maxX) {
    this.patrolMin = minX;
    this.patrolMax = maxX;
  }

  revive(x, y) {
    this.setPosition(x, y);
    this.state = "patrol";
    this.stateTimer = 0;
    this.pendingHit = false;
    this.hitstunTimer = 0;
    this.knockback.x = 0;
    this.knockback.y = 0;
    this.stats.reset();
    this.setAwake(true);
    this.setActive(true);
    this.setVisible(true);
    this.isCulled = false;
  }

  sleepOffscreen() {
    this.setPosition(-9999, -9999);
    this.setVelocity(0, 0);
    this.setActive(false);
    this.setVisible(false);
    this.isCulled = false;
  }

  update(time, delta) {
    if (!this.active || !this.body) {
      return;
    }

    this.stats.update(delta);

    switch (this.state) {
      case "patrol":
        this.handlePatrol(delta);
        if (this.canSeeTarget()) {
          this.state = "chase";
        }
        break;
      case "chase":
        if (!this.canSeeTarget()) {
          this.state = "patrol";
          break;
        }
        this.handleChase();
        if (this.distanceToTarget() <= MOB_CONFIG.attackRange) {
          this.state = "attack";
          this.stateTimer = MOB_CONFIG.attackLockMs;
          this.pendingHit = true;
          this.setVelocity(0, this.body.velocity.y);
        }
        break;
      case "attack":
        this.stateTimer -= delta;
        if (this.stateTimer <= 0) {
          this.state = this.canSeeTarget() ? "chase" : "patrol";
          this.pendingHit = false;
        }
        break;
      case "hit":
        this.hitstunTimer -= delta;
        if (this.hitstunTimer <= 0) {
          this.state = this.canSeeTarget() ? "chase" : "patrol";
        }
        this.applyKnockback();
        break;
      default:
        this.state = "patrol";
    }

    this.setFlipX(this.facing < 0);
  }

  handlePatrol(delta) {
    const desired = this.facing * MOB_CONFIG.patrolSpeed;
    const nextX = this.x + desired * TO_STEP * delta * 0.06;
    if (nextX <= this.patrolMin) {
      this.facing = 1;
    } else if (nextX >= this.patrolMax) {
      this.facing = -1;
    }
    this.setAwake(true);
    this.setVelocityX(this.facing * MOB_CONFIG.patrolSpeed * TO_STEP);
  }

  handleChase() {
    if (!this.target) {
      return;
    }
    this.facing = this.target.x >= this.x ? 1 : -1;
    this.setAwake(true);
    this.setVelocityX(this.facing * MOB_CONFIG.chaseSpeed * TO_STEP);
  }

  applyKnockback() {
    if (this.knockback.x === 0 && this.knockback.y === 0) {
      return;
    }
    this.setVelocity(toStep(this.knockback.x), toStep(this.knockback.y));
    this.knockback.x *= 0.9;
    this.knockback.y += 16;
    if (Math.abs(this.knockback.x) < 4) {
      this.knockback.x = 0;
    }
  }

  distanceToTarget() {
    if (!this.target) {
      return Number.MAX_VALUE;
    }
    return Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
  }

  canSeeTarget() {
    if (!this.target || !this.target.body) {
      return false;
    }
    const dist = this.distanceToTarget();
    if (dist > MOB_CONFIG.aggroRange) {
      return false;
    }
    return Math.abs(this.target.y - this.y) < 80;
  }

  takeDamage(amount, sourceX) {
    if (!this.stats.takeDamage(amount)) {
      return false;
    }
    if (this.stats.isDead()) {
      this.die();
      return true;
    }
    this.state = "hit";
    this.hitstunTimer = 160;
    const dir = this.x >= sourceX ? 1 : -1;
    this.knockback.x = dir * 180;
    this.knockback.y = -120;
    this.setAwake(true);
    this.pendingHit = false;
    this.scene.spawnDamageNumber(this.x, this.y - 28, amount, "#ff857e");
    this.scene.audio?.play(ASSET_KEYS.AUDIO.CORE_SFX, "hit");
    return true;
  }

  die() {
    this.pendingHit = false;
    this.scene.spawnDamageNumber(this.x, this.y - 28, "KO", "#ffd166");
    this.scene.spawnLoot(this.x, this.y - 32);
    this.emit("dead", this);
    this.sleepOffscreen();
  }
}

