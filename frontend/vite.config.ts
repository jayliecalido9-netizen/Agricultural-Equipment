import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({plugins:[react(),tailwindcss()],resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},server:{proxy:{'/api':{target:'http://127.0.0.1:5000',changeOrigin:false},'/api-docs':{target:'http://127.0.0.1:5000',changeOrigin:false}}},build:{outDir:'dist',sourcemap:false,rollupOptions:{output:{manualChunks:{charts:['recharts'],react:['react','react-dom','react-router-dom']}}}}});
