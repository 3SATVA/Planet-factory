# Planet Factory (v7.5)

Canonical source: https://github.com/3SATVA/Planet-factory

2D side-view factory on small round planets with radial gravity. Plain HTML + canvas + JS. No build step.

`game.js` is the source of truth for costs, recipes, and substitutes. Saves use `localStorage` key `planet-factory-v1` (`SAVE_VER` 3). Loading a save repairs a buried machine using that planet's real radius and does not move buildings that are already above the ground.

Run locally:

```bash
python3 -m http.server 8799
```

Open http://localhost:8799. `?fresh=1` ignores the save. `?demo=1` loads a pre-built demo and does not save.

Checks:

```bash
node --check game.js
python3 scripts/test-save-heights.py      # needs the server on port 8799
python3 scripts/test-recipe-balance.py    # same server
```

## Planets

Each planet keeps its own terrain, buildings, and belts. Research, inventory, and goals travel with you. Machines on planets you are not standing on are paused.

| Planet | Renewable by hand | Renewable from a Drill | Smelt |
|---|---|---|---|
| Home | Wood (trees), Jelly (goop) | Stone | Stone → Iron |
| Ice Moon | Wood (pines, plus 1 from each crystal tree), Frost (crystal trees and goop), Jelly | Stone, Cobalt Ore | Stone → Iron, Cobalt Ore → Cobalt |
| Red Dust | Wood (**debris only**), Magma (rocks), Jelly, rare Ember | Stone, Red Dust Ore | Stone → Iron, Red Dust Ore → Heatsteel |

Digging is finite crust, not a renewable supply:

- Home: Dirt, three layers.
- Ice Moon: Ice on the surface, then Dirt.
- Red Dust: Dirt, then Stone, then Red Dust Ore.

A Drill is the renewable Stone (and special ore) source. The first Drill is paid with hand materials: Wood plus Dirt, or Ice or Stone standing in for Dirt. Later Drills, Generators, and Furnaces can keep using Stone once the crust runs out.

Pines regrow on the Ice Moon and are the timber. Crystal trees drop 2 Frost and 1 Wood. Breakable wood debris exists only on Red Dust.

## Substitutes

One-way and 1:1. The game spends the primary first, then the substitute. A refund returns the stack you actually paid, not the catalog name.

| Primary cost | Also accepts | Does not accept |
|---|---|---|
| Cobalt | Heatsteel | — |
| Frost | Magma | — |
| Dirt | Ice, then Stone | — |
| Stone | — | Dirt, Ice |
| Heatsteel (Plating) | — | Cobalt |
| Iron, Wood, Gears, Circuits, Frames | — | other materials |

Costs that allow a substitute are marked `*` in the build menu. Stone never satisfies a Stone cost, so Iron still starts at a Drill and a Furnace. Heatsteel does not turn into Plating's inputs in reverse: Plating is the Red Dust frame upgrade (2 Heatsteel + 1 Frame → 2 Frames).

Bulk fill is exclusive. A Furnace asks for 5 Stone and 2 Dirt. Those 5 Stone are reserved first, so 6 Stone is not enough to cover both lines. 7 Stone is, or 5 Stone plus 2 Dirt or Ice.

## Research

Global, not per planet. Parts are fed into any Research Lab port.

| Level | Cost | Unlocks |
|---|---|---|
| 1 Mechanics | 16 Gears | Sorter, Unloader |
| 2 Electronics | 12 Circuits | Advanced Drill, Advanced Generator |
| 3 Logistics | 8 Circuits + 8 Frames | Fast Conveyor, Splitter, Merger |
| 4 Corvette | 15 Circuits + 15 Gears + 15 Frames | Corvette Port |

Circuits need Wire. Wire is 1 Cobalt or 1 Heatsteel → 2 Wire. Home does not produce either metal, so Levels 2–4 are researched after Ice Moon or Red Dust. Gears and Frames are iron-and-stone parts on every planet.

## Assembler

