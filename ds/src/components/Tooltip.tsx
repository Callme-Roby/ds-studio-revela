import { type ReactNode } from 'react';
import './Tooltip.css';

export function Tooltip({ children }: { children: ReactNode }) {
  return (
    <span className="rv-tooltip" role="note" data-ds="Tooltip">
      {children}
    </span>
  );
}
