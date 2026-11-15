// The charge: carried, dropped, planted, or gone. One module owns the state and
// the blinking box the world sees; main.js and the bots drive the channels.
// Planting takes 3 seconds in a site zone and the fuse runs 35 seconds. The
// defuse channel lives in bots.js (a defender channels beside the charge);
// only the round machine decides what a detonation or a defuse means.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const FUSE_TIME = 35;

export function createBomb(scene, map) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.26),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 }),
  );
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a00') }),
  );
  light.position.set(0, 0.14, 0);
  mesh.add(light);
  mesh.visible = false;
  mesh.castShadow = true;
  scene.add(mesh);

  const state = {
    mode: 'carried', // carried | dropped | planted
    carrier: 'player', // 'player' | bot object | null
    position: new THREE.Vector3(),
    site: null, // 'A' | 'B'
    fuseLeft: FUSE_TIME,
    plantLeft: 0,
    blink: 0,
  };

  function inZone(position, siteKey) {
    const site = map.sites[siteKey];
    return position.x >= site.min.x && position.x <= site.max.x
      && position.z >= site.min.z && position.z <= site.max.z;
  }

  return {
    state,
    inZone,
    reset() {
      state.mode = 'carried';
      state.carrier = 'player';
      state.site = null;
      state.fuseLeft = FUSE_TIME;
      state.plantLeft = 0;
      mesh.visible = false;
    },
    drop(position) {
      state.mode = 'dropped';
      state.carrier = null;
      state.position.copy(position);
      state.position.y = 0.12;
      mesh.position.copy(state.position);
      mesh.visible = true;
    },
    pickup(carrier) {
      state.mode = 'carried';
      state.carrier = carrier;
      mesh.visible = false;
    },
    // A bot that channelled the full plant time in a site zone.
    plantBy(carrier, siteKey) {
      state.mode = 'planted';
      state.carrier = null;
      state.site = siteKey;
      state.position.copy(carrier.position);
      state.position.y = 0.12;
      state.fuseLeft = FUSE_TIME;
      state.plantLeft = 0;
      mesh.position.copy(state.position);
      mesh.visible = true;
    },
    // The carrier stands in a site zone holding the plant key. The carrier is
    // a tag ('player' or a bot object); the position is passed separately so
    // the tag never has to be an object. Returns true the moment the plant
    // completes.
    plantStep(dt, carrier, position, siteKey) {
      if (state.mode !== 'carried' || state.carrier !== carrier) return false;
      if (!inZone(position, siteKey)) {
        state.plantLeft = 0;
        return false;
      }
      state.plantLeft += dt;
      if (state.plantLeft >= PLANT_TIME) {
        state.mode = 'planted';
        state.site = siteKey;
        state.position.copy(position);
        state.position.y = 0.12;
        state.fuseLeft = FUSE_TIME;
        state.plantLeft = 0;
        mesh.position.copy(state.position);
        mesh.visible = true;
        return true;
      }
      return false;
    },
    plantProgress() {
      return state.plantLeft / PLANT_TIME;
    },
    cancelChannel() {
      state.plantLeft = 0;
    },
    // Ticks the fuse. Returns 'detonated' on the frame it blows.
    tick(dt) {
      if (state.mode !== 'planted') return null;
      state.fuseLeft -= dt;
      state.blink += dt;
      light.visible = Math.sin(state.blink * (state.fuseLeft < 10 ? 14 : 6)) > 0;
      if (state.fuseLeft <= 0) return 'detonated';
      return null;
    },
  };
}
