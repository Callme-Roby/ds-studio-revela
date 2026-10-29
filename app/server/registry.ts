import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWrite, readPrivate } from './files.js';
import { StudioError } from './store.js';
import { git } from './git.js';
import {
  builtinId,
  registrySchema,
  type NewProject,
  type Project,
  type ProjectView,
  type Registry,
  type TokenSource,
  type ComponentSource,
} from '../shared/projects.js';

// Chemin d'un fichier du projet : relatif, résolu dans son dossier, aucun
// segment symbolique (realpath doit rester dans le dossier réel du projet).
export async function resolveInside(root: string, rel: string) {
  const realRoot = await fs.realpath(root);
  const file = path.resolve(realRoot, rel);
  const real = await fs.realpath(file).catch(() => null);
  if (!real)
    throw new StudioError(`Fichier introuvable dans le projet : ${rel}`);
  if (
    path.relative(realRoot, real).startsWith('..') ||
    path.isAbsolute(path.relative(realRoot, real))
  )
    throw new StudioError(`Fichier hors du dossier du projet : ${rel}`);
  // Windows ignore la casse : seul un vrai détour (lien) est refusé.
  const same =
    process.platform === 'win32'
      ? real.toLowerCase() === file.toLowerCase()
      : real === file;
  if (!same) throw new StudioError(`Lien symbolique refusé : ${rel}`);
  const stat = await fs.stat(real);
  if (!stat.isFile() || stat.size > 1_000_000)
    throw new StudioError(
      `Fichier absent ou trop volumineux (1 Mo maximum) : ${rel}`,
    );
  return real;
}

// Registre des projets : .ds-studio/projects.json (privé) et un dossier d'état
// par projet externe (.ds-studio/projects/<id>/). Déclarer un projet ne lit ni
// n'exécute rien de son contenu ; retirer un projet ne supprime aucun fichier.

const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'projet';