| Recipe | Inputs | Output |
|---|---|---|
| Gear | 2 Iron | 1 Gear |
| Wire | 1 Cobalt or Heatsteel | 2 Wire |
| Circuit | 1 Gear + 2 Wire | 1 Circuit |
| Frame | 2 Iron + 1 Stone | 1 Frame |
| Plating | 2 Heatsteel + 1 Frame | 2 Frames |

The Furnace accepts Stone, Cobalt Ore, and Red Dust Ore only. It does not accept bars or substitutes.

## Builds

| Build | Cost | Where the materials come from |
|---|---|---|
| Drill | 4 Wood, 4 Dirt* | Hand on every planet. Ice or Stone can fill Dirt. |
| Generator | 3 Wood, 3 Dirt* | Same. 6 power, 2 lines, ~120px. |
| Conveyor | 2 Wood | Renewable wood on every planet. |
| Catwalk | 2 Wood | Same. |
| Furnace | 5 Stone, 2 Dirt* | Stone from a Drill (or a Red Dust dig). |
| Assembler | 6 Iron, 4 Stone | Iron chain on every planet. |
| Research Lab | 8 Iron, 6 Stone | Same. |
| Chest | 6 Wood, 2 Stone | Same. Holds 60. |
| Lamp / Cooler | 2 Iron, 2 Wood | Warmth or cooling. No power. |
| Turret | 4 Iron, 2 Stone | Uses 2 power. |
| Sorter | 3 Iron, 1 Gear | Level 1. Local iron gear, not a crystal. |
| Unloader | 2 Iron, 2 Gears | Level 1. Sits next to a Chest. |
| Fast Conveyor | 1 Iron, 1 Gear | Level 3. 2× belt speed. |
| Splitter / Merger | 4 Iron, 2 Gears | Level 3. |
| Basic Ship Port | 12 Iron, 10 Stone, 6 Wood, 5 Jelly | Gunship. Jelly comes from goop on every planet. |
| Advanced Drill | 8 Stone, 6 Frost*, 4 Cobalt*, 2 Circuits | Level 2. Local on Ice Moon and Red Dust. |
| Advanced Generator | 8 Stone, 6 Frost*, 6 Cobalt*, 2 Circuits, 2 Frames | Level 2. 16 power, 6 lines, ~480px. |
| Corvette Port | 12 Cobalt*, 12 Frames, 10 Circuits, 20 Iron, 8 Jelly | Level 4. Enters Red Dust's atmosphere. |

`*` means the substitute column above. Power lines and power nodes have no material cost.

## What stays an import

These are intentional. They are not required to expand a basic factory.

- **Home, advanced machines and the Corvette.** Frost or Magma, Cobalt or Heatsteel, and Circuits. Home can make the stone, iron, gears, and frames. It cannot make the crystal or the special metal.
- **Home, research Levels 2–4.** Same Circuit chain.
- **Ice Moon, Plating and Heatsteel.** Red Dust ore and the reinforced-frame recipe stay on Red Dust. Cobalt does not craft Plating.
- **Red Dust, raw Cobalt and Frost.** Heatsteel and Magma fill those costs. The bars and crystals themselves are not produced there.
- **Ice blocks as a special part.** Ice is crust and a Dirt substitute. Advanced machines no longer spend a finite pile of Ice, so a Drill or Generator can be repeated.

Basic belts, splitters, mergers, power, storage, unloaders, drills, furnaces, and assemblers can be rebuilt from renewable local chains on Home, Ice Moon, and Red Dust. The first Drill never requires its own output.

## Controls

**On foot:** A/D or ←/→ walk · Space/W jump · Click a tree, debris, rock, ground, or goop · Click a machine cube to pick it up · Click a Chest, Sorter, Unloader, Assembler, or Lab to open it · E grab · I/Tab backpack · Q drop · B build · R flip while placing · X remove · Right-click remove · Touch: hold ~0.5s to remove · Wheel zoom · H help · Esc cancel.

**Power:** click a ⚡ node, then another node. L starts a link.

**Ship:** powered port → F to board · W/↑ thrust · A/D turn · F to land. Red Dust turns the gunship away; use a Corvette.
