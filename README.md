# Ember Yard

A complete round-based tactical FPS in three.js 0.187.0 — an original game, not a
copy of any commercial title. One player leads the **Vanguard** (attackers) with
two bot squadmates against four **Warden** bots (defenders) across a dusk
industrial yard with two bomb sites: **Foundry A** (west) and **Depot B** (east),
joined by three lanes and a mid connector.

## How it plays

- First to 4 rounds wins (max 7). A round lasts 100 seconds, with a 5-second buy
  phase before it starts.
- **Vanguard** wins a round by eliminating the Wardens, or by planting the charge
  and letting it detonate. **Wardens** win by eliminating the Vanguard, running
  out the clock, or defusing a planted charge.
- Plant the charge by holding **E** inside a site zone (3 s). A planted charge
  burns a 35 s fuse; a Warden must channel 5 s beside it to defuse.
- Economy: start at $800, +$300 per kill, +$300 for a plant, +$325 for a round
  win, +$1400 for a round loss. Spend it in the buy phase (**B**): VK-7 rifle
  ($2700), Raptor SMG ($1500), spark grenade ($300).
- Weapons: P9 sidearm (free), VK-7 rifle, Raptor SMG — each with its own damage,
  fire rate, recoil and spread. Firing on the move widens your spread; crouching
  and standing still tighten it. Headshots deal bonus damage.
- Bots hold sites, advance along waypoint routes, react to sight and to the sound
  of gunfire and grenades, burst-fire with a human reaction delay, and carry,
  plant, pick up and defuse the charge.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click to play, pointer lock) |
| Click | Fire |
| R | Reload |
| 1 / 2 / 3 | Switch weapon (buy phase: buy rifle / SMG / grenade) |
| Q | Cycle weapon |
| G | Throw spark grenade |
| E (hold) | Plant the charge |
| Ctrl / C | Crouch |
| Space | Jump |
| Shift | Sprint |
| B | Buy menu (between rounds) |

## Run it

```sh
node serve.ts          # then open http://localhost:8080
```

No build step, no network requests: three.js 0.187.0 is vendored under
`game/vendor/three/` and everything loads from relative paths.

## Layout

- `game/index.html` — page shell and HUD.
- `game/src/` — the game, one module per concern: `map.js` (yard, sites,
  waypoint graph), `mover.js` (shared physics), `weapons.js` (guns, grenades),
  `combat.js` (raycast hits, headshots, blast damage), `bots.js` (AI),
  `bomb.js` (charge state machine), `rounds.js` (rounds and economy),
  `effects.js` (tracers, sparks, blasts), `hud.js` (DOM HUD), `input.js`
  (keyboard, mouse, pointer lock), `palette.js` (the dusk palette), `main.js`
  (boot, the fixed-step loop, shot staging).
- `game/vendor/three/` — three.js 0.187.0, byte-for-byte from the make.fun kit.
- `screenshots/` — four real renders of this game, taken in headless Chromium.
- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output` and
  writes `/output/dossier.json`.

## Deterministic captures

`main.js` stages a frame for a screenshot when the page is opened with
`?shot=start|play|buy|bomb&seed=N`: it sets the game state up, renders twice,
then freezes and sets `window.__shotReady`.

## License

MIT — see `LICENSE`.
