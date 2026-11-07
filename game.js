'use strict';
/* Planet Factory — v7.5. Plain canvas, no build step. */
(() => {
const TAU = Math.PI * 2;
const R = 340, NSEG = 144, LAYER = 9, LAYERS = 3, ROCK_R = R - LAYER * LAYERS;
const SAVE_VER = 3; // placement repair stays planet-aware; v7.5 cost changes do not move buildings
const G = 950, REACH = 175, BUILD_RANGE = 480, LINK_RANGE = 360, BELT_SPEED = 62, MAX_ITEMS = 220;
const GOOP_SPAWN_MULT = 0.3; // relative spawn rate (both planets); intervals scale by 1/MULT
const GOOP_SPAWN_INTERVAL = 14 / GOOP_SPAWN_MULT; // was 14s between attempts
const GOOP_SPAWN_FIRST = 8 / GOOP_SPAWN_MULT;   // was 8s before the first mid-game spawn
const HOLD_MS = 500, HOLD_MOVE = 10; // mobile long-press delete
const SAVE_KEY = 'planet-factory-v1';
const OUTLINE = '#1b2130';
const SHIP_HALF = 34, SHIP_R = 28, THRUST = 320, TURN = 2.8, MAX_SPEED = 520, BOARD_RANGE = 160, PAD_Y = -112;
const INV_SLOTS = 14;
// landable planets (positions in the Home frame). Each keeps its own world state.
const PLANETS = {
  home: { name: 'Home', x: 0, y: 0, r: R, c1: '#5ac653', c2: '#86593a', col: '#62d05b', glow: 'rgba(120,230,150,' },
  ice: { name: 'Ice Moon', x: -2200, y: 1500, r: R, c1: '#e6f3fb', c2: '#9fb8d6', col: '#a9def7', glow: 'rgba(170,220,255,', cold: true },
  dust: { name: 'Red Dust', x: 2600, y: -900, r: R * 3, c1: '#d9603b', c2: '#a8432a', col: '#e07840', glow: 'rgba(240,120,80,', hot: true, needShip: 'corvette' },
};
const THEME = {
  home: { rock: ['#5d6576', '#4c5363'], core: ['#d9783a', '#ffb347'], speck: '#6c7487', dirt: '#86593a', top: ['#62d05b', '#5ac653'], dugTop: '#9c6a45' },
  ice: { rock: ['#5f7290', '#4d5d79'], core: ['#4fa3e0', '#a9e4ff'], speck: '#7487a6', dirt: '#7d6150', top: ['#f4fbff', '#e3f1fa'], dugTop: '#c3d8ec' },
  dust: { rock: ['#6a3a2a', '#4a2418'], core: ['#c45a20', '#ff8a3d'], speck: '#8a4a32', dirt: '#8a3a28', top: ['#c45a3a', '#a84830'], dugTop: '#9a4a32' },
};
const FAR = [];
const WKEYS = ['dug', 'trees', 'bushes', 'debris', 'items', 'buildings', 'conveyors', 'catwalks', 'links', 'goops', 'goopTimer'];
const ITEMS = ['wood', 'dirt', 'stone', 'iron', 'jelly', 'ice', 'frost', 'coore', 'cobalt', 'gear', 'wire', 'circuit', 'frame', 'rdust', 'heatsteel', 'ember', 'magma'];
const INAME = { wood: 'Wood', dirt: 'Dirt', stone: 'Stone', iron: 'Iron', jelly: 'Jelly', ice: 'Ice', frost: 'Frost Crystal', coore: 'Cobalt Ore', cobalt: 'Cobalt Bar', gear: 'Gear', wire: 'Wire', circuit: 'Circuit', frame: 'Frame', rdust: 'Red Dust Ore', heatsteel: 'Heatsteel', ember: 'Ember Crystal', magma: 'Magma' };
const ICOL = {
  wood: ['#c08447', '#7d4f24'], dirt: ['#8f5d35', '#5b391d'], stone: ['#a3aab4', '#626873'],
  iron: ['#eef2f6', '#98a2ad'], jelly: ['#86f27c', '#33a533'],
  ice: ['#dff4ff', '#8fc4e8'], frost: ['#8fe6ff', '#2f97c9'], coore: ['#5b6f9e', '#36456b'], cobalt: ['#4f7dff', '#2b4bb8'],
  gear: ['#d4b06a', '#8a6a30'], wire: ['#f0c040', '#b8860b'], circuit: ['#5dff9a', '#1f8a4a'], frame: ['#9aa8bc', '#4a5568'],
  rdust: ['#d9603b', '#8a2a18'], heatsteel: ['#ff8a4a', '#a84820'], ember: ['#ff5a2a', '#c02010'], magma: ['#ff6a1a', '#b82008'],
};

// ---- material textures (procedural, shared by world drops + UI cubes) ----
const MAT_URL = {};
function matHash(type) { let h = 0; for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) | 0; return h; }
/** Draw a distinctive material icon centered in a size×size box at (0,0) top-left, or pass ox,oy. */
function paintMat(c, type, size, ox = 0, oy = 0) {
  const [c1, c2] = ICOL[type] || ['#888', '#444'];
  const s = size, h = s / 2, r = Math.max(1.5, s * 0.14);
  c.save(); c.translate(ox, oy);
  // base plate
  const rad = (x, y, w, hh, rr, fill, stroke, lw) => {
    const rad2 = Math.min(rr, w / 2, hh / 2);
    c.beginPath();
    c.moveTo(x + rad2, y); c.arcTo(x + w, y, x + w, y + hh, rad2); c.arcTo(x + w, y + hh, x, y + hh, rad2);
    c.arcTo(x, y + hh, x, y, rad2); c.arcTo(x, y, x + w, y, rad2); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || Math.max(1, s * 0.08); c.stroke(); }
  };
  const seed = matHash(type);
  const nrand = (i) => { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };

  if (type === 'jelly') {
    c.beginPath(); c.arc(h, h * 0.95, h * 0.72, 0, Math.PI * 2);
    c.fillStyle = c1; c.globalAlpha = 0.92; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = c2; c.lineWidth = Math.max(1.2, s * 0.08); c.stroke();
    c.beginPath(); c.arc(h * 0.7, h * 0.65, s * 0.12, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    c.beginPath(); c.arc(h * 1.15, h * 1.15, s * 0.08, 0, Math.PI * 2); c.fillStyle = '#ffffff66'; c.fill();
    c.restore(); return;
  }

  rad(1, 1, s - 2, s - 2, r, c1, OUTLINE, Math.max(1.2, s * 0.09));
  // bottom edge shade
  c.fillStyle = c2; c.globalAlpha = 0.55;
  rad(2, s * 0.62, s - 4, s * 0.32, r * 0.6, c2, null); c.globalAlpha = 1;

  if (type === 'wood') {
    c.strokeStyle = c2; c.lineWidth = Math.max(1, s * 0.06); c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const y = s * (0.28 + i * 0.16);
      c.beginPath(); c.moveTo(s * 0.18, y); c.quadraticCurveTo(h, y + s * 0.04 * (i % 2 ? 1 : -1), s * 0.82, y); c.stroke();
    }
    c.beginPath(); c.arc(h, h, s * 0.14, 0, Math.PI * 2); c.strokeStyle = c2; c.stroke();
    c.beginPath(); c.arc(h, h, s * 0.06, 0, Math.PI * 2); c.fillStyle = '#a06a38'; c.fill();
  } else if (type === 'dirt') {
    for (let i = 0; i < 9; i++) {
      const x = s * (0.2 + nrand(i) * 0.6), y = s * (0.2 + nrand(i + 9) * 0.55);
      c.beginPath(); c.arc(x, y, s * (0.05 + nrand(i + 3) * 0.06), 0, Math.PI * 2);
      c.fillStyle = nrand(i + 5) > 0.5 ? c2 : '#a07040'; c.fill();
    }
  } else if (type === 'stone') {
    c.strokeStyle = c2; c.lineWidth = Math.max(1, s * 0.05);
    c.beginPath(); c.moveTo(s * 0.25, s * 0.35); c.lineTo(s * 0.55, s * 0.22); c.lineTo(s * 0.78, s * 0.4); c.stroke();
    c.beginPath(); c.moveTo(s * 0.3, s * 0.55); c.lineTo(s * 0.5, s * 0.45); c.lineTo(s * 0.48, s * 0.7); c.stroke();
    c.fillStyle = '#c0c6d0'; c.fillRect(s * 0.55, s * 0.55, s * 0.12, s * 0.1);
  } else if (type === 'iron') {
    rad(s * 0.18, s * 0.28, s * 0.64, s * 0.38, 2, '#f7f9fc', c2, Math.max(1, s * 0.06));
    c.fillStyle = '#ffffffcc'; c.fillRect(s * 0.22, s * 0.32, s * 0.18, s * 0.1);
    c.fillStyle = c2; c.fillRect(s * 0.2, s * 0.55, s * 0.6, s * 0.06);
  } else if (type === 'ice') {
    c.strokeStyle = '#ffffffaa'; c.lineWidth = Math.max(1, s * 0.05);
    c.beginPath(); c.moveTo(h, s * 0.18); c.lineTo(s * 0.78, h); c.lineTo(h, s * 0.82); c.lineTo(s * 0.22, h); c.closePath(); c.stroke();
    c.fillStyle = '#ffffff66'; c.beginPath(); c.moveTo(h, s * 0.3); c.lineTo(s * 0.55, h); c.lineTo(h, s * 0.55); c.closePath(); c.fill();
  } else if (type === 'frost') {
    c.strokeStyle = '#e8fbff'; c.lineWidth = Math.max(1.2, s * 0.07); c.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      c.beginPath(); c.moveTo(h, h); c.lineTo(h + Math.cos(a) * s * 0.32, h + Math.sin(a) * s * 0.32); c.stroke();
      c.beginPath(); c.moveTo(h + Math.cos(a) * s * 0.18, h + Math.sin(a) * s * 0.18);
      c.lineTo(h + Math.cos(a) * s * 0.18 + Math.cos(a + 1.2) * s * 0.1, h + Math.sin(a) * s * 0.18 + Math.sin(a + 1.2) * s * 0.1); c.stroke();
    }
    c.beginPath(); c.arc(h, h, s * 0.08, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
  } else if (type === 'coore') {
    c.fillStyle = c2;
    c.beginPath(); c.moveTo(s * 0.25, s * 0.7); c.lineTo(s * 0.2, s * 0.4); c.lineTo(s * 0.45, s * 0.25); c.lineTo(s * 0.75, s * 0.35); c.lineTo(s * 0.8, s * 0.65); c.closePath(); c.fill();
    c.fillStyle = '#6a9cff';
    for (let i = 0; i < 5; i++) c.fillRect(s * (0.3 + nrand(i) * 0.4), s * (0.35 + nrand(i + 4) * 0.3), s * 0.08, s * 0.08);
  } else if (type === 'cobalt') {
    rad(s * 0.16, s * 0.3, s * 0.68, s * 0.36, 2, c1, '#1a2a6e', Math.max(1, s * 0.06));
    c.fillStyle = '#a8c4ff'; c.fillRect(s * 0.22, s * 0.34, s * 0.2, s * 0.08);
    c.fillStyle = '#2b4bb8'; c.fillRect(s * 0.2, s * 0.55, s * 0.6, s * 0.05);
  } else if (type === 'gear') {
    c.fillStyle = c1; c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, R = i % 2 ? s * 0.22 : s * 0.38;
      const x = h + Math.cos(a) * R, y = h + Math.sin(a) * R;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath(); c.fill(); c.strokeStyle = c2; c.lineWidth = Math.max(1, s * 0.06); c.stroke();
    c.beginPath(); c.arc(h, h, s * 0.12, 0, Math.PI * 2); c.fillStyle = '#1b2130'; c.fill();
    c.beginPath(); c.arc(h, h, s * 0.06, 0, Math.PI * 2); c.fillStyle = c1; c.fill();
  } else if (type === 'wire') {
    c.strokeStyle = c1; c.lineWidth = Math.max(1.5, s * 0.1); c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i <= 8; i++) {
      const x = s * (0.2 + i * 0.075), y = h + Math.sin(i * 1.1) * s * 0.22;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.stroke();
    c.strokeStyle = c2; c.lineWidth = Math.max(1, s * 0.05); c.stroke();
    c.fillStyle = '#d4a017'; c.fillRect(s * 0.15, h - s * 0.08, s * 0.1, s * 0.16); c.fillRect(s * 0.75, h - s * 0.08, s * 0.1, s * 0.16);
  } else if (type === 'circuit') {
    rad(s * 0.14, s * 0.14, s * 0.72, s * 0.72, 2, '#1a5c32', null);
    c.strokeStyle = '#7dffb0'; c.lineWidth = Math.max(1, s * 0.05);
    c.beginPath(); c.moveTo(s * 0.25, s * 0.3); c.lineTo(s * 0.45, s * 0.3); c.lineTo(s * 0.45, s * 0.55); c.lineTo(s * 0.7, s * 0.55); c.stroke();
    c.beginPath(); c.moveTo(s * 0.3, s * 0.7); c.lineTo(s * 0.3, s * 0.45); c.lineTo(s * 0.6, s * 0.45); c.stroke();
    c.fillStyle = '#ffd84a'; c.fillRect(s * 0.38, s * 0.38, s * 0.14, s * 0.14);
    c.fillStyle = '#5dff9a'; for (let i = 0; i < 4; i++) c.fillRect(s * (0.55 + (i % 2) * 0.12), s * (0.25 + Math.floor(i / 2) * 0.12), s * 0.07, s * 0.07);
  } else if (type === 'frame') {
    c.strokeStyle = c1; c.lineWidth = Math.max(2, s * 0.12); c.lineJoin = 'round';
    c.strokeRect(s * 0.22, s * 0.22, s * 0.56, s * 0.56);
    c.strokeStyle = c2; c.lineWidth = Math.max(1, s * 0.05);
    c.beginPath(); c.moveTo(s * 0.22, s * 0.4); c.lineTo(s * 0.4, s * 0.22); c.moveTo(s * 0.6, s * 0.78); c.lineTo(s * 0.78, s * 0.6); c.stroke();
    c.fillStyle = '#c5d0e0'; c.fillRect(s * 0.18, s * 0.18, s * 0.12, s * 0.12); c.fillRect(s * 0.7, s * 0.7, s * 0.12, s * 0.12);
  } else if (type === 'rdust') {
    c.fillStyle = c2;
    c.beginPath(); c.moveTo(s * 0.3, s * 0.72); c.quadraticCurveTo(s * 0.2, s * 0.4, s * 0.45, s * 0.28); c.quadraticCurveTo(s * 0.75, s * 0.35, s * 0.78, s * 0.65); c.closePath(); c.fill();
    c.fillStyle = '#ff8a4a';
    for (let i = 0; i < 6; i++) c.beginPath(), c.arc(s * (0.35 + nrand(i) * 0.35), s * (0.35 + nrand(i + 2) * 0.3), s * 0.05, 0, Math.PI * 2), c.fill();
  } else if (type === 'heatsteel') {
    rad(s * 0.16, s * 0.3, s * 0.68, s * 0.36, 2, c1, c2, Math.max(1, s * 0.06));
    c.fillStyle = '#ffd84a'; c.globalAlpha = 0.85;
    for (let i = 0; i < 3; i++) c.fillRect(s * (0.25 + i * 0.18), s * 0.36, s * 0.08, s * 0.22);
    c.globalAlpha = 1;
    c.fillStyle = '#fff6'; c.fillRect(s * 0.22, s * 0.34, s * 0.16, s * 0.06);
  } else if (type === 'ember') {
    c.fillStyle = c1;
    c.beginPath(); c.moveTo(h, s * 0.15); c.lineTo(s * 0.78, h); c.lineTo(h, s * 0.85); c.lineTo(s * 0.22, h); c.closePath(); c.fill();
    c.strokeStyle = c2; c.lineWidth = Math.max(1.2, s * 0.07); c.stroke();
    c.fillStyle = '#ffd84a'; c.beginPath(); c.moveTo(h, s * 0.35); c.lineTo(s * 0.58, h); c.lineTo(h, s * 0.65); c.lineTo(s * 0.42, h); c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(h, h, s * 0.08, 0, Math.PI * 2); c.fill();
  } else if (type === 'magma') {
    c.beginPath(); c.moveTo(s * 0.2, s * 0.7); c.quadraticCurveTo(s * 0.15, s * 0.35, h, s * 0.22); c.quadraticCurveTo(s * 0.85, s * 0.35, s * 0.8, s * 0.7); c.closePath();
    c.fillStyle = c1; c.fill(); c.strokeStyle = c2; c.lineWidth = Math.max(1.2, s * 0.07); c.stroke();
    c.fillStyle = '#ffd84a'; c.beginPath(); c.arc(s * 0.38, s * 0.45, s * 0.08, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(s * 0.62, s * 0.5, s * 0.07, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff8a3d'; c.beginPath(); c.arc(h, s * 0.38, s * 0.05, 0, Math.PI * 2); c.fill();
  } else {
    // generic fallback speckles
    c.fillStyle = c2;
    for (let i = 0; i < 5; i++) c.fillRect(s * (0.25 + nrand(i) * 0.5), s * (0.25 + nrand(i + 7) * 0.4), s * 0.1, s * 0.1);
  }
  // top shine
  c.fillStyle = '#ffffff33'; rad(s * 0.15, s * 0.12, s * 0.45, s * 0.14, r, '#ffffff33', null);
  c.restore();
}
function ensureMatIcons() {
  if (MAT_URL.wood) return;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  for (const k of ITEMS) {
    g.clearRect(0, 0, 64, 64);
    paintMat(g, k, 64);
    MAT_URL[k] = cv.toDataURL('image/png');
  }
}
function matChipStyle(k) {
  ensureMatIcons();
  return `background-image:url(${MAT_URL[k]});background-size:cover;background-color:${ICOL[k][0]};background-repeat:no-repeat`;
}
const SMELT = { stone: 'iron', coore: 'cobalt', rdust: 'heatsteel' };
const GRADE = { dirt: 1, ice: 1.15, stone: 1.25, wood: 1, frost: 1.4, coore: 1.6, rdust: 2.2, ember: 2.8, magma: 1.2 };
const LANE_H = 26, CHEST_CAP = 60, LAMP_R = 200, SHIP_WARM_R = 190, TEMP_DRAIN = 2.2, TEMP_WARM = 30;
const DEF = {
  drill:     { name: 'Drill', cost: { wood: 4, dirt: 4 }, hw: 20, h: 64, demand: 2, every: 9, desc: 'Needs 2 power. Pops out a stone cube every 9s (stone/cobalt on Ice Moon; Red Dust Ore + stone on Red Dust — split with a Sorter).' },
  drill2:    { name: 'Advanced Drill', cost: { stone: 8, frost: 6, cobalt: 4, circuit: 2 }, hw: 22, h: 70, demand: 3, every: 1.5, tier: 2, desc: 'Needs Research Level 2 + 3 power. A cube every 1.5s. Stone chassis, Frost (or Magma), Cobalt (or Heatsteel).' },
  generator: { name: 'Generator', cost: { wood: 3, dirt: 3 }, hw: 18, h: 48, supply: 6, slots: 2, range: 120, desc: 'Makes 6 power (machines use 2–3). Only 2 power lines, short reach (~120px). Can hang in the air.' },
  generator2:{ name: 'Advanced Generator', cost: { stone: 8, frost: 6, cobalt: 6, circuit: 2, frame: 2 }, hw: 22, h: 60, supply: 16, slots: 6, range: 480, tier: 2, desc: 'Needs Research Level 2. Makes 16 power · 6 lines · long reach (~480px). Stone chassis, Frost (or Magma), Cobalt (or Heatsteel). Can hang in the air.' },
  catwalk:   { name: 'Catwalk', cost: { wood: 2 }, desc: 'Click a start and an end: a straight walkway on legs. Jump up through it from below and stand on top.' },
  conveyor:  { name: 'Conveyor', cost: { wood: 2 }, desc: 'Click a start and an end: a straight belt between them. Ends snap to machine ports, or hang in the air on legs.' },
  conveyor2: { name: 'Fast Conveyor', cost: { iron: 1, gear: 1 }, tier: 3, desc: 'Needs Research Level 3. Same placement as a Conveyor, but moves items 2× as fast.' },
  furnace:   { name: 'Furnace', cost: { stone: 5, dirt: 2 }, hw: 30, h: 66, demand: 2, desc: 'Needs power. Stone → iron, cobalt ore → cobalt, Red Dust Ore → Heatsteel. In left, out right. Can hang in the air.' },
  assembler: { name: 'Assembler', cost: { iron: 6, stone: 4 }, hw: 28, h: 62, demand: 2, desc: 'Needs power. Pick a recipe. One or two belt inputs on the left (either accepts any ingredient); out on the right. Can hang in the air.' },
  lab:       { name: 'Research Lab', cost: { iron: 8, stone: 6 }, hw: 30, h: 72, demand: 2, desc: 'Needs power. Four input ports — feed Gear / Circuit / Frame by belt into any of them, or hand-deposit. Click to see progress.' },
  turret:    { name: 'Turret', cost: { iron: 4, stone: 2 }, hw: 24, h: 58, demand: 2, desc: 'Needs power. Shoots goop; jelly pops out its side. Can hang in the air.' },
  chest:     { name: 'Chest', cost: { wood: 6, stone: 2 }, hw: 18, h: 34, desc: 'Holds 60 items. Feed it with a conveyor or drop items on it. Click to open. Can hang in the air.' },
  lamp:      { name: 'Lamp', cost: { iron: 2, wood: 2 }, hw: 10, h: 80, desc: 'No power needed. Keeps you warm on cold planets. Can hang in the air.' },
  cooler:    { name: 'Cooler', cost: { iron: 2, wood: 2 }, hw: 12, h: 70, desc: 'No power needed. Keeps you cool on hot Red Dust. Can hang in the air.' },
  filter:    { name: 'Sorter', cost: { iron: 3, gear: 1 }, hw: 18, h: 66, tier: 1, desc: 'Needs Research Level 1. Belt in on the back (⇨). Picked item → low ✓; rest → high ✕. Iron and gears — local on every planet. Can hang in the air.' },
  unloader:  { name: 'Unloader', cost: { iron: 2, gear: 2 }, hw: 14, h: 36, tier: 1, desc: 'Needs Research Level 1. Place next to a Chest. Pops items out onto a conveyor. Iron and gears — local on every planet. Can hang in the air.' },
  splitter:  { name: 'Splitter', cost: { iron: 4, gear: 2 }, hw: 18, h: 66, tier: 3, desc: 'Needs Research Level 3. Belt in on the back; items alternate between the two output ports. Can hang in the air.' },
  merger:    { name: 'Merger', cost: { iron: 4, gear: 2 }, hw: 18, h: 66, tier: 3, desc: 'Needs Research Level 3. Two input ports merge onto one output belt. Can hang in the air.' },
  shipport:  { name: 'Basic Ship Port', cost: { iron: 12, stone: 10, wood: 6, jelly: 5 }, hw: 42, h: 174, demand: 2, desc: 'Builds a gunship. Power the pad, click it or press F to board and fly!' },
  corvetteport: { name: 'Corvette Port', cost: { cobalt: 12, frame: 12, circuit: 10, iron: 20, jelly: 8 }, hw: 52, h: 200, demand: 3, tier: 4, desc: 'Needs Research Level 4. Builds a Corvette that can enter Red Dust\'s thick atmosphere.' },
};
const BUILD_ORDER = ['drill', 'generator', 'conveyor', 'furnace', 'assembler', 'lab', 'chest', 'lamp', 'cooler', 'turret', 'catwalk', 'filter', 'unloader', 'drill2', 'generator2', 'conveyor2', 'splitter', 'merger', 'shipport', 'corvetteport'];
const PORT_TYPES = new Set(['shipport', 'corvetteport']);
const BOXES = ['chest', 'filter', 'unloader', 'assembler', 'lab'];
const AIR_BUILD = new Set(['furnace', 'filter', 'assembler', 'lab', 'splitter', 'merger', 'unloader', 'chest', 'lamp', 'cooler', 'turret', 'generator', 'generator2']); // drills/ports stay grounded
const MAX_AIR_H = 200;
const NODE = { drill: [-8, -60], drill2: [-10, -66], generator: [8, -44], generator2: [0, -56], furnace: [16, -62], assembler: [0, -58], lab: [0, -64], turret: [-26, -52], shipport: [-46, -72], corvetteport: [-52, -80] };
const OUT = { drill: [26, -8], drill2: [28, -8], furnace: [30, -8], assembler: [30, -10], turret: [28, -7], merger: [24, -8] };
const IN = { furnace: [-30, -12], assembler: [-30, -10] };
// Research Lab: 4 input ports along the base (flip-aware). key 'any' = leftover / future items.
const LAB_IN = [
  { key: 'any', p: [-27, -12] },
  { key: 'any', p: [-9, -12] },
  { key: 'any', p: [9, -12] },
  { key: 'any', p: [27, -12] },
];
const LAB_PARTS = new Set(['gear', 'circuit', 'frame']); // research parts any port accepts
function labPorts(b) { return LAB_IN.map(s => ({ key: s.key, p: flipP(b, s.p) })); }

const RECIPES = {
  gear:    { name: 'Gear',    in: { iron: 2 }, out: 'gear', n: 1, time: 2, desc: '2 Iron → 1 Gear' },
  wire:    { name: 'Wire',    in: { cobalt: 1 }, out: 'wire', n: 2, time: 1.5, desc: '1 Cobalt (or Heatsteel) → 2 Wire' },
  circuit: { name: 'Circuit', in: { gear: 1, wire: 2 }, out: 'circuit', n: 1, time: 3, desc: '1 Gear + 2 Wire → 1 Circuit' },
  frame:   { name: 'Frame',   in: { iron: 2, stone: 1 }, out: 'frame', n: 1, time: 2.5, desc: '2 Iron + 1 Stone → 1 Frame' },
  plating: { name: 'Plating', in: { heatsteel: 2, frame: 1 }, out: 'frame', n: 2, time: 4, desc: '2 Heatsteel + 1 Frame → 2 reinforced Frames' },
};
const RECIPE_ORDER = ['gear', 'wire', 'circuit', 'frame', 'plating'];
// One-way, 1:1. The alt fills the primary slot and never the reverse.
// heatsteel→cobalt, magma→frost: special metal / special crystal.
// ice→dirt, stone→dirt: bulk fill so a finite crust cannot cap drills, generators, or furnaces.
// Stone does not satisfy a Stone cost — the iron chain still needs real stone.
const ALT_FOR = { heatsteel: 'cobalt', magma: 'frost', ice: 'dirt', stone: 'dirt' };
// Buildings placed before `paid` was stored refund this catalog, not today's costs.
const LEGACY_COST = {
  filter: { iron: 3, frost: 2 },
  unloader: { cobalt: 2, iron: 2 },
  drill2: { ice: 10, frost: 6, cobalt: 4, circuit: 2 },
  generator2: { ice: 12, frost: 6, cobalt: 6, circuit: 2, frame: 2 },
};
function altTypes(primary) {
  const out = [];
  for (const [alt, prim] of Object.entries(ALT_FOR)) if (prim === primary) out.push(alt);
  return out;
}
// Reserve every primary first, then fill deficits from that line's alts.
// A stack that is also another line's primary (stone vs dirt) is not counted twice.
function planCost(cost, have) {
  const pool = {};
  const touch = (t) => { if (pool[t] == null) pool[t] = Math.max(0, Math.floor(+have(t) || 0)); };
  const spent = {}, need = {};
  for (const [k, v] of Object.entries(cost || {})) {
    const qty = Math.max(0, Math.floor(+v || 0));
    touch(k);
    const take = Math.min(pool[k], qty);
    pool[k] -= take;
    if (take) spent[k] = (spent[k] || 0) + take;
    if (qty > take) need[k] = qty - take;
  }
  const short = {};
  for (const [k, left0] of Object.entries(need)) {
    let left = left0;
    for (const alt of altTypes(k)) {
      touch(alt);
      const take = Math.min(pool[alt], left);
      pool[alt] -= take;
      if (take) spent[alt] = (spent[alt] || 0) + take;
      left -= take;
      if (left <= 0) break;
    }
    if (left > 0) short[k] = left;
  }
  return { ok: Object.keys(short).length === 0, spent, short };
}
const ASSEM_IN = [[-30, -10], [-30, -10 - LANE_H]]; // primary (unchanged) + optional upper input
const BUF_CRAFTS = 2; // buffer cap = recipe need × this (per ingredient)
function assemblerPorts(b) { return ASSEM_IN.map(p => flipP(b, p)); }
function slotOf(r, type) {
  if (!r) return null;
  if (r.in[type] != null) return type;
  const as = ALT_FOR[type];
  return (as && r.in[as] != null) ? as : null;
}
function bufCap(r, type) {
  const slot = slotOf(r, type) || type;
  return (r.in[slot] || 0) * BUF_CRAFTS;
}
function bufCount(b, slot) {
  let n = (b.buf && b.buf[slot]) || 0;
  for (const alt of altTypes(slot)) n += (b.buf && b.buf[alt]) || 0;
  return n;
}
function recipeNeedLabel(k) {
  const alts = altTypes(k).map(a => INAME[a]);
  return alts.length ? `${INAME[k]} or ${alts.join('/')}` : INAME[k];
}
// horizontal flip (±1). placeFlip remembered across placements; b.flip saved on each building
let placeFlip = 1;
function facing(b) {
  if (!b) return placeFlip;
  if (b.flip === 1 || b.flip === -1) return b.flip;
  if (b.dir === -1 || b.dir === 1) return b.dir; // old sorter saves
  return 1;
}
function flipP(b, p) { return [p[0] * facing(b), p[1]]; }
function outOf(b) { const p = OUT[b.type]; return p ? flipP(b, p) : null; }
function inOf(b) { const p = IN[b.type]; return p ? flipP(b, p) : null; }
function nodeOf(b) { const p = NODE[b.type]; return p ? flipP(b, p) : null; }
function togglePlaceFlip() {
  if (!mode || mode.kind !== 'build') return;
  placeFlip = -placeFlip;
  updateFlipBtn();
  toast(placeFlip === -1 ? 'Flipped ←' : 'Flipped →');
}
function updateFlipBtn() {
  const el = $('flipBuildBtn'); if (!el) return;
  const show = !!(mode && mode.kind === 'build');
  el.classList.toggle('hidden', !show);
  el.classList.toggle('flipped', placeFlip === -1);
  el.setAttribute('aria-pressed', placeFlip === -1 ? 'true' : 'false');
}
// build menu tabs (Tier 1 = basics + T1 research; Tier 2 = advanced / late unlocks)
const BUILD_TABS = {
  1: ['drill', 'generator', 'furnace', 'assembler', 'lab', 'conveyor', 'catwalk', 'chest', 'lamp', 'cooler', 'turret', 'shipport', 'filter', 'unloader'],
  2: ['drill2', 'generator2', 'conveyor2', 'splitter', 'merger', 'corvetteport'],
};
let buildTab = 1;
try { const t = +localStorage.getItem(SAVE_KEY + '-buildTab'); if (t === 1 || t === 2) buildTab = t; } catch (e) { /* ignore */ }
function setBuildTab(n) {
  buildTab = n === 2 ? 2 : 1;
  try { localStorage.setItem(SAVE_KEY + '-buildTab', String(buildTab)); } catch (e) { /* ignore */ }
  renderBuildMenu();
}
const TIERS = {
  1: { name: 'Mechanics', need: { gear: 16 }, unlocks: 'Sorter · Unloader' },
  2: { name: 'Electronics', need: { circuit: 12 }, unlocks: 'Advanced Drill · Advanced Generator' },
  3: { name: 'Logistics', need: { circuit: 8, frame: 8 }, unlocks: 'Fast Conveyor · Splitter · Merger' },
  4: { name: 'Corvette', need: { circuit: 15, gear: 15, frame: 15 }, unlocks: 'Corvette Port' },
};
const GOALS_HOME = [
  ['chop', 'Chop a tree for wood (click it)'],
  ['dig', 'Dig dirt (click the ground)'],
  ['drill', 'Build a Drill (B menu)'],
  ['power', 'Click a Generator ⚡ node, then the Drill\'s node'],
  ['pick', 'Grab a stone cube from the Drill (click it)'],
  ['belt', 'Lay a Conveyor from the Drill'],
  ['iron', 'Smelt iron in a Furnace'],
  ['assembler', 'Build an Assembler'],
  ['gear', 'Assemble a Gear'],
  ['lab', 'Build a Research Lab'],
  ['t1', 'Research Mechanics (Level 1)'],
  ['sorter', 'Build a Sorter'],
  ['circuit', 'Assemble a Circuit'],
  ['t2', 'Research Electronics (Level 2)'],
  ['adv', 'Build an Advanced Drill or Generator'],
  ['t3', 'Research Logistics (Level 3)'],
  ['fast', 'Lay a Fast Conveyor'],
  ['jelly', 'Defeat a goop for jelly'],
  ['turret', 'Build a powered Turret'],
  ['ship', 'Build the Basic Ship Port'],
  ['fly', 'Board your ship (F) and fly'],
  ['land', 'Land back on the planet (F)'],
  ['ice', 'Fly to the Ice Moon and land'],
  ['lamp', 'Build a Lamp to stay warm'],
  ['cobalt', 'Smelt a Cobalt Bar'],
  ['t4', 'Research Corvette (Level 4)'],
  ['corvette', 'Build the Corvette Port'],
];
const GOALS_DUST = [
  ['dustland', 'Land on Red Dust in a Corvette'],
  ['cooler', 'Build a Cooler to beat the heat'],
  ['rdust', 'Mine Red Dust Ore with a Drill'],
  ['magma', 'Break a Red Dust rock for Magma'],
  ['debris', 'Break debris for Wood'],
  ['heatsteel', 'Smelt a Heatsteel Bar'],
  ['ember', 'Find an Ember Crystal'],
  ['plating', 'Assemble reinforced Frames (Plating)'],
];
const GOALS = GOALS_HOME;

// ---------- helpers ----------
const wrap = a => ((a % TAU) + TAU) % TAU;
const angDiff = (a, b) => { let d = wrap(b - a); if (d > Math.PI) d -= TAU; return d; };
const segOf = a => Math.floor(wrap(a) / TAU * NSEG) % NSEG;
const surfR = a => planetR() - S.dug[segOf(a)] * LAYER;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cold = () => !!(S && PLANETS[S.planet] && PLANETS[S.planet].cold);
const hot = () => !!(S && PLANETS[S.planet] && PLANETS[S.planet].hot);
const harsh = () => cold() || hot();
const planetR = () => (S && PLANETS[S.planet] && PLANETS[S.planet].r) || R;
const rockR = () => planetR() - LAYER * LAYERS;
const TH = () => THEME[S.planet] || THEME.home;
const shipKind = () => (S.ship && S.ship.kind) || 'gunship';
function shipStats() {
  return shipKind() === 'corvette'
    ? { half: 52, r: 44, thrust: 400, turn: 2.15, max: 600, padY: -140, board: 210 }
    : { half: SHIP_HALF, r: SHIP_R, thrust: THRUST, turn: TURN, max: MAX_SPEED, padY: PAD_Y, board: BOARD_RANGE };
}
function goalsList() { return S.planet === 'dust' ? GOALS_DUST : GOALS_HOME; }
function goalsMap() {
  if (S.planet === 'dust') { if (!S.dustGoals) S.dustGoals = {}; return S.dustGoals; }
  return S.goals;
}
function mixHex(a, b, k) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
// local frame at angle a, radius r: x = tangent (increasing angle), y = inward (so -y is "up")
function toWorld(a, r, lx, ly) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c * r - lx * s - ly * c, s * r + lx * c - ly * s];
}
function toLocal(a, r, wx, wy) {
  const c = Math.cos(a), s = Math.sin(a), dx = wx - c * r, dy = wy - s * r;
  return [-dx * s + dy * c, -(dx * c + dy * s)];
}
function frame(a, r) { ctx.translate(Math.cos(a) * r, Math.sin(a) * r); ctx.rotate(a + Math.PI / 2); }
function rr(x, y, w, h, r, fill, stroke = OUTLINE, lw = 2) {
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function circ(x, y, r, fill, stroke = OUTLINE, lw = 2) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

// ---------- state ----------
const qs = new URLSearchParams(location.search);
const DEMO = qs.has('demo');
let S, bullets = [], fx = [], mode = null, hover = null, hold = null;
const keys = {}, touch = { left: false, right: false, jump: false };
const mouse = { x: 0, y: 0, in: false };
const cam = { x: 0, y: -R - 90, rot: 0, zoom: 1, userZoom: 1 };

function newGoop(a) { return { a, h: 0, vh: 0, hp: 1, dir: Math.random() < .5 ? -1 : 1, hop: rand(.2, 1.2), flash: 0, sq: 0 }; } // Home: 1-shot; ice/dust override
function newWorld(id) {
  const top = -Math.PI / 2;
  const s = { dug: Array(NSEG).fill(0), trees: [], bushes: [], debris: [], items: [], buildings: [], conveyors: [], catwalks: [], links: [], goops: [], goopTimer: GOOP_SPAWN_FIRST };
  if (id === 'ice') {
    for (let i = 0; i < 9; i++) s.trees.push({ a: top + .55 + i * .64 + rand(-.08, .08), hp: 3, regrow: 0, shake: 0, size: rand(.85, 1.15), kind: i % 2 ? 'pine' : undefined });
    for (let i = 0; i < 8; i++) s.bushes.push({ a: top + .85 + i * .68, s: rand(.8, 1.2) });
    for (let i = 0; i < 3; i++) { const g = newGoop(top + Math.PI + (i - 1) * .8); g.hp = 4; s.goops.push(g); }
    return s;
  }
  if (id === 'dust') {
    // plentiful breakable magma rocks around the planet
    for (let i = 0; i < 16; i++) {
      s.bushes.push({ a: top + i * (TAU / 16) + rand(-.06, .06), s: rand(.85, 1.4), kind: 'dust', hp: 2, regrow: 0, shake: 0 });
    }
    for (let i = 0; i < 4; i++) { const g = newGoop(top + Math.PI + (i - 1.5) * .7); g.hp = 5; s.goops.push(g); }
    seedDustDebris(s); // wreckage is here on first landing; still Red Dust only
    return s;
  }
  [-1.15, -.75, -.42, .45, .9, 1.55, 2.25, 2.95, 3.65, 4.35, 5.05].forEach(o => s.trees.push({ a: top + o, hp: 3, regrow: 0, shake: 0, size: rand(.85, 1.15) }));
  [-.22, .65, 1.25, 1.95, 2.6, 3.3, 4.0, 4.7, 5.45].forEach(o => s.bushes.push({ a: top + o, s: rand(.8, 1.2) }));
  for (let i = 0; i < 3; i++) s.goops.push(newGoop(top + Math.PI + (i - 1) * .7));
  return s;
}
function newState() {
  return {
    v: SAVE_VER, t: 0, planet: 'home', worlds: {}, ...newWorld('home'),
    nextId: 1, player: { x: 0, y: -R, vx: 0, vy: 0, hp: 10, inv: 0, facing: 1, anim: 0, swing: 0, cool: 0, ground: true, regen: 0, temp: 100, freeze: 0, warm: true },
    inv: Object.fromEntries(ITEMS.map(k => [k, 0])), selType: 'wood', goals: {}, research: { 1: false, 2: false, 3: false, 4: false }, dustGoals: {}, ship: null, flying: false,
  };
}
let lastSavedShown = -1e9, saveFails = 0;
function showSaved(force) {
  const el = document.getElementById('saved'); if (!el) return;
  const now = performance.now();
  if (!force && now - lastSavedShown < 20000) return;
  lastSavedShown = now;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(showSaved.t); showSaved.t = setTimeout(() => el.classList.remove('show'), 1400);
}
function save(manual) {
  if (DEMO || !S) return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(S, (k, v) => (k === 'net' ? undefined : v))); // net is runtime-only (circular)
    saveFails = 0; showSaved(!!manual); return true;
  } catch (e) {
    console.warn('Planet Factory: save failed', e);
    if (manual || ++saveFails === 1) toast('⚠️ Could not save — browser storage is blocked or full');
    return false;
  }
}
let savePending = false;
function saveSoon() { savePending = true; }
const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
function mergeDefaults(def, o) {
  // deep-merge saved values over defaults; arrays must be arrays, numbers numbers
  if (!isObj(o)) return def;
  for (const k of Object.keys(o)) {
    const d = def[k], v = o[k];
    if (Array.isArray(d)) { if (Array.isArray(v)) def[k] = v; }
    else if (isObj(d)) def[k] = mergeDefaults(d, v);
    else if (typeof d === 'number') { if (typeof v === 'number' && isFinite(v)) def[k] = v; }
    else if (d === null || d === undefined || typeof d === typeof v) def[k] = v;
  }
  return def;
}
function sanitizeWorld(st, planetId) {
  // planetId required: Red Dust radius is 3× home. Never use bare R for surface math.
  const PR = (PLANETS[planetId] && PLANETS[planetId].r) || R;
  if (st.dug.length !== NSEG) st.dug = Array.from({ length: NSEG }, (_, i) => +st.dug[i] || 0);
  const sr0 = a => PR - (st.dug[segOf(a)] || 0) * LAYER;
  if (!Array.isArray(st.catwalks)) st.catwalks = [];
  if (!Array.isArray(st.debris)) st.debris = [];
  for (const k of ['trees', 'bushes', 'debris', 'items', 'buildings', 'conveyors', 'catwalks', 'goops']) st[k] = st[k].filter(isObj);
  st.debris.forEach(d => {
    d.a = +d.a; d.s = clamp(+d.s || 1, .7, 1.6);
    if (!(d.hp > 0) && !(d.regrow > 0)) d.hp = 2;
    if (d.regrow == null || !isFinite(+d.regrow)) d.regrow = 0;
    if (d.shake == null) d.shake = 0;
    d.variant = d.variant === 1 ? 1 : 0;
  });
  st.catwalks = st.catwalks.filter(c => [c.x1, c.y1, c.x2, c.y2].every(Number.isFinite));
  st.buildings = st.buildings.filter(b => DEF[b.type] && typeof b.a === 'number');
  // NEVER recompute stored r0 from terrain. Only fill missing, repair if buried, soft-cap air height.
  st.buildings.forEach(b => {
    const g = sr0(b.a);
    if (!Number.isFinite(+b.r0)) b.r0 = g;
    else {
      b.r0 = +b.r0;
      if (b.r0 < g - 1) {
        // buried (e.g. v7.3 Red Dust clamp used home R) — lift; prefer nearby belt height if any
        let hint = g;
        for (const c of st.conveyors) {
          for (const [x, y] of [[c.x1, c.y1], [c.x2, c.y2]]) {
            if (![x, y].every(Number.isFinite)) continue;
            const ca = Math.atan2(y, x);
            if (Math.abs(angDiff(ca, b.a)) < (DEF[b.type].hw + 48) / PR) hint = Math.max(hint, Math.hypot(x, y));
          }
        }
        b.r0 = clamp(hint, g, g + MAX_AIR_H);
      } else if (AIR_BUILD.has(b.type) && b.r0 > g + MAX_AIR_H) {
        b.r0 = g + MAX_AIR_H;
      }
    }
    if (b.type === 'furnace') b.q = Array.isArray(b.q) ? b.q.filter(t => SMELT[t]) : [];
    if (b.type === 'chest' || b.type === 'lab') { const o = isObj(b.store) ? b.store : {}; b.store = {}; for (const k of ITEMS) if (+o[k] > 0) b.store[k] = Math.floor(+o[k]); }
    if (b.type === 'assembler') {
      const o = isObj(b.buf) ? b.buf : {}; b.buf = {}; for (const k of ITEMS) if (+o[k] > 0) b.buf[k] = Math.floor(+o[k]);
      if (!RECIPES[b.pick]) b.pick = 'gear';
    }
    if ((b.type === 'filter' || b.type === 'unloader') && !ITEMS.includes(b.pick)) b.pick = null;
    if (b.type === 'filter' || b.type === 'splitter' || b.type === 'merger') { delete b.tube; b.dir = b.dir === -1 ? -1 : 1; }
    if (b.flip !== 1 && b.flip !== -1) b.flip = (b.dir === -1 ? -1 : 1);
    else b.flip = b.flip === -1 ? -1 : 1;
    if (b.type === 'filter' || b.type === 'splitter' || b.type === 'merger' || b.type === 'unloader') b.dir = b.flip;
  });
  const ids = new Set(st.buildings.map(b => b.id));
  st.links = st.links.filter(l => Array.isArray(l) && ids.has(l[0]) && ids.has(l[1]));
  st.items = st.items.filter(it => ITEMS.includes(it.type) && isFinite(it.x) && isFinite(it.y));
  // v5.3: conveyors are straight segments between two world points. Old angle belts (v5.2 and earlier)
  // become a chain of short straight pieces at their old height (ground or raised), so they don't sink.
  const out = [], sr = a => PR - (st.dug[segOf(a)] || 0) * LAYER;
  let nid = Math.max(st.nextId || 1, ...st.conveyors.map(c => +c.id || 0)) + 1;
  for (const c of st.conveyors) {
    if ([c.x1, c.y1, c.x2, c.y2].every(Number.isFinite)) {
      // repair belt ends buried under the surface (same Red Dust radius bug era)
      const lift = (x, y) => {
        const a = Math.atan2(y, x), g = sr(a), r = Math.hypot(x, y);
        if (r >= g - 1) return [x, y];
        return [Math.cos(a) * g, Math.sin(a) * g];
      };
      const [x1, y1] = lift(c.x1, c.y1), [x2, y2] = lift(c.x2, c.y2);
      out.push({ id: c.id, x1, y1, x2, y2, ...(c.spd ? { spd: c.spd } : {}), ...(c.paid ? { paid: c.paid } : {}) });
      continue;
    }
    if (typeof c.a1 !== 'number' || typeof c.a2 !== 'number') continue;
    const d = angDiff(c.a1, c.a2), h = 7 + (c.lane === 1 ? 26 : 0), n = Math.max(1, Math.ceil(Math.abs(d) * PR / 110));
    const P = t => { const a = c.a1 + d * t, r = sr(a) + h; return [Math.cos(a) * r, Math.sin(a) * r]; };
    const ids = [];
    for (let i = 0; i < n; i++) { const [x1, y1] = P(i / n), [x2, y2] = P((i + 1) / n); const id = i ? nid++ : c.id; ids.push(id); out.push({ id, x1, y1, x2, y2 }); }
    for (const it of st.items) if (it.belt === c.id) { const k = Math.min(n - 1, Math.floor((+it.bt || 0) * n)); it.belt = ids[k]; it.bt = Math.min(1, (+it.bt || 0) * n - k); }
  }
  st.conveyors = out; st.nextId = Math.max(st.nextId || 1, nid);
  return st;
}
function seedPines(w) {
  if (w.trees.some(t => t.kind === 'pine')) return;
  w.trees.forEach((t, i) => { if (i % 2) { t.kind = 'pine'; t.hp = Math.max(t.hp, 0); } });
  if (!w.trees.some(t => t.kind === 'pine')) for (let i = 0; i < 4; i++) w.trees.push({ a: -Math.PI / 2 + .9 + i * 1.3, hp: 3, regrow: 0, shake: 0, size: 1, kind: 'pine' });
}
function seedDustRocks(w) {
  // called only for dust worlds — every bush is a breakable magma rock
  for (const b of w.bushes) {
    b.kind = 'dust';
    if (!(b.hp > 0) && !(b.regrow > 0)) b.hp = 2;
    if (b.regrow == null) b.regrow = 0;
    if (b.shake == null) b.shake = 0;
  }
  const n = w.bushes.filter(b => b.kind === 'dust').length;
  if (n < 12) {
    const top = -Math.PI / 2;
    for (let i = n; i < 16; i++) {
      w.bushes.push({ a: top + i * (TAU / 16) + rand(-.06, .06), s: rand(.85, 1.4), kind: 'dust', hp: 2, regrow: 0, shake: 0 });
    }
  }
}
// Red Dust only — breakable wreckage that yields wood. Never place on builds/belts.
const DEBRIS_TARGET = 12, DEBRIS_HP = 2, DEBRIS_REGROW = 40;
function debrisBlocked(w, a) {
  const PR = (PLANETS.dust && PLANETS.dust.r) || R;
  for (const b of w.buildings || []) {
    if (DEF[b.type] && Math.abs(angDiff(b.a, a)) < (DEF[b.type].hw + 22) / PR) return true;
  }
  for (const c of w.conveyors || []) {
    for (const [x, y] of [[c.x1, c.y1], [c.x2, c.y2]]) {
      if (![x, y].every(Number.isFinite)) continue;
      const ca = Math.atan2(y, x);
      if (Math.abs(angDiff(ca, a)) < 30 / PR && Math.hypot(x, y) < PR + 50) return true;
    }
  }
  for (const c of w.catwalks || []) {
    for (const [x, y] of [[c.x1, c.y1], [c.x2, c.y2]]) {
      if (![x, y].every(Number.isFinite)) continue;
      if (Math.abs(angDiff(Math.atan2(y, x), a)) < 28 / PR) return true;
    }
  }
  for (const b of w.bushes || []) {
    if (Math.abs(angDiff(b.a, a)) < 0.11) return true;
  }
  for (const d of w.debris || []) {
    if (Math.abs(angDiff(d.a, a)) < 0.13) return true;
  }
  return false;
}
function seedDustDebris(w) {
  if (!Array.isArray(w.debris)) w.debris = [];
  // drop any that landed on builds/belts (safe for migrations); do NOT touch buildings
  w.debris = w.debris.filter(d => isObj(d) && typeof d.a === 'number' && Number.isFinite(+d.a) && !debrisBlocked(
    { buildings: w.buildings, conveyors: w.conveyors, catwalks: w.catwalks, bushes: w.bushes, debris: [] }, +d.a));
  for (const d of w.debris) {
    d.s = clamp(+d.s || 1, .7, 1.6);
    if (!(d.hp > 0) && !(d.regrow > 0)) d.hp = DEBRIS_HP;
    if (d.regrow == null || !isFinite(+d.regrow)) d.regrow = 0;
    if (d.shake == null) d.shake = 0;
    d.variant = d.variant === 1 ? 1 : 0;
  }
  let guard = 0;
  while (w.debris.length < DEBRIS_TARGET && guard++ < 100) {
    const a = -Math.PI / 2 + rand(0, TAU);
    if (debrisBlocked(w, a)) continue;
    w.debris.push({ a, s: rand(.85, 1.35), hp: DEBRIS_HP, regrow: 0, shake: 0, variant: Math.random() < .5 ? 0 : 1 });
  }
}
function sanitize(st) {
  if (!PLANETS[st.planet]) st.planet = 'home';
  // st.v tracks SAVE_VER; position repairs in sanitizeWorld are idempotent and planet-radius-correct
  sanitizeWorld(st, st.planet);
  const worlds = isObj(st.worlds) ? st.worlds : {};
  st.worlds = {};
  for (const id of Object.keys(PLANETS)) if (id !== st.planet && isObj(worlds[id])) st.worlds[id] = sanitizeWorld(mergeDefaults(newWorld(id), worlds[id]), id);
  if (st.planet === 'ice') seedPines(st); else if (st.worlds.ice) seedPines(st.worlds.ice);
  if (st.planet === 'dust') { seedDustRocks(st); seedDustDebris(st); }
  else if (st.worlds.dust) { seedDustRocks(st.worlds.dust); seedDustDebris(st.worlds.dust); }
  const all = [st, ...Object.values(st.worlds)];
  const maxId = Math.max(0, ...all.flatMap(w => [...w.buildings.map(b => b.id || 0), ...w.conveyors.map(c => c.id || 0), ...(w.catwalks || []).map(c => c.id || 0)]));
  if (!(st.nextId > maxId)) st.nextId = maxId + 1;
  for (const k of ITEMS) st.inv[k] = Math.max(0, Math.floor(+(st.inv[k] || 0)));
  if (!ITEMS.includes(st.selType)) st.selType = ITEMS[st.sel || 0] || 'wood';
  if (!isObj(st.research)) st.research = { 1: false, 2: false, 3: false, 4: false };
  for (const k of [1, 2, 3, 4]) st.research[k] = !!st.research[k];
  if (!isObj(st.dustGoals)) st.dustGoals = {};
  // grant research for anything already built so old saves keep working
  const owned = new Set(all.flatMap(w => w.buildings.map(b => b.type)));
  if (all.flatMap(w => w.conveyors).some(c => (c.spd || 1) > 1) || owned.has('splitter') || owned.has('merger')) st.research[3] = true;
  if (owned.has('drill2') || owned.has('generator2')) st.research[2] = true;
  if (owned.has('filter') || owned.has('unloader') || st.research[2] || st.research[3]) st.research[1] = true;
  if (owned.has('corvetteport')) st.research[4] = true;
  const s = st.ship;
  if (!isObj(s) || ![s.x, s.y].every(n => typeof n === 'number' && isFinite(n))) st.ship = null;
  else { for (const k of ['vx', 'vy', 'ang']) if (typeof s[k] !== 'number' || !isFinite(s[k])) s[k] = 0; s.thrust = false; }
  st.flying = !!st.flying && !!st.ship;
  if (!isFinite(st.player.hp) || st.player.hp <= 0) st.player.hp = 10;
  st.player.temp = isFinite(st.player.temp) ? clamp(+st.player.temp, 0, 100) : 100;
  if (st.ship && st.ship.kind !== 'corvette') st.ship.kind = 'gunship';
  st.v = SAVE_VER;
  return st;
}
let loadedFromSave = false;
function load() {
  if (DEMO || qs.has('fresh')) return null;
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!isObj(o) || !Array.isArray(o.dug)) throw new Error('bad save shape');
    if (!o.selType && typeof o.sel === 'number') o.selType = ITEMS[o.sel];
    const st = sanitize(mergeDefaults(newState(), o));
    loadedFromSave = true;
    return st;
  } catch (e) {
    try { if (raw) localStorage.setItem(SAVE_KEY + '-backup', raw); } catch (e2) { /* ignore */ }
    console.warn('Planet Factory: save could not be loaded, backed up to', SAVE_KEY + '-backup', e);
    return null;
  }
}

