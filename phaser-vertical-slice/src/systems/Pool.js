export default class Pool {
  constructor(factory, resetter) {
    this.factory = factory;
    this.resetter = resetter;
    this.free = [];
    this.live = new Set();
  }

  obtain(...args) {
    const obj = this.free.pop() || this.factory(...args);
    this.live.add(obj);
    return obj;
  }

  release(obj) {
    if (!obj) return;
    this.live.delete(obj);
    if (this.resetter) this.resetter(obj);
    this.free.push(obj);
  }

  forEachLive(fn) {
    this.live.forEach(fn);
  }
}
