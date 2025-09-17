export default class AudioManager {
  constructor(scene) {
    this.scene = scene;
  }

  play(key, spriteKey) {
    if (!this.scene.sound || this.scene.sound.locked) {
      return;
    }
    try {
      if (spriteKey) {
        this.scene.sound.playAudioSprite(key, spriteKey, { volume: 0.6 });
      } else {
        this.scene.sound.play(key, { volume: 0.6 });
      }
    } catch (error) {
      // ignore play failure
    }
  }
}
