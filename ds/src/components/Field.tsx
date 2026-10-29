import './Field.css';

export function Field({
  label,
  placeholder,
}: {
  label: string;
  placeholder: string;
}) {
  return (
    <label className="rv-field">
      <span className="rv-label">{label}</span>
      <input placeholder={placeholder} />
    </label>
  );
}
