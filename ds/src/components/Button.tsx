import { type ReactNode } from 'react';
import './Button.css';

export function Button({
  variant = 'primary',
  children,
  disabled = false,
  onClick,
}: {
  variant?: 'primary' | 'secondary' | 'danger';
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      data-ds="Button"
      data-ds-variant={`variant=${variant}, state=${disabled ? 'disabled' : 'default'}`}
      className={`ds-button ${variant}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
