import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:3030',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, '')
            },
            '/ws': {
                target: 'ws://localhost:3030',
                ws: true,
                changeOrigin: true
            }
        }
    },
    worker: {
        format: 'es'
    },
    build: {
        rollupOptions: {
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name].[ext]'
            }
        },
        minify: 'terser',
        terserOptions: {
            output: {
                comments: 'some',
            },
        },
    }
});
