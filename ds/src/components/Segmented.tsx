import { useState } from 'react';
import './Segmented.css';

export function Segmented({
  label,
  options,
}: {
  label: string;
  options: string[];
}) {
  const [value, setValue] = useState(options[0]);
  return (
    <div
      className="rv-segmented"
      role="group"
      aria-label={label}
      data-ds="Segmented"
    >
      {options.map((o) => (
        <button key={o} aria-pressed={value === o} onClick={() => setValue(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
