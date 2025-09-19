export default class CombatStats {
  constructor({ maxHP = 100, maxMP = 50 } = {}) {
    this.maxHP = maxHP;
    this.maxMP = maxMP;
    this.hp = maxHP;
    this.mp = maxMP;
    this.invulnerableTimer = 0;
  }

  update(delta) {
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - delta);
    }
  }

  isInvulnerable() {
    return this.invulnerableTimer > 0;
  }

  isDead() {
    return this.hp <= 0;
  }

  takeDamage(amount, iFrameMs = 320) {
    if (this.isInvulnerable()) {
      return false;
    }
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerableTimer = iFrameMs;
    return true;
  }

  heal(amount) {
    this.hp = Math.min(this.maxHP, this.hp + amount);
  }

  restoreMp(amount) {
    const delta = Number.isFinite(amount) ? amount : 0;
    if (delta <= 0) {
      return 0;
    }
    const before = this.mp;
    this.mp = Math.min(this.maxMP, this.mp + delta);
    return this.mp - before;
  }

  reset() {
    this.hp = this.maxHP;
    this.mp = this.maxMP;
    this.invulnerableTimer = 0;
  }
}
