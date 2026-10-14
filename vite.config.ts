import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rolldownOptions: {
      output: {
        // Bibliotecas em arquivos próprios: mudam pouco, então o navegador
        // reaproveita do cache quando só o código do app é atualizado.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\/](react|react-dom|scheduler)[\/]/ },
            { name: 'firebase', test: /node_modules[\/](@firebase|firebase)[\/]/ },
            { name: 'charts', test: /node_modules[\/](recharts|d3-[^\/]+|victory-vendor|decimal\.js-light|es-toolkit)[\/]/ },
          ],
        },
      },
    },
  },
})
