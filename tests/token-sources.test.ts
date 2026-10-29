import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatOf,
  parse,
  typeOf,
  validValue,
  write,
} from '../app/shared/token-sources.js';

const css = `/* Thème */
:root {
  --brand: #3355FF;
  --space-md:   16px ;
  --font: "Inter", sans-serif;
  /* --ancien: #000; */
}
.dark { --brand: #99AAFF; }
.button { color: var(--brand); }
`;

test('CSS : variables de :root seulement, positions exactes, commentaires ignorés', () => {
  const { tokens, ignored } = parse('css', css);
  assert.deepEqual(
    tokens.map((t) => [t.key, t.value, t.type, t.line]),
    [
      ['brand', '#3355FF', 'color', 3],
      ['space-md', '16px', 'dimension', 4],
      ['font', '"Inter", sans-serif', 'other', 5],
    ],
  );
  assert.equal(ignored, 1);
  for (const t of tokens) assert.equal(css.slice(t.start, t.end), t.value);
});

test('CSS : réécriture sur place, le reste du fichier intact octet pour octet', () => {
  const out = write('css', css, { brand: '#112233', 'space-md': '20px' });
  assert.equal(out, css.replace('#3355FF', '#112233').replace('16px', '20px'));
  assert.match(out, /\.dark \{ --brand: #99AAFF; \}/);
  assert.deepEqual(
    parse('css', out).tokens.map((t) => t.value),
    ['#112233', '20px', '"Inter", sans-serif'],
  );
});

test('SCSS : variables de premier niveau, !default conservé, blocs et commentaires ignorés', () => {
  const scss = `// Couleurs
$primary: #FF0066 !default;
$radius: 4px;
.card {
  $local: 2px;
}
/* $old: red; */
`;
  const { tokens } = parse('scss', scss);
  assert.deepEqual(
    tokens.map((t) => [t.key, t.value, t.line]),
    [
      ['primary', '#FF0066', 2],
      ['radius', '4px', 3],
    ],
  );
  const out = write('scss', scss, { primary: '#00AA55' });
  assert.equal(out, scss.replace('#FF0066', '#00AA55'));
});

test('JSON : plat et DTCG, types déclarés respectés, indentation et nombres conservés', () => {
  const json = `{
    "color": {
        "brand": { "$value": "#3355FF", "$type": "color" },
        "text": "#111111"
    },
    "space": { "md": 16 }
}
`;
  const { tokens } = parse('json', json);
  assert.deepEqual(
    tokens.map((t) => [t.key, t.value, t.type]),
    [
      ['color.brand', '#3355FF', 'color'],
      ['color.text', '#111111', 'color'],
      ['space.md', '16', 'dimension'],
    ],
  );
  const out = write('json', json, {
    'color.brand': '#000000',
    'space.md': '20',
  });
  assert.deepEqual(JSON.parse(out), {
    color: { brand: { $value: '#000000', $type: 'color' }, text: '#111111' },
    space: { md: 20 },
  });
  assert.match(out, /^ {4}"color"/m);
  assert.ok(out.endsWith('\n'));
});

test('types et validation : couleurs, dimensions, valeurs dangereuses refusées', () => {
  assert.equal(typeOf('rgb(1 2 3)'), 'color');
  assert.equal(typeOf('1.5rem'), 'dimension');
  assert.equal(typeOf('bold'), 'other');
  assert.equal(
    validValue('color', '#12345'),
    'Couleur attendue (#RRGGBB, rgb(), hsl()…).',
  );
  assert.equal(validValue('color', '#123456'), null);
  assert.match(validValue('other', 'red; } body { display:none')!, /interdits/);
  assert.match(validValue('dimension', 'grand')!, /Dimension/);
  assert.equal(formatOf('src/theme/tokens.scss'), 'scss');
  assert.equal(formatOf('x.js'), null);
});
