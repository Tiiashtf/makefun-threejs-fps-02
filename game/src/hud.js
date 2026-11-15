// The DOM HUD: crosshair, hit marker, health, ammo, money, round score, timer,
// team pips, bomb state, kill feed, buy menu and the overlays. It never touches
// the simulation; main.js pushes numbers in and reads the button callbacks out.
// Every setter skips a DOM write when the value did not change.
const COPY = {
  start: {
    title: 'Ember Yard',
    copy: 'A dusk yard, two bomb sites, five rounds to glory. Attackers plant the charge; defenders hold the sites. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Ember Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundAttack: {
    title: 'Vanguard takes the round',
    copy: '',
    action: 'Next round',
  },
  roundDefend: {
    title: 'Wardens hold the yard',
    copy: '',
    action: 'Next round',
  },
  matchAttack: {
    title: 'Vanguard wins the match',
    copy: '',
    action: 'Play again',
  },
  matchDefend: {
    title: 'Wardens win the match',
    copy: '',
    action: 'Play again',
  },
  matchDraw: {
    title: 'A drawn match',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const healthBar = $('health-fill');
  const healthValue = $('health-value');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyValue = $('money-value');
  const scoreAttack = $('score-attack');
  const scoreDefend = $('score-defend');
  const roundLabel = $('round-label');
  const timerValue = $('timer-value');
  const aliveAttack = $('alive-attack');
  const aliveDefend = $('alive-defend');
  const bombStatus = $('bomb-status');
  const bombText = $('bomb-text');
  const bombFuse = $('bomb-fuse');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const feed = $('feed');
  const banner = $('banner');
  const vignette = $('vignette');
  const buy = $('buy');
  const ammo = $('ammo');

  let lastHealth = -1;
  let lastMag = -1;
  let lastReserve = -1;
  let lastWeapon = '';
  let lastMoney = -1;
  let lastScoreA = -1;
  let lastScoreD = -1;
  let lastRound = -1;
  let lastTimer = -1;
  let lastAliveA = -1;
  let lastAliveD = -1;
  let lastBomb = '';
  let hitTimer = 0;
  let bannerTimer = 0;

  function pips(element, alive, total) {
    let html = '';
    for (let i = 0; i < total; i += 1) html += `<i class="${i < alive ? 'on' : ''}"></i>`;
    element.innerHTML = html;
  }

  return {
    setHealth(value) {
      const v = Math.max(0, Math.round(value));
      if (v === lastHealth) return;
      lastHealth = v;
      healthValue.textContent = String(v);
      healthBar.style.width = `${v}%`;
      healthBar.classList.toggle('low', v <= 30);
    },
    setAmmo(mag, reserve, weapon) {
      if (mag === lastMag && reserve === lastReserve && weapon === lastWeapon) return;
      lastMag = mag;
      lastReserve = reserve;
      lastWeapon = weapon;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = weapon;
      ammo.classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
    },
    setScore(attack, defend, round) {
      if (attack === lastScoreA && defend === lastScoreD && round === lastRound) return;
      lastScoreA = attack;
      lastScoreD = defend;
      lastRound = round;
      scoreAttack.textContent = String(attack);
      scoreDefend.textContent = String(defend);
      roundLabel.textContent = `ROUND ${round} / 7`;
    },
    setTimer(seconds) {
      const v = Math.max(0, Math.ceil(seconds));
      if (v === lastTimer) return;
      lastTimer = v;
      timerValue.textContent = `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
      timerValue.classList.toggle('low', v <= 10);
    },
    setAlive(attack, defend) {
      if (attack === lastAliveA && defend === lastAliveD) return;
      lastAliveA = attack;
      lastAliveD = defend;
      pips(aliveAttack, attack, 3);
      pips(aliveDefend, defend, 4);
    },
    setBomb(text, fuseFraction) {
      if (text === lastBomb) {
        if (fuseFraction !== null) bombFuse.style.width = `${Math.max(0, fuseFraction * 100)}%`;
        return;
      }
      lastBomb = text;
      if (!text) {
        bombStatus.hidden = true;
        return;
      }
      bombStatus.hidden = false;
      bombText.textContent = text;
      if (fuseFraction !== null) bombFuse.style.width = `${Math.max(0, fuseFraction * 100)}%`;
    },
    setPlant(progress, label) {
      if (progress === null) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      plantFill.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
      plantFill.textContent = label;
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      vignette.classList.remove('flash');
      void vignette.offsetWidth;
      vignette.classList.add('flash');
    },
    killFeed(text) {
      const item = document.createElement('div');
      item.textContent = text;
      feed.prepend(item);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      setTimeout(() => item.remove(), 6000);
    },
    showBanner(text, ms = 2500) {
      banner.textContent = text;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, ms);
    },
    showOverlay(mode, detail) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = detail ?? text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    setBuyVisible(visible, money, owned) {
      buy.hidden = !visible;
      if (!visible) return;
      $('buy-money').textContent = `$${money}`;
      for (const id of ['rifle', 'smg', 'grenade']) {
        const row = $(`buy-${id}`);
        row.classList.toggle('owned', Boolean(owned[id]));
        row.classList.toggle('cant', !owned[id] && money < Number(row.dataset.price));
      }
    },
  };
}
