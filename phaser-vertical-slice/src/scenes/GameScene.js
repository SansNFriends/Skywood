import Phaser from "../phaser.js";
import PerfMeter from "../systems/PerfMeter.js";
import AssetLoader, { ASSET_KEYS } from "../systems/AssetLoader.js";
import InputManager, { INPUT_KEYS } from "../systems/InputManager.js";
import Player from "../entities/Player.js";
import Pool from "../systems/Pool.js";
import AudioManager from "../systems/AudioManager.js";
import Projectile from "../entities/Projectile.js";
import Spawner from "../systems/Spawner.js";

const CAMERA_DEADZONE_X = 0.4;
const CAMERA_DEADZONE_Y = 0.3;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
    this.perfMeter = null;
    this.map = null;
    this.layers = {};
    this.parallaxLayers = [];
    this.parallaxConfig = [];
    this.inputManager = null;
    this.player = null;
    this.debugHud = null;
    this.audio = null;
    this.projectilePool = null;
    this.projectiles = new Set();
    this.mobSpawner = null;
  }

  create() {
    this.cameras.main.setBackgroundColor("#2a2f3a");

    this.inputManager = new InputManager(this);
    this.audio = new AudioManager(this);

    this.createParallax();
    this.createTilemap();

    const spawn = this.getPlayerSpawn();
    this.player = new Player(this, spawn.x, spawn.y, this.inputManager);

    this.projectilePool = new Pool(
      () => {
        const projectile = new Projectile(this, -1000, -1000);
        projectile.on("despawn", (instance) => {
          this.projectiles.delete(instance);
          this.projectilePool.release(instance);
        });
        projectile.setActive(false).setVisible(false);
        return projectile;
      },
      (projectile) => {
        projectile.setActive(false);
        projectile.setVisible(false);
        projectile.setVelocity(0, 0);
      }
    );

    this.mobSpawner = new Spawner(this, {
      spawnX: spawn.x + 180,
      spawnY: spawn.y - 20,
      maxCount: 3
    });

    this.setupCamera();
    this.createHud();

    this.perfMeter = new PerfMeter(this);
  }

  createParallax() {
    const { width, height } = this.scale;
    const layerDefinitions = [
      { key: ASSET_KEYS.IMAGE.PARALLAX_FAR, ratio: 0.15, depth: -5 },
      { key: ASSET_KEYS.IMAGE.PARALLAX_MID, ratio: 0.25, depth: -4 },
      { key: ASSET_KEYS.IMAGE.PARALLAX_NEAR, ratio: 0.35, depth: -3 },
      { key: ASSET_KEYS.IMAGE.PARALLAX_FOREST, ratio: 0.45, depth: -2 },
      { key: ASSET_KEYS.IMAGE.PARALLAX_FOREGROUND, ratio: 0.6, depth: -1 }
    ];

    this.parallaxConfig = layerDefinitions;
    this.parallaxLayers = layerDefinitions.map((layer) =>
      this.add
        .tileSprite(0, 0, width, height, layer.key)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(layer.depth)
    );
  }

  createTilemap() {
    this.map = this.make.tilemap({ key: ASSET_KEYS.MAP.SKYWOOD });
    const tileset = this.map.addTilesetImage("skywood_tileset", ASSET_KEYS.IMAGE.TILESET_SKYWOOD);

    const terrainLayer = this.map.createLayer("terrain", tileset, 0, 0);
    terrainLayer.setDepth(10);
    terrainLayer.setCollisionBetween(1, 10000, true);
    this.matter.world.convertTilemapLayer(terrainLayer, {
      collisionFilter: { category: 0x0002, mask: 0xffff },
      friction: 0,
      frictionStatic: 0,
      restitution: 0
    });

    const overlayLayer = this.map.createLayer("overlay", tileset, 0, 0);
    overlayLayer.setDepth(11);

    const ladderLayer = this.map.createLayer("ladder", tileset, 0, 0);
    ladderLayer.setDepth(12);
    ladderLayer.setAlpha(0.35);

    this.layers.terrain = terrainLayer;
    this.layers.overlay = overlayLayer;
    this.layers.ladder = ladderLayer;

    this.matter.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
  }

  getPlayerSpawn() {
    if (!this.map) {
      return { x: this.scale.width * 0.5, y: this.scale.height * 0.5 };
    }

    const layer = this.layers.terrain;
    const tileW = this.map.tileWidth;
    const tileH = this.map.tileHeight;
    const centerCol = Math.floor(this.map.width / 2);
    const searchCols = [centerCol, centerCol - 2, centerCol + 2, 6, 8, 10, 12];

    for (const col of searchCols) {
      if (col < 0 || col >= this.map.width) {
        continue;
      }
      for (let row = this.map.height - 1; row >= 0; row--) {
        const tile = layer.getTileAt(col, row);
        if (tile && tile.index >= 1) {
          const wx = this.map.tileToWorldX(col) + tileW * 0.5;
          const wyTop = this.map.tileToWorldY(row) - 1;
          const spawnY = wyTop - 60 * 0.5 - 4;
          return { x: wx, y: spawnY };
        }
      }
    }

    const fallbackX = this.map.tileToWorldX(6) + tileW * 1;
    const groundY = this.map.heightInPixels - tileH * 2;
    return { x: fallbackX, y: groundY - 80 };
  }

  setupCamera() {
    const camera = this.cameras.main;
    if (!this.map) {
      return;
    }

    camera.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    camera.setDeadzone(camera.width * CAMERA_DEADZONE_X, camera.height * CAMERA_DEADZONE_Y);
    camera.setLerp(0.12, 0.18);
    camera.roundPixels = true;

    if (this.player) {
      camera.startFollow(this.player, true, 0.12, 0.18, 0, 40);
    }
  }

  createHud() {
    const hudText = this.add.text(20, 20, "", {
      fontFamily: "Rubik, 'Segoe UI', sans-serif",
      fontSize: "18px",
      color: "#ffffff"
    });
    hudText.setScrollFactor(0);
    hudText.setDepth(1001);
    this.debugHud = hudText;
  }

  update(time, delta) {
    this.updateParallax();
    this.updateHud();
    this.handleCombatInput();
    this.mobSpawner?.update(time, delta);
    this.updateProjectiles();
    this.handleMobInteractions();
  }

  handleCombatInput() {
    if (!this.inputManager || !this.player) {
      return;
    }

    if (this.inputManager.wasJustPressed(INPUT_KEYS.ATTACK_PRIMARY)) {
      this.doMelee();
    }
    if (this.inputManager.wasJustPressed(INPUT_KEYS.ATTACK_SECONDARY)) {
      this.fireProjectile();
    }
  }

  doMelee() {
    const dir = this.player.facing >= 0 ? 1 : -1;
    const x = this.player.x + dir * 30;
    const y = this.player.y - 10;
    const hitRect = new Phaser.Geom.Rectangle(x - 26, y - 24, 52, 48);

    const swing = this.add.graphics();
    swing.fillStyle(0xffcc66, 0.85);
    swing.fillRoundedRect(hitRect.x, hitRect.y, hitRect.width, hitRect.height, 8);
    swing.setDepth(50);
    this.tweens.add({ targets: swing, alpha: 0, duration: 120, onComplete: () => swing.destroy() });

    this.applyDamageZone(hitRect, 24, this.player.x);
    this.audio?.play(ASSET_KEYS.AUDIO.CORE_SFX, "attack");
    this.cameras.main.shake(60, 0.002);
  }

  fireProjectile() {
    const dir = this.player.facing >= 0 ? 1 : -1;
    const startX = this.player.x + dir * 26;
    const startY = this.player.y - 6;
    const projectile = this.projectilePool.obtain();
    projectile.fire(startX, startY, dir);
    projectile.damage = 18;
    this.projectiles.add(projectile);
    projectile.once("despawn", () => {
      this.projectiles.delete(projectile);
    });
    this.audio?.play(ASSET_KEYS.AUDIO.CORE_SFX, "attack");
  }

  applyDamageZone(area, damage, sourceX) {
    if (!this.mobSpawner) {
      return;
    }
    this.mobSpawner.getActiveMobs().forEach((mob) => {
      if (!mob.active) {
        return;
      }
      if (Phaser.Geom.Intersects.RectangleToRectangle(area, mob.getBounds())) {
        if (mob.takeDamage(damage, sourceX)) {
          this.spawnDamageNumber(mob.x, mob.y - 28, damage, "#ffd1a9");
        }
      }
    });
  }

  updateProjectiles() {
    if (!this.mobSpawner) {
      return;
    }
    const mobs = this.mobSpawner.getActiveMobs();
    this.projectiles.forEach((projectile) => {
      if (!projectile.active) {
        return;
      }
      const bounds = projectile.getBounds();
      for (const mob of mobs) {
        if (!mob.active) {
          continue;
        }
        if (Phaser.Geom.Intersects.RectangleToRectangle(bounds, mob.getBounds())) {
          if (mob.takeDamage(projectile.damage, projectile.x)) {
            this.spawnDamageNumber(mob.x, mob.y - 32, projectile.damage, "#ffd1a9");
          }
          projectile.lifespan = 0;
          break;
        }
      }
    });
  }

  handleMobInteractions() {
    if (!this.mobSpawner || !this.player) {
      return;
    }
    const playerBounds = this.player.getBounds();
    this.mobSpawner.getActiveMobs().forEach((mob) => {
      if (!mob.active) {
        return;
      }
      if (mob.pendingHit && Phaser.Geom.Intersects.RectangleToRectangle(mob.getBounds(), playerBounds)) {
        if (this.player.takeDamage(12, mob.x)) {
          mob.pendingHit = false;
          this.cameras.main.flash(80, 255, 80, 80);
          this.audio?.play(ASSET_KEYS.AUDIO.CORE_SFX, "hit");
        }
      }
    });
  }

  updateParallax() {
    if (!this.parallaxLayers.length) {
      return;
    }
    const scrollX = this.cameras.main.scrollX;
    const scrollY = this.cameras.main.scrollY;
    this.parallaxLayers.forEach((sprite, index) => {
      const ratio = this.parallaxConfig[index].ratio;
      sprite.tilePositionX = scrollX * ratio;
      sprite.tilePositionY = scrollY * ratio * 0.6;
    });
  }

  updateHud() {
    if (!this.debugHud || !this.player || !this.player.body) {
      return;
    }
    const velocity = this.player.body.velocity;
    const speedX = Math.round(velocity.x * 60);
    const speedY = Math.round(velocity.y * 60);
    const posX = Math.round(this.player.x);
    const posY = Math.round(this.player.y);
    const mobs = this.mobSpawner ? this.mobSpawner.getActiveMobs().length : 0;
    const hp = this.player.stats.hp;       // 현재 체력
    const maxHp = this.player.stats.maxHP; // 최대 체력

    this.debugHud.setText([
     "Player",
     `HP ${hp} / ${maxHp}`,
      `X ${Math.round(this.player.body.velocity.x * 60)} px/s`,
     `Y ${Math.round(this.player.body.velocity.y * 60)} px/s`,
     `Pos ${Math.round(this.player.x)}, ${Math.round(this.player.y)}`,
     `Ground ${this.player.isOnGround}`,
     `Dash ${this.player.isDashing}`,
     `Mobs ${this.mobSpawner ? this.mobSpawner.activeMobs.size : 0}`
    ]);
  }
  spawnDamageNumber(x, y, value, color) 
  {
  if (color === undefined || color === null) color = "#ff5e5e";

  const text = this.add.text(x, y, String(value), {
    fontFamily: "Rubik, 'Segoe UI', sans-serif",
    fontSize: "18px",
    color
  });
  text.setDepth(80);
  text.setOrigin(0.5, 1);

  this.tweens.add({
    targets: text,
    y: y - 32,
    alpha: 0,
    duration: 400,
    ease: "Cubic.Out",
    onComplete: () => text.destroy()
  });
  }


  spawnLoot(x, y) 
  {
    const loot = this.add.rectangle(x, y, 12, 12, 0xffd166);
    loot.setDepth(70);
    this.tweens.add({
      targets: loot,
      y: y + 24,
      alpha: 0,
      duration: 600,
      ease: "Sine.In",
      onComplete: () => loot.destroy()
    });
  }

  shutdown() {
    this.perfMeter?.destroy();
    this.perfMeter = null;
    this.player = null;
    this.layers = {};
    this.parallaxLayers = [];
    this.inputManager = null;
  }
}
