interface EdenOpenFileResult {
  filePath: string;
  content: string;
}

interface EdenSaveFilePayload {
  currentPath?: string | null;
  content: string;
}

interface EdenSaveFileResult {
  filePath: string;
}

interface EdenAssetPickResult {
  filePath: string;
  fileName: string;
}

interface EdenAssetResolvePayload {
  assetPath: string;
  relativeTo?: string | null;
}

interface EdenDesktopApi {
  openScript(): Promise<EdenOpenFileResult | null>;
  saveScript(payload: EdenSaveFilePayload): Promise<EdenSaveFileResult | null>;
  chooseAsset(): Promise<EdenAssetPickResult | null>;
  resolveAssetUrl(payload: EdenAssetResolvePayload): Promise<string | null>;
}

interface Window {
  edenDesktop?: EdenDesktopApi;
  require?: {
    config(config: Record<string, unknown>): void;
    (dependencies: string[], callback: () => void): void;
  };
  monaco?: typeof import('monaco-editor');
}

