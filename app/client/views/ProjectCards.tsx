import { useEffect, useState } from 'react';
import { request } from '../api.js';
import type { Projects } from '../ProjectSwitcher.js';
import { defaultExtensions, type ProjectView } from '../../shared/projects.js';
import type { GitStatus } from '../../server/project-git.js';

// Git du projet : état local et distant, récupération et envoi sur clic.
// Jamais de force-push ; l'envoi est refusé si le distant a avancé.
export function GitCard({ project }: { project: ProjectView }) {
  const [status, setStatus] = useState<GitStatus>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    request<GitStatus>(`projects/${project.id}/git`)
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, [project.id]);
  async function run(
    label: string,
    route: string,
    done: (s: GitStatus) => string,
  ) {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      const s = await request<GitStatus>(`projects/${project.id}/${route}`, {});
      setStatus(s);
      setNotice(done(s));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <article className="card">
      <h2>Git</h2>
      {!status ? (
        <p className="muted">{error || 'Lecture de l’état Git…'}</p>
      ) : !status.repo ? (
        <p className="muted">
          Pas un dépôt Git : les validations restent locales, sans commit
          possible.
        </p>
      ) : (
        <>
          <p className="muted">
            Branche <code>{status.branch ?? 'HEAD détaché'}</code>
            {status.remote ? (
              <>
                {' '}
                · origine <code className="path">{status.remote}</code>
              </>
            ) : (
              ' · pas de dépôt distant'
            )}
          </p>
          <ul className="git-stats">
            <li>
              <strong>{status.ahead ?? '–'}</strong> commit(s) à pousser
            </li>
            <li>
              <strong>{status.behind ?? '–'}</strong> à récupérer
            </li>
            <li>
              <strong>{status.dirty ?? 0}</strong> fichier(s) modifié(s) non
              commités
            </li>
          </ul>
          {!status.upstream && status.remote && (
            <p className="muted small">
              Branche sans suivi distant : le premier envoi la créera sur «
              origin ».
            </p>
          )}
          <div className="row">
            <button
              disabled={!!busy || !status.remote}
              onClick={() =>
                void run('Récupération…', 'git/fetch', (s) =>
                  s.behind
                    ? `${s.behind} commit(s) distant(s) à récupérer (git pull).`
                    : 'À jour avec le dépôt distant.',
                )
              }
            >
              {busy === 'Récupération…' ? busy : 'Vérifier le dépôt distant'}
            </button>
            <button
              className="studio-primary"
              disabled={
                !!busy ||
                !status.remote ||
                (!!status.upstream && !status.ahead) ||
                !!status.behind
              }
              onClick={() => {
                const n = status.ahead ?? 'les';
                if (
                  confirm(
                    `Pousser ${n} commit(s) de « ${status.branch} » vers ${status.remote} ? Ils seront visibles par tous ceux qui ont accès au dépôt.`,
                  )
                )
                  void run(
                    'Envoi…',
                    'git/push',
                    () => 'Commits poussés vers le dépôt distant.',
                  );
              }}
            >
              {busy === 'Envoi…'
                ? busy
                : status.upstream
                  ? `Pousser ${status.ahead ?? 0} commit(s)`
                  : 'Publier la branche'}
            </button>
          </div>
        </>
      )}
      {(error || notice) && status && (
        <p
          className={error ? 'error' : 'notice'}
          role={error ? 'alert' : 'status'}
        >
          {error || notice}
        </p>
      )}
    </article>
  );
}

// Dossiers de composants : relatifs au projet, extensions éditables.
export function ComponentDirsCard({
  project,
  onChange,
}: {
  project: ProjectView;
  onChange: (next: Projects) => void;
}) {
  const [dir, setDir] = useState('');
  const [error, setError] = useState('');
  async function save(components: ProjectView['components']) {
    setError('');
    try {
      onChange(
        await request<Projects>(`projects/${project.id}/component-dirs`, {
          components,
        }),
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  return (
    <article className="card">
      <h2>Dossiers de composants</h2>
      <p className="muted small">
        Fichiers éditables dans DS-Studio, sur diff et validation (
        {defaultExtensions.join(', ')}). node_modules, dist et .git sont
        ignorés.
      </p>
      <ul className="usage-list">
        {project.components.map((c) => (
          <li key={c.dir}>
            <code>{c.dir}</code>
            <span>{c.extensions.join(', ')}</span>
            <button
              className="link-button"
              onClick={() =>
                void save(project.components.filter((x) => x.dir !== c.dir))
              }
            >
              Retirer
            </button>
          </li>
        ))}
        {!project.components.length && (
          <li className="muted">Aucun dossier déclaré.</li>
        )}
      </ul>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const clean = dir.trim().replace(/\\/g, '/').replace(/\/+$/, '');
          void save([
            ...project.components,
            { dir: clean, extensions: defaultExtensions },
          ]).then((ok) => ok && setDir(''));
        }}
      >
        <input
          aria-label="Dossier de composants à ajouter"
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          placeholder="src/components"
        />
        <button disabled={!dir.trim()}>Ajouter</button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

// Aperçu du projet : adresse du serveur de développement et page catalogue des
// composants (chemin dans l'app, ou adresse Storybook locale).
export function PreviewCard({
  project,
  onChange,
}: {
  project: ProjectView;
  onChange: (next: Projects) => void;
}) {
  const [url, setUrl] = useState(project.preview.url);
  const [catalog, setCatalog] = useState(project.preview.catalog);
  // Valeurs enregistrées (ou suggérées ailleurs) reportées dans les champs.
  useEffect(() => {
    setUrl(project.preview.url);
    setCatalog(project.preview.catalog);
  }, [project.preview.url, project.preview.catalog]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function save(preview = { url, catalog }) {
    setError('');
    setNotice('');
    try {
      onChange(
        await request<Projects>(`projects/${project.id}/preview`, preview),
      );
      setNotice('Aperçu enregistré.');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function suggest() {
    setError('');
    try {
      const d = await request<{ preview: { url: string; catalog: string } }>(
        `projects/${project.id}/detect`,
      );
      if (!d.preview.url && !d.preview.catalog)
        return setNotice(
          'Aucune adresse déduite des dépendances : saisissez-la.',
        );
      if (d.preview.url) setUrl(d.preview.url);
      if (d.preview.catalog) setCatalog(d.preview.catalog);
      setNotice(
        'Adresse déduite des dépendances du projet : vérifiez puis enregistrez.',
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <article className="card">
      <h2>Aperçu</h2>
      <p className="muted small">
        Le serveur de développement du projet (ex. <code>npm run dev</code>
        ), lancé par vous ou depuis la mise en route, affiché dans l’atelier.
        Adresses locales seulement.
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field">
          Serveur de développement
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3000"
          />
        </label>
        <label className="field">
          Catalogue des composants (facultatif)
          <input
            value={catalog}
            onChange={(e) => setCatalog(e.target.value)}
            placeholder="/ds-studio   ou   http://localhost:6006 (Storybook)"
          />
          <span className="muted small">
            Une page de l’app qui affiche les composants (ancre
            #NomDuComposant), ou Storybook : l’onglet Aperçu d’un composant
            l’affiche.
          </span>
        </label>
        <div className="row">
          <button className="studio-primary">Enregistrer</button>
          <button type="button" onClick={() => void suggest()}>
            Suggérer
          </button>
        </div>
      </form>
      {(error || notice) && (
        <p
          className={error ? 'error' : 'notice'}
          role={error ? 'alert' : 'status'}
        >
          {error || notice}
        </p>
      )}
    </article>
  );
}
