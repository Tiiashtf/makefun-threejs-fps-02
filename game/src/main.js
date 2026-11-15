// Ember Yard: boot and the one loop. A fixed 60 Hz simulation feeds a render at
// the display's rate. ?shot=start|play|buy|bomb with &seed=N stages a
// deterministic frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady. Everything random in the game comes from one seeded
// generator, so a shot with the same seed stages the same frame.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMap } from './map.js';
import { createMover } from './mover.js';
import { WEAPON_DEFS, createWeaponSet, createGrenades } from './weapons.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createRounds } from './rounds.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = shot ? mulberry32(seed) : mulberry32((Date.now() % 2147483647) || 1);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);

// A dusk sky dome: violet overhead, ember at the horizon, canvas colour below
// it. It is a shader, so the fog never touches it, and it costs one draw.
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(120, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x241f33) },
      horizon: { value: new THREE.Color(0xc25a1e) },
      ground: { value: new THREE.Color(PALETTE.canvas) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vWorldPosition;
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 ground;
      void main() {
        float h = normalize(vWorldPosition).y;
        vec3 colour = h >= 0.0
          ? mix(horizon, zenith, pow(h, 0.55))
          : mix(horizon, ground, pow(-h, 0.5));
        gl_FragColor = vec4(colour, 1.0);
      }`,
  }),
);
scene.add(sky);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const combat = createCombat(scene, map.shootables);
const weapons = createWeaponSet(camera);
const grenades = createGrenades(scene, map.colliders);
const effects = createEffects(scene);
const hud = createHud();
const bomb = createBomb(scene, map);

// The player: a mover body, a weapon set, and an invisible hitbox the bots
// shoot at (two boxes, torso and head, following the feet).
const playerMover = createMover(map.colliders, -4, 13, 5.2);
const player = {
  id: 'player',
  name: 'You',
  team: 'attack',
  alive: true,
  health: 100,
  maxHealth: 100,
  position: playerMover.body.position,
  hitMeshes: [],
  onDeath: () => onPlayerDeath(),
  onDamage: () => hud.damageFlash(),
};
const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
const torsoHit = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.0, 0.34), hitMaterial);
torsoHit.position.y = 0.95;
torsoHit.userData.character = player;
torsoHit.userData.part = 'torso';
const headHit = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), hitMaterial);
headHit.position.y = 1.58;
headHit.userData.character = player;
headHit.userData.part = 'head';
const hitGroup = new THREE.Group();
hitGroup.add(torsoHit, headHit);
scene.add(hitGroup);
player.hitMeshes = [torsoHit, headHit];
combat.register(player);

const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let buyOpen = false;
let matchStarted = false;

const game = {
  bomb: bomb.state,
  attackSite: 'A',
  player,
  onBotShot(bot, result) {
    // A bot's muzzle flash: a tracer from its chest toward where the round went.
    tmpVec.copy(bot.position).setY(bot.position.y + 1.35);
    muzzle.copy(tmpVec).add(new THREE.Vector3(Math.sin(bot.mover.body.yaw), 0, Math.cos(bot.mover.body.yaw)).multiplyScalar(0.5));
    effects.tracer(muzzle, result.point);
    if (result.blocked) effects.spark(result.point, 4);
    if (result.killed && result.victim) {
      hud.killFeed(`${bot.name} ▸ ${result.victim.name}${result.part === 'head' ? ' (headshot)' : ''}`);
    }
  },
  onBotKilled(bot, killer) {
    if (killer && killer !== bot) {
      hud.killFeed(`${killer.name} ▸ ${bot.name}`);
    }
  },
  onBotPlanted(bot) {
    const site = bot.position.x < 0 ? 'A' : 'B';
    bomb.plantBy(bot, site);
    rounds.onPlant();
    hud.setBomb(`CHARGE PLANTED — ${map.sites[site].name}`, 1);
    hud.showBanner('Charge planted — hold the site');
    hud.killFeed(`${bot.name} planted the charge`);
  },
  onBotDefused() {
    rounds.endRound('defend', 'Charge defused');
  },
  onBombPickup(bot) {
    bomb.pickup(bot);
    hud.killFeed(`${bot.name} picked up the charge`);
  },
};

const bots = createBots(scene, map, combat, game);
bots.spawnAll();

const rounds = createRounds({
  random,
  bombPlanted: () => bomb.state.mode === 'planted',
  onRoundStart(round, site) {
    game.attackSite = site;
    resetForRound();
    hud.showBanner(`ROUND ${round} — Plant the charge at the ${map.sites[site].name}`);
    hud.setBuyVisible(true, rounds.state.money, {
      rifle: weapons.owned.rifle,
      smg: weapons.owned.smg,
      grenade: weapons.state.grenades > 0,
    });
    buyOpen = true;
  },
  onLive() {
    hud.setBuyVisible(false);
    buyOpen = false;
    hud.showBanner('Go — plant the charge', 1800);
  },
  onRoundEnd(winner, reason, score) {
    hud.setBuyVisible(false);
    buyOpen = false;
    hud.showOverlay(winner === 'attack' ? 'roundAttack' : 'roundDefend', `${reason}. Vanguard ${score.attack} — ${score.defend} Wardens.`);
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onMatchEnd(score) {
    const mode = score.attack > score.defend ? 'matchAttack' : score.defend > score.attack ? 'matchDefend' : 'matchDraw';
    hud.showOverlay(mode, `Final: Vanguard ${score.attack} — ${score.defend} Wardens. First to 4 takes the match.`);
    if (document.pointerLockElement) document.exitPointerLock();
  },
});

function resetForRound() {
  const spawn = map.spawns.attackers[0];
  playerMover.body.position.set(spawn[0], 0, spawn[1]);
  playerMover.body.velocity.set(0, 0, 0);
  playerMover.body.yaw = 0;
  playerMover.body.pitch = 0;
  player.alive = true;
  player.health = player.maxHealth;
  weapons.refill();
  grenades.clear();
  bomb.reset();
  bots.resetRound(game.attackSite);
  hud.setHealth(player.health);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
  hud.setMoney(rounds.state.money);
  hud.setScore(rounds.state.score.attack, rounds.state.score.defend, rounds.state.round);
  hud.setTimer(rounds.state.timer);
  hud.setAlive(bots.aliveCount('attack') + 1, bots.aliveCount('defend'));
  hud.setBomb('', null);
  hud.setPlant(null);
  hud.hideOverlay();
}

function onPlayerDeath() {
  if (bomb.state.mode === 'carried' && bomb.state.carrier === 'player') {
    bomb.drop(player.position);
    hud.killFeed('Charge dropped');
  }
  hud.showBanner('You are down — your squad fights on', 3000);
  if (document.pointerLockElement) document.exitPointerLock();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    matchStarted = true;
    hud.hideOverlay();
  } else if (matchStarted && rounds.state.phase !== 'matchEnd') {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (rounds.state.phase === 'lobby') {
    rounds.startMatch();
    matchStarted = true;
  } else if (rounds.state.phase === 'matchEnd') {
    rounds.startMatch();
    matchStarted = true;
  }
  input.requestLock();
});

function syncCamera() {
  const body = playerMover.body;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  hitGroup.position.set(body.position.x, body.position.y, body.position.z);
  hitGroup.scale.set(1, body.height / 1.72, 1);
}

function aimAt(point) {
  const body = playerMover.body;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function muzzlePoint() {
  camera.getWorldDirection(direction);
  muzzle.copy(camera.position)
    .addScaledVector(direction, 0.5)
    .add(new THREE.Vector3(0.24, -0.18, 0).applyQuaternion(camera.quaternion));
  return muzzle;
}

function shootPlayer() {
  const def = weapons.def();
  if (!weapons.takeRound()) return;
  camera.getWorldDirection(direction);
  const result = combat.shoot(player, camera.position, direction, weapons.spread(playerMover.groundSpeed()), def, random);
  effects.tracer(muzzlePoint(), result.point);
  if (result.blocked) effects.spark(result.point, 5);
  if (result.hit) {
    hud.hitMarker(result.killed);
    if (result.killed && result.victim) {
      rounds.onKill();
      hud.killFeed(`You ▸ ${result.victim.name}${result.part === 'head' ? ' (headshot)' : ''}`);
      hud.setMoney(rounds.state.money);
    }
  }
  weapons.pullTrigger();
  playerMover.recoil(def.kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  bots.hear(player.position.x, player.position.z, 'attack', elapsed);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, def.name);
}

function throwGrenade() {
  if (!weapons.useGrenade()) return;
  camera.getWorldDirection(direction);
  grenades.throwFrom(camera.position.clone().addScaledVector(direction, 0.6), direction);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
}

function handlePressed(codes) {
  for (const code of codes) {
    if (code === 'KeyR') weapons.reload();
    if (code === 'KeyG' && rounds.state.phase === 'live') throwGrenade();
    if (code === 'KeyB' && rounds.canBuy()) {
      buyOpen = !buyOpen;
      hud.setBuyVisible(buyOpen, rounds.state.money, {
        rifle: weapons.owned.rifle,
        smg: weapons.owned.smg,
        grenade: weapons.state.grenades > 0,
      });
    }
    if (code === 'KeyQ') {
      const owned = Object.keys(WEAPON_DEFS).filter((id) => weapons.owned[id]);
      const next = owned[(owned.indexOf(weapons.state.current) + 1) % owned.length];
      if (weapons.switchTo(next)) hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
    }
    if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') {
      const n = Number(code.slice(-1));
      if (buyOpen && rounds.canBuy()) {
        if (n === 1 && rounds.buyWeapon('rifle')) {
          weapons.owned.rifle = true;
          weapons.switchTo('rifle');
        } else if (n === 2 && rounds.buyWeapon('smg')) {
          weapons.owned.smg = true;
          weapons.switchTo('smg');
        } else if (n === 3 && weapons.state.grenades < 2 && rounds.buyGrenade()) {
          weapons.state.grenades += 1;
        }
        hud.setBuyVisible(true, rounds.state.money, {
          rifle: weapons.owned.rifle,
          smg: weapons.owned.smg,
          grenade: weapons.state.grenades > 0,
        });
        hud.setMoney(rounds.state.money);
        hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
      } else if (!buyOpen) {
        const id = ['pistol', 'rifle', 'smg'][n - 1];
        if (weapons.switchTo(id)) hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
      }
    }
  }
}

function step(dt) {
  elapsed += dt;
  const keys = input.state.keys;
  const body = playerMover.body;

  if (rounds.state.phase === 'live' || rounds.state.phase === 'freeze') {
    // Movement: sprint on Shift, crouch on Ctrl/C, jump on Space.
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    body.walkSpeed = sprint ? 7.0 : 5.2;
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const wish = new THREE.Vector3();
    if ((forward || strafe) && player.alive) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    playerMover.step(dt, wish, crouch, keys.has('Space') && player.alive);
    const look = input.takeLook();
    if (player.alive) playerMover.look(look.x, look.y);

    // Planting: hold E in a site zone while carrying the charge.
    if (player.alive && bomb.state.mode === 'carried' && bomb.state.carrier === 'player' && keys.has('KeyE')) {
      const site = body.position.x < 0 ? 'A' : 'B';
      if (bomb.plantStep(dt, 'player', player.position, site)) {
        rounds.onPlant();
        hud.setBomb(`CHARGE PLANTED — ${map.sites[site].name}`, 1);
        hud.showBanner('Charge planted — hold the site');
        hud.setMoney(rounds.state.money);
      }
      hud.setPlant(bomb.plantProgress(), 'PLANTING THE CHARGE — hold E');
    } else {
      bomb.cancelChannel();
      hud.setPlant(null);
    }
  }

  // Bots only think while the round is live; during the freeze they hold
  // their spawn, and during the round end they stand down.
  if (rounds.state.phase === 'live') bots.step(dt, elapsed, random);
  weapons.step(dt);
  effects.step(dt);

  // Grenades: step, then resolve every blast through combat.
  for (const point of grenades.step(dt)) {
    effects.blast(point);
    for (const result of combat.damageRadius(point, grenades.radius, grenades.damage, player)) {
      if (result.killed) hud.killFeed(`Spark grenade ▸ ${result.victim.name}`);
    }
    hud.setHealth(player.health);
    bots.hear(point.x, point.z, 'attack', elapsed);
  }

  // The fuse: a planted charge ends the round when it blows.
  if (bomb.tick(dt) === 'detonated') {
    effects.blast(bomb.state.position);
    rounds.endRound('attack', 'Charge detonated');
  }

  rounds.tick(dt);

  // Round end by elimination, checked after the bots moved.
  if (rounds.state.phase === 'live') {
    const attackAlive = bots.aliveCount('attack') + (player.alive ? 1 : 0);
    const defendAlive = bots.aliveCount('defend');
    if (defendAlive === 0) {
      rounds.endRound('attack', 'Wardens eliminated');
    } else if (attackAlive === 0 && bomb.state.mode !== 'planted') {
      rounds.endRound('defend', 'Vanguard eliminated');
    }
  }

  // HUD: everything the eye needs, every step.
  hud.setHealth(player.health);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
  hud.setMoney(rounds.state.money);
  hud.setScore(rounds.state.score.attack, rounds.state.score.defend, rounds.state.round);
  hud.setTimer(rounds.state.phase === 'freeze' ? rounds.state.phaseLeft : rounds.state.timer);
  hud.setAlive(bots.aliveCount('attack') + (player.alive ? 1 : 0), bots.aliveCount('defend'));
  if (bomb.state.mode === 'planted') {
    hud.setBomb(`CHARGE PLANTED — ${map.sites[bomb.state.site].name}`, bomb.state.fuseLeft / 35);
  } else if (bomb.state.mode === 'carried' && bomb.state.carrier === 'player') {
    hud.setBomb('CARRYING THE CHARGE — plant at A or B', null);
  } else if (bomb.state.mode === 'dropped') {
    hud.setBomb('CHARGE DROPPED — a squadmate can pick it up', null);
  } else if (rounds.state.phase !== 'live') {
    hud.setBomb('', null);
  }
  hud.setCrosshairGap(4 + weapons.spread(playerMover.groundSpeed()) * 900);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const def = weapons.def();
    const firing = input.state.firing && player.alive && rounds.state.phase === 'live';
    const pull = def.auto ? firing : firing && !prevFiring;
    prevFiring = input.state.firing;
    if (pull && weapons.ready()) shootPlayer();
    handlePressed(input.takePressed());
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.setBuyVisible(false);
  buyOpen = false;
  rounds.state.phase = 'live';
  rounds.state.round = 1;
  rounds.state.score.attack = 1;
  rounds.state.score.defend = 0;
  rounds.state.timer = 87;
  rounds.state.money = 3200;
  game.attackSite = 'A';
  resetForRound();
  rounds.state.phase = 'live';
  rounds.state.score.attack = 1;
  rounds.state.money = 3200;
  const body = playerMover.body;

  if (name === 'start') {
    body.position.set(-4, 0, 13);
    body.yaw = 0;
    body.pitch = 0.02;
    settle(20);
    syncCamera();
    hud.showOverlay('start');
  } else if (name === 'play') {
    // Mid-round: the player is up the mid lane, one Warden is down, another
    // is in the sights, and a squadmate holds the flank.
    body.position.set(-1, 0, 7);
    const defenders = bots.bots.filter((b) => b.team === 'defend');
    // Both push up the open mid lane, south of the mid block, where the
    // player at the spawn can actually see them: the first staging put them
    // behind (and one inside) the container wall, where no chest shot from
    // the spawn can reach them.
    const target = defenders[0];
    target.mover.body.position.set(0, 0, 2);
    target.mover.body.yaw = Math.PI;
    const second = defenders[1];
    second.mover.body.position.set(3, 0, 0);
    second.mover.body.yaw = Math.PI * 0.9;
    // A squadmate holds the east flank, clear of the player's line of fire
    // up the mid lane: the last staging put one in front of the muzzle.
    const mate = bots.bots.find((b) => b.team === 'attack');
    mate.mover.body.position.set(4.5, 0, 9.5);
    mate.mover.body.yaw = 0;
    mate.holdNode = map.nearestNode(4.5, 9.5);
    mate.state = 'hold';
    settle(15);
    for (let i = 0; i < 3; i += 1) {
      // Re-aim before every shot: recoil lifts the muzzle, and a staged
      // burst that walks off the target proves nothing.
      aimAt(new THREE.Vector3(target.position.x, 1.2, target.position.z));
      shootPlayer();
      settle(6);
    }
    settle(10);
    aimAt(new THREE.Vector3(second.position.x, 1.2, second.position.z));
    shootPlayer();
    // Four steps: long enough for the 0.06 s muzzle flash to burn out (a
    // frozen flash reads as a floating orange diamond), short enough that
    // the 0.12 s tracer and the hitmarker are still on screen.
    settle(4);
    hud.setScore(1, 0, 1);
    hud.setTimer(87);
  } else if (name === 'buy') {
    rounds.state.phase = 'freeze';
    rounds.state.phaseLeft = 5;
    rounds.state.money = 3200;
    body.position.set(-4, 0, 13);
    body.yaw = 0;
    body.pitch = 0;
    settle(10);
    syncCamera();
    hud.setBuyVisible(true, 3200, { rifle: false, smg: false, grenade: false });
    buyOpen = true;
    hud.setMoney(3200);
  } else {
    // Bomb: the player kneels at the Foundry plate, the plant half done, a
    // Warden closing in from the furnace.
    body.position.set(-15.5, 0, -8.5);
    const defenders = bots.bots.filter((b) => b.team === 'defend');
    defenders[0].mover.body.position.set(-17, 0, -11);
    defenders[0].mover.body.yaw = Math.PI * 0.95;
    settle(10);
    aimAt(new THREE.Vector3(-19.5, 1.2, -12.5));
    bomb.state.plantLeft = 1.2;
    hud.setPlant(0.6, 'PLANTING THE CHARGE — hold E');
    hud.setBomb('CARRYING THE CHARGE — plant at A or B', null);
    syncCamera();
  }
  hud.setHealth(player.health);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
  hud.setMoney(rounds.state.money);
  hud.setScore(rounds.state.score.attack, rounds.state.score.defend, rounds.state.round);
  hud.setTimer(rounds.state.timer);
  hud.setAlive(bots.aliveCount('attack') + 1, bots.aliveCount('defend'));
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// A small handle for local play-testing: state, not a cheat.
window.__ember = { rounds: rounds.state, player, bots: bots.bots, bomb: bomb.state, scene, camera, THREE };

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
