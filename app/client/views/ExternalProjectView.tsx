import { useState } from 'react';
import { request } from '../api.js';
import type { Projects } from '../ProjectSwitcher.js';
import type { ProjectView } from '../../shared/projects.js';

// Projet externe : fiche du projet (dossier, Git, Figma) et ce qui reste à
// brancher. Les variables, composants et l'aperçu arrivent aux étapes D2 à D6.
const steps = [
  [
    'D2',
    'Variables',
    'tokens du projet lus et réécrits sur place, avec diff et historique',
  ],
  [
    'D3',
    'Composants et Git',
    'fichiers de composants, clonage GitHub, commits, envoi au clic',
  ],
  ['D4', 'Aperçu', 'le serveur de développement du projet, à largeur réelle'],
  [
    'D5',
    'Analyse par l’IA',
    'Claude propose où sont tokens et composants, vous validez',
  ],
  ['D6', 'Figma', 'collection du projet synchronisée par le plugin'],
] as const;

export default function ExternalProjectView({
  project,
  onChange,
}: {
  project: ProjectView;
  onChange: (next: Projects) => void;
}) {
  const [fileUrl, setFileUrl] = useState(project.figma.fileUrl);
  const [plugin, setPlugin] = useState(project.figma.plugin);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function act(route: string, body: unknown, done: string) {
    setError('');
    setNotice('');
    try {
      onChange(await request<Projects>(route, body));
      setNotice(done);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="cards">
      <article className="card">
        <h2>Dossier</h2>
        <p>
          <code className="path">{project.root}</code>
        </p>
        <p className={project.exists ? 'muted small' : 'error'}>
          {project.exists
            ? 'Dossier présent sur ce poste.'
            : 'Dossier introuvable : déplacé ou supprimé ?'}
        </p>
        <h2>Git</h2>
        {project.git ? (
          <p className="muted">
            Branche <code>{project.git.branch}</code>
            {project.git.remote ? (
              <>
                {' '}
                · origine <code className="path">{project.git.remote}</code>
              </>
            ) : (
              ' · pas de dépôt distant'
            )}
            {' · '}
            {project.git.dirty
              ? `${project.git.dirty} fichier(s) modifié(s) non commités`
              : 'aucune modification en cours'}
          </p>
        ) : (
          <p className="muted">Pas un dépôt Git.</p>
        )}
        {project.source.type === 'github' && (
          <p className="muted small">
            Source : <code className="path">{project.source.url}</code>
          </p>
        )}
      </article>
      <article className="card">
        <h2>Figma</h2>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void act(
              'projects/figma',
              { id: project.id, figma: { plugin, fileUrl } },
              'Réglages Figma enregistrés.',
            );
          }}
        >
          <label className="field">
            Fichier Figma
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
            Synchronisé avec Figma par le plugin DS-Studio
          </label>
          <div className="row">
            <button>Enregistrer</button>
            {project.figma.fileUrl && (
              <a
                className="link-button"
                href={project.figma.fileUrl}
                target="_blank"
                rel="noreferrer"
              >
                Ouvrir dans Figma
              </a>
            )}
          </div>
        </form>
      </article>
      <article className="card">
        <h2>À brancher</h2>
        <ol className="steps">
          {steps.map(([id, title, detail]) => (
            <li key={id}>
              <strong>
                {id} · {title}
              </strong>
              <span className="muted small">{detail}</span>
            </li>
          ))}
        </ol>
      </article>
      <article className="card">
        <h2>Retirer le projet</h2>
        <p className="muted small">
          DS-Studio oublie ce projet ; aucun fichier n’est supprimé, ni dans son
          dossier ni dans l’état de DS-Studio.
        </p>
        <div className="row">
          <button
            onClick={() => {
              if (
                confirm(
                  `Retirer « ${project.name} » de DS-Studio ? Aucun fichier ne sera supprimé.`,
                )
              )
                void act(
                  'projects/remove',
                  { id: project.id },
                  'Projet retiré.',
                );
            }}
          >
            Retirer de DS-Studio
          </button>
        </div>
      </article>
      {(error || notice) && (
        <p
          className={error ? 'error' : 'notice'}
          role={error ? 'alert' : 'status'}
        >
          {error || notice}
        </p>
      )}
    </div>
  );
}