// ---------- entities ----------
function spawnItem(type, x, y, vx = 0, vy = 0) {
  S.items.push({ type, x, y, vx, vy, belt: null, ign: 0, ignT: 0, rot: rand(-.3, .3) });
  if (S.items.length > MAX_ITEMS) {
    const i = S.items.findIndex(it => !it.belt);
    if (i >= 0) S.items.splice(i, 1);
  }
}
const upv = a => [Math.cos(a), Math.sin(a)];
const tanv = a => [-Math.sin(a), Math.cos(a)];
function popItem(type, a, r, lx, ly, out = 90, side = 0) {
  const [x, y] = toWorld(a, r, lx, ly), u = upv(a), t = tanv(a);
  spawnItem(type, x, y, u[0] * out + t[0] * side, u[1] * out + t[1] * side);
}
function bWorld(b, p) { return toWorld(b.a, b.r0, p[0], p[1]); }
function playerAng() { return Math.atan2(S.player.y, S.player.x); }
function playerCenter() { const p = S.player, a = playerAng(); return [p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16]; }
function goopPos(g) { const r = surfR(g.a) + g.h + 9; return [Math.cos(g.a) * r, Math.sin(g.a) * r]; }
function convPoint(c, t) { const x = c.x1 + (c.x2 - c.x1) * t, y = c.y1 + (c.y2 - c.y1) * t; return [x, y, Math.atan2(y, x)]; }
function convLen(c) { return Math.hypot(c.x2 - c.x1, c.y2 - c.y1); }
// projection of a point onto a belt: [t (0..1 along), perpendicular distance]
function convProj(c, x, y) {
  const dx = c.x2 - c.x1, dy = c.y2 - c.y1, L2 = dx * dx + dy * dy || 1, t = ((x - c.x1) * dx + (y - c.y1) * dy) / L2;
  const tc = Math.max(0, Math.min(1, t)); return [t, dist(x, y, c.x1 + dx * tc, c.y1 + dy * tc)];
}
// keep a belt point at least on top of the ground
function clampAbove(x, y) { const a = Math.atan2(y, x), r = Math.max(Math.hypot(x, y), surfR(a) + 7); return [Math.cos(a) * r, Math.sin(a) * r]; }
// a straight chord on a round planet sinks in the middle — refuse belts that would cut through the ground
function chordClear(x1, y1, x2, y2) {
  const n = Math.max(2, Math.ceil(dist(x1, y1, x2, y2) / 6));
  for (let i = 1; i < n; i++) { const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n; if (Math.hypot(x, y) < surfR(Math.atan2(y, x)) - 2) return false; }
  return true;
}
function invCount(slot) {
  let n = S.inv[slot] || 0;
  for (const alt of altTypes(slot)) n += S.inv[alt] || 0;
  return n;
}
function canAfford(cost) { return planCost(cost, t => S.inv[t] || 0).ok; }
function pay(cost, sign = -1) {
  // sign > 0: refund that map as-is (the materials actually spent)
  if (sign >= 0) {
    for (const [k, v] of Object.entries(cost || {})) S.inv[k] = (S.inv[k] || 0) + sign * v;
    uiDirty = true;
    return cost || {};
  }
  const plan = planCost(cost, t => S.inv[t] || 0);
  if (!plan.ok) return null; // never take a partial payment
  for (const [k, v] of Object.entries(plan.spent)) S.inv[k] = Math.max(0, (S.inv[k] || 0) - v);
  uiDirty = true;
  return plan.spent;
}
function refundOf(obj, fallback) {
  if (obj && obj.paid && typeof obj.paid === 'object') return obj.paid;
  if (obj && obj.type && LEGACY_COST[obj.type]) return LEGACY_COST[obj.type];
  return fallback;
}
function goal(k) {
  const map = goalsMap(), list = goalsList();
  if (!map[k]) { map[k] = true; uiDirty = true; const g = list.find(x => x[0] === k) || GOALS_HOME.find(x => x[0] === k) || GOALS_DUST.find(x => x[0] === k); if (g) toast('✔ ' + g[1]); }
}
function hasTier(n) { return !!(S.research && S.research[n]); }
function unlocked(t) { const n = DEF[t] && DEF[t].tier; return !n || hasTier(n); }
function tierLabel(n) { return TIERS[n] ? `Level ${n}: ${TIERS[n].name}` : ''; }
function needCost(need) { return Object.entries(need).map(([k, n]) => `${n} ${recipeNeedLabel(k)}`).join(' + '); }
function storeCount(st, slot) {
  let n = st[slot] || 0;
  for (const alt of altTypes(slot)) n += st[alt] || 0;
  return n;
}
function applySpent(bag, spent) {
  for (const [k, v] of Object.entries(spent)) {
    bag[k] = (bag[k] || 0) - v;
    if (bag[k] <= 0) delete bag[k];
  }
}
function storeHas(st, need) { return planCost(need, t => st[t] || 0).ok; }
function storeTake(st, need) {
  const plan = planCost(need, t => st[t] || 0);
  if (!plan.ok) return false;
  applySpent(st, plan.spent);
  return true;
}
function bufHas(b, need) { return planCost(need, t => (b.buf && b.buf[t]) || 0).ok; }
function bufTake(b, need) {
  b.buf = b.buf || {};
  const plan = planCost(need, t => b.buf[t] || 0);
  if (!plan.ok) return false;
  applySpent(b.buf, plan.spent);
  return true;
}
function tryResearch(lab) {
  if (!lab.powered) return;
  lab.store = lab.store || {};
  for (const n of [1, 2, 3, 4]) {
    if (hasTier(n)) continue;
    const t = TIERS[n];
    if (!storeHas(lab.store, t.need)) return;
    storeTake(lab.store, t.need);
    S.research[n] = true; uiDirty = true; saveSoon();
    goal('t' + n); toast('🔬 Unlocked ' + tierLabel(n) + ' — ' + t.unlocks);
    return;
  }
}
function gain(type, n, x, y) {
  S.inv[type] += n; uiDirty = true;
  floatText(x, y, `+${n} ${INAME[type]}`, ICOL[type][0]);
  const bb = $('bagBtn'); bb.classList.remove('bump'); void bb.offsetWidth; bb.classList.add('bump');
}
function floatText(x, y, text, color = '#fff') { fx.push({ k: 't', x, y, text, color, t: 0 }); }
function switchPlanet(id) {
  if (id === S.planet || !PLANETS[id]) return;
  const from = PLANETS[S.planet], to = PLANETS[id], ox = to.x - from.x, oy = to.y - from.y;
  const cur = {}; for (const k of WKEYS) cur[k] = S[k];
  S.worlds[S.planet] = cur;
  const w = S.worlds[id] || newWorld(id);
  delete S.worlds[id];
  for (const k of WKEYS) S[k] = w[k];
  S.planet = id;
  for (const o of [S.ship, cam, S.player]) if (o) { o.x -= ox; o.y -= oy; }
  for (const f of fx) { f.x -= ox; f.y -= oy; }
  bullets = []; closeBox(); setMode(null); uiDirty = true;
}
function chestTotal(b) { let n = 0; for (const k in b.store || {}) n += b.store[k]; return n; }
function chestAdd(b, type) {
  b.store = b.store || {};
  if (chestTotal(b) >= CHEST_CAP) return false;
  b.store[type] = (b.store[type] || 0) + 1;
  if (b === boxB) uiDirty = true;
  return true;
}
function chestTake(b, pick) {
  const st = b.store || {}, k = pick ? (st[pick] > 0 ? pick : null) : ITEMS.find(t => st[t] > 0);
  if (!k) return null;
  if (--st[k] <= 0) delete st[k];
  if (b === boxB) uiDirty = true;
  return k;
}
function nearestChest(b, maxD) {
  let best = null, bd = maxD;
  for (const c of S.buildings) if (c.type === 'chest') { const d = Math.abs(angDiff(b.a, c.a)) * R; if (d < bd) { bd = d; best = c; } }
  return best;
}
// a building receives an item arriving at (x, y): 'take' | 'block' | 'moved' | 'no'
function deliver(it, x, y, rad) {
  for (const b of S.buildings) {
    if (b.type === 'furnace') {
      if (dist(x, y, ...bWorld(b, inOf(b))) >= rad) continue;
      if (!SMELT[it.type]) return 'no';
      if ((b.q = b.q || []).length < 8) { b.q.push(it.type); return 'take'; }
      return 'block';
    } else if (b.type === 'chest') {
      if (dist(x, y, ...bWorld(b, [0, -14])) >= rad + 10) continue;
      return chestAdd(b, it.type) ? 'take' : 'block';
    } else if (b.type === 'assembler') {
      if (!assemblerPorts(b).some(p => dist(x, y, ...bWorld(b, p)) < rad)) continue;
      const r = RECIPES[b.pick], slot = slotOf(r, it.type);
      if (!r || !slot) return 'no';
      b.buf = b.buf || {}; const have = bufCount(b, slot), cap = bufCap(r, slot);
      if (have >= cap) {
        // dedicated belt: back-pressure. mixed belt waiting on another ingredient: release excess so the other can arrive
        const needOther = Object.keys(r.in).some(k => k !== slot && bufCount(b, k) < r.in[k]);
        return needOther ? 'no' : 'block';
      }
      b.buf[it.type] = (b.buf[it.type] || 0) + 1; if (b === boxB) uiDirty = true; return 'take';
    } else if (b.type === 'lab') {
      let best = null, bd = rad + 8;
      for (const port of labPorts(b)) {
        const d = dist(x, y, ...bWorld(b, port.p));
        if (d < bd) { bd = d; best = port; }
      }
      if (!best) continue;
      // all ports are Any: only research parts (gear/circuit/frame)
      if (!LAB_PARTS.has(it.type)) return 'no';
      return chestAdd(b, it.type) ? 'take' : 'block';
    } else if (b.type === 'filter') {
      if (it.ignF === b.id && it.ignT > 0) continue;
      if (dist(x, y, ...bWorld(b, [0, -14])) >= rad + 6) continue;
      if ((Math.sign(angDiff(b.a, Math.atan2(y, x))) || -1) === facing(b)) continue; // output side: not an input
      return sortItem(b, it);
    } else if (b.type === 'splitter') {
      if (it.ignF === b.id && it.ignT > 0) continue;
      if (dist(x, y, ...bWorld(b, [0, -14])) >= rad + 6) continue;
      if ((Math.sign(angDiff(b.a, Math.atan2(y, x))) || -1) === facing(b)) continue;
      return splitItem(b, it);
    } else if (b.type === 'merger') {
      if (it.ignF === b.id && it.ignT > 0) continue;
      const d = facing(b);
      const ports = [[-d * 24, -8], [-d * 24, -8 - LANE_H]];
      if (!ports.some(p => dist(x, y, ...bWorld(b, p)) < rad + 4)) continue;
      return mergeItem(b, it);
    }
  }
  return 'no';
}
function splitItem(b, it) {
  b.alt = (b.alt || 0) ^ 1; const lane = b.alt; const c = sorterBelt(b, lane);
  if (c) {
    if (S.items.some(o => o.belt === c.id && o.bt * convLen(c) < 15)) { b.alt ^= 1; return 'block'; }
    it.belt = c.id; it.bt = 0; [it.x, it.y] = convPoint(c, 0);
  } else {
    const d = facing(b), t = tanv(b.a), u = upv(b.a);
    [it.x, it.y] = bWorld(b, [d * 28, sorterPort(b, lane)[1] - 2]);
    it.belt = null; it.vx = t[0] * d * 60 + u[0] * 30; it.vy = t[1] * d * 60 + u[1] * 30;
    it.ignF = b.id; it.ignT = .8;
  }
  b.flash = .3; b.last = lane; return 'moved';
}
function mergeItem(b, it) {
  const [ox, oy] = outOf(b);
  const c = S.conveyors.find(o => dist(o.x1, o.y1, ox, oy) < 13);
  if (c) {
    if (S.items.some(o => o.belt === c.id && o.bt * convLen(c) < 15)) return 'block';
    it.belt = c.id; it.bt = 0; [it.x, it.y] = convPoint(c, 0);
  } else {
    const d = facing(b), t = tanv(b.a), u = upv(b.a);
    [it.x, it.y] = bWorld(b, [d * 28, -10]);
    it.belt = null; it.vx = t[0] * d * 60 + u[0] * 30; it.vy = t[1] * d * 60 + u[1] * 30;
    it.ignF = b.id; it.ignT = .8;
  }
  b.flash = .3; return 'moved';
}
// sorter output ports: 0 = match (low, ✓), 1 = rest (high, ✕)
function sorterPort(b, lane) { return [facing(b) * 24, -8 - lane * LANE_H]; }
function sorterBelt(b, lane) {
  const [px, py] = bWorld(b, sorterPort(b, lane));
  return S.conveyors.find(c => dist(c.x1, c.y1, px, py) < 13);
}
function sortItem(b, it) {
  const lane = b.pick && it.type === b.pick ? 0 : 1, c = sorterBelt(b, lane);
  if (c) {
    if (S.items.some(o => o.belt === c.id && o.bt * convLen(c) < 15)) return 'block';
    it.belt = c.id; it.bt = 0; [it.x, it.y] = convPoint(c, 0);
  } else {
    // nothing attached: pop out of the port onto the ground (like a Drill)
    const d = facing(b), t = tanv(b.a), u = upv(b.a);
    [it.x, it.y] = bWorld(b, [d * 28, sorterPort(b, lane)[1] - 2]);
    it.belt = null; it.vx = t[0] * d * 60 + u[0] * 30; it.vy = t[1] * d * 60 + u[1] * 30;
    it.ignF = b.id; it.ignT = .8; it.ign = 0;
  }
  b.flash = .3; b.last = lane;
  return 'moved';
}
function isWarm() {
  const [cx, cy] = playerCenter();
  if (S.ship && !S.flying && dist(cx, cy, S.ship.x, S.ship.y) < SHIP_WARM_R) return true;
  return S.buildings.some(b => (b.type === 'lamp' || b.type === 'cooler') && dist(cx, cy, ...bWorld(b, [0, -66])) < LAMP_R);
}
function die(why) {
  const p = S.player;
  p.hp = 10; p.temp = 100; p.freeze = 0; p.vx = p.vy = 0; p.inv = 1.5; uiDirty = true;
  if (S.ship && !S.flying) {
    const pa = Math.atan2(S.ship.y, S.ship.x) + 36 / planetR(), pr = surfR(pa);
    p.x = Math.cos(pa) * pr; p.y = Math.sin(pa) * pr; p.ground = true;
    toast(why + ' Respawned at your ship.');
  } else { p.x = 0; p.y = -surfR(-Math.PI / 2) - 2; toast(why + ' Respawned at the top.'); }
  saveSoon();
}
function puff(x, y, color, n = 6) { for (let i = 0; i < n; i++) fx.push({ k: 'p', x, y, vx: rand(-60, 60), vy: rand(-60, 60), color, t: 0, life: rand(.3, .6) }); }

