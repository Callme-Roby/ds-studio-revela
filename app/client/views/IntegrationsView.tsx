import type { CodeStatus } from '../api.js';
import type { SpecStatus } from '../figmaExport.js';

type Agent = { id: string; available: boolean; detail: string };
export type AgentChoice = 'claude' | 'codex' | 'none';

// Comment brancher chaque IA : CLI officiel, connecté par l'étudiant lui-même.
const agentInfo: Record<
  Exclude<AgentChoice, 'none'>,
  { label: string; hint: string; install: string; login: string }
> = {
  claude: {
    label: 'Claude Code',
    hint: 'Anthropic · Sonnet 5.5, effort moyen · variables et code des composants',
    install: 'npm install -g @anthropic-ai/claude-code',
    login: 'claude   puis   /login',
  },
  codex: {
    label: 'Codex',
    hint: 'OpenAI · propositions de variables',
    install: 'npm install -g @openai/codex',
    login: 'codex login',
  },
};

// Où va le DS une fois validé : code, fichiers JSON, Figma, IA.
export default function IntegrationsView({
  code,
  agents,
  revision,
  onResync,
  onExport,
  onImport,
  spec,
  specBusy,
  specError,
  onPrepareSpec,
  agent,
  onAgent,
  onCheckAgents,
}: {
  code?: CodeStatus;
  agents: Agent[];
  revision: number;
  onResync: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  spec?: SpecStatus | null;
  specBusy: boolean;
  specError?: string;
  onPrepareSpec: () => void;
  agent?: AgentChoice;
  onAgent: (agent: AgentChoice) => void;
  onCheckAgents: () => void;
}) {
  return (
    <div className="cards">
      <article className="card">
        <h2>Code · tokens.css</h2>
        <p className="muted">
          Chaque validation de variables réécrit puis relit ce fichier. Par
          défaut <code>ds/tokens.css</code> ; un autre projet via{' '}
          <code>.ds-studio/code-target.json</code>.
        </p>
        {code?.configured ? (
          <>
            <p>
              <code className="path">{code.file}</code>
            </p>
            <p className={`code-badge ${code.state}`}>{code.detail}</p>
            {(code.state === 'outdated' || code.state === 'absent') && (
              <button onClick={onResync}>Écrire le code</button>
            )}
          </>
        ) : (
          <p className="code-badge off">Aucune cible code configurée.</p>
        )}
      </article>
      <article className="card">
        <h2>Fichiers JSON</h2>
        <p className="muted">
          Exportez les 45 variables (révision {revision}), ou importez un JSON :
          il devient une proposition, soumise au diff.
        </p>
        <div className="row">
          <button onClick={onExport}>Exporter les tokens</button>
          <label className="file-button">
            Importer un JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) onImport(file);
              }}
            />
          </label>
        </div>
      </article>
      <article className="card">
        <h2>Figma · plugin</h2>
        <p className="muted">
          Le plugin pousse les variables validées, puis les composants
          (variantes) et les écrans, liés à ces variables, dans votre fichier
          Figma.
        </p>
        <div className="row">
          <a
            className="button studio-primary"
            href="/api/figma/plugin.zip"
            download="ds-studio-figma-plugin.zip"
          >
            Télécharger le plugin
          </a>
        </div>
        <ol className="steps small">
          <li>Décompressez le fichier téléchargé.</li>
          <li>
            Figma desktop → Plugins → Development → Import plugin from manifest…
            → <code>manifest.json</code> du dossier décompressé.
          </li>
          <li>
            DS-Studio ouvert, lancez le plugin : « Lire DS-Studio » puis «
            Appliquer ».
          </li>
        </ol>
        <h3 className="list-title">Composants et écrans</h3>
        {specError && !specBusy ? (
          <p className="error small" role="alert">
            Export impossible : {specError}
          </p>
        ) : (
          <p className="muted small">
            {specBusy
              ? 'Export en préparation…'
              : spec
                ? `Export prêt · ${spec.components} composants, ${spec.variants} variantes, ${spec.screens} écrans · révisions r${spec.revision} / c${spec.codeRevision}.`
                : 'Export pas encore préparé.'}{' '}
            Régénéré automatiquement après chaque validation.
          </p>
        )}
        <div className="row">
          <button onClick={onPrepareSpec} disabled={specBusy}>
            Préparer l’export Figma
          </button>
        </div>
        <p className="muted small">
          Le plugin lit DS-Studio en lecture seule sur{' '}
          <code>http://localhost:4310</code>. Guide : docs/FIGMA_PLUGIN.md.
        </p>
      </article>
      <article className="card" aria-labelledby="ia-title">
        <h2 id="ia-title">Assistant IA</h2>
        <p className="muted small">
          L’IA de l’assistant flottant. Elle propose, vous validez sur diff.
          DS-Studio passe par son outil officiel en ligne de commande, connecté
          avec votre compte : aucun identifiant n’est lu ni stocké ici.
        </p>
        <div
          className="agent-list"
          role="radiogroup"
          aria-label="IA de l’assistant"
        >
          {(['claude', 'codex'] as const).map((id) => {
            const a = agents.find((x) => x.id === id);
            const info = agentInfo[id];
            return (
              <div
                key={id}
                className={`agent-row${agent === id ? ' selected' : ''}`}
              >
                <label>
                  <input
                    type="radio"
                    name="ia"
                    checked={agent === id}
                    onChange={() => onAgent(id)}
                  />
                  <strong>{info.label}</strong>
                  <span
                    className={a?.available ? 'ok-text small' : 'muted small'}
                  >
                    {!a
                      ? 'vérification…'
                      : a.available
                        ? 'connecté ✓'
                        : 'non connecté'}
                  </span>
                </label>
                <p className="muted small">
                  {a?.available ? a.detail : info.hint}
                </p>
                {a && !a.available && (
                  <pre className="code-block">
                    <span>{info.install}</span>
                    <span>{info.login}</span>
                  </pre>
                )}
              </div>
            );
          })}
          <div className={`agent-row${agent === 'none' ? ' selected' : ''}`}>
            <label>
              <input
                type="radio"
                name="ia"
                checked={agent === 'none'}
                onChange={() => onAgent('none')}
              />
              <strong>Sans IA</strong>
            </label>
            <p className="muted small">Tout fonctionne à la main.</p>
          </div>
        </div>
        <div className="row">
          <button onClick={onCheckAgents}>Vérifier les connexions</button>
        </div>
      </article>
    </div>
  );
}
