const { contextBridge } = require('electron')

// Expor APIs seguras para o renderer
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
})
