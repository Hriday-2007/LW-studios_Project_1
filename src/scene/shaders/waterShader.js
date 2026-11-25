import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export function createWinterWater({ textureWidth = 1024, textureHeight = 1024, multisample = 4 } = {}) {
  const geometry = new THREE.CircleGeometry(30, 96);

  const waterShader = {
    name: 'WinterWaterReflectorShader',
    uniforms: {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      uTime: { value: 0 },
      uMotionFactor: { value: 1.0 },
      uDeepColor: { value: new THREE.Color('#07111d') },
      uSlateColor: { value: new THREE.Color('#12263a') },
      uHorizonColor: { value: new THREE.Color('#192f44') },
      uIceHighlight: { value: new THREE.Color('#8be0ff') },
      uCameraPos: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix;
      varying vec4 vUv;
      varying vec3 vWorldPos;

      #include <common>
      #include <logdepthbuf_pars_vertex>

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        vUv = textureMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;

        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uMotionFactor;
      uniform vec3 uDeepColor;
      uniform vec3 uSlateColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uIceHighlight;
      uniform vec3 uCameraPos;

      varying vec4 vUv;
      varying vec3 vWorldPos;

      #include <logdepthbuf_pars_fragment>

      // Multi-directional gentle winter ripple heightfield
      float waveHeight(vec2 p, float t) {
        float h = 0.0;
        h += sin(dot(p, vec2(3.8, 2.1)) + t * 0.95) * 0.34;
        h += sin(dot(p, vec2(-2.9, 4.3)) - t * 0.78) * 0.26;
        h += sin(dot(p, vec2(6.4, -3.7)) + t * 1.25) * 0.14;
        h += sin(dot(p, vec2(-7.8, -5.2)) - t * 1.45) * 0.09;

        // Subtle capillary rings around the waterside stilts
        float r = length(p - vec2(0.0, 0.08));
        float ringMask = exp(-r * 0.95);
        h += sin(r * 16.0 - t * 1.55) * 0.14 * ringMask;
        return h;
      }

      vec3 computeRippleNormal(vec2 p, float t) {
        float eps = 0.025;
        float hL = waveHeight(p - vec2(eps, 0.0), t);
        float hR = waveHeight(p + vec2(eps, 0.0), t);
        float hD = waveHeight(p - vec2(0.0, eps), t);
        float hU = waveHeight(p + vec2(0.0, eps), t);
        float strength = 0.055;
        return normalize(vec3((hL - hR) * strength / eps, 1.0, (hD - hU) * strength / eps));
      }

      void main() {
        #include <logdepthbuf_fragment>

        float t = uTime * uMotionFactor;
        vec2 wp = vWorldPos.xz;
        float distCenter = length(wp);

        // Dampen ripples smoothly in the far distance to prevent shimmering aliasing
        float rippleAtten = 1.0 - smoothstep(2.5, 13.0, distCenter);
        vec3 N = normalize(mix(vec3(0.0, 1.0, 0.0), computeRippleNormal(wp, t), rippleAtten));
        vec3 V = normalize(uCameraPos - vWorldPos);

        // Perspective-correct planar reflection UV distortion
        vec4 projUv = vUv;
        float distortionScale = (0.042 * rippleAtten + 0.008) * max(projUv.w, 0.5);
        projUv.x += N.x * distortionScale;
        projUv.y += N.z * distortionScale * 0.7;

        vec3 reflection = texture2DProj(tDiffuse, projUv).rgb;

        // Physical Fresnel curve for dark winter water
        float NdotV = clamp(dot(N, V), 0.0, 1.0);
        float fresnel = clamp(0.11 + 0.85 * pow(1.0 - NdotV, 3.4), 0.11, 0.94);

        // Subtle shallow slate-jade tint close to the pavilion dock, deeper midnight outward
        float basinMix = exp(-distCenter * 0.85);
        vec3 waterBody = mix(uDeepColor, uSlateColor, basinMix * 0.85);

        vec3 composed = mix(waterBody, reflection * color, fresnel);

        // Cool overcast icy-cyan specular glints across wave crests
        vec3 lightDir = normalize(vec3(-0.55, 0.72, 0.42));
        vec3 H = normalize(lightDir + V);
        float spec = pow(max(dot(N, H), 0.0), 68.0) * rippleAtten;
        composed += uIceHighlight * spec * 0.28;

        // Secondary crisp rim reflection from back icy-cyan sky
        vec3 rimDir = normalize(vec3(0.45, 0.52, -0.72));
        vec3 H2 = normalize(rimDir + V);
        float spec2 = pow(max(dot(N, H2), 0.0), 42.0) * rippleAtten;
        composed += uIceHighlight * spec2 * 0.16;

        // Seamless radial atmospheric mist blend into the winter horizon
        float fogDist = length(uCameraPos - vWorldPos);
        float fogFactor = 1.0 - exp(-pow(fogDist * 0.048, 1.65));
        float radialEdge = smoothstep(10.0, 26.0, distCenter);
        composed = mix(composed, uHorizonColor, clamp(max(fogFactor, radialEdge), 0.0, 1.0));

        gl_FragColor = vec4(composed, 1.0);
      }
    `,
  };

  const reflector = new Reflector(geometry, {
    clipBias: 0.0025,
    textureWidth,
    textureHeight,
    color: 0xd8eaf7,
    multisample,
    shader: waterShader,
  });

  reflector.rotation.x = -Math.PI * 0.5;
  reflector.position.y = 0.0218;
  reflector.name = 'WinterReflectiveWater';

  return reflector;
}

