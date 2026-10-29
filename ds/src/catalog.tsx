import { useState, type ReactNode } from 'react';
import { Button } from './components/Button.js';
import { LiveBadge } from './components/LiveBadge.js';
import { Alert } from './components/Alert.js';
import { Thumb } from './components/Thumb.js';
import { Slider } from './components/Slider.js';
import { Segmented } from './components/Segmented.js';
import { Field } from './components/Field.js';
import { AiSearch } from './components/AiSearch.js';
import { Channels } from './components/Channels.js';
import { Tooltip } from './components/Tooltip.js';
import { ModeTabs, type Mode } from './components/ModeTabs.js';

// Registre du catalogue : chaque composant, ses fichiers source et une
// démonstration de ses états. DS-Studio s'en sert pour l'aperçu et le code.

export type CatalogItem = {
  id: string;
  name: string;
  group: string;
  description: string;
  files: string[];
  Demo: () => ReactNode;
};
const files = (name: string) => [
  `components/${name}.tsx`,
  `components/${name}.css`,
];

function ModeTabsDemo() {
  const [mode, setMode] = useState<Mode>('studio');
  return <ModeTabs mode={mode} onMode={setMode} />;
}

export const catalog: CatalogItem[] = [
  {
    id: 'button',
    name: 'Button',
    group: 'Actions',
    description:
      'Action principale, secondaire, destructive ; états survol, focus et désactivé.',
    files: files('Button'),
    Demo: () => (
      <div className="button-row">
        <Button>Déclencher</Button>
        <Button variant="secondary">Secondaire</Button>
        <Button variant="danger">Supprimer</Button>
        <Button disabled>Indisponible</Button>
      </div>
    ),
  },
  {
    id: 'live-badge',
    name: 'LiveBadge',
    group: 'Statut',
    description: 'État du boîtier connecté : live, hors ligne, erreur.',
    files: files('LiveBadge'),
    Demo: () => (
      <div className="button-row">
        <LiveBadge state="live" />
        <LiveBadge state="offline" />
        <LiveBadge state="error" />
      </div>
    ),
  },
  {
    id: 'alert',
    name: 'Alert',
    group: 'Statut',
    description:
      'Message d’avertissement ou d’erreur, annoncé aux lecteurs d’écran.',
    files: files('Alert'),
    Demo: () => (
      <>
        <Alert tone="warning">
          Réglage tenu par le boîtier : modifiez-le sur l’appareil.
        </Alert>
        <Alert tone="danger">
          Connexion USB perdue. Rebranchez le boîtier puis réessayez.
        </Alert>
      </>
    ),
  },
  {
    id: 'thumb',
    name: 'Thumb',
    group: 'Photos',
    description:
      'Vignette de photo avec sélection (étoile) et mention RAW+JPEG.',
    files: files('Thumb'),
    Demo: () => (
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
    ),
  },
  {
    id: 'slider',
    name: 'Slider',
    group: 'Réglages',
    description: 'Réglage numérique avec libellé et valeur courante.',
    files: files('Slider'),
    Demo: () => (
      <>
        <Slider label="EXPOSITION" initial={12} />
        <Slider
          label="TEMPÉRATURE"
          initial={5600}
          unit=" K"
          min={2000}
          max={10000}
        />
      </>
    ),
  },
  {
    id: 'segmented',
    name: 'Segmented',
    group: 'Réglages',
    description: 'Choix exclusif entre quelques options.',
    files: files('Segmented'),
    Demo: () => (
      <Segmented
        label="Filtre des photos"
        options={['Toutes', 'Favoris', 'Rejetées']}
      />
    ),
  },
  {
    id: 'field',
    name: 'Field',
    group: 'Réglages',
    description: 'Champ de saisie avec libellé.',
    files: files('Field'),
    Demo: () => <Field label="NOM DU PROFIL" placeholder="Portrait studio" />,
  },
  {
    id: 'ai-search',
    name: 'AiSearch',
    group: 'Recherche',
    description:
      'Recherche de photos par description (démonstration, aucune donnée envoyée).',
    files: files('AiSearch'),
    Demo: () => <AiSearch />,
  },
  {
    id: 'channels',
    name: 'Channels',
    group: 'Couleur et aide',
    description: 'Pastilles des canaux R, V, B et poignée de masque.',
    files: files('Channels'),
    Demo: () => <Channels />,
  },
  {
    id: 'tooltip',
    name: 'Tooltip',
    group: 'Couleur et aide',
    description: 'Bulle d’aide posée sur le passe-partout.',
    files: files('Tooltip'),
    Demo: () => (
      <div className="catalog-mat">
        <Tooltip>Cliquer pour revenir au live view</Tooltip>
      </div>
    ),
  },
  {
    id: 'mode-tabs',
    name: 'ModeTabs',
    group: 'Navigation',
    description:
      'Onglets des modes de Revela : prise de vue, bibliothèque, développement.',
    files: files('ModeTabs'),
    Demo: ModeTabsDemo,
  },
];
