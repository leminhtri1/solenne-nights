// Keyboard and mouse state. Systems ask `input.down('KeyW')` for held keys and
// `input.pressed('KeyF')` for keys pressed since the last frame; mouse movement accumulates
// while the pointer is locked to the canvas.

export class InputControls {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.fresh = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.buttons = 0;
    this.clicked = 0;
    this.enabled = true;
    this.sensitivity = 1;
    addEventListener('keydown', (e) => {
      if (!this.held.has(e.code)) this.fresh.add(e.code);
      this.held.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    addEventListener('blur', () => this.held.clear());
    canvas.addEventListener('mousedown', (e) => {
      this.buttons |= 1 << e.button;
      this.clicked |= 1 << e.button;
      if (document.pointerLockElement !== canvas && this.wantsLock) canvas.requestPointerLock?.();
    });
    addEventListener('mouseup', (e) => { this.buttons &= ~(1 << e.button); });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.wantsLock = true;
  }

  down(code) { return this.enabled && this.held.has(code); }
  pressed(code) { return this.enabled && this.fresh.has(code); }
  mouseHeld(button) { return this.enabled && (this.buttons & (1 << button)) !== 0; }
  mouseClicked(button) { return this.enabled && (this.clicked & (1 << button)) !== 0; }
  /** Axis from two keys (or their arrow equivalents): -1, 0 or 1. */
  axis(neg, pos) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }

  /** Call once per rendered frame after every system has read the input. */
  endFrame() {
    this.fresh.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.clicked = 0;
  }

  releasePointer() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }
}
