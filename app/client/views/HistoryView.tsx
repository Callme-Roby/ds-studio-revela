import type { State } from '../../shared/model.js';

export type CodeEntry = {
  id: string;
  revision: number;
  date: string;
  source: string;
  message: string;
  git?: string;
  files: { path: string; added: number; removed: number }[];
};

// Historique des versions : révisions de variables (r) et de code (c), chacune
// annulable par une nouvelle proposition, elle-même soumise au diff.
export default function HistoryView({
  state,
  code,
  onUndoToken,
  onUndoCode,
}: {
  state: State;
  code: CodeEntry[];
  onUndoToken: (id: string) => void;
  onUndoCode: (id: string) => void;
}) {
  return (
    <div className="history-view">
      <section className="history" aria-label="Historique des changements">
        <h2>Variables</h2>
        <p className="muted">
          Annulez un changement précis : les autres tokens restent intacts, et
          l’annulation s’enregistre elle aussi.
        </p>
        {!state.history.length && <p>Aucun changement enregistré.</p>}
        <ol>
          {[...state.history].reverse().map((event) => (
            <li key={event.id}>
              <div>
                <strong>Révision {event.revision}</strong> · {event.source} ·{' '}
                <time>{new Date(event.date).toLocaleString('fr-FR')}</time>
                <p>
                  {event.patches
                    .map((p) => `${p.key} ${p.before} → ${p.after}`)
                    .join(', ')}
                </p>
              </div>
              <button onClick={() => onUndoToken(event.id)}>
                Annuler la révision {event.revision}
              </button>
            </li>
          ))}
        </ol>
      </section>
      <section className="history" aria-label="Historique du code">
        <h2>Code des composants</h2>
        <p className="muted">
          Chaque validation dans ds/src est une révision de code, avec un commit
          Git local si vous l’avez demandé.
        </p>
        {!code.length && <p>Aucune révision de code.</p>}
        <ol>
          {code.map((h) => (
            <li key={h.id}>
              <div>
                <strong>c{h.revision}</strong> · {h.source}
                {h.git && (
                  <>
                    {' '}
                    · commit <code>{h.git}</code>
                  </>
                )}{' '}
                · <time>{new Date(h.date).toLocaleString('fr-FR')}</time>
                <p>
                  {h.message && `${h.message} — `}
                  {h.files
                    .map((f) => `${f.path} +${f.added} −${f.removed}`)
                    .join(', ')}
                </p>
              </div>
              <button onClick={() => onUndoCode(h.id)}>
                Annuler c{h.revision}
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
