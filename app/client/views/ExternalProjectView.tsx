import { useState } from 'react';
import { request } from '../api.js';
import type { Projects } from '../ProjectSwitcher.js';
import type { ProjectView, TokenSource } from '../../shared/projects.js';
import { formatOf } from '../../shared/token-sources.js';
import { useExternalTokens } from './ExternalVariablesView.js';
import { ComponentDirsCard, GitCard } from './ProjectCards.js';

// Projet externe : fiche du projet (dossier, Git, Figma) et ce qui reste à
// brancher. Variables : fichiers de tokens déclarés ici (étape D2) ;
// composants, aperçu, IA et Figma arrivent aux étapes D3 à D6.
const steps = [
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
  const [newFile, setNewFile] = useState('');
  const { data } = useExternalTokens(project);
  const saveSources = (tokens: TokenSource[], done: string) =>
    act(`projects/${project.id}/sources`, { tokens }, done);
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
        {project.source.type === 'github' && (
          <p className="muted small">
            Source : <code className="path">{project.source.url}</code>
          </p>
        )}
      </article>
      <GitCard project={project} />
      <ComponentDirsCard project={project} onChange={onChange} />
      <article className="card">
        <h2>Fichiers de tokens</h2>
        <p className="muted small">
          Variables CSS (:root), SCSS ($var) ou JSON (plat ou DTCG), relatifs au
          dossier du projet. DS-Studio les lit et réécrit seulement les valeurs
          validées.
        </p>
        <ul className="usage-list">
          {project.tokens.map((s) => {
            const info = data?.sources.find((x) => x.file === s.file);
            return (
              <li key={s.file}>
                <code>{s.file}</code>
                <span>
                  {info?.error
                    ? info.error
                    : info
                      ? `${info.count} token(s)${info.ignored ? `, ${info.ignored} hors :root ignoré(s)` : ''}`
                      : '…'}
                </span>
                <button
                  className="link-button"
                  onClick={() =>
                    void saveSources(
                      project.tokens.filter((x) => x.file !== s.file),
                      'Fichier retiré (rien supprimé du projet).',
                    )
                  }
                >
                  Retirer
                </button>
              </li>
            );
          })}
          {!project.tokens.length && (
            <li className="muted">Aucun fichier déclaré.</li>
          )}
        </ul>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const file = newFile.trim().replace(/\\/g, '/');
            const format = formatOf(file);
            if (!format)
              return setError('Fichier .css, .scss ou .json attendu.');
            void saveSources(
              [...project.tokens, { file, format }],
              `${file} ajouté.`,
            ).then(() => setNewFile(''));
          }}
        >
          <input
            aria-label="Fichier de tokens à ajouter"
            value={newFile}
            onChange={(e) => setNewFile(e.target.value)}
            placeholder="src/styles/tokens.css"
          />
          <button disabled={!newFile.trim()}>Ajouter</button>
        </form>
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
