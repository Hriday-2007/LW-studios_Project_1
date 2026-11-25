import * as THREE from 'three';

const _v = new THREE.Vector3();

/**
 * Projects 3D world-space feature bounds and anchor points onto the SVG HUD layer,
 * drawing animated architectural brackets, rules, and anchor reticles aligned with the model.
 */
export class ArchitecturalGuides {
  constructor(svgGroupEl) {
    this.group = svgGroupEl;
    this.opacity = 0;
    this.targetOpacity = 0;
    this.activeLabel = '';
    this.hitPoint = new THREE.Vector3();
    this.featureBox = new THREE.Box3();
    this.hasTarget = false;
    this._buildElements();
  }

  _buildElements() {
    const ns = 'http://www.w3.org/2000/svg';
    const make = (tag, cls) => {
      const el = document.createElementNS(ns, tag);
      if (cls) el.setAttribute('class', cls);
      return el;
    };

    this.brackets = [0, 1, 2, 3].map(() => make('path', 'guide-bracket'));
    this.ruleH = make('line', 'guide-rule');
    this.ruleV = make('line', 'guide-rule');
    this.leader = make('polyline', 'guide-rule');
    this.anchorOuter = make('circle', 'guide-anchor');
    this.anchorOuter.setAttribute('r', '6');
    this.anchorInner = make('circle', 'guide-anchor-core');
    this.anchorInner.setAttribute('r', '2');

    this.labelBg = make('rect', 'guide-label-bg');
    this.labelBg.setAttribute('height', '18');
    this.labelBg.setAttribute('rx', '1');
    this.labelText = make('text', 'guide-label-text');
    this.labelText.setAttribute('dominant-baseline', 'middle');

    for (const b of this.brackets) this.group.appendChild(b);
    this.group.appendChild(this.ruleH);
    this.group.appendChild(this.ruleV);
    this.group.appendChild(this.leader);
    this.group.appendChild(this.anchorOuter);
    this.group.appendChild(this.anchorInner);
    this.group.appendChild(this.labelBg);
    this.group.appendChild(this.labelText);
  }

  setTarget(hitPoint, box3, label) {
    if (!hitPoint || !box3 || box3.isEmpty()) {
      this.clear();
      return;
    }
    this.hitPoint.copy(hitPoint);
    this.featureBox.copy(box3);
    this.activeLabel = label;
    this.targetOpacity = 1;
    this.hasTarget = true;
  }

  clear() {
    this.targetOpacity = 0;
  }

  _project(point, camera, width, height) {
    _v.copy(point).project(camera);
    return {
      x: (_v.x * 0.5 + 0.5) * width,
      y: (-_v.y * 0.5 + 0.5) * height,
      z: _v.z,
    };
  }

  update(dt, camera, width, height) {
    const rate = 1 - Math.exp(-10 * dt);
    this.opacity += (this.targetOpacity - this.opacity) * rate;

    if (this.opacity < 0.015) {
      this.group.classList.remove('is-visible');
      this.group.style.opacity = '0';
      if (this.targetOpacity === 0) this.hasTarget = false;
      return;
    }

    if (!this.hasTarget) return;

    this.group.classList.add('is-visible');
    this.group.style.opacity = this.opacity.toFixed(3);

    // Project all 8 corners of the hovered architectural feature bounding box
    const min = this.featureBox.min;
    const max = this.featureBox.max;
    const corners = [
      new THREE.Vector3(min.x, min.y, min.z),
      new THREE.Vector3(max.x, min.y, min.z),
      new THREE.Vector3(min.x, max.y, min.z),
      new THREE.Vector3(max.x, max.y, min.z),
      new THREE.Vector3(min.x, min.y, max.z),
      new THREE.Vector3(max.x, min.y, max.z),
      new THREE.Vector3(min.x, max.y, max.z),
      new THREE.Vector3(max.x, max.y, max.z),
    ];

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const c of corners) {
      const p = this._project(c, camera, width, height);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    // Slight gentle expand animation as guides appear
    const spread = (1 - this.opacity) * 14;
    const pad = 10 + spread;
    minX = Math.max(12, minX - pad);
    maxX = Math.min(width - 12, maxX + pad);
    minY = Math.max(12, minY - pad);
    maxY = Math.min(height - 12, maxY + pad);

    const arm = Math.max(10, Math.min(20, (maxX - minX) * 0.18));

    // Four crisp architectural corner brackets
    this.brackets[0].setAttribute('d', `M ${minX} ${minY + arm} V ${minY} H ${minX + arm}`);
    this.brackets[1].setAttribute('d', `M ${maxX - arm} ${minY} H ${maxX} V ${minY + arm}`);
    this.brackets[2].setAttribute('d', `M ${minX} ${maxY - arm} V ${maxY} H ${minX + arm}`);
    this.brackets[3].setAttribute('d', `M ${maxX - arm} ${maxY} H ${maxX} V ${maxY - arm}`);

    // Anchor reticle at exact raycast world hit point
    const hit2D = this._project(this.hitPoint, camera, width, height);
    this.anchorOuter.setAttribute('cx', hit2D.x.toFixed(1));
    this.anchorOuter.setAttribute('cy', hit2D.y.toFixed(1));
    this.anchorInner.setAttribute('cx', hit2D.x.toFixed(1));
    this.anchorInner.setAttribute('cy', hit2D.y.toFixed(1));

    // Fine crosshair rules clipped neatly inside feature bounds
    this.ruleH.setAttribute('x1', minX.toFixed(1));
    this.ruleH.setAttribute('y1', hit2D.y.toFixed(1));
    this.ruleH.setAttribute('x2', maxX.toFixed(1));
    this.ruleH.setAttribute('y2', hit2D.y.toFixed(1));

    this.ruleV.setAttribute('x1', hit2D.x.toFixed(1));
    this.ruleV.setAttribute('y1', minY.toFixed(1));
    this.ruleV.setAttribute('x2', hit2D.x.toFixed(1));
    this.ruleV.setAttribute('y2', maxY.toFixed(1));

    // Diagonal leader callout to architectural tag
    const dirX = hit2D.x > width * 0.68 ? -1 : 1;
    const elbowX = hit2D.x + dirX * 26;
    const elbowY = Math.max(36, hit2D.y - 26);
    const tailX = elbowX + dirX * 18;
    this.leader.setAttribute(
      'points',
      `${hit2D.x.toFixed(1)},${hit2D.y.toFixed(1)} ${elbowX.toFixed(1)},${elbowY.toFixed(1)} ${tailX.toFixed(1)},${elbowY.toFixed(1)}`
    );

    const textStr = this.activeLabel.toUpperCase();
    this.labelText.textContent = textStr;
    const estWidth = Math.max(78, textStr.length * 6.4 + 14);
    const boxX = dirX > 0 ? tailX + 4 : tailX - estWidth - 4;
    const boxY = elbowY - 9;

    this.labelBg.setAttribute('x', boxX.toFixed(1));
    this.labelBg.setAttribute('y', boxY.toFixed(1));
    this.labelBg.setAttribute('width', estWidth.toFixed(1));

    this.labelText.setAttribute('x', (boxX + 7).toFixed(1));
    this.labelText.setAttribute('y', (boxY + 9.5).toFixed(1));
  }
}

