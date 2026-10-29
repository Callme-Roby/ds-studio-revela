import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { atomicWrite, readPrivate } from './files.js';
import { StudioError } from './store.js';
import { resolveInside } from './registry.js';
import {
  parse,
  validValue,
  write,
  type TokenType,
} from '../shared/token-sources.js';
import type { Project } from '../shared/projects.js';

// Tokens d'un projet externe : la source de vérité reste les fichiers du
// projet. Une proposition n'écrit rien ; la validation vérifie que chaque
// fichier n'a pas changé depuis, réécrit seulement les valeurs, relit, puis
// journalise (révision t1, t2…) dans le dossier d'état du projet.

export type ExternalToken = {
  id: string;
  key: string;
  value: string;
  type: TokenType;
  file: string;
  line: number;
};
export type TokenPatch = {
  id: string;
  key: string;
  file: string;
  before: string;
  after: string;
};
export type TokenProposal = {
  id: string;
  project: string;
  source: string;
  message: string;
  base: Record<string, string>;
  patches: TokenPatch[];
};
type Entry = {
  id: string;
  revision: number;
  date: string;
  source: string;
  message: string;
  patches: TokenPatch[];
};

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const proposals = new Map<string, TokenProposal>();

export class ExternalTokens {
  private journalFile: string;
  constructor(
    private project: Project,
    stateDir: string,
  ) {
    this.journalFile = path.join(stateDir, 'token-history.json');
  }

  async read() {
    const tokens: ExternalToken[] = [];
    const sources = [];
    for (const s of this.project.tokens) {
      try {
        const file = await resolveInside(this.project.root, s.file);
        const { tokens: found, ignored } = parse(
          s.format,
          await readPrivate(file, 1_000_000),
        );
        for (const t of found)
          tokens.push({
            id: `${s.file}#${t.key}`,
            key: t.key,
            value: t.value,
            type: t.type,
            file: s.file,
            line: t.line,
          });
        sources.push({ ...s, count: found.length, ignored });
      } catch (e) {
        sources.push({
          ...s,
          count: 0,
          ignored: 0,
          error: (e as Error).message,
        });
      }
    }
    return { tokens, sources };
  }

  async propose(
    changes: { id: string; value: string }[],
    source = 'manual',
    message = '',
  ) {
    const { tokens } = await this.read();
    const patches: TokenPatch[] = [];
    for (const c of changes) {
      const t = tokens.find((x) => x.id === c.id);
      if (!t) throw new StudioError(`Token inconnu : ${c.id}`);
      const value = c.value.trim();
      const problem = validValue(t.type, value);
      if (problem) throw new StudioError(`${t.key} : ${problem}`);
      if (value !== t.value)
        patches.push({
          id: t.id,
          key: t.key,
          file: t.file,
          before: t.value,
          after: value,
        });
    }
    if (!patches.length) throw new StudioError('Aucun changement.');
    const base: Record<string, string> = {};
    for (const file of new Set(patches.map((p) => p.file)))
      base[file] = sha(
        await readPrivate(
          await resolveInside(this.project.root, file),
          1_000_000,
        ),
      );
    const proposal: TokenProposal = {
      id: randomUUID(),
      project: this.project.id,
      source,
      message,
      base,
      patches,
    };
    proposals.set(proposal.id, proposal);
    for (const old of [...proposals.keys()].slice(0, -20))
      proposals.delete(old);
    return proposal;
  }

  private async journal(): Promise<Entry[]> {
    try {
      return JSON.parse(await readPrivate(this.journalFile));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new StudioError(
        'Historique des tokens illisible : rien écrit.',
        500,
      );
    }
  }

  async commit(id: string) {
    const p = proposals.get(id);
    if (p && p.project !== this.project.id)
      throw new StudioError('Proposition d’un autre projet : rien écrit.', 409);
    if (!p)
      throw new StudioError(
        'Proposition inconnue ou expirée. Reproposez-la.',
        404,
      );
    const files = new Map<string, { real: string; text: string }>();
    for (const file of Object.keys(p.base)) {
      const real = await resolveInside(this.project.root, file);
      const text = await readPrivate(real, 1_000_000);
      if (sha(text) !== p.base[file])
        throw new StudioError(
          `${file} a changé depuis la proposition : rien écrit. Reproposez.`,
          409,
        );
      files.set(file, { real, text });
    }
    for (const [file, { real, text }] of files) {
      const source = this.project.tokens.find((s) => s.file === file)!;
      const changes = Object.fromEntries(
        p.patches.filter((x) => x.file === file).map((x) => [x.key, x.after]),
      );
      const next = write(source.format, text, changes);
      const mode = (await fs.stat(real)).mode & 0o777;
      await atomicWrite(real, next, mode);
      // Relecture : chaque valeur doit être celle validée.
      const reread = parse(
        source.format,
        await readPrivate(real, 1_000_000),
      ).tokens;
      for (const [key, value] of Object.entries(changes))
        if (reread.find((t) => t.key === key)?.value !== value)
          throw new StudioError(
            `Relecture de ${file} différente pour ${key} : vérifiez le fichier.`,
            500,
          );
    }
    proposals.delete(id);
    const journal = await this.journal();
    const entry: Entry = {
      id: p.id,
      revision: (journal.at(-1)?.revision ?? 0) + 1,
      date: new Date().toISOString(),
      source: p.source,
      message: p.message,
      patches: p.patches,
    };
    journal.push(entry);
    await atomicWrite(
      this.journalFile,
      JSON.stringify(journal.slice(-300), null, 2),
    );
    return entry;
  }

  async undo(entryId: string) {
    const entry = (await this.journal()).find((e) => e.id === entryId);
    if (!entry) throw new StudioError('Révision inconnue.', 404);
    return this.propose(
      entry.patches.map((x) => ({ id: x.id, value: x.before })),
      'undo',
      `Annulation de t${entry.revision}`,
    );
  }

  async history() {
    return (await this.journal()).reverse();
  }
}
