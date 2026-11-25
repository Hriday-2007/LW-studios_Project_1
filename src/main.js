import './styles/main.css';
import { STAGES, STRUCTURE_PARTS } from './scene/stages.js';
import { WinterScene } from './scene/WinterScene.js';
import { ArchitecturalGuides } from './scene/ArchitecturalGuides.js';
import { ScrollController } from './ui/ScrollController.js';
import { CursorController } from './ui/CursorController.js';

const heroEl = document.getElementById('hero-stage');
const canvasEl = document.getElementById('scene-canvas');
const guidesGroupEl = document.getElementById('arch-guides-group');

const loaderEl = document.getElementById('loader');
const loaderProgressEl = document.getElementById('scene-progress');
const loaderPercentEl = document.getElementById('loader-percent');
const loaderStatusEl = document.getElementById('loader-status');

const editorialPanelEl = document.getElementById('editorial-panel');
const stageCounterEl = document.getElementById('stage-counter');
const stageTagEl = document.getElementById('stage-tag');
const headlineHoverZoneEl = document.getElementById('headline-hover-zone');
const headlineEl = document.getElementById('stage-headline');
const headlineBaseEl = document.getElementById('headline-base');
const headlineScanEl = document.getElementById('headline-scan');
const headlineOutlineEl = document.getElementById('headline-outline');
const stageDescEl = document.getElementById('stage-description');
const viewsTelemetryEl = document.getElementById('views-telemetry');
const srAnnouncerEl = document.getElementById('sr-announcer');

const viewButtons = Array.from(document.querySelectorAll('[data-stage-btn]'));
const navButtons = Array.from(document.querySelectorAll('.nav-link'));
const prevBtn = document.getElementById('prev-stage-btn');
const nextBtn = document.getElementById('next-stage-btn');

const exploreBtn = document.getElementById('explore-structure-btn');
const structurePillBar = document.getElementById('structure-pill-bar');
const structPartButtons = Array.from(document.querySelectorAll('.struct-part-btn'));

const cursorEl = document.getElementById('arch-cursor');
const cursorReadoutEl = document.getElementById('cursor-readout');

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let isHoveringBuilding = false;
let currentHoverLabel = '';
let scanRafId = null;
let isScanning = false;

const cursor = new CursorController(cursorEl, cursorReadoutEl);
const guides = new ArchitecturalGuides(guidesGroupEl);

function renderStageCopy(stageIndex) {
  const stage = STAGES[stageIndex];
  heroEl.dataset.stage = String(stageIndex);

  stageCounterEl.textContent = stage.counter;
  stageTagEl.textContent = stage.tag;
  viewsTelemetryEl.textContent = stage.telemetry;

  // Populate base readable typography + matching scan & outline layers
  headlineBaseEl.innerHTML = stage.headlineHTML;
  headlineScanEl.innerHTML = stage.headlineHTML;
  headlineOutlineEl.innerHTML = stage.headlineHTML;
  stageDescEl.textContent = stage.description;

  // Retrigger crisp 0.34s editorial reveal alongside camera movement
  editorialPanelEl.classList.remove('is-revealing');
  void editorialPanelEl.offsetWidth;
  editorialPanelEl.classList.add('is-revealing');

  // Update Views panel active state
  viewButtons.forEach((btn, idx) => {
    const active = idx === stageIndex;
    btn.classList.toggle('is-active', active);
    if (active) {
      btn.setAttribute('aria-current', 'step');
    } else {
      btn.removeAttribute('aria-current');
    }
  });

  // Update nav active indicators for matching stages
  navButtons.forEach((btn) => {
    const navAction = btn.dataset.navAction;
    if (navAction === 'view') {
      btn.classList.toggle('is-active', Number(btn.dataset.stage) === stageIndex);
    }
  });

  prevBtn.disabled = stageIndex === 0;
  nextBtn.disabled = stageIndex === STAGES.length - 1;
  srAnnouncerEl.textContent = `${stage.counter}: ${stage.viewName}`;
}

/**
 * Single-pass 1.4s letterform scan triggered ONLY on outer headline hover.
 * Prevents repeated restarts when moving across words or letters.
 */
