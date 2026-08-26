import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://alcaras.github.io',
  base: '/v3reference/',
  build: { format: 'directory' },
  trailingSlash: 'ignore',
});
