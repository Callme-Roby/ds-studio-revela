import { useEffect, useMemo, useState } from 'react';
import { catalog, DSProvider } from '../DesignSystem.js';
import { request } from '../api.js';
import { useTokenDraft } from '../useTokenDraft.js';
import {
  contrast,
  tokenCss,
  tokenKeys,
  type State,
  type TokenKey,
} from '../../shared/model.js';

type Usage = { file: string; line: number; text: string };
const families = [
  ['color.', 'Couleurs'],
  ['font.', 'Typographie'],
  ['space.', 'Espacements'],
  ['radius.', 'Rayons'],
] as const;
const cssVar = (k: string) => k.replace('.', '-');

// Catalogue des variables : chaque token avec son aperçu (valeur, édition,
// composants qui l'utilisent, rendus avec le brouillon) ou son code.
export default function VariablesView({
  state,
  disabled,
  onPropose,
  onOpenComponent,
  initial,
}: {
  state: State;
  disabled: boolean;
  onPropose: (key: TokenKey, value: string | number) => void;
  onOpenComponent: (id: string) => void;
  initial?: TokenKey;
}) {
  const [key, setKey] = useState<TokenKey>(() => {
    if (initial) return initial;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem('ds-studio-token-draft-v2') || 'null',
      );
      if (tokenKeys.includes(saved?.key)) return saved.key;
    } catch {
      /* Facultatif. */
    }
    return 'color.brand';
  });
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'apercu' | 'code'>('apercu');
  const [usages, setUsages] = useState<Record<string, Usage[]>>({});
  const { draft, setDraft, recovered, discard } = useTokenDraft(
    key,
    state.tokens[key].$value,
  );
  useEffect(() => {
    request<Record<string, Usage[]>>('components/usages')
      .then(setUsages)
      .catch(() => setUsages({}));
  }, [state.revision]);
  const token = state.tokens[key];
  const current = String(token.$value);
  const changed = draft !== current;
  const matching = tokenKeys.filter((k) =>
    k.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const used = usages[cssVar(key)] ?? [];
  // Composants dont les fichiers utilisent la variable, rendus avec le brouillon.
  const users = catalog.filter((c) =>
    used.some((u) => c.files.includes(u.file)),
  );
  const draftVars = useMemo(() => {
    const valid =
      token.$type === 'color'
        ? /^#[0-9a-fA-F]{6}$/.test(draft)
        : token.$type === 'dimension'
          ? draft !== '' && !Number.isNaN(Number(draft))
          : !!draft;
    const vars = tokenCss(state.tokens);
    if (valid)
      vars[`--${cssVar(key)}`] =
        token.$type === 'dimension' ? `${draft}px` : draft;
    return vars;
  }, [state.tokens, key, draft, token.$type]);
  const brandPair = (k: TokenKey) =>
    k === 'color.brand' || k === 'color.onBrand'
      ? contrast(
          k === 'color.brand' ? draft : state.tokens['color.brand'].$value,
          k === 'color.onBrand' ? draft : state.tokens['color.onBrand'].$value,
        )
      : undefined;
  const draftContrast = /^#[0-9a-fA-F]{6}$/.test(draft)
    ? brandPair(key)
    : undefined;
  const brandContrast = contrast(
    state.tokens['color.brand'].$value,
    state.tokens['color.onBrand'].$value,
  );
  return (
    <div className="catalog-view">
      <div className="catalog-list">
        <label className="field">
          Rechercher un token
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="color, space, font…"
          />
        </label>
        <p className="muted small" role="status">
          {matching.length} résultat(s).{' '}
          {search && 'La sélection courante reste accessible.'}
        </p>
        {families.map(([prefix, label]) => {
          const keys = matching.filter((k) => k.startsWith(prefix));
          if (!keys.length) return null;
          return (
            <section key={prefix} aria-label={label}>
              <h3 className="list-title">{label}</h3>
              <ul className={prefix === 'color.' ? 'token-grid' : 'token-rows'}>
                {keys.map((k) => (
                  <li key={k}>
                    <button
                      className="token-card"
                      aria-pressed={key === k}
                      aria-label={`Sélectionner ${k}`}
                      onClick={() => {
                        setKey(k);
                        setTab('apercu');
                      }}
                    >
                      {prefix === 'color.' ? (
                        <span
                          className="token-chip"
                          style={{ background: String(state.tokens[k].$value) }}
                        />
                      ) : (
                        <span className="token-measure">
                          {prefix === 'font.' && k !== 'font.family'
                            ? 'Aa'
                            : ''}
                        </span>
                      )}
                      <span className="token-name">{k.split('.')[1]}</span>
                      <span className="token-value">
                        {String(state.tokens[k].$value)}
                        {state.tokens[k].$type === 'dimension' ? 'px' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <section className="catalog-detail" aria-labelledby="ds-title">
        <header className="detail-head">
          <div>
            <p className="eyebrow">Variable · {token.$type}</p>
            <h2 id="ds-title" tabIndex={-1}>
              {key}
            </h2>
            <p className="muted">
              <code>var(--{cssVar(key)})</code> · utilisée à {used.length}{' '}
              endroit(s) dans ds/src
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
                onPropose(
                  key,
                  token.$type === 'dimension' ? Number(draft) : draft,
                );
              }}
            >
              <label className="field">
                Token
                <select
                  value={key}
                  onChange={(e) => setKey(e.target.value as TokenKey)}
                >
                  {[...new Set([key, ...matching])].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Valeur
                {token.$type === 'fontFamily' ? (
                  <select
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  >
                    {['system-ui', 'Arial', 'Georgia', 'Verdana'].map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label="Valeur du token"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    required
                    type={token.$type === 'dimension' ? 'number' : 'text'}
                    min={token.$type === 'dimension' ? 0 : undefined}
                    max={token.$type === 'dimension' ? 128 : undefined}
                    step={token.$type === 'dimension' ? 'any' : undefined}
                    maxLength={20}
                  />
                )}
              </label>
              {token.$type === 'color' && (
                <label className="field color-picker">
                  Choisir
                  <input
                    aria-label="Sélecteur de couleur"
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(draft) ? draft : current}
                    onChange={(e) => setDraft(e.target.value.toUpperCase())}
                  />
                </label>
              )}
              <button
                className="studio-primary"
                disabled={disabled || !changed}
              >
                Proposer
              </button>
            </form>
            {changed && (
              <p className="draft-status" role="status">
                {recovered
                  ? 'Brouillon récupéré dans cet onglet.'
                  : 'Brouillon non enregistré.'}{' '}
                Rien n’est appliqué.
                <button type="button" onClick={discard}>
                  Abandonner le brouillon
                </button>
              </p>
            )}
            <p className="muted small">
              {token.$type === 'color'
                ? '#RRGGBB · '
                : token.$type === 'dimension'
                  ? 'Pixels, de 0 à 128 · '
                  : ''}
              Rien n’est écrit avant validation. L’aperçu ci-dessous montre déjà
              le brouillon.
            </p>
            <p className="contrast" aria-live="polite">
              Marque / texte sur marque :{' '}
              <strong>{brandContrast.toFixed(2)}:1</strong> ·{' '}
              {brandContrast >= 4.5
                ? 'AA texte courant'
                : 'Contraste à améliorer'}
            </p>
            {draftContrast !== undefined && changed && (
              <p className="contrast" role="status">
                Contraste proposé :{' '}
                <strong>{draftContrast.toFixed(2)}:1</strong> ·{' '}
                {draftContrast >= 4.5
                  ? 'AA texte courant'
                  : 'Contraste à améliorer'}
                . Cette indication ne certifie pas tous les états du composant.
              </p>
            )}
            <h3 className="list-title">Composants qui l’utilisent</h3>
            {!users.length && (
              <p className="muted">
                Aucun composant du catalogue n’utilise directement cette
                variable (voir l’onglet Code pour les écrans et la base).
              </p>
            )}
            <div className="usage-previews">
              {users.map((c) => (
                <article key={c.id} className="usage-card">
                  <header>
                    <strong>{c.name}</strong>
                    <button
                      className="link-button"
                      onClick={() => onOpenComponent(c.id)}
                    >
                      Ouvrir le composant
                    </button>
                  </header>
                  <div className="ds-canvas">
                    <DSProvider vars={draftVars}>
                      <c.Demo />
                    </DSProvider>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="detail-body">
            <h3 className="list-title">ds/tokens.css (généré)</h3>
            <pre className="code-block">
              {changed ? (
                <>
                  <span className="del">{`-  --${cssVar(key)}: ${current}${token.$type === 'dimension' ? 'px' : ''};`}</span>
                  <span className="add">{`+  --${cssVar(key)}: ${draft}${token.$type === 'dimension' ? 'px' : ''};`}</span>
                </>
              ) : (
                <span>{`   --${cssVar(key)}: ${current}${token.$type === 'dimension' ? 'px' : ''};`}</span>
              )}
            </pre>
            <h3 className="list-title">Utilisations dans ds/src</h3>
            {!used.length && (
              <p className="muted">Aucune utilisation trouvée.</p>
            )}
            <ul className="usage-list">
              {used.map((u, i) => {
                const owner = catalog.find((c) => c.files.includes(u.file));
                return (
                  <li key={i}>
                    <code>
                      {u.file}:{u.line}
                    </code>
                    <span>{u.text}</span>
                    {owner && (
                      <button
                        className="link-button"
                        onClick={() => onOpenComponent(owner.id)}
                      >
                        {owner.name}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