function runHeadlineScan() {
  if (isScanning || reducedMotionQuery.matches) return;
  isScanning = true;
  headlineEl.classList.add('is-scanning');

  const durationMs = 1400;
  const start = performance.now();

  const step = (now) => {
    const t = Math.min(1, (now - start) / durationMs);
    // Smooth architectural sweep curve across letterforms
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const progress = -0.18 + eased * 1.36;
    headlineEl.style.setProperty('--scan-progress', progress.toFixed(4));

    if (t < 1) {
      scanRafId = requestAnimationFrame(step);
    } else {
      headlineEl.classList.remove('is-scanning');
      headlineEl.style.setProperty('--scan-progress', '-0.25');
      isScanning = false;
      scanRafId = null;
    }
  };

  scanRafId = requestAnimationFrame(step);
}

headlineHoverZoneEl.addEventListener('pointerenter', () => {
  cursor.setContext('headline', 'SCAN');
  runHeadlineScan();
});

headlineHoverZoneEl.addEventListener('pointerleave', () => {
  cursor.setContext(isHoveringBuilding ? 'building' : 'default', currentHoverLabel || 'INSPECT');
});

// Interactive UI hover feedback for custom architectural cursor
const interactiveSelector = 'button, a';
document.addEventListener(
  'pointerover',
  (e) => {
    if (e.target.closest(interactiveSelector)) {
      cursor.setContext('interactive', 'SELECT');
    }
  },
  { passive: true }
);

document.addEventListener(
  'pointerout',
  (e) => {
    if (e.target.closest(interactiveSelector)) {
      cursor.setContext(isHoveringBuilding ? 'building' : 'default', currentHoverLabel || 'INSPECT');
    }
  },
  { passive: true }
);

// Initialize Scene & Scroll Controller
let scrollCtrl = null;

const winterScene = new WinterScene({
  canvas: canvasEl,
  guides,
  onLoadProgress: (percent, status) => {
    loaderProgressEl.value = percent;
    loaderPercentEl.textContent = `${String(percent).padStart(2, '0')}%`;
    if (status) loaderStatusEl.textContent = status;
  },
  onReady: () => {
    setTimeout(() => {
      loaderEl.classList.add('is-done');
    }, 180);
  },
  onStageTransitionStart: () => {
    scrollCtrl?.setTransitioning(true);
  },
  onStageTransitionEnd: () => {
    scrollCtrl?.setTransitioning(false);
  },
  onHoverBuilding: (hovering, featureLabel) => {
    isHoveringBuilding = hovering;
    currentHoverLabel = featureLabel;
    if (hovering) {
      cursor.setContext('building', 'LOCKED');
    } else {
      cursor.setContext('default', 'INSPECT');
    }
  },
});

scrollCtrl = new ScrollController({
  totalStages: STAGES.length,
  onStageChange: (stageIndex) => {
    renderStageCopy(stageIndex);
    winterScene.setStage(stageIndex);
  },
});

// Views panel buttons
viewButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const idx = Number(btn.dataset.stageBtn);
    scrollCtrl.goToStage(idx, true);
  });
});

prevBtn.addEventListener('click', () => scrollCtrl.step(-1));
nextBtn.addEventListener('click', () => scrollCtrl.step(1));

// Explore the Structure toggle & part selector
function toggleExploreMode(forceState) {
  const next = typeof forceState === 'boolean' ? forceState : !winterScene.exploreMode;
  winterScene.setExploreMode(next);
  exploreBtn.setAttribute('aria-pressed', String(next));
  structurePillBar.hidden = !next;

  const navExplore = document.querySelector('[data-nav-action="explore"]');
  navExplore?.classList.toggle('is-active', next);

  if (next) {
    srAnnouncerEl.textContent = 'Structure inspection mode enabled. Select an architectural layer or hover the building.';
  } else {
    structPartButtons.forEach((b) => b.classList.toggle('is-selected', b.dataset.part === 'all'));
    srAnnouncerEl.textContent = 'Structure inspection mode closed.';
  }
}

exploreBtn.addEventListener('click', () => toggleExploreMode());

structPartButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const part = btn.dataset.part;
    winterScene.setStructurePart(part);
    structPartButtons.forEach((b) => b.classList.toggle('is-selected', b === btn));
    const partInfo = STRUCTURE_PARTS[part];
    if (partInfo) {
      srAnnouncerEl.textContent = `Highlighting ${partInfo.label}`;
    }
  });
});

// Top nav buttons
navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.navAction;
    if (action === 'view') {
      scrollCtrl.goToStage(Number(btn.dataset.stage), true);
    } else if (action === 'explore') {
      toggleExploreMode();
    }
  });
});

// Reduced motion dynamic support
reducedMotionQuery.addEventListener('change', (e) => {
  winterScene.setReducedMotion(e.matches);
});

// Render initial Stage 0 editorial content
renderStageCopy(0);

