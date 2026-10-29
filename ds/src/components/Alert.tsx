import { type ReactNode } from 'react';
import './Alert.css';

export function Alert({
  tone,
  children,
}: {
  tone: 'warning' | 'danger';
  children: ReactNode;
}) {
  return (
    <p
      className={`rv-alert ${tone}`}
      role="status"
      data-ds="Alert"
      data-ds-variant={`tone=${tone}`}
    >
      {children}
    </p>
  );
}
