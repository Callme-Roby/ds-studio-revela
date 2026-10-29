import { useEffect, useRef, useState } from 'react';
import { request } from '../api.js';
import type { Projects } from '../ProjectSwitcher.js';
import type { ProjectView } from '../../shared/projects.js';
import type { CodeProposal } from '../../server/components.js';

type RunView = {
  running: boolean;
  command: string;
  code: number | null;
  log: string;
} | null;
type Setup = {
  commands: {
    manager: string;
    install: string;
    dev: string | null;
    installed: boolean;
    envExample: string | null;
    envFile: string | null;
  } | null;
  run: { install: RunView; dev: RunView };
  catalog: boolean;
};
type AiSetup = {
  summary: string;
  env: { name: string; why: string }[];
  tokens: string[];
  components: string[];
  projects: Projects;
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Mise en route d'un projet externe : chaque étape, son état et l'action qui
// la règle. Installer et démarrer lancent les commandes fixes du projet, au
// clic ; « Tout configurer avec Claude » enchaîne l'analyse (lecture seule),
// l'installation, le serveur de dev et la page catalogue (soumise au diff).
export default function SetupCard({
  project,
  onChange,
  agent,
  auto,
  onAutoDone,
  onProposal,
}: {
  project: ProjectView;
  onChange: (next: Projects) => void;
  agent?: 'claude' | 'codex' | 'none';
  // Lancée juste après le branchement du projet ou de l'IA.
  auto?: boolean;
  onAutoDone?: () => void;
  onProposal: (p: CodeProposal) => void;
}) {
  const [setup, setSetup] = useState<Setup>();
  const [reachable, setReachable] = useState<boolean>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [ai, setAi] = useState<AiSetup>();
  const [log, setLog] = useState<'install' | 'dev' | ''>('');
  const base = `projects/${project.id}`;
  const refresh = async () => {
    const [s, c] = await Promise.all([
      request<Setup>(`${base}/setup`),
      request<{ reachable: boolean }>(`${base}/preview/check`),
    ]);
    setSetup(s);
    setReachable(c.reachable);
    return { setup: s, reachable: c.reachable };
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [project.id, project.preview.url, project.preview.catalog]);
  // Suivi pendant qu'une commande tourne (sortie et adresse du serveur).
  const running = !!(setup?.run.install?.running || setup?.run.dev?.running);
  useEffect(() => {
    if (!running && reachable !== false) return;
    const t = setInterval(() => {
      void refresh()
        .then(() =>
          request<Projects>('projects').then((p) => {
            const now = p.projects.find((x) => x.id === project.id);
            if (now && now.preview.url !== project.preview.url) onChange(p);
          }),
        )
        .catch(() => {});
    }, 2000);
    return () => clearInterval(t);
  }, [running, reachable, project.preview.url]);

  async function step(label: string, work: () => Promise<void>) {
    setBusy(label);
    setError('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy('');
    }
  }
  const startTask = (task: 'install' | 'dev') =>
    request<Setup['run']>(`${base}/run/start`, { task }).then(() => {
      setLog(task);
      return refresh();
    });
  const stopTask = (task: 'install' | 'dev') =>
    request(`${base}/run/stop`, { task }).then(() => refresh());
  // Installe si besoin, puis démarre et attend que le serveur réponde.
  async function installAndStart() {
    let s = (await refresh()).setup;
    if (!s.commands?.installed) {
      setBusy(`Installation (${s.commands?.install})… quelques minutes.`);
      await startTask('install');
      do {
        await pause(2000);
        s = (await refresh()).setup;
      } while (s.run.install?.running);
      if (s.run.install?.code !== 0)
        throw new Error('Installation en échec : voir la sortie ci-dessous.');
    }
    if (!s.run.dev?.running) {
      setBusy(`Démarrage (${s.commands?.dev})…`);
      await startTask('dev');
    }
    for (let i = 0; i < 45; i++) {
      await pause(2000);
      const r = await refresh();
      if (r.reachable) return;
      if (!r.setup.run.dev?.running)
        throw new Error(
          'Le serveur de dev s’est arrêté : voir la sortie (variables d’environnement manquantes ?).',
        );
    }
    throw new Error('Le serveur de dev ne répond pas encore : voir la sortie.');
  }
  async function generateCatalog() {
    const r = await request<{ message: string; proposal: CodeProposal | null }>(
      `${base}/catalog/generate`,
      { route: '/ds-studio' },
    );
    onChange(await request<Projects>('projects'));
    if (r.proposal) onProposal(r.proposal);
    else throw new Error(`Claude n’a pas créé de page : ${r.message}`);
  }
  async function configureAll() {
    await step('Claude analyse une copie du projet (1 à 3 min)…', async () => {
      const r = await request<AiSetup>(`${base}/ai-setup`, {});
      setAi(r);
      onChange(r.projects);
    });
    await step('…', installAndStart).catch(() => {});
    const now = (await request<Projects>('projects')).projects.find(
      (p) => p.id === project.id,
    );
    if (now?.components.length && !(await refresh()).setup.catalog)
      await step(
        'Claude crée la page catalogue sur une copie (1 à 3 min)…',
        generateCatalog,
      );
  }
  // Juste après le branchement : une seule fois.
  const started = useRef(false);
  useEffect(() => {
    if (!auto || started.current || agent !== 'claude') return;
    started.current = true;
    onAutoDone?.();
    void configureAll().catch(() => {});
  }, [auto, agent]);

  const c = setup?.commands;
  const envMissing = !!c?.envExample && !c.envFile;
  const items: {
    ok: boolean | undefined;
    title: string;
    detail: string;
    action?: React.ReactNode;
  }[] = [
    {
      ok: c ? c.installed : undefined,
      title: 'Dépendances',
      detail: !setup
        ? '…'
        : !c
          ? 'Pas de package.json : projet non JavaScript ?'
          : c.installed
            ? 'Installées (node_modules).'
            : setup.run.install?.running
              ? `${c.install} en cours…`
              : `À installer : ${c.install}.`,
      action:
        c && !c.installed && !setup?.run.install?.running ? (
          <button
            disabled={!!busy}
            onClick={() =>
              void step('Installation…', () =>
                startTask('install').then(() => {}),
              )
            }
          >
            Installer
          </button>
        ) : setup?.run.install?.running ? (
          <button onClick={() => void stopTask('install')}>Arrêter</button>
        ) : undefined,
    },
    {
      ok: setup ? !envMissing : undefined,
      title: 'Environnement',
      detail: envMissing
        ? `${c!.envExample} présent mais aucun .env : copiez-le en .env.local et remplissez les valeurs. DS-Studio ne lit ni n’écrit vos secrets.`
        : c?.envFile
          ? `${c.envFile} présent.`
          : 'Aucune variable d’environnement attendue.',
    },
    {
      ok: reachable,
      title: 'Serveur de dev',
      detail: reachable
        ? `Répond sur ${project.preview.url}.`
        : setup?.run.dev?.running
          ? `${setup.run.dev.command} en cours, en attente de réponse…`
          : c?.dev
            ? `Arrêté. Commande : ${c.dev}.`
            : 'Aucun script dev dans le package.json.',
      action: setup?.run.dev?.running ? (
        <button onClick={() => void stopTask('dev')}>Arrêter</button>
      ) : c?.dev && !reachable ? (
        <button
          disabled={!!busy || !c.installed}
          title={c.installed ? '' : 'Installez d’abord les dépendances'}
          onClick={() =>
            void step('Démarrage…', () => startTask('dev').then(() => {}))
          }
        >
          Démarrer
        </button>
      ) : undefined,
    },
    {
      ok: project.tokens.length > 0,
      title: 'Variables',
      detail: project.tokens.length
        ? project.tokens.map((t) => t.file).join(', ')
        : 'Aucun fichier de tokens : Claude peut les trouver.',
    },
    {
      ok: project.components.length > 0,
      title: 'Composants',
      detail: project.components.length
        ? project.components.map((d) => d.dir).join(', ')
        : 'Aucun dossier de composants : Claude peut les trouver.',
    },
    {
      ok: setup?.catalog,
      title: 'Page catalogue',
      detail: setup?.catalog
        ? `${project.preview.catalog} : chaque composant visible dans son onglet Aperçu.`
        : 'Pas encore de page qui affiche les composants un par un.',
      action:
        !setup?.catalog && project.components.length && agent === 'claude' ? (
          <button
            disabled={!!busy}
            onClick={() =>
              void step(
                'Claude crée la page catalogue (1 à 3 min)…',
                generateCatalog,
              ).catch(() => {})
            }
          >
            Générer avec Claude
          </button>
        ) : undefined,
    },
  ];
  const done = items.every((i) => i.ok);
  const shown = log && setup?.run[log];
  return (
    <article className="card setup-card">
      <h2>Mise en route</h2>
      <p className="muted small">
        {done
          ? 'Tout est branché : variables, composants et aperçu.'
          : 'Ce qu’il faut pour éditer et voir ce projet dans DS-Studio. Les commandes sont celles du projet, lancées seulement au clic.'}
      </p>
      <ul className="setup-steps">
        {items.map((i) => (
          <li
            key={i.title}
            data-ok={i.ok === undefined ? 'wait' : String(i.ok)}
          >
            <span className="setup-mark" aria-hidden="true">
              {i.ok === undefined ? '…' : i.ok ? '✓' : '○'}
            </span>
            <div>
              <strong>{i.title}</strong>
              <span className="muted small">{i.detail}</span>
            </div>
            {i.action}
          </li>
        ))}
      </ul>
      {ai && (
        <div className="notice small" role="status">
          <p>Claude : {ai.summary}</p>
          {ai.env.length > 0 && (
            <ul>
              {ai.env.map((e) => (
                <li key={e.name}>
                  <code>{e.name}</code> : {e.why}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="row">
        {agent === 'claude' ? (
          <button
            className="studio-primary"
            disabled={!!busy}
            onClick={() => void configureAll().catch(() => {})}
          >
            {busy || 'Tout configurer avec Claude'}
          </button>
        ) : (
          <span className="muted small">
            Branchez Claude (Intégrations) pour une configuration automatique.
          </span>
        )}
        {c?.dev && !reachable && !setup?.run.dev?.running && (
          <button
            disabled={!!busy}
            onClick={() => void step('…', installAndStart).catch(() => {})}
          >
            {c.installed ? 'Démarrer le serveur' : 'Installer et démarrer'}
          </button>
        )}
        {(setup?.run.install || setup?.run.dev) && (
          <select
            aria-label="Sortie affichée"
            value={log}
            onChange={(e) => setLog(e.target.value as typeof log)}
          >
            <option value="">Masquer la sortie</option>
            {setup?.run.install && (
              <option value="install">Sortie : installation</option>
            )}
            {setup?.run.dev && (
              <option value="dev">Sortie : serveur de dev</option>
            )}
          </select>
        )}
      </div>
      {busy && (
        <p className="muted small" role="status">
          {busy}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {shown && (
        <pre className="run-log" aria-label="Sortie de la commande">
          {shown.log}
        </pre>
      )}
    </article>
  );
}