// ---------- power ----------
function computePower() {
  const par = {}; const find = i => par[i] === i ? i : (par[i] = find(par[i]));
  S.buildings.forEach(b => par[b.id] = b.id);
  S.links.forEach(([a, b]) => { if (par[a] !== undefined && par[b] !== undefined) par[find(a)] = find(b); });
  const nets = {};
  S.buildings.forEach(b => { const r = find(b.id); (nets[r] = nets[r] || { supply: 0, demand: 0, list: [] }).list.push(b); });
  for (const n of Object.values(nets)) {
    n.list.forEach(b => { n.supply += DEF[b.type].supply || 0; });
    let left = n.supply;
    n.list.sort((a, b) => a.id - b.id).forEach(b => {
      const d = DEF[b.type].demand || 0;
      if (DEF[b.type].supply) b.powered = true;
      else if (d && left >= d) { b.powered = true; left -= d; n.demand += d; }
      else b.powered = false;
      b.net = n;
    });
    n.used = n.supply - left;
  }
}

// ---------- update ----------
function update(dt) {
  S.t += dt;
  computePower();
  if (!S.flying) updatePlayer(dt); else S.player.temp = Math.min(100, S.player.temp + TEMP_WARM * dt);
  updateShip(dt);
  updateBuildings(dt);
  updateConveyors(dt);
  updateItems(dt);
  updateGoops(dt);
  updateBullets(dt);
  S.trees.forEach(t => { t.shake = Math.max(0, t.shake - dt); if (t.hp <= 0 && (t.regrow -= dt) <= 0) { t.hp = 3; } });
  S.bushes.forEach(b => {
    if (b.kind !== 'dust') return;
    b.shake = Math.max(0, (b.shake || 0) - dt);
    if (b.hp <= 0 && ((b.regrow = (b.regrow || 0) - dt), b.regrow <= 0)) b.hp = 2;
  });
  (S.debris || []).forEach(d => {
    d.shake = Math.max(0, (d.shake || 0) - dt);
    if (d.hp <= 0 && ((d.regrow = (d.regrow || 0) - dt), d.regrow <= 0)) d.hp = DEBRIS_HP;
  });
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt;
    if (f.k === 'p') { f.x += f.vx * dt; f.y += f.vy * dt; if (f.t > f.life) fx.splice(i, 1); }
    else if (f.t > 1.1) fx.splice(i, 1);
  }
  if (S.buildings.some(b => (b.type === 'drill' || b.type === 'drill2') && b.powered)) goal('power');
  if (S.buildings.some(b => b.type === 'turret' && b.powered)) goal('turret');
}

// catwalks: one-way platforms — solid only from above (you can jump up through them)
function catNormal(c) { const L = convLen(c) || 1; let nx = -(c.y2 - c.y1) / L, ny = (c.x2 - c.x1) / L; if (nx * (c.x1 + c.x2) + ny * (c.y1 + c.y2) < 0) { nx = -nx; ny = -ny; } return [nx, ny]; }
function catwalkCollide(p, ox, oy, jumped) {
  const was = p.onCat; p.onCat = null;
  for (const c of S.catwalks || []) {
    const [nx, ny] = catNormal(c), [t] = convProj(c, p.x, p.y);
    if (t < -0.02 || t > 1.02) continue;
    const s = (p.x - c.x1) * nx + (p.y - c.y1) * ny, so = (ox - c.x1) * nx + (oy - c.y1) * ny, vn = p.vx * nx + p.vy * ny;
    const land = vn <= 0 && so >= -2 && s <= 0;
    const stick = was === c.id && !jumped && s > -10 && s < 8;
    if (land || stick) {
      p.x -= nx * s; p.y -= ny * s;
      // ride along the deck at the walking speed (no sliding down slopes)
      const L = convLen(c), dx = (c.x2 - c.x1) / L, dy = (c.y2 - c.y1) / L, r = Math.hypot(p.x, p.y), tx = -p.y / r, ty = p.x / r;
      const vt = p.vx * tx + p.vy * ty, k = dx * tx + dy * ty;
      if (Math.abs(k) > .2) { p.vx = dx * vt / k; p.vy = dy * vt / k; } else if (vn < 0) { p.vx -= nx * vn; p.vy -= ny * vn; }
      p.ground = true; p.onCat = c.id; return;
    }
  }
}
function updatePlayer(dt) {
  const p = S.player, r0 = Math.hypot(p.x, p.y) || 1, ux = p.x / r0, uy = p.y / r0, tx = -uy, ty = ux;
  let vt = p.vx * tx + p.vy * ty, vr = p.vx * ux + p.vy * uy;
  const mv = ((keys.KeyD || keys.ArrowRight || touch.right) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft || touch.left) ? 1 : 0);
  if (mv) p.facing = mv;
  const slow = p.temp < 35 ? .5 + .5 * p.temp / 35 : 1;
  vt += (mv * 210 * slow - vt) * Math.min(1, dt * (p.ground ? 12 : 4));
  vr -= G * dt;
  let jumped = false;
  if ((keys.Space || keys.KeyW || keys.ArrowUp || touch.jump) && p.ground) { vr = 430; p.ground = false; jumped = true; }
  p.vx = tx * vt + ux * vr; p.vy = ty * vt + uy * vr;
  const ox = p.x, oy = p.y;
  p.x += p.vx * dt; p.y += p.vy * dt;
  const a = Math.atan2(p.y, p.x), r = Math.hypot(p.x, p.y), gr = surfR(a);
  if (r <= gr) {
    p.x = Math.cos(a) * gr; p.y = Math.sin(a) * gr;
    const nvt = p.vx * -Math.sin(a) + p.vy * Math.cos(a);
    p.vx = -Math.sin(a) * nvt; p.vy = Math.cos(a) * nvt; p.ground = true;
    p.onCat = null;
  } else { p.ground = r - gr < 1.5; catwalkCollide(p, ox, oy, jumped); }
  p.anim += Math.abs(vt) * dt * .05;
  p.swing = Math.max(0, p.swing - dt); p.cool = Math.max(0, p.cool - dt); p.inv = Math.max(0, p.inv - dt);
  if (p.hp < 10 && p.temp > 20 && (p.regen += dt) > 6) { p.regen = 0; p.hp++; uiDirty = true; }
  // comfort: drains on harsh planets away from ship / lamp / cooler
  p.warm = !harsh() || isWarm();
  p.temp = clamp(p.temp + (p.warm ? TEMP_WARM : -TEMP_DRAIN) * dt, 0, 100);
  if (p.temp <= 0) {
    if ((p.freeze += dt) >= 2) {
      p.freeze = 0; p.hp--; uiDirty = true;
      const [fx0, fy0] = playerCenter(); floatText(fx0, fy0, hot() ? '-1 🔥' : '-1 ❄', hot() ? '#ff8a3d' : '#9fd4ff');
      if (p.hp <= 0) { die(hot() ? 'You overheated!' : 'You froze!'); return; }
    }
  } else p.freeze = 0;
  const [cx, cy] = playerCenter();
  for (const g of S.goops) {
    const [gx, gy] = goopPos(g);
    if (p.inv <= 0 && dist(cx, cy, gx, gy) < 24) {
      p.hp--; p.inv = 1; uiDirty = true;
      const away = Math.sign(angDiff(g.a, a)) || 1, t = tanv(a), u = upv(a);
      p.vx = t[0] * away * 260 + u[0] * 260; p.vy = t[1] * away * 260 + u[1] * 260; p.ground = false;
      floatText(cx, cy, '-1', '#ff6b7d');
      if (p.hp <= 0) { die('You got gooped!'); return; }
    }
  }
}

function updateBuildings(dt) {
  for (const b of S.buildings) {
    if (b.powered && b.type !== 'unloader') b.anim = (b.anim || 0) + dt;
    if ((b.type === 'drill' || b.type === 'drill2') && b.powered) {
      b.timer = (b.timer || 0) + dt;
      // lock ore for this cycle so slower grades (rdust/coore) aren't starved by re-rolls
      if (!b.nextOre) {
        b.nextOre = hot() ? (Math.random() < .35 ? 'stone' : 'rdust')
          : (cold() && Math.random() < .4 ? 'coore' : 'stone');
      }
      const ore = b.nextOre;
      const every = DEF[b.type].every * (GRADE[ore] || 1);
      if (b.timer >= every) {
        b.timer = 0; b.nextOre = null;
        const o = outOf(b); popItem(ore, b.a, b.r0, o[0], o[1], 70, facing(b) * 40);
        if (ore === 'rdust') goal('rdust');
      }
    } else if (b.type === 'furnace') {
      b.q = b.q || [];
      b.smelting = b.powered && b.q.length > 0;
      if (b.smelting) {
        b.timer = (b.timer || 0) + dt;
        if (b.timer >= 2.5) { b.timer = 0; const out = SMELT[b.q.shift()] || 'iron', o = outOf(b); popItem(out, b.a, b.r0, o[0], o[1], 60, facing(b) * 25); goal(out); if (out === 'heatsteel') goal('heatsteel'); }
      }
    } else if (b.type === 'assembler') {
      b.buf = b.buf || {}; const r = RECIPES[b.pick];
      b.busy = !!(b.powered && r && bufHas(b, r.in));
      if (b.busy) {
        b.timer = (b.timer || 0) + dt;
        if (b.timer >= r.time) {
          b.timer = 0; bufTake(b, r.in);
          for (let i = 0; i < r.n; i++) { const o = outOf(b); popItem(r.out, b.a, b.r0, o[0], o[1] - i * 4, 55, facing(b) * 20); }
          goal(r.out); if (b.pick === 'plating') goal('plating'); if (b === boxB) uiDirty = true;
        }
      } else b.timer = 0;
    } else if (b.type === 'lab') {
      if (b.powered) tryResearch(b);
    } else if (b.type === 'filter' || b.type === 'splitter') {
      b.flash = Math.max(0, (b.flash || 0) - dt);
    } else if (b.type === 'unloader') {
      const ch = nearestChest(b, DEF.chest.hw + DEF.unloader.hw + 40);
      b.src = ch ? ch.id : 0;
      if (ch) { b.dir = Math.sign(angDiff(ch.a, b.a)) || 1; b.flip = b.dir; }
      b.timer = (b.timer || 0) + dt;
      if (ch && b.timer >= 1.2) {
        b.timer = 0;
        const d = facing(b), [ox, oy] = bWorld(b, [d * 22, -8]);
        if (S.items.filter(it => !it.belt && dist(it.x, it.y, ox, oy) < 18).length < 2) {
          const type = chestTake(ch, b.pick);
          if (type) { popItem(type, b.a, b.r0, d * 22, -10, 30, d * 70); b.anim = .3; }
        }
      }
      b.anim = Math.max(0, (b.anim || 0) - dt);
    } else if (b.type === 'turret') {
      b.cd = Math.max(0, (b.cd || 0) - dt);
      if (!b.powered) continue;
      const [px, py] = bWorld(b, [0, -26]);
      let best = null, bd = 330;
      for (const g of S.goops) {
        if (Math.abs(angDiff(b.a, g.a)) > 1.0) continue;
        const [gx, gy] = goopPos(g), d = dist(px, py, gx, gy);
        if (d < bd) { bd = d; best = [gx, gy]; }
      }
      if (best) {
        const want = Math.atan2(best[1] - py, best[0] - px);
        b.aim = (b.aim ?? want) + angDiff(b.aim ?? want, want) * Math.min(1, dt * 10);
        if (b.cd <= 0 && Math.abs(angDiff(b.aim, want)) < .2) {
          b.cd = .7;
          bullets.push({ x: px + Math.cos(b.aim) * 24, y: py + Math.sin(b.aim) * 24, vx: Math.cos(b.aim) * 540, vy: Math.sin(b.aim) * 540, life: .8, from: b.id });
        }
      }
    }
  }
}

