import Phaser from "../phaser.js";
import PerfMeter from "../systems/PerfMeter.js";
import { ASSET_KEYS } from "../systems/AssetLoader.js";
import InputManager, { INPUT_KEYS } from "../systems/InputManager.js";
import Player from "../entities/Player.js";
import Pool from "../systems/Pool.js";
import AudioManager from "../systems/AudioManager.js";
import Projectile from "../entities/Projectile.js";
import LootDrop from "../entities/LootDrop.js";
import Spawner from "../systems/Spawner.js";
import SaveManager from "../systems/SaveManager.js";
import {
  createDefaultInventory,
  createDefaultQuickSlots,
  ensureItemIconTexture,
  getItemDefinition
} from "../data/ItemCatalog.js";

const CAMERA_DEADZONE_X = 0.4;
const CAMERA_DEADZONE_Y = 0.3;
const UI_SYNC_INTERVAL = 120;
const SAVE_DEBOUNCE_MS = 800;
const SAVE_RETRY_MS = 4000;
const AUTO_SAVE_INTERVAL = 15000;
const PROJECTILE_CULL_PADDING = 220;

const ATTACK_COOLDOWN_MS = 300;

const QUICK_SLOT_INPUTS = [
  { action: INPUT_KEYS.QUICK_SLOT_1, index: 0 },
  { action: INPUT_KEYS.QUICK_SLOT_2, index: 1 },
  { action: INPUT_KEYS.QUICK_SLOT_3, index: 2 },
  { action: INPUT_KEYS.QUICK_SLOT_4, index: 3 }
];


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

    this.primaryAttackCooldown = 0;
    this.secondaryAttackCooldown = 0;

    this.damageTextPool = null;
    this.lootPool = null;
    this.lootDrops = new Set();
    this.focusedLootDrop = null;
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
    this.quickSlotRuntime = [];
    this.optionsState = {};
    this.bindingsDirty = false;
    this.inventoryDirty = false;
    this.quickSlotsDirty = false;
    this.optionsDirty = false;
    this.uiSyncTimer = 0;
    this.menuState = { inventoryOpen: false, optionsOpen: false };
    this.menuOpen = false;
    this.lastFrameTime = 0;

    this.resetQueued = false;

  }

  create() {
    this.resetQueued = false;
    this.lootDrops.clear();
    this.focusedLootDrop = null;

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
        const drop = new LootDrop(this, -1000, -1000);
        drop.resetState();
        return drop;
      },
      (drop) => {
        if (!drop) {
          return;
        }
        drop.resetState();
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

    const savedInventory = Array.isArray(restore.inventory) ? restore.inventory : null;
    const usingSavedInventory = Boolean(savedInventory && savedInventory.length);
    const sourceInventory = usingSavedInventory ? savedInventory : createDefaultInventory();
    this.inventory = sourceInventory
      .map((item, index) => this.normalizeInventoryItem(item, index))
      .filter((entry) => entry !== null);

    if (!usingSavedInventory) {
      this.sortInventoryEntries();
    }

    const defaultQuickSlots = createDefaultQuickSlots();
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
    this.rebuildQuickSlotRuntime(true);

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

  normalizeInventoryItem(raw) {
    if (!raw || typeof raw.id !== "string") {
      return null;
    }
    const def = getItemDefinition(raw.id);
    const quantity = Number.isFinite(raw.quantity) ? Math.max(0, Math.round(raw.quantity)) : def?.defaultQuantity ?? 0;
    const cooldownMs = Number.isFinite(raw.cooldownMs)
      ? Math.max(0, Math.round(raw.cooldownMs))
      : def?.cooldownMs ?? 0;
    const usable = raw.usable !== undefined ? Boolean(raw.usable) : def ? def.usable !== false : true;
    return {
      id: raw.id,
      name: raw.name || def?.name || raw.id,
      type: raw.type || def?.type || "consumable",
      quantity,
      description: raw.description || def?.description || "",
      iconKey: raw.iconKey || def?.iconKey || null,
      cooldownMs,
      usable
    };
  }

  sortInventoryEntries() {
    if (!Array.isArray(this.inventory)) {
      return;
    }
    this.inventory.sort((a, b) => {
      const defA = getItemDefinition(a.id);
      const defB = getItemDefinition(b.id);
      const orderA = defA?.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = defB?.order ?? Number.MAX_SAFE_INTEGER;
      if (orderA === orderB) {
        const nameA = a?.name || defA?.name || a.id;
        const nameB = b?.name || defB?.name || b.id;
        return nameA.localeCompare(nameB);
      }
      return orderA - orderB;
    });
  }

  grantInventoryItem(itemId, quantity = 1) {
    if (!itemId || !Number.isFinite(quantity) || quantity <= 0) {
      return false;
    }

    const normalizedQuantity = Math.max(1, Math.round(quantity));
    const definition = getItemDefinition(itemId) || null;
    if (definition) {
      ensureItemIconTexture(this, definition);
    }

    let entry = this.inventory.find((item) => item.id === itemId);
    if (entry) {
      entry.quantity = Math.max(0, Math.round(entry.quantity + normalizedQuantity));
    } else {
      const normalized = this.normalizeInventoryItem({ id: itemId, quantity: normalizedQuantity });
      if (!normalized) {
        return false;
      }
      normalized.quantity = Math.max(1, Math.round(normalized.quantity || normalizedQuantity));
      if (definition?.iconKey && !normalized.iconKey) {
        normalized.iconKey = definition.iconKey;
      }
      this.inventory.push(normalized);
      this.sortInventoryEntries();
      entry = normalized;
    }

    const affectsQuickSlot = this.quickSlots?.some((slot) => slot?.itemId === itemId);
    if (affectsQuickSlot) {
      this.quickSlotsDirty = true;
    }

    this.inventoryDirty = true;
    this.syncUI(true);
    this.markProgressDirty("loot-pickup");
    return Boolean(entry);
  }

  createQuickSlotStatus(itemId = null) {
    return {
      itemId: itemId ?? null,
      cooldownRemaining: 0,
      cooldownTotal: 0
    };
  }

  rebuildQuickSlotRuntime(forceReset = false) {
    const next = [];
    for (let i = 0; i < this.quickSlots.length; i += 1) {
      const slot = this.quickSlots[i];
      const previous = this.quickSlotRuntime?.[i];
      if (!forceReset && previous && previous.itemId === slot.itemId) {
        next.push({
          itemId: previous.itemId ?? slot.itemId ?? null,
          cooldownRemaining: Math.max(0, previous.cooldownRemaining || 0),
          cooldownTotal: Math.max(0, previous.cooldownTotal || 0)
        });
      } else {
        next.push(this.createQuickSlotStatus(slot.itemId));
      }
    }
    this.quickSlotRuntime = next;
  }

  resetQuickSlotStatus(slotIndex, itemId = null) {
    if (slotIndex < 0 || slotIndex >= this.quickSlots.length) {
      return;
    }
    if (!this.quickSlotRuntime) {
      this.quickSlotRuntime = [];
    }
    this.quickSlotRuntime[slotIndex] = this.createQuickSlotStatus(itemId);
  }

  setQuickSlotCooldown(slotIndex, itemId, cooldownMs) {
    if (slotIndex < 0 || slotIndex >= this.quickSlots.length) {
      return;
    }
    const clamped = Math.max(0, Math.round(cooldownMs || 0));
    if (!this.quickSlotRuntime) {
      this.quickSlotRuntime = [];
    }
    if (!this.quickSlotRuntime[slotIndex]) {
      this.quickSlotRuntime[slotIndex] = this.createQuickSlotStatus(itemId);
    }
    const status = this.quickSlotRuntime[slotIndex];
    status.itemId = itemId ?? status.itemId ?? null;
    status.cooldownRemaining = clamped;
    status.cooldownTotal = clamped;
  }

  initializeUIBridge() {
    this.events.on("ui-options-change", this.applyOptionsPatch, this);
    this.events.on("ui-assign-quick-slot", this.handleQuickSlotAssignment, this);
    this.events.on("ui-close-panel", this.handleUIClosePanel, this);
    this.events.on("ui-rebind-action", this.handleRebindAction, this);
    this.events.on("ui-reset-bindings", this.handleResetBindings, this);

    this.events.on("ui-request-reset", this.handleUIResetRequest, this);

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
    this.updateQuickSlotCooldowns(delta);
    this.primaryAttackCooldown = Math.max(0, this.primaryAttackCooldown - delta);
    this.secondaryAttackCooldown = Math.max(0, this.secondaryAttackCooldown - delta);

    if (!this.menuOpen) {
      this.handleQuickSlotInput();
      this.handleCombatInput();
    }

    this.mobSpawner?.update(time, delta);
    this.updateProjectiles();
    this.handleMobInteractions();
    this.pruneLootDrops();
    this.handleLootInteractions();
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

  handleQuickSlotInput() {
    if (!this.inputManager || !this.player) {
      return;
    }
    for (let i = 0; i < QUICK_SLOT_INPUTS.length; i += 1) {
      const mapping = QUICK_SLOT_INPUTS[i];
      if (!mapping) {
        continue;
      }
      if (this.inputManager.wasJustPressed(mapping.action)) {
        this.activateQuickSlot(mapping.index);
      }
    }
  }

  updateQuickSlotCooldowns(delta) {
    if (!Array.isArray(this.quickSlotRuntime) || !this.quickSlotRuntime.length) {
      return;
    }
    let changed = false;
    this.quickSlotRuntime.forEach((status) => {
      if (!status || status.cooldownRemaining <= 0) {
        return;
      }
      const before = status.cooldownRemaining;
      status.cooldownRemaining = Math.max(0, before - delta);
      if (status.cooldownRemaining !== before) {
        changed = true;
      }
    });
    if (changed) {
      this.quickSlotsDirty = true;
    }
  }

  activateQuickSlot(slotIndex) {
    if (typeof slotIndex !== "number" || slotIndex < 0 || slotIndex >= this.quickSlots.length) {
      return false;
    }
    const slot = this.quickSlots[slotIndex];
    if (!slot || !slot.itemId) {
      return false;
    }
    const status = this.quickSlotRuntime?.[slotIndex];
    if (status && status.cooldownRemaining > 0) {
      return false;
    }

    const item = this.inventory.find((entry) => entry.id === slot.itemId);
    if (!item || item.quantity <= 0) {
      this.quickSlots[slotIndex] = { index: slotIndex, itemId: null };
      this.resetQuickSlotStatus(slotIndex, null);
      this.quickSlotsDirty = true;
      this.syncUI(true);
      return false;
    }

    if (item.usable === false) {
      return false;
    }

    const definition = getItemDefinition(item.id);
    const outcome = this.executeQuickSlotEffect(slotIndex, item, definition);
    if (!outcome || outcome.consumed !== true) {
      return false;
    }

    const quantitySpent = Math.max(1, outcome.quantitySpent || 1);
    item.quantity = Math.max(0, item.quantity - quantitySpent);

    const cooldownMs = outcome.cooldownMs ?? definition?.cooldownMs ?? item.cooldownMs ?? 0;

    if (item.quantity <= 0) {
      this.quickSlots[slotIndex] = { index: slotIndex, itemId: null };
      this.resetQuickSlotStatus(slotIndex, null);
    } else if (cooldownMs > 0) {
      this.setQuickSlotCooldown(slotIndex, item.id, cooldownMs);
    } else {
      this.resetQuickSlotStatus(slotIndex, item.id);
    }

    this.inventoryDirty = true;
    this.quickSlotsDirty = true;
    this.markProgressDirty(`quickslot-${item.id}`);
    this.syncUI(true);
    return true;
  }

  executeQuickSlotEffect(slotIndex, item, definition) {
    if (!item) {
      return { consumed: false };
    }
    const effect = definition?.effect;
    if (!effect) {
      return { consumed: true, quantitySpent: 1, cooldownMs: definition?.cooldownMs ?? item.cooldownMs ?? 0 };
    }
    switch (effect.type) {
      case "heal-over-time": {
        this.applyHealOverTime(effect.total ?? 0, effect.durationMs ?? 0, effect.ticks ?? 4);
        return { consumed: true, quantitySpent: 1, cooldownMs: definition?.cooldownMs ?? item.cooldownMs ?? 0 };
      }
      case "restore-mp": {
        this.applyManaRestore(effect.amount ?? 0);
        return { consumed: true, quantitySpent: 1, cooldownMs: definition?.cooldownMs ?? item.cooldownMs ?? 0 };
      }
      case "wingburst": {
        this.applyWingburst(effect.durationMs ?? 8000, effect.charges ?? 1);
        return { consumed: true, quantitySpent: 1, cooldownMs: definition?.cooldownMs ?? item.cooldownMs ?? 0 };
      }
      default:
        return { consumed: true, quantitySpent: 1, cooldownMs: definition?.cooldownMs ?? item.cooldownMs ?? 0 };
    }
  }

  applyHealOverTime(totalAmount, durationMs, ticks) {
    if (!this.player) {
      return;
    }
    const total = Math.max(0, totalAmount);
    const tickCount = Math.max(1, Math.round(ticks));
    const interval = durationMs > 0 ? durationMs / tickCount : 0;
    const healPerTick = total / tickCount;

    for (let i = 0; i < tickCount; i += 1) {
      const delay = Math.round(interval * i);
      this.time.delayedCall(delay, () => {
        if (!this.player) {
          return;
        }
        const before = this.player.stats.hp;
        this.player.stats.heal(healPerTick);
        const healed = Math.round(this.player.stats.hp - before);
        if (healed > 0) {
          this.spawnDamageNumber(this.player.x, this.player.y - 40, `+${healed}`, "#9bffb0");
        }
      });
    }
  }

  applyManaRestore(amount) {
    if (!this.player) {
      return;
    }
    const restored = this.player.stats.restoreMp(amount);
    if (restored > 0) {
      const gained = Math.round(restored);
      this.spawnDamageNumber(this.player.x, this.player.y - 52, `+${gained} MP`, "#84c1ff");
    }
  }

  applyWingburst(durationMs, charges) {
    if (!this.player) {
      return;
    }
    this.player.grantWingburst(durationMs, charges);
    if (durationMs > 0) {
      this.spawnDamageNumber(this.player.x, this.player.y - 72, "Wingburst!", "#ffe17a");
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
      this.resetQuickSlotStatus(slotIndex, null);
      this.quickSlotsDirty = true;
      this.markProgressDirty("quickslot");
      this.syncUI(true);
      return;
    }
    const item = this.inventory.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }
    if (item.usable === false) {
      return;
    }
    this.quickSlots[slotIndex] = { index: slotIndex, itemId };
    this.resetQuickSlotStatus(slotIndex, itemId);
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

  handleUIResetRequest() {
    if (this.resetQueued) {
      return;
    }
    this.resetQueued = true;

    let status = "reset";
    const timestamp = Date.now();
    if (this.saveManager) {
      const cleared = this.saveManager.clear();
      if (!this.saveManager.isAvailable()) {
        status = "disabled";
      } else if (!cleared) {
        status = "error";
      }
    }

    this.saveDirty = false;
    this.saveCooldown = 0;
    this.autoSaveTimer = 0;
    this.lastSaveReason = status === "reset" ? "reset" : status === "disabled" ? "storage-disabled" : "reset-failed";
    this.lastSaveStatus = { state: status, timestamp };
    this.menuState.inventoryOpen = false;
    this.menuState.optionsOpen = false;
    this.menuOpen = false;
    if (this.player) {
      this.player.setInputEnabled(false);
    }
    if (this.audio) {
      this.audio.stopBgm({ fadeOut: 120 });
    }

    this.systemDirty = true;
    this.syncUI(true);

    this.time.delayedCall(180, () => {
      if (this.scene.isActive && this.scene.isActive("UIScene")) {
        this.scene.stop("UIScene");
      }
      this.scene.restart();
    });
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
    return this.quickSlots.map((slot, index) => {
      const item = slot.itemId ? this.inventory.find((entry) => entry.id === slot.itemId) : null;
      const definition = slot.itemId ? getItemDefinition(slot.itemId) : null;
      const runtime = this.quickSlotRuntime?.[index] || null;
      const cooldownTotal = runtime?.cooldownTotal ?? item?.cooldownMs ?? definition?.cooldownMs ?? 0;
      return {
        index: slot.index,
        itemId: slot.itemId,
        name: item?.name ?? null,
        quantity: item?.quantity ?? 0,
        iconKey: item?.iconKey ?? definition?.iconKey ?? null,
        cooldownRemaining: Math.max(0, runtime?.cooldownRemaining ?? 0),
        cooldownTotal: Math.max(0, cooldownTotal),
        usable: item ? item.usable !== false : definition ? definition.usable !== false : false
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
    let lootActive = 0;
    if (this.lootDrops && this.lootDrops.size) {
      this.lootDrops.forEach((drop) => {
        if (drop?.active) {
          lootActive += 1;
        }
      });
    }

    return {
      fps: this.game.loop.actualFps || 0,
      frameTime: this.lastFrameTime,
      objects,
      mobsActive,
      mobsVisible,
      projectiles: projectileCount,
      loot: lootActive,
      pools: {
        projectile: this.projectilePool
          ? { live: this.projectilePool.getLiveCount(), free: this.projectilePool.getFreeCount() }
          : null,
        damageText: this.damageTextPool
          ? { live: this.damageTextPool.getLiveCount(), free: this.damageTextPool.getFreeCount() }
          : null,
        loot: this.lootPool
          ? { live: this.lootPool.getLiveCount(), free: this.lootPool.getFreeCount() }
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

    if (this.primaryAttackCooldown <= 0 && this.inputManager.wasJustPressed(INPUT_KEYS.ATTACK_PRIMARY)) {
      this.doMelee();
      this.primaryAttackCooldown = ATTACK_COOLDOWN_MS;
    }
    if (this.secondaryAttackCooldown <= 0 && this.inputManager.wasJustPressed(INPUT_KEYS.ATTACK_SECONDARY)) {
      this.fireProjectile();
      this.secondaryAttackCooldown = ATTACK_COOLDOWN_MS;
    }
  }

  doMelee() {
    const dir = this.player.facing >= 0 ? 1 : -1;
    const playerBounds = this.player.getBounds();
    const frontX = dir > 0 ? playerBounds.right : playerBounds.left;
    const centerY = playerBounds.centerY - 6;
    const hitWidth = 64;
    const hitHeight = 48;
    const hitRectX = dir > 0 ? frontX : frontX - hitWidth;
    const hitRect = new Phaser.Geom.Rectangle(hitRectX, centerY - hitHeight / 2, hitWidth, hitHeight);

    const swing = this.add.graphics();
    swing.setDepth(50);
    const baseX = dir > 0 ? frontX + 8 : frontX - 8;
    const tipX = dir > 0 ? frontX + hitWidth + 18 : frontX - hitWidth - 18;
    const topY = centerY - hitHeight / 2;
    const bottomY = centerY + hitHeight / 2;
    swing.fillStyle(0xffc977, 0.9);
    swing.fillTriangle(baseX, topY, baseX, bottomY, tipX, centerY);
    swing.lineStyle(2, 0xfff0c1, 0.95);
    swing.strokeTriangle(baseX, topY, baseX, bottomY, tipX, centerY);
    this.tweens.add({ targets: swing, alpha: 0, duration: 140, onComplete: () => swing.destroy() });

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

  pruneLootDrops() {
    if (!this.lootDrops || this.lootDrops.size === 0) {
      return;
    }
    const limitY = this.map ? this.map.heightInPixels + 160 : Number.POSITIVE_INFINITY;
    const pending = [];
    this.lootDrops.forEach((drop) => {
      if (!drop || !drop.active || !drop.visible) {
        pending.push(drop);
        return;
      }
      if (drop.y > limitY) {
        pending.push(drop);
      }
    });
    pending.forEach((drop) => this.releaseLootDrop(drop));
  }

  handleLootInteractions() {
    if (!this.player || !this.inputManager) {
      return;
    }
    if (!this.lootDrops || this.lootDrops.size === 0) {
      if (this.focusedLootDrop) {
        this.focusedLootDrop.setHighlight?.(false);
        this.focusedLootDrop = null;
      }
      return;
    }

    let closest = null;
    let closestDist = Infinity;
    this.lootDrops.forEach((drop) => {
      if (!drop || !drop.active) {
        return;
      }
      const radius = drop.pickupRadius ?? 72;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, drop.x, drop.y);
      if (dist <= radius && dist < closestDist) {
        closest = drop;
        closestDist = dist;
      }
    });

    if (this.focusedLootDrop && this.focusedLootDrop !== closest) {
      this.focusedLootDrop.setHighlight?.(false);
      this.focusedLootDrop = null;
    }

    if (!closest) {
      return;
    }

    if (closest !== this.focusedLootDrop) {
      closest.setHighlight?.(true);
      this.focusedLootDrop = closest;
    }

    if (this.menuOpen) {
      return;
    }

    if (this.inputManager.wasJustPressed(INPUT_KEYS.INTERACT)) {
      this.collectLootDrop(closest);
    }
  }

  collectLootDrop(drop) {
    if (!drop || !drop.active) {
      return false;
    }
    const itemId = drop.itemId || null;
    const quantity = Math.max(1, Math.round(drop.quantity || 1));
    const px = drop.x;
    const py = drop.y;
    const definition = itemId ? getItemDefinition(itemId) : null;

    this.releaseLootDrop(drop);

    if (!itemId) {
      return false;
    }

    const granted = this.grantInventoryItem(itemId, quantity);
    if (granted) {
      const label = definition?.name ? `+${quantity} ${definition.name}` : `+${quantity}`;
      this.spawnDamageNumber(px, py - 20, label, "#8fe8a8");
      return true;
    }
    return false;
  }

  releaseLootDrop(drop) {
    if (!drop) {
      return;
    }
    if (drop.setHighlight) {
      drop.setHighlight(false);
    }
    if (this.focusedLootDrop === drop) {
      this.focusedLootDrop = null;
    }
    if (this.lootDrops) {
      this.lootDrops.delete(drop);
    }
    if (this.lootPool) {
      this.lootPool.release(drop);
    } else if (drop.resetState) {
      drop.resetState();
    } else if (drop.destroy) {
      drop.destroy();
    }
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
    const dropInfo = this.rollMobLoot();
    if (!dropInfo || !dropInfo.itemId) {
      return;
    }
    const drop = this.lootPool.obtain();
    drop.spawn(dropInfo.itemId, dropInfo.quantity ?? 1, x, y);
    this.lootDrops.add(drop);
  }

  rollMobLoot() {
    const itemId = "ember_shard";
    const quantity = Phaser.Math.FloatBetween(0, 1) > 0.85 ? 2 : 1;
    return { itemId, quantity };
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
      this.lootPool.forEachLive((drop) => drop.destroy());
      this.lootPool.free.forEach((drop) => drop.destroy());
      this.lootPool = null;
    }
    if (this.lootDrops) {
      this.lootDrops.clear();
    }
    this.focusedLootDrop = null;
    if (this.scene.isActive && this.scene.isActive("UIScene")) {
      this.scene.stop("UIScene");
    }
    this.events.off("ui-options-change", this.applyOptionsPatch, this);
    this.events.off("ui-assign-quick-slot", this.handleQuickSlotAssignment, this);
    this.events.off("ui-close-panel", this.handleUIClosePanel, this);
    this.events.off("ui-rebind-action", this.handleRebindAction, this);
    this.events.off("ui-reset-bindings", this.handleResetBindings, this);
    this.events.off("ui-request-reset", this.handleUIResetRequest, this);

    this.events.off("ui-ready", this.handleUIReady, this);
    this.audio = null;
    this.saveManager = null;
    this.restoredData = null;
  }
}
