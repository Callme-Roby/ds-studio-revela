import { useEffect, useMemo, useRef, useState } from 'react';
import { request } from '../api.js';
import type { ProjectView } from '../../shared/projects.js';
import type {
  ExternalToken,
  TokenProposal,
} from '../../server/external-tokens.js';
import type { CodeProposal } from '../../server/components.js';
import type { CodeEntry } from './HistoryView.js';
import CodeDiffDialog from '../CodeDiffDialog.js';

type Source = {
  file: string;
  format: string;
  count: number;
  ignored: number;
  error?: string;
};
type Entry = {
  id: string;
  revision: number;
  date: string;
  source: string;
  message: string;
  patches: TokenProposal['patches'];
};
export type ExternalTokensData = {
  tokens: ExternalToken[];
  sources: Source[];
  history: Entry[];
};

export function useExternalTokens(project: ProjectView) {
  const [data, setData] = useState<ExternalTokensData>();
  const [error, setError] = useState('');
  const refresh = () =>
    request<ExternalTokensData>(`projects/${project.id}/tokens`)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    void refresh();
  }, [project.id, JSON.stringify(project.tokens)]);
  return { data, error, refresh };
}

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);
// Groupes de la liste : par fichier, puis par famille de valeur.
const family = {
  color: 'Couleurs',
  dimension: 'Dimensions',
  other: 'Autres',
} as const;