function updateConveyors(dt) {
  for (const c of S.conveyors) {
    const len = Math.max(1, convLen(c)), gap = 15 / len;
    const on = S.items.filter(it => it.belt === c.id).sort((a, b) => b.bt - a.bt);
    let ahead = Infinity;
    for (const it of on) {
      let nt = Math.min(it.bt + BELT_SPEED * (c.spd || 1) * dt / len, ahead - gap, 1);
      it.bt = Math.max(it.bt, nt);
      if (it.bt >= 1) {
        const [ex, ey] = convPoint(c, 1);
        const nx = S.conveyors.find(o => o !== c && dist(o.x1, o.y1, ex, ey) < 12);
        if (nx) { if (!S.items.some(o => o.belt === nx.id && o.bt * convLen(nx) < 15)) { it.belt = nx.id; it.bt = 0; [it.x, it.y] = convPoint(nx, 0); } }
        else {
          const r = deliver(it, ex, ey, 34);
          if (r === 'take') it.dead = true;
          else if (r === 'no') releaseItem(it, c);
        }
      }
      if (!it.dead && it.belt === c.id) { const [x, y] = convPoint(c, it.bt); it.x = x; it.y = y; ahead = it.bt; }
      else if (it.dead || !it.belt) ahead = Infinity;
    }
  }
  S.items = S.items.filter(it => !it.dead);
}
function releaseItem(it, c) {
  const L = convLen(c) || 1, tx = (c.x2 - c.x1) / L, ty = (c.y2 - c.y1) / L, u = upv(Math.atan2(it.y, it.x));
  it.belt = null; it.ign = c.id; it.ignT = .8;
  it.vx = tx * 70 + u[0] * 70; it.vy = ty * 70 + u[1] * 70;
}

function updateItems(dt) {
  for (const it of S.items) {
    if (it.belt) {
      if (!S.conveyors.some(c => c.id === it.belt)) it.belt = null; else continue;
    }
    it.ignT = Math.max(0, it.ignT - dt);
    const r0 = Math.hypot(it.x, it.y) || 1, ux = it.x / r0, uy = it.y / r0;
    let vt = it.vx * -uy + it.vy * ux, vr = it.vx * ux + it.vy * uy;
    vr -= G * dt;
    it.x += it.vx * dt; it.y += it.vy * dt;
    const a = Math.atan2(it.y, it.x), r = Math.hypot(it.x, it.y), gr = surfR(a) + 6;
    if (r <= gr) {
      it.x = Math.cos(a) * gr; it.y = Math.sin(a) * gr;
      vr = Math.max(0, -vr * .2); if (vr < 20) vr = 0;
      vt *= Math.pow(.004, dt);
    }
    const nu = upv(a), nt = tanv(a);
    it.vx = nt[0] * vt + nu[0] * vr; it.vy = nt[1] * vt + nu[1] * vr;
    // conveyor capture
    for (const c of S.conveyors) {
      if (it.ignT > 0 && it.ign === c.id) continue;
      const [t, pd] = convProj(c, it.x, it.y);
      if (t < -.03 || t > 1 || pd > 11 || vr > 40) continue;
      it.belt = c.id; it.bt = Math.max(0, t); it.vx = it.vy = 0; break;
    }
    // furnaces, chests and sorters catch loose items dropped into them
    if (!it.belt && deliver(it, it.x, it.y, 18) === 'take') it.dead = true;
  }
  S.items = S.items.filter(it => !it.dead);
}

function updateGoops(dt) {
  const pa = playerAng(), [pcx, pcy] = playerCenter();
  for (const g of S.goops) {
    g.flash = Math.max(0, g.flash - dt);
    g.vh -= G * .8 * dt; g.h += g.vh * dt;
    if (g.h <= 0) {
      if (g.vh < -100) g.sq = .2;
      g.h = 0; g.vh = 0;
      if ((g.hop -= dt) <= 0) {
        const [gx, gy] = goopPos(g);
        if (dist(gx, gy, pcx, pcy) < 260) g.dir = Math.sign(angDiff(g.a, pa)) || 1;
        else if (Math.random() < .3) g.dir *= -1;
        g.vh = rand(190, 300); g.hop = rand(.5, 1.4);
      }
    } else g.a += g.dir * 75 / R * dt;
    g.sq = Math.max(0, g.sq - dt);
  }
  if ((S.goopTimer -= dt) <= 0) {
    S.goopTimer = GOOP_SPAWN_INTERVAL;
    if (S.goops.length < 5) { const g = newGoop(pa + Math.PI + rand(-.9, .9)); if (cold()) g.hp = 4; else if (hot()) g.hp = 5; S.goops.push(g); }
  }
}
function killGoop(g, turret) {
  S.goops.splice(S.goops.indexOf(g), 1);
  const [x, y] = goopPos(g);
  puff(x, y, cold() ? '#9fd4ff' : '#7cf07c', 10);
  if (turret) { const o = outOf(turret); popItem('jelly', turret.a, turret.r0, o[0], o[1], 60, facing(turret) * 30); }
  else { gain('jelly', 1, x, y); goal('jelly'); if (cold()) gain('frost', 1, x, y - 14); if (hot() && Math.random() < .35) { gain('ember', 1, x, y - 14); goal('ember'); } }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || Math.hypot(b.x, b.y) < surfR(Math.atan2(b.y, b.x));
    for (const g of S.goops) {
      const [gx, gy] = goopPos(g);
      if (!dead && dist(b.x, b.y, gx, gy) < 15) {
        dead = true; g.hp--; g.flash = .15;
        if (g.hp <= 0) killGoop(g, S.buildings.find(t => t.id === b.from));
        break;
      }
    }
    if (dead) bullets.splice(i, 1);
  }
}

// ---------- hit tests ----------
function itemAt(x, y) { let best = null, bd = 13; for (const it of S.items) { const d = dist(x, y, it.x, it.y); if (d < bd) { bd = d; best = it; } } return best; }
function goopAt(x, y) { return S.goops.find(g => dist(x, y, ...goopPos(g)) < 18); }
function buildingAt(x, y) {
  return S.buildings.find(b => { const [lx, ly] = toLocal(b.a, b.r0, x, y), d = DEF[b.type]; return Math.abs(lx) < d.hw + 4 && ly < 6 && ly > -d.h; });
}
function conveyorAt(x, y) {
  const a = Math.atan2(y, x), r = Math.hypot(x, y);
  return S.conveyors.find(c => { const [t, d] = convProj(c, x, y); return t >= -.03 && t <= 1.03 && d < 10; });
}
function treeAt(x, y) {
  return S.trees.find(t => { if (t.hp <= 0) return false; const [lx, ly] = toLocal(t.a, surfR(t.a), x, y); return Math.abs(lx) < 20 * t.size && ly < 4 && ly > -66 * t.size; });
}
function bushAt(x, y) {
  return S.bushes.find(b => {
    if (b.kind !== 'dust' || !(b.hp > 0)) return false;
    const [lx, ly] = toLocal(b.a, surfR(b.a), x, y);
    const s = b.s || 1;
    return Math.abs(lx) < 18 * s && ly < 6 && ly > -28 * s;
  });
}
function debrisAt(x, y) {
  return (S.debris || []).find(d => {
    if (!(d.hp > 0)) return false;
    const [lx, ly] = toLocal(d.a, surfR(d.a), x, y);
    const s = d.s || 1;
    return Math.abs(lx) < 20 * s && ly < 6 && ly > -26 * s;
  });
}
function nodeAt(x, y) {
  let best = null, bd = 16;
  for (const b of S.buildings) { if (!NODE[b.type]) continue; const d = dist(x, y, ...bWorld(b, nodeOf(b))); if (d < bd) { bd = d; best = b; } }
  const bb = buildingAt(x, y);
  return best || (bb && NODE[bb.type] ? bb : null);
}
function nodeStrict(x, y) {
  let best = null, bd = 15;
  for (const b of S.buildings) { if (!NODE[b.type]) continue; const d = dist(x, y, ...bWorld(b, nodeOf(b))); if (d < bd) { bd = d; best = b; } }
  return best;
}
function shipAt(x, y) { return S.ship && !S.flying && dist(x, y, S.ship.x, S.ship.y) < (shipKind()==='corvette'?58:42) ? S.ship : null; }

// ---------- actions ----------
function inReach(x, y) { const [cx, cy] = playerCenter(); return dist(cx, cy, x, y) <= REACH; }
function primary() {
  const [mx, my] = screenToWorld(mouse.x, mouse.y);
  if (S.flying) return;
  if (mode) {
    if (mode.kind === 'build') return tryPlace(mx, my);
    if (mode.kind === 'conveyor' || mode.kind === 'conveyor2') return conveyorClick(mx, my);
    if (mode.kind === 'catwalk') return catwalkClick(mx, my);
    if (mode.kind === 'link') return linkClick(mx, my);
    if (mode.kind === 'remove') return removeAt(mx, my);
  }
  const p = S.player;
  const it = itemAt(mx, my);
  if (it) {
    if (!inReach(it.x, it.y)) return toast('Too far — walk closer');
    pickup(it); return;
  }
  const n = nodeStrict(mx, my);
  if (n) { setMode({ kind: 'link', from: n.id }); return; }
  const g = goopAt(mx, my);
  if (g) {
    if (!inReach(mx, my)) return toast('Too far — walk closer');
    if (p.cool > 0) return;
    swing(mx, my); g.hp--; g.flash = .15; g.vh = 200; g.h = Math.max(g.h, 1); g.dir = Math.sign(angDiff(playerAng(), g.a)) || 1;
    if (g.hp <= 0) killGoop(g, null);
    return;
  }
  if (shipAt(mx, my)) return tryBoard();
  const b = buildingAt(mx, my);
  if (b && BOXES.includes(b.type)) {
    const [cx, cy] = playerCenter();
    if (dist(cx, cy, ...bWorld(b, [0, -14])) > REACH + 60) return toast('Too far — walk closer');
    return openBox(b);
  }
  if (b) { if (PORT_TYPES.has(b.type)) return toast(info(b) + (S.ship && S.ship.port === b.id ? (b.powered ? ' · ship ready: click it or press F' : ' · link a ⚡ node to power the pad') : '')); return toast(info(b)); }
  const t = treeAt(mx, my);
  if (t) {
    if (!inReach(mx, my)) return toast('Too far — walk closer');
    if (p.cool > 0) return;
    swing(mx, my); t.hp--; t.shake = .25;
    const r = surfR(t.a);
    if (t.hp <= 0) {
      t.regrow = 50;
      if (cold() && t.kind !== 'pine') {
        gain('frost', 2, ...toWorld(t.a, r, 0, -50));
        gain('wood', 1, ...toWorld(t.a, r, 0, -34)); // kindling; pines are still the timber
      } else gain('wood', 3, ...toWorld(t.a, r, 0, -50));
      puff(...toWorld(t.a, r, 0, -40), cold() && t.kind !== 'pine' ? '#bdeaff' : '#2f8f46', 10);
      goal('chop');
    }
    return;
  }
  const rock = bushAt(mx, my);
  if (rock) {
    if (!inReach(mx, my)) return toast('Too far — walk closer');
    if (p.cool > 0) return;
    swing(mx, my, GRADE.magma || 1); rock.hp--; rock.shake = .25;
    const r = surfR(rock.a);
    if (rock.hp <= 0) {
      rock.regrow = 40;
      gain('magma', 2, ...toWorld(rock.a, r, 0, -22));
      puff(...toWorld(rock.a, r, 0, -16), '#ff6a1a', 12);
      goal('magma');
    }
    return;
  }
  const deb = debrisAt(mx, my);
  if (deb) {
    if (!inReach(mx, my)) return toast('Too far — walk closer');
    if (p.cool > 0) return;
    swing(mx, my, GRADE.wood || 1); deb.hp--; deb.shake = .28;
    const r = surfR(deb.a);
    if (deb.hp <= 0) {
      deb.regrow = DEBRIS_REGROW;
      const n = 2 + (Math.random() < .5 ? 1 : 0); // 2–3 wood
      gain('wood', n, ...toWorld(deb.a, r, 0, -20));
      puff(...toWorld(deb.a, r, 0, -14), '#c08447', 10);
      goal('debris'); goal('chop');
    }
    return;
  }
  // dig
  const a = Math.atan2(my, mx), mr = Math.hypot(mx, my), sr = surfR(a);
  if (mr > sr + 14 || mr < sr - 34) return;
  if (!inReach(mx, my)) return toast('Too far — walk closer');
  if (p.cool > 0) return;
  const seg = segOf(a);
  if (S.dug[seg] >= LAYERS) { swing(mx, my); return toast(hot() ? 'Solid rock — build a Drill for Red Dust Ore + stone' : cold() ? 'Solid rock — build a Drill to get stone + cobalt ore' : 'Solid rock — build a Drill to get stone'); }
  if (S.buildings.some(b2 => Math.abs(angDiff(b2.a, a)) < (DEF[b2.type].hw + 4) / planetR() && b2.r0 - surfR(b2.a) < 24)) return toast("Can't dig under a building");
  const digType = hot()
    ? (S.dug[seg] === 0 ? 'dirt' : S.dug[seg] === 1 ? 'stone' : 'rdust')
    : (cold() && S.dug[seg] === 0 ? 'ice' : 'dirt');
  swing(mx, my, GRADE[digType] || 1);
  S.dug[seg]++;
  const ca = (seg + .5) / NSEG * TAU;
  gain(digType, 1, Math.cos(ca) * sr, Math.sin(ca) * sr);
  puff(Math.cos(ca) * sr, Math.sin(ca) * sr, hot() ? '#d9603b' : cold() ? '#dff4ff' : '#8f5d35', 6);
  goal('dig'); if (digType === 'rdust') goal('rdust');
}
function swing(mx, my, grade = 1) { const p = S.player; p.swing = .2; p.cool = .25 * grade; p.facing = angDiff(playerAng(), Math.atan2(my, mx)) >= 0 ? 1 : -1; }
function pickup(it) {
  S.items.splice(S.items.indexOf(it), 1);
  S.inv[it.type]++; uiDirty = true;
  floatText(it.x, it.y, '+1 ' + INAME[it.type], ICOL[it.type][0]);
  goal('pick'); if (it.type === 'jelly') goal('jelly');
}
function grabNearby() {
  const [cx, cy] = playerCenter(); let n = 0;
  for (const it of [...S.items]) if (dist(cx, cy, it.x, it.y) < 80) { pickup(it); n++; }
  if (!n) toast('Nothing close enough to grab');
}
function dropSelected() {
  if (S.flying) return;
  const type = S.selType;
  if (!S.inv[type]) return toast('No ' + INAME[type] + ' to drop');
  S.inv[type]--; uiDirty = true;
  const p = S.player, a = playerAng(), [cx, cy] = playerCenter(), t = tanv(a), u = upv(a);
  spawnItem(type, cx + t[0] * p.facing * 14, cy + t[1] * p.facing * 14, t[0] * p.facing * 150 + u[0] * 130, t[1] * p.facing * 150 + u[1] * 130);
}
function info(b) {
  const d = DEF[b.type];
  if (DEF[b.type].supply) return `${d.name} — ${linkCount(b)}/${d.slots} lines · network power ${b.net ? b.net.used : 0}/${b.net ? b.net.supply : d.supply} used`;
  let s = d.name + (b.powered ? ' — ⚡ powered' : ' — no power (click its ⚡ node, then a Generator\'s)');
  if (b.type === 'furnace') s += ` · queued: ${(b.q || []).length}`;
  if (b.type === 'assembler') { const r = RECIPES[b.pick]; return `${d.name}${b.powered ? ' — ⚡' : ' — no power'} · recipe: ${r ? r.desc : '?'} · click to change`; }
  if (b.type === 'lab') {
    const next = [1, 2, 3, 4].find(n => !hasTier(n));
    if (!next) return 'Research Lab — all levels unlocked · click to view';
    const st = b.store || {};
    const parts = Object.entries(TIERS[next].need).map(([k, n]) => `${recipeNeedLabel(k)} ${Math.min(storeCount(st, k), n)}/${n}`);
    return `Research Lab — ${parts.join(' · ')} · Feed any port`;
  }
  if (b.type === 'chest') return `Chest — ${chestTotal(b)}/${CHEST_CAP} items · click to open`;
  if (b.type === 'lamp') return 'Lamp — keeps you warm nearby';
  if (b.type === 'cooler') return 'Cooler — keeps you cool nearby';
  if (b.type === 'filter') return `Sorter — ${b.pick ? INAME[b.pick] + ' → low ✓ port, rest → high ✕ port' : 'nothing picked: all → high ✕ port'} · click to set`;
  if (b.type === 'unloader') return `Unloader — ${b.src ? 'pulling ' + (b.pick ? INAME[b.pick] : 'any item') : 'place next to a Chest'} · click to set`;
  if (b.type === 'splitter') return 'Splitter — items alternate between the two output ports';
  if (b.type === 'merger') return 'Merger — two inputs join into one output';
  return s;
}
function placementFor(type, mx, my) {
  const a = Math.atan2(my, mx), hw = DEF[type].hw;
  let ground = 0; for (let o = -hw; o <= hw; o += 4) ground = Math.max(ground, surfR(a + o / R));
  let r0 = ground;
  if (AIR_BUILD.has(type)) {
    const clickR = Math.hypot(mx, my);
    r0 = clamp(clickR, ground, ground + MAX_AIR_H);
    if (r0 < ground + 8) r0 = ground; // near the surface → sit on it
  }
  const [cx, cy] = playerCenter(), px = Math.cos(a) * r0, py = Math.sin(a) * r0;
  let ok = true, why = '';
  if (!unlocked(type)) { ok = false; why = 'Needs ' + tierLabel(DEF[type].tier); }
  else if (!canAfford(DEF[type].cost)) { ok = false; why = 'Not enough materials'; }
  else if (dist(cx, cy, px, py) > BUILD_RANGE) { ok = false; why = 'Too far away'; }
  else if (S.buildings.some(b => dist(Math.cos(b.a) * b.r0, Math.sin(b.a) * b.r0, px, py) < DEF[b.type].hw + hw + 10)) { ok = false; why = 'Overlaps another building'; }
  else if (r0 <= ground + 18 && S.trees.some(t => t.hp > 0 && Math.abs(angDiff(t.a, a)) < (hw + 12) / R)) { ok = false; why = 'A tree is in the way — chop it'; }
  return { a, r0, ground, ok, why };
}
function placeBuilding(type, a, r0, flip) {
  const fl = (flip === -1 || flip === 1) ? flip : placeFlip;
  const g = surfR(a);
  let rr = (typeof r0 === 'number' && isFinite(r0)) ? r0 : g;
  if (!AIR_BUILD.has(type)) rr = g; // drills / ports stay on the ground
  else rr = clamp(rr, g, g + MAX_AIR_H);
  const b = { id: S.nextId++, type, a, r0: rr, anim: 0, timer: 0, flip: fl };
  if (type === 'furnace') b.q = [];
  if (type === 'chest' || type === 'lab') b.store = {};
  if (type === 'assembler') { b.buf = {}; b.pick = 'gear'; }
  if (type === 'filter' || type === 'unloader') b.pick = null;
  if (type === 'filter' || type === 'splitter' || type === 'merger' || type === 'unloader') b.dir = fl;
  S.buildings.push(b);
  return b;
}
function tryPlace(mx, my) {
  const type = mode.type, pl = placementFor(type, mx, my);
  if (!pl.ok) return toast(pl.why);
  const spent = pay(DEF[type].cost);
  const b = placeBuilding(type, pl.a, pl.r0);
  b.paid = spent;
  puff(...toWorld(b.a, b.r0, 0, -10), '#ffffff', 8);
  if (type === 'drill' || type === 'drill2') goal('drill');
  if (type === 'drill2' || type === 'generator2') goal('adv');
  if (type === 'assembler') goal('assembler');
  if (type === 'lab') goal('lab');
  if (type === 'filter') goal('sorter');
  if (type === 'lamp') goal('lamp');
  if (type === 'assembler') toast('Assembler placed — click it to pick a recipe, then feed it by belt');
  else if (type === 'lab') toast('Research Lab placed — feed Gear / Circuit / Frame into any port (or click to deposit)');
  else if (BOXES.includes(type) && type !== 'chest') toast(`${DEF[type].name} placed — click it to choose an item`);
  if (type === 'shipport') { goal('ship'); if (!S.ship) dockShip(b, 'gunship'); }
  if (type === 'corvetteport') { goal('corvette'); dockShip(b, 'corvette'); }
  if (DEF[type].demand) toast(`${DEF[type].name} placed — click its ⚡ node, then a Generator's node`);
  setMode(null); // one placement per select — re-pick from the build menu to place another
  saveSoon();
}
function portList(b, which) {
  const t = b.type, d = facing(b), sides = [[-24, -8], [24, -8]];
  if (which === 'start') { if (OUT[t]) return [outOf(b)]; if (t === 'filter' || t === 'splitter') return [sorterPort(b, 0), sorterPort(b, 1)]; if (t === 'unloader') return [[d * 22, -8]]; return []; }
  if (t === 'assembler') return assemblerPorts(b);
  if (t === 'lab') return labPorts(b).map(p => p.p);
  if (t === 'filter' || t === 'splitter') return [[-d * 24, -8]];
  if (t === 'merger') return [[-d * 24, -8], [-d * 24, -8 - LANE_H]];
  if (IN[t]) return [inOf(b)];
  return t === 'chest' ? sides : [];
}
// snap a click onto the nearest building port (outputs for a belt start, inputs for its end)
function snapPoint(x, y, which) {
  let best = null, bd = 34;
  for (const b of S.buildings) for (const port of portList(b, which)) {
    const [px, py] = bWorld(b, port), d = dist(px, py, x, y);
    if (d < bd) { bd = d; best = [px, py]; }
  }
  return best || clampAbove(x, y);
}
function sorterOutputNear(x, y) {
  return S.buildings.find(b => (b.type === 'filter' || b.type === 'splitter') && [0, 1].some(l => dist(...bWorld(b, sorterPort(b, l)), x, y) < 20));
}
function catSnap(x, y, skip) {
  let best = null, bd = 22;
  for (const c of S.catwalks) for (const q of [[c.x1, c.y1], [c.x2, c.y2]]) { const d = dist(x, y, ...q); if (d < bd && q !== skip) { bd = d; best = q; } }
  return best ? [...best] : clampAbove(x, y);
}
function catwalkAt(x, y) { return S.catwalks.find(c => { const [t, d] = convProj(c, x, y); return t >= 0 && t <= 1 && d < 12; }); }
function catwalkClick(mx, my) {
  const [cx, cy] = playerCenter();
  if (dist(cx, cy, mx, my) > BUILD_RANGE) return toast('Too far away');
  if (!mode.p1) { mode.p1 = catSnap(mx, my); updateModeBar(); return; }
  const [x1, y1] = mode.p1, [x2, y2] = catSnap(mx, my), len = dist(x1, y1, x2, y2);
  if (len < 24) return toast('Too short — click further away');
  if (len > 380) return toast('Too long — max ~380px per catwalk');
  if (!chordClear(x1, y1, x2, y2)) return toast('That would cut through the ground — lift the end up or make it shorter');
  if (!canAfford(DEF.catwalk.cost)) { setMode(null); return toast('Not enough wood'); }
  const paidCw = pay(DEF.catwalk.cost);
  S.catwalks.push({ id: S.nextId++, x1, y1, x2, y2, paid: paidCw });
  saveSoon();
  setMode(null);
}
function drawCatwalk(c, alpha = 1) {
  const L = convLen(c); if (L < 1) return;
  const [nx, ny] = catNormal(c), tx = (c.x2 - c.x1) / L, ty = (c.y2 - c.y1) / L;
  ctx.globalAlpha = alpha;
  const n = Math.max(1, Math.round(L / 40));
  for (let i = 0; i <= n; i++) {
    const x = c.x1 + tx * L * i / n, y = c.y1 + ty * L * i / n, a = Math.atan2(y, x), g = surfR(a), h = Math.hypot(x, y) - g - 4;
    if (h < 6) continue;
    ctx.save(); frame(a, g); rr(-2, -h, 4, h, 1, '#7a5634', OUTLINE, 1.5); ctx.restore();
  }
  // railing
  ctx.lineCap = 'round'; ctx.strokeStyle = '#8a6440'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(c.x1 + nx * 22, c.y1 + ny * 22); ctx.lineTo(c.x2 + nx * 22, c.y2 + ny * 22); ctx.stroke();
  for (let i = 0; i <= n; i++) { const x = c.x1 + tx * L * i / n, y = c.y1 + ty * L * i / n; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + nx * 22, y + ny * 22); ctx.stroke(); }
  // deck (top surface sits on the c line)
  const d = (k) => [c.x1 - nx * k, c.y1 - ny * k, c.x2 - nx * k, c.y2 - ny * k];
  let [a1, b1, a2, b2] = d(4);
  ctx.beginPath(); ctx.moveTo(a1, b1); ctx.lineTo(a2, b2); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 10; ctx.lineCap = 'butt'; ctx.stroke();
  ctx.strokeStyle = '#c08a52'; ctx.lineWidth = 6; ctx.stroke();
  ctx.strokeStyle = '#8a6440'; ctx.lineWidth = 1.5;
  for (let k = 8; k < L; k += 10) { const x = c.x1 + tx * k - nx * 4, y = c.y1 + ty * k - ny * 4; ctx.beginPath(); ctx.moveTo(x - nx * 3, y - ny * 3); ctx.lineTo(x + nx * 3, y + ny * 3); ctx.stroke(); }
  ctx.lineCap = 'round'; ctx.globalAlpha = 1;
}
function beltDef() { return DEF[mode && mode.kind === 'conveyor2' ? 'conveyor2' : 'conveyor']; }
function conveyorClick(mx, my) {
  const [cx, cy] = playerCenter(), d = beltDef();
  if (dist(cx, cy, mx, my) > BUILD_RANGE) return toast('Too far away');
  if (!mode.p1) { mode.p1 = snapPoint(mx, my, 'start'); updateModeBar(); return; }
  const [x1, y1] = mode.p1, [x2, y2] = snapPoint(mx, my, 'end'), len = dist(x1, y1, x2, y2);
  if (sorterOutputNear(x2, y2)) return toast("That's a Sorter output — feed it from its back side (⇨)");
  if (len < 24) return toast('Too short — click further away');
  if (len > 380) return toast('Too long — max ~380px per conveyor');
  if (!chordClear(x1, y1, x2, y2)) return toast('That would cut through the ground — lift the end up or make it shorter');
  if (!canAfford(d.cost)) { setMode(null); return toast('Not enough materials'); }
  const paidCv = pay(d.cost);
  const c = { id: S.nextId++, x1, y1, x2, y2, paid: paidCv }; if (mode.kind === 'conveyor2') c.spd = 2;
  S.conveyors.push(c);
  goal(mode.kind === 'conveyor2' ? 'fast' : 'belt'); saveSoon();
  setMode(null);
}
function linkCount(b) { return S.links.filter(l => l[0] === b.id || l[1] === b.id).length; }
function linkRange(a, b) { const r = [a, b].map(x => DEF[x.type].range).filter(Boolean); return r.length ? Math.max(...r) : LINK_RANGE; }
// generators have a limited number of line slots and a reach (old saves keep their existing lines)
function linkProblem(a, b) {
  for (const g of [a, b]) if (DEF[g.type].slots && linkCount(g) >= DEF[g.type].slots) return `${DEF[g.type].name} is full (${DEF[g.type].slots}/${DEF[g.type].slots} power lines)` + (g.type === 'generator' ? ' — build an Advanced Generator for 6' : '');
  const d = dist(...bWorld(a, nodeOf(a)), ...bWorld(b, nodeOf(b))), r = linkRange(a, b);
  if (d > r) return `Too far for a power line (${Math.round(d)}px, max ${r})` + (r < 200 ? ' — Generators only reach ~120px' : '');
  return null;
}
function linkClick(mx, my) {
  const b = nodeAt(mx, my);
  if (!b) return setMode(null);
  if (!NODE[b.type]) { setMode(null); return toast(DEF[b.type].name + ' does not use power'); }
  if (mode.from == null) { mode.from = b.id; updateModeBar(); return; }
  const a = S.buildings.find(x => x.id === mode.from);
  if (!a || a.id === b.id) return setMode(null);
  const i = S.links.findIndex(([p, q]) => (p === a.id && q === b.id) || (p === b.id && q === a.id));
  if (i >= 0) { S.links.splice(i, 1); toast('Power line removed'); }
  else {
    const why = linkProblem(a, b);
    if (why) { toast(why); return setMode(null); } S.links.push([a.id, b.id]); toast('⚡ Power line connected'); }
  saveSoon(); setMode(null);
}
function linkAt(x, y) {
  let best = null, bd = 12;
  for (const L of S.links) {
    const a = S.buildings.find(b => b.id === L[0]), b = S.buildings.find(bb => bb.id === L[1]);
    if (!a || !b || !NODE[a.type] || !NODE[b.type]) continue;
    const [x1, y1] = bWorld(a, nodeOf(a)), [x2, y2] = bWorld(b, nodeOf(b));
    const [t, d] = convProj({ x1, y1, x2, y2 }, x, y);
    if (t >= 0 && t <= 1 && d < bd) { bd = d; best = L; }
  }
  return best;
}
function deletableAt(x, y) {
  return !!(buildingAt(x, y) || conveyorAt(x, y) || catwalkAt(x, y) || linkAt(x, y));
}
function removeAt(mx, my) {
  const b = buildingAt(mx, my);
  if (b) {
    S.buildings.splice(S.buildings.indexOf(b), 1);
    S.links = S.links.filter(([p, q]) => p !== b.id && q !== b.id);
    pay(refundOf(b, DEF[b.type].cost), 1);
    if (b.q) b.q.forEach(t => { S.inv[t] = (S.inv[t] || 0) + 1; });
    if (b.store) for (const k in b.store) S.inv[k] = (S.inv[k] || 0) + b.store[k];
    if (b === boxB) closeBox();
    if (PORT_TYPES.has(b.type) && S.ship && S.ship.port === b.id) { const s = S.ship, st = shipStats(), r = surfR(b.a) + st.half; s.port = null; s.x = Math.cos(b.a) * r; s.y = Math.sin(b.a) * r; s.ang = b.a; }
    puff(...toWorld(b.a, b.r0, 0, -15), '#ffffff', 10); saveSoon();
    return toast(DEF[b.type].name + ' removed (refunded)');
  }
  const cw = catwalkAt(mx, my);
  if (cw) { S.catwalks.splice(S.catwalks.indexOf(cw), 1); pay(refundOf(cw, DEF.catwalk.cost), 1); saveSoon(); return toast('Catwalk removed (refunded)'); }
  const c = conveyorAt(mx, my);
  if (c) {
    S.conveyors.splice(S.conveyors.indexOf(c), 1);
    S.items.forEach(it => { if (it.belt === c.id) { it.belt = null; it.vx = it.vy = 0; } });
    pay(refundOf(c, (c.spd || 1) > 1 ? DEF.conveyor2.cost : DEF.conveyor.cost), 1); saveSoon();
    return toast(((c.spd || 1) > 1 ? 'Fast Conveyor' : 'Conveyor') + ' removed (refunded)');
  }
  const L = linkAt(mx, my);
  if (L) {
    const i = S.links.findIndex(([p, q]) => (p === L[0] && q === L[1]) || (p === L[1] && q === L[0]));
    if (i >= 0) { S.links.splice(i, 1); saveSoon(); return toast('Power line removed'); }
  }
}
function secondary() {
  const [mx, my] = screenToWorld(mouse.x, mouse.y);
  if (mode) return setMode(null);
  if (S.flying) return;
  if (deletableAt(mx, my)) removeAt(mx, my);
}

