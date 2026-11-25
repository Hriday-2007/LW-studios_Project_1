import * as THREE from 'three';

export function createSnowfallSystem(totalCount = 1400) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(totalCount * 3);
  const scales = new Float32Array(totalCount);
  const seeds = new Float32Array(totalCount * 3);
  const layers = new Float32Array(totalCount);

  const areaX = 10.5;
  const areaY = 5.2;
  const areaZ = 10.5;

  for (let i = 0; i < totalCount; i++) {
    // Distribute across 3 distinct depth/size layers: 0 = far fine mist, 1 = mid flakes, 2 = near soft bokeh
    const r = i / totalCount;
    const layer = r < 0.48 ? 0 : r < 0.86 ? 1 : 2;
    layers[i] = layer;

    positions[i * 3] = (Math.random() - 0.5) * areaX;
    positions[i * 3 + 1] = Math.random() * areaY;
    positions[i * 3 + 2] = (Math.random() - 0.5) * areaZ;

    if (layer === 0) {
      scales[i] = 0.55 + Math.random() * 0.45;
    } else if (layer === 1) {
      scales[i] = 0.95 + Math.random() * 0.7;
    } else {
      scales[i] = 1.65 + Math.random() * 1.1;
    }

    seeds[i * 3] = Math.random() * 100.0;
    seeds[i * 3 + 1] = 0.7 + Math.random() * 0.65;
    seeds[i * 3 + 2] = (Math.random() - 0.5) * 2.0;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  geometry.setAttribute('aLayer', new THREE.BufferAttribute(layers, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uAreaSize: { value: new THREE.Vector3(areaX, areaY, areaZ) },
      uMotionFactor: { value: 1.0 },
      uOpacityScale: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      attribute float aScale;
      attribute vec3 aSeed;
      attribute float aLayer;

      uniform float uTime;
      uniform float uPixelRatio;
      uniform vec3 uAreaSize;
      uniform float uMotionFactor;

      varying float vAlpha;
      varying float vLayer;
      varying float vSoftness;

      void main() {
        float t = uTime * uMotionFactor;
        float speed = mix(0.14, 0.31, aLayer * 0.5) * aSeed.y;

        vec3 pos = position;
        // Seamless vertical wrap above waterline
        pos.y = mod(pos.y - t * speed, uAreaSize.y) + 0.04;

        // Gentle winter breeze + sinusoidal flutter per flake
        float swayPhase = t * (0.45 + aLayer * 0.18) + aSeed.x;
        pos.x += sin(swayPhase) * (0.14 + aLayer * 0.09) + aSeed.z * 0.08 * sin(t * 0.22 + aSeed.x);
        pos.z += cos(swayPhase * 0.83) * (0.11 + aLayer * 0.07);

        // Wrap horizontally to stay centered around pavilion
        pos.x = mod(pos.x + uAreaSize.x * 0.5, uAreaSize.x) - uAreaSize.x * 0.5;
        pos.z = mod(pos.z + uAreaSize.z * 0.5, uAreaSize.z) - uAreaSize.z * 0.5;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        float dist = max(-mvPosition.z, 0.45);

        // Fade near camera and near waterline/ceiling
        float heightFade = smoothstep(0.04, 0.25, pos.y) * smoothstep(uAreaSize.y, uAreaSize.y - 0.85, pos.y);
        float nearFade = smoothstep(0.45, 1.35, dist);
        float farFade = 1.0 - smoothstep(4.6, 8.2, dist);

        vAlpha = heightFade * nearFade * farFade;
        vLayer = aLayer;
        vSoftness = mix(0.28, 0.48, aLayer * 0.5);

        float baseSize = mix(11.0, 26.0, aLayer * 0.5) * aScale;
        gl_PointSize = clamp((baseSize * uPixelRatio) / dist, 1.2, 22.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacityScale;

      varying float vAlpha;
      varying float vLayer;
      varying float vSoftness;

      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        if (d > 0.5) discard;

        // Soft feathered edge; foreground flakes have softer bokeh falloff
        float radial = 1.0 - smoothstep(0.5 - vSoftness, 0.5, d);
        float layerOpacity = vLayer < 0.5 ? 0.34 : (vLayer < 1.5 ? 0.56 : 0.42);
        float alpha = radial * vAlpha * layerOpacity * uOpacityScale;

        // Cool icy-white tint that never over-drives bloom
        vec3 snowColor = mix(vec3(0.76, 0.87, 0.96), vec3(0.92, 0.96, 1.0), radial);
        gl_FragColor = vec4(snowColor, alpha);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'LayeredSnowfall';
  points.frustumCulled = false;
  return points;
}

