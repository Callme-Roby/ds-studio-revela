import { useEffect, useRef, useState } from 'react';
import { request } from './api.js';
import type { Projects } from './ProjectSwitcher.js';
import type { Detection } from '../server/detect.js';

type Agent = { id: string; available: boolean; detail: string };
type Step = 'accueil' | 'projet' | 'detection' | 'ia' | 'fin';
const steps: { id: Step; label: string }[] = [
  { id: 'projet', label: 'Projet' },
  { id: 'detection', label: 'Tokens et composants' },
  { id: 'ia', label: 'Assistant IA' },
  { id: 'fin', label: 'C’est prêt' },
];

// Assistant de démarrage : brancher un projet (dossier local ou dépôt GitHub),
// retrouver ses tokens et composants, choisir l'IA de l'assistant. Rien n'est
// exécuté du projet ; chaque choix reste modifiable ensuite.
export default function Onboarding({
  onProjects,
  onDone,
}: {
  onProjects: (next: Projects) => void;
  onDone: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>('accueil');
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // Projet
  const [type, setType] = useState<'local' | 'github'>('local');
  const [name, setName] = useState('');
  const [root, setRoot] = useState('');
  const [url, setUrl] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [plugin, setPlugin] = useState(false);
  const [projectId, setProjectId] = useState('');
  // Détection
  const [found, setFound] = useState<Detection>();
  const [tokens, setTokens] = useState<string[]>([]);
  const [dirs, setDirs] = useState<string[]>([]);
  // IA
  const [agents, setAgents] = useState<Agent[]>();
  const [agent, setAgent] = useState<'claude' | 'codex' | 'none'>('claude');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const checkAgents = () => {
    setAgents(undefined);
    request<Agent[]>('agents')
      .then((a) => {
        setAgents(a);
        setAgent((cur) =>
          cur !== 'claude' && cur !== 'codex'
            ? cur
            : a.find((x) => x.id === cur)?.available
              ? cur
              : a.find((x) => x.id === 'claude')?.available
                ? 'claude'
                : a.find((x) => x.id === 'codex')?.available
                  ? 'codex'
                  : 'none',
        );
      })
      .catch(() => setAgents([]));
  };
  useEffect(() => {
    if (step === 'ia' && !agents) checkAgents();
  }, [step]);
  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    setError('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  const addProject = () =>
    run(
      type === 'github' ? 'Clonage du dépôt…' : 'Ajout du projet…',
      async () => {
        const list =
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
                source: { type: 'local', url: '' },
                figma: { plugin, fileUrl },
              });
        onProjects(list);
        setProjectId(list.active);
        setBusy('Recherche des tokens et composants…');
        const d = await request<Detection>(`projects/${list.active}/detect`);
        setFound(d);
        setTokens(d.tokens.slice(0, 2).map((t) => t.file));
        setDirs(d.components.slice(0, 1).map((c) => c.dir));
        setStep('detection');
      },
    );
  const saveDetection = () =>
    run('Enregistrement…', async () => {
      const t = found!.tokens
        .filter((x) => tokens.includes(x.file))
        .map(({ file, format }) => ({ file, format }));
      await request(`projects/${projectId}/sources`, { tokens: t });
      // Adresse d'aperçu déduite des dépendances (modifiable ensuite).
      if (found!.preview.url || found!.preview.catalog)
        await request(`projects/${projectId}/preview`, found!.preview);
      onProjects(
        await request<Projects>(`projects/${projectId}/component-dirs`, {
          components: dirs.map((dir) => ({
            dir,
            extensions: [
              'tsx',
              'jsx',
              'ts',
              'js',
              'vue',
              'svelte',
              'css',
              'scss',
              'html',
            ],
          })),
        }),
      );
      setStep('ia');
    });
  const finish = () =>
    run('Enregistrement…', async () => {
      await request('settings', { agent, onboarded: true });
      // Démo : le projet Revela redevient le projet actif.
      if (demo)
        onProjects(
          await request<Projects>('projects/active', { id: 'revela' }),
        );
      dialog.current?.close();
      onDone();
    });
  const current = steps.findIndex((s) => s.id === step);
  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  return (
    <dialog
      ref={dialog}
      className="onboarding"
      aria-labelledby="onboarding-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) void finish();
      }}
    >
      <header className="onboarding-head">
        <span className="brand-symbol">ds.</span>
        <div>
          <h2 id="onboarding-title">Bienvenue dans DS-Studio</h2>
          <p className="muted small">
            Un atelier pour faire évoluer un Design System, du code à Figma.
          </p>
        </div>
      </header>
      {step !== 'accueil' && (
        <ol className="onboarding-steps" aria-label="Étapes">
          {steps.map((s, i) => (
            <li
              key={s.id}
              aria-current={s.id === step ? 'step' : undefined}
              className={i < current ? 'done' : ''}
            >
              <span>{i + 1}</span>
              {s.label}
            </li>
          ))}
        </ol>
      )}
      <div className="onboarding-body">
        {step === 'accueil' && (
          <div className="onboarding-choices">
            <button
              className="choice"
              onClick={() => {
                setDemo(false);
                setStep('projet');
              }}
            >
              <strong>Brancher mon projet</strong>
              <span>
                Un dossier sur ce poste ou un dépôt GitHub : ses tokens et
                composants deviennent éditables.
              </span>
            </button>
            <button
              className="choice"
              onClick={() => {
                setDemo(true);
                setStep('ia');
              }}
            >
              <strong>Explorer la démo Revela</strong>
              <span>
                Le Design System livré avec DS-Studio : variables, composants,
                écrans et plugin Figma.
              </span>
            </button>
          </div>
        )}
        {step === 'projet' && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void addProject();
            }}
          >
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
            <label className="field">
              Nom du projet
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
              />
            </label>
            {type === 'github' && (
              <label className="field">
                URL du dépôt GitHub
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://github.com/compte/depot"
                  required
                />
              </label>
            )}
            <label className="field">
              {type === 'github'
                ? 'Cloner dans le dossier (chemin absolu, vide ou à créer)'
                : 'Dossier du projet (chemin absolu)'}
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
              Synchroniser ce projet avec Figma par le plugin DS Studio to Figma
            </label>
            <p className="muted small">
              DS-Studio n’exécute rien du projet. Pour GitHub, vos identifiants
              Git habituels sont utilisés (jamais lus ni stockés).
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => setStep('accueil')}
                disabled={!!busy}
              >
                Retour
              </button>
              <button className="studio-primary" disabled={!!busy}>
                {busy ||
                  (type === 'github' ? 'Cloner et continuer' : 'Continuer')}
              </button>
            </div>
          </form>
        )}
        {step === 'detection' && found && (
          <div className="stack">
            <p className="muted">
              Voici ce que DS-Studio a trouvé, sans rien modifier. Cochez ce qui
              compte ; tout se modifie ensuite dans la vue d’ensemble du projet.
            </p>
            <fieldset className="field">
              <legend>Fichiers de tokens</legend>
              {!found.tokens.length && (
                <p className="muted small">
                  Aucun fichier de variables détecté.
                </p>
              )}
              {found.tokens.map((t) => (
                <label key={t.file} className="checks-ack">
                  <input
                    type="checkbox"
                    checked={tokens.includes(t.file)}
                    onChange={() => setTokens(toggle(tokens, t.file))}
                  />
                  <code>{t.file}</code> · {t.count} variable(s)
                </label>
              ))}
            </fieldset>
            <fieldset className="field">
              <legend>Dossiers de composants</legend>
              {!found.components.length && (
                <p className="muted small">
                  Aucun dossier de composants détecté.
                </p>
              )}
              {found.components.map((c) => (
                <label key={c.dir} className="checks-ack">
                  <input
                    type="checkbox"
                    checked={dirs.includes(c.dir)}
                    onChange={() => setDirs(toggle(dirs, c.dir))}
                  />
                  <code>{c.dir}</code> · {c.files} fichier(s)
                </label>
              ))}
            </fieldset>
            {(found.scripts.length > 0 || found.preview.url) && (
              <p className="muted small">
                Aperçu : lancez le projet vous-même
                {found.scripts.length > 0 && (
                  <>
                    {' '}
                    (<code>npm run {found.scripts[0].name}</code>)
                  </>
                )}
                {found.preview.url && (
                  <>
                    {' '}
                    ; DS-Studio l’affichera depuis{' '}
                    <code>{found.preview.url}</code>
                  </>
                )}
                .
              </p>
            )}
            <div className="dialog-actions">
              <button
                className="studio-primary"
                onClick={() => void saveDetection()}
                disabled={!!busy}
              >
                {busy || 'Enregistrer et continuer'}
              </button>
            </div>
          </div>
        )}
        {step === 'ia' && (
          <div className="stack">
            <p className="muted">
              L’assistant IA propose des changements de variables ou de code ;
              rien n’est appliqué sans votre validation. Il passe par l’outil en
              ligne de commande de l’IA, connecté avec votre propre compte.
            </p>
            <div
              className="agent-choices"
              role="radiogroup"
              aria-label="IA de l’assistant"
            >
              {[
                ['claude', 'Claude Code', 'Sonnet 5.5, effort moyen'],
                ['codex', 'Codex', 'OpenAI'],
                ['none', 'Sans IA', 'Tout fonctionne à la main'],
              ].map(([id, label, hint]) => {
                const a = agents?.find((x) => x.id === id);
                return (
                  <label
                    key={id}
                    className={`agent-choice${agent === id ? ' selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="agent"
                      checked={agent === id}
                      onChange={() => setAgent(id as typeof agent)}
                    />
                    <strong>{label}</strong>
                    <span className="muted small">{hint}</span>
                    {id !== 'none' && (
                      <span
                        className={
                          a?.available ? 'ok-text small' : 'muted small'
                        }
                      >
                        {!agents
                          ? 'Vérification…'
                          : a?.available
                            ? 'Connecté ✓'
                            : 'Non connecté'}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            {agent !== 'none' &&
              agents &&
              !agents.find((x) => x.id === agent)?.available && (
                <div className="notice">
                  <p>
                    Pour connecter{' '}
                    {agent === 'claude' ? 'Claude Code' : 'Codex'}, dans un
                    terminal :
                  </p>
                  <pre className="code-block">
                    <span>
                      {agent === 'claude'
                        ? 'npm install -g @anthropic-ai/claude-code'
                        : 'npm install -g @openai/codex'}
                    </span>
                    <span>
                      {agent === 'claude'
                        ? 'claude   puis   /login'
                        : 'codex login'}
                    </span>
                  </pre>
                  <p className="muted small">
                    DS-Studio ne voit jamais vos identifiants. Vous pouvez
                    continuer et connecter plus tard.
                  </p>
                  <button onClick={checkAgents}>Vérifier à nouveau</button>
                </div>
              )}
            <div className="dialog-actions">
              {!demo && (
                <button
                  onClick={() => setStep('detection')}
                  disabled={!!busy || !found}
                >
                  Retour
                </button>
              )}
              <button className="studio-primary" onClick={() => setStep('fin')}>
                Continuer
              </button>
            </div>
          </div>
        )}
        {step === 'fin' && (
          <div className="stack">
            <ul className="onboarding-summary">
              <li>
                <strong>Projet</strong>
                <span>
                  {demo
                    ? 'Démo Revela'
                    : `${name} (${type === 'github' ? 'cloné depuis GitHub' : 'dossier local'})`}
                </span>
              </li>
              {!demo && (
                <li>
                  <strong>Branché</strong>
                  <span>
                    {tokens.length} fichier(s) de tokens, {dirs.length}{' '}
                    dossier(s) de composants
                  </span>
                </li>
              )}
              <li>
                <strong>Assistant IA</strong>
                <span>
                  {agent === 'none'
                    ? 'Sans IA'
                    : agent === 'claude'
                      ? 'Claude Code'
                      : 'Codex'}
                </span>
              </li>
              <li>
                <strong>Figma</strong>
                <span>
                  {demo || plugin
                    ? 'Plugin DS-Studio (voir Intégrations)'
                    : 'Non synchronisé'}
                </span>
              </li>
            </ul>
            <div className="dialog-actions">
              <button onClick={() => setStep('ia')}>Retour</button>
              <button
                className="studio-primary"
                onClick={() => void finish()}
                disabled={!!busy}
              >
                {demo ? 'Explorer Revela' : 'Ouvrir le projet'}
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      {step === 'accueil' && (
        <footer className="onboarding-foot">
          <button className="link-button" onClick={() => void finish()}>
            Passer pour l’instant
          </button>
        </footer>
      )}
    </dialog>
  );
}
