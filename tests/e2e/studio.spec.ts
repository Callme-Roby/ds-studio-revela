import { test, expect, type Page } from '@playwright/test';

// Couleur CSS calculée attendue pour une valeur #RRGGBB, quel que soit le seed.
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const state = async (page: Page) =>
  (await page.request.get('/api/state')).json();
// Bouton principal du catalogue (fiche Button, tokens validés).
const catalogButton = (page: Page) =>
  page
    .locator('.ds-canvas')
    .getByRole('button', { name: 'Déclencher', exact: true });

test('boucle centrale : diff, validation, propagation au catalogue et à l’aperçu, recharge, annulation sélective', async ({
  page,
}) => {
  const seedBrand: string = (await state(page)).tokens['color.brand'].$value;
  await page.goto('/#/variables');
  await expect(
    page.getByRole('heading', { name: 'Variables', level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText('Figma non connecté', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Valeur du token').fill('#8A3B20');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(seedBrand);
  await expect(dialog).toContainText('#8A3B20');
  await dialog.getByRole('button', { name: 'Ne pas appliquer' }).click();
  expect((await state(page)).revision).toBe(0);
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await dialog.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('link', { name: /Composants/ }).click();
  await expect(catalogButton(page)).toHaveCSS(
    'background-color',
    'rgb(138, 59, 32)',
  );
  await page.getByRole('link', { name: /Aperçu/ }).click();
  const frame = page.frameLocator('iframe[title="Aperçu de Revela"]');
  await expect(
    frame.getByRole('button', { name: 'Déclencher', exact: true }),
  ).toHaveCSS('background-color', 'rgb(138, 59, 32)');
  await expect(
    frame.getByRole('button', { name: 'Prise de vue', exact: true }),
  ).toHaveCSS('background-color', 'rgb(138, 59, 32)');
  await page.reload();
  await expect(
    frame.getByRole('button', { name: 'Déclencher', exact: true }),
  ).toHaveCSS('background-color', 'rgb(138, 59, 32)');
  await page.goto('/#/variables');
  await page
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('space.md');
  await page.getByLabel('Valeur du token').fill('22');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  // space.md 22 > space.lg : échelle inversée, validation possible après accord explicite.
  await expect(
    dialog.getByRole('list', { name: 'Problèmes introduits' }),
  ).toContainText('space.lg');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('link', { name: /Historique/ }).click();
  await page
    .getByRole('button', { name: 'Annuler la révision 1', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto('/#/composants/button');
  await expect(catalogButton(page)).toHaveCSS(
    'background-color',
    rgb(seedBrand),
  );
  await expect(catalogButton(page)).toHaveCSS('padding-left', '22px');
  await page.screenshot({ path: 'test-results/studio.png', fullPage: true });
});

test('aperçu : largeurs desktop réelles, ajustement, écrans Revela et interactions', async ({
  page,
}) => {
  await page.goto('/#/apercu');
  const iframe = page.locator('iframe[title="Aperçu de Revela"]');
  const frame = page.frameLocator('iframe[title="Aperçu de Revela"]');
  for (const [value, width] of [
    ['0', 1024],
    ['1', 1280],
    ['2', 1440],
    ['3', 1920],
  ] as const) {
    await page
      .getByRole('combobox', { name: 'Viewport', exact: true })
      .selectOption(value);
    await expect(iframe).toHaveAttribute('width', String(width));
    await expect
      .poll(() =>
        iframe.evaluate((f: HTMLIFrameElement) => f.contentWindow?.innerWidth),
      )
      .toBe(width);
    expect(
      await frame
        .locator('body')
        .evaluate((el) => el.scrollWidth <= window.innerWidth),
    ).toBe(true);
    // Panneau de réglages collé à droite, scène sur le reste de la largeur.
    const aside = await frame
      .locator('.rv-aside')
      .evaluate((el) => el.getBoundingClientRect().toJSON());
    expect(Math.round(aside.width)).toBe(300);
    expect(Math.round(aside.x + aside.width)).toBe(width);
  }
  // Ajusté à la fenêtre : jamais plus large que la zone d'aperçu.
  const stage = await page.locator('.stage').evaluate((el) => el.clientWidth);
  const shown = await page
    .locator('.stage-frame')
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(shown).toBeLessThanOrEqual(stage + 1);
  await page
    .getByRole('combobox', { name: 'Viewport', exact: true })
    .selectOption('1');
  await frame.getByRole('button', { name: 'Déclencher', exact: true }).click();
  await expect(
    frame.getByText('1 photo(s) de démonstration ajoutée(s).'),
  ).toBeVisible();
  await expect(frame.locator('.rv-filmstrip .rv-thumb')).toHaveCount(7);
  await frame.getByRole('button', { name: 'Retenir DSC_0412' }).click();
  await expect(
    frame.getByRole('button', { name: 'Retirer DSC_0412' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await frame
    .getByRole('button', { name: 'Bibliothèque', exact: true })
    .click();
  await expect(
    frame.getByRole('button', { name: 'Bibliothèque', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(frame.getByRole('heading', { name: 'EXPORT' })).toBeVisible();
  const screens = page.getByRole('group', { name: 'Écran de Revela' });
  await screens.getByRole('button', { name: 'Développement' }).click();
  await expect(
    frame.getByRole('heading', { name: 'DÉVELOPPEMENT' }),
  ).toBeVisible();
  await screens.getByRole('button', { name: 'Bibliothèque' }).click();
  await frame.getByLabel('Recherche par description').fill('portrait gris');
  await frame.getByRole('button', { name: 'Chercher', exact: true }).click();
  await expect(
    frame.getByText(/Recherche de démonstration : « portrait gris »/),
  ).toBeVisible();
  await page.setViewportSize({ width: 700, height: 900 });
  expect(
    await page
      .locator('body')
      .evaluate((el) => el.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test('contrôles Revela : gris teinté signalé, validation verrouillée sans accord', async ({
  page,
}) => {
  await page.goto('/#/variables');
  const before = await state(page);
  await page
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('color.surface');
  await page.getByLabel('Valeur du token').fill('#FFF5F5');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const introduced = dialog.getByRole('list', { name: 'Problèmes introduits' });
  await expect(introduced).toContainText('neutralité');
  await expect(introduced).toContainText('écart de 10');
  const validate = dialog.getByRole('button', {
    name: 'Valider et enregistrer',
  });
  await expect(validate).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await expect(validate).toBeEnabled();
  await dialog.getByRole('button', { name: 'Ne pas appliquer' }).click();
  // L'ancien --ink-mute de Revela est signalé : 3,45:1 pour du texte secondaire.
  await page
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('color.muted');
  await page.getByLabel('Valeur du token').fill('#8A8A8A');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await expect(introduced).toContainText('3.45:1');
  await dialog.getByRole('button', { name: 'Ne pas appliquer' }).click();
  expect((await state(page)).revision).toBe(before.revision);
});

test('entrée couleur invalide sans mutation et clavier du diff', async ({
  page,
}) => {
  await page.goto('/#/variables');
  await page.getByLabel('Valeur du token').fill('red');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Données invalides');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('Valeur du token').fill('#123456');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Ne pas appliquer' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('variables : aperçu en contexte avec le brouillon, sans écriture', async ({
  page,
}) => {
  await page.goto('/#/variables');
  const { revision } = await state(page);
  const preview = page
    .locator('.usage-card')
    .filter({ hasText: 'Button' })
    .getByRole('button', {
      name: 'Déclencher',
      exact: true,
    });
  await page.getByLabel('Valeur du token').fill('#225588');
  await expect(preview).toHaveCSS('background-color', 'rgb(34, 85, 136)');
  await page.getByRole('tab', { name: 'Code' }).click();
  await expect(page.locator('.code-block')).toContainText(
    '--color-brand: #225588;',
  );
  await expect(page.locator('.usage-list')).toContainText(
    'components/Button.css',
  );
  expect((await state(page)).revision).toBe(revision);
  await page.getByRole('tab', { name: 'Aperçu' }).click();
  await page.getByRole('button', { name: 'Abandonner le brouillon' }).click();
});

test('export navigateur, import valide avec diff, fichier invalide sans écriture', async ({
  page,
}) => {
  await page.goto('/#/integrations');
  await expect(
    page.getByRole('heading', { name: 'Intégrations', level: 1 }),
  ).toBeVisible();
  const before = await state(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter les tokens' }).click();
  const file = await download;
  const { readFile } = await import('node:fs/promises');
  const exported = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(exported).toEqual(before.tokens);
  exported['color.success'].$value = '#125533';
  await page.locator('input[type=file]').setInputFiles({
    name: 'palette.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('color.success');
  expect((await state(page)).revision).toBe(before.revision);
  await dialog.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await expect(dialog).not.toBeVisible();
  const after = await state(page);
  expect(after.tokens['color.success'].$value).toBe('#125533');
  await page.locator('input[type=file]').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{bad'),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await state(page)).revision).toBe(after.revision);
});

test('contraste proposé immédiat sans modifier les composants enregistrés', async ({
  page,
}) => {
  await page.goto('/#/variables');
  await page
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('color.brand');
  await page.getByLabel('Valeur du token').fill('#FFFFFF');
  await expect(
    page.getByText('Contraste proposé :', { exact: false }),
  ).toContainText('1.00:1');
  await expect(
    page.getByText('Contraste proposé :', { exact: false }),
  ).toContainText('Contraste à améliorer');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect((await state(page)).tokens['color.brand'].$value).not.toBe('#FFFFFF');
});

test('brief privé persistant dans la vue Projet', async ({ page }) => {
  await page.goto('/#/projet');
  await page.getByText('Mon PFE · brief privé', { exact: true }).click();
  await page
    .getByLabel('Nom du PFE', { exact: true })
    .fill('Mon atelier accessible');
  await page
    .getByLabel('Public concerné', { exact: true })
    .fill('Étudiants en mobilité');
  await page
    .getByLabel('Objectif et critères de réussite', { exact: true })
    .fill('Réserver en moins de trois étapes');
  await page.getByRole('button', { name: 'Enregistrer le brief' }).click();
  await expect(page.getByText('Brief enregistré sur ce poste.')).toBeVisible();
  await page.reload();
  await page.getByText('Mon PFE · brief privé', { exact: true }).click();
  await expect(page.getByLabel('Nom du PFE', { exact: true })).toHaveValue(
    'Mon atelier accessible',
  );
});

test('recherche, brouillon récupéré après recharge et abandon sans écriture', async ({
  page,
}) => {
  await page.goto('/#/variables');
  const before = await state(page);
  await page.getByLabel('Rechercher un token').fill('space');
  const spaceKeys = Object.keys(before.tokens).filter((k) =>
    k.includes('space'),
  );
  await expect(
    page.getByText(`${spaceKeys.length} résultat(s).`, { exact: false }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('space.lg');
  await page.getByLabel('Valeur du token').fill('31');
  await expect(
    page.getByText('Brouillon non enregistré.', { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: 'Token', exact: true }),
  ).toHaveValue('space.lg');
  await expect(page.getByLabel('Valeur du token')).toHaveValue('31');
  await expect(
    page.getByText('Brouillon récupéré', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Abandonner le brouillon' }).click();
  await expect(page.getByLabel('Valeur du token')).toHaveValue(
    String(before.tokens['space.lg'].$value),
  );
  expect((await state(page)).revision).toBe(before.revision);
});

test('conflit multi-onglets visible dans le diff, aucune perte de données', async ({
  page,
  context,
}) => {
  await page.goto('/#/variables');
  await page
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('color.brand');
  await page.getByLabel('Valeur du token').fill('#223355');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  const other = await context.newPage();
  await other.goto('/#/variables');
  await other
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('color.brand');
  await other.getByLabel('Valeur du token').fill('#664422');
  await other.getByRole('button', { name: 'Proposer', exact: true }).click();
  await other.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await expect(other.getByRole('dialog')).not.toBeVisible();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('Une autre validation');
  await expect(
    dialog.getByRole('button', { name: 'Valider et enregistrer' }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Ne pas appliquer' }).click();
  expect((await state(page)).tokens['color.brand'].$value).toBe('#664422');
  await other.close();
});

test('capacité de session périmée simulée sans rejeu ambigu', async ({
  page,
}) => {
  await page.goto('/#/variables');
  await page.getByRole('heading', { name: 'Variables', level: 1 }).waitFor();
  const boot = await (await page.request.get('/api/bootstrap')).json();
  // Un seul refus certain avant mutation, comme une capacité périmée après restart.
  let requests = 0;
  await page.route('**/api/proposals', async (route) => {
    requests++;
    if (requests === 1)
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Validation de session manquante. Rechargez la page.',
        }),
      });
    expect(route.request().headers()['x-ds-studio']).toBe(boot.csrf);
    return route.continue();
  });
  await page
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('color.focus');
  await page.getByLabel('Valeur du token').fill('#776622');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(requests).toBe(2);
  await page.keyboard.press('Escape');
});

test('composants : code d’un composant, diff, aperçu compilé, validation et annulation', async ({
  page,
}) => {
  const original = (
    await (
      await page.request.get('/api/components/file?path=components/Button.css')
    ).json()
  ).content;
  await page.goto('/#/composants/button');
  await expect(
    page.getByRole('heading', { name: 'Button', level: 2 }),
  ).toBeVisible();
  await expect(page.locator('.chips')).toContainText('--color-brand');
  await page.getByRole('tab', { name: 'Code' }).click();
  await page.getByRole('tab', { name: 'Button.css' }).click();
  const editor = page.getByLabel('Code de components/Button.css');
  const css = await editor.inputValue();
  await editor.fill(css.replace('var(--radius-control)', 'var(--radius-lg)'));
  await page.getByRole('button', { name: 'Proposer ce changement' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Valider le changement de code',
  });
  await expect(dialog).toContainText('Compilation réussie');
  await expect(dialog.locator('.code-diff')).toContainText('--radius-lg');
  // L'aperçu compilé utilise le code proposé, avant toute écriture.
  const compiled = dialog
    .frameLocator('iframe')
    .getByRole('button', { name: 'Déclencher', exact: true });
  await expect(compiled).toHaveCSS('border-top-left-radius', '20px');
  await dialog.getByRole('checkbox').uncheck();
  await dialog
    .getByRole('button', { name: 'Valider et écrire dans ds/src' })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText(/Révision de code c1 écrite dans ds\/src/),
  ).toBeVisible();
  await page.getByRole('link', { name: /Historique/ }).click();
  await page.getByRole('button', { name: 'Annuler c1' }).click();
  await dialog
    .getByRole('button', { name: 'Valider et écrire dans ds/src' })
    .click();
  await expect(dialog).not.toBeVisible();
  const restored = await (
    await page.request.get('/api/components/file?path=components/Button.css')
  ).json();
  // Annulation exacte, fins de ligne du fichier comprises (CRLF sous Windows).
  expect(restored.content).toBe(original);
});

test('assistant flottant repliable, sans compte IA requis', async ({
  page,
}) => {
  await page.goto('/#/apercu');
  await page.getByRole('button', { name: /Assistant IA/ }).click();
  const panel = page.getByRole('complementary', { name: 'Assistant IA' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Composants (code)' }).click();
  await expect(panel).toContainText('copie isolée de ds/');
  await panel.getByRole('button', { name: 'Replier l’assistant' }).click();
  await expect(panel).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: /Assistant IA/ }),
  ).toBeVisible();
});

test('clavier, mobile 375 px et absence de stockage navigateur', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Stockage refusé');
    };
    Storage.prototype.getItem = () => {
      throw new DOMException('Stockage refusé');
    };
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/#/variables');
  await page.getByRole('heading', { name: 'Variables', level: 1 }).waitFor();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Aller au contenu' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Variables', level: 1 }),
  ).toBeFocused();
  await page.getByLabel('Valeur du token').fill('#114477');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(
    await page.locator('body').evaluate((el) => el.scrollWidth <= innerWidth),
  ).toBe(true);
});

test('export Figma : capture des composants et écrans, couleurs rattachées aux bons tokens', async ({
  page,
}) => {
  await page.goto('/#/integrations');
  await page.getByRole('button', { name: 'Préparer l’export Figma' }).click();
  await expect(page.getByText(/export prêt · 11 composants/)).toBeVisible({
    timeout: 20000,
  });
  const spec = await (await page.request.get('/api/figma/spec')).json();
  const { revision } = await state(page);
  expect(spec.revision).toBe(revision);
  const button = spec.components.find(
    (c: { name: string }) => c.name === 'Button',
  );
  const primary = button.variants.find((v: { variant: string }) =>
    v.variant.startsWith('variant=primary, state=default'),
  ).node;
  // Fond et texte valent tous deux du blanc/noir : le rendu témoin les distingue.
  expect(primary.fill.token).toBe('color.brand');
  expect(primary.children[0].color.token).toBe('color.onBrand');
  expect(primary.layout.padding[3].token).toBe('space.md');
  expect(spec.screens.map((s: { name: string }) => s.name)).toEqual([
    'Revela · Prise de vue',
    'Revela · Bibliothèque',
    'Revela · Développement',
  ]);
  // Dépôt pour le plugin uniquement en lecture, origine null.
  expect(
    (
      await page.request.get('/api/figma/spec', { headers: { Origin: 'null' } })
    ).status(),
  ).toBe(200);
});

test('projets : ajouter un dossier local, vue d’ensemble, revenir à Revela', async ({ page }) => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const folder = await mkdtemp(path.join(tmpdir(), 'ds-e2e-projet-'));
  try {
    await page.goto('/#/apercu');
    await page.getByRole('button', { name: /Revela/ }).first().click();
    await page.getByRole('menuitem', { name: /Ajouter un projet/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Ajouter un projet' });
    await dialog.getByLabel('Nom du projet').fill('Site vitrine');
    await dialog.getByLabel(/Dossier du projet/).fill('relatif');
    await dialog.getByRole('button', { name: 'Ajouter le projet' }).click();
    await expect(dialog.getByRole('alert')).toContainText('absolu');
    await dialog.getByLabel(/Dossier du projet/).fill(folder);
    await dialog.getByLabel('Fichier Figma').fill('https://www.figma.com/design/abc/Site');
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Ajouter le projet' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Site vitrine', level: 1 })).toBeVisible();
    await expect(page.getByText('Dossier présent sur ce poste.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ouvrir dans Figma' })).toHaveAttribute(
      'href',
      'https://www.figma.com/design/abc/Site',
    );
    await expect(page.getByRole('button', { name: /Assistant IA/ })).toHaveCount(0);
    await page.getByRole('button', { name: /Site vitrine/ }).first().click();
    await page.getByRole('menuitemradio', { name: /Revela/ }).click();
    await expect(page.getByRole('heading', { name: 'Aperçu de Revela', level: 1 })).toBeVisible();
    // Nettoyage : projet retiré, Revela reste.
    await page.request.post('/api/projects/remove', {
      headers: {
        'X-DS-Studio': (await (await page.request.get('/api/bootstrap')).json()).csrf,
        Origin: new URL(page.url()).origin,
      },
      data: { id: 'site-vitrine' },
    });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
