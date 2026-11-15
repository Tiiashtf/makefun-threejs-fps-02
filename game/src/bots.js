// The bots: six soldiers with names, waypoint brains and trigger discipline.
// Defenders hold the two sites and rotate toward noise; attackers push a lane
// toward the round's site. A bot that sees an enemy stops, aims after a human
// reaction delay, and fires in bursts — and a bot that hears a shot nearby turns
// toward it. Attacker bots carry the bomb home when the player falls, and a
// defender defuses when the site is clear enough to kneel.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMover } from './mover.js';

const BOT_DEF = { damage: 20, headMult: 3 };
const REACTION_MIN = 0.4;
const REACTION_MAX = 0.85;
const ENGAGE_RANGE = 32;
const BURST_MIN = 3;
const BURST_MAX = 5;
const BURST_GAP = 0.11;
const BURST_PAUSE_MIN = 0.9;
const BURST_PAUSE_MAX = 1.5;
const BOT_SPEED = 4.2;
const PLANT_TIME = 3;
const DEFUSE_TIME = 5;

const NAMES = {
  attack: ['Vex', 'Rook'],
  defend: ['Hale', 'Mira', 'Sable', 'Onyx'],
};

function buildBotMesh(team) {
  const cloth = new THREE.MeshStandardMaterial({
    color: new THREE.Color(team === 'attack' ? PALETTE.ally : PALETTE.foe),
    roughness: 0.7,
    metalness: 0.05,
  });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.7 });
  const group = new THREE.Group();

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.18), dark);
  legL.position.set(-0.11, 0.39, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), cloth);
  torso.position.y = 1.14;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.3, 0.32), dark);
  vest.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
  head.position.y = 1.66;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), cloth);
  helmet.position.y = 1.68;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.2, 1.18, 0.3);
  group.add(legL, legR, torso, vest, head, helmet, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return { group, torso, head, legL, legR };
}

