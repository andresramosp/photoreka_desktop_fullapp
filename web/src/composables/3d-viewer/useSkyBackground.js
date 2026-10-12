import * as THREE from "three";
import { markRaw } from "vue";

/**
 * Sky background for the 3D atlas: a camera-locked gradient dome with a soft
 * sun glow plus a field of drifting procedural cloud sprites.
 */

export const SKY_BACKGROUND_ID = "sky";
// Used as the renderer clear color so any uncovered pixel matches the horizon.
export const SKY_HORIZON_COLOR = "#c3dcfa";

const SKY_COLORS = {
  zenith: "#2c6bd1",
  horizon: SKY_HORIZON_COLOR,
  ground: "#dde8f5",
  sun: "#fff1cc",
};

const DEFAULTS = {
  cloudCount: 48,
  textureVariants: 4,
  textureSize: 256,
  minRadius: 260,
  maxRadius: 620,
  minY: -140,
  maxY: 220,
  minWidth: 90,
  maxWidth: 280,
  minOpacity: 0.7,
  maxOpacity: 0.95,
  // world units per second
  minDrift: 0.4,
  maxDrift: 1.6,
};

// ---------------------------------------------------------------------------
// Procedural cloud texture (value-noise fBm inside a soft elliptical mask)
// ---------------------------------------------------------------------------

const hash2 = (ix, iy, seed) => {
  let h =
    Math.imul(ix, 374761393) ^
    Math.imul(iy, 668265263) ^
    Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};

const smooth = (t) => t * t * (3 - 2 * t);

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return smooth(t);
};

const valueNoise = (x, y, seed) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};

const fbm = (x, y, seed) => {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < 5; i++) {
    value +=
      amplitude * valueNoise(x * frequency, y * frequency, seed + i * 17);
    frequency *= 2;
    amplitude *= 0.5;
  }
  return value;
};

const createCloudTexture = (seed, size) => {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const offset = seed * 7.31;

  for (let py = 0; py < size; py++) {
    const ny = (py / size - 0.5) * 2;
    for (let px = 0; px < size; px++) {
      const nx = (px / size - 0.5) * 2;
      const r = Math.sqrt(nx * nx + ny * ny * 2.6);
      const mask = smoothstep(1.0, 0.3, r);
      const n = fbm((px / size) * 4 + offset, (py / size) * 4 + offset, seed);
      const density = n * mask + mask * 0.22;
      const alpha = smoothstep(0.38, 0.72, density);

      // Lighter on top, faint blue-grey shading underneath
      const light = 0.8 + 0.2 * (0.5 - ny * 0.5);
      const idx = (py * size + px) * 4;
      data[idx] = 255 * light;
      data[idx + 1] = 255 * Math.min(1, light + 0.02);
      data[idx + 2] = 255 * Math.min(1, light + 0.07);
      data[idx + 3] = 255 * alpha;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
};

// ---------------------------------------------------------------------------
// Sky dome shader
// ---------------------------------------------------------------------------

const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h >= 0.0
      ? mix(uHorizon, uZenith, pow(h, 0.55))
      : mix(uHorizon, uGround, smoothstep(0.0, 0.35, -h));
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSun * (pow(s, 48.0) * 0.55 + pow(s, 6.0) * 0.12);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const createSkyDome = () => {
  const geometry = new THREE.SphereGeometry(500, 32, 16);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(SKY_COLORS.zenith) },
      uHorizon: { value: new THREE.Color(SKY_COLORS.horizon) },
      uGround: { value: new THREE.Color(SKY_COLORS.ground) },
      uSun: { value: new THREE.Color(SKY_COLORS.sun) },
      uSunDir: { value: new THREE.Vector3(0.35, 0.45, -0.8) },
    },
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  material.precision = "mediump";
  const dome = new THREE.Mesh(geometry, material);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.name = "SkyDome";
  return dome;
};

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useSkyBackground(options = {}) {
  const config = { ...DEFAULTS, ...options };

  const group = markRaw(new THREE.Group());
  group.name = "SkyBackground";

  let built = false;
  let dome = null;
  let textures = [];
  let clouds = [];
  let lastTime = 0;

  const rand = (min, max) => min + Math.random() * (max - min);

  const build = () => {
    if (built) return;
    built = true;

    dome = createSkyDome();
    group.add(dome);

    textures = Array.from({ length: config.textureVariants }, (_, i) =>
      createCloudTexture(i + 1, config.textureSize),
    );

    for (let i = 0; i < config.cloudCount; i++) {
      const material = new THREE.SpriteMaterial({
        map: textures[i % textures.length],
        transparent: true,
        depthWrite: false,
        opacity: rand(config.minOpacity, config.maxOpacity),
        fog: false,
      });
      const sprite = new THREE.Sprite(material);

      const angle = Math.random() * Math.PI * 2;
      const radius = rand(config.minRadius, config.maxRadius);
      const width = rand(config.minWidth, config.maxWidth);
      sprite.position.set(
        Math.cos(angle) * radius,
        rand(config.minY, config.maxY),
        Math.sin(angle) * radius,
      );
      sprite.scale.set(width, width * 0.55, 1);
      sprite.renderOrder = -900;
      sprite.userData.drift = rand(config.minDrift, config.maxDrift);
      sprite.userData.angle = angle;
      sprite.userData.radius = radius;

      group.add(sprite);
      clouds.push(sprite);
    }
  };

  const update = (camera, now = performance.now()) => {
    if (!built || !camera) return;
    const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0;
    lastTime = now;

    dome.position.copy(camera.position);

    if (delta === 0) return;
    for (const cloud of clouds) {
      const data = cloud.userData;
      // Drift slowly around the scene so clouds never leave the field
      data.angle += (data.drift / data.radius) * delta;
      cloud.position.x = Math.cos(data.angle) * data.radius;
      cloud.position.z = Math.sin(data.angle) * data.radius;
    }
  };

  const dispose = () => {
    for (const cloud of clouds) {
      cloud.material.dispose();
      group.remove(cloud);
    }
    clouds = [];
    for (const texture of textures) texture.dispose();
    textures = [];
    if (dome) {
      dome.geometry.dispose();
      dome.material.dispose();
      group.remove(dome);
      dome = null;
    }
    built = false;
    lastTime = 0;
  };

  return { group, build, update, dispose };
}