// ---------- rocket ----------
function dockShip(port, kind) {
  const k = kind || (port.type === 'corvetteport' ? 'corvette' : 'gunship');
  const padY = k === 'corvette' ? -140 : PAD_Y, half = k === 'corvette' ? 52 : SHIP_HALF;
  const [x, y] = bWorld(port, [0, padY - half]);
  S.ship = { x, y, vx: 0, vy: 0, ang: port.a, port: port.id, thrust: false, kind: k };
}
function ensureShip() {
  if (S.ship) return;
  const port = S.buildings.find(b => PORT_TYPES.has(b.type));
  if (port) dockShip(port);
}
function shipSpeed() { return S.ship ? Math.hypot(S.ship.vx, S.ship.vy) : 0; }
function shipAlt() { const s = S.ship, st = shipStats(), a = Math.atan2(s.y, s.x); return Math.hypot(s.x, s.y) - surfR(a) - st.r; }
function canLand() { return S.flying && shipAlt() < 70 && shipSpeed() < 190; }
function nearShip() { if (!S.ship || S.flying) return false; const [cx, cy] = playerCenter(); return dist(cx, cy, S.ship.x, S.ship.y) < shipStats().board; }
function tryBoard() {
  const s = S.ship;
  if (S.flying) return;
  if (!s) return toast(S.buildings.some(b => PORT_TYPES.has(b.type)) ? 'No ship here' : 'Build a Ship Port first (B menu)');
  if (!nearShip()) return toast('Walk closer to your ship');
  const port = s.port && S.buildings.find(b => b.id === s.port);
  if (port && !port.powered) return toast('The launch pad needs power — link the port to a Generator');
  S.flying = true; s.port = null;
  s.vx = Math.cos(s.ang) * 90; s.vy = Math.sin(s.ang) * 90;
  setMode(null); toggleBuild(false);
  goal('fly'); uiDirty = true; saveSoon();
  toast('🚀 W/↑ thrust · A/D turn · F to land when slow near the ground');
}
function tryLand() {
  const s = S.ship;
  if (!S.flying) return;
  if (!canLand()) return toast(shipAlt() >= 70 ? 'Get closer to the surface to land' : 'Too fast — slow down to land');
  const a = Math.atan2(s.y, s.x), st = shipStats();
  const pad = S.buildings.find(b => PORT_TYPES.has(b.type) && Math.abs(angDiff(b.a, a)) < 80 / planetR());
  if (pad) dockShip(pad, pad.type === 'corvetteport' ? 'corvette' : (s.kind || 'gunship'));
  else { const r = surfR(a) + st.half; s.x = Math.cos(a) * r; s.y = Math.sin(a) * r; s.ang = a; s.vx = s.vy = 0; s.port = null; }
  s.thrust = false; S.flying = false;
  const pa = Math.atan2(S.ship.y, S.ship.x) + 36 / planetR(), pr = surfR(pa);
  const p = S.player; p.x = Math.cos(pa) * pr; p.y = Math.sin(pa) * pr; p.vx = p.vy = 0; p.ground = true; p.facing = -1;
  puff(S.ship.x, S.ship.y, '#ffffff', 10);
  goal('land'); if (S.planet === 'ice') goal('ice'); if (S.planet === 'dust') goal('dustland'); uiDirty = true; saveSoon();
  toast(pad ? 'Docked on the launch pad' : cold() ? `Landed on the ${PLANETS[S.planet].name}! ❄ Stay near your ship or a Lamp.` : hot() ? `Landed on Red Dust! 🔥 Stay near your ship or a Cooler.` : 'Landed! Press F near the ship to fly again');
}
let bonkT = 0;
function bumpBody(cx, cy, rad, label) {
  const s = S.ship, dx = s.x - cx, dy = s.y - cy, d = Math.hypot(dx, dy) || 1, min = rad + shipStats().r;
  if (d >= min) return false;
  const ux = dx / d, uy = dy / d;
  s.x = cx + ux * min; s.y = cy + uy * min;
  const vr = s.vx * ux + s.vy * uy;
  if (vr < 0) {
    if (vr < -260) puff(s.x - ux * SHIP_R, s.y - uy * SHIP_R, '#c9ced6', 8);
    s.vx -= ux * vr * 1.3; s.vy -= uy * vr * 1.3;
  }
  if (label && bonkT <= 0) { bonkT = 3; toast(label); }
  return true;
}
function updateShip(dt) {
  const s = S.ship;
  bonkT = Math.max(0, bonkT - dt);
  if (!s || !S.flying) { if (s) s.thrust = false; return; }
  const st = shipStats();
  const turn = ((keys.KeyD || keys.ArrowRight || touch.right) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft || touch.left) ? 1 : 0);
  s.ang = wrap(s.ang + turn * st.turn * dt);
  s.thrust = !!(keys.KeyW || keys.ArrowUp || keys.Space || touch.jump);
  const dx = Math.cos(s.ang), dy = Math.sin(s.ang);
  if (s.thrust) {
    s.vx += dx * st.thrust * dt; s.vy += dy * st.thrust * dt;
    for (const sd of [-1, 1]) if (Math.random() < .6) fx.push({ k: 'p', x: s.x - dy * sd * 32 - dx * 30, y: s.y + dx * sd * 32 - dy * 30, vx: s.vx - dx * 180 + rand(-40, 40), vy: s.vy - dy * 180 + rand(-40, 40), color: Math.random() < .5 ? '#ffb347' : '#ffe07a', t: 0, life: rand(.2, .4) });
  }
  // no gravity: free flight with light damping
  const damp = Math.pow(.82, dt); s.vx *= damp; s.vy *= damp;
  const sp = Math.hypot(s.vx, s.vy); if (sp > st.max) { s.vx *= st.max / sp; s.vy *= st.max / sp; }
  s.x += s.vx * dt; s.y += s.vy * dt;
  // home planet surface
  const a = Math.atan2(s.y, s.x), ground = surfR(a);
  if (bumpBody(0, 0, ground, null)) { const t = tanv(a), vt = s.vx * t[0] + s.vy * t[1], f = 1 - Math.pow(.15, dt); s.vx -= t[0] * vt * f; s.vy -= t[1] * vt * f; }
  const cp = PLANETS[S.planet];
  for (const f of FAR) bumpBody(f.x - cp.x, f.y - cp.y, f.r, `🔒 ${f.name} — landing coming soon!`);
  for (const id in PLANETS) {
    if (id === S.planet) continue;
    const pl = PLANETS[id], px = pl.x - cp.x, py = pl.y - cp.y, pr = pl.r || R;
    // thick atmosphere: first ship is refused
    if (pl.needShip && shipKind() !== pl.needShip) {
      if (bumpBody(px, py, pr + 40, `The atmosphere is too thick for this ship — you need a Corvette`)) {
        const ux = (s.x - px) / (Math.hypot(s.x - px, s.y - py) || 1), uy = (s.y - py) / (Math.hypot(s.x - px, s.y - py) || 1);
        s.vx += ux * 220; s.vy += uy * 220;
      }
      continue;
    }
    if (dist(s.x, s.y, px, py) < Math.max(pr * 1.15, Math.hypot(s.x, s.y) * 0.55)) {
      switchPlanet(id);
      toast(`Entering ${pl.name} orbit` + (pl.cold ? ' — ❄ stay near your ship or a Lamp' : pl.hot ? ' — 🔥 stay near your ship or a Cooler' : ''));
      break;
    }
  }
  const far = Math.hypot(s.x, s.y);
  if (far > 4200) { s.vx -= s.x / far * 400 * dt; s.vy -= s.y / far * 400 * dt; if (bonkT <= 0) { bonkT = 3; toast('Deep space ahead — turning back'); } }
}

// ---------- camera ----------
function screenToWorld(sx, sy) {
  const z = cam.zoom, rx = (sx - W / 2) / z, ry = (sy - H / 2) / z, c = Math.cos(cam.rot), s = Math.sin(cam.rot);
  return [cam.x + rx * c + ry * s, cam.y - rx * s + ry * c];
}
function worldToScreen(x, y) {
  const dx = x - cam.x, dy = y - cam.y, c = Math.cos(cam.rot), s = Math.sin(cam.rot);
  return [W / 2 + (dx * c - dy * s) * cam.zoom, H / 2 + (dx * s + dy * c) * cam.zoom];
}
function updateCamera(dt, snap) {
  let tx, ty, tr, tz = clamp(Math.min(W, H) / 400, .8, 2.2) * cam.userZoom;
  if (S.flying && S.ship) {
    // camera follows the rocket and turns so its nose points up the screen
    const s = S.ship;
    tx = s.x + s.vx * .25; ty = s.y + s.vy * .25; tr = -Math.PI / 2 - s.ang; tz *= .5;
  } else {
    const p = S.player, a = playerAng();
    tx = p.x + Math.cos(a) * 55; ty = p.y + Math.sin(a) * 55; tr = -Math.PI / 2 - a;
  }
  const k = snap ? 1 : Math.min(1, dt * 6);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  cam.rot += angDiff(cam.rot, tr) * (snap ? 1 : Math.min(1, dt * (S.flying ? 9 : 7)));
  cam.zoom += (tz - cam.zoom) * (snap ? 1 : Math.min(1, dt * 3));
}

// ---------- drawing ----------
let W = 0, H = 0, DPR = 1;
const cv = document.getElementById('c');
let ctx = cv.getContext('2d');
const stars = Array.from({ length: 260 }, () => ({ x: rand(-1600, 1600), y: rand(-1600, 1600), s: rand(.5, 1.8), tw: rand(0, TAU) }));
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px';
}

function drawStars() {
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(cam.rot);
  const ox = cam.x * .12, oy = cam.y * .12, m = v => ((v % 3200) + 3200) % 3200 - 1600;
  for (const s of stars) { ctx.globalAlpha = .4 + .4 * Math.sin(S.t * 1.5 + s.tw); ctx.fillStyle = '#cfe0ff'; ctx.fillRect(m(s.x - ox), m(s.y - oy), s.s, s.s); }
  ctx.globalAlpha = 1; ctx.restore();
}
function drawPlanet() {
  const PR = planetR(), RR = rockR();
  const g = ctx.createRadialGradient(0, 0, PR - 20, 0, 0, PR + 170);
  const th = TH(), gl = PLANETS[S.planet].glow;
  g.addColorStop(0, gl + '.28)'); g.addColorStop(1, gl + '0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, PR + 170, 0, TAU); ctx.fill();
  circ(0, 0, RR, th.rock[0], null);
  circ(0, 0, RR * .72, th.rock[1], null);
  circ(0, 0, RR * .38, th.core[0], null);
  circ(0, 0, RR * .22, th.core[1], null);
  ctx.fillStyle = th.speck;
  for (let i = 0; i < 40; i++) { const a = i * 2.4, r = RR * (.78 + (i % 5) * .04); ctx.fillRect(Math.cos(a) * r - 3, Math.sin(a) * r - 3, 6, 5); }
  const step = TAU / NSEG;
  for (let i = 0; i < NSEG; i++) {
    const d = S.dug[i]; if (d >= LAYERS) continue;
    const a0 = i * step - .002, a1 = (i + 1) * step + .002, sr = PR - d * LAYER;
    ctx.beginPath(); ctx.arc(0, 0, sr, a0, a1); ctx.arc(0, 0, RR - 1, a1, a0, true); ctx.closePath();
    ctx.fillStyle = th.dirt; ctx.fill();
    if (d === 0) {
      ctx.beginPath(); ctx.arc(0, 0, sr, a0, a1); ctx.arc(0, 0, sr - 7, a1, a0, true); ctx.closePath();
      ctx.fillStyle = th.top[i % 2 ? 0 : 1]; ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, sr, a0, a1); ctx.arc(0, 0, sr - 3, a1, a0, true); ctx.closePath();
      ctx.fillStyle = th.dugTop; ctx.fill();
    }
  }
  ctx.beginPath();
  for (let i = 0; i < NSEG; i++) {
    const sr = PR - S.dug[i] * LAYER, a0 = i * step, a1 = (i + 1) * step;
    if (i === 0) ctx.moveTo(Math.cos(a0) * sr, Math.sin(a0) * sr); else ctx.lineTo(Math.cos(a0) * sr, Math.sin(a0) * sr);
    ctx.arc(0, 0, sr, a0, a1);
  }
  ctx.closePath(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5; ctx.stroke();
}
function drawTree(t) {
  ctx.save(); frame(t.a, surfR(t.a));
  if (t.shake > 0) ctx.rotate(Math.sin(t.shake * 60) * .06);
  const s = t.size; ctx.scale(s, s);
  if (t.kind === 'pine') { drawPine(t); ctx.restore(); return; }
  if (cold()) { drawCrystalTree(t); ctx.restore(); return; }
  if (t.hp <= 0) { rr(-5, -7, 10, 8, 2, '#8a5a2f'); ctx.restore(); return; }
  rr(-4, -16, 8, 17, 2, '#8a5a2f');
  const tiers = [[-14, 20], [-30, 16], [-44, 12]];
  for (const [y, w] of tiers) {
    ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(0, y - 22); ctx.lineTo(w, y); ctx.closePath();
    ctx.fillStyle = '#2f9a4c'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.restore();
}
function drawPine(t) {
  if (t.hp <= 0) { rr(-5, -7, 10, 8, 2, '#8a5a2f'); return; }
  rr(-4, -14, 8, 15, 2, '#7a4f2a');
  const tier = (y, w, h) => {
    ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(0, y - h); ctx.lineTo(w, y); ctx.closePath();
    ctx.fillStyle = '#2f7a5a'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w * .45, y - h * .55); ctx.lineTo(0, y - h); ctx.lineTo(w * .45, y - h * .55); ctx.quadraticCurveTo(0, y - h * .45, -w * .45, y - h * .55); ctx.fillStyle = '#f4fbff'; ctx.fill();
  };
  tier(-12, 20, 24); tier(-28, 16, 22); tier(-44, 11, 22);
}
function drawCrystalTree(t) {
  const shard = (x, y, h, w, c) => { ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x, y - h); ctx.lineTo(x + w, y); ctx.lineTo(x, y + 5); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke(); };
  if (t.hp <= 0) { shard(0, -2, 10, 5, '#9fcbe8'); return; }
  rr(-4, -14, 8, 15, 2, '#5f86b0');
  shard(-11, -14, 30, 7, '#a9e4ff'); shard(11, -16, 34, 7, '#a9e4ff'); shard(0, -18, 50, 9, '#c9f1ff');
  ctx.fillStyle = '#ffffffaa'; ctx.beginPath(); ctx.moveTo(-2, -24); ctx.lineTo(0, -60); ctx.lineTo(1, -24); ctx.closePath(); ctx.fill();
}

