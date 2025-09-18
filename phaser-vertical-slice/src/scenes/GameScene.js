import Phaser from "../phaser.js";
import PerfMeter from "../systems/PerfMeter.js";
import { ASSET_KEYS } from "../systems/AssetLoader.js";
import InputManager, { INPUT_KEYS } from "../systems/InputManager.js";
import Player from "../entities/Player.js";
import Pool from "../systems/Pool.js";
import AudioManager from "../systems/AudioManager.js";
import Projectile from "../entities/Projectile.js";
import Spawner from "../systems/Spawner.js";
import SaveManager from "../systems/SaveManager.js";

const CAMERA_DEADZONE_X = 0.4;
const CAMERA_DEADZONE_Y = 0.3;
const UI_SYNC_INTERVAL = 120;

const SAVE_DEBOUNCE_MS = 800;
const SAVE_RETRY_MS = 4000;
const AUTO_SAVE_INTERVAL = 15000;
const PROJECTILE_CULL_PADDING = 220;


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
    this.damageTextPool = null;
    this.lootPool = null;
    this.mobSpawner = null;


    this.saveManager = null;
    this.restoredData = null;
    this.saveDirty = false;
    this.saveCooldown = 0;
    this.autoSaveTimer = 0;
    this.lastSaveStatus = { state: "idle", timestamp: 0 };
    this.lastSaveReason = "startup";
    this.systemDirty = true;

    this.inventory = [];
    this.quickSlots = [];
    this.optionsState = {};
    this.bindingsDirty = false;

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

    this.saveManager = new SaveManager();
    this.restoredData = this.saveManager.load();
    if (!this.saveManager.isAvailable()) {
      this.lastSaveStatus = { state: "disabled", timestamp: Date.now() };
    } else if (this.restoredData && typeof this.restoredData.timestamp === "number") {
      this.lastSaveStatus = { state: "success", timestamp: this.restoredData.timestamp };
    }
    this.systemDirty = true;

    this.inputManager = new InputManager(this);
    this.audio = new AudioManager(this);

    this.createParallax();
    this.createTilemap();

    const spawn = this.getPlayerSpawn();
    this.player = new Player(this, spawn.x, spawn.y, this.inputManager);
    this.applyRestoredPlayerState();

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

    this.createEffectPools();

    this.mobSpawner = new Spawner(this, {
      spawnX: spawn.x + 180,
      spawnY: spawn.y - 20,
      maxCount: 3
    });

    this.setupCamera();

    this.initializeGameData();
    this.initializeUIBridge();


    this.markProgressDirty("startup", true);


    this.perfMeter = new PerfMeter(this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

  }

  createEffectPools() {
    this.damageTextPool = new Pool(
      () => {
        const text = this.add.text(0, 0, "", {
          fontFamily: "Rubik, 'Segoe UI', sans-serif",
          fontSize: "18px",
          color: "#ff5e5e"
        });
        text.setDepth(80);
        text.setOrigin(0.5, 1);
        text.setActive(false);
        text.setVisible(false);
        return text;
      },
      (text) => {
        this.tweens.killTweensOf(text);
        text.setAlpha(1);
        text.setScale(1);
        text.setActive(false);
        text.setVisible(false);
      }
    );

    this.lootPool = new Pool(
      () => {
        const rect = this.add.rectangle(0, 0, 12, 12, 0xffd166);
        rect.setDepth(70);
        rect.setActive(false);
        rect.setVisible(false);
        return rect;
      },
      (rect) => {
        this.tweens.killTweensOf(rect);
        rect.setAlpha(1);
        rect.setScale(1);
        rect.setActive(false);
        rect.setVisible(false);
      }
    );

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

  applyRestoredPlayerState() {
    if (!this.player || !this.restoredData || !this.restoredData.player) {
      return;
    }
    const data = this.restoredData.player;
    const hasMap = Boolean(this.map);
    const clampX = hasMap
      ? Phaser.Math.Clamp(
          typeof data.x === "number" ? data.x : this.player.x,
          32,
          Math.max(32, this.map.widthInPixels - 32)
        )
      : typeof data.x === "number"
        ? data.x
        : this.player.x;
    const clampY = hasMap
      ? Phaser.Math.Clamp(
          typeof data.y === "number" ? data.y : this.player.y,
          0,
          Math.max(0, this.map.heightInPixels - 16)
        )
      : typeof data.y === "number"
        ? data.y
        : this.player.y;

    this.player.setPosition(clampX, clampY);
    if (typeof data.hp === "number") {
      this.player.stats.hp = Phaser.Math.Clamp(Math.round(data.hp), 0, this.player.stats.maxHP);
    }
    if (typeof data.mp === "number") {
      this.player.stats.mp = Phaser.Math.Clamp(Math.round(data.mp), 0, this.player.stats.maxMP);
    }
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

    const restore = this.restoredData || {};

    const defaultInventory = [

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


    const savedInventory = Array.isArray(restore.inventory) ? restore.inventory : null;
    const sourceInventory = savedInventory && savedInventory.length ? savedInventory : defaultInventory;
    this.inventory = sourceInventory.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type || "consumable",
      quantity: Number.isFinite(item.quantity) ? Math.max(0, Math.round(item.quantity)) : 1,
      description: item.description || ""
    }));

    const defaultQuickSlots = [

      { index: 0, itemId: "skyroot_tonic" },
      { index: 1, itemId: "azure_focus" },
      { index: 2, itemId: null },
      { index: 3, itemId: "wingburst_scroll" }
    ];

    this.quickSlots = defaultQuickSlots.map((slot) => ({ ...slot }));
    if (Array.isArray(restore.quickSlots)) {
      restore.quickSlots.forEach((slot) => {
        if (!slot || typeof slot.index !== "number") {
          return;
        }
        const idx = slot.index;
        if (idx < 0 || idx >= this.quickSlots.length) {
          return;
        }
        const itemId = typeof slot.itemId === "string" ? slot.itemId : null;
        this.quickSlots[idx] = { index: idx, itemId };
      });
    }

    const inventoryIds = new Set(this.inventory.map((item) => item.id));
    this.quickSlots = this.quickSlots.map((slot) => ({
      index: slot.index,
      itemId: slot.itemId && inventoryIds.has(slot.itemId) ? slot.itemId : null
    }));

    const defaultOptions = {

      masterVolume: 0.8,
      sfxVolume: 0.9,
      bgmVolume: 0.7,
      resolutionScale: 1,
      graphicsQuality: "High"
    };

    this.optionsState = { ...defaultOptions, ...(restore.options || {}) };


    this.inventoryDirty = true;
    this.quickSlotsDirty = true;
    this.optionsDirty = true;

    this.bindingsDirty = true;

    this.audio.applyMixSettings(this.optionsState);
    this.updateResolutionScale();
    this.applyGraphicsQuality(this.optionsState.graphicsQuality);

    if (Array.isArray(restore.bindings) && this.inputManager?.applyBindingSnapshot) {
      this.inputManager.applyBindingSnapshot(restore.bindings);
      this.bindingsDirty = true;
    }

  }

  initializeUIBridge() {
    this.events.on("ui-options-change", this.applyOptionsPatch, this);
    this.events.on("ui-assign-quick-slot", this.handleQuickSlotAssignment, this);
    this.events.on("ui-close-panel", this.handleUIClosePanel, this);

    this.events.on("ui-rebind-action", this.handleRebindAction, this);
    this.events.on("ui-reset-bindings", this.handleResetBindings, this);

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

    this.updateSaveHeartbeat(delta);

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

    if (this.audio) {
      this.audio.setDuck(this.menuOpen, 0.55, 220);
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

      this.markProgressDirty("quickslot");

      this.syncUI(true);
      return;
    }
    const item = this.inventory.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }
    this.quickSlots[slotIndex] = { index: slotIndex, itemId };
    this.quickSlotsDirty = true;

    this.markProgressDirty("quickslot");
    this.syncUI(true);
  }


  handleRebindAction({ action, keyCode }) {
    if (!action || typeof keyCode !== "number" || !Number.isFinite(keyCode)) {
      return;
    }
    if (this.inputManager?.rebindAction(action, keyCode)) {
      this.bindingsDirty = true;

      this.markProgressDirty("bindings");

      this.syncUI(true);
    }
  }

  handleResetBindings() {
    if (!this.inputManager) {
      return;
    }
    this.inputManager.resetAllBindings();
    this.bindingsDirty = true;

    this.markProgressDirty("bindings");

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


    this.markProgressDirty("options");

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


  updateSaveHeartbeat(delta) {
    if (!this.saveManager) {
      return;
    }

    this.autoSaveTimer += delta;
    if (this.autoSaveTimer >= AUTO_SAVE_INTERVAL) {
      this.autoSaveTimer = 0;
      if (!this.saveDirty) {
        this.markProgressDirty("autosave");
      }
    }

    if (!this.saveDirty) {
      return;
    }

    this.saveCooldown -= delta;
    if (this.saveCooldown <= 0) {
      this.commitSave();
    }
  }

  markProgressDirty(reason = "update", immediate = false) {
    if (this.saveDirty) {
      this.saveCooldown = immediate ? 0 : Math.min(this.saveCooldown, SAVE_DEBOUNCE_MS);
    } else {
      this.saveDirty = true;
      this.saveCooldown = immediate ? 0 : SAVE_DEBOUNCE_MS;
    }
    this.lastSaveReason = reason;
    this.systemDirty = true;
  }

  commitSave() {
    if (!this.saveManager) {
      this.saveDirty = false;
      return;
    }

    if (!this.saveManager.isAvailable()) {
      this.saveDirty = false;
      this.lastSaveStatus = { state: "disabled", timestamp: Date.now() };
      this.systemDirty = true;
      return;
    }

    const result = this.saveManager.save(this.collectSaveData());
    const timestamp = result.timestamp ?? Date.now();
    if (result.ok) {
      this.saveDirty = false;
      this.lastSaveStatus = { state: "success", timestamp };
    } else if (result.reason === "unavailable") {
      this.saveDirty = false;
      this.lastSaveStatus = { state: "disabled", timestamp };
    } else {
      this.saveDirty = true;
      this.saveCooldown = SAVE_RETRY_MS;
      this.lastSaveStatus = { state: "error", timestamp };
    }
    this.systemDirty = true;
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

    if (force || this.bindingsDirty) {
      this.bindingsDirty = false;
    }
    if (force || this.systemDirty) {
      this.systemDirty = false;
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


    const performance = this.getPerfSnapshot();


    const payload = {
      hud,
      performance,

      menu: {
        open: this.menuOpen,
        inventoryOpen: this.menuState.inventoryOpen,
        optionsOpen: this.menuState.optionsOpen
      },

      map: this.collectMapState(),
      system: this.collectSystemState()

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

    if (force || this.bindingsDirty) {
      payload.bindings = this.collectBindingState();
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

  collectBindingState() {
    if (!this.inputManager?.getBindingSnapshot) {
      return [];
    }
    return this.inputManager.getBindingSnapshot();
  }


  collectSaveData() {
    const payload = {
      inventory: this.collectInventoryState(),
      quickSlots: this.quickSlots.map((slot) => ({
        index: slot.index,
        itemId: slot.itemId ?? null
      })),
      options: { ...this.optionsState },
      bindings: this.inputManager?.getBindingSnapshot
        ? this.inputManager.getBindingSnapshot().map((entry) => ({
            action: entry.action,
            codes: Array.isArray(entry.codes) ? [...entry.codes] : []
          }))
        : []
    };

    if (this.player) {
      payload.player = {
        x: Math.round(this.player.x),
        y: Math.round(this.player.y),
        hp: Math.round(this.player.stats.hp),
        mp: Math.round(this.player.stats.mp)
      };
    }

    return payload;
  }

  countActiveProjectiles() {
    let count = 0;
    this.projectiles.forEach((projectile) => {
      if (projectile.active) {
        count += 1;
      }
    });
    return count;
  }

  getPerfSnapshot() {
    const objects = this.children?.list?.length ?? 0;
    const mobsActive = this.mobSpawner ? this.mobSpawner.getManagedCount() : 0;
    const mobsVisible = this.mobSpawner ? this.mobSpawner.getVisibleCount() : 0;
    const projectileCount = this.countActiveProjectiles();

    return {
      fps: this.game.loop.actualFps || 0,
      frameTime: this.lastFrameTime,
      objects,
      mobsActive,
      mobsVisible,
      projectiles: projectileCount,
      pools: {
        projectile: this.projectilePool
          ? { live: this.projectilePool.getLiveCount(), free: this.projectilePool.getFreeCount() }
          : null,
        damageText: this.damageTextPool
          ? { live: this.damageTextPool.getLiveCount(), free: this.damageTextPool.getFreeCount() }
          : null
      }
    };
  }

  collectSystemState() {
    return {
      save: {
        state: this.lastSaveStatus?.state ?? "idle",
        timestamp: this.lastSaveStatus?.timestamp ?? 0,
        dirty: this.saveDirty,
        reason: this.lastSaveReason,
        available: this.saveManager?.isAvailable() ?? false
      }
    };
  }

  collectMapState() {
    if (!this.map) {
      return null;
    }
    const mobs = [];
    if (this.mobSpawner) {
      this.mobSpawner.getActiveMobs().forEach((mob) => {

        if (mob.active && !mob.isCulled) {

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
    const camera = this.cameras?.main;
    const view = camera ? camera.worldView : null;
    const left = view ? view.x - PROJECTILE_CULL_PADDING : Number.NEGATIVE_INFINITY;
    const right = view ? view.right + PROJECTILE_CULL_PADDING : Number.POSITIVE_INFINITY;
    const top = view ? view.y - PROJECTILE_CULL_PADDING : Number.NEGATIVE_INFINITY;
    const bottom = view ? view.bottom + PROJECTILE_CULL_PADDING : Number.POSITIVE_INFINITY;
    this.projectiles.forEach((projectile) => {
      if (!projectile.active) {
        return;
      }
      if (projectile.x < left || projectile.x > right || projectile.y < top || projectile.y > bottom) {
        projectile.lifespan = 0;
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
          this.markProgressDirty("player-damage");
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

    if (!this.damageTextPool) {
      return;
    }
    const tint = color ?? "#ff5e5e";
    const text = this.damageTextPool.obtain();
    text.setText(String(value));
    text.setColor(tint);
    text.setPosition(x, y);
    text.setAlpha(1);
    text.setScale(1);
    text.setActive(true);
    text.setVisible(true);
    this.tweens.killTweensOf(text);


    this.tweens.add({
      targets: text,
      y: y - 32,
      alpha: 0,
      duration: 400,
      ease: "Cubic.Out",

      onComplete: () => {
        this.damageTextPool.release(text);
      }

    });
  }

  spawnLoot(x, y) {

    if (!this.lootPool) {
      return;
    }
    const loot = this.lootPool.obtain();
    loot.setPosition(x, y);
    loot.setAlpha(1);
    loot.setScale(1);
    loot.setActive(true);
    loot.setVisible(true);
    this.tweens.killTweensOf(loot);

    this.tweens.add({
      targets: loot,
      y: y + 24,
      alpha: 0,
      duration: 600,
      ease: "Sine.In",
      onComplete: () => {
        this.lootPool.release(loot);
      }
    });
  }

  shutdown() {

    if (this.saveManager) {
      this.saveDirty = true;
      this.commitSave();
    }

    this.audio?.stopBgm({ fadeOut: 160 });
    this.perfMeter?.destroy();
    this.perfMeter = null;
    this.player = null;
    this.layers = {};
    this.parallaxLayers = [];
    this.inputManager = null;
    this.projectiles.clear();

    if (this.damageTextPool) {
      this.damageTextPool.forEachLive((text) => text.destroy());
      this.damageTextPool.free.forEach((text) => text.destroy());
      this.damageTextPool = null;
    }
    if (this.lootPool) {
      this.lootPool.forEachLive((rect) => rect.destroy());
      this.lootPool.free.forEach((rect) => rect.destroy());
      this.lootPool = null;
    }

    if (this.scene.isActive && this.scene.isActive("UIScene")) {
      this.scene.stop("UIScene");
    }
    this.events.off("ui-options-change", this.applyOptionsPatch, this);
    this.events.off("ui-assign-quick-slot", this.handleQuickSlotAssignment, this);
    this.events.off("ui-close-panel", this.handleUIClosePanel, this);

    this.events.off("ui-rebind-action", this.handleRebindAction, this);
    this.events.off("ui-reset-bindings", this.handleResetBindings, this);
    this.events.off("ui-ready", this.handleUIReady, this);
    this.audio = null;

    this.saveManager = null;
    this.restoredData = null;

  }
}
