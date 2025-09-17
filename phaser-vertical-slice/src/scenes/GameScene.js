import Phaser from "../phaser.js";
import PerfMeter from "../systems/PerfMeter.js";
import { ASSET_KEYS } from "../systems/AssetLoader.js";
import InputManager, { INPUT_KEYS } from "../systems/InputManager.js";
import Player from "../entities/Player.js";
import Pool from "../systems/Pool.js";
import AudioManager from "../systems/AudioManager.js";
import Projectile from "../entities/Projectile.js";
import Spawner from "../systems/Spawner.js";

const CAMERA_DEADZONE_X = 0.4;
const CAMERA_DEADZONE_Y = 0.3;
const UI_SYNC_INTERVAL = 120;

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
    this.audio = null;
    this.projectilePool = null;
    this.projectiles = new Set();
    this.mobSpawner = null;

    this.inventory = [];
    this.quickSlots = [];
    this.optionsState = {};

    this.inventoryDirty = false;
    this.quickSlotsDirty = false;
    this.optionsDirty = false;
    this.uiSyncTimer = 0;
    this.menuState = { inventoryOpen: false, optionsOpen: false };
    this.menuOpen = false;
    this.lastFrameTime = 0;
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

    this.initializeGameData();
    this.initializeUIBridge();

    this.perfMeter = new PerfMeter(this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
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

  initializeGameData() {
    this.inventory = [
      {
        id: "skyroot_tonic",
        name: "Skyroot Tonic",
        type: "consumable",
        quantity: 3,
        description: "Restores 40 HP over a short duration."
      },
      {
        id: "azure_focus",
        name: "Azure Focus",
        type: "consumable",
        quantity: 2,
        description: "Instantly revitalises 30 MP."
      },
      {
        id: "ember_shard",
        name: "Ember Shard",
        type: "material",
        quantity: 5,
        description: "Warm crystalline shard used for crafting combustion cores."
      },
      {
        id: "wingburst_scroll",
        name: "Wingburst Scroll",
        type: "skill",
        quantity: 1,
        description: "Unlocks a temporary mid-air burst dash when consumed."
      }
    ];

    this.quickSlots = [
      { index: 0, itemId: "skyroot_tonic" },
      { index: 1, itemId: "azure_focus" },
      { index: 2, itemId: null },
      { index: 3, itemId: "wingburst_scroll" }
    ];

    this.optionsState = {
      masterVolume: 0.8,
      sfxVolume: 0.9,
      bgmVolume: 0.7,
      resolutionScale: 1,
      graphicsQuality: "High"
    };

    this.inventoryDirty = true;
    this.quickSlotsDirty = true;
    this.optionsDirty = true;


    this.audio.applyMixSettings(this.optionsState);
    this.updateResolutionScale();
    this.applyGraphicsQuality(this.optionsState.graphicsQuality);
  }

  initializeUIBridge() {
    this.events.on("ui-options-change", this.applyOptionsPatch, this);
    this.events.on("ui-assign-quick-slot", this.handleQuickSlotAssignment, this);
    this.events.on("ui-close-panel", this.handleUIClosePanel, this);

    this.events.once("ui-ready", this.handleUIReady, this);

    if (this.scene.isActive && this.scene.isActive("UIScene")) {
      this.scene.stop("UIScene");
    }
    this.scene.launch("UIScene", { gameSceneKey: this.scene.key });
    this.scene.bringToTop("UIScene");
  }

  handleUIReady() {
    this.syncUI(true);
  }

  update(time, delta) {
    this.lastFrameTime = delta;
    this.updateParallax();
    this.handleUtilityInput();

    if (!this.menuOpen) {
      this.handleCombatInput();
    }

    this.mobSpawner?.update(time, delta);
    this.updateProjectiles();
    this.handleMobInteractions();
    this.updateUIHeartbeat(delta);
  }

  handleUtilityInput() {
    if (!this.inputManager) {
      return;
    }

    if (this.inputManager.wasJustPressed(INPUT_KEYS.INVENTORY)) {
      const open = !this.menuState.inventoryOpen;
      this.menuState.inventoryOpen = open;
      if (open && this.menuState.optionsOpen) {
        this.menuState.optionsOpen = false;
        this.events.emit("ui-panel", { panel: "options", open: false });
      }
      this.events.emit("ui-panel", { panel: "inventory", open });
      this.handleMenuStateChanged();
      this.syncUI(true);
    }

    if (this.inputManager.wasJustPressed(INPUT_KEYS.OPTIONS)) {
      const open = !this.menuState.optionsOpen;
      this.menuState.optionsOpen = open;
      if (open && this.menuState.inventoryOpen) {
        this.menuState.inventoryOpen = false;
        this.events.emit("ui-panel", { panel: "inventory", open: false });
      }
      this.events.emit("ui-panel", { panel: "options", open });
      this.handleMenuStateChanged();
      this.syncUI(true);
    }
  }

  handleMenuStateChanged() {
    const isOpen = this.menuState.inventoryOpen || this.menuState.optionsOpen;
    if (isOpen === this.menuOpen) {
      return;
    }

    this.menuOpen = isOpen;
    if (this.player) {
      this.player.setInputEnabled(!this.menuOpen);
    }
    if (this.menuOpen) {
      this.inputManager?.resetAll?.();
    }
    this.events.emit("ui-menu-state", { open: this.menuOpen });
  }

  handleUIClosePanel({ panel }) {
    if (panel === "inventory" && this.menuState.inventoryOpen) {
      this.menuState.inventoryOpen = false;
      this.events.emit("ui-panel", { panel: "inventory", open: false });
      this.handleMenuStateChanged();
      this.syncUI(true);
    } else if (panel === "options" && this.menuState.optionsOpen) {
      this.menuState.optionsOpen = false;
      this.events.emit("ui-panel", { panel: "options", open: false });
      this.handleMenuStateChanged();
      this.syncUI(true);
    }
  }

  handleQuickSlotAssignment({ slotIndex, itemId }) {
    if (typeof slotIndex !== "number" || slotIndex < 0 || slotIndex >= this.quickSlots.length) {
      return;
    }
    if (!itemId) {
      this.quickSlots[slotIndex] = { index: slotIndex, itemId: null };
      this.quickSlotsDirty = true;
      this.syncUI(true);
      return;
    }
    const item = this.inventory.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }
    this.quickSlots[slotIndex] = { index: slotIndex, itemId };
    this.quickSlotsDirty = true;
    this.syncUI(true);
  }



  applyOptionsPatch(patch) {
    if (!patch) {
      return;
    }

    this.optionsState = { ...this.optionsState, ...patch };
    this.optionsDirty = true;
    this.audio?.applyMixSettings(this.optionsState);

    if (patch.resolutionScale !== undefined) {
      this.updateResolutionScale();
    }
    if (patch.graphicsQuality !== undefined) {
      this.applyGraphicsQuality(this.optionsState.graphicsQuality);
    }

    this.syncUI(true);
  }

  updateResolutionScale() {
    const zoom = Phaser.Math.Clamp(this.optionsState.resolutionScale ?? 1, 0.7, 1.2);
    this.cameras.main.setZoom(zoom);
  }

  applyGraphicsQuality(quality) {
    const engine = this.matter?.world?.engine;
    if (!engine) {
      return;
    }
    if (quality === "Performance") {
      engine.positionIterations = 4;
      engine.velocityIterations = 3;
    } else {
      engine.positionIterations = 6;
      engine.velocityIterations = 4;
    }
  }

  updateUIHeartbeat(delta) {
    this.uiSyncTimer += delta;
    if (this.uiSyncTimer < UI_SYNC_INTERVAL) {
      return;
    }
    this.uiSyncTimer = 0;
    this.syncUI();
  }

  syncUI(force = false) {
    const payload = this.buildUIState(force);
    this.events.emit("ui-state", payload);
    if (force || this.inventoryDirty) {
      this.inventoryDirty = false;
    }
    if (force || this.quickSlotsDirty) {
      this.quickSlotsDirty = false;
    }
    if (force || this.optionsDirty) {
      this.optionsDirty = false;
    }

  }

  buildUIState(force = false) {
    const hud = this.player
      ? {
          hp: Math.round(this.player.stats.hp),
          maxHp: this.player.stats.maxHP,
          mp: Math.round(this.player.stats.mp),
          maxMp: this.player.stats.maxMP,
          dashCooldown: Math.max(0, Math.round(this.player.dashCooldownTimer || 0)),
          dashReady: (this.player.dashCooldownTimer || 0) <= 0,
          menuOpen: this.menuOpen
        }
      : null;

    const performance = {
      fps: this.game.loop.actualFps || 0,
      frameTime: this.lastFrameTime,
      objects: this.children.list.length,
      mobs: this.mobSpawner ? this.mobSpawner.getActiveMobs().length : 0,
      projectiles: this.projectiles.size
    };

    const payload = {
      hud,
      performance,

      map: this.collectMapState()
    };

    if (force || this.quickSlotsDirty) {
      payload.quickSlots = this.collectQuickSlotState();
    }
    if (force || this.inventoryDirty) {
      payload.inventory = this.collectInventoryState();
    }
    if (force || this.optionsDirty) {
      payload.options = { ...this.optionsState };
    }


    return payload;
  }

  collectQuickSlotState() {
    return this.quickSlots.map((slot) => {
      const item = slot.itemId ? this.inventory.find((entry) => entry.id === slot.itemId) : null;
      return {
        index: slot.index,
        itemId: slot.itemId,
        name: item?.name ?? null,
        quantity: item?.quantity ?? 0
      };
    });
  }

  collectInventoryState() {
    return this.inventory.map((item) => ({ ...item }));
  }



  collectMapState() {
    if (!this.map) {
      return null;
    }
    const mobs = [];
    if (this.mobSpawner) {
      this.mobSpawner.getActiveMobs().forEach((mob) => {
        if (mob.active) {
          mobs.push({ x: mob.x, y: mob.y });
        }
      });
    }
    const view = this.cameras.main.worldView;
    return {
      width: this.map.widthInPixels,
      height: this.map.heightInPixels,
      player: this.player ? { x: this.player.x, y: this.player.y } : null,
      camera: { x: view.x, y: view.y, width: view.width, height: view.height },
      mobs
    };
  }

  handleCombatInput() {
    if (!this.inputManager || !this.player || this.menuOpen) {
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

  spawnDamageNumber(x, y, value, color) {
    const tint = color ?? "#ff5e5e";
    const text = this.add.text(x, y, String(value), {
      fontFamily: "Rubik, 'Segoe UI', sans-serif",
      fontSize: "18px",
      color: tint
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

  spawnLoot(x, y) {
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
    this.projectiles.clear();
    if (this.scene.isActive && this.scene.isActive("UIScene")) {
      this.scene.stop("UIScene");
    }
    this.events.off("ui-options-change", this.applyOptionsPatch, this);
    this.events.off("ui-assign-quick-slot", this.handleQuickSlotAssignment, this);
    this.events.off("ui-close-panel", this.handleUIClosePanel, this);

    this.events.off("ui-ready", this.handleUIReady, this);
  }
}
