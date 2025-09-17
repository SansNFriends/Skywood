import Pool from "../systems/Pool.js";
import Mob from "../entities/Mob.js";

const DEFAULT_OPTIONS = {
  spawnX: 400,
  spawnY: 300,
  maxCount: 4,
  delay: 2500,
  patrolSpacing: 140
};

const MOB_CATEGORY = 0x0004;
const TERRAIN_CATEGORY = 0x0002;

export default class Spawner {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.pool = new Pool(() => this.createMob(), (mob) => mob.sleepOffscreen());
    this.activeMobs = new Set();
    this.timer = 0;
  }

  createMob() {
    const mob = new Mob(this.scene, this.options.spawnX, this.options.spawnY);
    if (mob.body) {
      mob.body.collisionFilter.category = MOB_CATEGORY;
      mob.body.collisionFilter.mask = TERRAIN_CATEGORY;
    }
    if (!mob.__spawnerHooked) {
      mob.on("dead", () => this.despawn(mob));
      mob.__spawnerHooked = true;
    }
    mob.sleepOffscreen();
    return mob;
  }

  update(time, delta) {
    this.timer -= delta;
    if (this.timer <= 0) {
      this.spawnIfNeeded();
      this.timer = this.options.delay;
    }

    [...this.activeMobs].forEach((mob) => {
      if (!mob.active) {
        this.activeMobs.delete(mob);
        return;
      }
      mob.update(time, delta);
      if (mob.y > this.scene.map.heightInPixels + 200) {
        this.despawn(mob);
      }
    });
  }

  spawnIfNeeded() {
    this.activeMobs = new Set([...this.activeMobs].filter((mob) => mob.active));
    if (this.activeMobs.size >= this.options.maxCount) {
      return;
    }

    const mob = this.pool.obtain();
    const offset = this.activeMobs.size % 2 === 0 ? 0 : this.options.patrolSpacing;
    const spawnX = this.options.spawnX + (this.activeMobs.size % 2 === 0 ? -offset : offset);
    mob.revive(spawnX, this.options.spawnY);
    mob.setPatrolBounds(
      spawnX - this.options.patrolSpacing * 0.5,
      spawnX + this.options.patrolSpacing * 0.5
    );
    if (this.scene.player) {
      mob.setTarget(this.scene.player);
    }
    this.activeMobs.add(mob);
  }

  despawn(mob) {
    mob.sleepOffscreen();
    this.pool.release(mob);
    this.activeMobs.delete(mob);
  }

  getActiveMobs() {
    return [...this.activeMobs];
  }
}