function drawDebris(d) {
  ctx.save(); frame(d.a, surfR(d.a));
  if (d.shake) ctx.translate((Math.random() - .5) * 3, 0);
  const s = d.s || 1; ctx.scale(s, s);
  if (d.hp <= 0) {
    // splinter stubs while regrowing
    rr(-10, -3, 8, 4, 1.5, '#6a4020'); rr(2, -2, 9, 3, 1.5, '#7a4a24');
    ctx.restore(); return;
  }
  if (d.variant === 1) {
    // broken crate: box + planks
    rr(-11, -14, 22, 14, 2, '#a06a38', OUTLINE, 2);
    rr(-9, -12, 18, 10, 1.5, '#c08447');
    // cracked lid
    ctx.beginPath(); ctx.moveTo(-9, -12); ctx.lineTo(-2, -18); ctx.lineTo(8, -14); ctx.lineTo(9, -12);
    ctx.fillStyle = '#8a5a2f'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
    // metal band
    rr(-11, -8, 22, 3, 1, '#7a8494', OUTLINE, 1);
    // scrap plank beside
    ctx.save(); ctx.translate(14, -4); ctx.rotate(.5);
    rr(-6, -2, 12, 4, 1.5, '#7d4f24', OUTLINE, 1.5); ctx.restore();
  } else {
    // dead log + crate scrap
    ctx.beginPath(); ctx.ellipse(0, -6, 14, 6, -.15, 0, TAU);
    ctx.fillStyle = '#8a5a2f'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    circ(-6, -6, 3.5, '#6a4020', OUTLINE); // end grain
    circ(-6, -6, 1.6, '#c08447', null);
    rr(6, -12, 10, 5, 1.5, '#a06a38', OUTLINE, 1.5);
    rr(-2, -2, 11, 3.5, 1.2, '#7d4f24', OUTLINE, 1.2);
  }
  ctx.restore();
}
function drawBush(b) {
  ctx.save(); frame(b.a, surfR(b.a));
  if (b.shake) ctx.translate((Math.random() - .5) * 3, 0);
  ctx.scale(b.s, b.s);
  if (cold()) {
    ctx.beginPath(); ctx.moveTo(-14, 1); ctx.quadraticCurveTo(-15, -14, -2, -16); ctx.quadraticCurveTo(14, -15, 14, 1); ctx.closePath();
    ctx.fillStyle = '#8ea3bf'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-11, -9); ctx.quadraticCurveTo(-10, -15, -2, -16); ctx.quadraticCurveTo(10, -15, 11, -8); ctx.quadraticCurveTo(0, -11, -11, -9); ctx.fillStyle = '#f4fbff'; ctx.fill();
    ctx.restore(); return;
  }
  if (hot() || b.kind === 'dust') {
    if (b.hp <= 0) { // cracked stump while regrowing
      ctx.beginPath(); ctx.moveTo(-8, 1); ctx.lineTo(-4, -4); ctx.lineTo(3, -3); ctx.lineTo(8, 1); ctx.closePath();
      ctx.fillStyle = '#5a2a18'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore(); return;
    }
    ctx.beginPath(); ctx.moveTo(-12, 1); ctx.quadraticCurveTo(-10, -12, 0, -14); ctx.quadraticCurveTo(12, -10, 12, 1); ctx.closePath();
    ctx.fillStyle = '#8a4a28'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    // glowing magma vents
    circ(-4, -8, 2.4, '#ff6a1a', null); circ(5, -6, 2.2, '#ff8a3d', null);
    circ(0, -11, 1.6, '#ffd84a', null);
    ctx.restore(); return;
  }
  ctx.beginPath(); ctx.arc(-9, -7, 9, 0, TAU); ctx.arc(9, -7, 9, 0, TAU); ctx.arc(0, -13, 11, 0, TAU);
  ctx.fillStyle = '#4cb85a'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke(); ctx.fill();
  circ(-4, -15, 2, '#ff6b8a', null); circ(6, -10, 2, '#ff6b8a', null);
  ctx.restore();
}
function drawNode(x, y, on, highlight) {
  if (highlight) { circ(x, y, 9 + Math.sin(S.t * 6) * 2, null, '#ffd84a', 2); }
  circ(x, y, 5, on ? '#ffd84a' : '#9aa1ab');
}
function drawBuildingSupports(b, alpha = 1) {
  if (!AIR_BUILD.has(b.type)) return;
  const g = surfR(b.a), h = b.r0 - g;
  if (h < 10) return;
  const hw = DEF[b.type].hw;
  ctx.save(); ctx.globalAlpha = alpha; frame(b.a, g);
  for (const x of [-hw + 6, 0, hw - 6]) {
    rr(x - 2, -h, 4, h, 1.5, '#5d6676', OUTLINE, 1.5);
    rr(x - 5, -3, 10, 4, 1.5, '#4a5262');
  }
  ctx.restore();
}
function drawBuildingLocal(type, b) {
  const on = !!b.powered, an = b.anim || 0;
  ctx.lineJoin = 'round';
  if (type === 'drill') {
    const bob = on ? Math.abs(Math.sin(an * 8)) * 4 : 0;
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.lineTo(0, 13 + bob); ctx.closePath(); ctx.fillStyle = '#c9ced6'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    rr(-20, -8, 40, 9, 2, '#5a6272');
    rr(-14, -42, 28, 35, 3, '#f2b53c');
    rr(-11, -42, 4, 35, 0, '#d4952a', null); rr(7, -42, 4, 35, 0, '#d4952a', null);
    rr(-6, -36, 12, 22, 2, '#2a3142');
    rr(-2, -34 + bob, 4, 18, 1, '#c9ced6', null);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -42); ctx.lineTo(-8, -55); ctx.stroke();
    rr(20, -13, 9, 9, 2, '#7a8394'); drawArrow(24.5, -8.5);
    drawNode(...NODE.drill, on, b.hl);
  } else if (type === 'furnace') {
    rr(-14, -60, 11, 26, 2, '#8e8e99');
    if (b.smelting) for (let i = 0; i < 3; i++) { const t = (S.t * .8 + i / 3) % 1; ctx.globalAlpha = 1 - t; circ(-8 + Math.sin(t * 6) * 4, -64 - t * 34, 4 + t * 6, '#c9ced6', null); ctx.globalAlpha = 1; }
    rr(-24, -38, 48, 38, 4, '#b8664a');
    ctx.strokeStyle = '#94503a'; ctx.lineWidth = 1.5;
    for (let y = -30; y < 0; y += 8) { ctx.beginPath(); ctx.moveTo(-23, y); ctx.lineTo(23, y); ctx.stroke(); }
    rr(-15, -30, 30, 18, 3, b.smelting ? '#ff9a2e' : '#2a3142');
    if (b.smelting) { ctx.fillStyle = '#ffe07a'; ctx.fillRect(-12, -18 - Math.abs(Math.sin(S.t * 9)) * 6, 24, 4); }
    ctx.fillStyle = '#5d3426';
    for (let i = 0; i < 4; i++) ctx.fillRect(-12 + i * 7, -29, 2, 16);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(16, -38); ctx.lineTo(16, -57); ctx.stroke();
    rr(-33, -17, 9, 10, 2, '#4f8fd6'); drawArrow(-28.5, -12);
    rr(24, -13, 9, 10, 2, '#7a8394'); drawArrow(28.5, -8);
    drawNode(...NODE.furnace, on, b.hl);
  } else if (type === 'generator') {
    rr(-18, -30, 36, 30, 4, '#4f8fd6');
    rr(-18, -30, 36, 7, 3, '#6aa6ea');
    ctx.fillStyle = on && Math.sin(S.t * 8) > -.3 ? '#ffd84a' : '#2a3142';
    ctx.beginPath(); ctx.moveTo(2, -21); ctx.lineTo(-6, -10); ctx.lineTo(0, -10); ctx.lineTo(-3, -2); ctx.lineTo(6, -14); ctx.lineTo(0, -14); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(8, -30); ctx.lineTo(8, -39); ctx.stroke();
    drawNode(...NODE.generator, true, b.hl);
  } else if (type === 'generator2') {
    rr(-22, -42, 44, 42, 5, '#3d5f86'); rr(-22, -42, 44, 8, 3, '#a8e4ff');
    rr(-16, -32, 32, 26, 3, '#0d1a2e');
    ctx.fillStyle = on && Math.sin(S.t * 10) > -.5 ? '#7fe3ff' : '#2a3142';
    ctx.beginPath(); ctx.moveTo(4, -30); ctx.lineTo(-7, -17); ctx.lineTo(0, -17); ctx.lineTo(-4, -7); ctx.lineTo(8, -21); ctx.lineTo(1, -21); ctx.closePath(); ctx.fill();
    for (const x of [-18, 14]) rr(x, -48, 4, 7, 1, '#cfefff');
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -42); ctx.lineTo(0, -51); ctx.stroke();
    drawNode(...NODE.generator2, true, b.hl);
  } else if (type === 'drill2') {
    const bob = on ? Math.abs(Math.sin(an * 14)) * 4 : 0;
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(0, 16 + bob); ctx.closePath(); ctx.fillStyle = '#bfe9ff'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    rr(-22, -8, 44, 9, 2, '#3e4c63');
    rr(-16, -48, 32, 41, 4, '#4d7fb3');
    rr(-13, -48, 4, 41, 0, '#3a6593', null); rr(9, -48, 4, 41, 0, '#3a6593', null);
    rr(-16, -52, 32, 6, 3, '#dff4ff');                                  // frost cap
    rr(-7, -40, 14, 26, 2, '#0d1a2e'); rr(-2, -38 + bob, 4, 22, 1, '#bfe9ff', null);
    drawSparkIcon(0, -42);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, -52); ctx.lineTo(-10, -61); ctx.stroke();
    rr(22, -13, 9, 9, 2, '#7a8394'); drawArrow(26.5, -8.5);
    drawNode(...NODE.drill2, on, b.hl);
  } else if (type === 'assembler') {
    rr(-28, -10, 56, 10, 2, '#5a6272');
    rr(-24, -48, 48, 40, 5, '#6b7d9a');
    rr(-18, -42, 36, 28, 3, '#0d1a2e');
    // spinning arm
    ctx.save(); ctx.translate(0, -28); ctx.rotate(on ? an * 4 : 0);
    rr(-3, -14, 6, 28, 2, '#cfd6df'); circ(0, 0, 5, '#ffd84a'); ctx.restore();
    if (b.pick && ICOL[RECIPES[b.pick]?.out]) { ctx.save(); paintMat(ctx, RECIPES[b.pick].out, 14, -7, -49); ctx.restore(); }
    rr(-32, -15, 9, 9, 2, '#4f8fd6'); drawArrow(-27.5, -10.5);                 // primary in
    rr(-32, -15 - LANE_H, 9, 9, 2, '#4f8fd6'); drawArrow(-27.5, -10.5 - LANE_H); // optional 2nd in
    rr(23, -15, 9, 9, 2, '#7a8394'); drawArrow(27.5, -10.5);
    drawNode(...NODE.assembler, on, b.hl);
  } else if (type === 'lab') {
    rr(-28, -8, 56, 8, 2, '#5a6272');
    rr(-24, -58, 48, 52, 6, '#4a6a8a');
    rr(-17, -52, 34, 28, 4, '#0d1a2e');
    // flask
    ctx.beginPath(); ctx.moveTo(-6, -48); ctx.lineTo(6, -48); ctx.lineTo(10, -30); ctx.lineTo(-10, -30); ctx.closePath();
    ctx.fillStyle = on ? (Math.sin(S.t * 5) > 0 ? '#5dff9a' : '#7fe3ff') : '#2a3142'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    circ(0, -60, 6, on ? '#cfefff' : '#6b7384');
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -58); ctx.lineTo(0, -64); ctx.stroke();
    rr(-8, -20, 16, 6, 2, '#ffd84a');
    const next = [1, 2, 3, 4].find(n => !hasTier(n));
    if (b.id && next) { ctx.fillStyle = '#ffd84a'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('L' + next, 0, -12); }
    else if (b.id) drawCheckIcon(0, -14);
    // 4 plain Any input ports along the base (no labels); flip via parent scale
    for (const spec of LAB_IN) {
      const [px, py] = spec.p;
      rr(px - 5.5, py - 5.5, 11, 11, 2, '#4f8fd6', OUTLINE, 1.5);
      ctx.save(); ctx.translate(px, py - 1); ctx.rotate(-Math.PI / 2); drawArrow(0, 0); ctx.restore();
    }
    drawNode(...NODE.lab, on, b.hl);
  } else if (type === 'splitter') {
    const d = facing(b), lit = b.flash > 0 ? b.last : -1;
    ctx.save(); ctx.scale(d, 1);
    rr(-27, -13, 9, 9, 2, '#4f8fd6'); drawArrow(-22.5, -8.5);
    rr(17, -14, 11, 11, 2, lit === 0 ? '#ffd84a' : '#7fe3ff');
    rr(17, -14 - LANE_H, 11, 11, 2, lit === 1 ? '#ffd84a' : '#7fe3ff');
    rr(-18, -50, 36, 50, 5, '#3d6a7a');
    ctx.beginPath(); ctx.moveTo(-18, -50); ctx.lineTo(-12, -60); ctx.lineTo(12, -60); ctx.lineTo(18, -50); ctx.closePath(); ctx.fillStyle = '#5a8a9a'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#7fe3ff'; ctx.fillRect(-18, -8, 36, 3);
    ctx.restore();
    // canvas split-fork icon (no emoji — renders everywhere)
    drawSplitIcon(0, -35, facing(b));
  } else if (type === 'merger') {
    const d = facing(b), lit = b.flash > 0;
    ctx.save(); ctx.scale(d, 1);
    rr(-27, -14, 11, 11, 2, lit ? '#ffd84a' : '#4f8fd6');
    rr(-27, -14 - LANE_H, 11, 11, 2, lit ? '#ffd84a' : '#4f8fd6');
    rr(17, -13, 9, 9, 2, '#7a8394'); drawArrow(21.5, -8.5);
    rr(-18, -50, 36, 50, 5, '#3d6a7a');
    ctx.beginPath(); ctx.moveTo(-18, -50); ctx.lineTo(-12, -60); ctx.lineTo(12, -60); ctx.lineTo(18, -50); ctx.closePath(); ctx.fillStyle = '#5a8a9a'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#7fe3ff'; ctx.fillRect(-18, -8, 36, 3);
    ctx.restore();
    drawMergeIcon(0, -35, facing(b));
  } else if (type === 'turret') {
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -28); ctx.quadraticCurveTo(-24, -36, -26, -47); ctx.stroke();
    rr(-24, -10, 48, 10, 2, '#6b7384');
    rr(-19, -17, 38, 8, 2, '#8a93a5');
    const la = (b.aim != null ? b.aim - (b.a + Math.PI / 2) : 0);
    ctx.save(); ctx.translate(0, -26); ctx.rotate(la); rr(0, -4, 28, 8, 2, '#3b4252'); ctx.restore();
    ctx.beginPath(); ctx.arc(0, -17, 15, Math.PI, 0); ctx.closePath(); ctx.fillStyle = on ? '#e0e6ee' : '#b8bec8'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.stroke();
    circ(0, -24, 3, on ? '#ff5a6e' : '#555', null);
    rr(23, -11, 9, 8, 2, '#7a8394'); drawArrow(27.5, -7);
    drawNode(...NODE.turret, on, b.hl);
  } else if (type === 'lamp') {
    rr(-9, -6, 18, 7, 2, '#5a6272');
    rr(-2.5, -62, 5, 58, 1, '#7a8394');
    rr(-11, -80, 22, 6, 3, '#4b5263');
    const fl = .85 + Math.sin(S.t * 7 + (b.id || 0)) * .1;
    circ(0, -67, 10, '#ffc861'); circ(0, -67, 5 * fl + 1, '#fff3c4', null);
    rr(-6, -58, 12, 4, 1, '#4b5263');
  } else if (type === 'cooler') {
    rr(-12, -8, 24, 8, 2, '#5a6272');
    rr(-14, -48, 28, 42, 4, '#6a90a8');
    rr(-10, -42, 20, 28, 3, '#0d1a2e');
    for (let i = 0; i < 4; i++) { const a = S.t * 4 + i * 1.2; ctx.strokeStyle = '#7fe3ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -28, 6 + i, a, a + 1.2); ctx.stroke(); }
    circ(0, -28, 4, '#cfefff', null);
    rr(-8, -54, 16, 6, 2, '#a8e4ff');
  } else if (type === 'chest') {
    rr(-18, -30, 36, 30, 4, '#b07a43');
    rr(-18, -30, 36, 10, 3, '#c98f52');
    ctx.fillStyle = '#7d4f24'; ctx.fillRect(-17, -20, 34, 2); ctx.fillRect(-12, -29, 2, 28); ctx.fillRect(10, -29, 2, 28);
    rr(-4, -24, 8, 9, 2, '#ffd84a', OUTLINE, 1.5);
    const tot = b.store ? chestTotal(b) : 0;
    if (b.id) { rr(-14, -7, 28, 4, 1, '#3b2a1a', null); if (tot) rr(-14, -7, 28 * tot / CHEST_CAP, 4, 1, tot >= CHEST_CAP ? '#ff5a6e' : '#7cf07c', null); }
  } else if (type === 'filter') {
    const d = facing(b), lit = b.flash > 0 ? b.last : -1;
    ctx.save(); ctx.scale(d, 1);
    rr(-27, -13, 9, 9, 2, '#4f8fd6'); drawArrow(-22.5, -8.5);                       // input (back)
    rr(17, -14, 11, 11, 2, lit === 0 ? '#ffd84a' : '#62d05b');                       // match port (low)
    rr(17, -14 - LANE_H, 11, 11, 2, lit === 1 ? '#ffd84a' : '#8a93a5');              // rest port (high)
    rr(-18, -50, 36, 50, 5, '#5c6f8f');
    ctx.beginPath(); ctx.moveTo(-18, -50); ctx.lineTo(-12, -60); ctx.lineTo(12, -60); ctx.lineTo(18, -50); ctx.closePath(); ctx.fillStyle = '#7d8eab'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffd84a'; ctx.fillRect(-18, -8, 36, 3);
    ctx.restore();
    // labels (not mirrored)
    rr(-9, -46, 18, 15, 3, '#0d1324');
    if (b.pick) { ctx.save(); paintMat(ctx, b.pick, 10, -5, -44); ctx.restore(); } else { ctx.fillStyle = '#8a93a5'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('?', 0, -35); }
    const mx = d * 22.5;
    if (b.pick) { ctx.save(); paintMat(ctx, b.pick, 7, mx - 3.5, -12); ctx.restore(); } else drawCheckIcon(mx, -6, '#fff');
    drawXIcon(mx, -5 - LANE_H);
  } else if (type === 'unloader') {
    const d = facing(b);
    ctx.save(); ctx.scale(d, 1); rr(14, -13, 9, 9, 2, '#7a8394'); drawArrow(18.5, -8.5); ctx.restore();
    rr(-14, -28, 28, 28, 4, '#8a93a5');
    ctx.fillStyle = '#ffd84a'; for (let i = 0; i < 4; i++) ctx.fillRect(-12 + i * 7, -6, 4, 4);
    rr(-8, -24, 16, 12, 3, '#0d1324');
    if (b.pick) { ctx.save(); paintMat(ctx, b.pick, 8, -4, -22); ctx.restore(); } else { ctx.fillStyle = '#e8eef7'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('ANY', 0, -15); }
    ctx.save(); ctx.translate(-d * 10, -28); ctx.rotate(-d * (.4 + (b.anim || 0) * 2)); rr(-2, -14, 4, 14, 1, '#5d6676'); ctx.restore();
  } else if (type === 'shipport') {
    rr(-36, -112, 72, 112, 3, '#cfd6df');
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 36, -96); ctx.lineTo(sd * 50, -114); ctx.lineTo(sd * 36, -114); ctx.closePath(); ctx.fillStyle = '#9aa3b0'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke(); }
    rr(-52, -119, 104, 8, 2, '#6b7384');
    for (let i = 0; i < 6; i++) rr(-46 + i * 16, -118, 9, 4, 1, on ? (Math.floor(S.t * 4) % 6 === i ? '#fff3a8' : '#ffd84a') : '#4b5263', null);
    for (const sd of [-1, 1]) { rr(sd * 46 - 3, -127, 6, 9, 1, '#4b5263'); circ(sd * 46, -128, 2.5, on ? '#7cf07c' : '#ff5a6e', null); }
    if (!b.id) { ctx.save(); ctx.translate(0, PAD_Y - SHIP_HALF); drawRocketLocal(false); ctx.restore(); }
    ctx.fillStyle = '#4b5263'; ctx.fillRect(-36, -58, 72, 4);
    for (let i = 0; i < 4; i++) rr(30, -104 + i * 12, 5, 6, 1, '#9aa3ad', null);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, 0);
    for (let i = 0; i < 6; i++) { ctx.lineTo(-6 + i * 6, -i * 8 - 8); ctx.lineTo(i * 6, -i * 8 - 8); }
    ctx.stroke();
    rr(-28, -26, 14, 26, 2, '#7a5236');
    ctx.beginPath(); ctx.moveTo(-36, -64); ctx.lineTo(-46, -67); ctx.stroke();
    drawNode(...NODE.shipport, on, b.hl);
  } else if (type === 'corvetteport') {
    rr(-46, -130, 92, 130, 3, '#b8c0cc');
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 46, -110); ctx.lineTo(sd * 62, -132); ctx.lineTo(sd * 46, -132); ctx.closePath(); ctx.fillStyle = '#8a93a1'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke(); }
    rr(-60, -138, 120, 9, 2, '#5d6676');
    for (let i = 0; i < 7; i++) rr(-54 + i * 16, -136, 10, 5, 1, on ? (Math.floor(S.t * 4) % 7 === i ? '#fff3a8' : '#ffd84a') : '#4b5263', null);
    for (const sd of [-1, 1]) { rr(sd * 56 - 3, -146, 6, 10, 1, '#4b5263'); circ(sd * 56, -148, 2.8, on ? '#7cf07c' : '#ff5a6e', null); }
    if (!b.id) { ctx.save(); ctx.translate(0, -140 - 52); drawCorvetteLocal(false); ctx.restore(); }
    ctx.fillStyle = '#4b5263'; ctx.fillRect(-46, -64, 92, 4);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, 0);
    for (let i = 0; i < 7; i++) { ctx.lineTo(-8 + i * 7, -i * 9 - 8); ctx.lineTo(i * 7, -i * 9 - 8); }
    ctx.stroke();
    rr(-32, -30, 16, 30, 2, '#7a5236');
    ctx.beginPath(); ctx.moveTo(-40, -70); ctx.lineTo(-52, -74); ctx.stroke();
    drawNode(...NODE.corvetteport, on, b.hl);
  }
}
function drawCorvetteLocal(thrust) {
  // side-view cartoon corvette: long wedge, raised bridge, orange engines
  const poly = (pts, fill, lw = 2) => { ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw; ctx.stroke(); };
  ctx.lineJoin = 'round';
  if (thrust) for (const x of [-18, 0, 18]) {
    const fl = 16 + Math.random() * 18;
    poly([[x - 5, 38], [x, 38 + fl], [x + 5, 38]], '#ff8a3d', 0);
    poly([[x - 2, 38], [x, 38 + fl * .55], [x + 2, 38]], '#ffe07a', 0);
  }
  // swept wings / rear flanks
  for (const sd of [-1, 1]) {
    poly([[sd * 8, 8], [sd * 34, 18], [sd * 32, 36], [sd * 6, 28]], '#9aa3b0');
    poly([[sd * 10, -6], [sd * 28, 2], [sd * 26, 14], [sd * 8, 10]], '#aab2be');
  }
  // main wedge hull (nose up = -y)
  poly([[-10, -58], [10, -58], [16, -20], [18, 30], [10, 40], [-10, 40], [-18, 30], [-16, -20]], '#c5ccd6');
  // armor bands
  ctx.strokeStyle = '#8a93a1'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(14, -10); ctx.moveTo(-16, 8); ctx.lineTo(16, 8); ctx.moveTo(-16, 22); ctx.lineTo(16, 22); ctx.stroke();
  // raised central spine + bridge tower
  rr(-6, -36, 12, 48, 2, '#aeb6c2');
  poly([[-8, -28], [8, -28], [10, -12], [-10, -12]], '#8a93a1');
  rr(-7, -48, 14, 18, 3, '#9aa3b0');
  rr(-5, -46, 10, 8, 2, '#2f6f86'); // bridge windows
  ctx.strokeStyle = '#8fd3e8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-3, -44); ctx.lineTo(-3, -40); ctx.moveTo(3, -44); ctx.lineTo(3, -40); ctx.stroke();
  // nose tip
  poly([[-4, -58], [4, -58], [0, -70]], '#d0d6de');
  // rear engines
  for (const x of [-14, 0, 14]) {
    rr(x - 5, 30, 10, 12, 2, '#6b7384');
    rr(x - 4, 40, 8, 5, 2, thrust ? '#ffb347' : '#3b4252');
  }
}
function drawRocketLocal(thrust) {
  // gunship seen from above; nose points to local -y; origin = ship center
  const poly = (pts, fill, lw = 2) => { ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw; ctx.stroke(); };
  const line = (x1, y1, x2, y2, c = '#7d8696', w = 1.5) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); };
  ctx.lineJoin = 'round';
  if (thrust) for (const sd of [-1, 1]) {
    const fl = 14 + Math.random() * 14, x = sd * 32;
    poly([[x - 6, 25], [x, 25 + fl], [x + 6, 25]], '#ff8a3d', 0); poly([[x - 3, 25], [x, 25 + fl * .6], [x + 3, 25]], '#ffe07a', 0);
  }
  for (const sd of [-1, 1]) {
    poly([[sd * 6, 8], [sd * 21, 30], [sd * 17, 35], [sd * 5, 25]], '#8b93a1');              // angled tail fin
    line(sd * 8, 14, sd * 18, 31, '#6b7384');
    for (const mx of [13, 20]) { rr(sd * mx - 2.5, 10, 5, 12, 2, '#4b5263', OUTLINE, 1.5); circ(sd * mx, 10, 2, '#ff5a6e', null); } // missile rack
    poly([[sd * 8, -8], [sd * 26, -4], [sd * 26, 12], [sd * 8, 18]], '#aab2be');             // swept wing
    line(sd * 10, 4, sd * 25, 4); circ(sd * 18, -2, 2.5, '#9aa3b0', OUTLINE, 1.5);
    const x = sd * 32;
    rr(x - 8, -12, 16, 37, 4, '#9aa3b0');                                                    // engine nacelle
    line(x - 8, 2, x + 8, 2); line(x - 8, 14, x + 8, 14);
    rr(x - 6, 21, 12, 5, 2, thrust ? '#ffb347' : '#3b4252');
    circ(x, -10, 6.5, '#5d6676'); circ(x, -10, 3, thrust ? '#ffd84a' : '#2a3142', null);   // round intake
  }
  rr(-2, -46, 4, 12, 1, '#3b4252'); circ(0, -46, 2.2, '#2a3142', null);                    // chin cannon
  poly([[-5, -37], [5, -37], [11, -24], [12, -4], [10, 22], [5, 29], [-5, 29], [-10, 22], [-12, -4], [-11, -24]], '#bfc6d0'); // armored fuselage
  line(-11, -2, 11, -2); line(-10, 10, 10, 10); line(0, 4, 0, 26); line(-8, 20, 8, 20);
  poly([[-4, -33], [4, -33], [8, -21], [6, -12], [-6, -12], [-8, -21]], '#2f6f86');        // tinted canopy
  line(-3, -30, -5, -20, '#8fd3e8', 2);
  circ(0, 1, 4.5, '#9aa3b0', OUTLINE, 1.5); circ(0, 1, 2, '#6b7384', null);                // top hatch
}
function drawShip() {
  const s = S.ship; if (!s) return;
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.ang + Math.PI / 2);
  if (!S.flying && nearShip() && !mode) { ctx.beginPath(); ctx.arc(0, 0, 50 + Math.sin(S.t * 5) * 2, 0, TAU); ctx.strokeStyle = '#ffd84a88'; ctx.lineWidth = 2; ctx.stroke(); }
  if (shipKind() === 'corvette') drawCorvetteLocal(S.flying && s.thrust);
  else drawRocketLocal(S.flying && s.thrust);
  ctx.restore();
}
function drawFar() {
  const cp = PLANETS[S.planet];
  const list = [
    ...Object.keys(PLANETS).filter(id => id !== S.planet).map(id => {
      const pl = PLANETS[id];
      const locked = pl.needShip && shipKind() !== pl.needShip;
      return { ...pl, r: pl.r || R, sub: locked ? '🔒 needs Corvette' : '🛬 fly close to land', subc: locked ? '#ffb347' : '#9dffb0' };
    }),
    ...FAR.map(f => ({ ...f, sub: '🔒 coming soon', subc: '#ffd84a' })),
  ];
  for (const f0 of list) {
    const f = { ...f0, x: f0.x - cp.x, y: f0.y - cp.y };
    const g = ctx.createRadialGradient(f.x, f.y, f.r - 10, f.x, f.y, f.r + 140);
    g.addColorStop(0, f.glow + '.25)'); g.addColorStop(1, f.glow + '0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 140, 0, TAU); ctx.fill();
    circ(f.x, f.y, f.r, f.c1, OUTLINE, 3);
    for (let i = 0; i < 7; i++) { const a = i * 2.1, d = f.r * (.3 + (i % 3) * .2); circ(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, f.r * (.08 + (i % 2) * .05), f.c2, null); }
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(-cam.rot); ctx.textAlign = 'center';
    ctx.font = 'bold 30px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(f.name, 0, -f.r - 40);
    ctx.font = '22px system-ui'; ctx.fillStyle = f.subc; ctx.fillText(f.sub, 0, -f.r - 12);
    ctx.restore();
  }
}
function drawLampGlow(b) {
  const [x, y] = bWorld(b, [0, b.type === 'cooler' ? -58 : -66]), k = .9 + Math.sin(S.t * 3 + (b.id || 0)) * .05;
  const g = ctx.createRadialGradient(x, y, 6, x, y, LAMP_R * k);
  if (b.type === 'cooler') { g.addColorStop(0, 'rgba(120,220,255,.4)'); g.addColorStop(.5, 'rgba(80,180,255,.12)'); g.addColorStop(1, 'rgba(80,180,255,0)'); }
  else { g.addColorStop(0, 'rgba(255,205,110,.42)'); g.addColorStop(.5, 'rgba(255,170,80,.14)'); g.addColorStop(1, 'rgba(255,160,70,0)'); }
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, LAMP_R * k, 0, TAU); ctx.fill();
}
function drawColdFx() {
  if (hot() && !S.flying) {
    ctx.fillStyle = '#ff8a3d55';
    for (let i = 0; i < 40; i++) {
      const sp = 30 + (i % 5) * 12, x = ((i * 97.3 + Math.sin(S.t * .9 + i) * 20) % W + W) % W, y = H - ((i * 71 + S.t * sp) % (H + 30));
      ctx.globalAlpha = .15 + (i % 3) * .08; ctx.fillRect(x, y, 3, 8);
    }
    ctx.globalAlpha = 1;
    const k = clamp((50 - S.player.temp) / 50, 0, 1);
    if (k > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .25, W / 2, H / 2, Math.hypot(W, H) * .55);
      g.addColorStop(0, 'rgba(255,120,40,0)'); g.addColorStop(1, `rgba(255,80,20,${.55 * k})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    return;
  }
  if (!cold()) return;
  if (!S.flying) {
    // light snowfall in screen space
    ctx.fillStyle = '#ffffffb0';
    for (let i = 0; i < 70; i++) {
      const sp = 18 + (i % 5) * 9, x = ((i * 137.5 + Math.sin(S.t * .7 + i) * 18) % W + W) % W, y = ((i * 89 + S.t * sp) % (H + 20)) - 10;
      ctx.fillRect(x, y, 2 + (i % 2), 2 + (i % 2));
    }
  }
  const k = S.flying ? 0 : clamp((50 - S.player.temp) / 50, 0, 1);
  if (k <= 0) return;
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.hypot(W, H) * .55);
  g.addColorStop(0, 'rgba(190,230,255,0)'); g.addColorStop(1, `rgba(190,230,255,${.8 * k})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = `rgba(120,180,255,${.12 * k})`; ctx.fillRect(0, 0, W, H);
  // frost flakes creeping in from the edges
  ctx.strokeStyle = `rgba(255,255,255,${.8 * k})`; ctx.lineWidth = 1.5;
  for (let i = 0; i < 48; i++) {
    const side = i % 4, f = (i * 0.618) % 1, depth = ((i * 37) % 60) * (.3 + k), sz = 4 + (i * 5) % 7;
    const x = side === 0 || side === 2 ? f * W : side === 1 ? W - 8 - depth : 8 + depth, y = side === 1 || side === 3 ? f * H : side === 0 ? 8 + depth : H - 8 - depth;
    ctx.beginPath();
    for (let j = 0; j < 3; j++) { const a = j * Math.PI / 3; ctx.moveTo(x - Math.cos(a) * sz, y - Math.sin(a) * sz); ctx.lineTo(x + Math.cos(a) * sz, y + Math.sin(a) * sz); }
    ctx.stroke();
  }
}
function drawArrow(x, y) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 2, y - 3); ctx.lineTo(x + 3, y); ctx.lineTo(x - 2, y + 3); ctx.closePath(); ctx.fill(); }
// machine face icons — path-drawn so they never fall back to tofu glyphs
function drawSplitIcon(x, y, dir = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  ctx.strokeStyle = '#e8eef7'; ctx.fillStyle = '#e8eef7'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(0, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(6, -6); ctx.moveTo(0, 0); ctx.lineTo(6, 6); ctx.stroke();
  // arrowheads
  ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(2, -6); ctx.lineTo(6, -2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(6, 6); ctx.lineTo(2, 6); ctx.lineTo(6, 2); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawMergeIcon(x, y, dir = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  ctx.strokeStyle = '#e8eef7'; ctx.fillStyle = '#e8eef7'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(0, 0); ctx.moveTo(-6, 6); ctx.lineTo(0, 0); ctx.lineTo(7, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(3, -3); ctx.lineTo(3, 3); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawSparkIcon(x, y, color = '#7fe3ff') {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, r = i % 2 ? 2.2 : 5;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawCheckIcon(x, y, color = '#7cf07c') {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-1.5, 4); ctx.lineTo(6, -5); ctx.stroke();
  ctx.restore();
}
function drawXIcon(x, y) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = '#ff8a9a'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, 4); ctx.moveTo(4, -4); ctx.lineTo(-4, 4); ctx.stroke();
  ctx.restore();
}
function drawConveyor(c, alpha = 1, offs = 0) {
  const L = convLen(c); if (L < 1) return;
  const tx = (c.x2 - c.x1) / L, ty = (c.y2 - c.y1) / L;
  ctx.globalAlpha = alpha;
  // support legs: straight down (toward the planet centre) to the ground
  const n = Math.max(1, Math.round(L / 34));
  for (let i = 0; i <= n; i++) {
    const x = c.x1 + tx * L * i / n, y = c.y1 + ty * L * i / n, a = Math.atan2(y, x), g = surfR(a), h = Math.hypot(x, y) - g;
    if (h < 12) continue;
    ctx.save(); frame(a, g); rr(-2.5, -h, 5, h, 1.5, '#5d6676', OUTLINE, 1.5); rr(-6, -3, 12, 4, 1.5, '#4a5262'); ctx.restore();
  }
  ctx.lineCap = 'round';
  const fast = (c.spd || 1) > 1;
  ctx.beginPath(); ctx.moveTo(c.x1, c.y1); ctx.lineTo(c.x2, c.y2);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 14; ctx.stroke();
  ctx.strokeStyle = fast ? '#2a4a66' : '#3c4456'; ctx.lineWidth = 10; ctx.stroke();
  ctx.save(); ctx.translate(c.x1, c.y1); ctx.rotate(Math.atan2(ty, tx));
  ctx.strokeStyle = fast ? '#7fe3ff' : '#ffd84a'; ctx.lineWidth = 2;
  for (let x = (offs % 16); x < L; x += 16) { ctx.beginPath(); ctx.moveTo(x - 2, -3); ctx.lineTo(x + 2, 0); ctx.lineTo(x - 2, 3); ctx.stroke(); }
  ctx.restore();
  circ(c.x1, c.y1, 6, '#8a93a5'); circ(c.x2, c.y2, 6, '#8a93a5');
  ctx.globalAlpha = 1;
}
function drawItem(it) {
  const a = Math.atan2(it.y, it.x);
  ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(a + Math.PI / 2 + (it.belt ? 0 : it.rot));
  paintMat(ctx, it.type, 12, -6, -6);
  ctx.restore();
}
function drawGoop(g) {
  const r = surfR(g.a) + g.h;
  ctx.save(); frame(g.a, r);
  const sq = g.sq > 0 ? 1 + g.sq * 1.5 : (g.h > 0 ? .85 : 1 + Math.sin(S.t * 5 + g.a * 9) * .05);
  ctx.scale(sq, 1 / sq); ctx.scale(g.dir, 1);
  ctx.beginPath(); ctx.moveTo(-12, 0); ctx.quadraticCurveTo(-13, -16, 0, -17); ctx.quadraticCurveTo(13, -16, 12, 0); ctx.closePath();
  const ic = cold();
  ctx.fillStyle = g.flash > 0 ? '#ffffff' : ic ? '#7fc8ff' : '#6bdc5a'; ctx.fill(); ctx.strokeStyle = ic ? '#2b6fa8' : '#2b7f2a'; ctx.lineWidth = 2; ctx.stroke();
  circ(-5, -6, 1.5, ic ? '#d6f1ff' : '#9bf58f', null);
  if (ic) { ctx.fillStyle = '#f4fbff'; ctx.beginPath(); ctx.moveTo(-8, -12); ctx.lineTo(-6, -19); ctx.lineTo(-3, -14); ctx.lineTo(0, -21); ctx.lineTo(3, -15); ctx.closePath(); ctx.fill(); }
  circ(2, -10, 3.2, '#fff', null); circ(8, -10, 3.2, '#fff', null);
  circ(3, -10, 1.5, '#111', null); circ(9, -10, 1.5, '#111', null);
  ctx.restore();
}
function drawPlayer() {
  const p = S.player, a = playerAng(), r = Math.hypot(p.x, p.y);
  if (p.inv > 0 && Math.floor(p.inv * 12) % 2) return;
  ctx.save(); frame(a, r); ctx.scale(p.facing, 1);
  const walk = p.ground ? Math.sin(p.anim * 2) * 4 : 2;
  const ck = cold() ? clamp((50 - p.temp) / 50, 0, 1) : 0, suit = mixHex('#f3f6fa', '#8fcaff', ck), limb = mixHex('#cfd6df', '#6fa9e0', ck);
  rr(-6 + walk * .5, -10, 5, 10, 2, limb); rr(1 - walk * .5, -10, 5, 10, 2, limb);
  rr(-12, -26, 6, 12, 2, '#ff8a3d');
  rr(-8, -28, 16, 19, 4, suit);
  rr(-4, -22, 8, 5, 1, '#ff8a3d', null);
  circ(0, -35, 9, suit);
  if (ck > .4) { ctx.fillStyle = '#ffffffcc'; for (let i = 0; i < 3; i++) ctx.fillRect(-7 + i * 6, -29, 2, 3 + ((i * 3) % 4)); }
  rr(1, -39, 8, 7, 3, '#4fc3ff');
  ctx.save(); ctx.translate(4, -21); ctx.rotate(p.swing > 0 ? -1.2 + (1 - p.swing / .2) * 2.2 : .5);
  rr(-1.5, 0, 3, 12, 1, suit, OUTLINE, 1.5); ctx.translate(0, 12);
  ctx.fillStyle = '#8a5a2f'; ctx.fillRect(-1, 0, 2, 8);
  ctx.beginPath(); ctx.moveTo(-6, 8); ctx.quadraticCurveTo(0, 4, 6, 8); ctx.lineTo(0, 10); ctx.closePath(); ctx.fillStyle = '#c9ced6'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
  ctx.restore();
}
function drawLink(a, b, on) {
  const [x1, y1] = a, [x2, y2] = b, mx = (x1 + x2) / 2, my = (y1 + y2) / 2, mr = Math.hypot(mx, my) || 1;
  const sag = Math.min(30, dist(x1, y1, x2, y2) * .12), cx = mx - mx / mr * sag, cy = my - my / mr * sag;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4; ctx.stroke();
  ctx.strokeStyle = on ? '#ffd84a' : '#8a8f98'; ctx.lineWidth = 2;
  if (on) { ctx.setLineDash([6, 6]); ctx.lineDashOffset = -S.t * 30; }
  ctx.stroke(); ctx.setLineDash([]);
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  if (hot() && !S.flying) { bg.addColorStop(0, '#3a1808'); bg.addColorStop(.45, '#8a3a18'); bg.addColorStop(1, '#c45a28'); }
  else { bg.addColorStop(0, '#0b1020'); bg.addColorStop(1, '#141a35'); }
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  drawStars();
  ctx.translate(W / 2, H / 2); ctx.scale(cam.zoom, cam.zoom); ctx.rotate(cam.rot); ctx.translate(-cam.x, -cam.y);
  drawFar();
  drawPlanet();
  S.bushes.forEach(drawBush);
  (S.debris || []).forEach(drawDebris);
  S.trees.forEach(drawTree);
  const [mx, my] = screenToWorld(mouse.x, mouse.y);
  for (const b of S.buildings) if (b.type === 'lamp' || b.type === 'cooler') drawLampGlow(b);
  S.catwalks.forEach(c => drawCatwalk(c));
  S.conveyors.forEach(c => drawConveyor(c, 1, S.t * BELT_SPEED * (c.spd || 1)));
  const hlNodes = mode && mode.kind === 'link';
  const hovNode = !mode && mouse.in && !S.flying ? nodeStrict(mx, my) : null;
  for (const b of S.buildings) {
    b.hl = hlNodes || b === hovNode;
    drawBuildingSupports(b);
    ctx.save(); frame(b.a, b.r0);
    // sorter-family already scales by dir inside drawBuildingLocal; others scale by flip here
    if (b.type !== 'filter' && b.type !== 'splitter' && b.type !== 'merger' && b.type !== 'unloader') ctx.scale(facing(b), 1);
    drawBuildingLocal(b.type, b); ctx.restore();
    if (DEF[b.type].demand && !b.powered && Math.sin(S.t * 5) > 0) {
      const n = nodeOf(b), [x, y] = bWorld(b, [n[0], n[1] - 12]);
      ctx.save(); ctx.translate(x, y); ctx.rotate(-cam.rot);
        ctx.save(); ctx.scale(0.75, 0.75); drawSparkIcon(-5, 0, '#ff5a6e'); ctx.restore();
        ctx.fillStyle = '#ff5a6e'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'left'; ctx.fillText('?', 3, 4);
        ctx.restore();
    }
    if (DEF[b.type].slots) {
      const npos = nodeOf(b), [x, y] = bWorld(b, [npos[0], npos[1] - 13]), n = linkCount(b), full = n >= DEF[b.type].slots;
      if (hlNodes) circ(...bWorld(b, npos), DEF[b.type].range, null, '#ffd84a33', 1.5);
      ctx.save(); ctx.translate(x, y); ctx.rotate(-cam.rot); ctx.fillStyle = full ? '#ffb347' : '#e8f0ff'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`${n}/${DEF[b.type].slots}`, 0, 0); ctx.restore();
    }
  }
  drawShip();
  S.items.forEach(drawItem);
  S.goops.forEach(drawGoop);
  if (!S.flying) drawPlayer();
  for (const [ia, ib] of S.links) {
    const a = S.buildings.find(b => b.id === ia), b = S.buildings.find(x => x.id === ib);
    if (a && b) drawLink(bWorld(a, nodeOf(a)), bWorld(b, nodeOf(b)), !!(a.net && a.net.supply > 0));
  }
  ctx.fillStyle = '#ffe07a';
  for (const b of bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, TAU); ctx.fill(); }
  for (const f of fx) if (f.k === 'p') { ctx.globalAlpha = 1 - f.t / f.life; ctx.fillStyle = f.color; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); }
  ctx.globalAlpha = 1;
  // mode previews
  hover = null;
  if (mode && mode.kind === 'build') {
    const pl = placementFor(mode.type, mx, my), ghost = { flip: placeFlip, dir: placeFlip };
    drawBuildingSupports({ a: pl.a, r0: pl.r0, type: mode.type }, .55);
    ctx.save(); frame(pl.a, pl.r0); ctx.globalAlpha = .55;
    if (mode.type !== 'filter' && mode.type !== 'splitter' && mode.type !== 'merger' && mode.type !== 'unloader') ctx.scale(placeFlip, 1);
    drawBuildingLocal(mode.type, ghost); ctx.globalAlpha = 1;
    rr(-DEF[mode.type].hw, 1, DEF[mode.type].hw * 2, 4, 2, pl.ok ? '#62d05b' : '#ff5a6e', null);
    ctx.restore();
  } else if (mode && (mode.kind === 'conveyor' || mode.kind === 'conveyor2')) {
    if (mode.p1) { const [x2, y2] = snapPoint(mx, my, 'end'), c = { x1: mode.p1[0], y1: mode.p1[1], x2, y2, spd: mode.kind === 'conveyor2' ? 2 : 1 }, L = convLen(c);
      const bad = L > 380 || sorterOutputNear(x2, y2) || !chordClear(c.x1, c.y1, x2, y2);
      drawConveyor(c, .55, 0); if (bad) { circ(x2, y2, 8, '#ff5a6e99'); } }
    else { const [x, y] = snapPoint(mx, my, 'start'); circ(x, y, 7, mode.kind === 'conveyor2' ? '#7fe3ff88' : '#ffd84a88'); }
  } else if (mode && mode.kind === 'catwalk') {
    if (mode.p1) { const [x2, y2] = catSnap(mx, my), c = { x1: mode.p1[0], y1: mode.p1[1], x2, y2 };
      drawCatwalk(c, .55); if (convLen(c) > 380 || !chordClear(c.x1, c.y1, x2, y2)) circ(x2, y2, 8, '#ff5a6e99'); }
    else { const [x, y] = catSnap(mx, my); circ(x, y, 7, '#c08a5288'); }
  } else if (mode && mode.kind === 'link' && mode.from != null) {
    const a = S.buildings.find(b => b.id === mode.from);
    if (a) drawLink(bWorld(a, nodeOf(a)), [mx, my], false);
  } else if (mode && mode.kind === 'remove') {
    const b = buildingAt(mx, my);
    if (b) { ctx.save(); frame(b.a, b.r0); rr(-DEF[b.type].hw - 4, -DEF[b.type].h, DEF[b.type].hw * 2 + 8, DEF[b.type].h + 6, 6, null, '#ff5a6e', 3); ctx.restore(); }
    else { const c = conveyorAt(mx, my); if (c) { ctx.globalAlpha = .6; drawConveyor(c, .6); ctx.globalAlpha = 1; }
      else { const w = catwalkAt(mx, my); if (w) { ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.strokeStyle = '#ff5a6e'; ctx.lineWidth = 4; ctx.stroke(); } } }
  } else if (mouse.in && !S.flying) {
    hover = buildingAt(mx, my);
  }
  drawHoldTarget();
  // reach ring hint around cursor target
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  for (const f of fx) if (f.k === 't') {
    const [sx, sy] = worldToScreen(f.x, f.y);
    ctx.globalAlpha = 1 - f.t / 1.1; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
    ctx.fillStyle = '#000a'; ctx.fillText(f.text, sx + 1, sy - f.t * 30 + 1); ctx.fillStyle = f.color; ctx.fillText(f.text, sx, sy - f.t * 30);
  }
  ctx.globalAlpha = 1;
  drawColdFx();
  if (S.flying) drawPointers();
  drawHoldRing();
  if (hover) {
    const t = info(hover); ctx.font = '12px system-ui'; const w = ctx.measureText(t).width + 14;
    const x = Math.min(mouse.x + 14, W - w - 4), y = mouse.y + 18;
    ctx.fillStyle = '#141b2ef0'; ctx.fillRect(x, y, w, 22); ctx.fillStyle = '#e8eef7'; ctx.textAlign = 'left'; ctx.fillText(t, x + 7, y + 15);
  }
}

