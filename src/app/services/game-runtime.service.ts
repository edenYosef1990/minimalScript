import { Injectable, signal } from '@angular/core';

import {
  ComponentDefinition,
  Program,
  ReferenceExpression,
  RuntimeEntity,
  RuntimeValue,
  RuntimeVector,
  RuntimeWorldSummary,
  Statement,
  SystemDefinition,
  ValueExpression
} from '../eden-script/types';
import { EditorFileService } from './editor-file.service';

interface RuntimeSystemState {
  definition: SystemDefinition;
  accumulatorMs: number;
}

interface SpriteAssetState {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  image: HTMLImageElement | null;
}

@Injectable({
  providedIn: 'root'
})
export class GameRuntimeService {
  readonly status = signal('Idle');
  readonly logs = signal<string[]>(['Load a sample or script, then click Run.']);
  readonly worldSummary = signal<RuntimeWorldSummary>({
    entityCount: 0,
    runningSystems: 0,
    activeSprites: 0
  });

  private animationFrameId: number | null = null;
  private lastFrameTime = 0;
  private nextEntityId = 1;
  private entities: RuntimeEntity[] = [];
  private resources: Record<string, RuntimeValue> = {};
  private systems: RuntimeSystemState[] = [];
  private spriteCache = new Map<string, SpriteAssetState>();
  private teardownListeners: Array<() => void> = [];
  private currentCanvas: HTMLCanvasElement | null = null;
  private currentContext: CanvasRenderingContext2D | null = null;
  private entityDefinitions = new Map<string, ComponentDefinition[]>();
  private inputState = new Set<string>();

  constructor(private readonly editorFileService: EditorFileService) {}

  async start(program: Program, canvas: HTMLCanvasElement, currentFilePath?: string | null): Promise<void> {
    this.stop();

    this.currentCanvas = canvas;
    this.currentContext = canvas.getContext('2d');
    if (!this.currentContext) {
      this.status.set('Canvas context unavailable');
      this.appendLog('The preview canvas could not start because the 2D context is missing.');
      return;
    }

    this.entityDefinitions = new Map(
      program.entities.map((entity) => [entity.name, entity.components])
    );
    this.entities = program.entities.map((entity) => this.instantiateEntity(entity.name, entity.components));
    this.resources = Object.fromEntries(
      program.resources.map((resource) => [resource.name, this.evaluateValue(resource.value, undefined)])
    );
    this.systems = program.systems
      .filter((system) => system.trigger?.type !== 'collision')
      .map((definition) => ({ definition, accumulatorMs: 0 }));

    this.status.set('Running');
    this.logs.set([`Compiled ${program.entities.length} entities and ${program.systems.length} systems.`]);
    this.updateWorldSummary();
    this.attachInputListeners(canvas);

    await this.preloadSprites(currentFilePath ?? null);

    canvas.tabIndex = 0;
    canvas.focus();
    this.lastFrameTime = performance.now();

    const tick = (timestamp: number) => {
      const deltaMs = Math.min(timestamp - this.lastFrameTime, 32);
      this.lastFrameTime = timestamp;

      for (const system of this.systems) {
        this.runSystem(system, deltaMs);
      }

      this.entities = this.entities.filter((entity) => !entity.markedForDeletion);
      this.render();
      this.updateWorldSummary();
      this.animationFrameId = window.requestAnimationFrame(tick);
    };

    this.animationFrameId = window.requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.lastFrameTime = 0;
    this.entities = [];
    this.resources = {};
    this.systems = [];
    this.inputState.clear();
    this.teardownListeners.forEach((teardown) => teardown());
    this.teardownListeners = [];

    if (this.currentContext && this.currentCanvas) {
      this.currentContext.clearRect(0, 0, this.currentCanvas.width, this.currentCanvas.height);
    }

    this.status.set('Stopped');
    this.updateWorldSummary();
  }

  private instantiateEntity(name: string, components: ComponentDefinition[]): RuntimeEntity {
    return {
      id: this.nextEntityId++,
      name,
      components: Object.fromEntries(
        components.map((component) => [component.name, this.evaluateValue(component.value, undefined)])
      )
    };
  }

