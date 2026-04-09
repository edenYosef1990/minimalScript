# edenScript ECS Language Specification (v1)

## Overview

edenScript is a minimal, game-oriented scripting language designed for building small 2D games inside a browser.

The language is based on the Entity Component System (ECS) architecture:
- Entities = game objects
- Components = data
- Systems = behavior

Core principle:
All behavior lives in systems. Entities are just data.

---

## Core Concepts

### Entities

Entities are defined by their components:

entity Player:
  position (4, 5)
  sprite "player.png"
  health 20

---

### Components

Components are pure data:

position (x, y)
velocity (x, y)
sprite "file.png"
health 100
collider solid
tag player

---

### Systems

Systems define all behavior:

system Move:
  run every frame
  select entity with position, velocity
  entity.position += entity.velocity

---

### Resources

Global state:

resource gravity = (0, 10)
resource score = 0

---

## Execution Model

Game loop:

while running:
  process input
  run systems
  resolve collisions
  render

---

## Syntax

### Entity

entity <Name>:
  <components>

---

### System

system <Name>:
  run <condition>
  select entity with <components>
  <logic>

---

## System Types

run every frame
run every 4s
run on collision
run on spawn

---

## Actions

Modify:
entity.health -= 5

Spawn:
spawn Enemy:
  position (5, 5)

Delete:
delete entity

---

## Example

entity Player:
  position (4, 5)
  velocity (0, 0)
  sprite "player.png"
  health 20
  tag player

system Input:
  run every frame
  select entity with position, tag player
  if key W down: entity.position.y -= 1

system Move:
  run every frame
  select entity with position, velocity
  entity.position += entity.velocity

system SpawnEnemies:
  run every 4s
  spawn Enemy:
    position randomFree
    tag enemy

system Collision:
  run on collision
  when bullet hits enemy
  enemy.health -= 5
  delete bullet

---

## Summary

- ECS-based
- unified logic via systems
- minimal syntax