function drawPointers() {
  const cp = PLANETS[S.planet];
  const bodies = [
    ...Object.values(PLANETS).map(p => ({ x: p.x - cp.x, y: p.y - cp.y, r: R, name: p.name, col: p.col })),
    ...FAR.map(f => ({ ...f, x: f.x - cp.x, y: f.y - cp.y, col: f.c1 })),
  ];
  const placed = [];
  for (const bd of bodies) {
    const [sx, sy] = worldToScreen(bd.x, bd.y), dx = sx - W / 2, dy = sy - H / 2, d = Math.hypot(dx, dy) || 1;
    const ex = W / 2 + dx / d * Math.max(0, d - bd.r * cam.zoom), ey = H / 2 + dy / d * Math.max(0, d - bd.r * cam.zoom);
    if (ex > 30 && ex < W - 30 && ey > 30 && ey < H - 30) continue;
    const ux = dx / d, uy = dy / d;
    const top = 120, bot = H - 130, left = 60, right = W - 60;
    const k = Math.min(ux > 0 ? (right - W / 2) / ux : ux < 0 ? (left - W / 2) / ux : 1e9, uy > 0 ? (bot - H / 2) / uy : uy < 0 ? (top - H / 2) / uy : 1e9);
    const px = W / 2 + ux * k, py = H / 2 + uy * k;
    ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(uy, ux));
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9); ctx.closePath();
    ctx.fillStyle = bd.col; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8eef7';
    let lx = px - ux * 26, ly = py - uy * 26 + 4;
    while (placed.some(q => Math.abs(q[0] - lx) < 90 && Math.abs(q[1] - ly) < 14)) ly -= 16;
    placed.push([lx, ly]);
    ctx.fillText(`${bd.name} ${Math.round(Math.max(0, (d - bd.r * cam.zoom) / cam.zoom) / 10)}m`, lx, ly);
  }
}

// ---------- UI ----------
let uiDirty = true;
const $ = id => document.getElementById(id);
const toastEl = $('toast'); let toastT = 0;
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2200); }
function costChips(cost) {
  const plan = planCost(cost, t => S.inv[t] || 0);
  return '<div class="cost">' + Object.entries(cost).map(([k, v]) =>
    `<span class="chip${plan.short[k] ? ' bad' : ''}${altTypes(k).length ? ' alt' : ''}" title="${v} ${recipeNeedLabel(k)}"><i style="${matChipStyle(k)}"></i>${v} ${INAME[k]}</span>`).join('') + '</div>';
}
function renderUI() {
  $('hp').innerHTML = Array.from({ length: 10 }, (_, i) => `<span class="h ${i < S.player.hp ? '' : 'off'}"></span>`).join('');
  const total = ITEMS.reduce((n, k) => n + S.inv[k], 0), st = S.selType;
  $('bagCount').textContent = total;
  $('selChip').innerHTML = S.inv[st] > 0
    ? `${cubeHTML(st)}<span><b>${INAME[st]}</b> ×${S.inv[st]}</span><kbd>Q</kbd><small>drop</small>`
    : `<span class="muted">${total ? 'Pick an item in your backpack' : 'Backpack is empty'}</span>`;
  if (!$('inventory').classList.contains('hidden')) renderInventory();
  const glist = goalsList(), gmap = goalsMap();
  const done = glist.filter(g => gmap[g[0]]).length;
  const nextG = glist.filter(g => !gmap[g[0]]).slice(0, 3);
  const rchip = [1,2,3,4].map(n => hasTier(n) ? `L${n}✔` : `L${n}`).join(' · ');
  const title = S.planet === 'dust' ? 'RED DUST' : 'GOALS';
  $('goals').innerHTML = `<b>${title} ${done}/${glist.length}</b> <span class="muted" style="font-size:11px">${rchip}</span><br>` + (nextG.length ? nextG.map((g, i) => (i ? '◦ ' : '▸ ') + g[1]).join('<br>') : '🚀 All done — keep expanding!');
  if (!$('buildMenu').classList.contains('hidden')) renderBuildMenu();
  if (boxB) renderBox();
  uiDirty = false;
}
let boxB = null;
function openBox(b) { boxB = b; toggleInv(false); toggleBuild(false); setMode(null); $('box').classList.remove('hidden'); renderBox(); }
function closeBox() { boxB = null; const el = $('box'); if (el) el.classList.add('hidden'); }
function renderBox() {
  const b = boxB, el = $('box'); if (!b) return;
  const head = (t, extra) => `<div class="invHead"><b>${t}</b><span class="muted">${extra}</span><button id="boxClose" tabindex="-1">✕</button></div>`;
  if (b.type === 'chest') {
    const st = b.store || {}, have = ITEMS.filter(k => st[k] > 0), sel = S.selType, tot = chestTotal(b);
    const slots = have.map(k => `<div class="islot" data-take="${k}" title="Take all ${INAME[k]}">${cubeHTML(k)}<span class="n">${st[k]}</span><span class="nm">${INAME[k]}</span></div>`);
    while (slots.length < INV_SLOTS) slots.push('<div class="islot empty"></div>');
    el.innerHTML = head('📦 CHEST', `${tot}/${CHEST_CAP}`) + `<div class="grid">${slots.join('')}</div>
      <div class="invFoot"><span class="muted">Click an item to take it all</span>
      <button id="putBtn" tabindex="-1" ${S.inv[sel] > 0 && tot < CHEST_CAP ? '' : 'disabled'}>Put ${INAME[sel]} ×${S.inv[sel] || 0}</button></div>`;
  } else if (b.type === 'assembler') {
    const slots = RECIPE_ORDER.map(k => {
      const r = RECIPES[k];
      return `<div class="islot recipe ${b.pick === k ? 'sel' : ''}" data-recipe="${k}" title="${r.desc}">${cubeHTML(r.out)}<span class="n">×${r.n}</span><span class="nm">${r.name}</span></div>`;
    });
    const r = RECIPES[b.pick], buf = b.buf || {};
    const need = r ? Object.entries(r.in).map(([k, n]) => `${bufCount(b, k)}/${bufCap(r, k)} ${recipeNeedLabel(k)}`).join(' · ') : '';
    const slot = r && slotOf(r, S.selType);
    const canPut = !!(slot && S.inv[S.selType] > 0 && bufCount(b, slot) < bufCap(r, slot));
    el.innerHTML = head('🔩 ASSEMBLER', b.powered ? '⚡ on' : 'no power') + `<div class="grid">${slots.join('')}</div>
      <div class="invFoot boxNote">${r ? `<b>${r.desc}</b><br>Buffer: ${need || 'empty'}` : ''}<br>
      <button id="putBtn" tabindex="-1" ${canPut ? '' : 'disabled'}>Put 1 ${INAME[S.selType]}</button></div>`;
  } else if (b.type === 'lab') {
    const st = b.store || {};
    const next = [1, 2, 3, 4].find(n => !hasTier(n));
    const rows = [1, 2, 3, 4].map(n => {
      const t = TIERS[n], done = hasTier(n);
      const show = !done && n === next;
      const prog = show ? Object.entries(t.need).map(([k, need]) => {
        const have = Math.min(storeCount(st, k), need);
        return `<div class="rprog needed"><span>${cubeHTML(k)} ${have}/${need} ${INAME[k]}</span><i style="width:${have / need * 100}%"></i></div>`;
      }).join('') : '';
      const body = done ? '<div class="muted">Unlocked</div>' : (show ? prog : '<div class="muted">Locked — finish prior levels first</div>');
      return `<div class="tier ${done ? 'done' : ''} ${show ? 'now' : ''}"><div class="th">${done ? '✔' : '🔬'} Level ${n}: ${t.name} <small>${t.unlocks}</small></div>${body}</div>`;
    }).join('');
    const ports = `<div class="labPorts muted">Four Any ports — feed Gear / Circuit / Frame by belt</div>`;
    const useful = next && TIERS[next].need[S.selType] != null && S.inv[S.selType] > 0;
    el.innerHTML = head('🔬 RESEARCH LAB', b.powered ? '⚡ on' : 'no power') + ports + rows +
      `<div class="invFoot"><span class="muted">${next ? 'Feed any port · or Put ' + needCost(TIERS[next].need) : 'All research complete'}</span>
      <button id="putBtn" tabindex="-1" ${useful ? '' : 'disabled'}>Put 1 ${INAME[S.selType]}</button></div>`;
  } else {
    const isF = b.type === 'filter', opts = [''].concat(ITEMS);
    const slots = opts.map(k => `<div class="islot ${(b.pick || '') === k ? 'sel' : ''}" data-pick="${k}">${k ? cubeHTML(k) : '<span class="any">✱</span>'}<span class="nm">${k ? INAME[k] : isF ? 'Off' : 'Any'}</span></div>`);
    const note = isF
      ? `${b.pick ? `<b>${INAME[b.pick]}</b> → low ✓ port · everything else → high ✕ port.` : 'Nothing picked: everything goes out the high ✕ port.'} Feed it from the back (⇨). Start belts from either port; with no belt, items pop out onto the ground.<br><button id="flipBtn" tabindex="-1">⇄ Flip sides</button>`
      : (b.src ? `Pulling <b>${b.pick ? INAME[b.pick] : 'any item'}</b> out of the Chest next to it, onto the side with the arrow.` : '<span style="color:#ff8a9a">Place it right next to a Chest.</span>');
    el.innerHTML = head(isF ? '🔀 SORTER' : '📤 UNLOADER', 'pick an item') + `<div class="grid">${slots.join('')}</div><div class="invFoot boxNote">${note}</div>`;
  }
}
function cubeHTML(k) { ensureMatIcons(); return `<span class="cube ${k}" style="${matChipStyle(k)};--edge:${ICOL[k][1]}"></span>`; }
function renderInventory() {
  const have = ITEMS.filter(k => S.inv[k] > 0), st = S.selType;
  let slots = have.map(k => `<div class="islot ${k === st ? 'sel' : ''}" data-t="${k}" title="${INAME[k]}">${cubeHTML(k)}<span class="n">${S.inv[k]}</span><span class="nm">${INAME[k]}</span></div>`);
  while (slots.length < INV_SLOTS) slots.push('<div class="islot empty"></div>');
  $('inventory').innerHTML = `<div class="invHead"><b>🎒 BACKPACK</b><span class="muted">I / Tab</span><button id="invClose" tabindex="-1">✕</button></div>
    <div class="grid">${slots.join('')}</div>
    <div class="invFoot">${S.inv[st] > 0 ? `Selected: <b>${INAME[st]}</b> ×${S.inv[st]}` : '<span class="muted">Tap an item to select it</span>'}
    <button id="dropBtn" tabindex="-1" ${S.inv[st] > 0 ? '' : 'disabled'}>Drop 1 <kbd>Q</kbd></button></div>`;
}
function toggleInv(force) {
  const el = $('inventory'), show = force ?? el.classList.contains('hidden');
  el.classList.toggle('hidden', !show);
  if (show) { toggleBuild(false); closeBox(); renderInventory(); }
}
const previews = {};
function miniCost(cost) {
  const plan = planCost(cost, t => S.inv[t] || 0);
  return '<div class="cost">' + Object.entries(cost).map(([k, v]) =>
    `<span class="chip${plan.short[k] ? ' bad' : ''}${altTypes(k).length ? ' alt' : ''}" title="${v} ${recipeNeedLabel(k)}"><i style="${matChipStyle(k)}"></i>${v}</span>`).join('') + '</div>';
}
function buildCard(t) {
  const lock = !unlocked(t), afford = canAfford(DEF[t].cost), d = DEF[t];
  const power = d.demand ? `<span class="pwr">⚡${d.demand}</span>` : d.supply ? `<span class="pwr">+${d.supply}</span>` : '';
  const note = lock ? `<div class="need">needs L${d.tier}</div>` : miniCost(d.cost);
  return `<button class="card ${lock ? 'locked' : afford ? '' : 'no'}" data-t="${t}" tabindex="-1" title="${lock ? 'Locked — ' + tierLabel(d.tier) : d.name + ' — ' + needCost(d.cost) + '. ' + d.desc}">
    <span class="ico"><canvas width="96" height="96" data-p="${t}"></canvas></span>
    <div class="meta"><div class="t">${lock ? '🔒 ' : ''}${d.name}${power}</div>${note}</div>
  </button>`;
}
function renderBuildMenu() {
  const m = $('buildMenu');
  if (!BUILD_TABS[buildTab]) buildTab = 1;
  const tabs = [1, 2].map(n => `<button class="btab ${buildTab === n ? 'on' : ''}" data-tab="${n}" tabindex="-1">Tier ${n}</button>`).join('');
  const res = [1, 2, 3, 4].map(n => `<span class="rchip ${hasTier(n) ? 'ok' : ''}">${hasTier(n) ? '✔' : '🔒'}L${n}</span>`).join('');
  const cards = BUILD_TABS[buildTab].map(buildCard).join('');
  m.innerHTML = `<div class="bmHead"><h3>BUILD</h3><div class="rchips">${res}</div></div>
    <div class="btabs">${tabs}</div>
    <div class="bgrid">${cards}</div>
    <div class="tools"><button data-tool="remove" tabindex="-1">✖ Remove <kbd>X</kbd></button></div>`;
  m.querySelectorAll('canvas[data-p]').forEach(c => drawPreview(c, c.dataset.p));
}
function drawPreview(c, t) {
  const pc = c.getContext('2d'), W = c.width, H = c.height, pad = 7;
  // draw into a square canvas at true aspect ratio (CSS keeps the box square — never stretch)
  ctxSwap(pc, () => {
    pc.setTransform(1, 0, 0, 1, 0, 0); pc.clearRect(0, 0, W, H);
    if (t === 'catwalk') {
      const s = Math.min((W - pad * 2) / 90, (H - pad * 2) / 56);
      pc.translate(W / 2, H / 2 + 6 * s); pc.scale(s, s);
      for (const x of [-28, 0, 28]) { pc.fillStyle = '#7a5634'; pc.fillRect(x - 2, 0, 4, 28); }
      pc.strokeStyle = '#8a6440'; pc.lineWidth = 2; pc.beginPath(); pc.moveTo(-36, -20); pc.lineTo(36, -20); pc.stroke();
      for (const x of [-36, 0, 36]) { pc.beginPath(); pc.moveTo(x, 0); pc.lineTo(x, -20); pc.stroke(); }
      pc.fillStyle = OUTLINE; pc.fillRect(-38, -2, 76, 10); pc.fillStyle = '#c08a52'; pc.fillRect(-36, 0, 72, 6);
      return;
    }
    if (t === 'conveyor' || t === 'conveyor2') {
      const fast = t === 'conveyor2', s = Math.min((W - pad * 2) / 84, (H - pad * 2) / 28);
      pc.translate(W / 2, H / 2); pc.scale(s, s); pc.lineCap = 'round';
      pc.strokeStyle = OUTLINE; pc.lineWidth = 14; pc.beginPath(); pc.moveTo(-36, 0); pc.lineTo(36, 0); pc.stroke();
      pc.strokeStyle = fast ? '#2a4a66' : '#3c4456'; pc.lineWidth = 10; pc.stroke();
      pc.strokeStyle = fast ? '#7fe3ff' : '#ffd84a'; pc.lineWidth = 2.5;
      for (let x = -26; x <= 26; x += 13) { pc.beginPath(); pc.moveTo(x - 3, -4); pc.lineTo(x + 3, 0); pc.lineTo(x - 3, 4); pc.stroke(); }
      circ(-36, 0, 6, '#8a93a5'); circ(36, 0, 6, '#8a93a5');
      return;
    }
    const hw = DEF[t].hw, h = DEF[t].h;
    const s = Math.min((W - pad * 2) / (hw * 2 + 6), (H - pad * 2) / (h + 4));
    // building local space: feet at y=0, top at -h — center that box in the square
    pc.translate(W / 2, H / 2 + (h / 2) * s);
    pc.scale(s, s);
    drawBuildingLocal(t, { powered: true, anim: 0 });
  });
}
function ctxSwap(c, fn) { const old = ctx; ctx = c; try { fn(); } finally { ctx = old; } }
function setMode(m) {
  mode = m; updateModeBar(); updateFlipBtn();
  if (m) $('buildMenu').classList.add('hidden');
}
function isTouchUI() {
  return matchMedia('(pointer:coarse)').matches || matchMedia('(max-width:700px)').matches
    || (('ontouchstart' in window || navigator.maxTouchPoints > 0) && matchMedia('(max-width:900px)').matches);
}
function updateModeBar() {
  const el = $('modeBar');
  if (!mode) { el.classList.add('hidden'); el.style.top = ''; return; }
  el.classList.remove('hidden');
  const touch = isTouchUI();
  el.classList.toggle('touch', touch);
  let label = '';
  if (touch) {
    if (mode.kind === 'build') label = `Placing ${DEF[mode.type].name} · tap to place`;
    else if (mode.kind === 'conveyor' || mode.kind === 'conveyor2') label = (!mode.p1 ? `${mode.kind === 'conveyor2' ? 'Fast Conveyor' : 'Conveyor'} · tap START` : `${mode.kind === 'conveyor2' ? 'Fast Conveyor' : 'Conveyor'} · tap END`);
    else if (mode.kind === 'link') label = mode.from == null ? 'Power line · tap a ⚡ node' : 'Power line · tap another node';
    else if (mode.kind === 'catwalk') label = !mode.p1 ? 'Catwalk · tap START' : 'Catwalk · tap END';
    else if (mode.kind === 'remove') label = 'Remove · tap a building';
    el.innerHTML = `<span class="modeLabel">${label}</span><button type="button" id="modeCancel" tabindex="-1" title="Cancel" aria-label="Cancel">✕</button>`;
    const btn = $('modeCancel');
    if (btn) btn.onclick = e => { e.stopPropagation(); setMode(null); };
    // sit just below hearts / goals / Build row
    requestAnimationFrame(() => {
      if (!mode) return;
      const hud = $('hud').getBoundingClientRect(), topb = $('topbtns').getBoundingClientRect();
      el.style.top = Math.ceil(Math.max(hud.bottom, topb.bottom) + 8) + 'px';
    });
  } else {
    el.style.top = '';
    const esc = ' · Esc / right-click to cancel';
    if (mode.kind === 'build') label = `Placing ${DEF[mode.type].name} — click to place` + (AIR_BUILD.has(mode.type) ? ' (can hang in the air)' : ' on the ground') + ' · R / Flip to mirror' + esc;
    else if (mode.kind === 'conveyor' || mode.kind === 'conveyor2') label = (!(mode.p1) ? `${mode.kind === 'conveyor2' ? 'Fast Conveyor' : 'Conveyor'}: click the START (snaps to outputs like a Drill)` : `${mode.kind === 'conveyor2' ? 'Fast Conveyor' : 'Conveyor'}: click the END — a machine input, or anywhere (even up in the air)`) + esc;
    else if (mode.kind === 'link') label = (mode.from == null ? 'Power line: click a power node' : 'Power line: click another ⚡ node (same pair = unlink)') + ' · Esc to cancel';
    else if (mode.kind === 'catwalk') label = (!mode.p1 ? 'Catwalk: click the START (snaps to other catwalk ends)' : 'Catwalk: click the END') + esc;
    else if (mode.kind === 'remove') label = 'Remove: click a building, conveyor or catwalk (full refund)' + esc;
    el.textContent = label;
  }
}
function toggleBuild(force) {
  const m = $('buildMenu'), show = force ?? m.classList.contains('hidden');
  if (show && S.flying) return toast('Land your ship first');
  if (show) { mode = null; updateModeBar(); $('inventory').classList.add('hidden'); closeBox(); renderBuildMenu(); m.classList.remove('hidden'); } else m.classList.add('hidden');
}
function chooseBuild(t) {
  if (!unlocked(t)) return toast('🔒 Locked — research ' + tierLabel(DEF[t].tier) + ' first');
  if (!canAfford(DEF[t].cost)) return toast('Need: ' + Object.entries(DEF[t].cost).map(([k, v]) => `${v} ${recipeNeedLabel(k)}`).join(', '));
  setMode(t === 'conveyor' || t === 'conveyor2' || t === 'catwalk' ? { kind: t, p1: null } : { kind: 'build', type: t });
}
function toggleHelp(force) {
  const hidden = $('help').classList.toggle('hidden', force);
  try { localStorage.setItem(SAVE_KEY + '-help', hidden ? '0' : '1'); } catch (e) { /* ignore */ }
}
function renderHelp() {
  try { if (localStorage.getItem(SAVE_KEY + '-help') === '0') $('help').classList.add('hidden'); } catch (e) { /* ignore */ }
  $('help').innerHTML = `<b>Controls</b><br>
  <b>A/D</b> or ←/→ walk · <b>Space/W</b> jump<br>
  <b>Click</b> tree = chop · Red Dust rock = Magma · ground = dig · goop = hit (loot goes to your backpack)<br>
  <b>Magma</b> fills Frost · <b>Heatsteel</b> fills Cobalt · <b>Ice or Stone</b> fills Dirt (*). Stone costs still need Stone. Refunds return what you spent.<br>
  ❄ Pines are timber; crystal trees drop Frost and a little Wood. 🔥 Wood debris is Red Dust only.<br>
  <b>Click</b> a Chest / Sorter / Assembler / Lab to open it<br>
  <b>Research Lab:</b> Feed Gear / Circuit / Frame into any of the four ports<br>
  <b>Click</b> a machine's cube to pick it up · <b>E</b> grab nearby<br>
  <b>I</b>/<b>Tab</b> backpack · <b>Q</b> drop selected item<br>
  <b>Click a ⚡ node</b>, then another node = power line<br>
  <b>B</b> build menu · <b>R</b> flip while placing · <b>X</b> remove · <b>Right-click</b> = remove · <b>Touch: hold</b> ~0.5s = remove<br>
  <b>F</b> board ship · <b>W/↑</b> thrust · <b>A/D</b> turn · <b>F</b> land<br>
  <b>Wheel</b> zoom · <b>H</b> hide help<br>
  <span style="opacity:.7">Progress: iron → Assembler → Research Levels → Corvette (Level 4) → Red Dust.<br>❄ Ice Moon: ship/Lamp. 🔥 Red Dust: Corvette + Cooler. Better ores harvest slower.</span><br>
  <button id="saveBtn" tabindex="-1">💾 Save <kbd>Ctrl+S</kbd></button> <button id="resetBtn" tabindex="-1">New game</button>`;
  $('saveBtn').onclick = () => { if (DEMO) return toast('Demo mode does not save'); save(true); };
  $('resetBtn').onclick = () => { if (confirm('Start a new game? Your progress will be lost.')) { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } S = newState(); saveSoon(); bullets = []; fx = []; setMode(null); toggleInv(false); uiDirty = true; updateCamera(0, true); } };
}


