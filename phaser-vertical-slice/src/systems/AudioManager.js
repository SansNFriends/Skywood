import Phaser from "../phaser.js";

export default class AudioManager {
  constructor(scene) {
    this.scene = scene;
    this.masterVolume = 0.8;
    this.sfxVolume = 0.9;
    this.bgmVolume = 0.7;
    this.currentBgm = null;
  }

  play(key, spriteKey) {
    if (!this.scene.sound || this.scene.sound.locked) {
      return;
    }
    const volume = Phaser.Math.Clamp(this.masterVolume * this.sfxVolume, 0, 1);
    try {
      if (spriteKey) {
        this.scene.sound.playAudioSprite(key, spriteKey, { volume });
      } else {
        this.scene.sound.play(key, { volume });
      }
    } catch (error) {
      // ignore play failure
    }
  }

  applyMixSettings(patch = {}) {
    if (patch.masterVolume !== undefined) {
      this.masterVolume = Phaser.Math.Clamp(patch.masterVolume, 0, 1);
    }
    if (patch.sfxVolume !== undefined) {
      this.sfxVolume = Phaser.Math.Clamp(patch.sfxVolume, 0, 1);
    }
    if (patch.bgmVolume !== undefined) {
      this.bgmVolume = Phaser.Math.Clamp(patch.bgmVolume, 0, 1);
      if (this.currentBgm) {
        this.currentBgm.setVolume(this.masterVolume * this.bgmVolume);
      }
    }
  }
}
