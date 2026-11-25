import * as THREE from 'three';

export function createWireframeRevealMaterial() {
  return new THREE.ShaderMaterial({
    wireframe: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uHoverPoint: { value: new THREE.Vector3(0, 0.6, 0) },
      uHoverAlpha: { value: 0.0 },
      uRadius: { value: 0.46 },
      uTime: { value: 0.0 },
      uStructureAlpha: { value: 0.0 },
      uPartHighlight: { value: 1.0 },
      uCyanCore: { value: new THREE.Color('#7ce8ff') },
      uCyanEdge: { value: new THREE.Color('#2874a6') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uHoverPoint;
      uniform float uHoverAlpha;
      uniform float uRadius;
      uniform float uTime;
      uniform float uStructureAlpha;
      uniform float uPartHighlight;
      uniform vec3 uCyanCore;
      uniform vec3 uCyanEdge;

      varying vec3 vWorldPos;

      float hash31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      float noise3D(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
        float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

        float nx00 = mix(n000, n100, f.x);
        float nx10 = mix(n010, n110, f.x);
        float nx01 = mix(n001, n101, f.x);
        float nx11 = mix(n011, n111, f.x);

        float nxy0 = mix(nx00, nx10, f.y);
        float nxy1 = mix(nx01, nx11, f.y);

        return mix(nxy0, nxy1, f.z);
      }

      float fbm3(vec3 p) {
        float v = 0.0;
        v += 0.55 * noise3D(p);
        v += 0.30 * noise3D(p * 2.13 + vec3(1.7, 9.2, 4.1));
        v += 0.15 * noise3D(p * 4.27 - vec3(3.1, 2.4, 7.8));
        return v;
      }

      void main() {
        float dist = length(vWorldPos - uHoverPoint);

        // Organic irregular mask perturbation
        float organic = fbm3(vWorldPos * 4.6 + vec3(0.0, uTime * 0.18, uTime * 0.12));
        float warpedDist = dist + (organic - 0.5) * 0.24;

        // Soft feathered boundary
        float hoverMask = smoothstep(uRadius, uRadius * 0.14, warpedDist) * uHoverAlpha;

        // Subtle scan wave pulsing outward from cursor hit
        float wave = 0.5 + 0.5 * sin(dist * 26.0 - uTime * 3.8);
        float shimmer = mix(0.76, 1.15, wave * hoverMask);

        // Structure exploration mode subtle global/part wireframe
        float structMask = uStructureAlpha * uPartHighlight * (0.62 + 0.24 * sin(vWorldPos.y * 14.0 - uTime * 2.2));

        float alpha = clamp(max(hoverMask * 0.76, structMask * 0.78), 0.0, 0.88);
        if (alpha < 0.01) discard;

        vec3 color = mix(uCyanEdge, uCyanCore, clamp(hoverMask * shimmer + structMask * 0.75, 0.0, 1.0));
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