// ---------- input ----------
function clearHold() {
  if (hold && hold.timer) clearTimeout(hold.timer);
  hold = null;
}
function finishHoldDelete() {
  if (!hold || hold.done || hold.cancelled) return;
  hold.done = true;
  const mx = hold.wx, my = hold.wy;
  if (!mode && !S.flying && deletableAt(mx, my)) {
    removeAt(mx, my);
    try { navigator.vibrate?.(35); } catch (e) { /* ignore */ }
  }
  if (hold) { clearTimeout(hold.timer); hold.timer = null; }
}
function drawHoldTarget() {
  if (!hold || hold.cancelled || hold.done || !hold.canDelete) return;
  const mx = hold.wx, my = hold.wy;
  const b = buildingAt(mx, my);
  if (b) {
    ctx.save(); frame(b.a, b.r0);
    rr(-DEF[b.type].hw - 4, -DEF[b.type].h, DEF[b.type].hw * 2 + 8, DEF[b.type].h + 6, 6, null, '#ff5a6e', 3);
    ctx.restore(); return;
  }
  const c = conveyorAt(mx, my);
  if (c) { ctx.beginPath(); ctx.moveTo(c.x1, c.y1); ctx.lineTo(c.x2, c.y2); ctx.strokeStyle = '#ff5a6e'; ctx.lineWidth = 5; ctx.stroke(); return; }
  const w = catwalkAt(mx, my);
  if (w) { ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.strokeStyle = '#ff5a6e'; ctx.lineWidth = 5; ctx.stroke(); return; }
  const L = linkAt(mx, my);
  if (L) {
    const a = S.buildings.find(bb => bb.id === L[0]), b2 = S.buildings.find(bb => bb.id === L[1]);
    if (a && b2) {
      const p1 = bWorld(a, nodeOf(a)), p2 = bWorld(b2, nodeOf(b2));
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
      ctx.strokeStyle = '#ff5a6e'; ctx.lineWidth = 4; ctx.stroke();
    }
  }
}
function drawHoldRing() {
  if (!hold || hold.cancelled || hold.done || !hold.canDelete) return;
  const p = clamp((performance.now() - hold.t0) / HOLD_MS, 0, 1), x = hold.x, y = hold.y, R0 = 22;
  ctx.beginPath(); ctx.arc(x, y, R0, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff33'; ctx.lineWidth = 4; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, R0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
  ctx.strokeStyle = '#ff5a6e'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
}
function bindAntiZoom() {
  // iOS Safari ignores user-scalable — block pinch gestures + double-tap page zoom
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(ev, e => e.preventDefault(), { passive: false });
  }
  let lastTouchEnd = 0;
  document.addEventListener('touchend', e => {
    const now = performance.now();
    if (now - lastTouchEnd < 300) {
      e.preventDefault();
      // rapid UI taps still need a click (preventDefault can swallow the synthetic one)
      const el = e.target && e.target.closest && e.target.closest('button, .card, .btab, .islot, #selChip, #flipBuildBtn, #modeCancel, a, [role="button"]');
      if (el && !el.disabled) {
        try { el.click(); } catch (err) { /* ignore */ }
      }
    }
    lastTouchEnd = now;
  }, { passive: false });
}
function bindInput() {
  bindAntiZoom();
  addEventListener('resize', () => { resize(); if (mode) updateModeBar(); });
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); if (DEMO) toast('Demo mode does not save'); else save(true); return; }
    if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) { keys[e.code] = true; return; }
    keys[e.code] = true;
    if (e.code.startsWith('Digit')) { const i = +e.code.slice(5) - 1; if (i >= 0 && i < ITEMS.length) { S.selType = ITEMS[i]; uiDirty = true; } }
    else if (e.code === 'KeyI' || e.code === 'Tab') toggleInv();
    else if (e.code === 'KeyR' && mode && mode.kind === 'build') togglePlaceFlip();
    else if (e.code === 'KeyF') S.flying ? tryLand() : tryBoard();
    else if (e.code === 'KeyQ') dropSelected();
    else if (e.code === 'KeyE') grabNearby();
    else if (e.code === 'KeyB') toggleBuild();
    else if (e.code === 'KeyL' && !S.flying) setMode(mode && mode.kind === 'link' ? null : { kind: 'link', from: null });
    else if (e.code === 'KeyX' && !S.flying) setMode(mode && mode.kind === 'remove' ? null : { kind: 'remove' });
    else if (e.code === 'KeyH') toggleHelp();
    else if (e.code === 'Escape') { setMode(null); toggleBuild(false); toggleInv(false); closeBox(); }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  cv.style.touchAction = 'none';
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointermove', e => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = e.pointerType === 'mouse' || !!hold;
    if (hold && e.pointerId === hold.id && !hold.done && !hold.cancelled) {
      if (Math.hypot(e.clientX - hold.sx, e.clientY - hold.sy) > HOLD_MOVE) {
        hold.cancelled = true;
        if (hold.timer) { clearTimeout(hold.timer); hold.timer = null; }
      } else {
        hold.x = e.clientX; hold.y = e.clientY;
      }
    }
  });
  cv.addEventListener('pointerleave', () => { mouse.in = false; });
  cv.addEventListener('pointerdown', e => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    $('buildMenu').classList.add('hidden');
    if (e.button === 2) { secondary(); return; }
    if (e.button !== 0) return;
    // second finger / pinch → cancel any hold
    if (hold && e.pointerId !== hold.id) { hold.cancelled = true; if (hold.timer) clearTimeout(hold.timer); hold.timer = null; return; }
    // desktop mouse: keep instant click
    if (e.pointerType === 'mouse') { primary(); return; }
    // touch / pen: press-and-hold to delete, short tap = normal action
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const [wx, wy] = screenToWorld(e.clientX, e.clientY);
    clearHold();
    hold = {
      id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
      wx, wy,
      t0: performance.now(), done: false, cancelled: false,
      canDelete: !mode && !S.flying && deletableAt(wx, wy),
      timer: null,
    };
    if (hold.canDelete) hold.timer = setTimeout(finishHoldDelete, HOLD_MS);
  });
  cv.addEventListener('pointerup', e => {
    if (!hold || e.pointerId !== hold.id) return;
    const h = hold;
    clearHold();
    if (!h.done && !h.cancelled) {
      mouse.x = h.x; mouse.y = h.y;
      primary();
    }
  });
  cv.addEventListener('pointercancel', e => {
    if (hold && e.pointerId === hold.id) clearHold();
  });
  cv.addEventListener('wheel', e => { e.preventDefault(); cam.userZoom = clamp(cam.userZoom * (e.deltaY > 0 ? .9 : 1.1), .5, 2.2); }, { passive: false });
  $('buildBtn').onclick = () => toggleBuild();
  $('flipBuildBtn').onclick = () => togglePlaceFlip();
  $('helpBtn').onclick = () => { toggleHelp(); $('help').classList.toggle('open'); };
  $('bagBtn').onclick = () => toggleInv();
  $('selChip').onclick = () => toggleInv(true);
  $('actBtn').onclick = () => (S.flying ? tryLand() : tryBoard());
  $('inventory').addEventListener('click', e => {
    if (e.target.closest('#invClose')) return toggleInv(false);
    if (e.target.closest('#dropBtn')) return dropSelected();
    const sl = e.target.closest('.islot[data-t]'); if (sl) { S.selType = sl.dataset.t; uiDirty = true; }
  });
  $('box').addEventListener('click', e => {
    const b = boxB; if (!b) return;
    if (e.target.closest('#boxClose')) return closeBox();
    const tk = e.target.closest('[data-take]');
    if (tk && b.store) { const k = tk.dataset.take, n = b.store[k] || 0; if (n) { S.inv[k] += n; delete b.store[k]; S.selType = k; toast(`Took ${n} ${INAME[k]}`); } }
    if (e.target.closest('#putBtn')) {
      const k = S.selType;
      if (b.type === 'assembler') {
        const r = RECIPES[b.pick], slot = slotOf(r, k);
        if (r && slot && S.inv[k] > 0) {
          b.buf = b.buf || {};
          if (bufCount(b, slot) >= bufCap(r, slot)) toast(`${recipeNeedLabel(slot)} buffer full`);
          else { b.buf[k] = (b.buf[k] || 0) + 1; S.inv[k]--; toast(`+1 ${INAME[k]} into Assembler`); }
        }
      } else if (b.store) { let n = 0; while (S.inv[k] > 0 && chestAdd(b, k)) { S.inv[k]--; n++; } if (n) toast(`Stored ${n} ${INAME[k]}`); }
    }
    const rk = e.target.closest('[data-recipe]');
    if (rk && b.type === 'assembler') { b.pick = rk.dataset.recipe; b.timer = 0; toast('Recipe: ' + RECIPES[b.pick].desc); }
    const pk = e.target.closest('[data-pick]');
    if (pk) b.pick = pk.dataset.pick || null;
    if (e.target.closest('#flipBtn')) { b.dir = -(b.dir || 1); b.flip = b.dir; toast('Sorter flipped — re-lay its belts'); }
    uiDirty = true; saveSoon(); renderBox();
  });
  $('buildMenu').addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]'); if (tab) return setBuildTab(+tab.dataset.tab);
    const c = e.target.closest('.card[data-t]'); if (c) return chooseBuild(c.dataset.t);
    const t = e.target.closest('[data-tool]'); if (t) setMode({ kind: 'remove' });
  });
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    $('touch').classList.remove('hidden');
    $('touch').querySelectorAll('button').forEach(b => {
      const k = b.dataset.k;
      b.addEventListener('pointerdown', e => { e.preventDefault(); touch[k] = true; });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, () => { touch[k] = false; }));
    });
  }
  addEventListener('beforeunload', () => save());
  addEventListener('pagehide', () => save());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
}

// ---------- demo scene (for screenshots / testing: ?demo=1) ----------
function seedDemo() {
  const top = -Math.PI / 2;
  S.trees = S.trees.filter(t => Math.abs(angDiff(top, t.a)) > .6);
  Object.assign(S.inv, { wood: 14, dirt: 9, stone: 6, iron: 3, jelly: 2 });
  Object.keys(S.goals).forEach(k => delete S.goals[k]);
  ['chop', 'dig', 'pick', 'drill'].forEach(k => S.goals[k] = true);
  for (let i = 0; i < 4; i++) S.dug[segOf(top + .52 + i * TAU / NSEG)] = 1 + (i % 2);
  const gen = placeBuilding('generator', top - .5, R);
  const drill = placeBuilding('drill', top - .36, R);
  const furn = placeBuilding('furnace', top - .08, R);
  const tur = placeBuilding('turret', top + .28, R);
  const gen2 = placeBuilding('generator', top + .42, R);
  const [dx, dy] = bWorld(drill, outOf(drill)), [ix, iy] = bWorld(furn, inOf(furn));
  S.conveyors.push({ id: S.nextId++, x1: dx, y1: dy, x2: ix, y2: iy });
  const [ox, oy] = bWorld(furn, outOf(furn)), oa = Math.atan2(oy, ox) + 70 / R, [ex, ey] = clampAbove(Math.cos(oa) * R, Math.sin(oa) * R);
  S.conveyors.push({ id: S.nextId++, x1: ox, y1: oy, x2: ex, y2: ey });
  S.links.push([gen.id, drill.id], [drill.id, furn.id], [gen2.id, tur.id]);
  S.player.x = Math.cos(top + .08) * R; S.player.y = Math.sin(top + .08) * R;
  S.goops = [newGoop(top + .62), newGoop(top + .78), newGoop(top - .9)];
  spawnItem('wood', ...toWorld(top - .2, R, 0, -30));
  spawnItem('dirt', ...toWorld(top - .22, R, 0, -40));
}

// ---------- main ----------
let last = 0, saveT = 0;
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000 || 0); last = now;
  step(dt);
  render();
  if (uiDirty) renderUI();
  requestAnimationFrame(loop);
}
let hpShown = -1;
let actShown = '';
function updateAct() {
  let st = '';
  if (S.flying) st = canLand() ? 'land' : 'fly';
  else if (nearShip()) st = 'board';
  if (st === actShown) return;
  actShown = st;
  const b = $('actBtn');
  b.classList.toggle('hidden', !st); b.classList.toggle('dim', st === 'fly');
  b.innerHTML = st === 'board' ? '🚀 Board ship <kbd>F</kbd>' : st === 'land' ? '🛬 Land <kbd>F</kbd>' : '🛬 Slow down near the ground to land';
  document.body.classList.toggle('flying', !!S.flying);
  $('jumpBtn').textContent = S.flying ? '🔥' : '▲';
}
let tempShown = '';
function updateTempHud() {
  const p = S.player, show = harsh(), t = Math.round(p.temp), isHot = hot();
  const key = show + ':' + t + ':' + p.warm + ':' + S.flying + ':' + isHot;
  if (key === tempShown) return;
  tempShown = key;
  const el = $('temp'); el.classList.toggle('hidden', !show); el.classList.toggle('hot', isHot);
  if (!show) return;
  const fill = isHot ? (100 - t) : t;
  el.querySelector('i').style.width = fill + '%';
  el.classList.toggle('low', isHot ? fill > 65 : t < 35); el.classList.toggle('zero', t <= 0);
  const ico = el.querySelector('span'); if (ico) ico.textContent = isHot ? '🔥' : '🌡';
  el.querySelector('b').textContent = t <= 0
    ? (isHot ? 'Overheating!' : 'Freezing!')
    : S.flying || p.warm
      ? (t < 100 ? (isHot ? 'Cooling' : 'Warming') : (isHot ? 'Cool' : 'Warm'))
      : (isHot ? (fill > 65 ? 'Hot!' : 'Heating') : (t < 35 ? 'Cold!' : 'Cooling'));
}
function step(dt) {
  update(dt); updateCamera(dt); updateAct();
  if (S.player.hp !== hpShown) { hpShown = S.player.hp; uiDirty = true; }
  updateTempHud();
  if (boxB) { const [cx, cy] = playerCenter(); if (S.flying || !S.buildings.includes(boxB) || dist(cx, cy, ...bWorld(boxB, [0, -14])) > REACH + 140) closeBox(); }
  if (savePending || (saveT += dt) > 4) { saveT = 0; savePending = false; save(); }
}
function init() {
  resize();
  S = load() || newState();
  if (DEMO) seedDemo();
  ensureShip();
  bindInput(); renderHelp(); renderUI(); updateFlipBtn(); updateCamera(0, true);
  if (loadedFromSave) setTimeout(() => toast('💾 Welcome back! Your progress was loaded.'), 400);
  else if (!DEMO) setTimeout(() => toast('Welcome! Chop trees and dig dirt to build a Drill.'), 400);
  // test hooks
  window.PF = { get S() { return S; }, DEF, RECIPES, TIERS, PLANETS, unlocked, hasTier, shipKind, shipStats, hot, cold, goalsList, goalsMap, GRADE, HOLD_MS, LAB_IN, LAB_PARTS, labPorts, ALT_FOR, LEGACY_COST, SMELT, slotOf, bufCount, bufHas, bufTake, recipeNeedLabel, invCount, canAfford, pay, planCost, altTypes, refundOf, deliver, assemblerPorts, AIR_BUILD, bushAt, debrisAt, paintMat, ensureMatIcons, MAT_URL, ITEMS, ICOL, INAME, removeAt, deletableAt, get hold() { return hold; }, get placeFlip() { return placeFlip; }, set placeFlip(v) { placeFlip = v === -1 ? -1 : 1; updateFlipBtn(); }, facing, flipP, outOf, inOf, nodeOf, togglePlaceFlip, step: n => { for (let i = 0; i < n; i++) step(1 / 60); }, primaryAt: (wx, wy) => { const [sx, sy] = worldToScreen(wx, wy); mouse.x = sx; mouse.y = sy; primary(); }, setMode, render, toast, save, load,
    api: { belt: (x1, y1, x2, y2) => { setMode({ kind: 'conveyor' }); conveyorClick(x1, y1); conveyorClick(x2, y2); setMode(null); }, catwalk: (x1, y1, x2, y2) => { setMode({ kind: 'catwalk' }); catwalkClick(x1, y1); catwalkClick(x2, y2); setMode(null); }, belt2: (x1, y1, x2, y2) => { setMode({ kind: 'conveyor2' }); conveyorClick(x1, y1); conveyorClick(x2, y2); setMode(null); }, setResearch: (n, v=true) => { S.research[n] = !!v; uiDirty = true; }, linkClick: (a, b) => { setMode({ kind: 'link' }); linkClick(...bWorld(a, nodeOf(a))); linkClick(...bWorld(b, nodeOf(b))); setMode(null); }, switchPlanet, openBox, closeBox, chestAdd, chestTotal, isWarm, die, tryPlace: (t, wx, wy) => { setMode({ kind: 'build', type: t }); tryPlace(wx, wy); }, placeBuilding, dockShip, tryBoard, tryLand, toggleInv, toggleBuild, keys, touch, bWorld, NODE, mouse, worldToScreen, cam, goal, setUiDirty: () => { uiDirty = true; } } };
  requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
}
init();
})();
