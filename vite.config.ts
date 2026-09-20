import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lightningcss']
  },
  build: {
    // Official Vite capability: emits the licences of the dependencies this
    // bundle actually ships. It covers what the bundler packages — not static
    // assets, Pages Functions or anything vendored outside the graph.
    license: { fileName: 'legal/BUNDLED-LICENSES.md' },
    rolldownOptions: {
      output: {
        postBanner: '/* Third-party licenses: /legal/BUNDLED-LICENSES.md */'
      }
    }
  }
})
