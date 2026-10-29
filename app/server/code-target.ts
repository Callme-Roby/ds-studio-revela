import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { atomicWrite, readPrivate } from './files.js';
import { tokenKeys, type State, type Tokens } from '../shared/model.js';

// Sortie vers le code : un seul fichier, déclaré par l'étudiant dans
// .ds-studio/code-target.json (sinon ds/tokens.css du dépôt), jamais par HTTP
// ni par une IA. Écrit après une
// validation, relu ensuite. Un fichier modifié à la main n'est jamais écrasé.

export const marker = 'DS-Studio · fichier généré';
const fileName = 'tokens.css';
const configSchema = z
  .object({
    file: z
      .string()
      .refine(
        (f) => path.isAbsolute(f) && path.basename(f) === fileName,
        `Chemin absolu vers un fichier ${fileName} attendu.`,
      ),
  })
  .strict();

// Variables historiques de Revela (index.css), reliées aux tokens sémantiques.
const revelaAliases: [string, string][] = [
  ['--ink', 'color-text'],
  ['--ink-mute', 'color-muted'],
  ['--rule', 'color-border'],
  ['--mat', 'color-mat'],
  ['--accent', 'color-brand'],
  ['--space', 'space-lg'],
];
const fontStacks: Record<string, string> = {
  'system-ui': "-apple-system, 'Segoe UI', system-ui, sans-serif",
  Arial: 'Arial, sans-serif',
  Georgia: 'Georgia, serif',
  Verdana: 'Verdana, sans-serif',
};

const digest = (body: string) =>
  createHash('sha256').update(body).digest('hex').slice(0, 16);

export function renderCss(tokens: Tokens, revision: number) {
  const lines = tokenKeys.map((key) => {
    const t = tokens[key];
    const v =
      t.$type === 'dimension'
        ? `${t.$value}px`
        : t.$type === 'fontFamily'
          ? fontStacks[t.$value]
          : t.$value;
    return `  --${key.replaceAll('.', '-')}: ${v};`;
  });
  const body =
    ':root {\n' +
    lines.join('\n') +
    '\n\n  /* Alias des variables historiques de Revela. */\n' +
    revelaAliases.map(([a, k]) => `  ${a}: var(--${k});`).join('\n') +
    '\n}\n';
  return (
    `/* ${marker} : ne pas modifier à la main.\n` +
    ` * Révision ${revision} · empreinte ${digest(body)}\n` +
    ` * Source : DS-Studio, après validation humaine du diff. */\n` +
    body
  );
}

// Relit l'en-tête : la révision écrite et si le corps correspond à son empreinte.
export function readGenerated(raw: string) {
  const m = raw.match(
    /^\/\* DS-Studio · fichier généré : .*\n \* Révision (\d+) · empreinte ([0-9a-f]{16})\n.*\*\/\n/,
  );
  if (!m) return null;
  const body = raw.slice(m[0].length);
  return { revision: Number(m[1]), intact: digest(body) === m[2] };
}

export type CodeStatus =
  | { configured: false }
  | {
      configured: true;
      file: string;
      state: 'absent' | 'synced' | 'outdated' | 'modified' | 'foreign' | 'invalid';
      revision?: number;
      detail: string;
    };
export type CodeReport = {
  status: 'written' | 'disabled' | 'refused' | 'failed';
  file?: string;
  detail: string;
};

export class CodeTarget {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private directory: string,
    private current: () => State,
    // Cible par défaut sans code-target.json : le DS livré avec le dépôt.
    private fallback?: string,
  ) {}
  private async target(): Promise<string | null> {
    let raw: string;
    try {
      raw = await readPrivate(path.join(this.directory, 'code-target.json'), 4096);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('code-target.json illisible : aucune écriture vers le code.');
      if (!this.fallback) return null;
      raw = JSON.stringify({ file: this.fallback });
    }
    const { file } = configSchema.parse(JSON.parse(raw));
    const parent = await fs.lstat(path.dirname(file)).catch(() => null);
    if (!parent?.isDirectory() || parent.isSymbolicLink())
      throw new Error('Dossier cible absent ou symbolique : aucune écriture.');
    return file;
  }
  // Contenu actuel de la cible, ou raison de ne pas l'écraser.
  private async inspect(file: string) {
    let raw: string;
    try {
      raw = await readPrivate(file, 1_000_000);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT')
        return { state: 'absent' as const };
      return { state: 'invalid' as const };
    }
    const g = readGenerated(raw);
    if (!g) return { state: 'foreign' as const, raw };
    if (!g.intact) return { state: 'modified' as const, raw, revision: g.revision };
    return { state: 'generated' as const, raw, revision: g.revision };
  }
  async status(): Promise<CodeStatus> {
    let file: string | null;
    try {
      file = await this.target();
    } catch (e) {
      return {
        configured: true,
        file: '',
        state: 'invalid',
        detail: (e as Error).message,
      };
    }
    if (!file) return { configured: false };
    const i = await this.inspect(file);
    const revision = this.current().revision;
    if (i.state === 'generated')
      return i.revision === revision &&
        i.raw === renderCss(this.current().tokens, revision)
        ? { configured: true, file, state: 'synced', revision, detail: `À jour (révision ${revision}).` }
        : { configured: true, file, state: 'outdated', revision: i.revision, detail: `Révision ${i.revision} dans le code, ${revision} dans DS-Studio.` };
    return {
      configured: true,
      file,
      state: i.state,
      revision: 'revision' in i ? i.revision : undefined,
      detail: {
        absent: 'Fichier pas encore créé : il le sera à la prochaine validation.',
        modified: 'Modifié à la main depuis la dernière écriture : il ne sera pas écrasé.',
        foreign: 'Fichier existant non généré par DS-Studio : il ne sera pas écrasé.',
        invalid: 'Fichier illisible ou lien symbolique : aucune écriture.',
      }[i.state],
    };
  }
  // Écrit toujours l'état courant : deux validations rapprochées finissent dans l'ordre.
  write(): Promise<CodeReport> {
    const work = this.queue.then(async (): Promise<CodeReport> => {
      let file: string | null;
      try {
        file = await this.target();
      } catch (e) {
        return { status: 'refused', detail: (e as Error).message };
      }
      if (!file)
        return { status: 'disabled', detail: 'Aucune cible code configurée.' };
      const i = await this.inspect(file);
      if (i.state === 'modified' || i.state === 'foreign' || i.state === 'invalid')
        return {
          status: 'refused',
          file,
          detail:
            i.state === 'invalid'
              ? 'Cible illisible ou symbolique : rien écrit.'
              : `${fileName} a été modifié hors DS-Studio : rien écrit. Comparez puis supprimez-le ou restaurez-le pour reprendre.`,
        };
      const { tokens, revision } = this.current();
      const css = renderCss(tokens, revision);
      try {
        // Fichier source du projet : lisible comme les autres, pas privé.
        await atomicWrite(file, css, 0o644);
        // Relecture : seule une copie identique prouve l'écriture.
        if ((await readPrivate(file, 1_000_000)) !== css)
          throw new Error('relecture différente');
      } catch (e) {
        return {
          status: 'failed',
          file,
          detail: `Écriture de ${fileName} impossible (${(e as Error).message}). La révision ${revision} reste enregistrée dans DS-Studio.`,
        };
      }
      return {
        status: 'written',
        file,
        detail: `${fileName} écrit et relu (révision ${revision}).`,
      };
    });
    this.queue = work.catch(() => {});
    return work;
  }
}
