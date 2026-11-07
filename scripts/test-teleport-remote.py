#!/usr/bin/env python3
"""Teleport Chest vault and off-planet factory simulation.
Usage: python3 scripts/test-teleport-remote.py   # expects http://localhost:8799
"""
import asyncio, sys
from playwright.async_api import async_playwright

B = 'http://localhost:8799/?fresh=1'
KEY = 'planet-factory-v1'
res = []

def ok(c, m):
    res.append(bool(c))
    print(('PASS ' if c else 'FAIL ') + m, flush=True)

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch()
        pg = await br.new_page(viewport={'width': 1280, 'height': 720})
        await pg.goto(B)
        await pg.wait_for_timeout(200)

        base = await pg.evaluate("""() => {
          const PF = window.PF;
          PF.api.setResearch(1);
          PF.S.trees = []; PF.S.bushes = []; PF.S.buildings = []; PF.S.links = []; PF.S.items = []; PF.S.conveyors = [];
          const R = PF.PLANETS.home.r, a = -Math.PI / 2;
          const gen = PF.api.placeBuilding('generator', a - 0.12, R);
          const drill = PF.api.placeBuilding('drill', a, R);
          const furn = PF.api.placeBuilding('furnace', a + 0.12, R);
          const chest = PF.api.placeBuilding('chest', a + 0.24, R);
          PF.api.linkClick(gen, drill);
          PF.api.linkClick(gen, furn);
          const belt = (b1, p1, b2, p2) => {
            const [x1, y1] = PF.api.bWorld(b1, p1);
            const [x2, y2] = PF.api.bWorld(b2, p2);
            PF.S.conveyors.push({ id: PF.S.nextId++, x1, y1, x2, y2 });
          };
          belt(drill, PF.outOf(drill), furn, PF.inOf(furn));
          belt(furn, PF.outOf(furn), chest, [0, -14]);
          const snap = { drill: drill.r0, furn: furn.r0, chest: chest.r0, chestId: chest.id, links: PF.S.links.length, powered: false };
          PF.step(5);
          snap.powered = !!(drill.powered && furn.powered);
          return snap;
        }""")
        ok(base['powered'] and base['links'] == 2, f"home chain is powered before travel {base}")

        remote = await pg.evaluate("""() => {
          const PF = window.PF;
          const chestId = PF.S.buildings.find(b => b.type === 'chest').id;
          const before = (PF.S.buildings.find(b => b.id === chestId).store || {}).iron || 0;
          const r0 = PF.S.buildings.find(b => b.id === chestId).r0;
          PF.api.switchPlanet('ice');
          PF.step(60 * 40);
          const home = PF.S.worlds.home;
          const chest = home.buildings.find(b => b.id === chestId);
          const iron = (chest.store && chest.store.iron) || 0;
          const queued = (home.buildings.find(b => b.type === 'furnace').q || []).length;
          const loose = home.items.filter(it => it.type === 'iron' || it.type === 'stone').length;
          return {
            planet: PF.S.planet, iron, before, r0: chest.r0, r0same: chest.r0 === r0,
            queued, loose, iceBuildings: PF.S.buildings.length,
            homeR: PF.PLANETS.home.r, iceR: PF.PLANETS.ice.r,
            itemFar: home.items.some(it => Math.hypot(it.x, it.y) > PF.PLANETS.home.r + 250),
          };
        }""")
        ok(remote['planet'] == 'ice' and remote['iron'] > remote['before'] and remote['r0same'] and remote['iceBuildings'] == 0 and not remote['itemFar'],
           f"powered remote drill→furnace→chest keeps running {remote}")

        blocked = await pg.evaluate("""() => {
          const PF = window.PF;
          PF.api.switchPlanet('home');
          PF.S.links = [];
          PF.S.items = [];
          const chest = PF.S.buildings.find(b => b.type === 'chest');
          const furn = PF.S.buildings.find(b => b.type === 'furnace');
          const drill = PF.S.buildings.find(b => b.type === 'drill');
          chest.store = {}; furn.q = []; drill.timer = 0; drill.nextOre = null; furn.timer = 0;
          PF.api.switchPlanet('ice');
          PF.step(60 * 20);
          const home = PF.S.worlds.home;
          const c = home.buildings.find(b => b.type === 'chest');
          const f = home.buildings.find(b => b.type === 'furnace');
          const d = home.buildings.find(b => b.type === 'drill');
          return {
            iron: (c.store && c.store.iron) || 0,
            q: (f.q || []).length,
            timer: d.timer || 0,
            powered: !!d.powered,
            loose: home.items.length,
          };
        }""")
        ok(blocked['iron'] == 0 and blocked['q'] == 0 and blocked['loose'] == 0 and blocked['timer'] == 0 and not blocked['powered'],
           f"no-power remote chain produces nothing {blocked}")

        buffers = await pg.evaluate("""() => {
          const PF = window.PF;
          PF.api.switchPlanet('home');
          const furn = PF.S.buildings.find(b => b.type === 'furnace');
          const chest = PF.S.buildings.find(b => b.type === 'chest');
          furn.q = Array(8).fill('stone');
          const [ix, iy] = PF.api.bWorld(furn, PF.inOf(furn));
          const blockedOre = PF.deliver({ type: 'stone' }, ix, iy, 40);
          chest.store = { wood: PF.CHEST_CAP };
          const [cx, cy] = PF.api.bWorld(chest, [0, -14]);
          const blockedChest = PF.deliver({ type: 'iron' }, cx, cy, 40);
          const ender = PF.api.placeBuilding('ender', -Math.PI / 2 + 0.7, PF.PLANETS.home.r + 40, -1);
          for (let i = 0; i < PF.ENDER_CAP; i++) PF.api.chestAdd(ender, 'stone');
          const over = PF.api.chestAdd(ender, 'stone');
          const [ex, ey] = PF.api.bWorld(ender, [0, -14]);
          const blockedEnder = PF.deliver({ type: 'iron' }, ex, ey, 40);
          return {
            blockedOre, q: furn.q.length,
            blockedChest, chestN: PF.api.chestTotal(chest),
            over, enderN: PF.api.chestTotal(ender), blockedEnder,
            flip: ender.flip, lift: ender.r0 - PF.PLANETS.home.r,
          };
        }""")
        ok(buffers['blockedOre'] == 'block' and buffers['q'] == 8 and buffers['blockedChest'] == 'block' and buffers['chestN'] == 60
           and buffers['over'] is False and buffers['enderN'] == 120 and buffers['blockedEnder'] == 'block'
           and buffers['flip'] == -1 and buffers['lift'] > 30,
           f"full furnace, chest, and teleport vault block without deleting {buffers}")

        shared = await pg.evaluate("""() => {
          const PF = window.PF;
          PF.api.switchPlanet('home');
          PF.S.buildings = PF.S.buildings.filter(b => b.type !== 'ender');
          PF.S.ender = {};
          const a = -Math.PI / 2 + 1.1, R = PF.PLANETS.home.r;
          const plainA = PF.api.placeBuilding('chest', a, R);
          const plainB = PF.api.placeBuilding('chest', a + 0.2, R);
          PF.api.chestAdd(plainA, 'wood'); PF.api.chestAdd(plainA, 'wood'); PF.api.chestAdd(plainA, 'wood');
          const homeE = PF.api.placeBuilding('ender', a + 0.45, R + 50, -1);
          PF.S.inv.iron = 4; PF.S.selType = 'iron';
          PF.api.openBox(homeE);
          document.querySelector('#putBtn').click();
          const afterPut = PF.api.chestTotal(homeE);
          PF.api.switchPlanet('ice');
          const iceE = PF.api.placeBuilding('ender', -Math.PI / 2, PF.PLANETS.ice.r + 30, 1);
          PF.api.openBox(iceE);
          const ui = document.querySelector('#box').innerText;
          document.querySelector('[data-take="iron"]').click();
          const left = PF.ensureEnder().iron || 0;
          PF.api.switchPlanet('home');
          const homeLeft = PF.api.chestTotal(PF.S.buildings.find(b => b.id === homeE.id));
          const plainSplit = (plainA.store.wood || 0) === 3 && !((plainB.store || {}).wood);
          const copied = !!PF.S.worlds.ice && !!PF.S.worlds.ice.ender;
          return { afterPut, ui, left, homeLeft, plainSplit, copied, iceFlip: iceE.flip, homeLift: homeE.r0 > R + 20 };
        }""")
        ok(shared['afterPut'] == 4 and '120' in shared['ui'] and 'shared' in shared['ui'] and shared['left'] == 0 and shared['homeLeft'] == 0
           and shared['plainSplit'] and not shared['copied'] and shared['homeLift'],
           f"shared hand vault crosses planets; ordinary chests stay private {shared}")

        belts = await pg.evaluate("""() => {
          const PF = window.PF;
          PF.api.switchPlanet('home');
          PF.S.buildings = PF.S.buildings.filter(b => b.type === 'ender' || b.type === 'chest' && false);
          PF.S.buildings = PF.S.buildings.filter(b => b.type === 'ender');
          PF.S.links = []; PF.S.items = []; PF.S.conveyors = [];
          PF.S.ender = { iron: 6 };
          const R = PF.PLANETS.home.r, a = -Math.PI / 2;
          const ender = PF.S.buildings.find(b => b.type === 'ender') || PF.api.placeBuilding('ender', a, R);
          ender.a = a; ender.r0 = R;
          const un = PF.api.placeBuilding('unloader', a + 0.06, R);
          un.timer = 0; un.pick = 'iron';
          PF.api.switchPlanet('ice');
          const iceE = PF.S.buildings.find(b => b.type === 'ender') || PF.api.placeBuilding('ender', -Math.PI / 2 + 0.4, PF.PLANETS.ice.r);
          const iceU = PF.api.placeBuilding('unloader', iceE.a + 0.06, iceE.r0);
          iceU.timer = 0; iceU.pick = 'iron';
          PF.api.switchPlanet('home');
          const homeU = PF.S.buildings.find(b => b.type === 'unloader');
          homeU.timer = 0;
          PF.S.ender = { iron: 1 };
          PF.S.items = [];
          if (PF.S.worlds.ice) PF.S.worlds.ice.items = [];
          PF.step(60 * 3);
          const homeIron = PF.S.items.filter(it => it.type === 'iron').length;
          const iceIron = ((PF.S.worlds.ice && PF.S.worlds.ice.items) || []).filter(it => it.type === 'iron').length;
          const left = PF.ensureEnder().iron || 0;
          // belt insert from the other planet into the same vault
          PF.api.switchPlanet('ice');
          const e2 = PF.S.buildings.find(b => b.type === 'ender');
          const [x, y] = PF.api.bWorld(e2, [0, -14]);
          const ins = PF.deliver({ type: 'gear' }, x, y, 40);
          PF.api.switchPlanet('home');
          const gear = PF.ensureEnder().gear || 0;
          return { left, homeIron, iceIron, ins, gear, cap: PF.api.chestTotal(PF.S.buildings.find(b => b.type === 'ender')) };
        }""")
        ok(belts['left'] == 0 and belts['homeIron'] == 1 and belts['iceIron'] == 0 and belts['ins'] == 'take' and belts['gear'] == 1,
           f"active planet wins one shared pull; the other planet can still insert {belts}")

        safety = await pg.evaluate("""() => {
          const PF = window.PF;
          PF.api.switchPlanet('home');
          const b = PF.S.buildings.find(x => x.type === 'ender');
          PF.S.ender = { iron: 10, gear: 3 };
          PF.S.inv = Object.fromEntries(PF.ITEMS.map(k => [k, 0]));
          b.paid = { iron: 4, gear: 2, stone: 2 };
          b.store = { iron: 99 };
          const [x, y] = PF.api.bWorld(b, [0, -10]);
          PF.removeAt(x, y);
          const afterRemove = Object.assign({}, PF.ensureEnder());
          const inv = Object.assign({}, PF.S.inv);
          const again = PF.api.placeBuilding('ender', b.a, b.r0, b.flip);
          const still = PF.api.chestTotal(again);
          PF.api.switchPlanet('ice');
          const also = PF.api.chestTotal(PF.S.buildings.find(x => x.type === 'ender'));
          return { afterRemove, inv, still, also, gone: !PF.S.worlds.home.buildings.some(x => x.id === b.id) };
        }""")
        ok(safety['afterRemove'].get('iron') == 10 and safety['afterRemove'].get('gear') == 3
           and safety['inv'].get('iron') == 4 and safety['inv'].get('gear') == 2 and safety['inv'].get('stone') == 2
           and not safety['inv'].get('wood') and safety['still'] == 13 and safety['also'] == 13 and safety['gone'],
           f"removing a teleport chest refunds the building only {safety}")

        iso = await pg.evaluate("""() => {
          const PF = window.PF;
          PF.api.switchPlanet('dust');
          PF.S.buildings = []; PF.S.links = []; PF.S.items = []; PF.S.conveyors = [];
          const PR = PF.PLANETS.dust.r, a = -Math.PI / 2 + 0.4;
          const gen = PF.api.placeBuilding('generator2', a - 0.05, PR);
          const drill = PF.api.placeBuilding('drill2', a, PR);
          const lifted = PF.api.placeBuilding('furnace', a + 0.3, PR + 90, -1);
          PF.api.linkClick(gen, drill);
          const r0 = drill.r0;
          const lift = lifted.r0;
          const liftFlip = lifted.flip;
          const goops = PF.S.goops.length, timer = PF.S.goopTimer;
          PF.api.switchPlanet('home');
          const homeDug = PF.S.dug[0];
          PF.S.dug[0] = 2;
          PF.step(60 * 25);
          const dust = PF.S.worlds.dust;
          const d = dust.buildings.find(b => b.type === 'drill2');
          const furn = dust.buildings.find(b => b.type === 'furnace');
          const ores = {};
          for (const it of dust.items) ores[it.type] = (ores[it.type] || 0) + 1;
          const far = dust.items.filter(it => Math.hypot(it.x, it.y) > 800).length;
          const near = dust.items.filter(it => Math.hypot(it.x, it.y) < 500).length;
          return {
            r0: d.r0, same: Math.abs(d.r0 - r0) < 0.001, lift: furn.r0, liftSame: Math.abs(furn.r0 - lift) < 0.001, liftFlip: furn.flip === liftFlip, ores, far, near,
            goops: dust.goops.length, timer: dust.goopTimer, goops0: goops, timer0: timer,
            homeDug: PF.S.dug[0], dustDug0: dust.dug[0], planet: PF.S.planet,
            homeHasDrill: PF.S.buildings.some(b => b.type === 'drill2'),
          };
        }""")
        ok(iso['same'] and iso['r0'] > 1000 and iso['liftSame'] and iso['lift'] > 1100 and iso['liftFlip'] and iso['far'] > 0 and iso['near'] == 0 and iso['ores'].get('rdust', 0) > 0
           and iso['goops'] == iso['goops0'] and iso['timer'] == iso['timer0'] and iso['dustDug0'] != 2
           and iso['planet'] == 'home' and not iso['homeHasDrill'],
           f"dust keeps its radius, ores, and paused goops while home runs {iso}")

        clock = await pg.evaluate("""() => {
          const PF = window.PF;
          PF.api.switchPlanet('home');
          PF.S.buildings = []; PF.S.links = []; PF.S.items = []; PF.S.conveyors = [];
          const R = PF.PLANETS.home.r;
          const gen = PF.api.placeBuilding('generator', -Math.PI / 2, R);
          const drill = PF.api.placeBuilding('drill', -Math.PI / 2 + 0.05, R);
          PF.api.linkClick(gen, drill);
          drill.timer = 0; drill.nextOre = 'stone';
          const once = () => { const t0 = drill.timer; PF.stepDt(5); return drill.timer - t0; };
          const big = once();
          drill.timer = 0; drill.nextOre = 'stone';
          PF.step(300);
          const small = drill.timer;
          PF.api.switchPlanet('ice');
          const remote = PF.S.worlds.home.buildings.find(b => b.type === 'drill');
          const t1 = remote.timer || 0;
          PF.stepDt(5);
          const remoteDt = (remote.timer || 0) - t1;
          const ms0 = performance.now();
          PF.step(300);
          const ms = performance.now() - ms0;
          return { big, small, remoteDt, ms, items: (PF.S.worlds.home.items || []).length };
        }""")
        ok(abs(clock['big'] - 5) < 1e-6 and abs(clock['small'] - 5) < 1e-4 and abs(clock['remoteDt'] - 5) < 1e-6
           and clock['ms'] < 2500 and clock['items'] <= 220,
           f"timestep matches across frame sizes and remote worlds stay cheap {clock}")

        mats = await pg.evaluate("""() => {
          const PF = window.PF;
          PF.ensureMatIcons();
          const zoom0 = PF.api.cam.userZoom;
          PF.step(20);
          PF.api.switchPlanet('ice');
          const zoom1 = PF.api.cam.userZoom;
          document.querySelector('#c').dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
          return {
            n: PF.ITEMS.length,
            icons: PF.ITEMS.filter(k => PF.MAT_URL[k]).length,
            zoom0, zoom1, zoom2: PF.api.cam.userZoom,
            help: document.querySelector('#help').innerText,
            cost: PF.DEF.ender.cost, tier: PF.DEF.ender.tier, cap: PF.ENDER_CAP, demand: PF.DEF.ender.demand || 0,
          };
        }""")
        ok(mats['n'] == 17 and mats['icons'] == 17 and mats['zoom0'] == mats['zoom1'] and mats['zoom2'] > mats['zoom1'] and mats['zoom2'] <= 2.2
           and mats['cost'].get('iron') == 4 and mats['cost'].get('gear') == 2 and mats['cost'].get('stone') == 2
           and mats['tier'] == 1 and mats['cap'] == 120 and mats['demand'] == 0
           and 'Teleport Chest' in mats['help'] and 'Red Dust only' in mats['help'] and 'Heatsteel' in mats['help']
           and 'do not spawn' in mats['help'],
           f"textures, zoom, price, and help stay intact { {k: mats[k] for k in ['n','icons','zoom0','zoom1','zoom2','tier','cap','demand']} }")

        away = await pg.evaluate("""() => {
          const PF = window.PF;
          PF.api.setResearch(1);
          PF.api.switchPlanet('dust');
          PF.S.ender = { frost: 8 };
          PF.S.buildings = []; PF.S.links = []; PF.S.items = []; PF.S.conveyors = [];
          const port = PF.api.placeBuilding('ender', -Math.PI / 2, PF.PLANETS.dust.r + 60, 1);
          const r0 = port.r0;
          PF.api.switchPlanet('ice');
          PF.S.buildings = []; PF.S.links = [];
          PF.save();
          const raw = JSON.parse(localStorage.getItem('planet-factory-v1'));
          const dustB = raw.worlds.dust.buildings.find(b => b.type === 'ender');
          return {
            planet: raw.planet, frost: raw.ender.frost, worldHasVault: !!raw.worlds.dust.ender,
            buildingStore: dustB.store, r0: dustB.r0, savedR0: r0, flying: raw.flying,
          };
        }""")
        ok(away['planet'] == 'ice' and away['frost'] == 8 and not away['worldHasVault'] and away['buildingStore'] is None and away['r0'] == away['savedR0'],
           f"save while away keeps one global vault {away}")
        await pg.goto('http://localhost:8799/')
        await pg.wait_for_timeout(250)
        back = await pg.evaluate("""() => {
          const dust = PF.S.worlds.dust;
          const b = dust.buildings.find(x => x.type === 'ender');
          return { planet: PF.S.planet, frost: PF.ensureEnder().frost || 0, r0: b.r0, store: b.store || null };
        }""")
        ok(back['planet'] == 'ice' and back['frost'] == 8 and back['r0'] == away['r0'] and back['store'] is None,
           f"reload while away restores the vault and the dust chest height {back}")

        # old save: no vault field, elevated dust building must not move, no free items.
        # Set storage before the document loads so the live page cannot overwrite it on the way out.
        old_raw = """{"v":3,"t":4,"planet":"dust","worlds":{},"dug":[%s],"trees":[],"bushes":[],"debris":[],"items":[],"buildings":[{"id":7,"type":"furnace","a":-1.5707963267948966,"r0":1090,"flip":-1,"q":[]}],"conveyors":[],"catwalks":[],"links":[],"goops":[],"goopTimer":10,"nextId":8,"player":{"x":0,"y":-1020,"vx":0,"vy":0,"hp":10,"inv":0,"facing":1,"anim":0,"swing":0,"cool":0,"ground":true,"regen":0,"temp":100,"freeze":0,"warm":true},"inv":{"wood":1},"selType":"wood","goals":{},"research":{"1":true,"2":false,"3":false,"4":false},"dustGoals":{},"ship":null,"flying":false}""" % (','.join(['0'] * 144))
        ctx = await br.new_context(viewport={'width': 1280, 'height': 720})
        await ctx.add_init_script(f"localStorage.setItem({KEY!r}, {old_raw!r})")
        pg = await ctx.new_page()
        await pg.goto('http://localhost:8799/')
        await pg.wait_for_timeout(250)
        old = await pg.evaluate("""() => {
          const b = PF.S.buildings.find(x => x.type === 'furnace');
          const bag = PF.ensureEnder();
          return { r0: b.r0, flip: b.flip, v: PF.S.v, iron: bag.iron || 0, wood: PF.S.inv.wood, planet: PF.S.planet };
        }""")
        ok(old['r0'] == 1090 and old['flip'] == -1 and old['v'] >= 2 and old['iron'] == 0 and old['wood'] == 1 and old['planet'] == 'dust',
           f"old save loads an empty vault and does not move buildings {old}")

        await br.close()
    print('ALL PASS' if all(res) else f'SOME FAIL {sum(res)}/{len(res)}')
    sys.exit(0 if all(res) else 1)

asyncio.run(main())
