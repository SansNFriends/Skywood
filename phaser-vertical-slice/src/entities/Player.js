import Phaser from "../phaser.js";
import { ASSET_KEYS } from "../systems/AssetLoader.js";
import { INPUT_KEYS } from "../systems/InputManager.js";
import CombatStats from "./CombatStats.js";

const { Body, Bodies } = Phaser.Physics.Matter.Matter;

const PLAYER_CATEGORY = 0x0008;
const TERRAIN_CATEGORY = 0x0002;

const PLAYER_CONFIG = {
  width: 42,
  height: 60,
  runSpeed: 220,
  airControl: 0.6,
  jumpSpeed: 560,
  coyoteTime: 100,
  jumpBuffer: 80,
  maxJumps: 2,
  dashSpeed: 450,
  dashDuration: 420,
  dashCooldown: 520,
  hitInvulnerability: 2000
};

const STEP_SCALE = 1 / 60;
const toStep = (value) => value * STEP_SCALE;
const fromStep = (value) => value / STEP_SCALE;
const RUN_ANIM_INTERVAL = 120;
const HITSTUN_MS = 220;

export default class Player extends Phaser.Physics.Matter.Sprite {
  constructor(scene, x, y, inputManager) {
    super(scene.matter.world, x, y, ASSET_KEYS.ATLAS.CORE, "player_idle");

    this.scene = scene;
    this.input = inputManager;
    this.facing = 1;
    this.jumpCount = 0;
    this.isOnGround = false;
    this.lastGroundedMs = -999;
    this.jumpBufferMs = 0;
    this.isDashing = false;
    this.dashTimer = 0;
    this.dashCooldownTimer = 0;
    this.allowDashReset = true;
    this.dashDirection = 0;
    this.groundContacts = new Set();
    this.runAnimElapsed = 0;
    this.runFrameToggle = false;
    this.stats = new CombatStats({ maxHP: 150, maxMP: 60 });
    this.hitstunTimer = 0;
    this.knockback = { x: 0, y: 0 };
    this.inputDisabled = false;
    this.invulnFlashTimer = 0;

    this.initBody(x, y);
    this.registerCollisions();

    scene.add.existing(this);
  }

  initBody(x, y) {
    const halfHeight = PLAYER_CONFIG.height * 0.5;
    const mainBody = Bodies.rectangle(0, 0, PLAYER_CONFIG.width, PLAYER_CONFIG.height, {
      chamfer: { radius: 10 }
    });
    const feetSensor = Bodies.rectangle(0, halfHeight, PLAYER_CONFIG.width * 0.6, 6, {
      isSensor: true,
      label: "player-feet"
    });

    const compoundBody = Body.create({
      parts: [mainBody, feetSensor],
      frictionStatic: 0,
      friction: 0,
      frictionAir: 0.02
    });

    this.sensors = { bottom: feetSensor };

    this.setExistingBody(compoundBody);
    if (this.body) {
      this.body.collisionFilter.category = PLAYER_CATEGORY;
      this.body.collisionFilter.mask = TERRAIN_CATEGORY;
    }
    this.setPosition(x, y);
    this.setFixedRotation();
    this.setFriction(0);
    this.setFrictionStatic(0);
    this.setFrictionAir(0.02);
    this.setIgnoreGravity(false);
    this.setDepth(20);
  }

