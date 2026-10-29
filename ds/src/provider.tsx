import { type CSSProperties, type ReactNode } from 'react';
import './base.css';

export type Vars = Record<string, string>;

// Conteneur des composants : applique la typographie du DS et, dans DS-Studio,
// les variables du brouillon à la place de tokens.css.
export function DSProvider({
  vars,
  children,
}: {
  vars?: Vars;
  children: ReactNode;
}) {
  return (
    <div className="ds" style={vars as CSSProperties | undefined}>
      {children}
    </div>
  );
}
