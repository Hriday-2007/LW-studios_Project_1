import * as THREE from 'three';

export function createWinterSkyDome() {
  const geometry = new THREE.SphereGeometry(55, 48, 32);

  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenithColor: { value: new THREE.Color('#060f1c') },
      uMidColor: { value: new THREE.Color('#0f2033') },
      uHorizonColor: { value: new THREE.Color('#192f44') },
      uIceGlowColor: { value: new THREE.Color('#2d5975') },
      uWarmHorizonColor: { value: new THREE.Color('#272c3c') },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenithColor;
      uniform vec3 uMidColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uIceGlowColor;
      uniform vec3 uWarmHorizonColor;
      uniform float uTime;

      varying vec3 vWorldDir;

      void main() {
        float h = clamp(vWorldDir.y, -0.25, 1.0);
        float upperMix = smoothstep(0.0, 0.65, max(h, 0.0));
        float horizonBand = exp(-abs(h - 0.02) * 8.5);
        float midMix = smoothstep(0.0, 0.26, max(h, 0.0));

        vec3 sky = mix(uHorizonColor, uMidColor, midMix);
        sky = mix(sky, uZenithColor, upperMix);

        // Subtle directional overcast dusk scatter without visible clouds
        float sunAzimuth = clamp(dot(normalize(vec2(vWorldDir.x, vWorldDir.z)), normalize(vec2(-0.65, -0.76))), 0.0, 1.0);
        sky = mix(sky, uIceGlowColor, horizonBand * 0.34);
        sky += uWarmHorizonColor * pow(sunAzimuth, 3.0) * horizonBand * 0.22;

        // Lower hemisphere blends smoothly into deep water horizon
        if (h < 0.0) {
          sky = mix(sky, vec3(0.03, 0.07, 0.12), smoothstep(0.0, -0.18, h));
        }

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'WinterSkyDome';
  mesh.renderOrder = -10;
  return mesh;
}