  private runSystem(systemState: RuntimeSystemState, deltaMs: number): void {
    const trigger = systemState.definition.trigger;
    if (!trigger) {
      return;
    }

    if (trigger.type === 'every-frame') {
      this.executeSystem(systemState.definition);
      return;
    }

    if (trigger.type === 'interval') {
      systemState.accumulatorMs += deltaMs;
      while (systemState.accumulatorMs >= trigger.seconds * 1000) {
        systemState.accumulatorMs -= trigger.seconds * 1000;
        this.executeSystem(systemState.definition);
      }
    }
  }

  private executeSystem(system: SystemDefinition): void {
    const targets = system.select?.length
      ? this.entities.filter((entity) => system.select!.every((componentName) => componentName in entity.components))
      : [undefined];

    for (const target of targets) {
      for (const statement of system.statements) {
        this.executeStatement(statement, target);
      }
    }
  }

  private executeStatement(statement: Statement, entity?: RuntimeEntity): void {
    if (statement.type === 'if-key-down') {
      if (this.inputState.has(statement.key.toUpperCase())) {
        this.executeStatement(statement.statement, entity);
      }
      return;
    }

    if (statement.type === 'delete-entity') {
      if (entity) {
        entity.markedForDeletion = true;
      }
      return;
    }

    if (statement.type === 'spawn') {
      const baseComponents = this.entityDefinitions.get(statement.entityName) ?? [];
      const runtimeEntity = this.instantiateEntity(statement.entityName, baseComponents);
      for (const component of statement.components) {
        runtimeEntity.components[component.name] = this.evaluateValue(component.value, entity);
      }
      this.entities.push(runtimeEntity);
      return;
    }

    if (statement.type === 'mutation') {
      const nextValue = this.evaluateValue(statement.expression, entity);
      this.applyMutation(statement.target, statement.operator, nextValue, entity);
    }
  }

  private applyMutation(
    target: ReferenceExpression,
    operator: '=' | '+=' | '-=',
    nextValue: RuntimeValue,
    entity?: RuntimeEntity
  ): void {
    const [base, ...path] = target.path;
    const targetRoot = base === 'entity' ? entity?.components : this.resources;
    if (!targetRoot) {
      return;
    }

    if (path.length === 0) {
      const current = targetRoot[base];
      targetRoot[base] = applyOperator(current, nextValue, operator);
      return;
    }

    let cursor: RuntimeValue | Record<string, RuntimeValue> = targetRoot;
    for (const part of path.slice(0, -1)) {
      if (!cursor || typeof cursor !== 'object' || !(part in cursor)) {
        return;
      }
      cursor = (cursor as Record<string, RuntimeValue>)[part];
    }

    if (!cursor || typeof cursor !== 'object') {
      return;
    }

    const leafKey = path[path.length - 1];
    const objectLeaf = cursor as Record<string, RuntimeValue>;
    objectLeaf[leafKey] = applyOperator(objectLeaf[leafKey], nextValue, operator);
  }

  private evaluateValue(expression: ValueExpression, entity?: RuntimeEntity): RuntimeValue {
    switch (expression.kind) {
      case 'number':
        return expression.value;
      case 'string':
        return expression.value;
      case 'identifier':
        return expression.value;
      case 'vector':
        return { x: expression.x, y: expression.y };
      case 'reference':
        return this.resolveReference(expression, entity);
    }
  }

