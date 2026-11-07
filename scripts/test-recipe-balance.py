#!/usr/bin/env python3
"""Per-planet recipe closure, substitute payments, machine inputs, refunds.
Usage: python3 scripts/test-recipe-balance.py   # expects http://localhost:8799
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

B = 'http://localhost:8799/?fresh=1'
res = []

def ok(c, m):
    res.append(bool(c))
    print(('PASS ' if c else 'FAIL ') + m, flush=True)

AUDIT_JS = r"""
() => {
  const PF = window.PF;
  const out = { labels: {}, slots: {}, closure: {}, digs: {}, chops: {}, debris: {}, ores: {}, pay: {}, machines: {}, ui: {}, legacy: {} };

  const zero = () => { for (const k of PF.ITEMS) PF.S.inv[k] = 0; };
  const snap = () => Object.fromEntries(PF.ITEMS.map(k => [k, PF.S.inv[k] || 0]));
  const same = (a, b) => PF.ITEMS.every(k => (a[k] || 0) === (b[k] || 0));
  const spendMap = (m) => Object.fromEntries(Object.entries(m || {}).filter(([, n]) => n));

  out.labels = {
    cobalt: PF.recipeNeedLabel('cobalt'),
    frost: PF.recipeNeedLabel('frost'),
    dirt: PF.recipeNeedLabel('dirt'),
    stone: PF.recipeNeedLabel('stone'),
    heatsteel: PF.recipeNeedLabel('heatsteel'),
    iron: PF.recipeNeedLabel('iron'),
    magma: PF.recipeNeedLabel('magma'),
  };
  const slot = (recipe, type) => PF.slotOf(PF.RECIPES[recipe], type);
  out.slots = {
    wireHeat: slot('wire', 'heatsteel'),
    wireCobalt: slot('wire', 'cobalt'),
    wireMagma: slot('wire', 'magma'),
    plateCobalt: slot('plating', 'cobalt'),
    plateHeat: slot('plating', 'heatsteel'),
    gearIron: slot('gear', 'iron'),
    gearHeat: slot('gear', 'heatsteel'),
    frameStone: slot('frame', 'stone'),
    frameDirt: slot('frame', 'dirt'),
  };

  const RENEW = {
    home: ['wood', 'jelly'],
    ice: ['wood', 'frost', 'jelly'],
    dust: ['wood', 'magma', 'jelly', 'ember'],
  };
  const DRILL = {
    home: ['stone'],
    ice: ['stone', 'coore'],
    dust: ['stone', 'rdust'],
  };
  const BOOT = {
    home: ['wood', 'dirt', 'jelly'],
    ice: ['wood', 'ice', 'dirt', 'frost', 'jelly'],
    dust: ['wood', 'dirt', 'stone', 'rdust', 'magma', 'jelly', 'ember'],
  };
  const BASIC = ['drill', 'generator', 'conveyor', 'catwalk', 'furnace', 'assembler', 'lab', 'chest', 'lamp', 'cooler', 'turret', 'filter', 'unloader', 'splitter', 'merger', 'conveyor2', 'shipport'];
  const ADV = ['drill2', 'generator2', 'corvetteport'];

  function close(start) {
    const have = new Set(start);
    const canFill = (k) => have.has(k) || PF.altTypes(k).some(a => have.has(a));
    let guard = 0, changed = true;
    while (changed && guard++ < 24) {
      changed = false;
      for (const [ore, bar] of Object.entries(PF.SMELT)) {
        if (have.has(ore) && !have.has(bar)) { have.add(bar); changed = true; }
      }
      for (const r of Object.values(PF.RECIPES)) {
        if (Object.keys(r.in).every(k => canFill(k)) && !have.has(r.out)) { have.add(r.out); changed = true; }
      }
    }
    return have;
  }
  function afford(have, cost) {
    const inv = {};
    for (const k of PF.ITEMS) inv[k] = have.has(k) ? 999 : 0;
    return PF.planCost(cost, t => inv[t] || 0).ok;
  }
  for (const id of ['home', 'ice', 'dust']) {
    const boot = close(BOOT[id]);
    const sustain = close(RENEW[id].concat(DRILL[id]));
    const row = { sustain: [...sustain].sort(), bootAfford: {}, sustainAfford: {}, adv: {} };
    for (const t of ['conveyor', 'catwalk', 'drill', 'generator']) row.bootAfford[t] = afford(close(BOOT[id]), PF.DEF[t].cost);
    row.bootFurnace = afford(close(BOOT[id]), PF.DEF.furnace.cost);
    row.bootLamp = afford(close(BOOT[id]), PF.DEF.lamp.cost);
    const afterStone = close(BOOT[id].concat(DRILL[id]));
    row.afterDrillFurnace = afford(afterStone, PF.DEF.furnace.cost);
    row.afterDrillLamp = afford(afterStone, PF.DEF.lamp.cost);
    const afterIron = new Set(afterStone); afterIron.add('iron');
    row.afterIronLamp = afford(afterIron, PF.DEF.lamp.cost);
    for (const t of BASIC) row.sustainAfford[t] = afford(sustain, PF.DEF[t].cost);
    for (const t of ADV) row.adv[t] = afford(sustain, PF.DEF[t].cost);
    row.plating = Object.keys(PF.RECIPES.plating.in).every(k => sustain.has(k) || PF.altTypes(k).some(a => sustain.has(a)));
    row.hasCircuit = sustain.has('circuit');
    row.hasWire = sustain.has('wire');
    row.hasCobalt = sustain.has('cobalt');
    row.hasHeatsteel = sustain.has('heatsteel');
    row.hasGear = sustain.has('gear');
    row.hasFrame = sustain.has('frame');
    row.hasIron = sustain.has('iron');
    out.closure[id] = row;
  }

  // --- dig layers (hand iron/stone chain) ---
  function angDist(a, b) {
    let d = Math.abs(a - b) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    return d;
  }
  function digAt(planet, layers) {
    PF.api.switchPlanet(planet);
    PF.setMode(null);
    let a = -Math.PI / 2 + 2.4;
    for (let i = 0; i < 144; i++) {
      const cand = (i + 0.5) / 144 * Math.PI * 2;
      const hit = (PF.S.trees || []).some(t => t.hp > 0 && angDist(t.a, cand) < 0.09)
        || (PF.S.bushes || []).some(b => angDist(b.a, cand) < 0.12)
        || (PF.S.debris || []).some(d => d.hp > 0 && angDist(d.a, cand) < 0.14)
        || (PF.S.buildings || []).some(b => angDist(b.a, cand) < 0.12);
      if (!hit) { a = cand; break; }
    }
    const seg = Math.floor((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 144) % 144;
    PF.S.dug[seg] = 0;
    const gained = [];
    for (let i = 0; i < layers; i++) {
      const PR = PF.PLANETS[planet].r;
      const sr = PR - (PF.S.dug[seg] || 0) * 9;
      PF.S.player.x = Math.cos(a) * sr; PF.S.player.y = Math.sin(a) * sr;
      PF.S.player.vx = PF.S.player.vy = 0; PF.S.player.cool = 0;
      const before = snap();
      PF.primaryAt(Math.cos(a) * (sr - 8), Math.sin(a) * (sr - 8));
      const g = {};
      for (const k of PF.ITEMS) if ((PF.S.inv[k] || 0) !== (before[k] || 0)) g[k] = PF.S.inv[k] - before[k];
      gained.push(g);
    }
    return gained;
  }
  zero();
  out.digs.home = digAt('home', 3);
  zero();
  out.digs.ice = digAt('ice', 3);
  zero();
  out.digs.dust = digAt('dust', 3);

  // --- ice wood ---
  function chop(kind) {
    PF.api.switchPlanet('ice');
    PF.setMode(null);
    const t = PF.S.trees.find(tr => tr.hp > 0 && (kind === 'pine' ? tr.kind === 'pine' : tr.kind !== 'pine'));
    if (!t) return { err: 'missing ' + kind };
    const a = t.a, sr = PF.PLANETS.ice.r - (PF.S.dug[Math.floor((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 144) % 144] || 0) * 9;
    PF.S.player.x = Math.cos(a) * sr; PF.S.player.y = Math.sin(a) * sr;
    PF.S.player.vx = PF.S.player.vy = 0;
    zero();
    const wx = Math.cos(a) * (sr + 28), wy = Math.sin(a) * (sr + 28);
    for (let i = 0; i < 3; i++) { PF.S.player.cool = 0; PF.primaryAt(wx, wy); }
    return { hp: t.hp, wood: PF.S.inv.wood, frost: PF.S.inv.frost, kind: t.kind || 'crystal' };
  }
  out.chops.pine = chop('pine');
  out.chops.crystal = chop('crystal');

  // --- debris is red dust only, and it is wood ---
  function debrisLen(id) {
    if (PF.S.planet === id) return (PF.S.debris || []).length;
    const w = PF.S.worlds[id];
    return w && w.debris ? w.debris.length : 0;
  }
  PF.api.switchPlanet('home');
  const homeDeb = (PF.S.debris || []).length;
  PF.api.switchPlanet('ice');
  const iceDeb = (PF.S.debris || []).length;
  PF.api.switchPlanet('dust');
  const dustDeb = (PF.S.debris || []).length;
  const deb = (PF.S.debris || []).find(d => d.hp > 0);
  let debWood = null;
  if (deb) {
    const a = deb.a, sr = PF.PLANETS.dust.r;
    PF.S.player.x = Math.cos(a) * sr; PF.S.player.y = Math.sin(a) * sr;
    PF.S.player.cool = 0; zero();
    const wx = Math.cos(a) * (sr + 18), wy = Math.sin(a) * (sr + 18);
    PF.primaryAt(wx, wy); PF.S.player.cool = 0; PF.primaryAt(wx, wy);
    debWood = { hp: deb.hp, wood: PF.S.inv.wood, frost: PF.S.inv.frost, other: PF.ITEMS.filter(k => k !== 'wood' && PF.S.inv[k] > 0) };
  }
  PF.api.switchPlanet('home');
  out.debris = { home: homeDeb, ice: iceDeb, dust: dustDeb, homeAfter: (PF.S.debris || []).length, iceStored: debrisLen('ice'), dustStored: debrisLen('dust'), debWood };

  // --- drill ore sets (advanced drill, same table, shorter cycle) ---
  function sample(planet) {
    PF.api.switchPlanet(planet);
    PF.S.buildings = []; PF.S.links = []; PF.S.items = []; PF.S.conveyors = [];
    const R = PF.PLANETS[planet].r, a = -Math.PI / 2;
    const gen = PF.api.placeBuilding('generator', a, R);
    const drill = PF.api.placeBuilding('drill2', a + 0.02, R);
    PF.api.linkClick(gen, drill);
    const ores = {};
    for (let i = 0; i < 200; i++) {
      PF.step(30);
      for (const it of PF.S.items) ores[it.type] = (ores[it.type] || 0) + 1;
      if (PF.S.items.length > 24) PF.S.items.length = 0;
    }
    return { ores, powered: !!drill.powered, links: PF.S.links.length };
  }
  for (const id of ['home', 'ice', 'dust']) out.ores[id] = sample(id);

  // --- payments: primary, substitute, mixed, scarcity, no partial, no double count ---
  function fill(map) { zero(); Object.assign(PF.S.inv, map); }
  const cases = [];
  out.pay = { cases };
  function payCase(name, cost, inv, expectOk, expectSpent) {
    fill(inv);
    const before = snap();
    const plan = PF.planCost(cost, t => PF.S.inv[t] || 0);
    const spent = PF.pay(cost);
    const after = snap();
    cases.push({
      name, ok: plan.ok, spent: spendMap(spent), expectOk, expectSpent,
      untouched: !plan.ok ? same(before, after) : true,
      deducted: plan.ok ? PF.ITEMS.every(k => (before[k] || 0) - (after[k] || 0) === ((spent && spent[k]) || 0)) : true,
    });
  }
  payCase('drill2 primary', PF.DEF.drill2.cost,
    { stone: 8, frost: 6, cobalt: 4, circuit: 2, magma: 9, heatsteel: 9 },
    true, { stone: 8, frost: 6, cobalt: 4, circuit: 2 });
  payCase('drill2 substitutes only', PF.DEF.drill2.cost,
    { stone: 8, magma: 6, heatsteel: 4, circuit: 2 },
    true, { stone: 8, magma: 6, heatsteel: 4, circuit: 2 });
  payCase('drill2 mixed', PF.DEF.drill2.cost,
    { stone: 8, frost: 2, magma: 4, cobalt: 1, heatsteel: 3, circuit: 2 },
    true, { stone: 8, frost: 2, magma: 4, cobalt: 1, heatsteel: 3, circuit: 2 });
  payCase('drill2 short crystal', PF.DEF.drill2.cost,
    { stone: 8, frost: 2, magma: 3, cobalt: 4, circuit: 2 },
    false, null);
  payCase('furnace reserves stone', PF.DEF.furnace.cost, { stone: 6 }, false, null);
  payCase('furnace 7 stone fills dirt', PF.DEF.furnace.cost, { stone: 7 }, true, { stone: 7 });
  payCase('furnace stone+dirt not ice', PF.DEF.furnace.cost, { stone: 5, dirt: 2, ice: 9 }, true, { stone: 5, dirt: 2 });
  payCase('furnace stone+ice', PF.DEF.furnace.cost, { stone: 5, ice: 2 }, true, { stone: 5, ice: 2 });
  payCase('furnace dirt cannot fill stone', PF.DEF.furnace.cost, { stone: 4, dirt: 20 }, false, null);
  payCase('chest needs real stone', PF.DEF.chest.cost, { wood: 6, dirt: 10, ice: 10 }, false, null);
  payCase('chest stone+wood', PF.DEF.chest.cost, { wood: 6, stone: 2 }, true, { wood: 6, stone: 2 });
  payCase('sorter local gears', PF.DEF.filter.cost, { iron: 3, gear: 1 }, true, { iron: 3, gear: 1 });
  payCase('sorter frost does not replace gear', PF.DEF.filter.cost, { iron: 3, frost: 5, magma: 5 }, false, null);
  payCase('unloader no cobalt required', PF.DEF.unloader.cost, { iron: 2, gear: 2 }, true, { iron: 2, gear: 2 });
  payCase('corvette heatsteel', PF.DEF.corvetteport.cost,
    { heatsteel: 12, frame: 12, circuit: 10, iron: 20, jelly: 8 },
    true, { heatsteel: 12, frame: 12, circuit: 10, iron: 20, jelly: 8 });
  payCase('belt exact wood', PF.DEF.conveyor.cost, { wood: 2 }, true, { wood: 2 });

  // --- refund actual mix; legacy unpaid keeps the old catalog ---
  function hitRemove(b) {
    const [x, y] = PF.api.bWorld(b, [0, -16]);
    PF.removeAt(x, y);
  }
  PF.S.buildings = []; PF.S.links = []; PF.S.items = [];
  fill({ stone: 8, frost: 2, magma: 4, cobalt: 1, heatsteel: 3, circuit: 2 });
  const spent = PF.pay(PF.DEF.drill2.cost);
  const b = PF.api.placeBuilding('drill2', -Math.PI / 2, PF.PLANETS[PF.S.planet].r);
  b.paid = spent;
  zero();
  hitRemove(b);
  out.pay.refundMix = snap();
  out.pay.refundSpent = spendMap(spent);
  out.pay.stillThere = PF.S.buildings.some(x => x.id === b.id);

  zero();
  const old = PF.api.placeBuilding('drill2', -Math.PI / 2 + 0.4, PF.PLANETS[PF.S.planet].r);
  delete old.paid;
  hitRemove(old);
  out.legacy.drill2 = snap();

  zero();
  const oldU = PF.api.placeBuilding('unloader', -Math.PI / 2 + 0.6, PF.PLANETS[PF.S.planet].r + 40);
  delete oldU.paid;
  hitRemove(oldU);
  out.legacy.unloader = snap();

  // --- machine inputs and craft consumption (one machine at a time so ports cannot steal) ---
  PF.api.switchPlanet('home');
  PF.S.player.temp = 100;
  function boot(type) {
    PF.S.buildings = []; PF.S.links = []; PF.S.items = []; PF.S.conveyors = [];
    const R = PF.PLANETS.home.r, a = -Math.PI / 2;
    const gen = PF.api.placeBuilding('generator', a, R);
    const m = PF.api.placeBuilding(type, a + 0.04, R);
    PF.api.linkClick(gen, m);
    PF.step(1);
    return m;
  }
  function feed(machine, type, port) {
    const [x, y] = PF.api.bWorld(machine, port);
    return PF.deliver({ type, x, y }, x, y, 40);
  }
  const furn = boot('furnace');
  const fin = PF.inOf(furn);
  const furnaceIn = {};
  for (const t of ['stone', 'coore', 'rdust', 'iron', 'heatsteel', 'cobalt', 'dirt', 'wood', 'magma', 'frost']) {
    furnaceIn[t] = feed(furn, t, fin);
  }
  out.machines.furnaceQueue = (furn.q || []).slice();
  out.machines.furnaceIn = furnaceIn;
  out.machines.powered = { furn: !!furn.powered };
  const asm = boot('assembler');
  out.machines.powered.asm = !!asm.powered;

  asm.pick = 'wire';
  asm.buf = {};
  const ain = PF.inOf(asm);
  out.machines.wireCobalt = feed(asm, 'cobalt', ain);
  out.machines.wireHeat = feed(asm, 'heatsteel', ain);
  out.machines.wireThird = feed(asm, 'heatsteel', ain);
  out.machines.wireBuf = Object.assign({}, asm.buf);

  asm.buf = { cobalt: 1, heatsteel: 1 };
  asm.timer = 0;
  for (let i = 0; i < 130; i++) PF.step(1);
  out.machines.afterOneWire = { buf: Object.assign({}, asm.buf), wires: PF.S.items.filter(it => it.type === 'wire').length };

  asm.pick = 'plating';
  asm.buf = {};
  asm.timer = 0;
  out.machines.plateCobalt = feed(asm, 'cobalt', ain);
  out.machines.plateBufAfterCobalt = Object.assign({}, asm.buf);
  feed(asm, 'heatsteel', ain); feed(asm, 'heatsteel', ain); feed(asm, 'frame', ain);
  for (let i = 0; i < 280; i++) PF.step(1);
  out.machines.afterPlating = { buf: Object.assign({}, asm.buf), frames: PF.S.items.filter(it => it.type === 'frame').length };

  asm.pick = 'gear';
  asm.buf = {};
  out.machines.gearHeat = feed(asm, 'heatsteel', ain);
  out.machines.gearIron = feed(asm, 'iron', ain);

  // build menu: magma+heatsteel covers advanced drill; chip not marked short
  zero();
  Object.assign(PF.S.inv, { stone: 8, magma: 6, heatsteel: 4, circuit: 2 });
  for (const n of [1, 2, 3, 4]) PF.api.setResearch(n, true);
  const menu = document.getElementById('buildMenu');
  menu.classList.add('hidden');
  PF.api.toggleBuild(true);
  const tab2 = menu.querySelector('[data-tab="2"]');
  if (tab2) tab2.click();
  const card = menu.querySelector('.card[data-t="drill2"]');
  const frostChip = card ? card.querySelector('.chip.alt') : null;
  out.ui.drill2Class = card ? card.className : '';
  out.ui.drill2Title = card ? card.getAttribute('title') : '';
  out.ui.frostChip = frostChip ? frostChip.className : '';
  out.ui.help = document.getElementById('help').textContent;

  return out;
}
"""

def maps_equal(got, expect):
    if expect is None:
        return got in (None, {})
    return got == expect

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch()
        pg = await br.new_page(viewport={'width': 1280, 'height': 720})
        await pg.goto(B)
        await pg.wait_for_function('() => window.PF && window.PF.DEF')
        data = await pg.evaluate(AUDIT_JS)
        await br.close()

    L = data['labels']
    ok(L['cobalt'] == 'Cobalt Bar or Heatsteel', 'label cobalt accepts heatsteel only as alt text')
    ok(L['frost'] == 'Frost Crystal or Magma', 'label frost accepts magma')
    ok('Ice' in L['dirt'] and 'Stone' in L['dirt'] and L['dirt'].startswith('Dirt'), 'label dirt accepts ice and stone')
    ok(L['stone'] == 'Stone' and L['iron'] == 'Iron' and L['heatsteel'] == 'Heatsteel' and L['magma'] == 'Magma', 'stone/iron/heatsteel/magma are not interchangeable')

    S = data['slots']
    ok(S['wireHeat'] == 'cobalt' and S['wireCobalt'] == 'cobalt' and S['wireMagma'] is None, 'wire input accepts cobalt and heatsteel only')
    ok(S['plateCobalt'] is None and S['plateHeat'] == 'heatsteel', 'plating accepts heatsteel and rejects cobalt')
    ok(S['gearIron'] == 'iron' and S['gearHeat'] is None, 'gear accepts iron only')
    ok(S['frameStone'] == 'stone' and S['frameDirt'] is None, 'frame accepts stone, not dirt')

    for pid, row in data['closure'].items():
        bad_basic = [t for t, v in row['sustainAfford'].items() if not v]
        ok(not bad_basic and all(row['bootAfford'].values()),
           f'{pid} basic chain sustainable (boot {row["bootAfford"]} missing {bad_basic})')
        ok(row['hasIron'] and row['hasGear'] and row['hasFrame'], f'{pid} iron → gear and frame')
    home, ice, dust = data['closure']['home'], data['closure']['ice'], data['closure']['dust']
    ok(not home['bootFurnace'] and not ice['bootFurnace'] and dust['bootFurnace'], 'furnace needs stone; dust can dig it, home and ice cannot skip the drill')
    ok(home['afterDrillFurnace'] and ice['afterDrillFurnace'] and not home['bootLamp'] and not ice['bootLamp'] and home['afterDrillLamp'],
       'home/ice lamp waits until a drill can feed the furnace; the first drill does not need iron')
    ok(not home['adv']['drill2'] and not home['adv']['generator2'] and not home['adv']['corvetteport'], 'home advanced drill, generator, and corvette stay imports')
    ok(not home['hasCircuit'] and not home['hasWire'] and not home['hasCobalt'] and not home['hasHeatsteel'], 'home does not produce circuits or special metal')
    ok(all(ice['adv'].values()) and ice['hasCircuit'] and ice['hasCobalt'] and not ice['hasHeatsteel'] and not ice['plating'],
       'ice moon builds advanced machines and circuits locally; plating stays off-world')
    ok(all(dust['adv'].values()) and dust['hasCircuit'] and dust['hasHeatsteel'] and not dust['hasCobalt'] and dust['plating'],
       'red dust builds advanced machines via heatsteel and magma; plating included')

    ok(data['digs']['home'] == [{'dirt': 1}, {'dirt': 1}, {'dirt': 1}], f"home dig is dirt not stone {data['digs']['home']}")
    ok(data['digs']['ice'][0] == {'ice': 1} and data['digs']['ice'][1] == {'dirt': 1} and data['digs']['ice'][2] == {'dirt': 1},
       f"ice dig is ice then dirt {data['digs']['ice']}")
    ok(data['digs']['dust'] == [{'dirt': 1}, {'stone': 1}, {'rdust': 1}], f"dust dig is dirt, stone, red dust ore {data['digs']['dust']}")

    pine, cry = data['chops']['pine'], data['chops']['crystal']
    ok(pine.get('hp') == 0 and pine.get('wood') == 3 and pine.get('frost') == 0, f'ice pine is 3 wood {pine}')
    ok(cry.get('hp') == 0 and cry.get('frost') == 2 and cry.get('wood') == 1, f'ice crystal tree is 2 frost + 1 wood {cry}')

    D = data['debris']
    ok(D['home'] == 0 and D['ice'] == 0 and D['homeAfter'] == 0 and D['iceStored'] == 0 and D['dust'] >= 1 and D['dustStored'] >= 1,
       f"debris is red dust only {D}")
    w = D.get('debWood') or {}
    ok(w.get('hp') == 0 and w.get('wood', 0) >= 2 and w.get('frost') == 0 and not w.get('other'), f'debris yields wood only {w}')

    expect_ore = {'home': {'stone'}, 'ice': {'stone', 'coore'}, 'dust': {'stone', 'rdust'}}
    for pid, exp in expect_ore.items():
        got = data['ores'][pid]
        keys = set(got['ores'])
        ok(got['powered'] and got['links'] == 1 and keys == exp, f'{pid} drill ores {got}')

    for c in data['pay']['cases']:
        spent_ok = maps_equal(c['spent'] if c['expectOk'] else None, c['expectSpent'])
        ok(c['ok'] == c['expectOk'] and spent_ok and c['untouched'] and c['deducted'],
           f"pay {c['name']} got ok={c['ok']} spent={c['spent']}")
    ok(data['pay']['refundMix'] == data['pay']['refundSpent'] or
       all((data['pay']['refundMix'].get(k) or 0) == v for k, v in data['pay']['refundSpent'].items()) and
       all((data['pay']['refundMix'].get(k) or 0) == 0 for k in data['pay']['refundMix'] if k not in data['pay']['refundSpent']),
       f"mixed refund returns the spent stack {data['pay']['refundMix']} vs {data['pay']['refundSpent']}")
    leg = data['legacy']['drill2']
    ok(leg.get('ice') == 10 and leg.get('frost') == 6 and leg.get('cobalt') == 4 and leg.get('circuit') == 2 and not leg.get('stone'),
       f'unpaid legacy advanced drill refunds the old ice catalog {leg}')
    un = data['legacy']['unloader']
    ok(un.get('cobalt') == 2 and un.get('iron') == 2 and not un.get('gear'), f'unpaid legacy unloader refunds cobalt+iron {un}')

    M = data['machines']
    ok(M['furnaceIn']['stone'] == 'take' and M['furnaceIn']['coore'] == 'take' and M['furnaceIn']['rdust'] == 'take',
       f"furnace accepts the three ores {M['furnaceIn']}")
    ok(all(M['furnaceIn'][t] == 'no' for t in ['iron', 'heatsteel', 'cobalt', 'dirt', 'wood', 'magma', 'frost']),
       'furnace rejects bars and substitutes')
    ok(M['furnaceQueue'] == ['stone', 'coore', 'rdust'], f"furnace queue {M['furnaceQueue']}")
    ok(M['powered']['furn'] and M['powered']['asm'], 'generator powers furnace and assembler')
    ok(M['wireCobalt'] == 'take' and M['wireHeat'] == 'take' and M['wireThird'] == 'block', f"wire buffer caps at one craft pair {M['wireBuf']} third={M['wireThird']}")
    ok(M['wireBuf'].get('cobalt') == 1 and M['wireBuf'].get('heatsteel') == 1, f"wire stores the actual metals {M['wireBuf']}")
    one = M['afterOneWire']
    ok(one['wires'] >= 1 and one['buf'].get('cobalt', 0) == 0 and one['buf'].get('heatsteel') == 1,
       f'wire craft spends cobalt before heatsteel {one}')
    ok(M['plateCobalt'] == 'no' and not M['plateBufAfterCobalt'], f"plating rejects cobalt {M['plateCobalt']} {M['plateBufAfterCobalt']}")
    ok(M['afterPlating']['frames'] == 2 and not M['afterPlating']['buf'], f"plating crafts two frames from heatsteel {M['afterPlating']}")
    ok(M['gearHeat'] == 'no' and M['gearIron'] == 'take', 'gear input rejects heatsteel')

    ok('no' not in data['ui']['drill2Class'].split() and 'locked' not in data['ui']['drill2Class'].split(),
       f"build card affordable on substitutes {data['ui']['drill2Class']}")
    ok('Magma' in data['ui']['drill2Title'] and 'Heatsteel' in data['ui']['drill2Title'], 'build card names both substitutes')
    ok('bad' not in data['ui']['frostChip'].split() and 'alt' in data['ui']['frostChip'].split(), f"frost chip uses alt marker {data['ui']['frostChip']}")
    ok('Red Dust only' in data['ui']['help'] and 'Heatsteel' in data['ui']['help'], 'help states substitute rules and debris planet')

    print('ALL PASS' if all(res) else f'SOME FAIL {sum(res)}/{len(res)}')
    sys.exit(0 if all(res) else 1)

asyncio.run(main())
