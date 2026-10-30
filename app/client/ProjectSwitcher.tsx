import logo from './logo.png';
import { useEffect, useRef, useState } from 'react';
import { request } from './api.js';
import type { ProjectView } from '../shared/projects.js';

export type Projects = { active: string; projects: ProjectView[] };

// Sélecteur de projet (haut de la barre latérale) et formulaire d'ajout.
export default function ProjectSwitcher({
  data,
  onChange,
  onAdded,
  onOnboarding,
}: {
  data: Projects;
  onChange: (next: Projects) => void;
  // Projet tout juste ajouté (devenu actif).
  onAdded?: (next: Projects) => void;
  onOnboarding?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const active =
    data.projects.find((p) => p.id === data.active) ?? data.projects[0];
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    addEventListener('mousedown', close);
    return () => removeEventListener('mousedown', close);
  }, [open]);
  async function select(id: string) {
    setOpen(false);
    if (id !== data.active)
      onChange(await request<Projects>('projects/active', { id }));
  }
  return (
    <div className="project-switcher" ref={menu}>
      <button
        className="project-current"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {active.builtin ? (
          <img className="brand-logo" src={logo} alt="" />
        ) : (
          <span className="brand-symbol">{active.name.slice(0, 2)}</span>
        )}
        <span>
          <strong>{active.name}</strong>
          <small>
            {active.builtin ? 'Projet intégré · DS-Studio' : 'Projet externe'}
          </small>
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="project-menu" role="menu" aria-label="Projets">
          {data.projects.map((p) => (
            <button
              key={p.id}
              role="menuitemradio"
              aria-checked={p.id === data.active}
              onClick={() => void select(p.id)}
            >
              <span>{p.name}</span>
              <small>
                {p.builtin
                  ? 'intégré'
                  : p.source.type === 'github'
                    ? 'GitHub'
                    : 'dossier local'}
              </small>
            </button>
          ))}
          <button
            role="menuitem"
            className="project-add"
            onClick={() => {
              setOpen(false);
              setAdding(true);
            }}
          >
            + Ajouter un projet…
          </button>
          {onOnboarding && (
            <button
              role="menuitem"
              className="project-add"
              onClick={() => {
                setOpen(false);
                onOnboarding();
              }}
            >
              Assistant de démarrage…
            </button>
          )}
        </div>
      )}
      {adding && (
        <AddProject
          onCancel={() => setAdding(false)}
          onAdded={(next) => {
            setAdding(false);
            onChange(next);
            onAdded?.(next);
          }}
        />
      )}
    </div>
  );
}

function AddProject({
  onCancel,
  onAdded,
}: {
  onCancel: () => void;
  onAdded: (next: Projects) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'local' | 'github'>('local');
  const [root, setRoot] = useState('');
  const [url, setUrl] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [plugin, setPlugin] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit() {
    setSaving(true);
    setError('');
    try {
      // GitHub : DS-Studio clone le dépôt dans le dossier indiqué (vide ou absent).
      onAdded(
        type === 'github'
          ? await request<Projects>('projects/clone', {
              name,
              url,
              dest: root,
              figma: { plugin, fileUrl },
            })
          : await request<Projects>('projects/add', {
              name,
              root,
              source: { type, url: '' },
              figma: { plugin, fileUrl },
            }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="add-project"
      aria-labelledby="add-project-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onCancel();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 id="add-project-title">Ajouter un projet</h2>
        <p className="muted small">
          DS-Studio enregistre le projet sans rien lire ni exécuter de son
          contenu. Tokens, composants et aperçu se configurent aux étapes
          suivantes.
        </p>
        <label className="field">
          Nom du projet
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
          />
        </label>
        <fieldset className="field">
          <legend>Source</legend>
          <div
            className="segmented-ui"
            role="radiogroup"
            aria-label="Source du projet"
          >
            <button
              type="button"
              role="radio"
              aria-checked={type === 'local'}
              aria-pressed={type === 'local'}
              onClick={() => setType('local')}
            >
              Dossier local
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={type === 'github'}
              aria-pressed={type === 'github'}
              onClick={() => setType('github')}
            >
              Dépôt GitHub
            </button>
          </div>
        </fieldset>
        {type === 'github' && (
          <label className="field">
            URL du dépôt GitHub
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/compte/depot"
              required
            />
            <span className="muted small">
              DS-Studio clone le dépôt avec vos identifiants Git habituels
              (fenêtre de connexion si besoin). Rien n’est envoyé sans votre
              clic.
            </span>
          </label>
        )}
        <label className="field">
          {type === 'github'
            ? 'Cloner dans le dossier (chemin absolu, vide ou à créer)'
            : 'Dossier du projet sur ce poste (chemin absolu)'}
          <input
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            placeholder="D:\projets\mon-projet"
            required
          />
        </label>
        <label className="field">
          Fichier Figma (facultatif)
          <input
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            placeholder="https://www.figma.com/design/…"
          />
        </label>
        <label className="checks-ack">
          <input
            type="checkbox"
            checked={plugin}
            onChange={(e) => setPlugin(e.target.checked)}
          />
          Ce projet est synchronisé avec Figma par le plugin DS Studio to Figma
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={saving}>
            Annuler
          </button>
          <button className="studio-primary" disabled={saving}>
            {saving
              ? type === 'github'
                ? 'Clonage…'
                : 'Ajout…'
              : type === 'github'
                ? 'Cloner et ajouter'
                : 'Ajouter le projet'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
