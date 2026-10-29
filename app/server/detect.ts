import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse, formatOf } from '../shared/token-sources.js';
import { defaultExtensions } from '../shared/projects.js';

// Détection en lecture seule, bornée : fichiers de tokens et dossiers de
// composants probables d'un projet, pour préremplir l'assistant de démarrage.
// Rien n'est exécuté ; l'étudiant coche ce qu'il garde.

const skipped = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  'out',
  '.cache',
  'vendor',
]);
const componentNames =
  /^(components?|ui|widgets|atoms|molecules|organisms|design-system|ds|primitives|elements)$/i;
const tokenNames = /(token|variable|theme|color|palette|design)/i;

export type Detection = {
  tokens: { file: string; format: 'css' | 'scss' | 'json'; count: number }[];
  components: { dir: string; files: number }[];
  scripts: { name: string; command: string }[];
  // Adresse probable du serveur de dev et de Storybook, d'après les dépendances.
  preview: { url: string; catalog: string };
  truncated: boolean;
};

export async function detectProject(root: string): Promise<Detection> {
  const tokens: Detection['tokens'] = [];
  const components: Detection['components'] = [];
  let seen = 0;
  let truncated = false;
  const exts = new Set(defaultExtensions);
  // Renvoie le nombre de fichiers de code du sous-arbre.
  async function walk(
    dir: string,
    rel: string,
    depth: number,
  ): Promise<number> {
    if (depth > 6 || truncated) return 0;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return 0;
    }
    let codeFiles = 0;
    for (const e of entries) {
      if (++seen > 6000) {
        truncated = true;
        return codeFiles;
      }
      if (e.isSymbolicLink() || skipped.has(e.name) || e.name.startsWith('.'))
        continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        codeFiles += await walk(path.join(dir, e.name), childRel, depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = e.name.split('.').pop() ?? '';
      if (exts.has(ext)) codeFiles++;
      const format = formatOf(e.name);
      if (!format) continue;
      // JSON : seulement des noms évocateurs (pas package.json, tsconfig…).
      if (format === 'json' && !tokenNames.test(e.name)) continue;
      const stat = await fs.stat(path.join(dir, e.name));
      if (stat.size > 500_000) continue;
      try {
        const text = await fs.readFile(path.join(dir, e.name), 'utf8');
        const count = parse(format, text).tokens.length;
        // Quelques variables suffisent pour un fichier de tokens plausible.
        if (count >= (format === 'json' ? 3 : 2))
          tokens.push({ file: childRel, format, count });
      } catch {
        /* Fichier illisible ou JSON invalide : ignoré. */
      }
    }
    if (rel && componentNames.test(path.basename(dir)) && codeFiles)
      components.push({ dir: rel, files: codeFiles });
    return codeFiles;
  }
  await walk(root, '', 0);
  let scripts: Detection['scripts'] = [];
  const preview = { url: '', catalog: '' };
  try {
    const pkg = JSON.parse(
      await fs.readFile(path.join(root, 'package.json'), 'utf8'),
    ) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const port =
      deps.next || deps.nuxt || deps['react-scripts']
        ? 3000
        : deps.astro
          ? 4321
          : deps.vite || deps['@sveltejs/kit']
            ? 5173
            : 0;
    if (port) preview.url = `http://localhost:${port}`;
    if (
      Object.keys(deps).some(
        (d) => d === 'storybook' || d.startsWith('@storybook/'),
      )
    )
      preview.catalog = 'http://localhost:6006';
    scripts = Object.entries(pkg.scripts ?? {})
      .filter(([n]) => /^(dev|start|serve|storybook|preview)$/.test(n))
      .map(([name, command]) => ({
        name,
        command: String(command).slice(0, 200),
      }));
  } catch {
    /* Pas de package.json : pas de commande suggérée. */
  }
  // Les plus prometteurs d'abord : noms évocateurs, puis nombre de tokens.
  tokens.sort(
    (a, b) =>
      Number(tokenNames.test(path.basename(b.file))) -
        Number(tokenNames.test(path.basename(a.file))) ||
      b.count - a.count ||
      a.file.localeCompare(b.file),
  );
  components.sort(
    (a, b) =>
      a.dir.split('/').length - b.dir.split('/').length || b.files - a.files,
  );
  return {
    tokens: tokens.slice(0, 8),
    components: components.slice(0, 8),
    scripts,
    preview,
    truncated,
  };
}
