import Phaser from "../phaser.js";

export default class AudioManager {
  constructor(scene) {
    this.scene = scene;
    this.masterVolume = 0.8;
    this.sfxVolume = 0.9;
    this.bgmVolume = 0.7;
    this.currentBgm = null;

    this.currentBgmKey = null;
    this.bgmTween = null;
    this.duckMultiplier = 1;
    this.focusMuted = false;
    this.pendingUnlockCallback = null;
    // Background music asset is temporarily unavailable; leave playback disabled
    // until a text-based or procedural replacement is supplied.
    this.bgmPlaybackEnabled = false;

    this.handleBlur = this.handleBlur.bind(this);
    this.handleFocus = this.handleFocus.bind(this);
    this.handleScenePause = this.handleScenePause.bind(this);
    this.handleSceneResume = this.handleSceneResume.bind(this);

    this.scene.game.events.on(Phaser.Core.Events.BLUR, this.handleBlur);
    this.scene.game.events.on(Phaser.Core.Events.FOCUS, this.handleFocus);
    this.scene.events.on(Phaser.Scenes.Events.PAUSE, this.handleScenePause, this);
    this.scene.events.on(Phaser.Scenes.Events.RESUME, this.handleSceneResume, this);
    this.scene.events.on(Phaser.Scenes.Events.SLEEP, this.handleScenePause, this);
    this.scene.events.on(Phaser.Scenes.Events.WAKE, this.handleSceneResume, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);

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

    }
    this.updateBgmVolume(240);
  }

  playBgm(key, config = {}) {
    if (!this.scene.sound || !this.bgmPlaybackEnabled) {
      return;
    }

    const cache = this.scene.cache?.audio;
    if (!cache || !cache.exists(key)) {
      console.warn(`[Skywood] BGM '${key}' is not loaded.`);
      return;
    }

    const startPlayback = () => {
      const loop = config.loop !== false;
      const crossFade = Math.max(0, config.crossFade ?? 300);
      const fadeIn = Math.max(0, config.fadeIn ?? 600);
      const startAt = Math.max(0, config.seek ?? 0);

      if (this.currentBgmKey === key && this.currentBgm) {
        if (!this.currentBgm.isPlaying) {
          this.currentBgm.play({ loop, seek: startAt, volume: 0 });
        }
        this.updateBgmVolume(fadeIn);
        return;
      }

      const previous = this.currentBgm;
      if (previous) {
        this.fadeOutSound(previous, crossFade);
      }

      let sound = null;
      try {
        sound = this.scene.sound.add(key, { loop, volume: 0 });
      } catch (error) {
        console.warn(`[Skywood] Failed to start BGM '${key}':`, error);
        return;
      }

      if (!sound) {
        return;
      }

      this.currentBgm = sound;
      this.currentBgmKey = key;
      this.duckMultiplier = 1;

      sound.once(Phaser.Sound.Events.DESTROY, () => {
        if (this.currentBgm === sound) {
          this.currentBgm = null;
          this.currentBgmKey = null;
        }
      });

      try {
        sound.play({ loop, seek: startAt, volume: 0 });
      } catch (error) {
        console.warn(`[Skywood] Unable to play BGM '${key}':`, error);
        sound.destroy();
        if (this.currentBgm === sound) {
          this.currentBgm = null;
          this.currentBgmKey = null;
        }
        return;
      }

      this.updateBgmVolume(fadeIn);
    };

    if (this.scene.sound.locked) {
      this.queueUnlock(startPlayback);
    } else {
      startPlayback();
    }
  }

  stopBgm(options = {}) {
    const sound = this.currentBgm;
    if (!sound) {
      return;
    }

    const fadeOut = Math.max(0, options.fadeOut ?? 260);
    const immediate = options.immediate === true;
    this.clearBgmTween();

    const finalize = () => {
      if (sound.isPlaying || sound.isPaused) {
        sound.stop();
      }
      sound.destroy();
      if (this.currentBgm === sound) {
        this.currentBgm = null;
        this.currentBgmKey = null;
      }
    };

    if (immediate || fadeOut === 0) {
      finalize();
      return;
    }

    this.scene.tweens.add({
      targets: sound,
      volume: 0,
      ease: "Sine.easeIn",
      duration: fadeOut,
      onComplete: finalize
    });
  }

  pauseBgm() {
    if (this.currentBgm && this.currentBgm.isPlaying) {
      this.currentBgm.pause();
    }
  }

  resumeBgm() {
    if (this.currentBgm && this.currentBgm.isPaused) {
      this.currentBgm.resume();
      this.updateBgmVolume(200);
    }
  }

  setDuck(enabled, ratio = 0.5, duration = 200) {
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    this.duckMultiplier = enabled ? clamped : 1;
    this.updateBgmVolume(duration);
  }

  updateBgmVolume(duration = 0) {
    if (!this.currentBgm) {
      return;
    }
    const target = this.focusMuted
      ? 0
      : Phaser.Math.Clamp(this.masterVolume * this.bgmVolume * this.duckMultiplier, 0, 1);
    if (duration > 0) {
      this.fadeBgm(target, duration);
    } else {
      this.clearBgmTween();
      this.currentBgm.setVolume(target);
    }
  }

  fadeBgm(targetVolume, duration = 240) {
    if (!this.currentBgm) {
      return;
    }
    this.clearBgmTween();
    this.bgmTween = this.scene.tweens.add({
      targets: this.currentBgm,
      volume: Phaser.Math.Clamp(targetVolume, 0, 1),
      ease: "Sine.easeInOut",
      duration: Math.max(0, duration),
      onComplete: () => {
        this.bgmTween = null;
      }
    });
  }

  fadeOutSound(sound, duration) {
    if (!sound) {
      return;
    }
    const tweenDuration = Math.max(0, duration);
    if (tweenDuration === 0) {
      if (sound.isPlaying || sound.isPaused) {
        sound.stop();
      }
      sound.destroy();
      return;
    }
    this.scene.tweens.add({
      targets: sound,
      volume: 0,
      ease: "Sine.easeIn",
      duration: tweenDuration,
      onComplete: () => {
        if (sound.isPlaying || sound.isPaused) {
          sound.stop();
        }
        sound.destroy();
      }
    });
  }

  queueUnlock(callback) {
    if (!this.scene.sound) {
      return;
    }
    if (this.pendingUnlockCallback) {
      this.scene.sound.off(Phaser.Sound.Events.UNLOCKED, this.pendingUnlockCallback);
      this.pendingUnlockCallback = null;
    }
    const wrapped = () => {
      this.scene.sound.off(Phaser.Sound.Events.UNLOCKED, wrapped);
      this.pendingUnlockCallback = null;
      callback();
    };
    this.pendingUnlockCallback = wrapped;
    this.scene.sound.once(Phaser.Sound.Events.UNLOCKED, wrapped);
  }

  handleBlur() {
    this.focusMuted = true;
    this.updateBgmVolume(180);
  }

  handleFocus() {
    this.focusMuted = false;
    this.updateBgmVolume(260);
  }

  handleScenePause() {
    this.pauseBgm();
  }

  handleSceneResume() {
    this.resumeBgm();
  }

  clearBgmTween() {
    if (this.bgmTween) {
      this.bgmTween.stop();
      this.bgmTween = null;
    }
  }

  destroy() {
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.handleBlur);
    this.scene.game.events.off(Phaser.Core.Events.FOCUS, this.handleFocus);
    this.scene.events.off(Phaser.Scenes.Events.PAUSE, this.handleScenePause, this);
    this.scene.events.off(Phaser.Scenes.Events.RESUME, this.handleSceneResume, this);
    this.scene.events.off(Phaser.Scenes.Events.SLEEP, this.handleScenePause, this);
    this.scene.events.off(Phaser.Scenes.Events.WAKE, this.handleSceneResume, this);
    if (this.pendingUnlockCallback) {
      this.scene.sound?.off(Phaser.Sound.Events.UNLOCKED, this.pendingUnlockCallback);
      this.pendingUnlockCallback = null;
    }
    this.clearBgmTween();
    if (this.currentBgm) {
      if (this.currentBgm.isPlaying || this.currentBgm.isPaused) {
        this.currentBgm.stop();
      }
      this.currentBgm.destroy();
      this.currentBgm = null;
      this.currentBgmKey = null;

    }
  }
}
