# EdenScript Desktop Sandbox

EdenScript Desktop Sandbox is a small Angular + Electron app for experimenting with `edenscript`, a toy ECS-style language for tiny 2D games.

The app gives you:
- a Monaco-based editor with a VS Code-like feel
- compile diagnostics for the supported EdenScript subset
- a live Canvas 2D preview pane
- desktop file open/save and local asset picking through Electron

## EdenScript In One Minute

EdenScript is built around the Entity Component System model:
- entities are game objects
- components are data attached to those objects
- systems are the logic that updates them
- resources are global values shared across the game

Core rule: entities hold data, while systems hold behavior.

### Basic Shape

```eden
resource score = 0

entity Player:
  position (80, 100)
  velocity (0, 0)
  sprite "assets/sprites/player.svg"
  health 20
  tag player

system Move:
  run every frame
  select entity with position, velocity
  entity.position += entity.velocity
```

## Language Concepts

### Entities

Entities declare named game objects and their starting components.

```eden
entity Player:
  position (4, 5)
  sprite "player.png"
  health 20
```

### Components

Components are plain data values. Common examples:

```eden
position (x, y)
velocity (x, y)
sprite "file.png"
health 100
collider solid
tag player
```

### Systems

Systems contain the behavior of the game.

```eden
system Move:
  run every frame
  select entity with position, velocity
  entity.position += entity.velocity
```

### Resources

Resources hold global state.

```eden
resource gravity = (0, 10)
resource score = 0
```

## Supported In This App

The current sandbox supports this EdenScript subset:
- `entity`
- `resource`
- `system`
- `run every frame`
- `run every Ns`
- `run on collision` parsing with warning-only diagnostics
- `select entity with ...`
- component values as numbers, strings, vectors, and identifiers
- mutations like `=`, `+=`, `-=`
- entity field references like `entity.position.x`
- simple keyboard checks like `if key W down: ...`
- `spawn`
- `delete entity`

Current preview limitations:
- collision systems are parsed but not executed
- `run on spawn` is not implemented
- the runtime is intentionally small and aimed at toy scenes, not full game-engine behavior

## Examples

### Player Movement

```eden
entity Player:
  position (120, 120)
  velocity (0, 0)
  tag player

system Input:
  run every frame
  select entity with position, tag
  if key W down: entity.position.y -= 2
  if key S down: entity.position.y += 2
  if key A down: entity.position.x -= 2
  if key D down: entity.position.x += 2
```

### Timed Enemy Spawn

```eden
entity Enemy:
  position (300, 40)
  velocity (-1, 1)
  tag enemy

system SpawnEnemies:
  run every 4s
  spawn Enemy:
    position (340, 40)
    velocity (-1, 1)
```

### Simple Movement System

```eden
entity Bullet:
  position (30, 30)
  velocity (4, 0)

system Move:
  run every frame
  select entity with position, velocity
  entity.position += entity.velocity
```

### Parsed But Not Executed Yet

This syntax is recognized and surfaced with warnings, but collision gameplay is not active in the preview runtime yet:

```eden
system Collision:
  run on collision
  when bullet hits enemy
  delete entity
```

## Running The App

### Requirements

- Windows with Node.js installed
- npm available as `npm.cmd`

The project currently builds successfully with the installed toolchain in this repo, but for longer-term stability an LTS Node release is a better choice than an odd-numbered release.

### Install Dependencies

```powershell
npm.cmd install
```

### Start The Desktop App

This builds the Angular app and then opens Electron:

```powershell
npm.cmd start
```

### Build Only

```powershell
npm.cmd run build
```

The production build output is written to `dist/eden-script-desktop`.

### Run Tests

```powershell
npm.cmd run test
```

## Using The Sandbox

1. Start the app with `npm.cmd start`.
2. Load the bundled sample or paste your own EdenScript into the editor.
3. Click `Run`.
4. Watch diagnostics in the lower-left panel.
5. Play the compiled scene in the preview pane on the right.
6. Use `Pick Asset` to insert a local sprite path into the current script.

## Project Structure

- `edenScript_spec.md`: original language notes/spec
- `src/app/eden-script`: parser, sample code, and language types
- `src/app/services`: file bridge helpers, compiler service, runtime service
- `src/app/components`: Monaco editor wrapper
- `electron`: Electron main process and preload bridge

## Notes

- The README describes both the language idea and the subset the current app actually runs.
- If you expand the language later, update both `edenScript_spec.md` and this README so the docs stay aligned.
