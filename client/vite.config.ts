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
                assetFileNames: 'assets/[name].[ext]',
                banner: '// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt GNU-AGPL-3.0',
                footer: '// @license-end'
            }
        },
        minify: 'terser',
        terserOptions: {
            // @ts-ignore
            format: {
                comments: 'some',
            },
        },
    }
});
