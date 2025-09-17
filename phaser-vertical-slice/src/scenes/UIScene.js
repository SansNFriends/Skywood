import Phaser from "../phaser.js";

const HUD_DEPTH = 2000;
const QUICK_SLOT_COUNT = 4;
const MINI_MAP_SIZE = { width: 176, height: 112 };

export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: "UIScene" });
    this.gameScene = null;
    this.hud = null;
    this.hpBarWidth = 220;
    this.mpBarWidth = 220;
    this.performanceText = null;
    this.quickSlotContainer = null;
    this.quickSlotVisuals = [];
    this.miniMapContainer = null;
    this.miniMapGraphics = null;
    this.inventoryContainer = null;
    this.inventoryListText = null;
    this.inventoryDetailText = null;
    this.inventoryHintText = null;
    this.inventoryData = [];
    this.inventoryVisible = false;
    this.inventorySelectionIndex = 0;
    this.quickSlotData = [];
    this.optionsContainer = null;
    this.optionsListText = null;
    this.optionsHintText = null;
    this.optionsState = {};
    this.optionsConfig = this.createOptionsConfig();
    this.optionsVisible = false;
    this.optionsSelectionIndex = 0;
    this.navKeys = null;
  }

  init(data) {
    this.gameSceneKey = data?.gameSceneKey ?? "GameScene";
  }

  create() {
    this.cameras.main.setBackgroundColor(0x000000);

    this.gameScene = this.scene.get(this.gameSceneKey);
    if (!this.gameScene) {
      this.gameScene = this.scene.get("GameScene");
    }

    this.createHud();
    this.createPerformanceReadout();
    this.createQuickSlots();
    this.createMiniMap();
    this.createInventoryPanel();
    this.createOptionsPanel();
    this.installInputHandlers();

    this.scene.bringToTop();
    this.bindGameSceneEvents();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    if (this.gameScene?.events) {
      this.gameScene.events.emit("ui-ready");
    }
  }

  bindGameSceneEvents() {
    if (!this.gameScene?.events) {
      return;
    }
    this.gameScene.events.on("ui-state", this.handleStateUpdate, this);
    this.gameScene.events.on("ui-panel", this.handlePanelToggle, this);
    this.gameScene.events.on("ui-menu-state", this.handleMenuState, this);
  }

  createHud() {
    const container = this.add.container(24, 24).setDepth(HUD_DEPTH).setScrollFactor(0);
    const bg = this.add
      .rectangle(0, 0, 260, 96, 0x121625, 0.82)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x2d314a, 0.85);
    container.add(bg);

    const hpLabel = this.add.text(16, 12, "HP", this.getLabelStyle());
    container.add(hpLabel);
    const hpBg = this.add
      .rectangle(16, 36, this.hpBarWidth, 18, 0x1b2133, 0.92)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0xff849d, 0.8);
    container.add(hpBg);
    const hpFill = this.add.rectangle(16, 36, this.hpBarWidth, 14, 0xff5d6c).setOrigin(0, 0.5);
    container.add(hpFill);
    const hpText = this.add.text(16 + this.hpBarWidth + 12, 36, "0 / 0", this.getValueStyle()).setOrigin(0, 0.5);
    container.add(hpText);

    const mpLabel = this.add.text(16, 60, "MP", this.getLabelStyle());
    container.add(mpLabel);
    const mpBg = this.add
      .rectangle(16, 82, this.mpBarWidth, 18, 0x171d2c, 0.92)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x6bb0ff, 0.8);
    container.add(mpBg);
    const mpFill = this.add.rectangle(16, 82, this.mpBarWidth, 14, 0x5aa6ff).setOrigin(0, 0.5);
    container.add(mpFill);
    const mpText = this.add.text(16 + this.mpBarWidth + 12, 82, "0 / 0", this.getValueStyle()).setOrigin(0, 0.5);
    container.add(mpText);

    const dashText = this.add.text(16, 108, "Dash Ready", this.getHintStyle());
    dashText.setAlpha(0.9);
    container.add(dashText);

    this.hud = {
      container,
      hpFill,
      hpText,
      mpFill,
      mpText,
      dashText
    };
  }

  createPerformanceReadout() {
    this.performanceText = this.add
      .text(24, this.scale.height - 140, "", {
        fontFamily: "Rubik, 'Segoe UI', sans-serif",
        fontSize: "16px",
        color: "#d3d7ff"
      })
      .setDepth(HUD_DEPTH)
      .setScrollFactor(0);
  }

  createQuickSlots() {
    const container = this.add.container(this.scale.width * 0.5, this.scale.height - 72).setDepth(HUD_DEPTH).setScrollFactor(0);
    const bg = this.add
      .rectangle(0, 0, 320, 68, 0x121625, 0.78)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x313855, 0.85);
    container.add(bg);

    const spacing = 72;
    const offset = -((QUICK_SLOT_COUNT - 1) * spacing) / 2;
    for (let i = 0; i < QUICK_SLOT_COUNT; i += 1) {
      const slotX = offset + i * spacing;
      const frame = this.add
        .rectangle(slotX, 0, 52, 52, 0x1b2235, 0.9)
        .setOrigin(0.5)
        .setStrokeStyle(1, 0x4d5a7d, 0.9);
      const label = this.add
        .text(slotX, -8, "--", {
          fontFamily: "Rubik, 'Segoe UI', sans-serif",
          fontSize: "16px",
          color: "#f4f5ff"
        })
        .setOrigin(0.5);
      const quantity = this.add
        .text(slotX, 14, "", {
          fontFamily: "Rubik, 'Segoe UI', sans-serif",
          fontSize: "14px",
          color: "#9ba6d1"
        })
        .setOrigin(0.5);
      const hotkey = this.add
        .text(slotX, 24, `${i + 1}`, {
          fontFamily: "Rubik, 'Segoe UI', sans-serif",
          fontSize: "12px",
          color: "#94a0c8"
        })
        .setOrigin(0.5);

      container.add(frame);
      container.add(label);
      container.add(quantity);
      container.add(hotkey);

      this.quickSlotVisuals.push({ frame, label, quantity, hotkey });
    }

    this.quickSlotContainer = container;
  }

  createMiniMap() {
    const container = this.add.container(this.scale.width - 220, 20).setDepth(HUD_DEPTH).setScrollFactor(0);
    const bg = this.add
      .rectangle(0, 0, 200, 156, 0x111523, 0.86)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x2d3955, 0.85);
    const title = this.add.text(12, 10, "Mini-Map", this.getLabelStyle());
    const mapFrame = this.add
      .rectangle(12, 34, MINI_MAP_SIZE.width, MINI_MAP_SIZE.height, 0x0c101c, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x36446b, 0.8);
    const graphics = this.add.graphics().setPosition(12, 34).setDepth(HUD_DEPTH + 1).setScrollFactor(0);

    container.add([bg, title, mapFrame, graphics]);

    this.miniMapContainer = container;
    this.miniMapGraphics = graphics;
  }

  createInventoryPanel() {
    const container = this.add
      .container(this.scale.width * 0.5, this.scale.height * 0.5)
      .setDepth(HUD_DEPTH + 10)
      .setScrollFactor(0)
      .setVisible(false);

    const overlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.55).setOrigin(0.5).setInteractive();
    const panel = this.add
      .rectangle(0, 0, 520, 360, 0x111522, 0.95)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x3a476a, 0.85);
    const title = this.add.text(-220, -150, "Inventory", this.getTitleStyle());
    const list = this.add
      .text(-220, -110, "", {
        fontFamily: "Rubik, 'Segoe UI', sans-serif",
        fontSize: "18px",
        color: "#f2f4ff",
        lineSpacing: 6
      })
      .setOrigin(0, 0);
    const detail = this.add
      .text(-220, 40, "", {
        fontFamily: "Rubik, 'Segoe UI', sans-serif",
        fontSize: "16px",
        color: "#d0d7ff",
        wordWrap: { width: 480 }
      })
      .setOrigin(0, 0);
    const hint = this.add
      .text(-220, 140, "↑↓ 선택 • 1~4 퀵슬롯 지정 • ESC 닫기", this.getHintStyle())
      .setOrigin(0, 0);

    overlay.on("pointerdown", () => {
      this.gameScene?.events.emit("ui-close-panel", { panel: "inventory" });
    });

    container.add([overlay, panel, title, list, detail, hint]);

    this.inventoryContainer = container;
    this.inventoryListText = list;
    this.inventoryDetailText = detail;
    this.inventoryHintText = hint;
  }

  createOptionsPanel() {
    const container = this.add
      .container(this.scale.width * 0.5, this.scale.height * 0.5)
      .setDepth(HUD_DEPTH + 12)
      .setScrollFactor(0)
      .setVisible(false);

    const overlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.55).setOrigin(0.5).setInteractive();
    const panel = this.add
      .rectangle(0, 0, 460, 320, 0x111522, 0.95)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x2f4163, 0.85);
    const title = this.add.text(-200, -130, "Options", this.getTitleStyle());
    const list = this.add
      .text(-200, -90, "", {
        fontFamily: "Rubik, 'Segoe UI', sans-serif",
        fontSize: "18px",
        color: "#f2f4ff",
        lineSpacing: 6
      })
      .setOrigin(0, 0);
    const hint = this.add
      .text(-200, 120, "↑↓ 항목 이동 • ←→ 값 조정 • ESC 닫기", this.getHintStyle())
      .setOrigin(0, 0);

    overlay.on("pointerdown", () => {
      this.gameScene?.events.emit("ui-close-panel", { panel: "options" });
    });

    container.add([overlay, panel, title, list, hint]);

    this.optionsContainer = container;
    this.optionsListText = list;
    this.optionsHintText = hint;
  }

  installInputHandlers() {
    this.navKeys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
      four: Phaser.Input.Keyboard.KeyCodes.FOUR
    });
  }

  update() {
    if (this.inventoryVisible) {
      this.handleInventoryInput();
    }
    if (this.optionsVisible) {
      this.handleOptionsInput();
    }
  }

  handleStateUpdate(payload) {
    if (!payload) {
      return;
    }

    if (payload.hud) {
      this.updateHud(payload.hud);
    }
    if (payload.performance) {
      this.updatePerformance(payload.performance);
    }
    if (payload.quickSlots) {
      this.quickSlotData = payload.quickSlots;
      this.updateQuickSlots();
    }
    if (payload.inventory) {
      this.inventoryData = payload.inventory;
      if (this.inventoryVisible) {
        this.refreshInventoryList();
      }
    }
    if (payload.options) {
      this.optionsState = { ...this.optionsState, ...payload.options };
      if (this.optionsVisible) {
        this.refreshOptionsList();
      }
    }
    if (payload.map) {
      this.updateMiniMap(payload.map);
    }
    if (payload.menu) {
      this.handleMenuState(payload.menu);
      this.syncPanelsFromMenu(payload.menu);
    }
  }

  syncPanelsFromMenu(menuState) {
    if (!menuState) {
      return;
    }

    if (menuState.inventoryOpen !== undefined && this.inventoryContainer) {
      const shouldOpen = Boolean(menuState.inventoryOpen);
      if (this.inventoryVisible !== shouldOpen) {
        this.inventoryVisible = shouldOpen;
        this.inventoryContainer.setVisible(shouldOpen);
        if (shouldOpen) {
          this.inventorySelectionIndex = Phaser.Math.Clamp(
            this.inventorySelectionIndex,
            0,
            Math.max(0, this.inventoryData.length - 1)
          );
          this.refreshInventoryList();
        }
      }
    }

    if (menuState.optionsOpen !== undefined && this.optionsContainer) {
      const shouldOpen = Boolean(menuState.optionsOpen);
      if (this.optionsVisible !== shouldOpen) {
        this.optionsVisible = shouldOpen;
        this.optionsContainer.setVisible(shouldOpen);
        if (shouldOpen) {
          this.refreshOptionsList();
        }
      }
    }
  }

  handlePanelToggle({ panel, open }) {
    if (panel === "inventory") {
      this.inventoryVisible = open;
      this.inventoryContainer.setVisible(open);
      if (open) {
        this.inventorySelectionIndex = Phaser.Math.Clamp(this.inventorySelectionIndex, 0, Math.max(0, this.inventoryData.length - 1));
        this.refreshInventoryList();
      }
    } else if (panel === "options") {
      this.optionsVisible = open;
      this.optionsContainer.setVisible(open);
      if (open) {
        this.refreshOptionsList();
      }
    }
  }

  handleMenuState({ open }) {
    const alpha = open ? 0.45 : 1;
    if (this.hud) {
      this.hud.container.setAlpha(alpha);
    }
    if (this.quickSlotContainer) {
      this.quickSlotContainer.setAlpha(open ? 0.6 : 1);
    }
  }

  updateHud(hudState) {
    const hpRatio = hudState.maxHp > 0 ? Phaser.Math.Clamp(hudState.hp / hudState.maxHp, 0, 1) : 0;
    const mpRatio = hudState.maxMp > 0 ? Phaser.Math.Clamp(hudState.mp / hudState.maxMp, 0, 1) : 0;

    this.hud.hpFill.displayWidth = this.hpBarWidth * hpRatio;
    this.hud.hpText.setText(`${hudState.hp} / ${hudState.maxHp}`);
    this.hud.mpFill.displayWidth = this.mpBarWidth * mpRatio;
    this.hud.mpText.setText(`${hudState.mp} / ${hudState.maxMp}`);
    this.hud.dashText.setText(hudState.dashReady ? "Dash Ready" : `Dash Cooldown ${Math.ceil(hudState.dashCooldown / 60)}f`);
  }

  updatePerformance(performance) {
    const lines = [
      `FPS ${(performance.fps ?? 0).toFixed(0)}`,
      `Frame ${(performance.frameTime ?? 0).toFixed(1)} ms`,
      `Objects ${performance.objects}`,
      `Mobs ${performance.mobs}`,
      `Projectiles ${performance.projectiles}`
    ];
    this.performanceText.setText(lines);
  }

  updateQuickSlots() {
    this.quickSlotVisuals.forEach((visual) => {
      visual.frame.setFillStyle(0x151b2a, 0.8);
      visual.label.setText("--");
      visual.quantity.setText("");
    });

    this.quickSlotData.forEach((slot, index) => {
      const visual = this.quickSlotVisuals[index];
      if (!visual || !slot || !slot.itemId) {
        return;
      }
      visual.frame.setFillStyle(0x1f273a, 0.9);
      const name = slot.name || "--";
      visual.label.setText(name.length > 9 ? `${name.slice(0, 8)}…` : name);
      visual.quantity.setText(slot.quantity > 1 ? `x${slot.quantity}` : "");
    });
  }

  updateMiniMap(mapState) {
    this.miniMapGraphics.clear();
    this.miniMapGraphics.fillStyle(0x0f1423, 0.9);
    this.miniMapGraphics.fillRect(0, 0, MINI_MAP_SIZE.width, MINI_MAP_SIZE.height);

    if (!mapState.width || !mapState.height) {
      return;
    }

    const scale = Math.min(MINI_MAP_SIZE.width / mapState.width, MINI_MAP_SIZE.height / mapState.height);
    const offsetX = (MINI_MAP_SIZE.width - mapState.width * scale) * 0.5;
    const offsetY = (MINI_MAP_SIZE.height - mapState.height * scale) * 0.5;

    const drawPoint = (color, x, y, size = 4) => {
      this.miniMapGraphics.fillStyle(color, 1);
      this.miniMapGraphics.fillRect(offsetX + x * scale - size * 0.5, offsetY + y * scale - size * 0.5, size, size);
    };

    if (mapState.player) {
      drawPoint(0x6cf1ff, mapState.player.x, mapState.player.y, 6);
    }
    if (Array.isArray(mapState.mobs)) {
      mapState.mobs.forEach((mob) => drawPoint(0xff915d, mob.x, mob.y, 4));
    }

    if (mapState.camera) {
      this.miniMapGraphics.lineStyle(1, 0xffffff, 0.7);
      this.miniMapGraphics.strokeRect(
        offsetX + mapState.camera.x * scale,
        offsetY + mapState.camera.y * scale,
        mapState.camera.width * scale,
        mapState.camera.height * scale
      );
    }
  }

  handleInventoryInput() {
    const hasItems = this.inventoryData.length > 0;

    if (hasItems) {
      if (Phaser.Input.Keyboard.JustDown(this.navKeys.up)) {
        this.inventorySelectionIndex = Phaser.Math.Wrap(
          this.inventorySelectionIndex - 1,
          0,
          Math.max(1, this.inventoryData.length)
        );
        this.refreshInventoryList();
      } else if (Phaser.Input.Keyboard.JustDown(this.navKeys.down)) {
        this.inventorySelectionIndex = Phaser.Math.Wrap(
          this.inventorySelectionIndex + 1,
          0,
          Math.max(1, this.inventoryData.length)
        );
        this.refreshInventoryList();
      }

      if (Phaser.Input.Keyboard.JustDown(this.navKeys.one)) {
        this.assignQuickSlot(0);
      } else if (Phaser.Input.Keyboard.JustDown(this.navKeys.two)) {
        this.assignQuickSlot(1);
      } else if (Phaser.Input.Keyboard.JustDown(this.navKeys.three)) {
        this.assignQuickSlot(2);
      } else if (Phaser.Input.Keyboard.JustDown(this.navKeys.four)) {
        this.assignQuickSlot(3);
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.navKeys.esc)) {
      this.gameScene?.events.emit("ui-close-panel", { panel: "inventory" });
    }
  }

  handleOptionsInput() {
    if (Phaser.Input.Keyboard.JustDown(this.navKeys.up)) {
      this.optionsSelectionIndex = Phaser.Math.Wrap(this.optionsSelectionIndex - 1, 0, this.optionsConfig.length);
      this.refreshOptionsList();
    } else if (Phaser.Input.Keyboard.JustDown(this.navKeys.down)) {
      this.optionsSelectionIndex = Phaser.Math.Wrap(this.optionsSelectionIndex + 1, 0, this.optionsConfig.length);
      this.refreshOptionsList();
    }

    if (Phaser.Input.Keyboard.JustDown(this.navKeys.left)) {
      this.modifyOption(-1);
    } else if (Phaser.Input.Keyboard.JustDown(this.navKeys.right)) {
      this.modifyOption(1);
    }

    if (Phaser.Input.Keyboard.JustDown(this.navKeys.esc)) {
      this.gameScene?.events.emit("ui-close-panel", { panel: "options" });
    }
  }

  assignQuickSlot(slotIndex) {
    if (!this.inventoryData.length) {
      return;
    }
    const item = this.inventoryData[this.inventorySelectionIndex];
    if (!item) {
      return;
    }
    this.gameScene?.events.emit("ui-assign-quick-slot", { slotIndex, itemId: item.id });
  }

  modifyOption(direction) {
    const config = this.optionsConfig[this.optionsSelectionIndex];
    if (!config) {
      return;
    }
    const current = this.optionsState?.[config.key];
    let nextValue = current;

    if (config.type === "range") {
      const step = config.step ?? 0.1;
      nextValue = Phaser.Math.Clamp((current ?? config.min) + step * direction, config.min, config.max);
    } else if (config.type === "choice") {
      const list = config.values;
      const currentIndex = Math.max(0, list.indexOf(current ?? list[0]));
      const nextIndex = Phaser.Math.Wrap(currentIndex + direction, 0, list.length);
      nextValue = list[nextIndex];
    }

    this.optionsState = { ...this.optionsState, [config.key]: nextValue };
    this.refreshOptionsList();
    this.gameScene?.events.emit("ui-options-change", { [config.key]: nextValue });
  }

  refreshInventoryList() {
    if (!this.inventoryData.length) {
      this.inventoryListText.setText(["(아이템 없음)"]);
      this.inventoryDetailText.setText("전리품을 획득해 인벤토리를 채우세요.");
      return;
    }

    this.inventorySelectionIndex = Phaser.Math.Clamp(this.inventorySelectionIndex, 0, this.inventoryData.length - 1);

    const quickSlotMap = new Map();
    this.quickSlotData.forEach((slot) => {
      if (slot?.itemId) {
        quickSlotMap.set(slot.itemId, slot.index + 1);
      }
    });

    const lines = this.inventoryData.map((item, index) => {
      const selector = index === this.inventorySelectionIndex ? "▶" : " ";
      const slotTag = quickSlotMap.has(item.id) ? ` [${quickSlotMap.get(item.id)}]` : "";
      return `${selector} ${item.name}${slotTag}  x${item.quantity}`;
    });

    this.inventoryListText.setText(lines);
    const selected = this.inventoryData[this.inventorySelectionIndex];
    this.inventoryDetailText.setText(selected?.description ?? "상세 설명이 없습니다.");
  }

  refreshOptionsList() {
    const lines = this.optionsConfig.map((config, index) => {
      const selector = index === this.optionsSelectionIndex ? "▶" : " ";
      const value = this.formatOptionValue(config);
      return `${selector} ${config.label}: ${value}`;
    });
    this.optionsListText.setText(lines);
  }

  formatOptionValue(config) {
    const value = this.optionsState?.[config.key];
    if (config.type === "range") {
      return `${Math.round((value ?? 0) * 100)}%`;
    }
    if (config.key === "resolutionScale") {
      return `${Math.round((value ?? 1) * 100)}%`;
    }
    return value ?? config.values?.[0];
  }

  createOptionsConfig() {
    return [
      { key: "masterVolume", label: "Master Volume", type: "range", min: 0, max: 1, step: 0.1 },
      { key: "sfxVolume", label: "SFX Volume", type: "range", min: 0, max: 1, step: 0.1 },
      { key: "bgmVolume", label: "BGM Volume", type: "range", min: 0, max: 1, step: 0.1 },
      { key: "resolutionScale", label: "Resolution Scale", type: "range", min: 0.7, max: 1.1, step: 0.05 },
      { key: "graphicsQuality", label: "Graphics Quality", type: "choice", values: ["High", "Performance"] }
    ];
  }

  getLabelStyle() {
    return {
      fontFamily: "Rubik, 'Segoe UI', sans-serif",
      fontSize: "16px",
      color: "#9ca6cf"
    };
  }

  getValueStyle() {
    return {
      fontFamily: "Rubik, 'Segoe UI', sans-serif",
      fontSize: "18px",
      color: "#f5f6ff"
    };
  }

  getHintStyle() {
    return {
      fontFamily: "Rubik, 'Segoe UI', sans-serif",
      fontSize: "14px",
      color: "#9ca6cf"
    };
  }

  getTitleStyle() {
    return {
      fontFamily: "Rubik, 'Segoe UI', sans-serif",
      fontSize: "24px",
      color: "#f7f8ff"
    };
  }

  shutdown() {
    if (this.gameScene?.events) {
      this.gameScene.events.off("ui-state", this.handleStateUpdate, this);
      this.gameScene.events.off("ui-panel", this.handlePanelToggle, this);
      this.gameScene.events.off("ui-menu-state", this.handleMenuState, this);
    }
    this.gameScene = null;
  }
}
