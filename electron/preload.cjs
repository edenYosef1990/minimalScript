const { contextBridge, ipcRenderer } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function resolveAssetPath(assetPath, relativeTo) {
  if (!assetPath) {
    return null;
  }

  const finalPath = path.isAbsolute(assetPath)
    ? assetPath
    : relativeTo
      ? path.resolve(path.dirname(relativeTo), assetPath)
      : path.resolve(assetPath);

  return pathToFileURL(finalPath).toString();
}

contextBridge.exposeInMainWorld('edenDesktop', {
  openScript: () => ipcRenderer.invoke('eden:open-script'),
  saveScript: (payload) => ipcRenderer.invoke('eden:save-script', payload),
  chooseAsset: () => ipcRenderer.invoke('eden:choose-asset'),
  resolveAssetUrl: (payload) => resolveAssetPath(payload?.assetPath, payload?.relativeTo)
});
