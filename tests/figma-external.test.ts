import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluginTokens, toPluginToken } from '../app/server/figma-external.js';
import {
  componentName,
  inCatalogPage,
  storiesFor,
} from '../app/shared/component-preview.js';
import { plan, scopesFor, variableName } from '../figma-plugin/src/logic.js';

test('conversion pour Figma : couleurs #RRGGBB, dimensions en pixels, reste en texte', () => {
  const t = (type: 'color' | 'dimension' | 'other', value: string) =>
    toPluginToken({ type, value });
  assert.deepEqual(t('color', '#abc'), { $type: 'color', $value: '#AABBCC' });
  assert.deepEqual(t('color', '#3355ffcc'), {
    $type: 'color',
    $value: '#3355FF',
  });
  assert.deepEqual(t('color', 'rgb(255, 0, 128)'), {
    $type: 'color',
    $value: '#FF0080',
  });
  assert.deepEqual(t('color', 'hsl(10 50% 50%)'), {
    $type: 'string',
    $value: 'hsl(10 50% 50%)',
  });
  assert.deepEqual(t('dimension', '16px'), { $type: 'dimension', $value: 16 });
  assert.deepEqual(t('dimension', '1.5rem'), {
    $type: 'dimension',
    $value: 24,
  });
  assert.deepEqual(t('dimension', '50%'), { $type: 'string', $value: '50%' });
  assert.deepEqual(t('other', '"Inter", sans-serif'), {
    $type: 'string',
    $value: '"Inter", sans-serif',
  });
});

test('clés : un même nom dans deux fichiers garde son fichier en préfixe', () => {
  const tok = (file: string, key: string, value: string) => ({
    id: `${file}#${key}`,
    key,
    value,
    type: 'color' as const,
    file,
    line: 1,
  });
  assert.deepEqual(
    Object.keys(
      pluginTokens([
        tok('a.css', 'brand', '#000000'),
        tok('b.css', 'brand', '#111111'),
        tok('a.css', 'text', '#222222'),
      ]),
    ),
    ['a.brand', 'b.brand', 'text'],
  );
});

test('plugin : noms de groupes et portées pour un projet externe', () => {
  assert.equal(variableName('color.brand.500'), 'color/brand/500');
  assert.deepEqual(scopesFor('gap-lg', { $type: 'dimension', $value: 24 }), [
    'ALL_SCOPES',
  ]);
  assert.deepEqual(scopesFor('brand', { $type: 'color', $value: '#000000' }), [
    'ALL_FILLS',
    'STROKE_COLOR',
  ]);
  const p = plan(
    {
      revision: 3,
      tokens: {
        brand: { $type: 'color', $value: '#3355FF' },
        gap: { $type: 'dimension', $value: 8 },
        font: { $type: 'string', $value: 'Inter' },
      },
    } as never,
    { variables: {} },
  );
  assert.deepEqual(
    p.create.map((r: { name: string; type: string }) => [r.name, r.type]),
    [
      ['brand', 'COLOR'],
      ['gap', 'FLOAT'],
      ['font', 'STRING'],
    ],
  );
});

test('aperçu des composants : nom du composant et histoires Storybook associées', () => {
  assert.equal(componentName('src/components/Button.tsx'), 'Button');
  assert.equal(componentName('src/components/Card/index.tsx'), 'Card');
  // Styles et histoires d'un composant : même composant.
  assert.equal(
    componentName('src/components/cause/ArticleCard.module.css'),
    'ArticleCard',
  );
  assert.equal(componentName('src/ui/Button.stories.tsx'), 'Button');
  // Fichiers de la page catalogue : la page entière.
  assert.ok(inCatalogPage('src/app/ds-studio/page.module.css', '/ds-studio'));
  assert.ok(inCatalogPage('pages/ds-studio/index.tsx', '/ds-studio'));
  assert.ok(!inCatalogPage('src/components/Card.tsx', '/ds-studio'));
  assert.ok(
    !inCatalogPage('src/app/ds-studio/page.tsx', 'http://localhost:6006'),
  );
  const stories = [
    {
      id: 'ui-button--primary',
      title: 'UI/Button',
      name: 'Primary',
      importPath: './src/components/Button.stories.tsx',
    },
    {
      id: 'ui-card--base',
      title: 'UI/Card',
      name: 'Base',
      importPath: './src/stories/Card.stories.tsx',
    },
    {
      id: 'pages-home--x',
      title: 'Pages/Home',
      name: 'X',
      importPath: './src/pages/Home.stories.tsx',
    },
  ];
  assert.deepEqual(
    storiesFor(stories, 'src/components/Button.tsx').map((s) => s.id),
    ['ui-button--primary'],
  );
  assert.deepEqual(
    storiesFor(stories, 'src/components/Card/index.tsx').map((s) => s.id),
    ['ui-card--base'],
  );
  assert.deepEqual(storiesFor(stories, 'src/components/Modal.tsx'), []);
});
