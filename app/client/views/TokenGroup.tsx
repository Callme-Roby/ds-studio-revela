import { useEffect, useState, type ReactNode } from 'react';

// Groupes de variables dépliants, comme le panneau des variables de Figma. Le
// groupe de la variable sélectionnée s'ouvre seul ; la recherche ouvre tout.
export function useOpenGroups(selected?: string) {
  const [open, setOpen] = useState(() => new Set(selected ? [selected] : []));
  useEffect(() => {
    if (selected)
      setOpen((s) => (s.has(selected) ? s : new Set(s).add(selected)));
  }, [selected]);
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return { open, toggle };
}

export default function TokenGroup({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section aria-label={label}>
      <button className="token-group" aria-expanded={open} onClick={onToggle}>
        <span className="token-group-chevron" aria-hidden="true">
          ▸
        </span>
        <span className="token-group-name" title={label}>
          {label}
        </span>
        <span className="token-group-count">{count}</span>
      </button>
      {open && <ul className="token-rows">{children}</ul>}
    </section>
  );
}
