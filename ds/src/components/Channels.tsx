import './Channels.css';

export function Channels() {
  return (
    <div className="rv-channels" data-ds="Channels">
      {(['R', 'G', 'B'] as const).map((c) => (
        <span key={c} className={`rv-channel ${c}`}>
          <span aria-hidden="true" />
          Canal {c === 'G' ? 'V' : c}
        </span>
      ))}
      <span className="rv-channel mask">
        <span aria-hidden="true" />
        Poignée de masque
      </span>
    </div>
  );
}
