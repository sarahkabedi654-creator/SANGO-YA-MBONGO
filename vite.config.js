import { defineConfig } from 'vite';
export default defineConfig({ build:{ rollupOptions:{ input:['index.html','actualites.html','analyses.html','favoris.html','sources.html','connexion.html','inscription.html'] } } });
