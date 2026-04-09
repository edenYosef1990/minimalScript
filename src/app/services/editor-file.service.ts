import { Injectable, signal } from '@angular/core';

import { EDEN_SAMPLES, EdenSample } from '../eden-script/samples';

export interface EditorDocument {
  filePath: string | null;
  content: string;
  name: string;
}

@Injectable({
  providedIn: 'root'
})
export class EditorFileService {
  readonly samples = EDEN_SAMPLES;
  readonly currentFilePath = signal<string | null>(null);

  createUntitled(): EditorDocument {
    this.currentFilePath.set(null);
    return {
      filePath: null,
      name: 'untitled.eden',
      content: ''
    };
  }

  getSample(id: string): EdenSample | undefined {
    return this.samples.find((sample) => sample.id === id);
  }

  loadSample(id: string): EditorDocument | null {
    const sample = this.getSample(id);
    if (!sample) {
      return null;
    }

    this.currentFilePath.set(null);
    return {
      filePath: null,
      name: `${sample.id}.eden`,
      content: sample.source
    };
  }

  async open(): Promise<EditorDocument | null> {
    const result = await window.edenDesktop?.openScript();
    if (!result) {
      return null;
    }

    this.currentFilePath.set(result.filePath);
    return {
      filePath: result.filePath,
      name: result.filePath.split(/[\\/]/).pop() ?? 'opened.eden',
      content: result.content
    };
  }

  async save(content: string): Promise<string | null> {
    const result = await window.edenDesktop?.saveScript({
      currentPath: this.currentFilePath(),
      content
    });

    if (!result) {
      return null;
    }

    this.currentFilePath.set(result.filePath);
    return result.filePath;
  }

  async chooseAsset(): Promise<EdenAssetPickResult | null> {
    return window.edenDesktop?.chooseAsset() ?? null;
  }

  async resolveAssetUrl(assetPath: string, relativeTo?: string | null): Promise<string | null> {
    if (assetPath.startsWith('assets/')) {
      return new URL(assetPath, window.location.href).toString();
    }

    if (assetPath.startsWith('/assets/')) {
      return new URL(assetPath.slice(1), window.location.href).toString();
    }

    return window.edenDesktop?.resolveAssetUrl({ assetPath, relativeTo }) ?? null;
  }
}

