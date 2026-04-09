import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EditorFileService } from './editor-file.service';

describe('EditorFileService', () => {
  let service: EditorFileService;

  beforeEach(() => {
    service = new EditorFileService();
    window.edenDesktop = {
      openScript: vi.fn().mockResolvedValue({
        filePath: 'C:/games/test.eden',
        content: 'entity Player:\n  position (1, 1)'
      }),
      saveScript: vi.fn().mockResolvedValue({ filePath: 'C:/games/test.eden' }),
      chooseAsset: vi.fn().mockResolvedValue({ filePath: 'C:/sprites/player.png', fileName: 'player.png' }),
      resolveAssetUrl: vi.fn().mockResolvedValue('file:///C:/sprites/player.png')
    };
  });

  it('loads bundled samples into an untitled document state', () => {
    const document = service.loadSample('arena-starter');

    expect(document?.name).toBe('arena-starter.eden');
    expect(document?.content.includes('system Move')).toBe(true);
    expect(service.currentFilePath()).toBeNull();
  });

  it('opens and saves through the electron bridge', async () => {
    const opened = await service.open();
    const savedPath = await service.save(opened?.content ?? '');

    expect(opened?.filePath).toBe('C:/games/test.eden');
    expect(savedPath).toBe('C:/games/test.eden');
    expect(window.edenDesktop?.openScript).toHaveBeenCalled();
    expect(window.edenDesktop?.saveScript).toHaveBeenCalled();
  });

  it('resolves bundled asset paths without the bridge', async () => {
    await expect(service.resolveAssetUrl('assets/sprites/player.svg')).resolves.toContain('assets/sprites/player.svg');
  });
});

