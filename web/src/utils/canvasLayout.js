// utils/canvasLayout.js
//
// Pure layout passes over canvas photo configs ({ x, y, width, height }).
// They mutate the configs in place and know nothing about Konva or Vue, so the
// same code lays out the real board and the read-only dashboard previews.

/**
 * Pushes photos apart until their centres sit at least `packing` × their
 * combined half-size (+ `margin`) from each other (repulsion simulation).
 * At the defaults nothing overlaps, which is what the canvas "unstack" button
 * wants; a `packing` below 1 leaves them partly overlapping, like prints
 * spread on a table.
 */
export function relaxOverlaps(configs, { margin = 20, packing = 1 } = {}) {
  if (configs.length < 2) return;

  const iterations = 150;
  const repulsionStrength = 200;
  const damping = 0.85;
  const minMargin = margin;
  const convergenceThreshold = 0.05;

  const velocities = configs.map(() => ({ x: 0, y: 0 }));

  let converged = false;
  let iteration = 0;

  while (iteration < iterations && !converged) {
    const forces = configs.map(() => ({ x: 0, y: 0 }));
    let maxForce = 0;

    for (let i = 0; i < configs.length; i++) {
      for (let j = i + 1; j < configs.length; j++) {
        const a = configs[i];
        const b = configs[j];

        const dx = b.x + b.width / 2 - (a.x + a.width / 2);
        const dy = b.y + b.height / 2 - (a.y + a.height / 2);
        const distance = Math.sqrt(dx * dx + dy * dy);

        const minDistance =
          packing *
            Math.max((a.width + b.width) / 2, (a.height + b.height) / 2) +
          minMargin;

        if (distance < minDistance && distance > 0) {
          const overlap = (minDistance - distance) / minDistance;
          const forceStrength = overlap * overlap * repulsionStrength;
          const forceX = (dx / distance) * forceStrength;
          const forceY = (dy / distance) * forceStrength;

          forces[i].x -= forceX;
          forces[i].y -= forceY;
          forces[j].x += forceX;
          forces[j].y += forceY;

          maxForce = Math.max(maxForce, Math.abs(forceX), Math.abs(forceY));
        }
      }
    }

    for (let i = 0; i < configs.length; i++) {
      velocities[i].x = (velocities[i].x + forces[i].x * 0.05) * damping;
      velocities[i].y = (velocities[i].y + forces[i].y * 0.05) * damping;
      configs[i].x += velocities[i].x;
      configs[i].y += velocities[i].y;
    }

    converged = maxForce < convergenceThreshold;
    iteration++;
  }
}

// Deterministic jitter so the same photo set always settles into the same
// cluster: the preview must not shuffle on every re-render, and the board the
// user opens has to match what they clicked on.
function seededRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

// How tightly the seed cluster packs: centres end up this fraction of the
// no-overlap distance apart, so neighbours overlap by roughly the remainder.
const CLUSTER_PACKING = 0.88;
// Initial scatter radius, in photo widths. Wide enough that the repulsion has
// distinct directions to work with — from a tight stack it fans out along a
// few axes and reads as a grid.
const CLUSTER_SCATTER = 0.9;

/**
 * Lays photos out as a loose round pile: scattered around the origin with a
 * seeded offset, then relaxed until they only partly overlap. Returns full
 * canvas configs.
 * @param {{ id: number|string, width: number, height: number }[]} sizes
 */
export function clusterLayout(sizes) {
  const seed = sizes.reduce((acc, s) => (acc * 31 + Number(s.id)) >>> 0, 7);
  const random = seededRandom(seed);
  const configs = sizes.map((s, index) => {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * CLUSTER_SCATTER * s.width;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      width: s.width,
      height: s.height,
      opacity: 1,
      zIndex: index + 1,
    };
  });
  relaxOverlaps(configs, { margin: 0, packing: CLUSTER_PACKING });
  return sizes.map((s, index) => ({ id: s.id, config: configs[index] }));
}
