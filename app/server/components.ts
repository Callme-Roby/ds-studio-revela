import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { atomicWrite, readPrivate } from './files.js';
import { StudioError } from './store.js';
import { diffLines, stats } from '../shared/diff.js';

// Code des composants du DS (ds/src). Même règle que pour les tokens : une
// proposition (manuelle ou IA) n'écrit rien ; le diff, l'aperçu compilé et la
// validation humaine précèdent toute écriture, puis le fichier est relu.

export const componentPath =
  /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\.(tsx|ts|css)$/;
const maxFile = 200_000;
const maxFiles = 80;
export const changeSchema = z
  .object({
    path: z.string().max(200).regex(componentPath),
    content: z.string().max(maxFile).nullable(),
  })
  .strict();
export const codeProposeSchema = z
  .object({
    changes: z.array(changeSchema).min(1).max(20),
    message: z.string().max(500).default(''),
  })
  .strict();

export type FileChange = z.infer<typeof changeSchema>;
export type BuildResult = { ok: boolean; error?: string };
export type PreviewBuilder = (
  overlay: string,
  id: string,
) => Promise<BuildResult>;
export type GitCommitter = (
  files: string[],
  message: string,
) => Promise<{ ok: boolean; detail: string; sha?: string }>;

export type CodeProposal = {
  id: string;
  source: string;
  message: string;
  date: string;
  base: Record<string, string | null>;
  files: {
    path: string;
    before: string | null;
    after: string | null;
    added: number;
    removed: number;
  }[];
  build: BuildResult;
};
export type CodeEntry = {
  id: string;
  revision: number;
  date: string;
  source: string;
  message: string;
  files: { path: string; before: string | null; after: string | null }[];
  git?: string;
};

const sha = (s: string | null) =>
  s === null ? null : createHash('sha256').update(s).digest('hex');

export class ComponentStore {
  private proposals = new Map<string, CodeProposal>();
  private queue: Promise<unknown> = Promise.resolve();
  private journalFile: string;
  constructor(
    private srcDir: string,
    dataDir: string,
    private previewDir: string,
    private builder?: PreviewBuilder,
    private git?: GitCommitter,
  ) {
    this.journalFile = path.join(dataDir, 'components-history.json');
  }

