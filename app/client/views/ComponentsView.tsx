import { useEffect, useState } from 'react';
import { catalog, DSProvider } from '../DesignSystem.js';
import { request } from '../api.js';
import { tokenCss, type State } from '../../shared/model.js';

// Catalogue des composants : chaque entrée du registre ds/src/catalog.tsx avec
// son aperçu (démonstration avec les tokens validés) ou son code source, éditable.
// Les écrans et la base du DS sont des entrées à part.
type Entry = {
  id: string;
  name: string;
  group: string;
  description: string;
  files: string[];
};
const extra: Entry[] = [
  {
    id: 'screens',
    name: 'Écrans Revela',
    group: 'Assemblages',
    description:
      'Prise de vue, Bibliothèque et Développement, assemblés avec les composants.',
    files: ['screens/Scenario.tsx', 'screens/screens.css'],
  },
  {
    id: 'base',
    name: 'Base du DS',
    group: 'Assemblages',
    description:
      'Fournisseur des variables, typographie de base, registre du catalogue.',
    files: ['provider.tsx', 'base.css', 'catalog.tsx', 'index.ts'],
  },
];

export default function ComponentsView({
  state,
  codeRevision,
  selected,
  onSelect,
  onPropose,
  onOpenVariable,
  busy,
}: {
  state: State;
  codeRevision: number;
  selected: string;
  onSelect: (id: string) => void;
  onPropose: (item: string, file: string, content: string) => void;
  onOpenVariable: (key: string) => void;
  busy: boolean;
}) {
  const entries: Entry[] = [...catalog, ...extra];
  const item = entries.find((e) => e.id === selected) ?? entries[0];
  const [tab, setTab] = useState<'apercu' | 'code'>('apercu');
  const [chosen, setChosen] = useState(item.files[0]);
  const file = item.files.includes(chosen) ? chosen : item.files[0];
  // Contenu chargé, toujours rattaché à son fichier : l'éditeur n'affiche et ne
  // propose jamais le texte d'un autre fichier pendant un changement d'onglet.
  const [loaded, setLoaded] = useState<{
    file: string;
    original: string | null;
  }>();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [vars, setVars] = useState<string[]>([]);
  // Contenu du fichier courant, relu à chaque révision de code.
  useEffect(() => {
    let live = true;
    setError('');
    setLoaded(undefined);
    request<{ content: string | null }>(
      `components/file?path=${encodeURIComponent(file)}`,
    )
      .then((r) => {
        if (!live) return;
        // Une zone de texte ramène toujours les fins de ligne à LF : la
        // comparaison se fait donc en LF, le serveur rétablit celles du fichier.
        const content = r.content?.replace(/\r\n/g, '\n') ?? null;
        setLoaded({ file, original: content });
        setText(content ?? '');
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [file, codeRevision]);
  const ready = loaded?.file === file;
  const original = ready ? loaded.original : null;
  // Variables utilisées par l'ensemble des fichiers de l'entrée.
  useEffect(() => {
    Promise.all(
      item.files.map((f) =>
        request<{ content: string | null }>(
          `components/file?path=${encodeURIComponent(f)}`,
        ),
      ),
    )
      .then((all) => {
        const found = new Set<string>();
        for (const r of all)
          for (const m of (r.content ?? '').matchAll(/var\(--([A-Za-z0-9-]+)/g))
            found.add(m[1]);
        setVars([...found].sort());
      })
      .catch(() => setVars([]));
  }, [item.id, codeRevision]);
  const dirty = original !== null && text !== original;
  const groups = [...new Set(entries.map((e) => e.group))];
  const Demo = catalog.find((c) => c.id === item.id)?.Demo;
  return (
    <div className="catalog-view">
      <nav className="catalog-list" aria-label="Composants du DS">
        {groups.map((g) => (
          <section key={g} aria-label={g}>
            <h3 className="list-title">{g}</h3>
            <ul className="component-list">
              {entries
                .filter((e) => e.group === g)
                .map((e) => (
                  <li key={e.id}>
                    <button
                      aria-current={e.id === item.id ? 'true' : undefined}
                      onClick={() => onSelect(e.id)}
                      disabled={dirty && e.id !== item.id}
                      title={
                        dirty
                          ? 'Proposez ou rétablissez vos modifications d’abord'
                          : ''
                      }
                    >
                      {e.name}
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </nav>
      <section className="catalog-detail" aria-labelledby="component-title">
        <header className="detail-head">
          <div>
            <p className="eyebrow">Composant · {item.group}</p>
            <h2 id="component-title" tabIndex={-1}>
              {item.name}
            </h2>
            <p className="muted">{item.description}</p>
          </div>
          <div
            className="tabs"
            role="tablist"
            aria-label="Affichage du composant"
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
            {item.id === 'screens' ? (
              <iframe
                className="screen-thumb"
                title="Écran Prise de vue"
                src="/?preview=1&scenario=studio"
              />
            ) : Demo ? (
              <div className="ds-canvas large">
                <DSProvider vars={tokenCss(state.tokens)}>
                  <Demo />
                </DSProvider>
              </div>
            ) : (
              <p className="muted">
                Pas d’aperçu : ces fichiers servent à tous les composants.
              </p>
            )}
            <h3 className="list-title">Variables utilisées</h3>
            <div className="chips">
              {vars.map((v) => (
                <button
                  key={v}
                  className="chip"
                  onClick={() => onOpenVariable(v)}
                >
                  --{v}
                </button>
              ))}
              {!vars.length && <span className="muted">Aucune.</span>}
            </div>
            <h3 className="list-title">Fichiers</h3>
            <ul className="usage-list">
              {item.files.map((f) => (
                <li key={f}>
                  <code>ds/src/{f}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="detail-body">
            <div className="file-tabs" role="tablist" aria-label="Fichiers">
              {item.files.map((f) => (
                <button
                  key={f}
                  role="tab"
                  aria-selected={f === file}
                  onClick={() => setChosen(f)}
                  disabled={dirty && f !== file}
                >
                  {f.split('/').pop()}
                </button>
              ))}
            </div>
            {ready ? (
              <textarea
                className="code-text"
                spellCheck={false}
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label={`Code de ${file}`}
              />
            ) : (
              <p className="muted">Chargement de ds/src/{file}…</p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="code-actions">
              <span className="muted small">
                {dirty
                  ? 'Modifié, non proposé · rien n’est écrit avant validation'
                  : `ds/src/${file}`}
              </span>
              <button onClick={() => setText(original ?? '')} disabled={!dirty}>
                Rétablir
              </button>
              <button
                className="studio-primary"
                onClick={() => onPropose(item.id, file, text)}
                disabled={!ready || !dirty || busy}
              >
                Proposer ce changement
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
