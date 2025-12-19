import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    // IMPORTANTE: não usar "dist" aqui, porque o electron-builder usa "dist/"
    // para artefatos (win-unpacked, .exe, .7z etc). Se usar o mesmo diretório,
    // o Vite tenta apagar e pode dar EBUSY no Windows.
    outDir: 'renderer-dist',
    emptyOutDir: true
  },
  base: './'
})
