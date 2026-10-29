import { useState, type CSSProperties } from 'react';
import { DSProvider, type Vars } from '../provider.js';
import { Button } from '../components/Button.js';
import { Thumb } from '../components/Thumb.js';
import { LiveBadge } from '../components/LiveBadge.js';
import { Alert } from '../components/Alert.js';
import { Slider } from '../components/Slider.js';
import { Segmented } from '../components/Segmented.js';
import { Field } from '../components/Field.js';
import { AiSearch } from '../components/AiSearch.js';
import { Channels } from '../components/Channels.js';
import { Tooltip } from '../components/Tooltip.js';
import { ModeTabs, modes, type Mode } from '../components/ModeTabs.js';
import './screens.css';

// Écrans de Revela assemblés avec les composants du DS.
export const scenarios = modes;

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
          {shots > 6
            ? `${shots - 6} photo(s) de démonstration ajoutée(s).`
            : ''}
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
        <Slider
          label="CÔTÉ LE PLUS LONG"
          initial={3000}
          min={800}
          max={8000}
          unit=" px"
        />
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
        <Slider
          label="TEMPÉRATURE"
          initial={5600}
          unit=" K"
          min={2000}
          max={10000}
        />
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
