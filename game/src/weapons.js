// Weapons: three guns and a grenade. The module owns the numbers, the view
// models and the magazine state; main.js owns the ray and the damage. Every gun
// punishes firing on the move: spread grows with ground speed, and each shot
// kicks the view. The pistol is free; the rifle and SMG are bought between rounds.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPON_DEFS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0,
    damage: 34, headMult: 3, mag: 12, reserve: 48,
    gap: 0.14, reload: 1.4, auto: false,
    spreadStill: 0.004, spreadMoving: 0.03, kick: 0.011, moveReference: 5.2,
  },
  rifle: {
    id: 'rifle', name: 'VK-7 Rifle', price: 2700,
    damage: 34, headMult: 4, mag: 30, reserve: 90,
    gap: 0.096, reload: 1.9, auto: true,
    spreadStill: 0.0022, spreadMoving: 0.028, kick: 0.013, moveReference: 5.2,
  },
  smg: {
    id: 'smg', name: 'Raptor SMG', price: 1500,
    damage: 26, headMult: 3, mag: 32, reserve: 96,
    gap: 0.07, reload: 1.7, auto: true,
    spreadStill: 0.006, spreadMoving: 0.034, kick: 0.009, moveReference: 5.2,
  },
};

const GRENADE_FUSE = 1.6;
const GRENADE_RADIUS = 6;
const GRENADE_DAMAGE = 110;

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  const model = new THREE.Group();
  if (def.id === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.24), body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.08), grip);
    handle.position.set(0, -0.09, 0.08);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), accent);
    sight.position.set(0, 0.05, -0.1);
    model.add(slide, handle, sight);
  } else if (def.id === 'rifle') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), accent);
    sight.position.set(0, 0.07, -0.1);
    model.add(receiver, barrel, stock, sight);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 0.3), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.28), grip);
    barrel.position.set(0, 0.02, -0.26);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.07), grip);
    mag.position.set(0, -0.12, -0.02);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.16), accent);
    stock.position.set(0, -0.01, 0.22);
    model.add(receiver, barrel, mag, stock);
  }
  model.position.set(0.24, -0.2, -0.42);
  return model;
}

export function createWeaponSet(camera) {
  const models = {};
  for (const def of Object.values(WEAPON_DEFS)) {
    models[def.id] = buildViewModel(def);
    models[def.id].visible = false;
    camera.add(models[def.id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = { pistol: true, rifle: false, smg: false };
  const state = {
    current: 'pistol',
    mag: WEAPON_DEFS.pistol.mag,
    reserve: WEAPON_DEFS.pistol.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    switchLeft: 0,
    grenades: 0,
  };
  models.pistol.visible = true;

  function def() {
    return WEAPON_DEFS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.switchLeft = Math.max(0, state.switchLeft - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2 + (state.switchLeft > 0 ? 0.5 : 0);
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    const d = def();
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (d.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = d.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    owned,
    def,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.switchLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || state.mag === d.mag || state.reserve === 0) return;
      state.reloadLeft = d.reload;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / d.moveReference) * d.spreadMoving;
    },
    switchTo(id) {
      if (!owned[id] || id === state.current || state.switchLeft > 0) return false;
      models[state.current].visible = false;
      state.current = id;
      state.mag = WEAPON_DEFS[id].mag;
      state.reserve = WEAPON_DEFS[id].reserve;
      state.reloadLeft = 0;
      state.cooldown = 0;
      state.switchLeft = 0.35;
      models[id].visible = true;
      return true;
    },
    useGrenade() {
      if (state.grenades <= 0) return false;
      state.grenades -= 1;
      return true;
    },
    // A new round refills every magazine; owned guns stay owned.
    refill() {
      const d = def();
      state.mag = d.mag;
      state.reserve = d.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.switchLeft = 0;
    },
  };
}

// A thrown spark grenade: an arc, a bounce, then a blast. main.js steps the list
// and resolves the explosion through combat.
export function createGrenades(scene, colliders) {
  const list = [];
  const meshGeometry = new THREE.SphereGeometry(0.09, 10, 8);
  const meshMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.3, emissive: new THREE.Color('#7a2d00'), emissiveIntensity: 0.8 });
  const probe = new THREE.Box3();

  function overlaps(x, y, z) {
    probe.min.set(x - 0.09, y - 0.09, z - 0.09);
    probe.max.set(x + 0.09, y + 0.09, z + 0.09);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  return {
    list,
    throwFrom(position, direction) {
      const mesh = new THREE.Mesh(meshGeometry, meshMaterial);
      mesh.position.copy(position);
      scene.add(mesh);
      list.push({
        mesh,
        velocity: direction.clone().multiplyScalar(11).add(new THREE.Vector3(0, 4.5, 0)),
        fuse: GRENADE_FUSE,
      });
    },
    // Steps every live grenade; returns the positions that exploded this step.
    step(dt) {
      const exploded = [];
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const g = list[i];
        g.fuse -= dt;
        g.velocity.y -= 14 * dt;
        const next = g.mesh.position.clone().addScaledVector(g.velocity, dt);
        const hit = overlaps(next.x, next.y, next.z);
        if (hit) {
          // Bounce off the face the grenade met: reflect the dominant axis.
          const center = hit.getCenter(new THREE.Vector3());
          const dx = Math.abs(next.x - center.x) / (hit.max.x - hit.min.x || 1);
          const dz = Math.abs(next.z - center.z) / (hit.max.z - hit.min.z || 1);
          if (g.velocity.y < 0 && next.y < hit.max.y + 0.2) g.velocity.y = Math.abs(g.velocity.y) * 0.4;
          else if (dx > dz) g.velocity.x *= -0.4;
          else g.velocity.z *= -0.4;
          g.velocity.multiplyScalar(0.7);
        } else {
          g.mesh.position.copy(next);
        }
        if (g.mesh.position.y < 0.09) {
          g.mesh.position.y = 0.09;
          g.velocity.y = Math.abs(g.velocity.y) * 0.4;
          g.velocity.multiplyScalar(0.7);
        }
        if (g.fuse <= 0) {
          exploded.push(g.mesh.position.clone());
          scene.remove(g.mesh);
          list.splice(i, 1);
        }
      }
      return exploded;
    },
    radius: GRENADE_RADIUS,
    damage: GRENADE_DAMAGE,
    clear() {
      for (const g of list) scene.remove(g.mesh);
      list.length = 0;
    },
  };
}
