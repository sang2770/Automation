const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    processAudio: (config) => ipcRenderer.invoke('process:start', config),
    onLog: (callback) => ipcRenderer.on('log:update', callback),
    onComplete: (callback) => ipcRenderer.on('process:complete', callback),
    onError: (callback) => ipcRenderer.on('process:error', callback),
    loadSettings: () => ipcRenderer.invoke('settings:load'),
    saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings)
});
