// Ember Yard: a 44 x 30 m industrial yard at dusk. Two bomb sites — the Foundry
// (A, west) and the Depot (B, east) — reached by a west lane, an east lane and a
// mid connector. Attackers spawn south, defenders north. Every box is a collider
// for movement and a surface a bullet stops on. Waypoints form the graph the bots
// walk; edges are computed here by sampling the segment between two nodes.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint positions (x, z). Lanes, sites, corners and spawns.
const WAYPOINTS = [
  [-4, 13], [0, 13], [4, 13], // attacker spawn
  [-4, 8], [0, 8], [4, 8], // south yard
  [-14, 8], [14, 8], // lane mouths
  [-6, 2], [0, 2], [6, 2], // mid connector
  [-14, 2], [14, 2], // lane middles
  [-4, -3], [0, -3], [4, -3], // north mid
  [-14, -4], [14, -4], // lane ends
  [-19, 4], [19, 4], // outer corners
  [-19, -13], [19, -13], // north corners
  [-18, -11], [-14, -11], [-16, -7], // A site
  [18, -11], [14, -11], [16, -7], // B site
  [-8, -13], [0, -13], [8, -13], // defender spawn
];

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const emberGlow = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ff7a1a'),
    emissive: new THREE.Color('#ff5a00'),
    emissiveIntensity: 1.6,
    roughness: 0.6,
  });
  const steelGlow = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#5b8dd9'),
    emissive: new THREE.Color('#2f6fd0'),
    emissiveIntensity: 1.2,
    roughness: 0.6,
  });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Floor and outer walls, 44 x 30 m, 4.5 m high, open to the dusk sky.
  box(44.4, 0.4, 30.4, 0, -0.2, 0, 'canvas');
  box(0.4, 4.5, 30.4, -22.2, 2.25, 0, 'surface');
  box(0.4, 4.5, 30.4, 22.2, 2.25, 0, 'surface');
  box(44.4, 4.5, 0.4, 0, 2.25, -15.2, 'surface');
  box(44.4, 4.5, 0.4, 0, 2.25, 15.2, 'surface');

  // Mid block: a long container wall splitting mid into two doors.
  box(10, 3.4, 2.2, -5.4, 1.7, -2, 'surface');
  box(10, 3.4, 2.2, 5.4, 1.7, -2, 'surface');
  box(2.4, 2.4, 2.4, 0, 1.2, -2, 'hairline');

  // Containers and crates: cover on every lane.
  box(2.4, 2.4, 2.4, -14, 1.2, 5, 'hairline');
  box(2.4, 2.4, 2.4, 14, 1.2, 5, 'hairline');
  box(1.2, 1.2, 1.2, -11.6, 0.6, -1, 'hairline');
  box(1.2, 1.2, 1.2, 11.6, 0.6, -1, 'hairline');
  box(1.2, 1.2, 1.2, -7.6, 0.6, 6.4, 'hairline');
  box(1.2, 1.2, 1.2, 7.6, 0.6, 6.4, 'hairline');
  box(3.6, 1.1, 1.2, -4.4, 0.55, 5.4, 'hairline');
  box(3.6, 1.1, 1.2, 4.4, 0.55, 5.4, 'hairline');
  box(2.4, 2.4, 2.4, -19, 1.2, -6, 'surface');
  box(2.4, 2.4, 2.4, 19, 1.2, -6, 'surface');
  box(1.6, 0.9, 1.6, -10, 0.45, -8.4, 'hairline');
  box(1.6, 0.9, 1.6, 10, 0.45, -8.4, 'hairline');

  // Raised firing ledges at mid-south: a sightline worth holding.
  box(6, 0.9, 2.4, -8, 0.45, 9.5, 'surface');
  box(6, 0.9, 2.4, 8, 0.45, 9.5, 'surface');

  // A site: the Foundry. A furnace block with a glowing mouth, flanked by stacks.
  box(3.2, 3.0, 1.6, -19.5, 1.5, -12.5, 'surface');
  const furnaceMouth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.2), emberGlow);
  furnaceMouth.position.set(-19.5, 1.1, -11.6);
  group.add(furnaceMouth);
  box(1.6, 2.2, 1.6, -13.5, 1.1, -12.8, 'hairline');
  box(1.6, 1.1, 1.6, -13.5, 0.55, -10.6, 'hairline');

  // B site: the Depot. Stacked containers under a steel-blue beacon.
  box(2.4, 2.4, 2.4, 19.5, 1.2, -12.5, 'surface');
  box(2.4, 2.4, 2.4, 19.5, 3.6, -12.5, 'hairline');
  box(1.6, 1.1, 1.6, 13.5, 0.55, -12.8, 'hairline');
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.5), steelGlow);
  beacon.position.set(16, 1.3, -13.8);
  group.add(beacon);

  // Site floor plates, painted so the objective reads at a glance.
  const plateA = new THREE.Mesh(new THREE.BoxGeometry(7, 0.06, 7), materials.accent);
  plateA.position.set(-16, 0.03, -10);
  plateA.receiveShadow = true;
  group.add(plateA);
  const plateB = new THREE.Mesh(new THREE.BoxGeometry(7, 0.06, 7), materials.foe);
  plateB.position.set(16, 0.03, -10);
  plateB.receiveShadow = true;
  group.add(plateB);

  // Dusk light: a low warm key from the west, a cool fill from the north-east,
  // and a warm sky/ground gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a6a4a'), new THREE.Color('#191512'), 1.0);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb066'), 2.4);
  key.position.set(-18, 12, 10);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5b8dd9'), 0.5);
  fill.position.set(14, 10, -12);
  scene.add(fill);

  // Waypoint graph: nodes are the positions above; two nodes link when the
  // straight walk between them stays clear of every collider at body height.
  const probe = new THREE.Box3();
  function pointClear(x, z) {
    probe.min.set(x - 0.45, 0.05, z - 0.45);
    probe.max.set(x + 0.45, 1.7, z + 0.45);
    for (const collider of colliders) {
      if (collider.max.y < 0.1) continue; // the floor never blocks a walk
      if (probe.intersectsBox(collider)) return false;
    }
    return true;
  }
  function segmentClear(ax, az, bx, bz) {
    const distance = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(distance / 0.5));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      if (!pointClear(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }
  const nodes = WAYPOINTS.map(([x, z]) => ({ x, z, edges: [] }));
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const distance = Math.hypot(b.x - a.x, b.z - a.z);
      if (distance > 9.5) continue;
      if (!segmentClear(a.x, a.z, b.x, b.z)) continue;
      a.edges.push(j);
      b.edges.push(i);
    }
  }

  return {
    colliders,
    shootables,
    group,
    nodes,
    spawns: {
      attackers: [[-4, 13], [0, 13], [4, 13]],
      defenders: [[-8, -13], [0, -13], [8, -13]],
    },
    sites: {
      A: { name: 'Foundry', min: new THREE.Vector3(-19.5, 0, -13.5), max: new THREE.Vector3(-12.5, 3, -6.5) },
      B: { name: 'Depot', min: new THREE.Vector3(12.5, 0, -13.5), max: new THREE.Vector3(19.5, 3, -6.5) },
    },
    // Nearest waypoint index to a position; bots navigate the graph from it.
    nearestNode(x, z) {
      let best = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < nodes.length; i += 1) {
        const d = Math.hypot(nodes[i].x - x, nodes[i].z - z);
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      }
      return best;
    },
    // Breadth-first route through the waypoint graph, as a list of node indices.
    route(from, to) {
      if (from === to) return [to];
      const prev = new Array(nodes.length).fill(-1);
      const queue = [from];
      prev[from] = from;
      while (queue.length > 0) {
        const current = queue.shift();
        for (const next of nodes[current].edges) {
          if (prev[next] !== -1) continue;
          prev[next] = current;
          if (next === to) {
            const path = [to];
            let at = to;
            while (at !== from) {
              at = prev[at];
              path.unshift(at);
            }
            return path;
          }
          queue.push(next);
        }
      }
      return [to];
    },
  };
}
