# Planet Factory (v6)

2D side-view factory game on small round planets with Mario-Galaxy-style radial gravity.
Plain HTML + canvas + JS. **No build step**: deploy the repo root as a static site (Vercel zero-config works).

Run locally: `python3 -m http.server 8000` then open http://localhost:8000
- `?fresh=1` ignores the save, `?demo=1` loads a pre-built demo factory (not saved).

## Build menu (v6.3)
Tabbed panel: **Tier 1** (basics + sorter/unloader) and **Tier 2** (advanced machines + fast logistics). Locked cards stay greyed with a research note.

## Progression (v6)
Automate deeper production chains to unlock new buildings through **Research**:
1. Smelt **Iron** → build an **Assembler** → craft **Gears / Wire / Circuits / Frames**
2. Build a **Research Lab**, feed it parts (belt or hand) to unlock tiers
3. **Tier 1 Mechanics** (8 Gears) → Sorter, Unloader
4. **Tier 2 Electronics** (6 Circuits) → Advanced Drill & Advanced Generator (their recipes also need Circuits/Frames)
5. **Tier 3 Logistics** (4 Circuits + 4 Frames) → Fast Conveyor, Splitter, Merger

## Controls
**On foot:** A/D or ←/→ walk · Space/W jump · Click tree = chop, ground = dig, goop = hit ·
Click a machine's output cube to pick it up · Click a Chest / Sorter / Unloader / Assembler / Lab to open it · E grab nearby · 🎒 or I/Tab = backpack ·
Q drop · B build · X remove · Right-click = remove (refund) · Mouse wheel = zoom · H help · Esc cancel.

**Power lines:** click a ⚡ node on a Generator, then another machine's ⚡ node. L is a shortcut.

**Ship:** powered Basic Ship Port → F to board · W/↑ thrust · A/D turn · F to land.

## Ice Moon
Same as v5: own world state, temperature drain, drills mine stone + cobalt ore. Machines on other planets pause.

## Assembler recipes
| Recipe | Inputs | Output |
|---|---|---|
| Gear | 2 Iron | 1 Gear |
| Wire | 1 Cobalt Bar | 2 Wire |
| Circuit | 1 Gear + 2 Wire | 1 Circuit |
| Frame | 2 Iron + 1 Stone | 1 Frame |

## Builds
| Build | Cost | Notes |
|---|---|---|
| Drill | 4 wood, 4 dirt | uses 2 · cube every 9s |
| Generator | 3 wood, 3 dirt | makes 6 · 2 lines · ~120px |
| Conveyor | 2 wood | straight belt on legs |
| Catwalk | 2 wood | walkway; jump up through |
| Furnace | 5 stone, 2 dirt | stone→iron, ore→cobalt · **can hang in the air** |
| Assembler | 6 iron, 4 stone | uses 2 · pick a recipe · 1–2 belt inputs (buffers capped) · **can hang in the air** |
| Research Lab | 8 iron, 6 stone | uses 2 · unlocks tiers |
| Chest | 6 wood, 2 stone | holds 60 |
| Lamp | 2 iron, 2 wood | warm zone |
| Turret | 4 iron, 2 stone | uses 2 |
| Sorter ★T1 | 3 iron, 2 frost | picked → ✓, rest → ✕ · **can hang in the air** |
| Unloader ★T1 | 2 cobalt, 2 iron | next to Chest |
| Advanced Drill ★T2 | 10 ice, 6 frost, 4 cobalt, **2 circuit** | uses 3 · every 1.5s |
| Advanced Generator ★T2 | 12 ice, 6 frost, 6 cobalt, **2 circuit, 2 frame** | makes 16 · 6 lines · ~480px |
| Fast Conveyor ★T3 | 1 iron, 1 gear | 2× belt speed |
| Splitter ★T3 | 4 iron, 2 gear | alternate two outputs |
| Merger ★T3 | 4 iron, 2 gear | two inputs → one output |
| Basic Ship Port | 12 iron, 10 stone, 6 wood, 5 jelly | uses 2 |

★ = gated behind research. Old saves keep existing advanced machines and are granted matching research tiers.

Original sketch: `docs/sketch.jpg`. Screenshots: `shots/`.
