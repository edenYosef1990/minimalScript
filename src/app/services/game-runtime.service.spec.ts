import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EdenScriptCompilerService } from './eden-script-compiler.service';
import { EditorFileService } from './editor-file.service';
import { GameRuntimeService } from './game-runtime.service';

describe('GameRuntimeService', () => {
  let service: GameRuntimeService;
  let compiler: EdenScriptCompilerService;
  let frameCallback: FrameRequestCallback | null;

  beforeEach(() => {
    compiler = new EdenScriptCompilerService();
    const fileService = new EditorFileService();
    vi.spyOn(fileService, 'resolveAssetUrl').mockResolvedValue(null);
    service = new GameRuntimeService(fileService);

    frameCallback = null;
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts the runtime, advances timed systems, and falls back when sprites are missing', async () => {
    const source = `entity Player:\n  position (80, 100)\n  velocity (0, 0)\n  tag player\n\nentity Enemy:\n  position (300, 160)\n  velocity (-1, 0)\n  tag enemy\n\nsystem Input:\n  run every frame\n  select entity with position, tag player\n  if key D down: entity.position.x += 2\n\nsystem Move:\n  run every frame\n  select entity with position, velocity\n  entity.position += entity.velocity\n\nsystem SpawnEnemies:\n  run every 4s\n  spawn Enemy:\n    position (340, 40)\n    velocity (-1, 1)\n`;
    const compiled = compiler.compile(source);
    const canvas = createCanvasStub();

    await service.start(compiled.program!, canvas, null);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));

    for (let index = 1; index <= 130; index += 1) {
      frameCallback?.(index * 32);
    }

    expect(service.status()).toBe('Running');
    expect(service.worldSummary().entityCount).toBeGreaterThanOrEqual(3);
    expect(service.logs().length).toBeGreaterThan(0);
  });

  it('filters systems by tag value instead of just tag presence', async () => {
    const source = `entity Player:\n  position (10, 10)\n  tag player\n\nentity Enemy:\n  position (40, 10)\n  tag enemy\n\nsystem Input:\n  run every frame\n  select entity with position, tag player\n  if key D down: entity.position.x += 2\n`;
    const compiled = compiler.compile(source);
    const canvas = createCanvasStub();

    await service.start(compiled.program!, canvas, null);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    frameCallback?.(32);

    const summary = service.worldSummary();
    expect(summary.entityCount).toBe(2);
    expect(service.status()).toBe('Running');
  });
});

function createCanvasStub(): HTMLCanvasElement {
  const gradient = { addColorStop: vi.fn() };
  const context = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: '',
    font: '',
    lineWidth: 1,
    strokeStyle: ''
  } as unknown as CanvasRenderingContext2D;

  return {
    width: 640,
    height: 480,
    focus: vi.fn(),
    getBoundingClientRect: () => ({ width: 640, height: 480 } as DOMRect),
    getContext: vi.fn(() => context)
  } as unknown as HTMLCanvasElement;
}
