import { request } from './api.js';
import type { FigmaSpec } from '../shared/figma-spec.js';

export type SpecStatus = {
  revision: number;
  codeRevision: number;
  date: string;
  components: number;
  variants: number;
  screens: number;
};

// Prépare l'export Figma : une iframe cachée rend le DS en mode capture (taille
// d'écran 1440 × 900), renvoie la description, que le serveur garde pour le plugin.
let running: Promise<SpecStatus> | null = null;
export function prepareFigmaExport(): Promise<SpecStatus> {
  running ??= new Promise<SpecStatus>((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText =
      'position:fixed;left:-20000px;top:0;width:1440px;height:900px;border:0;visibility:visible';
    const cleanup = () => {
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      frame.remove();
      running = null;
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Export Figma : la capture n’a pas répondu en 30 s.'));
    }, 30_000);
    async function onMessage(e: MessageEvent) {
      if (e.source !== frame.contentWindow || e.origin !== location.origin)
        return;
      if (e.data?.type !== 'ds-capture') return;
      cleanup();
      if (e.data.error)
        return reject(new Error(`Export Figma : ${e.data.error}`));
      try {
        const spec = e.data.spec as FigmaSpec;
        await request('figma/spec', spec);
        resolve(await specStatus());
      } catch (err) {
        reject(err);
      }
    }
    addEventListener('message', onMessage);
    frame.src = '/?preview=1&capture=1';
    document.body.append(frame);
  });
  return running;
}

export async function specStatus(): Promise<SpecStatus> {
  return request<SpecStatus>('figma/spec/status');
}
