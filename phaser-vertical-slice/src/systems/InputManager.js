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

function resolveKeyCode(code) {
  if (typeof code === "number") {
    return code;
  }
  const keyCode = Phaser.Input.Keyboard.KeyCodes[code.toUpperCase()];
  return keyCode ?? code;
}

export default class InputManager {
  constructor(scene) {
    this.scene = scene;
    this.keyboard = scene.input.keyboard;
    this.bindings = new Map();
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
    Object.entries(DEFAULT_KEYMAP).forEach(([action, keys]) => {
      const keyObjects = keys.map((code) => this.keyboard.addKey(resolveKeyCode(code)));
      this.bindings.set(action, keyObjects);
      keyStateCache.set(action, false);
    });
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

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.handleUpdate, this);
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.handleBlur, this);
    this.scene.game.events.off(Phaser.Core.Events.FOCUS, this.handleFocus, this);
    this.bindings.forEach((keys) => keys.forEach((key) => key.destroy()));
    this.bindings.clear();
    keyStateCache.clear();
  }
}
