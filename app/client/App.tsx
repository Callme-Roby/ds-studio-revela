import { useEffect, useState } from 'react';
import ProjectBrief from './ProjectBrief.js';
import Assistant from './Assistant.js';
import TokenDiffDialog from './TokenDiffDialog.js';
import CodeDiffDialog from './CodeDiffDialog.js';
import PreviewView from './views/PreviewView.js';
import VariablesView from './views/VariablesView.js';
import ComponentsView from './views/ComponentsView.js';
import HistoryView, { type CodeEntry } from './views/HistoryView.js';
import IntegrationsView from './views/IntegrationsView.js';
import { announceChange, useDesignState } from './state.js';
import {
  bootstrap,
  commit,
  exportTokens,
  getCode,
  request,
  syncCode,
  type Bootstrap,
  type CodeReport,
  type CodeStatus,
} from './api.js';
import { tokenKeys, type Proposal, type TokenKey } from '../shared/model.js';
import type { CodeProposal } from '../server/components.js';

// Coquille de l'atelier : barre latérale, une vue par partie, dialogues de
// validation et assistant flottant. Toute écriture passe par un diff validé.

const views = [
  {
    id: 'apercu',
    label: 'Aperçu',
    icon: '▣',
    title: 'Aperçu de Revela',
    hint: 'Les écrans de l’application, avec le DS validé.',
  },
  {
    id: 'variables',
    label: 'Variables',
    icon: '◐',
    title: 'Variables',
    hint: 'Les 45 tokens : aperçu en contexte, code, propositions.',
  },
  {
    id: 'composants',
    label: 'Composants',
    icon: '◇',
    title: 'Composants',
    hint: 'Le code de ds/src, composant par composant.',
  },
  {
    id: 'historique',
    label: 'Historique',
    icon: '↺',
    title: 'Historique des versions',
    hint: 'Révisions de variables et de code, annulables.',
  },
  {
    id: 'projet',
    label: 'Projet',
    icon: '✎',
    title: 'Projet',
    hint: 'Votre brief PFE, privé sur ce poste.',
  },
  {
    id: 'integrations',
    label: 'Intégrations',
    icon: '⇄',
    title: 'Intégrations',
    hint: 'Code, JSON, Figma et assistants IA.',
  },
] as const;
type View = (typeof views)[number]['id'];
const readHash = (): { view: View; item?: string } => {
  const [view, item] = location.hash.replace(/^#\/?/, '').split('/');
  return views.some((v) => v.id === view)
    ? { view: view as View, item }
    : { view: 'apercu' };
};

export default function App() {
  const { state, setState, error: stateError } = useDesignState();
  const [boot, setBoot] = useState<Bootstrap>();
  const [route, setRoute] = useState(readHash);
  const [agents, setAgents] = useState<Bootstrap['agents']>([]);
  const [code, setCode] = useState<CodeStatus>();
  const [codeHistory, setCodeHistory] = useState<CodeEntry[]>([]);
  const [proposal, setProposal] = useState<Proposal>();
  const [codeProposal, setCodeProposal] = useState<{
    p: CodeProposal;
    item?: string;
  }>();
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [variable, setVariable] = useState<TokenKey>();

  const refreshCode = () =>
    getCode()
      .then(setCode)
      .catch(() => setCode(undefined));
  const refreshCodeHistory = () =>
    request<{ history: CodeEntry[] }>('components')
      .then((r) => setCodeHistory(r.history))
      .catch(() => {});
  useEffect(() => {
    bootstrap()
      .then(setBoot)
      .catch((e) => setError(e.message));
    void refreshCode();
    void refreshCodeHistory();
    request<Bootstrap['agents']>('agents')
      .then(setAgents)
      .catch(() => setAgents([]));
    const onHash = () => setRoute(readHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const go = (view: View, item?: string) => {
    location.hash = `/${view}${item ? `/${item}` : ''}`;
  };

  async function perform(action: () => Promise<void>) {
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  // Variables
  const proposeToken = (key: TokenKey, value: string | number) =>
    perform(async () => {
      setProposal(
        await request<Proposal>('proposals', {
          revision: state!.revision,
          changes: [{ key, value }],
        }),
      );
    });
  const importTokens = (file: File) =>
    perform(async () => {
      if (file.size > 128000)
        throw new Error('Fichier trop volumineux (128 Ko maximum).');
      const tokens = JSON.parse(await file.text());
      setProposal(
        await request('import', { revision: state!.revision, tokens }),
      );
    });
  const undoToken = (id: string) =>
    perform(async () =>
      setProposal(await request('undo', { revision: state!.revision, id })),
    );
  async function acceptToken(acknowledged: boolean) {
    if (!proposal) return;
    setSaving(true);
    await perform(async () => {
      const { state: next, code: report } = await commit(
        proposal,
        acknowledged,
      );
      try {
        sessionStorage.removeItem('ds-studio-token-draft-v2');
      } catch {
        /* Facultatif. */
      }
      setState(next);
      setProposal(undefined);
      announceChange();
      setNotice(`Révision ${next.revision} enregistrée sur disque.`);
      showCodeReport(report);
    });
    setSaving(false);
    void refreshCode();
  }
  // Le code est une copie dérivée : son échec n'annule jamais la révision.
  function showCodeReport(report: CodeReport) {
    if (report.status === 'written')
      setNotice((n) => `${n} Code : ${report.detail}`.trim());
    else if (report.status !== 'disabled')
      setError(`Code non mis à jour : ${report.detail}`);
  }
  const resync = () =>
    perform(async () => {
      const report = await syncCode();
      if (report.status === 'written') setNotice(`Code : ${report.detail}`);
      else showCodeReport(report);
      void refreshCode();
    });
  // Code des composants
  const proposeCode = (item: string, file: string, content: string) => {
    setBusy('Compilation de l’aperçu…');
    void perform(async () => {
      const p = await request<CodeProposal>('components/propose', {
        changes: [{ path: file, content }],
        message: `Édition de ${file}`,
      });
      setCodeProposal({
        p,
        item: item === 'screens' || item === 'base' ? undefined : item,
      });
    }).finally(() => setBusy(''));
  };
  const undoCode = (id: string) =>
    perform(async () =>
      setCodeProposal({
        p: await request<CodeProposal>('components/undo', { id }),
      }),
    );
  async function acceptCode(git: boolean) {
    if (!codeProposal) return;
    setBusy('Écriture, relecture et recompilation…');
    await perform(async () => {
      const r = await request<{
        entry: CodeEntry;
        git?: { ok: boolean; detail: string };
        rebuilt: boolean;
      }>('components/commit', { id: codeProposal.p.id, git });
      setCodeProposal(undefined);
      await refreshCodeHistory();
      setNotice(
        `Révision de code c${r.entry.revision} écrite dans ds/src.` +
          (r.git ? ` ${r.git.detail}` : '') +
          (r.rebuilt ? ' Interface recompilée : rechargement…' : ''),
      );
      if (r.rebuilt) setTimeout(() => location.reload(), 1200);
    });
    setBusy('');
  }
  const rejectCode = () => {
    if (codeProposal)
      void request('components/discard', { id: codeProposal.p.id }).catch(
        () => {},
      );
    setCodeProposal(undefined);
  };

  if (!state)
    return (
      <main className="loading">
        <h1>DS-Studio</h1>
        <p role="alert">{stateError || 'Ouverture du Design System…'}</p>
        <p>Lancez le serveur local puis rechargez cette page.</p>
      </main>
    );
  const current = views.find((v) => v.id === route.view)!;
  const codeRevision = codeHistory[0]?.revision ?? 0;
  return (
    <div className="shell">
      <a
        className="skip-link"
        href="#main-title"
        onClick={(e) => {
          // L'ancre sert au routage : on déplace le focus sans changer de vue.
          e.preventDefault();
          document.getElementById('main-title')?.focus();
        }}
      >
        Aller au contenu
      </a>
      <aside className="sidebar">
        <div className="wordmark">
          <span className="brand-symbol">ds.</span>
          <div>
            <strong>DS-Studio</strong>
            <span>Revela</span>
          </div>
        </div>
        <nav aria-label="Parties de l’atelier">
          <ul>
            {views.map((v) => (
              <li key={v.id}>
                <a
                  href={`#/${v.id}`}
                  aria-current={route.view === v.id ? 'page' : undefined}
                >
                  <span className="nav-icon" aria-hidden="true">
                    {v.icon}
                  </span>
                  {v.label}
                  {v.id === 'historique' && (
                    <span className="nav-count">
                      {state.revision + codeRevision}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-status">
          <span className="status-line">
            <span>Variables</span> <strong>r{state.revision}</strong>
          </span>
          <span className="status-line">
            <span>Code</span> <strong>c{codeRevision}</strong>
          </span>
          <span
            className={`code-badge ${code?.configured ? code.state : 'off'}`}
            title={code?.configured ? `${code.file}\n${code.detail}` : ''}
          >
            {!code?.configured
              ? 'tokens.css non configuré'
              : code.state === 'synced'
                ? `tokens.css à jour · r${code.revision}`
                : code.state === 'outdated' || code.state === 'absent'
                  ? 'tokens.css à mettre à jour'
                  : 'tokens.css bloqué'}
          </span>
          {code?.configured &&
            (code.state === 'outdated' || code.state === 'absent') && (
              <button onClick={() => void resync()}>Écrire le code</button>
            )}
          <span className="muted small">
            {boot?.figma.label ?? 'Figma non connecté'}
          </span>
        </div>
      </aside>
      <main className="main">
        <header className="main-head">
          <div>
            <h1 id="main-title" tabIndex={-1}>
              {current.title}
            </h1>
            <p className="muted">{current.hint}</p>
          </div>
        </header>
        <div className="feedback" aria-live="polite">
          {(error || stateError) && !proposal && !codeProposal && (
            <p className="error" role="alert">
              {error || stateError}
            </p>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {busy && !codeProposal && <p className="notice">{busy}</p>}
        </div>
        {route.view === 'apercu' && <PreviewView />}
        {route.view === 'variables' && (
          <VariablesView
            key={variable}
            state={state}
            disabled={!boot}
            onPropose={(key, value) => void proposeToken(key, value)}
            onOpenComponent={(id) => go('composants', id)}
            initial={variable}
          />
        )}
        {route.view === 'composants' && (
          <ComponentsView
            state={state}
            codeRevision={codeRevision}
            selected={route.item ?? 'button'}
            onSelect={(id) => go('composants', id)}
            onPropose={proposeCode}
            onOpenVariable={(v) => {
              const key = tokenKeys.find((k) => k.replace('.', '-') === v);
              if (key) {
                setVariable(key);
                go('variables');
              }
            }}
            busy={!!busy}
          />
        )}
        {route.view === 'historique' && (
          <HistoryView
            state={state}
            code={codeHistory}
            onUndoToken={(id) => void undoToken(id)}
            onUndoCode={(id) => void undoCode(id)}
          />
        )}
        {route.view === 'projet' && (
          <div className="narrow">
            <ProjectBrief />
          </div>
        )}
        {route.view === 'integrations' && (
          <IntegrationsView
            code={code}
            agents={agents}
            revision={state.revision}
            onResync={() => void resync()}
            onExport={() => void perform(exportTokens)}
            onImport={(f) => void importTokens(f)}
          />
        )}
      </main>
      <Assistant
        agents={agents}
        revision={state.revision}
        onTokenProposal={setProposal}
        onCodeProposal={(p) => setCodeProposal({ p })}
      />
      <TokenDiffDialog
        state={state}
        proposal={proposal}
        code={code}
        saving={saving}
        error={error}
        onCancel={() => setProposal(undefined)}
        onAccept={(ack) => void acceptToken(ack)}
      />
      <CodeDiffDialog
        proposal={codeProposal?.p}
        item={codeProposal?.item}
        busy={busy}
        error={error}
        onCancel={rejectCode}
        onAccept={(git) => void acceptCode(git)}
      />
    </div>
  );
}
