import { useEffect, useRef } from 'react';
import {
  catalog,
  DSProvider,
  scenarios,
  Scenario,
} from '../../ds/src/index.js';
import { request } from './api.js';
import { useDesignState } from './state.js';
import { tokenCss, tokenKeys, type Tokens } from '../shared/model.js';
import type { FigmaSpec, SpecFrame, SpecText } from '../shared/figma-spec.js';

// Mode capture (?preview=1&capture=1), ouvert dans une iframe cachée de
// l'atelier : rend chaque composant du catalogue et chaque écran, deux fois.
// - rendu réel : géométrie, mise en page, valeurs ;
// - rendu témoin : chaque couleur de token remplacée par une couleur unique,
//   pour savoir sans ambiguïté quelle variable colore chaque élément (brand,
//   text et focus valent tous #111111).
// Les dimensions sont rattachées par famille (espacements, rayons, tailles de
// texte), où chaque valeur est unique.

type Color = { r: number; g: number; b: number; a: number };
type Ref<T> = { value: T; token?: string };
const round = (n: number) => Math.round(n * 100) / 100;

function parseColor(css: string): Color | null {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = '1'] = m[1].split(/[ ,/]+/).filter(Boolean);
  return { r: +r / 255, g: +g / 255, b: +b / 255, a: +a };
}
const key = (c: Color | null) =>
  c ? [c.r, c.g, c.b].map((x) => Math.round(x * 255)).join(',') : '';

const colorKeys = tokenKeys.filter((k) => k.startsWith('color.'));
// Couleur témoin unique par token couleur (jamais une couleur du DS).
const sentinel = (i: number) => `rgb(3, 7, ${i + 11})`;
const ghostVars = (tokens: Tokens) => {
  const vars = tokenCss(tokens);
  colorKeys.forEach((k, i) => (vars[`--${k.replace('.', '-')}`] = sentinel(i)));
  return vars;
};
const sentinelToken = new Map(colorKeys.map((k, i) => [`3,7,${i + 11}`, k]));

function families(tokens: Tokens) {
  const map = (prefix: string) => {
    const byValue = new Map<number, string | null>();
    for (const k of tokenKeys)
      if (k.startsWith(prefix) && tokens[k].$type === 'dimension') {
        const v = Number(tokens[k].$value);
        byValue.set(v, byValue.has(v) ? null : k);
      }
    return (v: number): Ref<number> => {
      const t = byValue.get(round(v));
      return t ? { value: round(v), token: t } : { value: round(v) };
    };
  };
  return { space: map('space.'), radius: map('radius.'), font: map('font.') };
}

