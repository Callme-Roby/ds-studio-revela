import { useEffect, useRef, useState } from 'react';
import { auditProposal } from '../shared/rules.js';
import type { Proposal, State } from '../shared/model.js';
import type { CodeStatus } from './api.js';

// Diff d'une proposition de tokens : valeurs avant/après, contrôles Revela,
// cible code ; validation verrouillée si la proposition est périmée ou si un
// problème introduit n'a pas reçu d'accord explicite.
export default function TokenDiffDialog({
  state,
  proposal,
  code,
  saving,
  error,
  onCancel,
  onAccept,
}: {
  state: State;
  proposal?: Proposal;
  code?: CodeStatus;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onAccept: (acknowledged: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    setAcknowledged(false);
    if (proposal) {
      if (!dialog.current?.open) dialog.current?.showModal();
      cancelButton.current?.focus();
    } else dialog.current?.close();
  }, [proposal]);
  const stale = !!proposal && proposal.revision !== state.revision;
  const checks = proposal ? auditProposal(state.tokens, proposal) : undefined;
  const needsAck = !!checks?.introduced.length && !acknowledged;
  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onCancel();
      }}
      aria-labelledby="diff-title"
    >
      <h2 id="diff-title">Valider le changement</h2>
      <p>
        Proposition {proposal?.source} · basée sur la révision{' '}
        {proposal?.revision}. Ces valeurs seront enregistrées sur votre machine.
      </p>
      {code?.configured && (
        <p className={`code-target ${code.state}`}>
          {['synced', 'outdated', 'absent'].includes(code.state)
            ? 'Après validation, écrit aussi puis relit : '
            : 'Code non mis à jour : '}
          <code>{code.file}</code>
          {!['synced', 'outdated', 'absent'].includes(code.state) &&
            ` — ${code.detail}`}
        </p>
      )}
      {stale && (
        <p role="alert" className="error">
          Une autre validation a modifié le DS. Fermez ce diff et refaites votre
          proposition ; aucun écrasement n’est permis.
        </p>
      )}
      <div className="diff-scroll">
        <table>
          <thead>
            <tr>
              <th>Token</th>
              <th>Avant</th>
              <th>Après</th>
            </tr>
          </thead>
          <tbody>
            {proposal?.patches.map((p) => (
              <tr key={p.key}>
                <th>{p.key}</th>
                <td>
                  <Value v={p.before} del />
                </td>
                <td>
                  <Value v={p.after} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {checks && (
        <section className="checks" aria-labelledby="checks-title">
          <h3 id="checks-title">Contrôles Revela</h3>
          {checks.introduced.length + checks.resolved.length === 0 && (
            <p className="checks-ok">
              Aucun problème introduit par ce changement
              {checks.remaining.length
                ? ` (${checks.remaining.length} déjà présent(s)).`
                : '.'}
            </p>
          )}
          {checks.introduced.length > 0 && (
            <ul className="checks-new" aria-label="Problèmes introduits">
              {checks.introduced.map((f) => (
                <li key={f.id}>
                  <strong>{f.rule}</strong> {f.message}
                </li>
              ))}
            </ul>
          )}
          {checks.resolved.length > 0 && (
            <ul className="checks-fixed" aria-label="Problèmes résolus">
              {checks.resolved.map((f) => (
                <li key={f.id}>
                  <strong>résolu</strong> {f.message}
                </li>
              ))}
            </ul>
          )}
          {checks.remaining.length > 0 && (
            <details>
              <summary>
                {checks.remaining.length} problème(s) déjà présent(s)
              </summary>
              <ul>
                {checks.remaining.map((f) => (
                  <li key={f.id}>
                    <strong>{f.rule}</strong> {f.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {checks.introduced.length > 0 && (
            <label className="checks-ack">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              Je valide en connaissance de cause malgré{' '}
              {checks.introduced.length} problème(s) introduit(s).
            </label>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button ref={cancelButton} onClick={onCancel} disabled={saving}>
          Ne pas appliquer
        </button>
        <button
          className="studio-primary"
          onClick={() => onAccept(acknowledged)}
          disabled={saving || stale || needsAck}
        >
          {saving ? 'Enregistrement…' : 'Valider et enregistrer'}
        </button>
      </div>
    </dialog>
  );
}

function Value({ v, del }: { v: string | number; del?: boolean }) {
  const color = typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  const content = (
    <>
      {color && <span className="swatch-dot" style={{ background: v }} />}
      {v}
    </>
  );
  return del ? <del>{content}</del> : <ins>{content}</ins>;
}
