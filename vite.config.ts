import { defineConfig } from 'vitest/config';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

const runtimeExtensions = new Set([
  '.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.ico',
  '.mp3', '.ogg', '.wav', '.m4a', '.mp4', '.webm',
  '.glb', '.gltf', '.bin', '.ktx2', '.hdr', '.exr',
  '.woff', '.woff2', '.ttf', '.otf', '.webmanifest',
]);

/** Git-ignored production notes can remain in public locally without being published. */
function runtimePublicAssets(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'runtime-public-assets',
    apply: 'build',
    configResolved(value) { config = value; },
    async writeBundle() {
      if (!config.publicDir) return;
      const copy = async (directory: string, prefix = ''): Promise<void> => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (entry.name.startsWith('.') && entry.name !== '.nojekyll') continue;
          const source = join(directory, entry.name), name = join(prefix, entry.name);
          if (entry.isDirectory()) { await copy(source, name); continue; }
          if (!entry.isFile()) continue;
          const explicit = ['THIRD_PARTY_NOTICES.txt', 'CNAME', '.nojekyll'].includes(name);
          if (!explicit && !runtimeExtensions.has(extname(basename(name)).toLowerCase())) continue;
          const target = resolve(config.root, config.build.outDir, name);
          await mkdir(dirname(target), { recursive: true }); await copyFile(source, target);
        }
      };
      await copy(config.publicDir);
    },
  };
}

export default defineConfig({
  base: process.env.PAGES_BASE_PATH || './',
  plugins: [runtimePublicAssets()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
  build: {
    copyPublicDir: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: { manualChunks: id => id.includes('node_modules/three') ? 'three' : undefined },
    },
  },
});