  private resolveReference(reference: ReferenceExpression, entity?: RuntimeEntity): RuntimeValue {
    const [base, ...path] = reference.path;
    let value: RuntimeValue = base === 'entity'
      ? entity?.components[path[0] ?? '']
      : this.resources[base];

    const remainingPath = base === 'entity' ? path.slice(1) : path;
    for (const part of remainingPath) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as unknown as Record<string, RuntimeValue>)[part];
      } else {
        return undefined;
      }
    }

    return cloneRuntimeValue(value);
  }

  private render(): void {
    if (!this.currentContext || !this.currentCanvas) {
      return;
    }

    const ctx = this.currentContext;
    const canvas = this.currentCanvas;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackdrop(ctx, canvas.width, canvas.height);

    for (const entity of this.entities) {
      const position = entity.components['position'];
      if (!isVector(position)) {
        continue;
      }

      const spriteRef = entity.components['sprite'];
      const sprite = typeof spriteRef === 'string' ? this.spriteCache.get(spriteRef) : undefined;
      if (sprite?.status === 'loaded' && sprite.image) {
        ctx.drawImage(sprite.image, position.x, position.y, 36, 36);
        continue;
      }

      drawFallbackEntity(ctx, entity, position);
    }

    ctx.fillStyle = 'rgba(227, 239, 255, 0.9)';
    ctx.font = '12px Segoe UI';
    ctx.fillText(`Entities: ${this.entities.length}`, 16, canvas.height - 18);
  }

  private async preloadSprites(currentFilePath: string | null): Promise<void> {
    const spriteReferences = new Set<string>();
    for (const entity of this.entities) {
      const spriteRef = entity.components['sprite'];
      if (typeof spriteRef === 'string') {
        spriteReferences.add(spriteRef);
      }
    }

    await Promise.all(
      Array.from(spriteReferences).map(async (spriteRef) => {
        if (this.spriteCache.has(spriteRef)) {
          return;
        }

        const url = await this.editorFileService.resolveAssetUrl(spriteRef, currentFilePath);
        if (!url) {
          this.spriteCache.set(spriteRef, { status: 'error', image: null });
          this.appendLog(`Missing sprite asset: ${spriteRef}`);
          return;
        }

        const image = new Image();
        const entry: SpriteAssetState = {
          status: 'loading',
          image
        };
        this.spriteCache.set(spriteRef, entry);

        await new Promise<void>((resolve) => {
          image.onload = () => {
            entry.status = 'loaded';
            resolve();
          };
          image.onerror = () => {
            entry.status = 'error';
            this.appendLog(`Could not load sprite: ${spriteRef}`);
            resolve();
          };
          image.src = url;
        });
      })
    );
  }

  private attachInputListeners(canvas: HTMLCanvasElement): void {
    const keyDown = (event: KeyboardEvent) => this.inputState.add(event.key.toUpperCase());
    const keyUp = (event: KeyboardEvent) => this.inputState.delete(event.key.toUpperCase());
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    this.teardownListeners.push(() => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    });

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(320, Math.floor(width));
      canvas.height = Math.max(240, Math.floor(height));
    };

    resize();
    window.addEventListener('resize', resize);
    this.teardownListeners.push(() => window.removeEventListener('resize', resize));
  }

  private updateWorldSummary(): void {
    const activeSprites = Array.from(this.spriteCache.values()).filter((entry) => entry.status === 'loaded').length;
    this.worldSummary.set({
      entityCount: this.entities.length,
      runningSystems: this.systems.length,
      activeSprites
    });
  }

  private appendLog(message: string): void {
    this.logs.update((current) => [...current.slice(-8), message]);
  }
}

function applyOperator(current: RuntimeValue, next: RuntimeValue, operator: '=' | '+=' | '-='): RuntimeValue {
  if (operator === '=') {
    return cloneRuntimeValue(next);
  }

  if (typeof current === 'number' && typeof next === 'number') {
    return operator === '+=' ? current + next : current - next;
  }

  if (isVector(current) && isVector(next)) {
    return {
      x: operator === '+=' ? current.x + next.x : current.x - next.x,
      y: operator === '+=' ? current.y + next.y : current.y - next.y
    };
  }

  return cloneRuntimeValue(next);
}

function cloneRuntimeValue(value: RuntimeValue): RuntimeValue {
  if (isVector(value)) {
    return { x: value.x, y: value.y };
  }

  return value;
}

function isVector(value: RuntimeValue): value is RuntimeVector {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'x' in value &&
    'y' in value &&
    typeof (value as RuntimeVector).x === 'number' &&
    typeof (value as RuntimeVector).y === 'number'
  );
}

function drawBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#081224');
  gradient.addColorStop(1, '#111d38');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(139, 167, 218, 0.12)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawFallbackEntity(ctx: CanvasRenderingContext2D, entity: RuntimeEntity, position: RuntimeVector): void {
  const tag = typeof entity.components['tag'] === 'string' ? entity.components['tag'] : entity.name.toLowerCase();
  const palette = tag.includes('enemy')
    ? ['#ff9b8f', '#b1204a']
    : tag.includes('player')
      ? ['#9be8ff', '#1e6dff']
      : ['#ffe29b', '#a46912'];

  const gradient = ctx.createLinearGradient(position.x, position.y, position.x + 36, position.y + 36);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(1, palette[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(position.x, position.y, 36, 36);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(position.x, position.y, 36, 36);
}