function capture(tokens: Tokens) {
  const fam = families(tokens);
  const colorRef = (real: string, ghost: string): Ref<Color> | null => {
    const value = parseColor(real);
    if (!value || value.a === 0) return null;
    const token = sentinelToken.get(key(parseColor(ghost)));
    return token ? { value, token } : { value };
  };
  const label = (el: Element) =>
    (
      el.getAttribute('data-ds') ??
      el.getAttribute('aria-label') ??
      (el.classList[0] || el.tagName.toLowerCase())
    ).slice(0, 80);

  function text(
    t: Text,
    parent: Element,
    ghostParent: Element,
    origin: DOMRect,
    absolute: boolean,
  ): SpecText | null {
    const cs = getComputedStyle(parent);
    let characters = (t.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!characters) return null;
    if (cs.textTransform === 'uppercase') characters = characters.toUpperCase();
    const range = document.createRange();
    range.selectNodeContents(t);
    const r = range.getBoundingClientRect();
    const color = colorRef(cs.color, getComputedStyle(ghostParent).color);
    return {
      kind: 'text',
      name: characters.slice(0, 40),
      x: round(r.left - origin.left),
      y: round(r.top - origin.top),
      w: round(r.width),
      h: round(r.height),
      characters,
      fontSize: fam.font(parseFloat(cs.fontSize)),
      fontWeight: Number(cs.fontWeight) || 400,
      lineHeight:
        cs.lineHeight === 'normal'
          ? undefined
          : round(parseFloat(cs.lineHeight)),
      letterSpacing:
        cs.letterSpacing === 'normal'
          ? undefined
          : round(parseFloat(cs.letterSpacing)),
      color: color ?? { value: { r: 0, g: 0, b: 0, a: 1 } },
      align:
        cs.textAlign === 'center'
          ? 'CENTER'
          : cs.textAlign === 'right'
            ? 'RIGHT'
            : 'LEFT',
      ...(absolute ? { absolute } : {}),
    };
  }

  function frame(
    el: Element,
    ghost: Element,
    origin: DOMRect,
    root = false,
  ): SpecFrame | null {
    const cs = getComputedStyle(el);
    const gs = getComputedStyle(ghost);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const node: SpecFrame = {
      kind: 'frame',
      name: label(el),
      x: root ? 0 : round(r.left - origin.left),
      y: root ? 0 : round(r.top - origin.top),
      w: round(r.width),
      h: round(r.height),
      children: [],
    };
    const fill = colorRef(cs.backgroundColor, gs.backgroundColor);
    if (fill) node.fill = fill;
    else if (cs.backgroundImage.includes('gradient')) {
      // Photo simulée : dégradé de gris, rendu par sa couleur moyenne.
      const stops = [...cs.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(
        (m) => parseColor(m[0])!,
      );
      if (stops.length) {
        const avg = (k: 'r' | 'g' | 'b') =>
          stops.reduce((s, c) => s + c[k], 0) / stops.length;
        node.fill = { value: { r: avg('r'), g: avg('g'), b: avg('b'), a: 1 } };
      }
    }
    const bw = parseFloat(cs.borderTopWidth);
    if (bw > 0 && cs.borderTopStyle !== 'none') {
      const stroke = colorRef(cs.borderTopColor, gs.borderTopColor);
      if (stroke) node.stroke = { ...stroke, weight: round(bw) };
    }
    const radius = parseFloat(cs.borderTopLeftRadius);
    if (radius > 0)
      node.radius = fam.radius(Math.min(radius, r.width / 2, r.height / 2));
    const opacity = parseFloat(cs.opacity);
    if (opacity < 1) node.opacity = round(opacity);
    if (cs.overflow === 'hidden' || cs.overflowX === 'hidden') node.clip = true;
    if (['absolute', 'fixed'].includes(cs.position) && !root)
      node.absolute = true;
    const ds = el.getAttribute('data-ds');
    if (ds && !root)
      node.instance = {
        component: ds,
        variant: el.getAttribute('data-ds-variant') ?? 'default',
      };
    const flex = cs.display === 'flex' || cs.display === 'inline-flex';
    if (flex && cs.flexWrap === 'nowrap') {
      const row = cs.flexDirection.startsWith('row');
      const axis = (v: string) =>
        v === 'center'
          ? 'CENTER'
          : v === 'flex-end' || v === 'end'
            ? 'MAX'
            : 'MIN';
      node.layout = {
        mode: row ? 'HORIZONTAL' : 'VERTICAL',
        gap: fam.space(parseFloat(row ? cs.columnGap : cs.rowGap) || 0),
        padding: [
          cs.paddingTop,
          cs.paddingRight,
          cs.paddingBottom,
          cs.paddingLeft,
        ].map((p) => fam.space(parseFloat(p) || 0)),
        align: axis(cs.alignItems),
        justify:
          cs.justifyContent === 'space-between'
            ? 'SPACE_BETWEEN'
            : axis(cs.justifyContent),
        hug: cs.display === 'inline-flex' || root,
      };
    }
    // Contrôles natifs : rendus simplifiés.
    if (el instanceof HTMLInputElement) {
      if (el.type === 'range') {
        const accent = colorRef(cs.accentColor, gs.accentColor);
        const pct =
          (Number(el.value) - Number(el.min)) /
          (Number(el.max) - Number(el.min) || 1);
        node.children.push({
          kind: 'frame',
          name: 'piste',
          x: 0,
          y: round(r.height / 2 - 2),
          w: node.w,
          h: 4,
          radius: { value: 2 },
          fill: accent ?? undefined,
          absolute: true,
          children: [],
        });
        node.children.push({
          kind: 'frame',
          name: 'curseur',
          x: round(pct * (node.w - 14)),
          y: round(r.height / 2 - 7),
          w: 14,
          h: 14,
          radius: { value: 7 },
          fill: accent ?? undefined,
          absolute: true,
          children: [],
        });
        delete node.layout;
        return node;
      }
      const placeholder = !el.value;
      const ps = getComputedStyle(el, '::placeholder');
      const characters = el.value || el.placeholder;
      if (characters) {
        const pad = parseFloat(cs.paddingLeft) || 0;
        node.children.push({
          kind: 'text',
          name: placeholder ? 'placeholder' : 'valeur',
          x: pad,
          y: round((r.height - parseFloat(cs.fontSize) * 1.3) / 2),
          w: round(r.width - 2 * pad),
          h: round(parseFloat(cs.fontSize) * 1.3),
          characters,
          fontSize: fam.font(parseFloat(cs.fontSize)),
          fontWeight: Number(cs.fontWeight) || 400,
          color: colorRef(
            placeholder ? ps.color : cs.color,
            placeholder
              ? getComputedStyle(ghost, '::placeholder').color
              : gs.color,
          ) ?? { value: { r: 0.4, g: 0.4, b: 0.4, a: 1 } },
          align: 'LEFT',
          absolute: true,
        });
      }
      delete node.layout;
      return node;
    }
    const kids = [...el.childNodes];
    const ghostKids = [...ghost.childNodes];
    kids.forEach((child, i) => {
      const g = ghostKids[i];
      if (!g) return;
      if (child.nodeType === Node.TEXT_NODE) {
        const t = text(child as Text, el, ghost, r, !node.layout);
        if (t) node.children.push(t);
      } else if (child instanceof Element && g instanceof Element) {
        if (['SCRIPT', 'STYLE', 'OPTION'].includes(child.tagName)) return;
        const f = frame(child, g, r);
        if (!f) return;
        // Sans mise en page automatique, chaque enfant garde sa position.
        if (!node.layout) f.absolute = true;
        node.children.push(f);
      }
    });
    return node;
  }

  const real = document.getElementById('cap-real')!;
  const ghost = document.getElementById('cap-ghost')!;
  const components: FigmaSpec['components'] = [];
  for (const item of catalog) {
    const a = real.querySelector(`[data-item="${item.id}"]`)!;
    const b = ghost.querySelector(`[data-item="${item.id}"]`)!;
    const roots = [...a.querySelectorAll(`[data-ds="${item.name}"]`)];
    const ghosts = [...b.querySelectorAll(`[data-ds="${item.name}"]`)];
    const variants: { variant: string; node: SpecFrame }[] = [];
    roots.forEach((el, i) => {
      const variant = el.getAttribute('data-ds-variant') ?? 'default';
      if (variants.some((v) => v.variant === variant)) return;
      const node = frame(el, ghosts[i], el.getBoundingClientRect(), true);
      if (node) variants.push({ variant, node: { ...node, name: variant } });
    });
    if (variants.length)
      components.push({
        name: item.name,
        group: item.group,
        description: item.description,
        variants,
      });
  }
  const screens: FigmaSpec['screens'] = scenarios.map((s) => {
    const a = real.querySelector(`[data-screen="${s.id}"] .scenario`)!;
    const b = ghost.querySelector(`[data-screen="${s.id}"] .scenario`)!;
    const node = frame(a, b, a.getBoundingClientRect(), true)!;
    return {
      name: `Revela · ${s.label}`,
      width: node.w,
      height: node.h,
      node: { ...node, name: `Revela · ${s.label}` },
    };
  });
  return { components, screens };
}

function Render({ vars, id }: { vars: Record<string, string>; id: string }) {
  return (
    <div id={id}>
      {catalog.map((item) => (
        <div key={item.id} data-item={item.id} className="capture-item">
          <DSProvider vars={vars}>
            <item.Demo />
          </DSProvider>
        </div>
      ))}
      {scenarios.map((s) => (
        <div key={s.id} data-screen={s.id} className="capture-screen">
          <Scenario vars={vars} scenario={s.id} />
        </div>
      ))}
    </div>
  );
}

export default function Capture() {
  const { state } = useDesignState();
  const done = useRef(false);
  useEffect(() => {
    if (!state || done.current) return;
    done.current = true;
    (async () => {
      await document.fonts.ready;
      // Pas de requestAnimationFrame : suspendu quand l'onglet est en arrière-plan.
      await new Promise((r) => setTimeout(r, 150));
      const { history } = await request<{ history: { revision: number }[] }>(
        'components',
      );
      let message;
      try {
        const { components, screens } = capture(state.tokens);
        const spec: FigmaSpec = {
          version: 1,
          revision: state.revision,
          codeRevision: history[0]?.revision ?? 0,
          date: new Date().toISOString(),
          components,
          screens,
        };
        message = { type: 'ds-capture', spec };
      } catch (e) {
        message = { type: 'ds-capture', error: (e as Error).message };
      }
      parent.postMessage(message, location.origin);
    })();
  }, [state]);
  if (!state) return <p>Chargement…</p>;
  return (
    <>
      <Render id="cap-real" vars={tokenCss(state.tokens)} />
      <Render id="cap-ghost" vars={ghostVars(state.tokens)} />
    </>
  );
}
