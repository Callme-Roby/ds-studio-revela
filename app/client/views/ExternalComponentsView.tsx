import { useEffect, useMemo, useState } from 'react';
import { request } from '../api.js';
import CodeDiffDialog from '../CodeDiffDialog.js';
import type { ProjectView } from '../../shared/projects.js';
import type { CodeProposal } from '../../server/components.js';
import type { CodeEntry } from './HistoryView.js';

type Files = { files: { path: string; size: number }[]; history: CodeEntry[] };

// Composants d'un projet externe : fichiers des dossiers déclarés, édités sur
// diff et validation ; commit Git facultatif des seuls fichiers validés.
export default function ExternalComponentsView({
  project,
  isRepo,
}: {
  project: ProjectView;
  isRepo: boolean;
}) {
  const [data, setData] = useState<Files>();
  const [file, setFile] = useState<string>();
  const [loaded, setLoaded] = useState<{
    file: string;
    original: string | null;
  }>();
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [proposal, setProposal] = useState<CodeProposal>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const base = `projects/${project.id}/components`;
  const refresh = () =>
    request<Files>(base)
      .then((d) => {
        setData(d);
        setFile((f) => f ?? d.files[0]?.path);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    void refresh();
  }, [project.id, JSON.stringify(project.components)]);
  const revision = data?.history[0]?.revision ?? 0;
  useEffect(() => {
    if (!file) return;
    let live = true;
    setLoaded(undefined);
    request<{ content: string | null }>(
      `${base}/file?path=${encodeURIComponent(file)}`,
    )
      .then((r) => {
        if (!live) return;
        // Zone de texte en LF ; le serveur rétablit les fins de ligne du fichier.
        const content = r.content?.replace(/\r\n/g, '\n') ?? null;
        setLoaded({ file, original: content });
        setText(content ?? '');
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [file, revision]);
  const groups = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const f of data?.files ?? [])
      if (f.path.toLowerCase().includes(search.trim().toLowerCase())) {
        const dir = f.path.split('/').slice(0, -1).join('/');
        out.set(dir, [...(out.get(dir) ?? []), f.path]);
      }
    return [...out];
  }, [data, search]);
  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  if (!project.components.length)
    return (
      <p className="notice">
        Aucun dossier de composants déclaré : ajoutez-en un dans la vue
        d’ensemble (ex.
        <code> src/components</code>).
      </p>
    );
  if (!data) return <p className="muted">{error || 'Lecture des dossiers…'}</p>;
  const ready = loaded && loaded.file === file;
  const dirty = !!ready && text !== (loaded.original ?? '');
  return (
    <>
      <div className="feedback" aria-live="polite">
        {error && !proposal && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
      </div>
      <div className="catalog-view">
        <nav className="catalog-list" aria-label="Fichiers de composants">
          <label className="field">
            Rechercher un fichier
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <p className="muted small">{data.files.length} fichier(s).</p>
          {groups.map(([dir, files]) => (
            <section key={dir} aria-label={dir}>
              <h3 className="list-title">{dir}</h3>
              <ul className="component-list">
                {files.map((p) => (
                  <li key={p}>
                    <button
                      aria-current={p === file ? 'true' : undefined}
                      onClick={() => setFile(p)}
                      disabled={dirty && p !== file}
                      title={
                        dirty
                          ? 'Proposez ou rétablissez vos modifications d’abord'
                          : ''
                      }
                    >
                      {p.split('/').pop()}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
        {file && (
          <section className="catalog-detail" aria-labelledby="ext-file-title">
            <header className="detail-head">
              <div>
                <p className="eyebrow">Fichier · révision c{revision}</p>
                <h2 id="ext-file-title" tabIndex={-1}>
                  {file.split('/').pop()}
                </h2>
                <p className="muted">
                  <code>{file}</code>
                </p>
              </div>
            </header>
            <div className="detail-body">
              {ready ? (
                <textarea
                  className="code-text"
                  spellCheck={false}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  aria-label={`Code de ${file}`}
                />
              ) : (
                <p className="muted">Chargement de {file}…</p>
              )}
              <div className="code-actions">
                <span className="muted small">
                  {dirty
                    ? 'Modifié, non proposé · rien n’est écrit avant validation'
                    : file}
                </span>
                <button
                  onClick={() => setText(loaded?.original ?? '')}
                  disabled={!dirty}
                >
                  Rétablir
                </button>
                <button
                  className="studio-primary"
                  disabled={!dirty || !!busy}
                  onClick={() =>
                    void run('Préparation du diff…', async () =>
                      setProposal(
                        await request<CodeProposal>(`${base}/propose`, {
                          changes: [{ path: file, content: text }],
                          message: `Édition de ${file}`,
                        }),
                      ),
                    )
                  }
                >
                  Proposer ce changement
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
      <CodeDiffDialog
        proposal={proposal}
        busy={busy}
        error={error}
        preview={false}
        target={project.name}
        onCancel={() => {
          if (proposal)
            void request(`${base}/discard`, { id: proposal.id }).catch(
              () => {},
            );
          setProposal(undefined);
        }}
        onAccept={(git) =>
          void run('Écriture et relecture…', async () => {
            const r = await request<{
              entry: CodeEntry;
              git?: { detail: string };
            }>(`${base}/commit`, {
              id: proposal!.id,
              git: git && isRepo,
            });
            setProposal(undefined);
            await refresh();
            setNotice(
              `Révision c${r.entry.revision} écrite dans le projet.${r.git ? ` ${r.git.detail}` : ''}`,
            );
          })
        }
      />
    </>
  );
}
