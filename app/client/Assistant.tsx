import { useEffect, useRef, useState } from 'react';
import { request } from './api.js';
import type { Proposal } from '../shared/model.js';
import type { CodeProposal } from '../server/components.js';
import type { TokenProposal } from '../server/external-tokens.js';

// Réponse de l'assistant d'un projet externe : jusqu'à deux diffs à valider.
export type ExternalAgentResult = {
  tokenProposal: TokenProposal | null;
  codeProposal: CodeProposal | null;
};

type Agent = { id: string; available: boolean; detail: string };
type Message = { role: 'user' | 'assistant'; text: string };

// Assistant flottant, repliable. Deux périmètres :
// - Variables : propositions de tokens (Claude sans outils, ou Codex) ;
// - Composants : Claude édite une copie de ds/ et produit un diff de code.
// Projet externe : Claude édite une copie du projet (tokens et composants).
// Rien n'est jamais appliqué sans le diff et votre validation.
export default function Assistant({
  agents,
  revision,
  onTokenProposal,
  onCodeProposal,
  defaultAgent = 'claude',
  onConnect,
  project,
  onExternalResult,
}: {
  agents: Agent[];
  revision: number;
  onTokenProposal: (p: Proposal) => void;
  onCodeProposal: (p: CodeProposal) => void;
  // IA choisie dans l'assistant de démarrage ; « none » invite à en brancher une.
  defaultAgent?: 'claude' | 'codex' | 'none';
  onConnect?: () => void;
  project?: { id: string; name: string };
  onExternalResult?: (r: ExternalAgentResult) => void;
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('ds-studio-assistant') === 'open';
    } catch {
      return false;
    }
  });
  const [scope, setScope] = useState<'variables' | 'code'>('variables');
  const [agent, setAgent] = useState(
    defaultAgent === 'codex' ? 'codex' : 'claude',
  );
  useEffect(() => {
    if (defaultAgent !== 'none') setAgent(defaultAgent);
  }, [defaultAgent]);
  const [chat, setChat] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem('ds-studio-assistant', open ? 'open' : 'closed');
    } catch {
      /* Facultatif. */
    }
  }, [open]);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [chat, thinking]);
  const selected = agents.find(
    (a) => a.id === (scope === 'code' || project ? 'claude' : agent),
  );
  const name =
    scope === 'code' || project || agent === 'claude' ? 'Claude' : 'Codex';
  // Conversation propre à chaque projet.
  useEffect(() => setChat([]), [project?.id]);
  async function send() {
    if (!message.trim() || thinking) return;
    const text = message;
    const previous = chat.slice(-10);
    setMessage('');
    setError('');
    setThinking(true);
    setChat((c) => [...c, { role: 'user', text }]);
    const abort = new AbortController();
    controller.current = abort;
    try {
      if (project) {
        const r = await request<
          ExternalAgentResult & { message: string; denied: number }
        >(`projects/${project.id}/agent`, { message: text }, abort.signal);
        const found = r.tokenProposal || r.codeProposal;
        setChat((c) => [
          ...c,
          {
            role: 'assistant',
            text:
              r.message +
              (r.denied
                ? `\n(${r.denied} action(s) hors de la copie refusée(s).)`
                : '') +
              (found ? '' : '\nAucun fichier modifié.'),
          },
        ]);
        if (found) onExternalResult?.(r);
      } else if (scope === 'variables') {
        const r = await request<{ message: string; proposal: Proposal | null }>(
          'agent',
          { agent, message: text, revision, history: previous },
          abort.signal,
        );
        setChat((c) => [...c, { role: 'assistant', text: r.message }]);
        if (r.proposal) onTokenProposal(r.proposal);
      } else {
        const r = await request<{
          message: string;
          denied: number;
          proposal: CodeProposal | null;
        }>('components/agent', { message: text }, abort.signal);
        setChat((c) => [
          ...c,
          {
            role: 'assistant',
            text:
              r.message +
              (r.denied
                ? `\n(${r.denied} action(s) hors de la copie refusée(s).)`
                : '') +
              (r.proposal ? '' : '\nAucun fichier modifié.'),
          },
        ]);
        if (r.proposal) onCodeProposal(r.proposal);
      }
    } catch (e) {
      setError(
        abort.signal.aborted
          ? 'Demande interrompue. Rien n’a été appliqué.'
          : (e as Error).message,
      );
    } finally {
      setThinking(false);
      controller.current = null;
    }
  }
  if (!open)
    return (
      <button
        className="assistant-fab"
        onClick={() => setOpen(true)}
        aria-expanded={false}
      >
        <span aria-hidden="true">✦</span> Assistant IA
      </button>
    );
  return (
    <aside className="assistant" aria-labelledby="assistant-title">
      <header>
        <h2 id="assistant-title">Assistant IA</h2>
        <button
          className="icon-button"
          onClick={() => setOpen(false)}
          aria-expanded={true}
          aria-label="Replier l’assistant"
        >
          ▾
        </button>
      </header>
      {!project && (
        <div className="assistant-scope">
          <div
            className="segmented-ui"
            role="group"
            aria-label="Périmètre de l’assistant"
          >
            <button
              aria-pressed={scope === 'variables'}
              onClick={() => setScope('variables')}
            >
              Variables
            </button>
            <button
              aria-pressed={scope === 'code'}
              onClick={() => setScope('code')}
            >
              Composants (code)
            </button>
          </div>
          {scope === 'variables' && (
            <label className="inline-field">
              Agent
              <select value={agent} onChange={(e) => setAgent(e.target.value)}>
                <option value="claude">Claude · sans outils</option>
                <option value="codex">Codex</option>
              </select>
            </label>
          )}
        </div>
      )}
      {(defaultAgent === 'none' ||
        (agents.length > 0 && !selected?.available)) && (
        <p className="notice small">
          {defaultAgent === 'none'
            ? 'Aucune IA branchée : tout fonctionne à la main.'
            : `${name} n’est pas connecté.`}{' '}
          {onConnect && (
            <button className="link-button" onClick={onConnect}>
              Brancher une IA
            </button>
          )}
        </p>
      )}
      <p className="muted small">
        {/* Sur un projet, Claude lit et édite une copie : pas « sans outils ». */}
        {(project
          ? selected?.detail.replace(/, profil sans outils/, '')
          : selected?.detail) ?? 'Détection du CLI…'}{' '}
        {project
          ? `Claude édite une copie de ${project.name} (lecture et édition de fichiers seulement) : valeurs des tokens et dossiers de composants déclarés. Chaque changement passe par un diff.`
          : scope === 'variables'
            ? 'Envoi : tokens, PFE.md, DESIGN_RULES.md, brief privé, 10 messages récents.'
            : 'Claude édite une copie isolée de ds/ (lecture et édition de fichiers seulement). Envoi : code de ds/ et DESIGN_RULES.md.'}
      </p>
      <div
        className="assistant-log"
        ref={log}
        aria-live="polite"
        aria-label="Conversation"
      >
        {!chat.length && (
          <p className="muted">
            {project
              ? 'Ex. : « Vérifie les contrastes des couleurs et corrige ceux qui posent problème. »'
              : scope === 'variables'
                ? 'Ex. : « Propose une alerte plus lisible sur fond clair. »'
                : 'Ex. : « Ajoute une variante ghost au Button, uniquement avec les tokens. »'}
          </p>
        )}
        {chat.map((c, i) => (
          <article className={`chat-message ${c.role}`} key={i}>
            <strong>{c.role === 'user' ? 'Vous' : name}</strong>
            <p>{c.text}</p>
          </article>
        ))}
        {thinking && (
          <p className="muted">
            {project
              ? `Claude modifie une copie de ${project.name} (1 à 5 min)…`
              : scope === 'code'
                ? 'Claude modifie une copie du DS…'
                : 'Réflexion en cours…'}
          </p>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          aria-label="Votre demande"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send();
          }}
          maxLength={8000}
          placeholder="Votre demande… (Ctrl+Entrée pour envoyer)"
          disabled={thinking}
        />
        <div className="row">
          {thinking && (
            <button type="button" onClick={() => controller.current?.abort()}>
              Arrêter
            </button>
          )}
          <button
            className="studio-primary"
            disabled={thinking || !message.trim() || !selected?.available}
          >
            Envoyer à {name}
          </button>
        </div>
      </form>
    </aside>
  );
}
