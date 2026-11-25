/**
 * Deterministic 5-stage scroll, touch, and keyboard controller.
 * Prevents trackpad inertial momentum from skipping stages:
 * one deliberate gesture triggers one complete 1.2-1.6s movement, then waits.
 */
export class ScrollController {
  constructor({ totalStages = 5, onStageChange }) {
    this.totalStages = totalStages;
    this.onStageChange = onStageChange;
    this.currentStage = 0;

    // Transition + inertia guard state
    this.isTransitioning = false;
    this.lastStepAt = 0;
    this.lastWheelAt = 0;
    this.lastAbsDelta = 0;
    this.wheelBlockedUntil = 0;
    this.peakDuringGesture = 0;

    this.touchStartY = null;
    this.touchStartX = null;

    this._onWheel = this._onWheel.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);

    window.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('touchstart', this._onTouchStart, { passive: true });
    window.addEventListener('touchend', this._onTouchEnd, { passive: true });
  }

  setTransitioning(active) {
    this.isTransitioning = active;
    if (!active) {
      // Brief post-arrival settle window so trailing trackpad inertia cannot fire immediately
      this.wheelBlockedUntil = performance.now() + 340;
      this.peakDuringGesture = 0;
    }
  }

  goToStage(index, force = false) {
    const clamped = Math.max(0, Math.min(this.totalStages - 1, index));
    if (!force && clamped === this.currentStage) return false;
    if (this.isTransitioning && !force) return false;

    this.currentStage = clamped;
    this.lastStepAt = performance.now();
    this.onStageChange(clamped);
    return true;
  }

  step(delta) {
    return this.goToStage(this.currentStage + delta);
  }

  _onWheel(e) {
    e.preventDefault();
    const now = performance.now();
    const rawDelta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    const absDelta = Math.abs(rawDelta);

    // Ignore micro-jitter from precision trackpads
    if (absDelta < 4) return;

    const timeSinceLastWheel = now - this.lastWheelAt;
    const isNewBurst = timeSinceLastWheel > 320;
    const isSharpReacceleration =
      absDelta > Math.max(24, this.lastAbsDelta * 1.85) && now - this.lastStepAt > 480;

    this.lastWheelAt = now;
    this.lastAbsDelta = absDelta;

    if (this.isTransitioning || now < this.wheelBlockedUntil) {
      this.peakDuringGesture = Math.max(this.peakDuringGesture, absDelta);
      return;
    }

    // Trackpad inertial tail: after a gesture fires, deltas decay smoothly toward 0.
    // Only allow another stage step once there's a quiet gap OR a genuine new finger impulse.
    const gestureElapsed = now - this.lastStepAt;
    if (gestureElapsed < 1850 && !isNewBurst && !isSharpReacceleration) {
      return;
    }

    const dir = rawDelta > 0 ? 1 : -1;
    const next = this.currentStage + dir;
    if (next < 0 || next >= this.totalStages) return;

    this.peakDuringGesture = absDelta;
    this.goToStage(next);
  }

  _onTouchStart(e) {
    if (e.touches.length !== 1) return;
    this.touchStartY = e.touches[0].clientY;
    this.touchStartX = e.touches[0].clientX;
  }

  _onTouchEnd(e) {
    if (this.touchStartY === null || this.isTransitioning) return;
    const touch = e.changedTouches[0];
    const dy = this.touchStartY - touch.clientY;
    const dx = this.touchStartX - touch.clientX;
    this.touchStartY = null;
    this.touchStartX = null;

    if (Math.abs(dy) > 36 && Math.abs(dy) > Math.abs(dx)) {
      this.step(dy > 0 ? 1 : -1);
    }
  }

  _onKeyDown(e) {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        this.step(1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        this.step(-1);
        break;
      case ' ':
        if (tag !== 'BUTTON' && tag !== 'A') {
          e.preventDefault();
          this.step(e.shiftKey ? -1 : 1);
        }
        break;
      case 'Home':
        e.preventDefault();
        this.goToStage(0);
        break;
      case 'End':
        e.preventDefault();
        this.goToStage(this.totalStages - 1);
        break;
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
        e.preventDefault();
        this.goToStage(Number(e.key) - 1);
        break;
      default:
        break;
    }
  }

  destroy() {
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('touchstart', this._onTouchStart);
    window.removeEventListener('touchend', this._onTouchEnd);
  }
}

