import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { STAGES, STRUCTURE_PARTS } from './stages.js';
import { createWinterSkyDome } from './shaders/skyShader.js';
import { createWinterWater } from './shaders/waterShader.js';
import { createSnowfallSystem } from './shaders/snowShader.js';
import { createWireframeRevealMaterial } from './shaders/wireframeShader.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _forward = new THREE.Vector3();

function easeQuintInOut(t) {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

function classifyPart(nodeName) {
  for (const [key, def] of Object.entries(STRUCTURE_PARTS)) {
    if (key !== 'all' && def.nodePattern && def.nodePattern.test(nodeName)) {
      return key;
    }
  }
  return 'other';
}

function formatFeatureLabel(rawName) {
  if (!rawName) return 'ARCHITECTURAL ENVELOPE';
  const cleaned = rawName
    .replace(/_mesh$/i, '')
    .replace(/_Group$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+\d+$/, '')
    .trim();
  return cleaned.toUpperCase();
}

export class WinterScene {
  constructor({
    canvas,
    guides,
    onLoadProgress,
    onReady,
    onStageTransitionStart,
    onStageTransitionEnd,
    onHoverBuilding,
  }) {
    this.canvas = canvas;
    this.guides = guides;
    this.onLoadProgress = onLoadProgress;
    this.onReady = onReady;
    this.onStageTransitionStart = onStageTransitionStart;
    this.onStageTransitionEnd = onStageTransitionEnd;
    this.onHoverBuilding = onHoverBuilding;

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Adaptive quality profile
    this.qualityTier = this._detectInitialQuality();
    this.frameTimes = [];
    this.qualityChecked = false;

    // Camera stage transition state
    this.stageIndex = 0;
    this.transitionActive = false;
    this.transitionProgress = 1;
    this.transitionStartMs = 0;
    this.transitionDuration = 1.42; // 1.2 - 1.6s smooth deliberate transition
    this.fromPos = new THREE.Vector3();
    this.fromLook = new THREE.Vector3();
    this.toPos = new THREE.Vector3();
    this.toLook = new THREE.Vector3();
    this.currentPos = new THREE.Vector3();
    this.currentLook = new THREE.Vector3();

    // Smoothed cursor parallax
    this.pointerNDC = new THREE.Vector2(0, 0);
    this.easedPointer = new THREE.Vector2(0, 0);
    this.pointerInside = false;

    // Hover wireframe & raycasting
    this.raycaster = new THREE.Raycaster();
    this.buildingMeshes = [];
    this.wireframeMaterials = [];
    this.hoverPoint = new THREE.Vector3(0, 0.6, 0);
    this.targetHoverPoint = new THREE.Vector3(0, 0.6, 0);
    this.hoverAlpha = 0;
    this.targetHoverAlpha = 0;
    this.hoveredFeatureName = '';

    // Structure exploration mode
    this.exploreMode = false;
    this.selectedPart = 'all';
    this.structureAlpha = 0;

    this.lastFrameMs = 0;
    this.elapsed = 0;
    this.rafId = null;

    this._initRendererAndScene();
    this._initLightingAndAtmosphere();
    this._initPostProcessing();
    this._bindEvents();
    this._loadModel();
  }

  _detectInitialQuality() {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    const isSmall = Math.min(window.innerWidth, window.innerHeight) < 640;
    if (cores <= 2 || mem <= 2) return 'low';
    if (isSmall || cores <= 4) return 'medium';
    return 'high';
  }

  _initRendererAndScene() {
    const maxDpr = this.qualityTier === 'high' ? 2 : this.qualityTier === 'medium' ? 1.5 : 1;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#09131f');
    this.scene.fog = new THREE.FogExp2('#192f44', 0.044);

    this.camera = new THREE.PerspectiveCamera(this._computeResponsiveFov(), this.width / this.height, 0.08, 120);

    // Initialize at Stage 0 immediately
    const initial = this._computeStageCamera(0);
    this.currentPos.copy(initial.pos);
    this.currentLook.copy(initial.look);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  _computeResponsiveFov() {
    const aspect = this.width / Math.max(this.height, 1);
    if (aspect < 0.72) return 56;
    if (aspect < 1.05) return 46;
    if (aspect < 1.35) return 41;
    return 37;
  }

  _computeStageCamera(index) {
    const stage = STAGES[index];
    const basePos = new THREE.Vector3(...stage.cameraPos);
    const baseLook = new THREE.Vector3(...stage.lookAt);

    const aspect = this.width / Math.max(this.height, 1);
    // On desktop, apply calibrated right-viewport offset (crucial for Stage 5 right-60% composition)
    const offsetScale = aspect >= 1.28 ? 1.0 : THREE.MathUtils.smoothstep(aspect, 0.78, 1.28) * 0.35;
    const rightOffset = (stage.desktopRightOffset || 0) * offsetScale;

    if (Math.abs(rightOffset) > 0.001) {
      _forward.subVectors(baseLook, basePos).normalize();
      _right.crossVectors(_forward, THREE.Object3D.DEFAULT_UP).normalize();
      // Shift lookAt left (and camera slightly left) to seat the building cleanly on the right
      baseLook.addScaledVector(_right, rightOffset);
      basePos.addScaledVector(_right, rightOffset * 0.32);
    }

    // Pull back and lift target slightly on tall portrait screens so building frames cleanly between top text & bottom controls
    if (aspect < 0.95) {
      _forward.subVectors(basePos, baseLook);
      _forward.multiplyScalar(1.16);
      basePos.copy(baseLook).add(_forward);
      baseLook.y += 0.14;
      basePos.y += 0.10;
    }

    return { pos: basePos, look: baseLook };
  }

  _buildProceduralEnvMap() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color('#142538');

    const domeGeo = new THREE.SphereGeometry(10, 24, 16);
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        void main() {
          vec3 d = normalize(vPos);
          vec3 top = vec3(0.08, 0.16, 0.28);
          vec3 mid = vec3(0.28, 0.44, 0.58);
          vec3 ice = vec3(0.42, 0.72, 0.88);
          vec3 low = vec3(0.05, 0.09, 0.14);
          vec3 col = d.y > 0.0 ? mix(mid, top, smoothstep(0.0, 0.8, d.y)) : mix(mid, low, smoothstep(0.0, -0.4, d.y));
          float band = exp(-abs(d.y - 0.05) * 7.0);
          col = mix(col, ice, band * 0.45);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    envScene.add(new THREE.Mesh(domeGeo, domeMat));

    const rt = pmrem.fromScene(envScene, 0.04);
    domeGeo.dispose();
    domeMat.dispose();
    pmrem.dispose();
    return rt.texture;
  }

  _initLightingAndAtmosphere() {
    this.scene.environment = this._buildProceduralEnvMap();

    // Sky dome
    this.skyDome = createWinterSkyDome();
    this.scene.add(this.skyDome);

    // Overcast winter twilight hemisphere light
    const hemi = new THREE.HemisphereLight('#8cb6dc', '#112032', 1.05);
    this.scene.add(hemi);

    // Soft cool overcast key light
    const shadowRes = this.qualityTier === 'high' ? 2048 : 1024;
    this.keyLight = new THREE.DirectionalLight('#d5e8fa', 1.5);
    this.keyLight.position.set(-2.9, 4.6, 3.3);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(shadowRes, shadowRes);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 14;
    this.keyLight.shadow.camera.left = -2.0;
    this.keyLight.shadow.camera.right = 2.0;
    this.keyLight.shadow.camera.top = 2.2;
    this.keyLight.shadow.camera.bottom = -1.6;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.015;
    this.scene.add(this.keyLight);

    // Icy-cyan architectural rim light
    this.rimLight = new THREE.DirectionalLight('#6fd6ff', 1.25);
    this.rimLight.position.set(2.8, 2.7, -3.5);
    this.scene.add(this.rimLight);

    // Subtle warm bounce to honor cedar & oxblood vermilion
    this.warmBounce = new THREE.DirectionalLight('#f29c6e', 0.42);
    this.warmBounce.position.set(1.6, 0.7, 2.6);
    this.scene.add(this.warmBounce);

    // Restrained warm interior/lantern point lights
    const lanternLightFront = new THREE.PointLight('#ff9c4a', 0.54, 2.0, 1.8);
    lanternLightFront.position.set(-0.14, 0.78, 0.38);
    this.scene.add(lanternLightFront);

    const lowerWindowLight = new THREE.PointLight('#ff9142', 0.48, 1.8, 1.8);
    lowerWindowLight.position.set(-0.10, 0.42, 0.30);
    this.scene.add(lowerWindowLight);

    const entryLight = new THREE.PointLight('#ffa658', 0.44, 1.7, 1.8);
    entryLight.position.set(0.56, 0.42, 0.25);
    this.scene.add(entryLight);

    // Animated planar water reflector right at the pond waterline
    const waterSize = this.qualityTier === 'high' ? 1024 : 512;
    this.water = createWinterWater({
      textureWidth: waterSize,
      textureHeight: waterSize,
      multisample: this.qualityTier === 'high' ? 4 : 0,
    });
    this.scene.add(this.water);

    // 3-layer natural winter snowfall
    const snowCount = this.qualityTier === 'high' ? 1400 : this.qualityTier === 'medium' ? 880 : 480;
    this.snowfall = createSnowfallSystem(snowCount);
    this.scene.add(this.snowfall);
  }

  _initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // Restrained soft bloom for paper lanterns, warm shoji, and icy-cyan highlights
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height),
      0.17, // strength: restrained, never washed out
      0.52, // radius: soft photographic halation
      0.86  // threshold: only emissives and crisp highlights bloom
    );
    this.composer.addPass(this.bloomPass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  _upgradeMaterialWithPolish(mat) {
    if (!mat) return mat;
    const name = mat.name || '';

    // Keep pond inner slabs subtly submerged beneath real-time reflective water
    if (name.startsWith('Pond |') && name !== 'Pond | dark rim') {
      const bed = mat.clone();
      bed.transparent = true;
      bed.opacity = 0.22;
      bed.depthWrite = false;
      return bed;
    }

    const physical = new THREE.MeshPhysicalMaterial({
      name: mat.name,
      color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
      map: mat.map || null,
      normalMap: mat.normalMap || null,
      roughness: mat.roughness !== undefined ? mat.roughness : 0.85,
      metalness: mat.metalness !== undefined ? mat.metalness : 0.0,
      vertexColors: Boolean(mat.vertexColors),
      transparent: Boolean(mat.transparent),
      opacity: mat.opacity !== undefined ? mat.opacity : 1.0,
      side: mat.side !== undefined ? mat.side : THREE.FrontSide,
      // Subtle clear glass-like polish softening harsh voxel edges while preserving crisp architecture
      clearcoat: 0.26,
      clearcoatRoughness: 0.22,
      ior: 1.48,
      envMapIntensity: 0.92,
    });

    if (name.includes('Tiles') || name.includes('Window | oxblood')) {
      physical.clearcoat = 0.42;
      physical.clearcoatRoughness = 0.18;
      physical.roughness = Math.min(physical.roughness, 0.72);
    } else if (name.includes('Lantern | warm paper')) {
      physical.emissive = new THREE.Color('#ff9c42');
      physical.emissiveIntensity = 1.45;
      physical.clearcoat = 0.16;
    } else if (name.includes('Shoji | bright paper')) {
      physical.emissive = new THREE.Color('#ffaa58');
      physical.emissiveIntensity = 0.52;
      physical.clearcoat = 0.18;
    } else if (name.includes('Shoji | rice paper')) {
      physical.emissive = new THREE.Color('#f2a056');
      physical.emissiveIntensity = 0.26;
    } else if (name.includes('Shoji | shaded paper')) {
      physical.emissive = new THREE.Color('#df9150');
      physical.emissiveIntensity = 0.11;
    }

    return physical;
  }

  _loadModel() {
    const loader = new GLTFLoader();
    loader.load(
      '/models/house.glb',
      (gltf) => {
        this.onLoadProgress?.(92, 'ASSEMBLING WIREFRAME & WATERLINE');
        this.modelRoot = gltf.scene;

        const wireGroup = new THREE.Group();
        wireGroup.name = 'BuildingWireframeOverlay';

        // Map to keep part-specific wireframe shaders for Structure Exploration
        const partMaterials = new Map();
        for (const key of ['roof', 'upper', 'entry', 'deck', 'other']) {
          const wMat = createWireframeRevealMaterial();
          partMaterials.set(key, wMat);
          this.wireframeMaterials.push({ part: key, material: wMat });
        }

        const cachedMaterials = new Map();

        this.modelRoot.traverse((child) => {
          if (!child.isMesh) return;

          const nodeName = child.name || child.parent?.name || '';
          const groupName = child.parent?.name || '';
          const ancestorNames = [];
          let cur = child;
          while (cur) {
            if (cur.name) ancestorNames.push(cur.name);
            cur = cur.parent;
          }
          const hierarchyLabel = ancestorNames.join(' ');
          const isPond = hierarchyLabel.includes('Irregular shallow pond');

          // Upgrade materials while preserving colors, names, and architecture
          if (Array.isArray(child.material)) {
            child.material = child.material.map((m) => {
              if (!cachedMaterials.has(m.uuid)) {
                cachedMaterials.set(m.uuid, this._upgradeMaterialWithPolish(m));
              }
              return cachedMaterials.get(m.uuid);
            });
          } else if (child.material) {
            if (!cachedMaterials.has(child.material.uuid)) {
              cachedMaterials.set(child.material.uuid, this._upgradeMaterialWithPolish(child.material));
            }
            child.material = cachedMaterials.get(child.material.uuid);
          }

          if (isPond) {
            // Keep pond rim gently resting right under the waterline without casting self-shadow artifacts
            child.position.y -= 0.002;
            child.receiveShadow = true;
            return;
          }

          child.castShadow = true;
          child.receiveShadow = true;

          // Register hoverable architectural mesh (skip tiny wildflowers for cleaner pointer stability)
          const partKey = classifyPart(hierarchyLabel);
          child.userData.archLabel = formatFeatureLabel(groupName || nodeName);
          child.userData.partKey = partKey;

          if (!hierarchyLabel.includes('Garden_Plants')) {
            this.buildingMeshes.push(child);

            // Create aligned localized wireframe overlay mesh
            const wMat = partMaterials.get(partKey) || partMaterials.get('other');
            const wireMesh = new THREE.Mesh(child.geometry, wMat);
            wireMesh.name = `${nodeName}_wire`;
            child.updateWorldMatrix(true, false);
            wireMesh.matrixAutoUpdate = false;
            wireMesh.matrix.copy(child.matrixWorld);
            wireGroup.add(wireMesh);
          }
        });

        this.scene.add(this.modelRoot);
        this.modelRoot.updateMatrixWorld(true);

        // Sync wireframe transforms cleanly after root matrix is finalized
        wireGroup.children.forEach((wireMesh, idx) => {
          const src = this.buildingMeshes[idx];
          if (src) {
            wireMesh.matrix.copy(src.matrixWorld);
          }
        });
        this.wireGroup = wireGroup;
        this.scene.add(wireGroup);

        // Warm one frame before dismissing loader so shaders compile smoothly
        this._renderFrame(0.016);
        this.onLoadProgress?.(100, 'READY');
        this.onReady?.();
        this._startLoop();
      },
      (xhr) => {
        if (xhr.lengthComputable && xhr.total > 0) {
          const pct = Math.min(88, Math.round((xhr.loaded / xhr.total) * 88));
          this.onLoadProgress?.(pct, 'LOADING ARCHITECTURAL GEOMETRY');
        }
      },
      (err) => {
        console.error('Failed to load /models/house.glb:', err);
        this.onLoadProgress?.(100, 'MODEL LOAD ERROR');
      }
    );
  }

  _bindEvents() {
    this._onResize = this._onResize.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerLeave = this._onPointerLeave.bind(this);

    window.addEventListener('resize', this._onResize);
    this.canvas.addEventListener('pointermove', this._onPointerMove, { passive: true });
    this.canvas.addEventListener('pointerleave', this._onPointerLeave);
  }

  _onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.camera.fov = this._computeResponsiveFov();
    this.camera.aspect = this.width / Math.max(this.height, 1);
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(this.width, this.height, false);
    this.composer.setSize(this.width, this.height);
    this.bloomPass.resolution.set(this.width, this.height);

    // Recompute active stage framing for new viewport ratio
    if (!this.transitionActive) {
      const target = this._computeStageCamera(this.stageIndex);
      this.currentPos.copy(target.pos);
      this.currentLook.copy(target.look);
    } else {
      const target = this._computeStageCamera(this.stageIndex);
      this.toPos.copy(target.pos);
      this.toLook.copy(target.look);
    }
  }

  _onPointerMove(e) {
    this.pointerInside = true;
    this.pointerNDC.x = (e.clientX / Math.max(this.width, 1)) * 2 - 1;
    this.pointerNDC.y = -(e.clientY / Math.max(this.height, 1)) * 2 + 1;
  }

  _onPointerLeave() {
    this.pointerInside = false;
    this.pointerNDC.set(0, 0);
    this.targetHoverAlpha = 0;
    if (!this.exploreMode) {
      this.guides?.clear();
    } else {
      this._highlightSelectedPartGuides();
    }
    if (this.hoveredFeatureName) {
      this.hoveredFeatureName = '';
      this.onHoverBuilding?.(false, '');
    }
  }

  setStage(index) {
    const clamped = Math.max(0, Math.min(STAGES.length - 1, index));
    if (clamped === this.stageIndex && this.transitionProgress >= 1) return;

    this.stageIndex = clamped;
    const target = this._computeStageCamera(clamped);

    if (this.reducedMotion) {
      this.transitionDuration = 0.25;
    } else {
      this.transitionDuration = 1.42;
    }

    this.fromPos.copy(this.currentPos);
    this.fromLook.copy(this.currentLook);
    this.toPos.copy(target.pos);
    this.toLook.copy(target.look);
    this.transitionProgress = 0;
    this.transitionStartMs = performance.now();
    this.transitionActive = true;
    this.onStageTransitionStart?.(clamped);
  }

  setExploreMode(active) {
    this.exploreMode = active;
    if (!active) {
      this.selectedPart = 'all';
      if (!this.hoveredFeatureName) this.guides?.clear();
    } else {
      this._highlightSelectedPartGuides();
    }
  }

  setStructurePart(partKey) {
    this.selectedPart = partKey || 'all';
    if (this.exploreMode) {
      this._highlightSelectedPartGuides();
    }
  }

  _highlightSelectedPartGuides() {
    if (!this.exploreMode || this.buildingMeshes.length === 0) return;
    const box = new THREE.Box3();
    for (const m of this.buildingMeshes) {
      if (this.selectedPart === 'all' || m.userData.partKey === this.selectedPart) {
        box.expandByObject(m);
      }
    }
    if (!box.isEmpty()) {
      const center = new THREE.Vector3();
      box.getCenter(center);
      const label = STRUCTURE_PARTS[this.selectedPart]?.label || 'FULL ENVELOPE';
      this.guides?.setTarget(center, box, label);
    }
  }

  setReducedMotion(isReduced) {
    this.reducedMotion = isReduced;
    if (this.water?.material?.uniforms?.uMotionFactor) {
      this.water.material.uniforms.uMotionFactor.value = isReduced ? 0.15 : 1.0;
    }
    if (this.snowfall?.material?.uniforms?.uMotionFactor) {
      this.snowfall.material.uniforms.uMotionFactor.value = isReduced ? 0.12 : 1.0;
      this.snowfall.material.uniforms.uOpacityScale.value = isReduced ? 0.55 : 1.0;
    }
  }

  _updateRaycastHover() {
    if (!this.pointerInside || this.buildingMeshes.length === 0) {
      this.targetHoverAlpha = 0;
      return;
    }

    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.buildingMeshes, false);

    if (hits.length > 0) {
      const hit = hits[0];
      this.targetHoverPoint.copy(hit.point);
      this.targetHoverAlpha = 1.0;

      const label = hit.object.userData.archLabel || 'PAVILION STRUCTURE';
      const box = new THREE.Box3().setFromObject(hit.object);
      this.guides?.setTarget(hit.point, box, label);

      if (this.hoveredFeatureName !== label) {
        this.hoveredFeatureName = label;
        this.onHoverBuilding?.(true, label);
      }
    } else {
      this.targetHoverAlpha = 0;
      if (!this.exploreMode) {
        this.guides?.clear();
      }
      if (this.hoveredFeatureName) {
        this.hoveredFeatureName = '';
        this.onHoverBuilding?.(false, '');
        if (this.exploreMode) this._highlightSelectedPartGuides();
      }
    }
  }

  _adaptQualityIfNeeded(dt) {
    if (this.qualityChecked) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 48) return;

    this.qualityChecked = true;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    if (avg > 0.032 && this.qualityTier !== 'low') {
      this.qualityTier = 'low';
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(this.width, this.height, false);
      this.composer.setSize(this.width, this.height);
      if (this.snowfall) {
        this.snowfall.geometry.setDrawRange(0, Math.min(500, this.snowfall.geometry.attributes.position.count));
      }
    }
  }

  _renderFrame(dt) {
    this.elapsed += dt;
    this._adaptQualityIfNeeded(dt);

    // 1. Camera stage transition (1.42s eased in real wall-clock time)
    if (this.transitionActive) {
      const elapsedSec = (performance.now() - this.transitionStartMs) / 1000;
      this.transitionProgress = Math.min(1, elapsedSec / this.transitionDuration);
      const eased = easeQuintInOut(this.transitionProgress);
      this.currentPos.lerpVectors(this.fromPos, this.toPos, eased);
      this.currentLook.lerpVectors(this.fromLook, this.toLook, eased);

      if (this.transitionProgress >= 1) {
        this.transitionActive = false;
        this.onStageTransitionEnd?.(this.stageIndex);
      }
    }

    // 2. Smoothly eased cursor-driven parallax blended with camera transitions
    const ptrDamp = 1 - Math.exp(-5.5 * dt);
    const parallaxActive = this.reducedMotion ? 0 : 1;
    this.easedPointer.x += (this.pointerNDC.x * parallaxActive - this.easedPointer.x) * ptrDamp;
    this.easedPointer.y += (this.pointerNDC.y * parallaxActive - this.easedPointer.y) * ptrDamp;

    _forward.subVectors(this.currentLook, this.currentPos).normalize();
    _right.crossVectors(_forward, THREE.Object3D.DEFAULT_UP).normalize();
    _up.crossVectors(_right, _forward).normalize();

    const pScale = STAGES[this.stageIndex].parallaxScale || 1.0;
    const parallaxX = this.easedPointer.x * 0.22 * pScale;
    const parallaxY = this.easedPointer.y * 0.13 * pScale;

    this.camera.position
      .copy(this.currentPos)
      .addScaledVector(_right, parallaxX)
      .addScaledVector(_up, parallaxY);

    // Counter-tilt look target gently so the building stays framed while depth shifts noticeably
    _v1
      .copy(this.currentLook)
      .addScaledVector(_right, -parallaxX * 0.28)
      .addScaledVector(_up, -parallaxY * 0.24);
    this.camera.lookAt(_v1);
    this.camera.updateMatrixWorld();

    // 3. Raycast building hover & update feathered wireframe mask + projected guides
    this._updateRaycastHover();

    const hoverRate = 1 - Math.exp(-9.0 * dt);
    this.hoverAlpha += (this.targetHoverAlpha - this.hoverAlpha) * hoverRate;
    this.hoverPoint.lerp(this.targetHoverPoint, 1 - Math.exp(-14.0 * dt));

    const targetStructAlpha = this.exploreMode ? 1.0 : 0.0;
    this.structureAlpha += (targetStructAlpha - this.structureAlpha) * (1 - Math.exp(-7.0 * dt));

    for (const item of this.wireframeMaterials) {
      const u = item.material.uniforms;
      u.uTime.value = this.elapsed;
      u.uHoverPoint.value.copy(this.hoverPoint);
      u.uHoverAlpha.value = this.hoverAlpha;
      u.uStructureAlpha.value = this.structureAlpha;
      u.uPartHighlight.value =
        this.selectedPart === 'all' || this.selectedPart === item.part ? 1.0 : 0.12;
    }

    // 4. Update water ripples, snowfall, and sky
    if (this.water?.material?.uniforms) {
      this.water.material.uniforms.uTime.value = this.elapsed;
      this.water.material.uniforms.uCameraPos.value.copy(this.camera.position);
      this.water.material.uniforms.uMotionFactor.value = this.reducedMotion ? 0.15 : 1.0;
    }

    if (this.snowfall?.material?.uniforms) {
      this.snowfall.material.uniforms.uTime.value = this.elapsed;
      this.snowfall.material.uniforms.uMotionFactor.value = this.reducedMotion ? 0.12 : 1.0;
      this.snowfall.material.uniforms.uOpacityScale.value = this.reducedMotion ? 0.55 : 1.0;
    }

    // 5. Update SVG architectural guides aligned with hovered 3D bounds
    this.guides?.update(dt, this.camera, this.width, this.height);

    // 6. Render scene + restrained bloom
    if (this.qualityTier === 'low') {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render();
    }
  }

  _startLoop() {
    this.lastFrameMs = performance.now();
    const tick = (now) => {
      const dt = Math.min(Math.max((now - this.lastFrameMs) / 1000, 0.001), 0.12);
      this.lastFrameMs = now;
      this._renderFrame(dt);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerleave', this._onPointerLeave);
    this.water?.dispose();
    this.composer?.dispose();
    this.renderer?.dispose();
  }
}

