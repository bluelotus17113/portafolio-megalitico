import { defineConfig } from 'vite';
import { editorPlugin } from './tools/vite-plugin-editor.js';

export default defineConfig({
  base: './',
  // El editor dentro de la web. Solo en desarrollo: es lo que le da al navegador
  // permiso para escribir el JSON de la escena y las texturas en el proyecto.
  // La web publicada no expone ninguna de sus rutas.
  plugins: [editorPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // three es la mitad del peso: en su propio trozo se cachea aparte
        // de nuestro código, que cambia mucho más a menudo.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          return null;
        },
      },
    },
  },
});
