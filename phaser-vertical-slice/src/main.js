import Phaser from "./phaser.js";
import BootScene from "./scenes/BootScene.js";
import PreloadScene from "./scenes/PreloadScene.js";
import GameScene from "./scenes/GameScene.js";
import UIScene from "./scenes/UIScene.js";

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;

const config = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: "#2c2c32",
  pixelArt: true,
  roundPixels: true,
  disableContextMenu: true,
  title: "Skywood Legends Slice",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    zoom: 1
  },
  render: {
    antialias: false,
    antialiasGL: false,
    pixelArt: true,
    roundPixels: true,
    powerPreference: "high-performance"
  },
  physics: {
    default: "matter",
    matter: {
      gravity: { y: 2 },
      enableSleeping: false,
      positionIterations: 6,
      velocityIterations: 4,
      debug: false
    }
  },
  fps: {
    target: 60,
    min: 30,
    forceSetTimeOut: false
  },
  scene: [BootScene, PreloadScene, GameScene, UIScene]
};

function bootGame() {
  if (window.__skywoodGame) {
    return;
  }
  window.__skywoodGame = new Phaser.Game(config);
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  bootGame();
} else {
  window.addEventListener("load", bootGame, { once: true });
}


