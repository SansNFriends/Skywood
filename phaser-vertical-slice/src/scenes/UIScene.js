import Phaser from "../phaser.js";
import { INPUT_KEYS } from "../systems/InputManager.js";

const HUD_DEPTH = 2000;
const QUICK_SLOT_COUNT = 4;
const MINI_MAP_SIZE = { width: 176, height: 112 };
const OPTIONS_VISIBLE_COUNT = 9;

export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: "UIScene" });
    this.gameSceneKey = "GameScene";
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
    this.optionsScrollOffset = 0;
    this.navKeys = null;
    this.bindingState = [];
    this.bindingLookup = new Map();
    this.bindingListenAction = null;
    this.bindingListenLabel = "";
    this.optionsHintBase = "";
    this.systemStatusText = null;
    this.systemState = { save: { state: "idle", timestamp: 0, dirty: false, reason: "", available: true } };
    this.bugOverlay = null;
    this.bugOverlayText = null;
    this.bugOverlayVisible = false;
    this.bugToggleKey = null;
    this.resetInProgress = false;
  }

  init(data) {
    const providedKey = data && typeof data.gameSceneKey === "string" ? data.gameSceneKey : null;
    this.gameSceneKey = providedKey || "GameScene";
  }

  create() {
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
    this.createSystemBanner();
    this.createBugOverlay();
    this.installInputHandlers();

    this.scene.bringToTop();
    this.bindGameSceneEvents();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    this.emitGameEvent("ui-ready");
  }

  bindGameSceneEvents() {
    if (!this.gameScene || !this.gameScene.events) {
      return;
    }
    this.gameScene.events.on("ui-state", this.handleStateUpdate, this);
    this.gameScene.events.on("ui-panel", this.handlePanelToggle, this);
    this.gameScene.events.on("ui-menu-state", this.handleMenuState, this);
  }

  emitGameEvent(eventName, payload) {
    if (this.gameScene && this.gameScene.events) {
      this.gameScene.events.emit(eventName, payload);
    }
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
      .text(
        -220,
        140,
        "\u2191\u2193 \uc120\ud0dd \u2022 1~4 \ud035\uc2ac\ub86f \uc9c0\uc815 \u2022 ESC \ub2eb\uae30",
        this.getHintStyle()
      )
      .setOrigin(0, 0);

    overlay.on("pointerdown", () => {
      this.emitGameEvent("ui-close-panel", { panel: "inventory" });
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
        fontSize: "16px",
        color: "#f2f4ff",
        lineSpacing: 6
      })
      .setOrigin(0, 0);
    const baseHint =
      "\u2191\u2193 \ud56d\ubaa9 \uc774\ub3d9 \u2022 \u2190\u2192 \uac12 \uc870\uc815 \u2022 Enter \ud0a4 \uc7ac\uc124\uc815 \u2022 ESC \ub2eb\uae30";
    const hint = this.add.text(-200, 120, baseHint, this.getHintStyle()).setOrigin(0, 0);

    overlay.on("pointerdown", () => {
      this.emitGameEvent("ui-close-panel", { panel: "options" });
    });

    container.add([overlay, panel, title, list, hint]);

    this.optionsContainer = container;
    this.optionsListText = list;
    this.optionsHintText = hint;
    this.optionsHintBase = baseHint;
  }

  createSystemBanner() {
    this.systemStatusText = this.add
      .text(24, this.scale.height - 92, "", {
        fontFamily: "Rubik, 'Segoe UI', sans-serif",
        fontSize: "14px",
        color: "#d3d7ff"
      })
      .setDepth(HUD_DEPTH)
      .setScrollFactor(0);
  }

  createBugOverlay() {
    const container = this.add
      .container(this.scale.width * 0.5, this.scale.height * 0.5)
      .setDepth(HUD_DEPTH + 60)
      .setScrollFactor(0)
      .setVisible(false);

    const overlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.68)
      .setOrigin(0.5)
      .setInteractive();

    const panelWidth = Math.min(620, this.scale.width - 80);
    const panelHeight = Math.min(360, this.scale.height - 80);
    const panel = this.add
      .rectangle(0, 0, panelWidth, panelHeight, 0x111522, 0.95)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x3a476a, 0.85);

    const title = this.add.text(0, -panelHeight * 0.5 + 28, "Bug Report Checklist", this.getTitleStyle()).setOrigin(0.5, 0);

    const body = this.add
      .text(
        -panelWidth * 0.5 + 24,
        -panelHeight * 0.5 + 72,
        "",
        {
          fontFamily: "Rubik, 'Segoe UI', sans-serif",
          fontSize: "16px",
          color: "#f2f4ff",
          lineSpacing: 6,
          wordWrap: { width: panelWidth - 48 }
        }
      )
      .setOrigin(0, 0);

    overlay.on("pointerdown", () => {
      this.toggleBugOverlay(false);
    });

    container.add([overlay, panel, title, body]);

    this.bugOverlay = container;
    this.bugOverlayText = body;
  }

  installInputHandlers() {
    this.navKeys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
      four: Phaser.Input.Keyboard.KeyCodes.FOUR
    });
    this.input.keyboard.on("keydown", this.handleGlobalKeydown, this);
    this.input.keyboard.on("keydown-ESC", this.handleEscKey, this);
    this.bugToggleKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F8);
    if (this.bugToggleKey) {
      this.bugToggleKey.on("down", () => {
        this.toggleBugOverlay();
      });
    }
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
    if (payload.bindings) {
      this.setBindingState(payload.bindings);
    }
    if (payload.map) {
      this.updateMiniMap(payload.map);
    }
    if (payload.menu) {
      this.handleMenuState(payload.menu);
      this.syncPanelsFromMenu(payload.menu);
    }
    if (payload.system) {
      this.updateSystemStatus(payload.system);
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
        } else {
          this.cancelBindingCapture();
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
      } else {
        this.cancelBindingCapture();
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

  handleEscKey() {
    if (this.bindingListenAction) {
      return;
    }
    if (this.bugOverlayVisible) {
      this.toggleBugOverlay(false);
    }
  }

  toggleBugOverlay(force) {
    if (!this.bugOverlay) {
      return;
    }
    const target = typeof force === "boolean" ? force : !this.bugOverlayVisible;
    this.bugOverlayVisible = target;
    this.bugOverlay.setVisible(target);
    if (target) {
      this.refreshBugOverlay();
    }
  }

  refreshBugOverlay() {
    if (!this.bugOverlayText) {
      return;
    }
    const save = this.systemState?.save || {};
    const statusLine = (() => {
      if (!save.available) {
        return "⚠ 저장 불가: 브라우저 저장소 접근 차단";
      }
      if (save.state === "error") {
        return "⚠ 저장 실패: 콘솔 오류와 재현 절차를 첨부하세요";
      }
      if (save.state === "success") {
        return `마지막 저장: ${this.formatTimestamp(save.timestamp)}`;
      }
      if (save.dirty) {
        return "저장 대기 중 (잠시 후 자동 저장)";
      }
      return "저장 상태: 대기 중";
    })();

    const lines = [statusLine, ""];
    if (this.resetInProgress) {
      lines.push("• 저장 데이터를 초기화하는 중입니다. 잠시 후 게임이 다시 시작됩니다.");
    } else {
      lines.push("• Shift+R을 눌러 저장 데이터를 삭제하고 처음부터 다시 시작할 수 있습니다.");
    }
    lines.push("• 증상이 발생한 입력/행동 순서를 단계별로 적어주세요.");
    lines.push("• 브라우저, 운영체제, FPS(좌측 상단)을 기록하세요.");
    lines.push("• 개발자 도구 콘솔 오류와 화면 스크린샷을 첨부하면 빠르게 재현할 수 있습니다.");
    lines.push("• F8로 이 패널을 열고 ESC로 닫습니다.");

    this.bugOverlayText.setText(lines.join("\n"));
  }

  requestProgressReset() {
    if (this.resetInProgress) {
      return;
    }
    this.resetInProgress = true;
    if (this.systemStatusText) {
      this.systemStatusText.setText(["저장 초기화를 준비 중...", "F8: 버그 리포트 패널"]);
      this.systemStatusText.setColor("#d3d7ff");
    }
    this.refreshBugOverlay();
    this.emitGameEvent("ui-request-reset");
  }

  updateSystemStatus(system) {
    if (!system) {
      return;
    }
    const mergedSave = { ...this.systemState.save, ...(system.save || {}) };
    this.systemState = { ...this.systemState, ...system, save: mergedSave };

    if (this.systemStatusText) {
      let message = "자동 저장 대기 중";
      let color = "#d3d7ff";
      if (!mergedSave.available) {
        message = "⚠ 저장 불가: 브라우저 저장소 차단";
        color = "#ff9176";
        this.resetInProgress = false;
      } else if (mergedSave.state === "error") {
        message = "⚠ 저장 실패: 콘솔 로그 확인";
        color = "#ff9176";
        this.resetInProgress = false;
      } else if (mergedSave.state === "reset") {
        message = "저장 데이터를 초기화했습니다. 게임이 재시작됩니다...";
        color = "#d3d7ff";
        this.resetInProgress = true;
      } else if (mergedSave.state === "success" && mergedSave.timestamp) {
        message = `저장 완료 ${this.formatTimestamp(mergedSave.timestamp)}`;
        this.resetInProgress = false;
      } else if (mergedSave.dirty) {
        message = "저장 대기 중...";
        this.resetInProgress = false;
      }
      const infoLines = [message, "F8: 버그 리포트 패널"];
      this.systemStatusText.setText(infoLines);
      this.systemStatusText.setColor(color);
    }

    if (this.bugOverlayVisible) {
      this.refreshBugOverlay();
    }
  }

  formatTimestamp(timestamp) {
    if (typeof timestamp !== "number" || Number.isNaN(timestamp) || timestamp <= 0) {
      return "--:--:--";
    }
    try {
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) {
        return "--:--:--";
      }
      return date.toLocaleTimeString("ko-KR", { hour12: false });
    } catch (error) {
      return "--:--:--";
    }
  }

  setBindingState(bindings) {
    if (!Array.isArray(bindings)) {
      this.bindingState = [];
      this.bindingLookup = new Map();
      return;
    }
    this.bindingState = bindings;
    this.bindingLookup = new Map();
    bindings.forEach((entry) => {
      if (entry && entry.action) {
        this.bindingLookup.set(entry.action, entry);
      }
    });
    if (this.optionsVisible) {
      this.refreshOptionsList();
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
    const fps = performance && typeof performance.fps === "number" ? performance.fps : 0;
    const frameTime = performance && typeof performance.frameTime === "number" ? performance.frameTime : 0;
    const objects = performance && typeof performance.objects === "number" ? performance.objects : 0;
    const mobsVisible =
      performance && typeof performance.mobsVisible === "number"
        ? performance.mobsVisible
        : performance && typeof performance.mobs === "number"
          ? performance.mobs
          : 0;
    const mobsActive =
      performance && typeof performance.mobsActive === "number" ? performance.mobsActive : mobsVisible;
    const projectiles =
      performance && typeof performance.projectiles === "number" ? performance.projectiles : 0;
    const projectilePool = performance?.pools?.projectile;
    const textPool = performance?.pools?.damageText;
    const lines = [
      `FPS ${fps.toFixed(0)}`,
      `Frame ${frameTime.toFixed(1)} ms`,
      `Objects ${objects}`,
      `Mobs ${mobsVisible}/${mobsActive}`,
      `Projectiles ${projectiles}`
    ];
    if (projectilePool) {
      const live = typeof projectilePool.live === "number" ? projectilePool.live : 0;
      const free = typeof projectilePool.free === "number" ? projectilePool.free : 0;
      lines.push(`ProjPool ${live}/${free}`);
    }
    if (textPool) {
      const live = typeof textPool.live === "number" ? textPool.live : 0;
      const free = typeof textPool.free === "number" ? textPool.free : 0;
      lines.push(`TextPool ${live}/${free}`);
    }
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
      visual.label.setText(name.length > 9 ? `${name.slice(0, 8)}...` : name);
      visual.quantity.setText(slot.quantity > 1 ? `x${slot.quantity}` : "");
    });
  }

  updateMiniMap(mapState) {
    const graphics = this.miniMapGraphics;
    if (!graphics) {
      return;
    }

    graphics.clear();
    graphics.fillStyle(0x0f1423, 0.9);
    graphics.fillRect(0, 0, MINI_MAP_SIZE.width, MINI_MAP_SIZE.height);

    if (!mapState || !mapState.width || !mapState.height) {
      return;
    }

    const scale = Math.min(MINI_MAP_SIZE.width / mapState.width, MINI_MAP_SIZE.height / mapState.height);
    const offsetX = (MINI_MAP_SIZE.width - mapState.width * scale) * 0.5;
    const offsetY = (MINI_MAP_SIZE.height - mapState.height * scale) * 0.5;

    function drawPoint(color, x, y, size) {
      const pointSize = typeof size === "number" ? size : 4;
      graphics.fillStyle(color, 1);
      graphics.fillRect(
        offsetX + x * scale - pointSize * 0.5,
        offsetY + y * scale - pointSize * 0.5,
        pointSize,
        pointSize
      );
    }

    if (mapState.player) {
      drawPoint(0x6cf1ff, mapState.player.x, mapState.player.y, 6);
    }
    if (Array.isArray(mapState.mobs)) {
      for (let i = 0; i < mapState.mobs.length; i += 1) {
        const mob = mapState.mobs[i];
        if (mob) {
          drawPoint(0xff915d, mob.x, mob.y, 4);
        }
      }
    }

    if (mapState.camera) {
      graphics.lineStyle(1, 0xffffff, 0.7);
      graphics.strokeRect(
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
      this.emitGameEvent("ui-close-panel", { panel: "inventory" });
    }
  }

  handleOptionsInput() {
    if (Phaser.Input.Keyboard.JustDown(this.navKeys.esc)) {
      if (this.bindingListenAction) {
        this.cancelBindingCapture();
      } else {
        this.emitGameEvent("ui-close-panel", { panel: "options" });
      }
      return;
    }

    if (this.bindingListenAction) {
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.navKeys.up)) {
      this.optionsSelectionIndex = Phaser.Math.Wrap(this.optionsSelectionIndex - 1, 0, this.optionsConfig.length);
      this.refreshOptionsList();
    } else if (Phaser.Input.Keyboard.JustDown(this.navKeys.down)) {
      this.optionsSelectionIndex = Phaser.Math.Wrap(this.optionsSelectionIndex + 1, 0, this.optionsConfig.length);
      this.refreshOptionsList();
    }

    const config = this.optionsConfig[this.optionsSelectionIndex];
    if (!config) {
      return;
    }

    if (config.type === "range" || config.type === "choice") {
      if (Phaser.Input.Keyboard.JustDown(this.navKeys.left)) {
        this.modifyOption(-1);
      } else if (Phaser.Input.Keyboard.JustDown(this.navKeys.right)) {
        this.modifyOption(1);
      }
    } else if (config.type === "binding") {
      if (
        Phaser.Input.Keyboard.JustDown(this.navKeys.left) ||
        Phaser.Input.Keyboard.JustDown(this.navKeys.right) ||
        Phaser.Input.Keyboard.JustDown(this.navKeys.enter)
      ) {
        this.beginBindingCapture(config);
      }
    } else if (config.type === "action") {
      if (
        Phaser.Input.Keyboard.JustDown(this.navKeys.left) ||
        Phaser.Input.Keyboard.JustDown(this.navKeys.right) ||
        Phaser.Input.Keyboard.JustDown(this.navKeys.enter)
      ) {
        this.triggerOptionAction(config);
      }
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
    this.emitGameEvent("ui-assign-quick-slot", { slotIndex, itemId: item.id });
  }

  modifyOption(direction) {
    const config = this.optionsConfig[this.optionsSelectionIndex];
    if (!config || (config.type !== "range" && config.type !== "choice")) {
      return;
    }
    const state = this.optionsState || {};
    const hasCurrent = Object.prototype.hasOwnProperty.call(state, config.key);
    const current = hasCurrent ? state[config.key] : undefined;
    let nextValue = current;

    if (config.type === "range") {
      const step = typeof config.step === "number" ? config.step : 0.1;
      const baseValue = typeof current === "number" ? current : config.min;
      nextValue = Phaser.Math.Clamp(baseValue + step * direction, config.min, config.max);
    } else if (config.type === "choice") {
      const list = Array.isArray(config.values) ? config.values : [];
      if (list.length === 0) {
        return;
      }
      const fallback = list[0];
      const currentIndex = Math.max(0, list.indexOf(hasCurrent ? current : fallback));
      const nextIndex = Phaser.Math.Wrap(currentIndex + direction, 0, list.length);
      nextValue = list[nextIndex];
    }

    this.optionsState = Object.assign({}, state, { [config.key]: nextValue });
    this.refreshOptionsList();
    this.emitGameEvent("ui-options-change", { [config.key]: nextValue });
  }

  beginBindingCapture(config) {
    if (!config || !config.action) {
      return;
    }
    this.bindingListenAction = config.action;
    this.bindingListenLabel = config.label ? config.label : config.action;
    if (this.optionsHintText && this.optionsHintBase) {
      this.optionsHintText.setText(
        `${this.bindingListenLabel} - \uc0c8 \ud0a4 \uc785\ub825 (ESC \ucde8\uc18c)`
      );
    }
    this.refreshOptionsList();
  }

  cancelBindingCapture() {
    if (!this.bindingListenAction) {
      return;
    }
    this.bindingListenAction = null;
    this.bindingListenLabel = "";
    if (this.optionsHintText && this.optionsHintBase) {
      this.optionsHintText.setText(this.optionsHintBase);
    }
    this.refreshOptionsList();
  }

  completeBindingCapture(keyCode) {
    const action = this.bindingListenAction;
    if (!action) {
      return;
    }
    this.bindingListenAction = null;
    this.bindingListenLabel = "";
    if (this.optionsHintText && this.optionsHintBase) {
      this.optionsHintText.setText(this.optionsHintBase);
    }
    this.emitGameEvent("ui-rebind-action", { action, keyCode });
    this.refreshOptionsList();
  }

  triggerOptionAction(config) {
    if (!config) {
      return;
    }
    if (config.action === "reset-bindings") {
      this.cancelBindingCapture();
      this.emitGameEvent("ui-reset-bindings");
    }
  }

  handleGlobalKeydown(event) {
    if (event.repeat) {
      return;
    }

    if (this.bugOverlayVisible) {
      const key = typeof event.key === "string" ? event.key.toLowerCase() : "";
      const keyCode = typeof event.keyCode === "number" ? event.keyCode : event.which;
      const isResetKey = key === "r" || keyCode === Phaser.Input.Keyboard.KeyCodes.R;
      if (isResetKey && event.shiftKey) {
        if (typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        if (typeof event.stopPropagation === "function") {
          event.stopPropagation();
        }
        this.requestProgressReset();
        return;
      }
    }

    if (!this.bindingListenAction) {
      return;
    }
    if (event.key === "Escape" || event.key === "Esc") {
      this.cancelBindingCapture();
      return;
    }
    const keyCode = typeof event.keyCode === "number" ? event.keyCode : event.which;
    if (typeof keyCode !== "number" || !Number.isFinite(keyCode)) {
      return;
    }
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    if (typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
    this.completeBindingCapture(keyCode);
  }

  refreshInventoryList() {
    if (!this.inventoryData.length) {
      this.inventoryListText.setText(["(\uc544\uc774\ud15c \uc5c6\uc74c)"]);
      this.inventoryDetailText.setText("\uc804\ub9ac\ud488\uc744 \ud68d\ub4dd\ud574 \uc778\ubca4\ud1a0\ub9ac\ub97c \ucc44\uc6b0\uc138\uc694.");
      return;
    }

    this.inventorySelectionIndex = Phaser.Math.Clamp(this.inventorySelectionIndex, 0, this.inventoryData.length - 1);

    const quickSlotMap = new Map();
    this.quickSlotData.forEach((slot) => {
      if (slot && slot.itemId) {
        quickSlotMap.set(slot.itemId, slot.index + 1);
      }
    });

    const lines = this.inventoryData.map((item, index) => {
      const selector = index === this.inventorySelectionIndex ? "\u25b6" : " ";
      const slotTag = quickSlotMap.has(item.id) ? ` [${quickSlotMap.get(item.id)}]` : "";
      return `${selector} ${item.name}${slotTag}  x${item.quantity}`;
    });

    this.inventoryListText.setText(lines);
    const selected = this.inventoryData[this.inventorySelectionIndex];
    const detailText = selected && selected.description ? selected.description : "\uc0c1\uc138 \uc124\uba85\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.";
    this.inventoryDetailText.setText(detailText);
  }

  ensureOptionsSelectionVisible() {
    const total = Array.isArray(this.optionsConfig) ? this.optionsConfig.length : 0;
    const visibleCount = OPTIONS_VISIBLE_COUNT;
    if (total <= visibleCount) {
      this.optionsScrollOffset = 0;
      return;
    }
    const maxOffset = Math.max(0, total - visibleCount);
    if (this.optionsSelectionIndex < this.optionsScrollOffset) {
      this.optionsScrollOffset = this.optionsSelectionIndex;
    } else if (this.optionsSelectionIndex > this.optionsScrollOffset + visibleCount - 1) {
      this.optionsScrollOffset = this.optionsSelectionIndex - visibleCount + 1;
    }
    this.optionsScrollOffset = Phaser.Math.Clamp(this.optionsScrollOffset, 0, maxOffset);
  }

  refreshOptionsList() {
    if (!this.optionsListText) {
      return;
    }

    this.ensureOptionsSelectionVisible();

    const lines = this.optionsConfig.map((config, index) => {
      const selector = index === this.optionsSelectionIndex ? "\u25b6" : " ";
      if (config.type === "action") {
        const suffix = config.action === "reset-bindings" ? " (Enter)" : "";
        return `${selector} ${config.label}${suffix}`;
      }
      const value = this.formatOptionValue(config);
      return `${selector} ${config.label}: ${value}`;
    });

    const start = this.optionsScrollOffset;
    const end = Math.min(lines.length, start + OPTIONS_VISIBLE_COUNT);
    const visibleLines = lines.slice(start, end);

    if (start > 0) {
      visibleLines.unshift("⋮");
    }
    if (end < lines.length) {
      visibleLines.push("⋮");
    }

    this.optionsListText.setText(visibleLines);
  }

  formatOptionValue(config) {
    if (config.type === "binding") {
      if (this.bindingListenAction === config.action) {
        return "[\uc785\ub825 \ub300\uae30]";
      }
      return this.formatBindingValue(config.action);
    }
    if (config.type === "action") {
      return "";
    }
    const state = this.optionsState || {};
    const hasValue = Object.prototype.hasOwnProperty.call(state, config.key);
    const value = hasValue ? state[config.key] : undefined;
    if (config.type === "range") {
      if (config.key === "resolutionScale") {
        const scale = typeof value === "number" ? value : 1;
        return `${Math.round(scale * 100)}%`;
      }
      const numeric = typeof value === "number" ? value : 0;
      return `${Math.round(numeric * 100)}%`;
    }
    if (config.type === "choice") {
      const list = Array.isArray(config.values) ? config.values : [];
      if (hasValue) {
        return value;
      }
      return list.length > 0 ? list[0] : "";
    }
    if (hasValue && value != null) {
      return value;
    }
    const defaults = Array.isArray(config.values) ? config.values : [];
    return defaults.length > 0 ? defaults[0] : "";
  }

  formatBindingValue(action) {
    if (!action) {
      return "--";
    }
    const entry = this.bindingLookup.get(action);
    if (!entry) {
      return "--";
    }
    if (Array.isArray(entry.labels) && entry.labels.length) {
      return entry.labels.join(" / ");
    }
    if (Array.isArray(entry.codes) && entry.codes.length) {
      return entry.codes.map((code) => String(code)).join(" / ");
    }
    return "--";
  }

  createOptionsConfig() {
    return [
      { key: "masterVolume", label: "Master Volume", type: "range", min: 0, max: 1, step: 0.1 },
      { key: "sfxVolume", label: "SFX Volume", type: "range", min: 0, max: 1, step: 0.1 },
      { key: "bgmVolume", label: "BGM Volume", type: "range", min: 0, max: 1, step: 0.1 },
      { key: "resolutionScale", label: "Resolution Scale", type: "range", min: 0.7, max: 1.1, step: 0.05 },
      { key: "graphicsQuality", label: "Graphics Quality", type: "choice", values: ["High", "Performance"] },
      { key: "bind.moveLeft", label: "Move Left", type: "binding", action: INPUT_KEYS.LEFT },
      { key: "bind.moveRight", label: "Move Right", type: "binding", action: INPUT_KEYS.RIGHT },
      { key: "bind.moveUp", label: "Move Up", type: "binding", action: INPUT_KEYS.UP },
      { key: "bind.moveDown", label: "Move Down", type: "binding", action: INPUT_KEYS.DOWN },
      { key: "bind.jump", label: "Jump", type: "binding", action: INPUT_KEYS.JUMP },
      { key: "bind.dash", label: "Dash", type: "binding", action: INPUT_KEYS.DASH },
      { key: "bind.attackPrimary", label: "Primary Attack", type: "binding", action: INPUT_KEYS.ATTACK_PRIMARY },
      { key: "bind.attackSecondary", label: "Secondary Attack", type: "binding", action: INPUT_KEYS.ATTACK_SECONDARY },
      { key: "bind.interact", label: "Interact", type: "binding", action: INPUT_KEYS.INTERACT },
      { key: "bind.inventory", label: "Inventory Menu", type: "binding", action: INPUT_KEYS.INVENTORY },
      { key: "bind.options", label: "Options Menu", type: "binding", action: INPUT_KEYS.OPTIONS },
      { key: "resetBindings", label: "Reset Key Bindings", type: "action", action: "reset-bindings" }
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
    if (this.gameScene && this.gameScene.events) {
      this.gameScene.events.off("ui-state", this.handleStateUpdate, this);
      this.gameScene.events.off("ui-panel", this.handlePanelToggle, this);
      this.gameScene.events.off("ui-menu-state", this.handleMenuState, this);
    }
    this.cancelBindingCapture();
    if (this.input && this.input.keyboard) {
      this.input.keyboard.off("keydown", this.handleGlobalKeydown, this);
      this.input.keyboard.off("keydown-ESC", this.handleEscKey, this);
    }
    if (this.bugToggleKey) {
      this.bugToggleKey.destroy();
      this.bugToggleKey = null;
    }
    this.gameScene = null;
  }
}
