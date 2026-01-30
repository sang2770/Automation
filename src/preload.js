const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File import functions
  importAccountsFile: () => ipcRenderer.invoke('import-accounts-file'),
  importDataFile: () => ipcRenderer.invoke('import-data-file'),
  
  // Automation control
  startAutomation: (config) => ipcRenderer.invoke('start-automation', config),
  stopAutomation: () => ipcRenderer.invoke('stop-automation'),
  getWorkersStatus: () => ipcRenderer.invoke('get-workers-status'),
  
  // Listen for worker updates
  onWorkerUpdate: (callback) => {
    ipcRenderer.on('worker-update', (event, data) => callback(data));
  },
  
  // Remove listener
  removeWorkerUpdateListener: () => {
    ipcRenderer.removeAllListeners('worker-update');
  }
});
