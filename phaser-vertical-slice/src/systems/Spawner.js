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
const CULL_PADDING = 280;

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

    const camera = this.scene.cameras?.main;
    const view = camera ? camera.worldView : null;
    const left = view ? view.x - CULL_PADDING : Number.NEGATIVE_INFINITY;
    const right = view ? view.right + CULL_PADDING : Number.POSITIVE_INFINITY;
    const top = view ? view.y - CULL_PADDING : Number.NEGATIVE_INFINITY;
    const bottom = view ? view.bottom + CULL_PADDING : Number.POSITIVE_INFINITY;

    [...this.activeMobs].forEach((mob) => {
      if (!mob.active) {
        this.activeMobs.delete(mob);
        return;
      }

      const inside = mob.x >= left && mob.x <= right && mob.y >= top && mob.y <= bottom;
      if (!inside) {
        if (!mob.isCulled) {
          mob.isCulled = true;
          mob.setVisible(false);
          mob.setActive(false);
          mob.setAwake(false);
        }
        return;
      }

      if (mob.isCulled) {
        mob.isCulled = false;
        mob.setActive(true);
        mob.setVisible(true);
        mob.setAwake(true);
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

  getManagedCount() {
    return this.activeMobs.size;
  }

  getVisibleCount() {
    let count = 0;
    this.activeMobs.forEach((mob) => {
      if (mob.active && !mob.isCulled) {
        count += 1;
      }
    });
    return count;
  }
}
