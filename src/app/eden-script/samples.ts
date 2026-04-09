export interface EdenSample {
  id: string;
  name: string;
  description: string;
  source: string;
}

export const EDEN_SAMPLES: EdenSample[] = [
  {
    id: 'arena-starter',
    name: 'Arena Starter',
    description: 'Move the player around and let a timed spawner keep introducing enemies.',
    source: `resource score = 0

entity Player:
  position (80, 100)
  velocity (0, 0)
  sprite "assets/sprites/player.svg"
  health 20
  tag player
  collider solid

entity Enemy:
  position (300, 160)
  velocity (-1, 0)
  sprite "assets/sprites/enemy.svg"
  health 10
  tag enemy
  collider solid

system Input:
  run every frame
  select entity with position, tag player
  if key W down: entity.position.y -= 2
  if key S down: entity.position.y += 2
  if key A down: entity.position.x -= 2
  if key D down: entity.position.x += 2

system Move:
  run every frame
  select entity with position, velocity
  entity.position += entity.velocity

system SpawnEnemies:
  run every 4s
  spawn Enemy:
    position (340, 40)
    velocity (-1, 1)
`
  }
];