export function createBots(scene, map, combat, game) {
  const bots = [];
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const eye = new THREE.Vector3();

  function makeBot(team, index, spawn) {
    const parts = buildBotMesh(team);
    scene.add(parts.group);
    const mover = createMover(map.colliders, spawn[0], spawn[1], BOT_SPEED);
    const bot = {
      id: `${team}-${index}`,
      name: NAMES[team][index],
      team,
      mover,
      group: parts.group,
      torso: parts.torso,
      head: parts.head,
      legL: parts.legL,
      legR: parts.legR,
      health: 100,
      maxHealth: 100,
      alive: true,
      state: 'hold',
      route: [],
      routeIndex: 0,
      holdNode: 0,
      holdUntil: 0,
      target: null,
      lastSeen: 0,
      reactionLeft: 0,
      burstLeft: 0,
      burstTimer: 0,
      pauseLeft: 0,
      strafeDir: 1,
      strafeUntil: 0,
      channel: null,
      heardAt: null,
      walkPhase: 0,
      fall: 0,
    };
    parts.torso.userData.character = bot;
    parts.torso.userData.part = 'torso';
    parts.head.userData.character = bot;
    parts.head.userData.part = 'head';
    bot.hitMeshes = [parts.torso, parts.head];
    bot.position = mover.body.position;
    bot.onDeath = (killer) => {
      game.onBotKilled(bot, killer);
    };
    // Taking damage breaks a plant or defuse channel.
    bot.onDamage = () => {
      bot.channel = null;
    };
    combat.register(bot);
    bots.push(bot);
    return bot;
  }

  function spawnAll() {
    for (let i = 0; i < 2; i += 1) makeBot('attack', i, map.spawns.attackers[i + 1] ?? map.spawns.attackers[0]);
    for (let i = 0; i < 4; i += 1) makeBot('defend', i, map.spawns.defenders[i % 3]);
  }

  function resetRound(attackSite) {
    const aSpawns = map.spawns.attackers;
    const dSpawns = map.spawns.defenders;
    let a = 1; // attackers[0] is the player's spawn; bots take the other two
    let d = 0;
    for (const bot of bots) {
      bot.alive = true;
      bot.health = bot.maxHealth;
      bot.fall = 0;
      bot.channel = null;
      bot.target = null;
      bot.heardAt = null;
      bot.burstLeft = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.y = 0;
      const spawn = bot.team === 'attack' ? aSpawns[a++ % aSpawns.length] : dSpawns[d++ % dSpawns.length];
      bot.mover.body.position.set(spawn[0], 0, spawn[1]);
      bot.mover.body.velocity.set(0, 0, 0);
      // Yaw 0 faces north (-Z): attackers look up the map, defenders (yaw PI)
      // look back south at the attackers' approach.
      bot.mover.body.yaw = bot.team === 'attack' ? 0 : Math.PI;
      if (bot.team === 'defend') {
        // Two hold A, two hold B, at the sites' inner waypoints (A: 22, 23;
        // B: 25, 26), whichever site the attackers favour this round.
        const index = Number(bot.id.split('-')[1]);
        bot.holdNode = index < 2 ? 22 + (index % 2) : 25 + (index % 2);
        bot.state = 'hold';
        bot.mover.body.yaw = Math.PI;
      } else {
        bot.state = 'advance';
        bot.route = [];
        bot.routeIndex = 0;
      }
    }
  }

  function nearestEnemy(bot) {
    let best = null;
    let bestDistance = ENGAGE_RANGE;
    for (const other of combat.characters) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      const distance = bot.position.distanceTo(other.position);
      if (distance > bestDistance) continue;
      eye.copy(bot.position).setY(bot.position.y + 1.5);
      tmp.copy(other.position).setY(other.position.y + 1.2);
      if (!combat.canSee(eye, tmp)) continue;
      best = other;
      bestDistance = distance;
    }
    return best;
  }

  function faceToward(bot, x, z) {
    const dx = x - bot.position.x;
    const dz = z - bot.position.z;
    if (Math.abs(dx) + Math.abs(dz) < 0.01) return;
    bot.mover.body.yaw = Math.atan2(dx, dz);
  }

  function stepBot(bot, dt, time, random) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      bot.group.position.y = -bot.fall * 0.08;
      return;
    }
    const body = bot.mover.body;

    // A visible enemy interrupts everything except a channel, which damage
    // already broke. Reaction time first, then bursts with pauses.
    const enemy = nearestEnemy(bot);
    if (enemy) {
      bot.lastSeen = time;
      if (bot.state !== 'engage') {
        bot.state = 'engage';
        bot.reactionLeft = REACTION_MIN + random() * (REACTION_MAX - REACTION_MIN);
        bot.burstLeft = 0;
      }
      faceToward(bot, enemy.position.x, enemy.position.z);
      bot.reactionLeft -= dt;
      if (bot.reactionLeft <= 0) {
        if (bot.burstLeft <= 0) {
          if (bot.pauseLeft > 0) {
            bot.pauseLeft -= dt;
          } else {
            bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN + 1));
            bot.burstTimer = 0;
          }
        } else {
          bot.burstTimer -= dt;
          if (bot.burstTimer <= 0) {
            bot.burstTimer = BURST_GAP;
            bot.burstLeft -= 1;
            eye.copy(bot.position).setY(bot.position.y + 1.5);
            tmp.copy(enemy.position).setY(enemy.position.y + 1.15 + (random() - 0.5) * 0.3);
            const distance = eye.distanceTo(tmp);
            const spread = 0.012 + distance * 0.0009;
            tmp.sub(eye).normalize();
            const result = combat.shoot(bot, eye, tmp, spread, BOT_DEF, random);
            game.onBotShot(bot, result);
            if (bot.burstLeft === 0) bot.pauseLeft = BURST_PAUSE_MIN + random() * (BURST_PAUSE_MAX - BURST_PAUSE_MIN);
          }
        }
      }
      // Strafe while fighting so the bot is not a still target.
      if (time > bot.strafeUntil) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeUntil = time + 0.7 + random() * 0.6;
      }
      const side = new THREE.Vector3(Math.cos(body.yaw), 0, -Math.sin(body.yaw)).multiplyScalar(bot.strafeDir * 0.5);
      bot.mover.step(dt, side, false, false);
      syncMesh(bot, dt);
      return;
    }
    if (bot.state === 'engage' && time - bot.lastSeen > 2) {
      bot.state = bot.team === 'defend' ? 'hold' : 'advance';
      bot.route = [];
    }

    // Channels: planting and defusing. Standing still, kneeling by the site.
    if (bot.channel) {
      bot.channel.left -= dt;
      if (bot.channel.left <= 0) {
        const done = bot.channel;
        bot.channel = null;
        if (done.type === 'plant') game.onBotPlanted(bot);
        else game.onBotDefused(bot);
      }
      syncMesh(bot, dt);
      return;
    }

    // Bomb duty for attackers: the carrier walks to the site and plants; a
    // bot that finds the dropped bomb picks it up.
    const bomb = game.bomb;
    if (bot.team === 'attack') {
      if (bomb.state === 'dropped' && bomb.carrier !== bot) {
        const d = bot.position.distanceTo(bomb.position);
        if (d < 1.2) {
          game.onBombPickup(bot);
        } else {
          walkTo(bot, bomb.position.x, bomb.position.z, dt);
          syncMesh(bot, dt);
          return;
        }
      }
      if (bomb.carrier === bot && bomb.state === 'carried') {
        const site = map.sites[game.attackSite];
        const inZone = bot.position.x >= site.min.x && bot.position.x <= site.max.x
          && bot.position.z >= site.min.z && bot.position.z <= site.max.z;
        if (inZone) {
          bot.channel = { type: 'plant', left: PLANT_TIME };
        } else {
          const target = map.nearestNode((site.min.x + site.max.x) / 2, (site.min.z + site.max.z) / 2);
          followRoute(bot, target, dt);
        }
        syncMesh(bot, dt);
        return;
      }
    }

    // Defenders rotate to the planted bomb and defuse when the site is clear.
    if (bot.team === 'defend' && bomb.state === 'planted') {
      const site = map.sites[bomb.site];
      const d = bot.position.distanceTo(new THREE.Vector3(bomb.position.x, 0, bomb.position.z));
      const inZone = bot.position.x >= site.min.x && bot.position.x <= site.max.x
        && bot.position.z >= site.min.z && bot.position.z <= site.max.z;
      if (inZone) {
        const nearEnemy = nearestEnemy(bot);
        if (!nearEnemy) bot.channel = { type: 'defuse', left: DEFUSE_TIME };
      } else if (d > 1.5) {
        const target = map.nearestNode(bomb.position.x, bomb.position.z);
        followRoute(bot, target, dt);
      }
      syncMesh(bot, dt);
      return;
    }

    // Heard a shot: defenders turn toward the noise for a few seconds.
    if (bot.team === 'defend' && bot.heardAt && time - bot.heardAt.time < 4) {
      faceToward(bot, bot.heardAt.x, bot.heardAt.z);
      syncMesh(bot, dt);
      return;
    }

    // Default behaviour: defenders hold their site waypoint, attackers push
    // the round's site along the waypoint graph.
    if (bot.team === 'defend') {
      const node = map.nodes[bot.holdNode];
      const d = Math.hypot(node.x - bot.position.x, node.z - bot.position.z);
      if (d > 1) {
        walkTo(bot, node.x, node.z, dt);
      } else {
        bot.mover.step(dt, new THREE.Vector3(), false, false);
        // Slow scan: sweep the yaw across the site.
        body.yaw += Math.sin(time * 0.5 + bot.holdNode) * 0.002;
      }
      syncMesh(bot, dt);
      return;
    }
    const site = map.sites[game.attackSite];
    const target = map.nearestNode((site.min.x + site.max.x) / 2, (site.min.z + site.max.z) / 2);
    followRoute(bot, target, dt);
    syncMesh(bot, dt);
  }

  function walkTo(bot, x, z, dt) {
    const dx = x - bot.position.x;
    const dz = z - bot.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.3) {
      bot.mover.step(dt, new THREE.Vector3(), false, false);
      return;
    }
    faceToward(bot, x, z);
    tmp.set(dx / distance, 0, dz / distance);
    bot.mover.step(dt, tmp, false, false);
  }

  function followRoute(bot, targetNode, dt) {
    const from = map.nearestNode(bot.position.x, bot.position.z);
    if (bot.route.length === 0 || bot.route[bot.route.length - 1] !== targetNode) {
      bot.route = map.route(from, targetNode);
      bot.routeIndex = 0;
    }
    while (bot.routeIndex < bot.route.length) {
      const node = map.nodes[bot.route[bot.routeIndex]];
      const d = Math.hypot(node.x - bot.position.x, node.z - bot.position.z);
      if (d < 0.7) bot.routeIndex += 1;
      else {
        walkTo(bot, node.x, node.z, dt);
        return;
      }
    }
    bot.mover.step(dt, new THREE.Vector3(), false, false);
  }

  function syncMesh(bot, dt) {
    const body = bot.mover.body;
    bot.group.position.set(body.position.x, body.position.y, body.position.z);
    // The mesh is built facing +Z, and body.yaw is the atan2 of the facing
    // direction, so the group's yaw is the body's yaw, unchanged.
    bot.group.rotation.y = body.yaw;
    // A walking bot swings its legs; a channelled bot kneels.
    const speed = bot.mover.groundSpeed();
    bot.walkPhase += dt * speed * 2.4;
    const swing = bot.channel ? 0 : Math.sin(bot.walkPhase) * Math.min(1, speed / 4) * 0.5;
    bot.legL.rotation.x = swing;
    bot.legR.rotation.x = -swing;
    if (bot.channel) {
      bot.group.position.y = body.position.y - 0.25;
    }
  }

  return {
    bots,
    spawnAll,
    resetRound,
    step(dt, time, random) {
      for (const bot of bots) stepBot(bot, dt, time, random);
    },
    // A gunshot within earshot: defenders turn toward it.
    hear(x, z, team, time) {
      for (const bot of bots) {
        if (!bot.alive || bot.team !== 'defend') continue;
        const d = Math.hypot(bot.position.x - x, bot.position.z - z);
        if (d < 25) bot.heardAt = { x, z, time };
      }
    },
    aliveCount(team) {
      return bots.filter((bot) => bot.alive && bot.team === team).length;
    },
    reset() {
      for (const bot of bots) {
        bot.alive = true;
        bot.health = bot.maxHealth;
        bot.fall = 0;
        bot.channel = null;
        bot.group.rotation.set(0, 0, 0);
        bot.group.position.y = 0;
      }
    },
  };
}