// Catalogue des variables d'un projet externe : lues dans ses fichiers,
// modifiées par proposition, diff et validation, réécrites sur place.
export default function ExternalVariablesView({
  project,
}: {
  project: ProjectView;
}) {
  const { data, error, refresh } = useExternalTokens(project);
  const [selected, setSelected] = useState<string>();
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'apercu' | 'code'>('apercu');
  const [proposal, setProposal] = useState<TokenProposal>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');
  const token = data?.tokens.find((t) => t.id === selected) ?? data?.tokens[0];
  useEffect(() => {
    if (token) setDraft(token.value);
  }, [token?.id, token?.value]);
  const groups = useMemo(() => {
    const out = new Map<string, ExternalToken[]>();
    for (const t of data?.tokens ?? [])
      if (t.key.toLowerCase().includes(search.trim().toLowerCase()))
        out.set(`${t.file} · ${family[t.type]}`, [
          ...(out.get(`${t.file} · ${family[t.type]}`) ?? []),
          t,
        ]);
    const order = Object.values(family) as string[];
    return [...out].sort(
      ([a], [b]) =>
        a.split(' · ')[0].localeCompare(b.split(' · ')[0]) ||
        order.indexOf(a.split(' · ')[1]) - order.indexOf(b.split(' · ')[1]),
    );
  }, [data, search]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setProblem('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const propose = (changes: { id: string; value: string }[]) =>
    run(async () =>
      setProposal(
        await request<TokenProposal>(`projects/${project.id}/tokens/propose`, {
          changes,
        }),
      ),
    );
  const accept = (git: boolean) =>
    run(async () => {
      const entry = await request<Entry & { git?: { detail: string } }>(
        `projects/${project.id}/tokens/commit`,
        { id: proposal!.id, git },
      );
      setProposal(undefined);
      await refresh();
      setMessage(
        `Révision t${entry.revision} écrite dans le projet et relue.${entry.git ? ` ${entry.git.detail}` : ''}`,
      );
    });
  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  if (!data) return <p className="muted">Lecture des fichiers de tokens…</p>;
  if (!project.tokens.length)
    return (
      <p className="notice">
        Aucun fichier de tokens déclaré : ajoutez-en un dans la vue d’ensemble
        (ex.
        <code> src/styles/tokens.css</code>).
      </p>
    );
  return (
    <>
      <div className="feedback" aria-live="polite">
        {problem && !proposal && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </div>
      <div className="catalog-view">
        <div className="catalog-list">
          <label className="field">
            Rechercher un token
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <p className="muted small">
            {data.tokens.length} token(s) dans {data.sources.length} fichier(s).
          </p>
          {data.sources
            .filter((s) => s.error)
            .map((s) => (
              <p key={s.file} className="error small">
                {s.file} : {s.error}
              </p>
            ))}
          {groups.map(([name, tokens]) => (
            <section key={name} aria-label={name}>
              <h3 className="list-title">{name}</h3>
              <ul className="token-rows">
                {tokens.map((t) => (
                  <li key={t.id}>
                    <button
                      className="token-card"
                      aria-pressed={token?.id === t.id}
                      aria-label={`Sélectionner ${t.key}`}
                      onClick={() => {
                        setSelected(t.id);
                        setTab('apercu');
                      }}
                    >
                      {t.type === 'color' ? (
                        <span
                          className="token-chip"
                          style={{ background: t.value }}
                        />
                      ) : (
                        <span className="token-measure">
                          {t.type === 'dimension' ? '↔' : 'Aa'}
                        </span>
                      )}
                      <span className="token-name">{t.key}</span>
                      <span className="token-value">{t.value}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {token && (
          <section className="catalog-detail" aria-labelledby="ext-token-title">
            <header className="detail-head">
              <div>
                <p className="eyebrow">Variable · {token.type}</p>
                <h2 id="ext-token-title" tabIndex={-1}>
                  {token.key}
                </h2>
                <p className="muted">
                  <code>
                    {token.file}:{token.line}
                  </code>
                </p>
              </div>
              <div
                className="tabs"
                role="tablist"
                aria-label="Affichage de la variable"
              >
                <button
                  role="tab"
                  aria-selected={tab === 'apercu'}
                  onClick={() => setTab('apercu')}
                >
                  Aperçu
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'code'}
                  onClick={() => setTab('code')}
                >
                  Code
                </button>
              </div>
            </header>
            {tab === 'apercu' ? (
              <div className="detail-body">
                <form
                  className="token-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void propose([{ id: token.id, value: draft }]);
                  }}
                >
                  <label className="field">
                    Valeur
                    <input
                      aria-label="Valeur du token"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      maxLength={200}
                    />
                  </label>
                  {token.type === 'color' &&
                    isHex(draft.length === 7 ? draft : token.value) && (
                      <label className="field color-picker">
                        Choisir
                        <input
                          aria-label="Sélecteur de couleur"
                          type="color"
                          value={isHex(draft) ? draft : token.value}
                          onChange={(e) =>
                            setDraft(e.target.value.toUpperCase())
                          }
                        />
                      </label>
                    )}
                  <button
                    className="studio-primary"
                    disabled={busy || draft.trim() === token.value}
                  >
                    Proposer
                  </button>
                </form>
                <div className="ext-sample">
                  {token.type === 'color' ? (
                    <>
                      <span
                        className="sample-chip"
                        style={{ background: token.value }}
                        title="Actuel"
                      />
                      <span aria-hidden="true">→</span>
                      <span
                        className="sample-chip"
                        style={{ background: draft }}
                        title="Brouillon"
                      />
                    </>
                  ) : token.type === 'dimension' ? (
                    <>
                      <span
                        className="sample-bar"
                        style={{ width: token.value }}
                        title="Actuel"
                      />
                      <span
                        className="sample-bar draft"
                        style={{ width: draft }}
                        title="Brouillon"
                      />
                    </>
                  ) : (
                    <span className="muted">
                      Pas d’aperçu visuel pour ce type de valeur.
                    </span>
                  )}
                </div>
                <p className="muted small">
                  Rien n’est écrit avant validation. La valeur est remplacée sur
                  place dans <code>{token.file}</code>, le reste du fichier est
                  conservé.
                </p>
              </div>
            ) : (
              <div className="detail-body">
                <h3 className="list-title">{token.file}</h3>
                <pre className="code-block">
                  {draft.trim() !== token.value ? (
                    <>
                      <span className="del">{`- ${token.key}: ${token.value}`}</span>
                      <span className="add">{`+ ${token.key}: ${draft}`}</span>
                    </>
                  ) : (
                    <span>{`  ${token.key}: ${token.value}   (ligne ${token.line})`}</span>
                  )}
                </pre>
              </div>
            )}
          </section>
        )}
      </div>
      <ExternalDiffDialog
        proposal={proposal}
        busy={busy}
        error={problem}
        onCancel={() => setProposal(undefined)}
        onAccept={(git) => void accept(git)}
        gitAvailable={!!project.git}
      />
    </>
  );
}

export function ExternalDiffDialog({
  proposal,
  busy,
  error,
  onCancel,
  onAccept,
  gitAvailable = false,
}: {
  proposal?: TokenProposal;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onAccept: (git: boolean) => void;
  gitAvailable?: boolean;
}) {
  const [git, setGit] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (proposal) {
      if (!dialog.current?.open) dialog.current?.showModal();
      cancel.current?.focus();
    } else dialog.current?.close();
  }, [proposal]);
  const files = [...new Set(proposal?.patches.map((p) => p.file) ?? [])];
  return (
    <dialog
      ref={dialog}
      aria-labelledby="ext-diff-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="ext-diff-title">Valider le changement</h2>
      <p>
        Proposition {proposal?.source}
        {proposal?.message ? ` · ${proposal.message}` : ''}. Fichier(s)
        réécrit(s) sur place puis relu(s) : {files.join(', ')}.
      </p>
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
              <tr key={p.id}>
                <th>
                  {p.key}
                  <br />
                  <small className="muted">{p.file}</small>
                </th>
                <td>
                  <del>
                    {isHex(p.before) && (
                      <span
                        className="swatch-dot"
                        style={{ background: p.before }}
                      />
                    )}
                    {p.before}
                  </del>
                </td>
                <td>
                  <ins>
                    {isHex(p.after) && (
                      <span
                        className="swatch-dot"
                        style={{ background: p.after }}
                      />
                    )}
                    {p.after}
                  </ins>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {gitAvailable && (
        <label className="checks-ack">
          <input
            type="checkbox"
            checked={git}
            onChange={(e) => setGit(e.target.checked)}
          />
          Créer aussi un commit Git de ces fichiers (local, poussé seulement sur
          votre clic)
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button ref={cancel} onClick={onCancel} disabled={busy}>
          Ne pas appliquer
        </button>
        <button
          className="studio-primary"
          onClick={() => onAccept(gitAvailable && git)}
          disabled={busy}
        >
          {busy ? 'Écriture…' : 'Valider et écrire dans le projet'}
        </button>
      </div>
    </dialog>
  );
}

// Historique des révisions de tokens du projet, chacune annulable par un diff.
export function ExternalHistoryView({ project }: { project: ProjectView }) {
  const { data, error, refresh } = useExternalTokens(project);
  const [proposal, setProposal] = useState<TokenProposal>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setProblem('');
    try {
      await work();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  if (!data) return <p className="muted">Lecture…</p>;
  return (
    <div className="history-view">
      <section className="history" aria-label="Historique des tokens du projet">
        <h2>Variables du projet</h2>
        {problem && !proposal && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
        {!data.history.length && <p>Aucune révision.</p>}
        <ol>
          {data.history.map((h) => (
            <li key={h.id}>
              <div>
                <strong>t{h.revision}</strong> · {h.source} ·{' '}
                <time>{new Date(h.date).toLocaleString('fr-FR')}</time>
                <p>
                  {h.patches
                    .map((p) => `${p.key} ${p.before} → ${p.after}`)
                    .join(', ')}
                </p>
              </div>
              <button
                onClick={() =>
                  void run(async () =>
                    setProposal(
                      await request<TokenProposal>(
                        `projects/${project.id}/tokens/undo`,
                        { id: h.id },
                      ),
                    ),
                  )
                }
              >
                Annuler t{h.revision}
              </button>
            </li>
          ))}
        </ol>
      </section>
      <ExternalCodeHistory project={project} />
      <ExternalDiffDialog
        proposal={proposal}
        busy={busy}
        error={problem}
        onCancel={() => setProposal(undefined)}
        gitAvailable={!!project.git}
        onAccept={(git) =>
          void run(async () => {
            await request(`projects/${project.id}/tokens/commit`, {
              id: proposal!.id,
              git,
            });
            setProposal(undefined);
            await refresh();
          })
        }
      />
    </div>
  );
}

// Historique du code des composants d'un projet externe, révisions c annulables.
export function ExternalCodeHistory({ project }: { project: ProjectView }) {
  const [history, setHistory] = useState<CodeEntry[]>();
  const [proposal, setProposal] = useState<CodeProposal>();
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const base = `projects/${project.id}/components`;
  const refresh = () =>
    request<{ history: CodeEntry[] }>(base)
      .then((r) => setHistory(r.history))
      .catch((e) => setProblem(e.message));
  useEffect(() => {
    if (project.components.length) void refresh();
  }, [project.id]);
  if (!project.components.length) return null;
  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    setProblem('');
    try {
      await work();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="history" aria-label="Historique du code du projet">
      <h2>Code des composants</h2>
      {problem && !proposal && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {history && !history.length && <p>Aucune révision de code.</p>}
      <ol>
        {history?.map((h) => (
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
                {h.files
                  .map((f) => `${f.path} +${f.added} −${f.removed}`)
                  .join(', ')}
              </p>
            </div>
            <button
              onClick={() =>
                void run('Préparation…', async () =>
                  setProposal(
                    await request<CodeProposal>(`${base}/undo`, { id: h.id }),
                  ),
                )
              }
            >
              Annuler c{h.revision}
            </button>
          </li>
        ))}
      </ol>
      <CodeDiffDialog
        proposal={proposal}
        busy={busy}
        error={problem}
        preview={false}
        target={project.name}
        onCancel={() => setProposal(undefined)}
        onAccept={(git) =>
          void run('Écriture…', async () => {
            await request(`${base}/commit`, {
              id: proposal!.id,
              git: git && !!project.git,
            });
            setProposal(undefined);
            await refresh();
          })
        }
      />
    </section>
  );
}
