/**
 * Custom architectural inspection cursor with smooth pointer damping and contextual feedback.
 */
export class CursorController {
  constructor(cursorEl, readoutEl) {
    this.el = cursorEl;
    this.readoutEl = readoutEl;
    this.enabled =
      window.matchMedia('(pointer: fine)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.targetX = window.innerWidth * 0.5;
    this.targetY = window.innerHeight * 0.5;
    this.x = this.targetX;
    this.y = this.targetY;
    this.visible = false;
    this.mode = 'default';
    this.rafId = null;

    if (this.enabled) {
      document.body.classList.add('has-custom-cursor');
      this._bind();
      this._tick();
    }
  }

  _bind() {
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        this.targetX = e.clientX;
        this.targetY = e.clientY;
        if (!this.visible) {
          this.x = this.targetX;
          this.y = this.targetY;
          this.visible = true;
          this.el.classList.add('is-visible');
        }
      },
      { passive: true }
    );

    document.addEventListener('pointerleave', () => {
      this.visible = false;
      this.el.classList.remove('is-visible');
    });
  }

  setContext(mode, label = '') {
    if (!this.enabled) return;
    if (this.mode !== mode) {
      this.mode = mode;
      this.el.dataset.mode = mode;
    }
    if (label && this.readoutEl.textContent !== label) {
      this.readoutEl.textContent = label;
    }
  }

  _tick() {
    this.x += (this.targetX - this.x) * 0.24;
    this.y += (this.targetY - this.y) * 0.24;
    this.el.style.transform = `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0)`;
    this.rafId = requestAnimationFrame(() => this._tick());
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    document.body.classList.remove('has-custom-cursor');
  }
}

