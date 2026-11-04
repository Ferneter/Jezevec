(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const startScreen = document.getElementById('start-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const pauseIndicator = document.getElementById('pause-indicator');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best-score');
  const finalScoreEl = document.getElementById('final-score');
  const recordMessageEl = document.getElementById('record-message');
  const energyNumberEl = document.getElementById('energy-number');
  const energyFillEl = document.getElementById('energy-fill');
  const energyProgressEl = document.getElementById('energy-progress');
  const distanceNumberEl = document.getElementById('distance-number');
  const distanceFillEl = document.getElementById('distance-fill');
  const distanceBadgerEl = document.querySelector('.distance-badger');
  const clockEl = document.getElementById('run-clock');

  const W = 960;
  const H = 540;
  const BEST_KEY = 'jezevec-best-score-v1';
  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;

  let best = readBest();
  let state = 'ready';
  let lastFrame = 0;
  let elapsed = 0;
  let sceneryOffset = 0;
  let spawnTimer = 0;
  let beerTimer = 0;
  let shake = 0;
  let flash = 0;
  let lane = 1;
  let energy = 100;
  let score = 0;
  let distance = 268;
  let objects = [];
  let trees = [];
  let motes = [];
  let touchStart = null;
  let newRecord = false;

  function readBest() {
    try { return Number(localStorage.getItem(BEST_KEY)) || 0; }
    catch { return 0; }
  }

  function saveBest(value) {
    try { localStorage.setItem(BEST_KEY, String(value)); } catch { /* private browsing can block storage */ }
  }

  function buildScenery() {
    trees = [];
    for (let side of [-1, 1]) {
      for (let i = 0; i < 15; i++) {
        trees.push({
          side,
          y: rand(-40, H + 50),
          x: rand(.02, .28),
          size: rand(.6, 1.7),
          shade: Math.floor(rand(0, 4)),
          layer: rand(.45, 1.05),
          sway: rand(0, Math.PI * 2)
        });
      }
    }
    motes = Array.from({ length: 34 }, () => ({ x: rand(110, 850), y: rand(30, H), r: rand(.6, 2.1), speed: rand(5, 16), phase: rand(0, 8) }));
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake * .5, shake * .5));
    drawSky();
    drawForest();
    drawTrail();
    drawMotes();
    const ordered = [...objects].sort((a, b) => a.y - b.y);
    for (const object of ordered) drawObject(object);
    if (state !== 'over') drawRunner();
    if (state === 'running' || state === 'paused' || state === 'over') drawChaser();
    drawVignette();
    if (flash > 0) {
      ctx.fillStyle = `rgba(232, 126, 97, ${flash * .12})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function drawSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#101b1a');
    sky.addColorStop(.38, '#23352e');
    sky.addColorStop(1, '#263329');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const moonGlow = ctx.createRadialGradient(697, 76, 5, 697, 76, 235);
    moonGlow.addColorStop(0, 'rgba(198, 205, 163, .19)');
    moonGlow.addColorStop(.34, 'rgba(154, 182, 135, .07)');
    moonGlow.addColorStop(1, 'rgba(154, 182, 135, 0)');
    ctx.fillStyle = moonGlow;
    ctx.fillRect(450, 0, 510, 330);
    ctx.beginPath();
    ctx.arc(698, 77, 21, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(219, 218, 185, .77)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(708, 69, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#172622';
    ctx.fill();
    for (let i = 0; i < 21; i++) {
      const x = (i * 173 + 49) % W;
      const y = (i * 71 + 23) % 215;
      ctx.fillStyle = `rgba(226, 232, 193, ${.22 + .35 * Math.sin(elapsed * 1.4 + i) ** 2})`;
      ctx.fillRect(x, y, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
    }
    ctx.fillStyle = '#1b2b25';
    ctx.beginPath();
    ctx.moveTo(0, 208);
    ctx.quadraticCurveTo(105, 170, 205, 207);
    ctx.quadraticCurveTo(327, 171, 455, 208);
    ctx.quadraticCurveTo(602, 174, 730, 204);
    ctx.quadraticCurveTo(848, 171, 960, 207);
    ctx.lineTo(960, 324);
    ctx.lineTo(0, 324);
    ctx.closePath();
    ctx.fill();
  }

  function drawForest() {
    for (const tree of trees) {
      const travel = (sceneryOffset * tree.layer + tree.y + 80) % (H + 100) - 50;
      const perspective = .25 + travel / H * .95;
      const size = tree.size * perspective * 60;
      const sideDistance = 48 + tree.x * 470 * perspective;
      const x = tree.side < 0 ? sideDistance - size * .28 : W - sideDistance + size * .28;
      drawTree(x, travel, size, tree.side, tree.shade, tree.sway + elapsed * .18);
    }
  }

  function drawTree(x, y, size, side, shade, sway) {
    const colors = ['#15241d', '#1a2b21', '#203126', '#26382a'];
    const trunkWidth = size * .12;
    const trunkHeight = size * .72;
    const lean = Math.sin(sway) * size * .035 * side;
    ctx.fillStyle = 'rgba(7, 12, 9, .3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 3, size * .48, size * .1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade % 2 ? '#302e25' : '#3b3428';
    ctx.beginPath();
    ctx.moveTo(x - trunkWidth / 2, y - trunkHeight * .1);
    ctx.lineTo(x + trunkWidth / 2, y - trunkHeight * .1);
    ctx.lineTo(x + trunkWidth * .45 + lean, y + 3);
    ctx.lineTo(x - trunkWidth * .4 + lean, y + 3);
    ctx.fill();
    const foliage = colors[shade];
    for (let tier = 0; tier < 4; tier++) {
      const baseY = y - size * (.13 + tier * .16);
      const width = size * (.27 + tier * .075);
      const tipX = x + lean * (1 - tier * .12);
      ctx.fillStyle = foliage;
      ctx.beginPath();
      ctx.moveTo(tipX, baseY - size * .47);
      ctx.quadraticCurveTo(tipX + side * width * .08, baseY - size * .28, tipX + width, baseY + size * .05);
      ctx.lineTo(tipX - width, baseY + size * .05);
      ctx.quadraticCurveTo(tipX - side * width * .08, baseY - size * .28, tipX, baseY - size * .47);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(151, 168, 116, .14)';
    ctx.lineWidth = Math.max(1, size * .012);
    ctx.beginPath();
    ctx.moveTo(x - trunkWidth * .18, y - trunkHeight * .04);
    ctx.lineTo(x + trunkWidth * .05 + lean, y - trunkHeight * .57);
    ctx.stroke();
  }

  function drawTrail() {
    ctx.fillStyle = '#1b2c22';
    ctx.beginPath();
    ctx.moveTo(0, 236);
    ctx.lineTo(394, 169);
    ctx.lineTo(566, 169);
    ctx.lineTo(W, 236);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(444, 168);
    ctx.lineTo(516, 168);
    ctx.quadraticCurveTo(639, 328, 823, H);
    ctx.lineTo(137, H);
    ctx.quadraticCurveTo(323, 328, 444, 168);
    ctx.closePath();
    const dirt = ctx.createLinearGradient(0, 168, 0, H);
    dirt.addColorStop(0, '#30392c');
    dirt.addColorStop(.5, '#403e30');
    dirt.addColorStop(1, '#514738');
    ctx.fillStyle = dirt;
    ctx.fill();

    ctx.strokeStyle = 'rgba(154, 163, 120, .2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(444, 168);
    ctx.quadraticCurveTo(323, 328, 137, H);
    ctx.moveTo(516, 168);
    ctx.quadraticCurveTo(639, 328, 823, H);
    ctx.stroke();

    const moving = (sceneryOffset * .92) % 92;
    for (let i = 0; i < 12; i++) {
      const y = 185 + ((i * 57 + moving) % 370);
      const t = (y - 168) / (H - 168);
      const width = lerp(3, 90, t);
      const center = 480 + Math.sin(t * 2.2) * 7;
      ctx.fillStyle = `rgba(184, 183, 139, ${.045 + t * .07})`;
      ctx.fillRect(center - width / 2, y, width, Math.max(1, t * 3));
    }

    for (let i = 0; i < 24; i++) {
      const y = 195 + ((i * 67 + sceneryOffset * .7) % 370);
      const t = (y - 168) / (H - 168);
      const edge = lerp(62, 310, t);
      const x = i % 2 === 0 ? 480 - edge : 480 + edge;
      ctx.fillStyle = `rgba(190, 184, 140, ${.12 * t})`;
      ctx.beginPath();
      ctx.ellipse(x, y, t * 3 + 1, t * 1.2 + .5, .25, 0, Math.PI * 2);
      ctx.fill();
    }

    const fog = ctx.createLinearGradient(0, 168, 0, 300);
    fog.addColorStop(0, 'rgba(191, 203, 163, .15)');
    fog.addColorStop(1, 'rgba(191, 203, 163, 0)');
    ctx.fillStyle = fog;
    ctx.fillRect(356, 155, 248, 170);
  }

  function drawMotes() {
    for (const mote of motes) {
      const drift = Math.sin(elapsed * .4 + mote.phase) * 20;
      const x = mote.x + drift;
      const y = (mote.y + sceneryOffset * .12 * mote.speed) % H;
      ctx.fillStyle = `rgba(222, 226, 170, ${.13 + Math.sin(elapsed + mote.phase) ** 2 * .38})`;
      ctx.beginPath();
      ctx.arc(x, y, mote.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function pathPoint(laneIndex, y) {
    const t = clamp((y - 168) / (H - 168), 0, 1.12);
    const spread = lerp(0, 222, t);
    return 480 + (laneIndex - 1) * spread;
  }

  function drawObject(object) {
    const y = object.y;
    const t = clamp((y - 168) / (H - 168), 0, 1.15);
    const x = pathPoint(object.lane, y);
    const scale = .28 + t * .95;
    if (object.type === 'mushroom') drawMushroom(x, y, scale, object.variant);
    else if (object.type === 'beer') drawBeer(x, y, scale, object.glow);
    else drawStump(x, y, scale, object.type);
  }

  function drawMushroom(x, y, scale, variant = 0) {
    const s = scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(7, 9, 7, .35)';
    ctx.beginPath();
    ctx.ellipse(0, 4 * s, 17 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e2d7b9';
    ctx.beginPath();
    ctx.ellipse(0, -1 * s, 5 * s, 10 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = variant ? '#bf705d' : '#d2886a';
    ctx.beginPath();
    ctx.moveTo(-15 * s, -4 * s);
    ctx.quadraticCurveTo(-11 * s, -16 * s, 0, -17 * s);
    ctx.quadraticCurveTo(12 * s, -15 * s, 15 * s, -4 * s);
    ctx.quadraticCurveTo(6 * s, 1 * s, -15 * s, -4 * s);
    ctx.fill();
    ctx.fillStyle = '#f0dfc0';
    for (const [dx, dy, r] of [[-6, -9, 1.5], [3, -12, 1.2], [8, -7, 1]]) {
      ctx.beginPath();
      ctx.arc(dx * s, dy * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBeer(x, y, scale, glow = 0) {
    const s = scale;
    ctx.save();
    ctx.translate(x, y);
    const aura = ctx.createRadialGradient(0, -5 * s, 2, 0, -5 * s, 34 * s);
    aura.addColorStop(0, `rgba(164, 210, 113, ${.38 + glow * .12})`);
    aura.addColorStop(1, 'rgba(164, 210, 113, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, -5 * s, 34 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(5, 8, 6, .4)';
    ctx.beginPath();
    ctx.ellipse(0, 8 * s, 12 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3b814b';
    ctx.beginPath();
    ctx.moveTo(-8 * s, 0);
    ctx.quadraticCurveTo(-9 * s, -5 * s, -6 * s, -8 * s);
    ctx.lineTo(-4 * s, -12 * s);
    ctx.lineTo(-4 * s, -20 * s);
    ctx.lineTo(4 * s, -20 * s);
    ctx.lineTo(4 * s, -12 * s);
    ctx.lineTo(7 * s, -8 * s);
    ctx.quadraticCurveTo(10 * s, -4 * s, 8 * s, 0);
    ctx.lineTo(7 * s, 7 * s);
    ctx.quadraticCurveTo(0, 11 * s, -7 * s, 7 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#94bb78';
    ctx.lineWidth = Math.max(1, s * 1.4);
    ctx.stroke();
    ctx.fillStyle = '#bbc995';
    ctx.fillRect(-4 * s, -21 * s, 8 * s, 3 * s);
    ctx.fillStyle = '#d9d8a4';
    ctx.beginPath();
    ctx.roundRect(-6 * s, -6 * s, 12 * s, 8 * s, 1.5 * s);
    ctx.fill();
    ctx.fillStyle = '#325d3d';
    ctx.font = `bold ${6 * s}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText('B', 0, 0);
    ctx.restore();
  }

  function drawStump(x, y, scale, type) {
    const s = scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(5, 8, 5, .4)';
    ctx.beginPath();
    ctx.ellipse(0, 7 * s, 25 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (type === 'log') {
      ctx.translate(-5 * s, 0);
      ctx.rotate(-.15);
      ctx.fillStyle = '#67523b';
      ctx.beginPath();
      ctx.roundRect(-29 * s, -8 * s, 58 * s, 17 * s, 7 * s);
      ctx.fill();
      ctx.fillStyle = '#9a7854';
      ctx.beginPath();
      ctx.ellipse(28 * s, .5 * s, 5 * s, 8.5 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#594632';
      ctx.lineWidth = Math.max(1, 1.3 * s);
      ctx.beginPath();
      ctx.ellipse(28 * s, .5 * s, 2.5 * s, 5 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#594333';
      ctx.beginPath();
      ctx.moveTo(-15 * s, 7 * s);
      ctx.lineTo(-11 * s, -13 * s);
      ctx.lineTo(12 * s, -13 * s);
      ctx.lineTo(15 * s, 7 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#9b7852';
      ctx.beginPath();
      ctx.ellipse(0, -12 * s, 12 * s, 5 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(59, 42, 30, .6)';
      ctx.lineWidth = Math.max(1, s);
      ctx.beginPath();
      ctx.ellipse(0, -12 * s, 7 * s, 2.6 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#737950';
      ctx.beginPath();
      ctx.ellipse(-10 * s, -15 * s, 5 * s, 2 * s, -.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRunner() {
    const x = pathPoint(lane, 415);
    const y = 419;
    const bob = state === 'running' ? Math.sin(elapsed * 13) * 2.2 : 0;
    const stride = state === 'running' ? Math.sin(elapsed * 13) * 4.5 : 0;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = 'rgba(5, 8, 6, .48)';
    ctx.beginPath();
    ctx.ellipse(0, 21, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#313632';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-7, 12);
    ctx.lineTo(-10 - stride, 23);
    ctx.moveTo(7, 12);
    ctx.lineTo(10 + stride, 23);
    ctx.stroke();
    ctx.strokeStyle = '#aea78e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-13 - stride, 24);
    ctx.lineTo(-7 - stride, 24);
    ctx.moveTo(7 + stride, 24);
    ctx.lineTo(14 + stride, 24);
    ctx.stroke();
    ctx.fillStyle = '#9b5944';
    ctx.beginPath();
    ctx.moveTo(-13, -4);
    ctx.quadraticCurveTo(-16, -2, -14, 12);
    ctx.quadraticCurveTo(0, 20, 14, 12);
    ctx.lineTo(12, -5);
    ctx.quadraticCurveTo(0, -11, -13, -4);
    ctx.fill();
    ctx.fillStyle = '#bf7859';
    ctx.beginPath();
    ctx.ellipse(-15, 3, 4, 9, -.38, 0, Math.PI * 2);
    ctx.ellipse(15, 3, 4, 9, .38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c6a37d';
    ctx.beginPath();
    ctx.arc(0, -10, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d2aa4f';
    ctx.beginPath();
    ctx.arc(0, -13, 10, Math.PI, Math.PI * 2);
    ctx.quadraticCurveTo(0, -23, -10, -13);
    ctx.fill();
    ctx.fillStyle = '#4d382c';
    ctx.fillRect(-9, -13, 18, 2.3);
    ctx.fillStyle = '#8c6f48';
    ctx.beginPath();
    ctx.moveTo(-10, 4);
    ctx.quadraticCurveTo(-16, 5, -16, 12);
    ctx.lineTo(-10, 14);
    ctx.fill();
    ctx.restore();
  }

  function drawBadger(x, y, scale, running = true) {
    const s = scale;
    const stride = running ? Math.sin(elapsed * 12) * 4 * s : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(5, 7, 5, .42)';
    ctx.beginPath();
    ctx.ellipse(0, 13, 46, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#262927';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-22, 7);
    ctx.lineTo(-25 - stride, 15);
    ctx.moveTo(-5, 8);
    ctx.lineTo(-4 + stride, 15);
    ctx.moveTo(20, 7);
    ctx.lineTo(22 - stride, 15);
    ctx.stroke();
    ctx.fillStyle = '#696d6b';
    ctx.beginPath();
    ctx.ellipse(-4, -2, 36, 16, -.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(202, 202, 188, .55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(-34 + i * 9, -11 - (i % 2) * 2);
      ctx.quadraticCurveTo(-15 + i * 3, -25 - (i % 3), 9 + i * 2, -11);
      ctx.stroke();
    }
    ctx.fillStyle = '#d8d3c3';
    ctx.beginPath();
    ctx.ellipse(28, -1, 17, 14, -.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ede7d5';
    ctx.beginPath();
    ctx.ellipse(34, 5, 12, 8, .1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#262624';
    ctx.beginPath();
    ctx.ellipse(39, 7, 4, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2b2c29';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(22, -13);
    ctx.lineTo(28, 3);
    ctx.moveTo(34, -13);
    ctx.lineTo(36, 0);
    ctx.stroke();
    ctx.fillStyle = '#181a18';
    ctx.beginPath();
    ctx.arc(31, -4, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8d8d82';
    ctx.beginPath();
    ctx.ellipse(-41, -6, 11, 4, -.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawChaser() {
    const closeness = clamp(1 - distance / 430, 0, 1);
    const scale = lerp(.52, 1.08, closeness);
    const y = lerp(502, 485, closeness);
    const x = lerp(480, pathPoint(lane, 480), .38);
    drawBadger(x, y, scale, state === 'running');
  }

  function drawVignette() {
    const gradient = ctx.createRadialGradient(480, 275, 115, 480, 270, 565);
    gradient.addColorStop(0, 'rgba(6, 10, 8, 0)');
    gradient.addColorStop(.62, 'rgba(5, 9, 7, .12)');
    gradient.addColorStop(1, 'rgba(4, 8, 6, .64)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    const lightX = pathPoint(lane, 418);
    const lamp = ctx.createRadialGradient(lightX, 410, 5, lightX, 390, 220);
    lamp.addColorStop(0, 'rgba(191, 203, 150, .13)');
    lamp.addColorStop(1, 'rgba(191, 203, 150, 0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(lightX - 220, 170, 440, 370);
  }

  function addObject(type, laneIndex = Math.floor(rand(0, 3))) {
    objects.push({ type, lane: laneIndex, y: 158, variant: Math.floor(rand(0, 2)), glow: rand(0, 1) });
  }

  function startGame() {
    state = 'running';
    elapsed = 0;
    score = 0;
    energy = 100;
    distance = 268;
    lane = 1;
    objects = [];
    spawnTimer = .7;
    beerTimer = rand(3.5, 6);
    shake = 0;
    flash = 0;
    newRecord = false;
    startScreen.hidden = true;
    gameoverScreen.hidden = true;
    pauseIndicator.hidden = true;
    updateHud();
    lastFrame = performance.now();
    requestAnimationFrame(loop);
  }

  function finishGame() {
    if (state !== 'running') return;
    state = 'over';
    newRecord = score > best;
    if (newRecord) {
      best = score;
      saveBest(best);
    }
    finalScoreEl.textContent = String(score);
    recordMessageEl.textContent = newRecord ? 'Nový osobní rekord!' : score === best ? 'Vyrovnaný osobní rekord.' : `Osobní rekord: ${best} hub.`;
    recordMessageEl.style.color = newRecord ? '#d9bb79' : '#b4c58d';
    bestEl.innerHTML = `${best} <small>hub</small>`;
    gameoverScreen.hidden = false;
    pauseIndicator.hidden = true;
    draw();
  }

  function loop(now) {
    if (state !== 'running') return;
    const dt = Math.min((now - lastFrame) / 1000, .04);
    lastFrame = now;
    elapsed += dt;
    energy = Math.max(0, energy - dt * .72);
    sceneryOffset += dt * (85 + energy * 1.32);
    spawnTimer -= dt;
    beerTimer -= dt;
    shake = Math.max(0, shake - dt * 22);
    flash = Math.max(0, flash - dt * 2.4);

    if (spawnTimer <= 0) {
      const roll = Math.random();
      if (roll < .24) addObject('mushroom');
      else if (roll < .54) addObject('stump');
      else if (roll < .78) addObject('log');
      spawnTimer = rand(.7, 1.2) * clamp(1.08 - elapsed / 300, .72, 1.08);
    }
    if (energy < 50 && beerTimer <= 0 && !objects.some((object) => object.type === 'beer')) {
      if (Math.random() < .78) addObject('beer');
      beerTimer = rand(4.4, 7.8);
    }

    const trailSpeed = 104 + energy * 1.48 + Math.min(40, elapsed * .22);
    const runnerSpeed = 29 + energy * .116;
    const badgerSpeed = 33 + Math.min(12, elapsed * .12);
    distance += (runnerSpeed - badgerSpeed) * dt;
    distance = clamp(distance, 0, 412);

    for (const object of objects) object.y += trailSpeed * dt;
    for (let i = objects.length - 1; i >= 0; i--) {
      const object = objects[i];
      if (Math.abs(object.y - 415) < 25 && object.lane === lane) {
        if (object.type === 'mushroom') {
          score += 1;
          flash = Math.max(flash, .2);
        } else if (object.type === 'beer') {
          energy = Math.min(100, energy + 38);
          distance = Math.min(412, distance + 33);
          flash = .5;
        } else {
          energy = Math.max(0, energy - 19);
          distance -= 53;
          shake = 8;
          flash = .85;
        }
        objects.splice(i, 1);
      } else if (object.y > H + 40) objects.splice(i, 1);
    }

    updateHud();
    draw();
    if (distance <= 0) {
      finishGame();
      return;
    }
    requestAnimationFrame(loop);
  }

  function updateHud() {
    scoreEl.textContent = String(score).padStart(2, '0');
    energyNumberEl.innerHTML = `${Math.ceil(energy)}<span>%</span>`;
    energyFillEl.style.width = `${energy}%`;
    energyProgressEl.setAttribute('aria-valuenow', String(Math.round(energy)));
    if (energy < 25) energyFillEl.style.background = 'linear-gradient(90deg, #c7715d, #e09a70)';
    else if (energy < 50) energyFillEl.style.background = 'linear-gradient(90deg, #c6975b, #e1c078)';
    else energyFillEl.style.background = 'linear-gradient(90deg, #90b66e, #bdd58f)';
    distanceNumberEl.innerHTML = `${Math.max(0, Math.round(distance))} <small>m</small>`;
    const closeness = clamp(1 - distance / 430, 0, 1);
    distanceFillEl.style.width = `${(1 - closeness) * 100}%`;
    distanceBadgerEl.style.left = `${(1 - closeness) * 100}%`;
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = Math.floor(elapsed % 60).toString().padStart(2, '0');
    clockEl.textContent = `${mins}:${secs}`;
  }

  function changeLane(direction) {
    if (state !== 'running') return;
    lane = clamp(lane + direction, 0, 2);
  }

  function togglePause() {
    if (state === 'running') {
      state = 'paused';
      pauseIndicator.hidden = false;
      draw();
    } else if (state === 'paused') {
      state = 'running';
      pauseIndicator.hidden = true;
      lastFrame = performance.now();
      requestAnimationFrame(loop);
    }
  }

  function returnToStart() {
    if (state === 'ready') return;
    state = 'ready';
    objects = [];
    startScreen.hidden = false;
    gameoverScreen.hidden = true;
    pauseIndicator.hidden = true;
    score = 0;
    energy = 100;
    distance = 268;
    elapsed = 0;
    updateHud();
    draw();
  }

  document.getElementById('start-button').addEventListener('click', startGame);
  document.getElementById('restart-button').addEventListener('click', startGame);
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['arrowleft', 'arrowright', ' ', 'escape'].includes(key)) event.preventDefault();
    if (key === 'arrowleft' || key === 'a') changeLane(-1);
    else if (key === 'arrowright' || key === 'd') changeLane(1);
    else if (key === ' ') {
      if (state === 'running' || state === 'paused') togglePause();
      else if (state === 'ready') startGame();
      else if (state === 'over') startGame();
    } else if (key === 'escape') returnToStart();
  });

  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    touchStart = { x: event.clientX, y: event.clientY };
  });
  stage.addEventListener('pointerup', (event) => {
    if (!touchStart || state !== 'running') { touchStart = null; return; }
    const dx = event.clientX - touchStart.x;
    const dy = event.clientY - touchStart.y;
    if (Math.abs(dx) > 24) changeLane(dx < 0 ? -1 : 1);
    else if (Math.abs(dy) < 22) {
      const bounds = stage.getBoundingClientRect();
      const localX = event.clientX - bounds.left;
      if (localX < bounds.width * .44) changeLane(-1);
      else if (localX > bounds.width * .56) changeLane(1);
    }
    touchStart = null;
  });
  stage.addEventListener('pointercancel', () => { touchStart = null; });

  bestEl.innerHTML = `${best} <small>hub</small>`;
  buildScenery();
  window.addEventListener('resize', resize);
  updateHud();
  resize();
})();
