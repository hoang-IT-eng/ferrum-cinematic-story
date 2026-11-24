import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep three.js isolated into lean chunks so loaders only fetch on demand.
        manualChunks: (id) => {
          if (id.includes('node_modules/three/examples')) return 'three-extras'
          if (id.includes('node_modules/three/build/three.core')) return 'three-core'
          if (id.includes('node_modules/three')) return 'three'
          return undefined
        },
      },
    },
  },
})