  private resolve(rel: string) {
    if (!componentPath.test(rel))
      throw new StudioError('Chemin de composant refusé.');
    const file = path.join(this.srcDir, ...rel.split('/'));
    if (!file.startsWith(this.srcDir + path.sep))
      throw new StudioError('Chemin de composant refusé.');
    return file;
  }
  async read(rel: string): Promise<string | null> {
    try {
      return await readPrivate(this.resolve(rel), maxFile);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }
  async list() {
    const out: { path: string; size: number }[] = [];
    const walk = async (dir: string, prefix: string) => {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        if (e.isSymbolicLink()) continue;
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(path.join(dir, e.name), rel);
        else if (e.isFile() && componentPath.test(rel)) {
          out.push({
            path: rel,
            size: (await fs.stat(path.join(dir, e.name))).size,
          });
          if (out.length > maxFiles)
            throw new StudioError('Trop de fichiers dans ds/src.');
        }
      }
    };
    await walk(this.srcDir, '');
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  // Où chaque variable CSS est utilisée dans ds/src (fichier, ligne, extrait).
  async usages() {
    const out: Record<string, { file: string; line: number; text: string }[]> =
      {};
    for (const { path: file } of await this.list()) {
      const lines = ((await this.read(file)) ?? '').split('\n');
      lines.forEach((text, i) => {
        for (const m of text.matchAll(/var\(--([A-Za-z0-9-]+)/g))
          (out[m[1]] ??= []).push({
            file,
            line: i + 1,
            text: text.trim().slice(0, 160),
          });
      });
    }
    return out;
  }

  async propose(changes: FileChange[], source: string, message = '') {
    const seen = new Set<string>();
    const files: CodeProposal['files'] = [];
    const base: CodeProposal['base'] = {};
    for (const c of changes) {
      if (seen.has(c.path))
        throw new StudioError(`Fichier en double : ${c.path}.`);
      seen.add(c.path);
      const before = await this.read(c.path);
      if (before === c.content) continue;
      base[c.path] = sha(before);
      files.push({
        path: c.path,
        before,
        after: c.content,
        ...stats(diffLines(before ?? '', c.content ?? '')),
      });
    }
    if (!files.length)
      throw new StudioError('Aucun changement dans le code des composants.');
    const id = randomUUID();
    const proposal: CodeProposal = {
      id,
      source,
      message,
      date: new Date().toISOString(),
      base,
      files,
      build: { ok: true },
    };
    if (this.builder) {
      // Copie de ds/src avec la proposition appliquée, compilée pour l'aperçu.
      const overlay = path.join(this.previewDir, id);
      await fs.mkdir(this.previewDir, { recursive: true });
      await fs.cp(this.srcDir, overlay, { recursive: true });
      for (const f of files) {
        const target = path.join(overlay, ...f.path.split('/'));
        if (f.after === null) await fs.rm(target, { force: true });
        else {
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, f.after);
        }
      }
      try {
        proposal.build = await this.builder(overlay, id);
      } catch (e) {
        proposal.build = {
          ok: false,
          error: (e as Error).message.slice(0, 2000),
        };
      }
    }
    this.proposals.set(id, proposal);
    // Quelques propositions en mémoire seulement : les plus anciennes expirent.
    for (const old of [...this.proposals.keys()].slice(0, -10))
      this.discard(old);
    return proposal;
  }

  discard(id: string) {
    this.proposals.delete(id);
    void fs.rm(path.join(this.previewDir, id), {
      recursive: true,
      force: true,
    });
  }

  async journal(): Promise<CodeEntry[]> {
    try {
      return JSON.parse(await readPrivate(this.journalFile));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new StudioError(
        'Historique des composants illisible : rien écrit.',
        500,
      );
    }
  }

  commit(id: string, gitCommit = false) {
    const work = this.queue.then(async () => {
      const p = this.proposals.get(id);
      if (!p)
        throw new StudioError(
          'Proposition de code inconnue ou expirée. Reproposez-la.',
          404,
        );
      if (!p.build.ok)
        throw new StudioError(
          'La proposition ne compile pas : rien écrit. Corrigez-la puis reproposez.',
          409,
        );
      for (const f of p.files)
        if (sha(await this.read(f.path)) !== p.base[f.path])
          throw new StudioError(
            `${f.path} a changé depuis la proposition : rien écrit. Reproposez.`,
            409,
          );
      for (const f of p.files) {
        const file = this.resolve(f.path);
        if (f.after === null) await fs.rm(file, { force: true });
        else {
          await fs.mkdir(path.dirname(file), { recursive: true });
          await atomicWrite(file, f.after, 0o644);
          if ((await this.read(f.path)) !== f.after)
            throw new StudioError(
              `Relecture de ${f.path} différente : vérifiez le fichier.`,
              500,
            );
        }
      }
      const journal = await this.journal();
      const entry: CodeEntry = {
        id: p.id,
        revision: (journal.at(-1)?.revision ?? 0) + 1,
        date: new Date().toISOString(),
        source: p.source,
        message: p.message,
        files: p.files.map(({ path, before, after }) => ({
          path,
          before,
          after,
        })),
      };
      let git: Awaited<ReturnType<GitCommitter>> | undefined;
      if (gitCommit && this.git) {
        git = await this.git(
          p.files.map((f) => f.path),
          `DS c${entry.revision} · ${p.message || p.files.map((f) => f.path).join(', ')}`,
        );
        if (git.sha) entry.git = git.sha;
      }
      journal.push(entry);
      await atomicWrite(
        this.journalFile,
        JSON.stringify(journal.slice(-200), null, 2),
      );
      this.discard(id);
      return { entry: summary(entry), git };
    });
    this.queue = work.catch(() => {});
    return work;
  }

  async undo(entryId: string) {
    const entry = (await this.journal()).find((e) => e.id === entryId);
    if (!entry) throw new StudioError('Révision de code inconnue.', 404);
    return this.propose(
      entry.files.map((f) => ({ path: f.path, content: f.before })),
      'undo',
      `Annulation de c${entry.revision}`,
    );
  }
  async history() {
    return (await this.journal()).map(summary).reverse();
  }
}

function summary(e: CodeEntry) {
  return {
    id: e.id,
    revision: e.revision,
    date: e.date,
    source: e.source,
    message: e.message,
    git: e.git,
    files: e.files.map((f) => ({
      path: f.path,
      ...stats(diffLines(f.before ?? '', f.after ?? '')),
    })),
  };
}
