// A minimal publish/subscribe hub so systems can react to each other (a gunshot scares
// pedestrians and raises the wanted level, a mission finishing pays the player) without
// importing each other.

export class EventBus {
  constructor() { this.handlers = new Map(); }
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) {
    const list = this.handlers.get(type);
    if (list) list.splice(list.indexOf(fn) >>> 0, 1);
  }
  emit(type, payload) {
    const list = this.handlers.get(type);
    if (list) for (const fn of list.slice()) fn(payload);
  }
}
