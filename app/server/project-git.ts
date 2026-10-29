import { promises as fs } from 'node:fs';
import path from 'node:path';
import { git } from './git.js';
import { StudioError } from './store.js';

// Git d'un projet externe. Clonage et envoi seulement sur clic de l'étudiant,
// avec ses propres identifiants Git (jamais lus ni stockés par DS-Studio) ;
// jamais de force-push, jamais de réécriture d'historique.

export type GitStatus = {
  repo: boolean;
  branch?: string;
  remote?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  dirty?: number;
};

export async function cloneRepo(url: string, dest: string) {
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?\/?$/.test(url))
    throw new StudioError(
      'URL GitHub attendue (https://github.com/compte/depot).',
    );
  if (!path.isAbsolute(dest))
    throw new StudioError('Dossier de destination : chemin absolu attendu.');
  const parent = await fs.lstat(path.dirname(dest)).catch(() => null);
  if (!parent?.isDirectory())
    throw new StudioError('Le dossier parent de la destination doit exister.');
  const existing = await fs.readdir(dest).catch(() => null);
  if (existing && existing.length)
    throw new StudioError(
      'Le dossier de destination existe et n’est pas vide.',
      409,
    );
  try {
    // Sous-modules non suivis : seul le dépôt demandé est récupéré.
    await git(
      path.dirname(dest),
      ['clone', '--no-recurse-submodules', '--', url, dest],
      300_000,
    );
  } catch (e) {
    throw new StudioError(`Clonage impossible : ${(e as Error).message}`, 502);
  }
}

export async function gitStatus(root: string): Promise<GitStatus> {
  try {
    await git(root, ['rev-parse', '--git-dir']);
  } catch {
    return { repo: false };
  }
  const branch = await git(root, ['symbolic-ref', '--short', 'HEAD']).catch(
    () => undefined,
  );
  const remote = await git(root, ['remote', 'get-url', 'origin']).catch(
    () => undefined,
  );
  const upstream = await git(root, ['rev-parse', '--abbrev-ref', '@{u}']).catch(
    () => undefined,
  );
  const dirty = (await git(root, ['status', '--porcelain']).catch(() => ''))
    .split('\n')
    .filter(Boolean).length;
  let ahead: number | undefined;
  let behind: number | undefined;
  if (upstream) {
    const [b, a] = (
      await git(root, ['rev-list', '--left-right', '--count', '@{u}...HEAD'])
    ).split(/\s+/);
    behind = Number(b);
    ahead = Number(a);
  }
  return { repo: true, branch, remote, upstream, ahead, behind, dirty };
}

export async function gitFetch(root: string) {
  try {
    await git(root, ['fetch', '--prune', 'origin'], 60_000);
  } catch (e) {
    throw new StudioError(
      `Récupération impossible : ${(e as Error).message}`,
      502,
    );
  }
  return gitStatus(root);
}

export async function gitPush(root: string) {
  const status = await gitStatus(root);
  if (!status.repo || !status.remote)
    throw new StudioError('Pas de dépôt distant « origin ».');
  if (!status.branch)
    throw new StudioError(
      'HEAD détaché : placez-vous sur une branche avant de pousser.',
    );
  if (status.upstream && !status.ahead)
    throw new StudioError('Rien à pousser.');
  if (status.behind)
    throw new StudioError(
      'Le dépôt distant a des commits que vous n’avez pas : récupérez-les d’abord (git pull).',
      409,
    );
  try {
    await git(
      root,
      ['push', ...(status.upstream ? [] : ['-u']), 'origin', status.branch],
      120_000,
    );
  } catch (e) {
    throw new StudioError(`Envoi refusé : ${(e as Error).message}`, 502);
  }
  return gitStatus(root);
}