export class ProjectRegistry {
  private file: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private dataDir: string,
    private builtinRoot: string,
  ) {
    this.file = path.join(dataDir, 'projects.json');
  }

  private async load(): Promise<Registry> {
    try {
      return registrySchema.parse(
        JSON.parse(await readPrivate(this.file, 200_000)),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT')
        return { version: 1, active: builtinId, projects: [] };
      throw new StudioError(
        'projects.json illisible : registre non modifié.',
        500,
      );
    }
  }
  private save(r: Registry) {
    return atomicWrite(this.file, JSON.stringify(r, null, 2));
  }
  // Écritures sérialisées : deux ajouts simultanés ne s'écrasent pas.
  private change<T>(work: (r: Registry) => Promise<T> | T): Promise<T> {
    const run = this.queue.then(async () => {
      const r = await this.load();
      const result = await work(r);
      await this.save(r);
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }

  stateDir(id: string) {
    if (id === builtinId) return this.dataDir;
    return path.join(this.dataDir, 'projects', id);
  }

  private async view(p: Project | null): Promise<ProjectView> {
    const root = p ? p.root : this.builtinRoot;
    const exists = await fs
      .stat(root)
      .then((s) => s.isDirectory())
      .catch(() => false);
    let info: ProjectView['git'] = null;
    if (exists)
      try {
        // symbolic-ref marche aussi sans commit ; rev-parse couvre un HEAD détaché.
        const branch = await git(root, [
          'symbolic-ref',
          '--short',
          'HEAD',
        ]).catch(() => git(root, ['rev-parse', '--short', 'HEAD']));
        const remote = await git(root, ['remote', 'get-url', 'origin']).catch(
          () => undefined,
        );
        const status = await git(root, ['status', '--porcelain']);
        info = {
          branch,
          remote,
          dirty: status ? status.split('\n').length : 0,
        };
      } catch {
        info = null;
      }
    return p
      ? {
          id: p.id,
          name: p.name,
          builtin: false,
          root,
          source: p.source,
          figma: p.figma,
          git: info,
          exists,
          tokens: p.tokens,
          components: p.components,
        }
      : {
          id: builtinId,
          name: 'Revela',
          builtin: true,
          root,
          source: { type: 'local', url: '' },
          figma: { plugin: true, fileUrl: '' },
          git: info,
          exists,
          tokens: [{ file: 'ds/tokens.css', format: 'css' }],
          components: [{ dir: 'ds/src', extensions: ['tsx', 'ts', 'css'] }],
        };
  }

  async list() {
    const r = await this.load();
    const projects = await Promise.all([
      this.view(null),
      ...r.projects.map((p) => this.view(p)),
    ]);
    const active = projects.some((p) => p.id === r.active)
      ? r.active
      : builtinId;
    return { active, projects };
  }

  add(input: NewProject) {
    return this.change(async (r) => {
      const root = path.resolve(input.root);
      if (!path.isAbsolute(input.root))
        throw new StudioError(
          'Chemin absolu attendu (ex. D:\\projets\\mon-projet).',
        );
      const stat = await fs.lstat(root).catch(() => null);
      if (!stat?.isDirectory() || stat.isSymbolicLink())
        throw new StudioError(
          'Dossier introuvable ou lien symbolique : projet non ajouté.',
        );
      const same = (a: string) => path.relative(a, root) === '';
      if (same(this.builtinRoot) || r.projects.some((p) => same(p.root)))
        throw new StudioError(
          'Ce dossier est déjà un projet de DS-Studio.',
          409,
        );
      let id = slug(input.name);
      for (
        let i = 2;
        id === builtinId || r.projects.some((p) => p.id === id);
        i++
      )
        id = `${slug(input.name)}-${i}`;
      const project: Project = {
        ...input,
        root,
        id,
        createdAt: new Date().toISOString(),
        tokens: [],
        components: [],
      };
      await fs.mkdir(this.stateDir(id), { recursive: true, mode: 0o700 });
      r.projects.push(project);
      r.active = id;
      return project;
    });
  }

  // Fichiers de tokens : dans le dossier du projet, jamais par un lien.
  // Dossiers de composants : existants, dans le projet, jamais par un lien.
  setComponents(id: string, components: ComponentSource[]) {
    return this.change(async (r) => {
      const p = r.projects.find((x) => x.id === id);
      if (!p) throw new StudioError('Projet inconnu ou intégré.', 404);
      const realRoot = await fs.realpath(p.root);
      for (const c of components) {
        const dir = path.resolve(realRoot, c.dir);
        const stat = await fs.lstat(dir).catch(() => null);
        if (!stat?.isDirectory() || stat.isSymbolicLink())
          throw new StudioError(
            `Dossier introuvable ou lien symbolique : ${c.dir}`,
          );
      }
      p.components = components;
    });
  }

  setSources(id: string, sources: TokenSource[]) {
    return this.change(async (r) => {
      const p = r.projects.find((x) => x.id === id);
      if (!p) throw new StudioError('Projet inconnu ou intégré.', 404);
      for (const s of sources) await resolveInside(p.root, s.file);
      p.tokens = sources;
    });
  }

  async project(id: string) {
    const p = (await this.load()).projects.find((x) => x.id === id);
    if (!p) throw new StudioError('Projet externe inconnu.', 404);
    return p;
  }

  updateFigma(id: string, figma: Project['figma']) {
    return this.change((r) => {
      const p = r.projects.find((x) => x.id === id);
      if (!p) throw new StudioError('Projet inconnu ou intégré.', 404);
      p.figma = figma;
    });
  }

  remove(id: string) {
    return this.change((r) => {
      if (id === builtinId)
        throw new StudioError('Le projet intégré ne peut pas être retiré.');
      const before = r.projects.length;
      r.projects = r.projects.filter((p) => p.id !== id);
      if (r.projects.length === before)
        throw new StudioError('Projet inconnu.', 404);
      if (r.active === id) r.active = builtinId;
    });
  }

  setActive(id: string) {
    return this.change((r) => {
      if (id !== builtinId && !r.projects.some((p) => p.id === id))
        throw new StudioError('Projet inconnu.', 404);
      r.active = id;
    });
  }
}
