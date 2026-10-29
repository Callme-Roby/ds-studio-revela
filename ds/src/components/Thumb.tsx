import { useState, type CSSProperties } from 'react';
import './Thumb.css';

// Fond de vignette : contenu photo simulé en niveaux de gris, pas un token d'interface.
const shades = ['28%', '46%', '62%', '36%', '54%', '70%', '40%', '58%'];
export function Thumb({
  name,
  index,
  jpeg = false,
  initialPick = false,
}: {
  name: string;
  index: number;
  jpeg?: boolean;
  initialPick?: boolean;
}) {
  const [picked, setPicked] = useState(initialPick);
  return (
    <figure className={`rv-thumb${picked ? ' is-pick' : ''}`}>
      <div
        className="rv-photo"
        style={{ '--shade': shades[index % shades.length] } as CSSProperties}
      />
      <button
        className="rv-pick"
        aria-pressed={picked}
        aria-label={picked ? `Retirer ${name}` : `Retenir ${name}`}
        onClick={() => setPicked(!picked)}
      >
        {picked ? '★' : '☆'}
      </button>
      <figcaption>
        {name}
        {jpeg && <em> +JPEG</em>}
      </figcaption>
    </figure>
  );
}
