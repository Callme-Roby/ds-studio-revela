import './ModeTabs.css';

export type Mode = 'studio' | 'catalogue' | 'developpement';
export const modes: { id: Mode; label: string }[] = [
  { id: 'studio', label: 'Prise de vue' },
  { id: 'catalogue', label: 'Bibliothèque' },
  { id: 'developpement', label: 'Développement' },
];
export function ModeTabs({
  mode,
  onMode,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
}) {
  return (
    <nav aria-label="Modes de Revela" className="rv-modes" data-ds="ModeTabs">
      {modes.map((m) => (
        <button
          key={m.id}
          aria-current={mode === m.id ? 'page' : undefined}
          onClick={() => onMode(m.id)}
        >
          {m.label}
        </button>
      ))}
    </nav>
  );
}
