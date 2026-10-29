import { execFile } from 'node:child_process';
import path from 'node:path';

// Commit Git facultatif après une validation de code : seulement les fichiers
// validés de ds/src (git commit --only), jamais d'autres fichiers indexés, jamais
// de push. Sans dépôt Git ou sans identité, la validation reste faite.
export function git(cwd: string, args: string[], timeout = 20_000) {
  return new Promise<string>((resolve, reject) =>
    execFile(
      'git',
      args,
      {
        cwd,
        timeout,
        windowsHide: true,
        // Jamais d'invite dans le terminal : le gestionnaire d'identifiants de
        // Git (fenêtre de connexion) reste disponible pour l'étudiant.
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
      (e, out, err) =>
        e
          ? reject(new Error((err || e.message).trim().split('\n')[0]))
          : resolve(out.trim()),
    ),
  );
}

export function gitCommitter(srcDir: string) {
  return async (files: string[], message: string) => {
    try {
      await git(srcDir, ['rev-parse', '--show-toplevel']);
    } catch {
      return {
        ok: false,
        detail: 'Pas de dépôt Git : historique local seulement.',
      };
    }
    const paths = files.map((f) => path.join(srcDir, ...f.split('/')));
    const oneLine = message.replace(/\s+/g, ' ').slice(0, 200);
    try {
      // Les fichiers supprimés doivent aussi être pris en compte.
      await git(srcDir, ['add', '--all', '--', ...paths]);
      await git(srcDir, ['commit', '--only', '-m', oneLine, '--', ...paths]);
      const sha = await git(srcDir, ['rev-parse', '--short', 'HEAD']);
      return { ok: true, sha, detail: `Commit ${sha} créé (non poussé).` };
    } catch (e) {
      return {
        ok: false,
        detail: `Commit Git non créé : ${(e as Error).message}`,
      };
    }
  };
}
