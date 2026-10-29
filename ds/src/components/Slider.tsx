import { useState } from 'react';
import './Slider.css';

export function Slider({
  label,
  initial,
  unit = '',
  min = -100,
  max = 100,
}: {
  label: string;
  initial: number;
  unit?: string;
  min?: number;
  max?: number;
}) {
  const [value, setValue] = useState(initial);
  return (
    <label className="rv-control">
      <span className="rv-label">
        {label}
        <em>
          {value}
          {unit}
        </em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
      />
    </label>
  );
}
