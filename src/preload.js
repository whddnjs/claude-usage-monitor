const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getUsage: () => ipcRenderer.invoke('get-usage'),
  onUsageUpdate: (callback) => {
    ipcRenderer.on('usage-update', (_event, data) => callback(data));
  },
});
