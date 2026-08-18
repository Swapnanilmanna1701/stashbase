import { register } from 'node:module';

register('./vite-import-stub-loader.mjs', import.meta.url);
