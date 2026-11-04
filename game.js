(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const badgerSprite = new Image();
  badgerSprite.addEventListener('load', () => draw());
  badgerSprite.src = './badger.png';
  const beerSprite = new Image();
  beerSprite.addEventListener('load', () => draw());
  beerSprite.src = './beer.png';
  const runnerHeadSprite = new Image();
  runnerHeadSprite.addEventListener('load', () => draw());
  runnerHeadSprite.src = './runner-head.png';
  const stage = document.getElementById('stage');
  const startScreen = document.getElementById('start-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const pauseIndicator = document.getElementById('pause-indicator');
  const scoreEl = document.getElementById('score');
  const scoreUnitEl = document.getElementById('score-unit');
  const bestEl = document.getElementById('best-score');
  const finalScoreEl = document.getElementById('final-score');
  const finalScoreUnitEl = document.getElementById('final-score-unit');
  const recordMessageEl = document.getElementById('record-message');
  const energyNumberEl = document.getElementById('energy-number');
  const energyFillEl = document.getElementById('energy-fill');
  const energyProgressEl = document.getElementById('energy-progress');
  const distanceNumberEl = document.getElementById('distance-number');
  const distanceFillEl = document.getElementById('distance-fill');
  const distanceBadgerEl = document.querySelector('.distance-badger');
  const clockEl = document.getElementById('run-clock');
  const leaderboardConfig = window.JEzevecLeaderboardConfig || {};
  const leaderboardUrl = String(leaderboardConfig.projectUrl || '').replace(/\/+$/, '');
  const leaderboardKey = String(leaderboardConfig.publishableKey || '').trim();
  const leaderboardReady = Boolean(leaderboardUrl && leaderboardKey);
  const playerNameInput = document.getElementById('player-name');
  const scoreForm = document.getElementById('score-form');
  const scoreSubmitButton = document.getElementById('score-submit');
  const leaderboardRefreshButton = document.getElementById('leaderboard-refresh');
  const leaderboardStatus = document.getElementById('leaderboard-status');
  const leaderboardList = document.getElementById('leaderboard-list');

  const W = 960;
  const H = 540;
  const RUNNER_X = 310;
  const MAX_DISTANCE = 100;
  const LANES = [0, 1, 2];
  const LANE_SPACING = 46;
  const BEST_KEY = 'jezevec-best-score-v1';
  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;

  function mushroomForm(count) {
    const number = Math.abs(Math.trunc(Number(count) || 0));
    const lastTwo = number % 100;
    if (lastTwo >= 11 && lastTwo <= 19) return 'hub';
    const lastDigit = number % 10;
    if (lastDigit === 1) return 'houba';
    if (lastDigit >= 2 && lastDigit <= 4) return 'houby';
    return 'hub';
  }

  function formatMushroomCount(count) {
    return `${count} ${mushroomForm(count)}`;
  }

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
  let distance = 25;
  let objects = [];
  let trees = [];
  let motes = [];
  let touchStart = null;
  let newRecord = false;
  let scoreSubmitted = false;

  playerNameInput.value = readNickname();
  scoreSubmitButton.disabled = !leaderboardReady;
  leaderboardRefreshButton.disabled = !leaderboardReady;
  if (!leaderboardReady) setLeaderboardStatus('Žebříček čeká na připojení Supabase projektu.');

  function readBest() {
    try { return Number(localStorage.getItem(BEST_KEY)) || 0; }
    catch { return 0; }
  }

  function saveBest(value) {
    try { localStorage.setItem(BEST_KEY, String(value)); } catch { /* private browsing can block storage */ }
  }

  function readNickname() {
    try { return localStorage.getItem('jezevec-player-nickname-v1') || ''; }
    catch { return ''; }
  }

  function saveNickname(value) {
    try { localStorage.setItem('jezevec-player-nickname-v1', value); } catch { /* private browsing can block storage */ }
  }

  function setLeaderboardStatus(message, isError = false) {
    leaderboardStatus.textContent = message;
    leaderboardStatus.dataset.state = isError ? 'error' : '';
  }

  function renderLeaderboard(rows) {
    leaderboardList.replaceChildren();
    if (!rows.length) {
      setLeaderboardStatus('Zatím tu nikdo není. Buď první!');
      return;
    }

    rows.forEach((entry, index) => {
      const row = document.createElement('li');
      row.className = 'leaderboard-row';
      const rank = document.createElement('span');
      rank.className = 'leaderboard-rank';
      rank.textContent = `${index + 1}.`;
      const name = document.createElement('span');
      name.className = 'leaderboard-name';
      name.textContent = String(entry.nickname || 'Bezejmenný');
      const value = document.createElement('span');
      value.className = 'leaderboard-score';
      value.textContent = formatMushroomCount(Math.max(0, Number(entry.score) || 0));
      row.append(rank, name, value);
      leaderboardList.append(row);
    });
    setLeaderboardStatus('Nejlepší běžci v lese.');
  }

  async function refreshLeaderboard() {
    if (!leaderboardReady) {
      setLeaderboardStatus('Žebříček čeká na připojení Supabase projektu.');
      return;
    }

    leaderboardRefreshButton.disabled = true;
    setLeaderboardStatus('Načítám výsledky…');
    const query = new URLSearchParams({
      select: 'nickname,score',
      order: 'score.desc,created_at.asc',
      limit: '5'
    });

    try {
      const response = await fetch(`${leaderboardUrl}/rest/v1/jezevec_scores?${query}`, {
        headers: { apikey: leaderboardKey, Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('Leaderboard request failed');
      renderLeaderboard(await response.json());
    } catch {
      setLeaderboardStatus('Žebříček se nepodařilo načíst.', true);
    } finally {
      leaderboardRefreshButton.disabled = false;
    }
  }

  async function submitLeaderboardScore(event) {
    event.preventDefault();
    if (!leaderboardReady || scoreSubmitted) return;

    const nickname = playerNameInput.value.trim().replace(/\s+/g, ' ');
    if (!nickname || nickname.length > 16) {
      setLeaderboardStatus('Nick musí mít 1 až 16 znaků.', true);
      return;
    }

    scoreSubmitButton.disabled = true;
    setLeaderboardStatus('Ukládám skóre…');
    try {
      const response = await fetch(`${leaderboardUrl}/rest/v1/jezevec_scores`, {
        method: 'POST',
        headers: {
          apikey: leaderboardKey,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ nickname, score: Math.min(99999, Math.max(0, Math.floor(score))) })
      });
      if (!response.ok) throw new Error('Score submission failed');
      scoreSubmitted = true;
      saveNickname(nickname);
      await refreshLeaderboard();
      setLeaderboardStatus('Skóre je uložené ve veřejném žebříčku.');
    } catch {
      setLeaderboardStatus('Skóre se nepodařilo uložit. Zkus to znovu.', true);
    } finally {
      scoreSubmitButton.disabled = scoreSubmitted;
    }
  }

  function buildScenery() {
    trees = [];
    for (let i = 0; i < 20; i++) {
      trees.push({
        side: -1,
        x: rand(-80, W + 80),
        size: rand(.6, 1.7),
        shade: Math.floor(rand(0, 4)),
        layer: rand(.35, 1.15),
        sway: rand(0, Math.PI * 2)
      });
    }
    motes = Array.from({ length: 34 }, () => ({ x: rand(0, W), y: rand(22, 260), r: rand(.6, 2.1), speed: rand(5, 16), phase: rand(0, 8) }));
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
    drawGround();
    drawForest();
    drawTrail();
    drawMotes();
    const ordered = [...objects].sort((a, b) => a.x - b.x);
    for (const object of ordered) drawObject(object);
    if (state !== 'over') drawRunner();
    drawChaser();
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

  function drawGround() {
    ctx.fillStyle = '#1b2c22';
    ctx.fillRect(0, 250, W, H - 250);
  }

  function drawForest() {
    for (const tree of trees) {
      const rawX = tree.x - sceneryOffset * tree.layer * .72;
      const x = ((rawX + 120) % (W + 240) + (W + 240)) % (W + 240) - 120;
      const size = tree.size * (tree.side < 0 ? .74 : 1.08) * 58;
      const pathTop = trackCenterAt(x) - 93;
      const pathBottom = trackCenterAt(x) + 93;
      const y = tree.side < 0 ? pathTop - 6 : pathBottom + size * 1.08 + 7;
      drawTree(x, y, size, tree.side, tree.shade, tree.sway + elapsed * .18);
    }
  }

  function drawTree(x, y, size, side, shade, sway) {
    const colors = ['#15241d', '#1a2b21', '#203126', '#26382a'];
    const trunkWidth = size * .12;
    const trunkHeight = size * .72;
    const lean = Math.sin(sway) * size * .035 * side;
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
    ctx.beginPath();
    for (let x = -20; x <= W + 20; x += 20) {
      const edge = trackCenterAt(x) - 93;
      if (x === -20) ctx.moveTo(x, edge);
      else ctx.lineTo(x, edge);
    }
    for (let x = W + 20; x >= -20; x -= 20) ctx.lineTo(x, trackCenterAt(x) + 93);
    ctx.closePath();
    const dirt = ctx.createLinearGradient(0, 265, 0, 465);
    dirt.addColorStop(0, '#30392c');
    dirt.addColorStop(.5, '#403e30');
    dirt.addColorStop(1, '#514738');
    ctx.fillStyle = dirt;
    ctx.fill();

    ctx.strokeStyle = 'rgba(154, 163, 120, .22)';
    ctx.lineWidth = 2;
    for (const edgeOffset of [-93, 93]) {
      ctx.beginPath();
      for (let x = -20; x <= W + 20; x += 20) {
        const y = trackCenterAt(x) + edgeOffset;
        if (x === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.save();
    ctx.beginPath();
    for (let x = -20; x <= W + 20; x += 20) {
      const y = trackCenterAt(x) - 90;
      if (x === -20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let x = W + 20; x >= -20; x -= 20) ctx.lineTo(x, trackCenterAt(x) + 90);
    ctx.closePath();
    ctx.clip();

    for (let i = 0; i < 22; i++) {
      const x = ((i * 67 - sceneryOffset * .9) % (W + 80) + W + 80) % (W + 80) - 40;
      const y = trackCenterAt(x) + Math.sin(i * 4.1) * 64;
      ctx.fillStyle = `rgba(190, 184, 140, ${.09 + (i % 3) * .025})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 3 + (i % 3), 1.5, -.2, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let laneIndex = 0; laneIndex < 2; laneIndex++) {
      const offset = laneIndex === 0 ? -LANE_SPACING / 2 : LANE_SPACING / 2;
      ctx.strokeStyle = 'rgba(206, 198, 150, .09)';
      ctx.lineWidth = 1;
      ctx.setLineDash([16, 28]);
      ctx.lineDashOffset = sceneryOffset * .8;
      ctx.beginPath();
      for (let x = -20; x <= W + 20; x += 20) {
        const y = trackCenterAt(x) + offset;
        if (x === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    const fog = ctx.createLinearGradient(0, 190, 0, 305);
    fog.addColorStop(0, 'rgba(191, 203, 163, .1)');
    fog.addColorStop(1, 'rgba(191, 203, 163, 0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, 185, W, 150);
  }

  function drawMotes() {
    for (const mote of motes) {
      const drift = Math.sin(elapsed * .4 + mote.phase) * 20;
      const x = ((mote.x - sceneryOffset * .08 * mote.speed + drift) % W + W) % W;
      const y = mote.y + Math.sin(elapsed * .4 + mote.phase) * 5;
      ctx.fillStyle = `rgba(222, 226, 170, ${.13 + Math.sin(elapsed + mote.phase) ** 2 * .38})`;
      ctx.beginPath();
      ctx.arc(x, y, mote.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function trackCenterAt(x) {
    const phase = x + sceneryOffset * .28;
    return 358 + Math.sin(phase / 172) * 18 + Math.sin(phase / 91) * 8;
  }

  function laneY(laneIndex, x = RUNNER_X) {
    return trackCenterAt(x) + (laneIndex - 1) * LANE_SPACING;
  }

  function drawObject(object) {
    const x = object.x;
    const y = laneY(object.lane, x) + 4;
    const scale = object.type === 'log' ? .95 : .88;
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
    const height = 66 * s;
    const aura = ctx.createRadialGradient(0, -height * .52, 2, 0, -height * .52, 42 * s);
    aura.addColorStop(0, `rgba(164, 210, 113, ${.38 + glow * .12})`);
    aura.addColorStop(1, 'rgba(164, 210, 113, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, -height * .52, 42 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(5, 8, 6, .4)';
    ctx.beginPath();
    ctx.ellipse(0, 3 * s, 12 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (beerSprite.complete && beerSprite.naturalWidth > 0) {
      ctx.drawImage(beerSprite, -height / 2, -height, height, height);
    }
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
    const x = RUNNER_X;
    const y = laneY(lane, x);
    const bob = state === 'running' ? Math.sin(elapsed * 13) * 2.2 : 0;
    const stride = state === 'running' ? Math.sin(elapsed * 13) * 5 : 0;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = 'rgba(5, 8, 6, .48)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 23, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#313632';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, -2);
    ctx.lineTo(-8 - stride, 8);
    ctx.moveTo(10, -1);
    ctx.lineTo(12 + stride, 8);
    ctx.stroke();
    ctx.strokeStyle = '#aea78e';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-11 - stride, 9);
    ctx.lineTo(-5 - stride, 9);
    ctx.moveTo(10 + stride, 9);
    ctx.lineTo(17 + stride, 9);
    ctx.stroke();
    ctx.fillStyle = '#9b5944';
    ctx.beginPath();
    ctx.moveTo(-9, -31);
    ctx.quadraticCurveTo(-15, -26, -13, -8);
    ctx.quadraticCurveTo(-3, -1, 17, -7);
    ctx.lineTo(15, -27);
    ctx.quadraticCurveTo(3, -34, -9, -31);
    ctx.fill();
    ctx.fillStyle = '#bf7859';
    ctx.beginPath();
    ctx.ellipse(-12, -24, 4, 8, -.38, 0, Math.PI * 2);
    ctx.ellipse(17, -23, 4, 8, .38, 0, Math.PI * 2);
    ctx.fill();
    if (runnerHeadSprite.complete && runnerHeadSprite.naturalWidth > 0) {
      const headHeight = 54;
      const headWidth = headHeight * runnerHeadSprite.naturalWidth / runnerHeadSprite.naturalHeight;
      ctx.drawImage(runnerHeadSprite, 8 - headWidth / 2, -76, headWidth, headHeight);
    } else {
      ctx.fillStyle = '#c6a37d';
      ctx.beginPath();
      ctx.arc(8, -38, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d2aa4f';
      ctx.beginPath();
      ctx.arc(8, -41, 10, Math.PI, Math.PI * 2);
      ctx.quadraticCurveTo(8, -51, -2, -41);
      ctx.fill();
      ctx.fillStyle = '#4d382c';
      ctx.fillRect(-1, -41, 18, 2.3);
    }
    ctx.fillStyle = '#8c6f48';
    ctx.beginPath();
    ctx.moveTo(10, -21);
    ctx.quadraticCurveTo(18, -18, 22, -13);
    ctx.lineTo(13, -12);
    ctx.fill();
    ctx.restore();
  }

  function drawBadger(x, y, scale) {
    if (!badgerSprite.complete || !badgerSprite.naturalWidth) return;
    const width = 210 * scale;
    const height = width * badgerSprite.naturalHeight / badgerSprite.naturalWidth;
    ctx.drawImage(badgerSprite, x - width / 2, y - height * .9, width, height);
  }

  function drawChaser() {
    const closeness = clamp(1 - distance / MAX_DISTANCE, 0, 1);
    const scale = lerp(.68, 1.05, closeness);
    const y = laneY(lane, RUNNER_X) + 4;
    const x = lerp(110, RUNNER_X - 100, closeness);
    drawBadger(x, y, scale);
  }

  function drawVignette() {
    const gradient = ctx.createRadialGradient(RUNNER_X, 355, 105, 465, 355, 600);
    gradient.addColorStop(0, 'rgba(6, 10, 8, 0)');
    gradient.addColorStop(.62, 'rgba(5, 9, 7, .12)');
    gradient.addColorStop(1, 'rgba(4, 8, 6, .64)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
  }

  function addObject(type, laneIndex = Math.floor(rand(0, LANES.length)), x = W + 55) {
    objects.push({ type, lane: laneIndex, x, variant: Math.floor(rand(0, 2)), glow: rand(0, 1) });
  }

  function spawnPattern(difficultyLevel) {
    const entryX = W + 55;
    if (Math.random() < .18) {
      addObject('mushroom', Math.floor(rand(0, LANES.length)), entryX);
      return;
    }

    const firstLane = Math.floor(rand(0, LANES.length));
    addObject(Math.random() < .55 ? 'stump' : 'log', firstLane, entryX);
    const blockedLanes = [firstLane];
    const extraObstacleChance = Math.min(.62, .28 + difficultyLevel * .055);

    if (Math.random() < extraObstacleChance) {
      const secondLane = (firstLane + (Math.random() < .5 ? 1 : 2)) % LANES.length;
      addObject(Math.random() < .55 ? 'stump' : 'log', secondLane, entryX + rand(125, 170));
      blockedLanes.push(secondLane);
    }

    if (Math.random() < .36) {
      const openLanes = LANES.filter((laneIndex) => !blockedLanes.includes(laneIndex));
      const mushroomLane = openLanes[Math.floor(rand(0, openLanes.length))];
      addObject('mushroom', mushroomLane, entryX + rand(65, 250));
    }
  }

  function startGame() {
    state = 'running';
    elapsed = 0;
    sceneryOffset = 0;
    score = 0;
    energy = 100;
    distance = 25;
    lane = 1;
    objects = [];
    spawnTimer = .7;
    beerTimer = rand(3.5, 6);
    shake = 0;
    flash = 0;
    newRecord = false;
    scoreSubmitted = false;
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
    finalScoreUnitEl.textContent = mushroomForm(score);
    recordMessageEl.textContent = newRecord ? 'Nový osobní rekord!' : score === best ? 'Vyrovnaný osobní rekord.' : `Osobní rekord: ${formatMushroomCount(best)}.`;
    recordMessageEl.style.color = newRecord ? '#d9bb79' : '#b4c58d';
    bestEl.innerHTML = `${best} <small>${mushroomForm(best)}</small>`;
    gameoverScreen.hidden = false;
    pauseIndicator.hidden = true;
    refreshLeaderboard();
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
      const difficultyLevel = Math.floor(elapsed / 20);
      spawnPattern(difficultyLevel);
      const waveInterval = Math.max(.66, 1.2 * Math.pow(.92, difficultyLevel));
      spawnTimer = rand(waveInterval * .85, waveInterval * 1.15);
    }
    if (energy < 50 && beerTimer <= 0 && !objects.some((object) => object.type === 'beer')) {
      if (Math.random() < .78) addObject('beer');
      beerTimer = rand(4.4, 7.8);
    }

    const trailSpeed = 112 + energy * .98 + Math.min(34, elapsed * .18);
    const runnerSpeed = 29 + energy * .116;
    const badgerSpeed = 33 + Math.min(12, elapsed * .12);
    distance += (runnerSpeed - badgerSpeed) * dt;
    distance = clamp(distance, 0, MAX_DISTANCE);

    for (const object of objects) object.x -= trailSpeed * dt;
    for (let i = objects.length - 1; i >= 0; i--) {
      const object = objects[i];
      if (Math.abs(object.x - RUNNER_X) < 27 && object.lane === lane) {
        if (object.type === 'mushroom') {
          score += 1;
          flash = Math.max(flash, .2);
        } else if (object.type === 'beer') {
          energy = Math.min(100, energy + 38);
          distance = Math.min(MAX_DISTANCE, distance + 33);
          flash = .5;
        } else {
          energy = Math.max(0, energy - 19);
          distance -= 16;
          shake = 8;
          flash = .85;
        }
        objects.splice(i, 1);
      } else if (object.x < -55) objects.splice(i, 1);
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
    scoreUnitEl.textContent = mushroomForm(score);
    energyNumberEl.innerHTML = `${Math.ceil(energy)}<span>%</span>`;
    energyFillEl.style.width = `${energy}%`;
    energyProgressEl.setAttribute('aria-valuenow', String(Math.round(energy)));
    if (energy < 25) energyFillEl.style.background = 'linear-gradient(90deg, #c7715d, #e09a70)';
    else if (energy < 50) energyFillEl.style.background = 'linear-gradient(90deg, #c6975b, #e1c078)';
    else energyFillEl.style.background = 'linear-gradient(90deg, #90b66e, #bdd58f)';
    distanceNumberEl.innerHTML = `${Math.max(0, Math.round(distance))} <small>m</small>`;
    const closeness = clamp(1 - distance / MAX_DISTANCE, 0, 1);
    distanceFillEl.style.width = `${(1 - closeness) * 100}%`;
    distanceBadgerEl.style.left = `${(1 - closeness) * 100}%`;
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = Math.floor(elapsed % 60).toString().padStart(2, '0');
    clockEl.textContent = `${mins}:${secs}`;
  }

  function changeLane(direction) {
    if (state !== 'running') return;
    lane = clamp(lane + direction, 0, LANES.length - 1);
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
    distance = 25;
    elapsed = 0;
    updateHud();
    draw();
  }

  document.getElementById('start-button').addEventListener('click', startGame);
  document.getElementById('restart-button').addEventListener('click', startGame);
  scoreForm.addEventListener('submit', submitLeaderboardScore);
  leaderboardRefreshButton.addEventListener('click', refreshLeaderboard);
  window.addEventListener('keydown', (event) => {
    if (event.target instanceof Element && event.target.matches('input, textarea, select')) return;
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', ' ', 'escape'].includes(key)) event.preventDefault();
    if (key === 'arrowup' || key === 'w') changeLane(-1);
    else if (key === 'arrowdown' || key === 's') changeLane(1);
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
    if (Math.abs(dy) > 24) changeLane(dy < 0 ? -1 : 1);
    else if (Math.abs(dx) < 22) {
      const bounds = stage.getBoundingClientRect();
      const localY = event.clientY - bounds.top;
      if (localY < bounds.height * .44) changeLane(-1);
      else if (localY > bounds.height * .56) changeLane(1);
    }
    touchStart = null;
  });
  stage.addEventListener('pointercancel', () => { touchStart = null; });

  bestEl.innerHTML = `${best} <small>${mushroomForm(best)}</small>`;
  buildScenery();
  window.addEventListener('resize', resize);
  updateHud();
  resize();
})();
