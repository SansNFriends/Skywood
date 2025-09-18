import Phaser from "../phaser.js";

export const INPUT_KEYS = Object.freeze({
  LEFT: "move-left",
  RIGHT: "move-right",
  UP: "move-up",
  DOWN: "move-down",
  JUMP: "jump",
  DASH: "dash",
  ATTACK_PRIMARY: "attack-primary",
  ATTACK_SECONDARY: "attack-secondary",
  INTERACT: "interact",
  INVENTORY: "inventory",
  OPTIONS: "options"
});

const DEFAULT_KEYMAP = {
  [INPUT_KEYS.LEFT]: ["LEFT", "A"],
  [INPUT_KEYS.RIGHT]: ["RIGHT", "D"],
  [INPUT_KEYS.UP]: ["UP", "W"],
  [INPUT_KEYS.DOWN]: ["DOWN", "S"],
  [INPUT_KEYS.JUMP]: ["SPACE", "W"],
  [INPUT_KEYS.DASH]: ["SHIFT"],
  [INPUT_KEYS.ATTACK_PRIMARY]: ["J"],
  [INPUT_KEYS.ATTACK_SECONDARY]: ["K"],
  [INPUT_KEYS.INTERACT]: ["E"],
  [INPUT_KEYS.INVENTORY]: ["I"],
  [INPUT_KEYS.OPTIONS]: ["O"]
};

const keyStateCache = new Map();

const KEYCODE_TO_NAME = Object.entries(Phaser.Input.Keyboard.KeyCodes).reduce((acc, [name, code]) => {
  if (typeof code === "number" && acc[code] === undefined) {
    acc[code] = name;
  }
  return acc;
}, {});

const SPECIAL_KEY_LABELS = {
  SPACE: "Space",
  ESC: "Esc",
  ESCAPE: "Esc",
  LEFT: "Left",
  RIGHT: "Right",
  UP: "Up",
  DOWN: "Down",
  PAGE_UP: "Page Up",
  PAGE_DOWN: "Page Down",
  PRINT_SCREEN: "Print Screen"
};

function resolveKeyCode(code) {
  if (typeof code === "number") {
    return code;
  }
  const keyCode = Phaser.Input.Keyboard.KeyCodes[code.toUpperCase()];
  return keyCode ?? code;
}

function formatKeyLabel(code) {
  if (typeof code !== "number") {
    return String(code);
  }
  const name = KEYCODE_TO_NAME[code];
  if (!name) {
    return `Key ${code}`;
  }
  if (SPECIAL_KEY_LABELS[name]) {
    return SPECIAL_KEY_LABELS[name];
  }
  return name
    .split("_")
    .map((segment) => segment.charAt(0) + segment.slice(1).toLowerCase())
    .join(" ");
}

export default class InputManager {
  constructor(scene) {
    this.scene = scene;
    this.keyboard = scene.input.keyboard;
    this.bindings = new Map();
    this.bindingCodes = new Map();
    this.justPressed = new Set();
    this.justReleased = new Set();

    this.handleUpdate = this.handleUpdate.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.handleFocus = this.handleFocus.bind(this);

    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.handleUpdate, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.game.events.on(Phaser.Core.Events.BLUR, this.handleBlur, this);
    this.scene.game.events.on(Phaser.Core.Events.FOCUS, this.handleFocus, this);

    this.installDefaults();
  }

  installDefaults() {
    this.resetAllBindings();
  }

  handleUpdate() {
    this.justPressed.clear();
    this.justReleased.clear();

    this.bindings.forEach((keys, action) => {
      const pressed = keys.some((key) => key.isDown);
      const justDown = keys.some((key) => Phaser.Input.Keyboard.JustDown(key));
      const justUp = keys.some((key) => Phaser.Input.Keyboard.JustUp(key));

      if (justDown) {
        this.justPressed.add(action);
      }
      if (justUp) {
        this.justReleased.add(action);
      }

      keyStateCache.set(action, pressed);
    });
  }

  handleBlur() {
    this.resetKeys();
  }

  handleFocus() {
    this.resetKeys();
  }

  resetKeys() {
    this.bindings.forEach((keys, action) => {
      keys.forEach((key) => key.reset());
      keyStateCache.set(action, false);
    });
    this.justPressed.clear();
    this.justReleased.clear();
  }

  isDown(action) {
    return keyStateCache.get(action) ?? false;
  }

  wasJustPressed(action) {
    return this.justPressed.has(action);
  }

  wasJustReleased(action) {
    return this.justReleased.has(action);
  }

  resetAll() {
    this.resetKeys();
  }

  setBinding(action, codes) {
    const uniqueCodes = Array.from(
      new Set(
        (codes || [])
          .map((code) => resolveKeyCode(code))
          .filter((value) => typeof value === "number" && Number.isFinite(value))
      )
    );

    const existing = this.bindings.get(action);
    if (existing) {
      existing.forEach((key) => key.destroy());
    }

    const keyObjects = uniqueCodes.map((code) => this.keyboard.addKey(code));
    this.bindings.set(action, keyObjects);
    this.bindingCodes.set(action, uniqueCodes);
    keyStateCache.set(action, false);
    this.justPressed.delete(action);
    this.justReleased.delete(action);
  }

  rebindAction(action, primaryCode) {
    if (!action) {
      return false;
    }
    const resolved = resolveKeyCode(primaryCode);
    if (typeof resolved !== "number" || !Number.isFinite(resolved)) {
      return false;
    }

    const defaults = DEFAULT_KEYMAP[action] ?? [];
    const fallback = defaults.slice(1);
    this.setBinding(action, [resolved, ...fallback]);
    return true;
  }

  getBindingSnapshot() {
    return Array.from(this.bindingCodes.entries()).map(([action, codes]) => ({
      action,
      codes: [...codes],
      labels: codes.map((code) => formatKeyLabel(code))
    }));
  }


  resetBindingsToDefault(action) {
    if (!action || !DEFAULT_KEYMAP[action]) {
      return false;
    }
    this.setBinding(action, DEFAULT_KEYMAP[action]);
    return true;
  }

  resetAllBindings() {
    this.bindings.forEach((keys) => keys.forEach((key) => key.destroy()));
    this.bindings.clear();
    this.bindingCodes.clear();
    keyStateCache.clear();
    this.justPressed.clear();
    this.justReleased.clear();

    Object.entries(DEFAULT_KEYMAP).forEach(([action, keys]) => {
      this.setBinding(action, keys);
    });
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.handleUpdate, this);
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.handleBlur, this);
    this.scene.game.events.off(Phaser.Core.Events.FOCUS, this.handleFocus, this);
    this.bindings.forEach((keys) => keys.forEach((key) => key.destroy()));
    this.bindings.clear();
    this.bindingCodes.clear();
    keyStateCache.clear();
  }
}
