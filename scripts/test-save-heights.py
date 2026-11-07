#!/usr/bin/env python3
"""Regression: building r0 survives save/load; Red Dust not clamped to home R.
Usage: python3 scripts/test-save-heights.py   # expects http://localhost:8799
"""
import asyncio, json, sys
from playwright.async_api import async_playwright
B = 'http://localhost:8799/'
KEY = 'planet-factory-v1'
res = []
def ok(c, m):
    res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + m, flush=True)

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch()
        pg = await br.new_page(viewport={'width': 1280, 'height': 720})
        await pg.goto(B); await pg.wait_for_timeout(200)

        fix = await pg.evaluate("""(KEY) => {
          const PR = 1020, dug = Array(144).fill(0);
          const buildings = [
            {id:1,type:'chest',a:-Math.PI/2,r0:540,flip:1,store:{}},
            {id:2,type:'generator',a:-Math.PI/2+0.1,r0:500,flip:1},
            {id:3,type:'furnace',a:-Math.PI/2+0.2,r0:540,flip:1,q:[]},
            {id:4,type:'drill',a:-Math.PI/2+0.3,r0:PR,flip:1},
            {id:5,type:'splitter',a:-Math.PI/2+0.15,r0:540,flip:1,dir:1},
          ];
          const a = -Math.PI/2, r = PR + 80;
          const belts = [{id:10,x1:Math.cos(a)*r,y1:Math.sin(a)*r,x2:Math.cos(a+0.05)*r,y2:Math.sin(a+0.05)*r,spd:2}];
          const inv = {}; for (const k of Object.keys(PF.S.inv)) inv[k] = 0;
          localStorage.setItem(KEY, JSON.stringify({
            v:1,t:0,planet:'home',
            worlds:{dust:{dug,trees:[],bushes:[],debris:[],items:[],buildings,conveyors:belts,catwalks:[],links:[],goops:[],goopTimer:10}},
            dug:Array(144).fill(0),trees:[],bushes:[],debris:[],items:[],buildings:[],conveyors:[],catwalks:[],links:[],goops:[],goopTimer:10,
            nextId:20,player:{x:0,y:-340,vx:0,vy:0,hp:10,inv:0,facing:1,anim:0,swing:0,cool:0,ground:true,regen:0,temp:100,freeze:0,warm:true},
            inv,selType:'wood',goals:{},research:{1:true,2:true,3:true,4:true},dustGoals:{},ship:null,flying:false
          }));
          const L = PF.load(), w = L.worlds.dust;
          return {v:L.v, allAbove:w.buildings.every(b => b.r0 >= PR - 1), beltSpd:w.conveyors[0].spd,
            chest:w.buildings.find(b => b.type === 'chest').r0};
        }""", KEY)
        ok(fix['allAbove'] and fix['v'] >= 2 and fix['beltSpd'] == 2 and fix['chest'] >= 1099, 'dust corruption auto-repaired')

        await pg.goto(B + '?fresh=1'); await pg.wait_for_timeout(200)
        await pg.evaluate("""() => {
          PF.api.setResearch(3); Object.assign(PF.S.inv,{iron:80,gear:40,wood:80,stone:40,dirt:40});
          PF.S.trees=[]; PF.S.bushes=[]; PF.S.buildings=[]; PF.S.conveyors=[];
          const R = PF.PLANETS.home.r, a = -Math.PI/2;
          PF.api.placeBuilding('splitter', a, R+90);
          PF.api.placeBuilding('generator', a-0.15, R+55);
          PF.api.placeBuilding('drill', a+0.2, R);
          PF.save(); window.__snap = PF.S.buildings.map(b => ({id:b.id,type:b.type,r0:b.r0,a:b.a}));
        }""")
        snap = await pg.evaluate('() => window.__snap')
        await pg.goto(B); await pg.wait_for_timeout(350)
        home = await pg.evaluate("""(snap) => {
          const after = PF.S.buildings.map(b => ({id:b.id,type:b.type,r0:b.r0,a:b.a}));
          return snap.every(b => { const x = after.find(y => y.id === b.id); return x && Math.abs(x.r0-b.r0)<0.01 && Math.abs(x.a-b.a)<1e-9; });
        }""", snap)
        ok(home, 'home save→reload identical')

        await pg.goto(B + '?fresh=1'); await pg.wait_for_timeout(200)
        await pg.evaluate("""() => {
          PF.api.setResearch(4); Object.assign(PF.S.inv,{iron:200,wood:200,stone:200,dirt:200,cobalt:50,frame:50,circuit:50,jelly:50,gear:50});
          const port = PF.api.placeBuilding('corvetteport', -Math.PI/2, PF.PLANETS.home.r);
          PF.api.dockShip(port, 'corvette'); PF.S.flying = true; PF.api.switchPlanet('dust');
          PF.S.buildings = []; PF.S.conveyors = [];
          const PR = PF.PLANETS.dust.r; let aa = -Math.PI/2; const placed = [];
          for (const [t,h] of [['chest',80],['generator',60],['furnace',90],['splitter',100],['drill',0]]) {
            const b = PF.api.placeBuilding(t, aa, PR+h); placed.push({type:t,r0:b.r0}); aa += 0.1;
          }
          PF.save(); window.__dust = placed;
        }""")
        placed = await pg.evaluate('() => window.__dust')
        await pg.goto(B); await pg.wait_for_timeout(400)
        dust = await pg.evaluate("""(placed) => {
          const PR = PF.PLANETS.dust.r;
          const builds = PF.S.planet === 'dust' ? PF.S.buildings : (PF.S.worlds.dust || {}).buildings || [];
          const by = Object.fromEntries(builds.map(b => [b.type, b.r0]));
          return {noneBelow: !!(builds.length && builds.every(b => b.r0 >= PR - 30)),
                  match: placed.every(p => Math.abs((by[p.type] ?? -1) - p.r0) < 0.5)};
        }""", placed)
        ok(dust['noneBelow'] and dust['match'], 'dust heights preserved')

        old = await pg.evaluate("""(KEY) => {
          const R = 340, a = -Math.PI/2, dug = Array(144).fill(0); dug[0] = 2;
          const buildings = [{id:1,type:'furnace',a,r0:R+70,flip:1,q:[]},{id:4,type:'generator',a:a-0.15,r0:R+40,flip:1}];
          const inv = {}; for (const k of Object.keys(PF.S.inv)) inv[k] = 5;
          localStorage.setItem(KEY, JSON.stringify({v:1,t:10,planet:'home',worlds:{},dug,trees:[],bushes:[],debris:[],items:[],buildings,conveyors:[],catwalks:[],links:[],goops:[],goopTimer:10,
            nextId:10,player:{x:0,y:-R,vx:0,vy:0,hp:10,inv:0,facing:1,anim:0,swing:0,cool:0,ground:true,regen:0,temp:100,freeze:0,warm:true},
            inv,selType:'wood',goals:{},research:{1:true,2:true,3:true,4:false},dustGoals:{},ship:null,flying:false}));
          const L = PF.load();
          return {fur:L.buildings.find(b=>b.type==='furnace').r0, gen:L.buildings.find(b=>b.type==='generator').r0, v:L.v};
        }""", KEY)
        ok(old['fur'] == 410 and old['gen'] == 380 and old['v'] >= 2, 'old v1 elevated kept')

        await br.close()
    print('ALL PASS' if all(res) else f'SOME FAIL {sum(res)}/{len(res)}')
    sys.exit(0 if all(res) else 1)

asyncio.run(main())
