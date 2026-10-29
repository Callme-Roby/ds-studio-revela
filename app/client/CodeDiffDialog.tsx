import { useEffect, useRef, useState } from 'react';
import { diffLines, hunks } from '../shared/diff.js';
import type { CodeProposal } from '../server/components.js';
import { scenarios } from './DesignSystem.js';

// Diff d'une proposition de code (ds/src) : fichiers modifiés, compilation et
// aperçu réel du code proposé, commit Git facultatif, validation explicite.
export default function CodeDiffDialog({
  proposal,
  item,
  busy,
  error,
  onCancel,
  onAccept,
  preview = true,
  target = 'ds/src',
}: {
  proposal?: CodeProposal;
  item?: string;
  // Projet externe : pas d'aperçu compilé (son serveur de dev, étape D4).
  preview?: boolean;
  target?: string;
  busy: string;
  error: string;
  onCancel: () => void;
  onAccept: (git: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [git, setGit] = useState(true);
  const [view, setView] = useState(item ? `item:${item}` : 'studio');
  useEffect(() => {
    if (proposal) {
      setView(item ? `item:${item}` : 'studio');
      if (!dialog.current?.open) dialog.current?.showModal();
      cancelButton.current?.focus();
    } else dialog.current?.close();
  }, [proposal, item]);
  const query = view.startsWith('item:')
    ? `item=${view.slice(5)}`
    : `scenario=${view}`;
  return (
    <dialog
      ref={dialog}
      className="code-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      aria-labelledby="code-diff-title"
    >
      {proposal && (
        <>
          <h2 id="code-diff-title">Valider le changement de code</h2>
          <p>
            Proposition {proposal.source} · {proposal.files.length} fichier(s)
            de {target}
            {proposal.message ? ` · ${proposal.message}` : ''}.
          </p>
          <p
            className={proposal.build.ok ? 'checks-ok' : 'error'}
            role="status"
          >
            {!preview
              ? 'Rien n’est encore écrit. Pas d’aperçu compilé pour ce projet : vérifiez avec son serveur de développement après validation.'
              : proposal.build.ok
                ? 'Compilation réussie : l’aperçu utilise le code proposé, rien n’est encore écrit.'
                : 'La proposition ne compile pas : validation impossible.'}
          </p>
          {proposal.build.error && (
            <pre className="code-build-error">{proposal.build.error}</pre>
          )}
          <div className="code-proposal-grid">
            <div className="code-diff">
              {proposal.files.map((f) => (
                <details key={f.path} open>
                  <summary>
                    <code>
                      {target === 'ds/src' ? `ds/src/${f.path}` : f.path}
                    </code>{' '}
                    {f.after === null
                      ? 'supprimé '
                      : f.before === null
                        ? 'créé '
                        : ''}
                    <ins>+{f.added}</ins> <del>−{f.removed}</del>
                  </summary>
                  <pre>
                    {hunks(diffLines(f.before ?? '', f.after ?? '')).map(
                      (l, i) =>
                        'gap' in l ? (
                          <span key={i} className="gap">
                            ⋯
                          </span>
                        ) : (
                          <span
                            key={i}
                            className={
                              l.kind === '+'
                                ? 'add'
                                : l.kind === '-'
                                  ? 'del'
                                  : ''
                            }
                          >
                            {`${l.kind} ${l.text}`}
                          </span>
                        ),
                    )}
                  </pre>
                </details>
              ))}
            </div>
            {preview && proposal.build.ok && (
              <div className="code-preview">
                <div
                  className="segmented-ui"
                  role="group"
                  aria-label="Contenu de l’aperçu"
                >
                  {item && (
                    <button
                      aria-pressed={view === `item:${item}`}
                      onClick={() => setView(`item:${item}`)}
                    >
                      Composant
                    </button>
                  )}
                  {scenarios.map((s) => (
                    <button
                      key={s.id}
                      aria-pressed={view === s.id}
                      onClick={() => setView(s.id)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <iframe
                  key={`${proposal.id}-${view}`}
                  title="Aperçu du code proposé"
                  src={`/preview/code/${proposal.id}/index.html?preview=1&${query}`}
                />
              </div>
            )}
          </div>
          <label className="checks-ack">
            <input
              type="checkbox"
              checked={git}
              onChange={(e) => setGit(e.target.checked)}
            />
            Créer aussi un commit Git de ces fichiers (local, jamais poussé)
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button ref={cancelButton} onClick={onCancel} disabled={!!busy}>
              Ne pas appliquer
            </button>
            <button
              className="studio-primary"
              onClick={() => onAccept(git)}
              disabled={!!busy || !proposal.build.ok}
            >
              {busy || `Valider et écrire dans ${target}`}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
