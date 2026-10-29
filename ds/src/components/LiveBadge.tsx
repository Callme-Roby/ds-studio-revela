import './LiveBadge.css';

export function LiveBadge({ state }: { state: 'live' | 'offline' | 'error' }) {
  const label = {
    live: '● LIVE 30 fps',
    offline: '○ Hors ligne',
    error: '✕ Boîtier en erreur',
  }[state];
  return <span className={`rv-live ${state}`}>{label}</span>;
}
