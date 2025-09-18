import Phaser from "../phaser.js";
import { isDebugHudVisible, setDebugHudVisible } from "../config/graphics.js";

class DebugToggle extends Phaser.Events.EventEmitter {
  constructor() {
    super();
    this.enabled = isDebugHudVisible();
    this.boundScenes = new Map();
  }

  bind(scene) {
    if (!scene || this.boundScenes.has(scene)) {
      return;
    }
    const keyboard = scene.input?.keyboard;
    if (!keyboard) {
      return;
    }
    const handleToggle = () => {
      this.toggle();
    };
    const handleShutdown = () => {
      this.unbind(scene);
    };

    keyboard.on("keydown-F1", handleToggle);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, handleShutdown);

    this.boundScenes.set(scene, { handleToggle, handleShutdown });
    this.emit("changed", this.enabled, scene);
  }

  unbind(scene) {
    const entry = this.boundScenes.get(scene);
    if (!entry) {
      return;
    }
    const keyboard = scene.input?.keyboard;
    if (keyboard) {
      keyboard.off("keydown-F1", entry.handleToggle);
    }
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, entry.handleShutdown);
    this.boundScenes.delete(scene);
  }

  setEnabled(value) {
    const normalized = Boolean(value);
    if (normalized === this.enabled) {
      return normalized;
    }
    this.enabled = normalized;
    setDebugHudVisible(this.enabled);
    this.emit("changed", this.enabled);
    return this.enabled;
  }

  toggle() {
    return this.setEnabled(!this.enabled);
  }

  getEnabled() {
    return this.enabled;
  }

  destroy() {
    Array.from(this.boundScenes.keys()).forEach((scene) => this.unbind(scene));
    this.removeAllListeners();
  }
}

const debugToggle = new DebugToggle();

export default debugToggle;
