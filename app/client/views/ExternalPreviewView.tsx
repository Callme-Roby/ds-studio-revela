import { useEffect, useRef, useState } from 'react';
import { request } from '../api.js';
import { devices } from './PreviewView.js';
import type { ProjectView } from '../../shared/projects.js';

type Check = { reachable: boolean; detail: string };

export function usePreviewCheck(project: ProjectView) {
  const [check, setCheck] = useState<Check>();
  const run = () => {
    setCheck(undefined);
    request<Check>(`projects/${project.id}/preview/check`)
      .then(setCheck)
      .catch((e) =>
        setCheck({ reachable: false, detail: (e as Error).message }),
      );
  };
  useEffect(run, [project.id, project.preview.url]);
  return { check, run };
}

// Aperçu d'un projet externe : son propre serveur de développement, affiché à
// largeur réelle et réduit pour tenir dans la fenêtre. DS-Studio ne le lance
// pas ; une validation réécrit les fichiers et le serveur recharge la page.
export default function ExternalPreviewView({
  project,
}: {
  project: ProjectView;
}) {
  const { check, run } = usePreviewCheck(project);
  const [page, setPage] = useState('/');
  const [shown, setShown] = useState('/');
  const [device, setDevice] = useState(1);
  const [fit, setFit] = useState(true);
  const [width, setWidth] = useState(0);
  const [reload, setReload] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [check?.reachable]);
  if (!project.preview.url)
    return (
      <p className="notice">
        Indiquez l’adresse du serveur de développement du projet dans la vue
        d’ensemble (carte « Aperçu »), par ex.{' '}
        <code>http://localhost:3000</code>.
      </p>
    );
  const d = devices[device];
  const scale = fit && width ? Math.min(1, width / d.width) : 1;
  const base = project.preview.url.replace(/\/$/, '');
  const src = base + (shown.startsWith('/') ? shown : `/${shown}`);
  return (
    <div className="preview-view">
      <div className="toolbar">
        <form
          className="inline-field"
          onSubmit={(e) => {
            e.preventDefault();
            setShown(page || '/');
          }}
        >
          <span>{base}</span>
          <input
            aria-label="Page du projet"
            value={page}
            onChange={(e) => setPage(e.target.value)}
            className="page-input"
          />
          <button>Afficher</button>
        </form>
        <label className="inline-field">
          Viewport
          <select
            value={device}
            onChange={(e) => setDevice(Number(e.target.value))}
          >
            {devices.map((x, i) => (
              <option key={x.width} value={i}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          <input
            type="checkbox"
            checked={fit}
            onChange={(e) => setFit(e.target.checked)}
          />
          Ajuster à la fenêtre
        </label>
        <button onClick={() => setReload((n) => n + 1)}>Recharger</button>
        <a className="link-button" href={src} target="_blank" rel="noreferrer">
          Ouvrir dans un onglet
        </a>
      </div>
      {check && !check.reachable ? (
        <div className="notice">
          <p>
            {check.detail} Démarrez-le depuis la vue d’ensemble (carte « Mise en
            route » : installation puis serveur, au clic), ou dans un terminal,
            depuis le dossier du projet :
          </p>
          <pre className="code-block">
            <span>{`cd "${project.root}"`}</span>
            <span>npm install</span>
            <span>npm run dev</span>
          </pre>
          <div className="row">
            <a className="button studio-primary" href="#/apercu">
              Mise en route
            </a>
            <button onClick={run}>Vérifier à nouveau</button>
          </div>
        </div>
      ) : (
        <div className="stage" ref={stage}>
          <div
            className="stage-frame"
            style={{ width: d.width * scale, height: d.height * scale }}
          >
            <iframe
              key={`${src}-${reload}`}
              title={`Aperçu de ${project.name}`}
              src={src}
              width={d.width}
              height={d.height}
              style={{ transform: `scale(${scale})` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
