import type { CodeStatus } from '../api.js';

type Agent = { id: string; available: boolean; detail: string };

// Où va le DS une fois validé : code, fichiers JSON, Figma, IA.
export default function IntegrationsView({
  code,
  agents,
  revision,
  onResync,
  onExport,
  onImport,
}: {
  code?: CodeStatus;
  agents: Agent[];
  revision: number;
  onResync: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  const claude = agents.find((a) => a.id === 'claude');
  const codex = agents.find((a) => a.id === 'codex');
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
          Dans Figma desktop : Plugins → Development → Import plugin from
          manifest… → <code>figma-plugin/manifest.json</code>. Puis « Lire
          DS-Studio » et « Appliquer » : la collection « Revela · DS-Studio »
          reçoit les variables validées.
        </p>
        <p className="muted small">
          Lecture seule par le plugin sur{' '}
          <code>http://localhost:4310/api/figma/tokens</code>. Guide :
          docs/FIGMA_PLUGIN.md.
        </p>
      </article>
      <article className="card">
        <h2>Assistants IA</h2>
        <p>
          <strong>Claude Code</strong> ·{' '}
          {claude
            ? claude.available
              ? 'disponible'
              : 'indisponible'
            : 'vérification…'}
        </p>
        <p className="muted small">{claude?.detail}</p>
        <p>
          <strong>Codex</strong> ·{' '}
          {codex
            ? codex.available
              ? 'disponible'
              : 'indisponible'
            : 'vérification…'}
        </p>
        <p className="muted small">{codex?.detail}</p>
        <p className="muted small">
          L’assistant flottant (en bas à droite) propose des variables ou du
          code ; tout passe par un diff et votre validation.
        </p>
      </article>
    </div>
  );
}
