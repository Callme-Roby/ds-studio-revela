import { useEffect, useRef, useState } from 'react';
import { scenarios } from '../DesignSystem.js';

// Revela est une application desktop : écrans de travail, du portable au poste studio.
export const devices = [
  { label: 'Portable · 1024', width: 1024, height: 640 },
  { label: 'Écran · 1280', width: 1280, height: 800 },
  { label: 'Large · 1440', width: 1440, height: 900 },
  { label: 'Studio · 1920', width: 1920, height: 1200 },
];

// Vue principale : l'application Revela à sa largeur réelle, réduite pour tenir
// dans la place disponible (ou à 100 % avec défilement).
export default function PreviewView() {
  const [device, setDevice] = useState(1);
  const [scenario, setScenario] = useState('studio');
  const [fit, setFit] = useState(true);
  const [width, setWidth] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const d = devices[device];
  const scale = fit && width ? Math.min(1, width / d.width) : 1;
  return (
    <div className="preview-view">
      <div className="toolbar">
        <div className="segmented-ui" role="group" aria-label="Écran de Revela">
          {scenarios.map((s) => (
            <button
              key={s.id}
              aria-pressed={scenario === s.id}
              onClick={() => setScenario(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <label className="inline-field">
          Viewport
          <select
            value={device}
            onChange={(e) => setDevice(Number(e.target.value))}
          >
            {devices.map((x, i) => (
              <option key={x.width} value={i}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          <input
            type="checkbox"
            checked={fit}
            onChange={(e) => setFit(e.target.checked)}
          />
          Ajuster à la fenêtre
        </label>
        <span className="muted">
          {d.width} × {d.height} px CSS · {Math.round(scale * 100)} %
        </span>
      </div>
      <div className="stage" ref={stage}>
        <div
          className="stage-frame"
          style={{ width: d.width * scale, height: d.height * scale }}
        >
          <iframe
            title="Aperçu de Revela"
            src={`/?preview=1&scenario=${scenario}`}
            width={d.width}
            height={d.height}
            style={{ transform: `scale(${scale})` }}
          />
        </div>
      </div>
    </div>
  );
}
