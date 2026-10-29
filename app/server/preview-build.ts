import path from 'node:path';
import type { BuildResult } from './components.js';

// Aperçu d'une proposition de code : l'interface est recompilée en mémoire avec
// ds/src remplacé par la copie modifiée, puis servie sous /preview/code/<id>/.
// Rien n'est écrit dans ds/ ni dans dist/.
export function previewBuilder(root: string) {
  const assets = new Map<string, Map<string, { type: string; body: Buffer }>>();
  const dsSrc = path.join(root, 'ds', 'src') + path.sep;
  async function build(overlay: string, id: string): Promise<BuildResult> {
    const vite = await import('vite');
    let result;
    try {
      result = await vite.build({
        root,
        configFile: false,
        logLevel: 'silent',
        base: `/preview/code/${id}/`,
        plugins: [
          {
            name: 'ds-studio-overlay',
            enforce: 'pre',
            async resolveId(source, importer, opts) {
              const r = await this.resolve(source, importer, {
                ...opts,
                skipSelf: true,
              });
              if (!r || r.external) return r;
              const [file, query = ''] = r.id.split('?');
              const normal = path.normalize(file);
              if (!normal.startsWith(dsSrc)) return r;
              const moved = path
                .join(overlay, path.relative(dsSrc, normal))
                .replace(/\\/g, '/');
              return { ...r, id: query ? `${moved}?${query}` : moved };
            },
          },
        ],
        build: {
          write: false,
          minify: false,
          reportCompressedSize: false,
          emptyOutDir: false,
        },
      });
    } catch (e) {
      const text = String((e as Error).message ?? e).replace(
        /\x1b\[[0-9;]*m/g,
        '',
      );
      return { ok: false, error: text.slice(0, 2000) };
    }
    const outputs = (Array.isArray(result) ? result : [result]) as {
      output: {
        fileName: string;
        type: string;
        code?: string;
        source?: string | Uint8Array;
      }[];
    }[];
    const files = new Map<string, { type: string; body: Buffer }>();
    for (const o of outputs[0].output) {
      const body = Buffer.from(o.type === 'chunk' ? o.code! : o.source!);
      const ext = path.extname(o.fileName);
      files.set(o.fileName, {
        type:
          {
            '.html': 'text/html; charset=utf-8',
            '.js': 'text/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.svg': 'image/svg+xml',
          }[ext] ?? 'application/octet-stream',
        body,
      });
    }
    assets.set(id, files);
    // Quelques aperçus seulement en mémoire.
    for (const old of [...assets.keys()].slice(0, -10)) assets.delete(old);
    return { ok: true };
  }
  // Après une validation de code (mode npm start) : dist/ recompilé pour que
  // l'atelier affiche les composants validés. En mode dev, Vite s'en charge.
  let queue: Promise<unknown> = Promise.resolve();
  function rebuildDist() {
    const work = queue.then(async () => {
      const vite = await import('vite');
      await vite.build({ root, logLevel: 'silent' });
    });
    queue = work.catch(() => {});
    return work;
  }
  return {
    build,
    rebuildDist,
    asset: (id: string, file: string) =>
      assets.get(id)?.get(file || 'index.html'),
    drop: (id: string) => assets.delete(id),
  };
}
