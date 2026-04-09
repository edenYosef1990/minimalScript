import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EDEN_SAMPLES } from '../eden-script/samples';
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
    const compiled = compiler.compile(EDEN_SAMPLES[0].source);
    const canvas = createCanvasStub();

    await service.start(compiled.program!, canvas, null);

    for (let index = 1; index <= 130; index += 1) {
      frameCallback?.(index * 32);
    }

    expect(service.status()).toBe('Running');
    expect(service.worldSummary().entityCount).toBeGreaterThanOrEqual(3);
    expect(service.logs().some((entry) => entry.includes('Missing sprite asset'))).toBe(true);
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