  registerCollisions() {
    const world = this.scene.matter.world;
    world.on(Phaser.Physics.Matter.Events.COLLISION_START, this.handleCollisionStart, this);
    world.on(Phaser.Physics.Matter.Events.COLLISION_ACTIVE, this.handleCollisionActive, this);
    world.on(Phaser.Physics.Matter.Events.COLLISION_END, this.handleCollisionEnd, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      world.off(Phaser.Physics.Matter.Events.COLLISION_START, this.handleCollisionStart, this);
      world.off(Phaser.Physics.Matter.Events.COLLISION_ACTIVE, this.handleCollisionActive, this);
      world.off(Phaser.Physics.Matter.Events.COLLISION_END, this.handleCollisionEnd, this);
    });
  }

  handleCollisionStart(event) {
    for (const { bodyA, bodyB } of event.pairs) {
      if (bodyA === this.sensors.bottom) {
        this.addGroundContact(bodyB);
      } else if (bodyB === this.sensors.bottom) {
        this.addGroundContact(bodyA);
      }
    }
  }

  handleCollisionActive(event) {
    for (const { bodyA, bodyB } of event.pairs) {
      if (bodyA === this.sensors.bottom && !bodyB.isSensor) {
        this.isOnGround = true;
        this.lastGroundedMs = this.scene.time.now;
      } else if (bodyB === this.sensors.bottom && !bodyA.isSensor) {
        this.isOnGround = true;
        this.lastGroundedMs = this.scene.time.now;
      }
    }
  }

  handleCollisionEnd(event) {
    for (const { bodyA, bodyB } of event.pairs) {
      if (bodyA === this.sensors.bottom) {
        this.removeGroundContact(bodyB);
      } else if (bodyB === this.sensors.bottom) {
        this.removeGroundContact(bodyA);
      }
    }
  }

  addGroundContact(body) {
    if (!body || body.isSensor) {
      return;
    }
    this.groundContacts.add(body);
    this.isOnGround = true;
    this.jumpCount = 0;
    this.lastGroundedMs = this.scene.time.now;
    this.allowDashReset = true;
  }

  removeGroundContact(body) {
    if (!body || body.isSensor) {
      return;
    }
    this.groundContacts.delete(body);
    this.isOnGround = this.groundContacts.size > 0;
    if (!this.isOnGround) {
      this.lastGroundedMs = this.scene.time.now;
    }
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);

    if (!this.body) {
      return;
    }

    this.stats.update(delta);
    this.updateInvulnerabilityVisuals(delta);
    this.updateTimers(delta);
    this.applyMovement(delta);
    this.updateDash(delta);
    this.updateHitstun(delta);
    this.updateAnimations(delta);
  }

  updateTimers(delta) {
    if (this.jumpBufferMs > 0) {
      this.jumpBufferMs = Math.max(0, this.jumpBufferMs - delta);
    }
    if (this.hitstunTimer > 0) {
      this.hitstunTimer = Math.max(0, this.hitstunTimer - delta);
    }
  }

  handleInput() {
    if (!this.input || this.inputDisabled) {
      return;
    }

    if (this.input.wasJustPressed(INPUT_KEYS.JUMP)) {
      this.jumpBufferMs = PLAYER_CONFIG.jumpBuffer;
    }

    if (this.jumpBufferMs > 0 && this.canJump()) {
      this.performJump();
      this.jumpBufferMs = 0;
    }

    if (!this.input.isDown(INPUT_KEYS.JUMP) && this.body.velocity.y < 0) {
      this.setVelocityY(this.body.velocity.y * 0.92);
    }

    if (this.input.wasJustPressed(INPUT_KEYS.DASH)) {
      this.tryDash();
    }
  }

  canJump() {
    const now = this.scene.time.now;
    const groundedRecently = now - this.lastGroundedMs <= PLAYER_CONFIG.coyoteTime;
    const hasAirJump = this.jumpCount < PLAYER_CONFIG.maxJumps - 1;
    return this.isOnGround || groundedRecently || hasAirJump;
  }

  performJump() {
    if (this.isOnGround || this.scene.time.now - this.lastGroundedMs <= PLAYER_CONFIG.coyoteTime) {
      this.jumpCount = 1;
    } else {
      this.jumpCount += 1;
    }

    this.isOnGround = false;
    this.setAwake(true);
    this.setVelocityY(-toStep(PLAYER_CONFIG.jumpSpeed));
  }

  applyMovement(delta) {
    if (this.hitstunTimer > 0 || this.isDashing) {
      this.applyKnockback();
      return;
    }

    if (this.inputDisabled) {
      this.setVelocityX(0);
      return;
    }

    this.handleInput();

    let move = 0;
    if (this.input) {
      if (this.input.isDown(INPUT_KEYS.LEFT)) {
        move -= 1;
      }
      if (this.input.isDown(INPUT_KEYS.RIGHT)) {
        move += 1;
      }
    }

    if (move !== 0) {
      this.facing = move;
    }

    const desiredSpeed = move * PLAYER_CONFIG.runSpeed;
    const currentVelX = fromStep(this.body.velocity.x);
    const blend = this.isOnGround ? 0.25 : PLAYER_CONFIG.airControl * 0.1;
    const target = Phaser.Math.Linear(currentVelX, desiredSpeed, blend);
    this.setAwake(true);
    this.setVelocityX(toStep(target));
  }

  applyKnockback() {
    if (this.knockback.x === 0 && this.knockback.y === 0) {
      return;
    }
    this.setVelocity(toStep(this.knockback.x), toStep(this.knockback.y));
    this.knockback.x *= 0.92;
    this.knockback.y += 18; // gravity assist
    if (Math.abs(this.knockback.x) < 5) {
      this.knockback.x = 0;
    }
  }

  tryDash() {
    if (this.inputDisabled || this.isDashing || this.dashCooldownTimer > 0 || this.hitstunTimer > 0) {
      return;
    }

    if (!this.allowDashReset && !this.isOnGround) {
      return;
    }

    const left = this.input.isDown(INPUT_KEYS.LEFT) ? -1 : 0;
    const right = this.input.isDown(INPUT_KEYS.RIGHT) ? 1 : 0;
    const direction = left + right;
    const dashDir = direction !== 0 ? direction : this.facing;

    this.isDashing = true;
    this.dashDirection = dashDir;
    this.dashTimer = PLAYER_CONFIG.dashDuration;
    this.dashCooldownTimer = PLAYER_CONFIG.dashCooldown + PLAYER_CONFIG.dashDuration;
    this.setAwake(true);
    const currentVelY = this.body ? this.body.velocity.y : 0;
    this.setVelocity(toStep(PLAYER_CONFIG.dashSpeed * dashDir), currentVelY);
  }

  updateDash(delta) {
    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - delta);
    }

    if (!this.isDashing) {
      if (this.isOnGround) {
        this.allowDashReset = true;
      }
      return;
    }

    const dashVelocity = toStep(PLAYER_CONFIG.dashSpeed * this.dashDirection);
    this.setVelocityX(dashVelocity);
    if (this.isOnGround && this.body && this.body.velocity.y > 0) {
      this.setVelocityY(0);
    }

    this.dashTimer -= delta;
    if (this.dashTimer <= 0) {
      this.isDashing = false;
      this.dashDirection = 0;
      if (!this.isOnGround) {
        this.allowDashReset = false;
      }
    }
  }

  updateHitstun(delta) {
    if (this.hitstunTimer > 0) {
      return;
    }
    this.knockback.x = 0;
  }

  updateInvulnerabilityVisuals(delta) {
    if (this.stats.isInvulnerable()) {
      this.invulnFlashTimer += delta;
      const blinkPeriod = 80;
      const phase = Math.floor(this.invulnFlashTimer / blinkPeriod) % 2;
      this.setAlpha(phase === 0 ? 0.35 : 0.85);
    } else {
      if (this.alpha !== 1) {
        this.setAlpha(1);
      }
      this.invulnFlashTimer = 0;
    }
  }

  takeDamage(amount, sourceX) {
    if (!this.stats.takeDamage(amount, PLAYER_CONFIG.hitInvulnerability)) {
      return false;
    }
    this.hitstunTimer = HITSTUN_MS;
    const dir = this.x >= sourceX ? 1 : -1;
    this.knockback.x = dir * 260;
    this.knockback.y = -180;
    this.setIgnoreGravity(false);
    this.setAwake(true);
    this.invulnFlashTimer = 0;
    this.setAlpha(0.35);
    return true;
  }

  updateAnimations(delta) {
    this.setFlipX(this.facing < 0);

    if (this.isDashing) {
      this.setFrameSafe("player_run");
      this.runAnimElapsed = 0;
      return;
    }

    const velocity = this.body.velocity;

    if (!this.isOnGround) {
      this.setFrameSafe("player_run");
      this.runAnimElapsed = 0;
      return;
    }

    if (Math.abs(velocity.x) > toStep(40)) {
      this.runAnimElapsed += delta;
      if (this.runAnimElapsed >= RUN_ANIM_INTERVAL) {
        this.runAnimElapsed = 0;
        this.runFrameToggle = !this.runFrameToggle;
      }
      this.setFrameSafe(this.runFrameToggle ? "player_run" : "player_idle");
    } else {
      this.runAnimElapsed = 0;
      this.runFrameToggle = false;
      this.setFrameSafe("player_idle");
    }
  }

  setFrameSafe(frameKey) {
    if (!this.texture) {
      return;
    }

    if (typeof this.texture.has === "function" && !this.texture.has(frameKey)) {
      return;
    }

    super.setFrame(frameKey, false, false);
  }

  setInputEnabled(enabled) {
    this.inputDisabled = !enabled;
    if (!enabled) {
      this.jumpBufferMs = 0;
      this.setVelocityX(0);
    }
  }
}
