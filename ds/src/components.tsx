import { useState, type CSSProperties, type ReactNode } from 'react';

// DS Revela : composants de l'application, sans Electron ni boîtier. Toute
// couleur, taille et marge passe par une variable de ds/tokens.css. DS-Studio
// les affiche tels quels et peut surcharger les variables pour l'aperçu.

export type Vars = Record<string, string>;


export function DSProvider({
  vars,
  children,
}: {
  vars?: Vars;
  children: ReactNode;
}) {
  return (
    <div className="ds" style={vars as CSSProperties | undefined}>
      {children}
    </div>
  );
}
export function Button({
  variant = 'primary',
  children,
  disabled = false,
  onClick,
}: {
  variant?: 'primary' | 'secondary' | 'danger';
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`ds-button ${variant}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function LiveBadge({ state }: { state: 'live' | 'offline' | 'error' }) {
  const label = {
    live: '● LIVE 30 fps',
    offline: '○ Hors ligne',
    error: '✕ Boîtier en erreur',
  }[state];
  return <span className={`rv-live ${state}`}>{label}</span>;
}
export function Alert({
  tone,
  children,
}: {
  tone: 'warning' | 'danger';
  children: ReactNode;
}) {
  return (
    <p className={`rv-alert ${tone}`} role="status">
      {children}
    </p>
  );
}
// Fond de vignette : contenu photo simulé en niveaux de gris, pas un token d'interface.
const shades = ['28%', '46%', '62%', '36%', '54%', '70%', '40%', '58%'];
export function Thumb({
  name,
  index,
  jpeg = false,
  initialPick = false,
}: {
  name: string;
  index: number;
  jpeg?: boolean;
  initialPick?: boolean;
}) {
  const [picked, setPicked] = useState(initialPick);
  return (
    <figure className={`rv-thumb${picked ? ' is-pick' : ''}`}>
      <div
        className="rv-photo"
        style={{ '--shade': shades[index % shades.length] } as CSSProperties}
      />
      <button
        className="rv-pick"
        aria-pressed={picked}
        aria-label={picked ? `Retirer ${name}` : `Retenir ${name}`}
        onClick={() => setPicked(!picked)}
      >
        {picked ? '★' : '☆'}
      </button>
      <figcaption>
        {name}
        {jpeg && <em> +JPEG</em>}
      </figcaption>
    </figure>
  );
}
export function Slider({
  label,
  initial,
  unit = '',
  min = -100,
  max = 100,
}: {
  label: string;
  initial: number;
  unit?: string;
  min?: number;
  max?: number;
}) {
  const [value, setValue] = useState(initial);
  return (
    <label className="rv-control">
      <span className="rv-label">
        {label}
        <em>
          {value}
          {unit}
        </em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
      />
    </label>
  );
}
export function Segmented({
  label,
  options,
}: {
  label: string;
  options: string[];
}) {
  const [value, setValue] = useState(options[0]);
  return (
    <div className="rv-segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          aria-pressed={value === o}
          onClick={() => setValue(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
export function Field({
  label,
  placeholder,
}: {
  label: string;
  placeholder: string;
}) {
  return (
    <label className="rv-field">
      <span className="rv-label">{label}</span>
      <input placeholder={placeholder} />
    </label>
  );
}
export function AiSearch() {
  const [query, setQuery] = useState('');
  const [done, setDone] = useState('');
  return (
    <form
      className="rv-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        setDone(query.trim());
      }}
    >
      <label className="rv-search-field">
        <span className="rv-ai-dot" aria-hidden="true" />
        <input
          aria-label="Recherche par description"
          placeholder="portrait en lumière douce, fond gris…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setDone('');
          }}
        />
      </label>
      <button className="ds-button secondary" type="submit">
        Chercher
      </button>
      <p className="rv-status" role="status">
        {done
          ? `Recherche de démonstration : « ${done} », aucune donnée envoyée.`
          : ''}
      </p>
    </form>
  );
}
export function Channels() {
  return (
    <div className="rv-channels">
      {(['R', 'G', 'B'] as const).map((c) => (
        <span key={c} className={`rv-channel ${c}`}>
          <span aria-hidden="true" />
          Canal {c === 'G' ? 'V' : c}
        </span>
      ))}
      <span className="rv-channel mask">
        <span aria-hidden="true" />
        Poignée de masque
      </span>
    </div>
  );
}
export function Tooltip({ children }: { children: ReactNode }) {
  return (
    <span className="rv-tooltip" role="note">
      {children}
    </span>
  );
}
export function ModeTabs({
  mode,
  onMode,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
}) {
  return (
    <nav aria-label="Modes de Revela" className="rv-modes">
      {modes.map((m) => (
        <button
          key={m.id}
          aria-current={mode === m.id ? 'page' : undefined}
          onClick={() => onMode(m.id)}
        >
          {m.label}
        </button>
      ))}
    </nav>
  );
}
type Mode = 'studio' | 'catalogue' | 'developpement';
const modes: { id: Mode; label: string }[] = [
  { id: 'studio', label: 'Prise de vue' },
  { id: 'catalogue', label: 'Bibliothèque' },
  { id: 'developpement', label: 'Développement' },
];
export const scenarios = modes;

export function Catalogue({ vars }: { vars?: Vars }) {
  return (
    <DSProvider vars={vars}>
      <div className="catalogue">
        <section>
          <div className="section-label">01 / ACTIONS</div>
          <h3>Un langage commun.</h3>
          <p>Les mêmes tokens, du composant aux écrans de Revela.</p>
          <div className="button-row">
            <Button>Action principale</Button>
            <Button variant="secondary">Secondaire</Button>
            <Button variant="danger">Supprimer</Button>
            <Button disabled>Indisponible</Button>
          </div>
          <p className="ds-caption">
            Survolez, utilisez Tab et activez les boutons. Focus et états natifs
            inclus.
          </p>
        </section>
        <section>
          <div className="section-label">02 / ÉTAT DU BOÎTIER</div>
          <div className="button-row">
            <LiveBadge state="live" />
            <LiveBadge state="offline" />
            <LiveBadge state="error" />
          </div>
          <Alert tone="warning">
            Réglage tenu par le boîtier : modifiez-le sur l’appareil.
          </Alert>
          <Alert tone="danger">
            Connexion USB perdue. Rebranchez le boîtier puis réessayez.
          </Alert>
        </section>
        <section>
          <div className="section-label">03 / PHOTOS ET SÉLECTION</div>
          <div className="rv-strip">
            {['DSC_0412', 'DSC_0413', 'DSC_0414', 'DSC_0415'].map((n, i) => (
              <Thumb
                key={n}
                name={n}
                index={i}
                jpeg={i === 1}
                initialPick={i === 2}
              />
            ))}
          </div>
        </section>
        <section>
          <div className="section-label">04 / RÉGLAGES</div>
          <Segmented label="Filtre des photos" options={['Toutes', 'Favoris']} />
          <Slider label="EXPOSITION" initial={12} />
          <Slider label="TEMPÉRATURE" initial={5600} unit=" K" min={2000} max={10000} />
          <Field label="NOM DU PROFIL" placeholder="Portrait studio" />
        </section>
        <section>
          <div className="section-label">05 / RECHERCHE IA</div>
          <AiSearch />
        </section>
        <section>
          <div className="section-label">06 / COULEUR ET AIDE</div>
          <Channels />
          <Tooltip>Cliquer pour revenir au live view</Tooltip>
        </section>
      </div>
    </DSProvider>
  );
}

function Photo({ shade }: { shade: string }) {
  return (
    <div
      className="rv-photo rv-photo-large"
      role="img"
      aria-label="Photo de démonstration"
      style={{ '--shade': shade } as CSSProperties}
    />
  );
}
function StudioScreen() {
  const [shots, setShots] = useState(6);
  return (
    <>
      <section className="rv-stage" aria-label="Live view">
        <Photo shade="48%" />
        <LiveBadge state="live" />
      </section>
      <aside className="rv-aside" aria-label="Réglages du boîtier">
        <h2>RÉGLAGES</h2>
        <Slider label="ISO" initial={200} min={100} max={6400} />
        <Slider label="OUVERTURE" initial={8} min={2} max={22} unit=" f" />
        <Alert tone="warning">Vitesse tenue par le boîtier.</Alert>
        <Field label="NOM DU PROFIL" placeholder="Portrait studio" />
      </aside>
      <footer className="rv-meta">
        <span>1/125 · f/8 · ISO 200 · 5600 K</span>
        <span className="rv-status" role="status">
          {shots > 6 ? `${shots - 6} photo(s) de démonstration ajoutée(s).` : ''}
        </span>
        <Button onClick={() => setShots(shots + 1)}>Déclencher</Button>
      </footer>
      <section className="rv-filmstrip" aria-label="Bande des vues">
        <Segmented label="Filtre des photos" options={['Toutes', 'Favoris']} />
        <div className="rv-strip">
          {Array.from({ length: shots }, (_, i) => (
            <Thumb
              key={i}
              name={`DSC_${String(410 + i).padStart(4, '0')}`}
              index={i}
              jpeg={i % 3 === 0}
              initialPick={i === 1}
            />
          ))}
        </div>
      </section>
    </>
  );
}
function LibraryScreen() {
  return (
    <>
      <section className="rv-stage rv-library" aria-label="Photos">
        <div className="rv-toolbar">
          <Segmented label="Vue" options={['Projets', 'Photos']} />
          <AiSearch />
        </div>
        <Alert tone="warning">Indexation en cours : 128 photos sur 240.</Alert>
        <div className="rv-grid">
          {Array.from({ length: 12 }, (_, i) => (
            <Thumb
              key={i}
              name={`IMG_${String(2201 + i)}`}
              index={i}
              jpeg={i % 4 === 0}
              initialPick={i % 5 === 0}
            />
          ))}
        </div>
      </section>
      <aside className="rv-aside" aria-label="Export">
        <h2>EXPORT</h2>
        <Segmented label="Format" options={['JPEG', 'TIFF']} />
        <Slider label="QUALITÉ" initial={90} min={1} max={100} />
        <Slider label="CÔTÉ LE PLUS LONG" initial={3000} min={800} max={8000} unit=" px" />
        <Button>Exporter la sélection</Button>
      </aside>
    </>
  );
}
function DevelopScreen() {
  return (
    <>
      <section className="rv-stage" aria-label="Photo en développement">
        <Photo shade="56%" />
        <Tooltip>Maintenir pour comparer avec l’original</Tooltip>
      </section>
      <aside className="rv-aside" aria-label="Développement">
        <h2>DÉVELOPPEMENT</h2>
        <p className="rv-file">
          DSC_0414.ARW <span>rendu neutre</span>
        </p>
        <Segmented label="Outil" options={['Lumière', 'Couleur', 'Rognage']} />
        <Slider label="EXPOSITION" initial={0} />
        <Slider label="CONTRASTE" initial={8} />
        <Slider label="TEMPÉRATURE" initial={5600} unit=" K" min={2000} max={10000} />
        <h3>COURBE</h3>
        <Channels />
        <Button variant="secondary">Réinitialiser</Button>
      </aside>
    </>
  );
}
export function Scenario({
  vars,
  scenario,
}: {
  vars?: Vars;
  scenario: string;
}) {
  const [mode, setMode] = useState<Mode>(
    modes.some((m) => m.id === scenario) ? (scenario as Mode) : 'studio',
  );
  return (
    <DSProvider vars={vars}>
      <div className={`scenario rv-app rv-mode-${mode}`}>
        <header className="rv-topbar">
          <strong className="rv-logo">Revela</strong>
          <ModeTabs mode={mode} onMode={setMode} />
          <span className="rv-filename">Séance · Portrait studio</span>
        </header>
        {mode === 'studio' ? (
          <StudioScreen />
        ) : mode === 'catalogue' ? (
          <LibraryScreen />
        ) : (
          <DevelopScreen />
        )}
      </div>
    </DSProvider>
  );
}
