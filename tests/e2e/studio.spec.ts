import { test, expect } from '@playwright/test';

// Couleur CSS calculée attendue pour une valeur #RRGGBB, quel que soit le seed.
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

test('boucle centrale réelle : diff, validation, propagation, recharge, annulation sélective', async ({
  page,
}) => {
  await page.goto('/');
  const seedBrand: string = (await (await page.request.get('/api/state')).json())
    .tokens['color.brand'].$value;
  await expect(
    page.getByRole('heading', { name: 'Une source. Toutes les vues.' }),
  ).toBeVisible();
  await expect(
    page.getByText('Figma non connecté', { exact: true }),
  ).toBeVisible();
  const catalogue = page.locator('.ds-panel');
  const mobile = page.frameLocator('iframe');
  const mainButton = catalogue.getByRole('button', {
    name: 'Action principale',
    exact: true,
  });
  await expect(mainButton).toHaveCSS('background-color', rgb(seedBrand));
  await page.getByLabel('Valeur du token').fill('#8A3B20');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(seedBrand);
  await expect(dialog).toContainText('#8A3B20');
  await expect(mainButton).toHaveCSS('background-color', rgb(seedBrand));
  await dialog.getByRole('button', { name: 'Ne pas appliquer' }).click();
  await expect(mainButton).toHaveCSS('background-color', rgb(seedBrand));
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await dialog.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await expect(mainButton).toHaveCSS('background-color', 'rgb(138, 59, 32)');
  await expect(
    catalogue.getByRole('button', { name: 'Toutes', exact: true }),
  ).toHaveCSS('background-color', 'rgb(138, 59, 32)');
  await expect(
    mobile.getByRole('button', { name: 'Déclencher', exact: true }),
  ).toHaveCSS('background-color', 'rgb(138, 59, 32)');
  await expect(
    mobile.getByRole('button', { name: 'Prise de vue', exact: true }),
  ).toHaveCSS('background-color', 'rgb(138, 59, 32)');
  await page.reload();
  await expect(mainButton).toHaveCSS('background-color', 'rgb(138, 59, 32)');
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
  await page.getByRole('button', { name: /Historique/ }).click();
  await page
    .getByRole('button', { name: 'Annuler la révision 1', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await expect(mainButton).toHaveCSS('background-color', rgb(seedBrand));
  await expect(mainButton).toHaveCSS('padding-left', '22px');
  await expect(
    mobile.getByRole('button', { name: 'Déclencher', exact: true }),
  ).toHaveCSS('background-color', rgb(seedBrand));
  await page.screenshot({ path: 'test-results/studio.png', fullPage: true });
});

test('largeurs desktop réelles, écrans Revela et interactions', async ({
  page,
}) => {
  await page.goto('/');
  const frame = page.frameLocator('iframe');
  for (const [value, width] of [
    ['0', 1024],
    ['1', 1280],
    ['2', 1440],
    ['3', 1920],
  ] as const) {
    await page
      .getByRole('combobox', { name: 'Viewport', exact: true })
      .selectOption(value);
    await expect(page.locator('iframe')).toHaveAttribute(
      'width',
      String(width),
    );
    await expect
      .poll(() =>
        page
          .locator('iframe')
          .evaluate((f: HTMLIFrameElement) => f.contentWindow?.innerWidth),
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
  await page
    .getByRole('combobox', { name: 'Viewport', exact: true })
    .selectOption('1');
  await frame.getByRole('button', { name: 'Déclencher', exact: true }).click();
  await expect(
    frame.getByText('1 photo(s) de démonstration ajoutée(s).'),
  ).toBeVisible();
  await expect(frame.locator('.rv-filmstrip .rv-thumb')).toHaveCount(7);
  const pick = frame.getByRole('button', { name: 'Retenir DSC_0412' });
  await pick.click();
  await expect(
    frame.getByRole('button', { name: 'Retirer DSC_0412' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await frame.getByRole('button', { name: 'Bibliothèque', exact: true }).click();
  await expect(
    frame.getByRole('button', { name: 'Bibliothèque', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(frame.getByRole('heading', { name: 'EXPORT' })).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Scénario', exact: true })
    .selectOption('developpement');
  await expect(
    frame.getByRole('heading', { name: 'DÉVELOPPEMENT' }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Scénario', exact: true })
    .selectOption('catalogue');
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
  await page.goto('/');
  const before = await (await page.request.get('/api/state')).json();
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
  expect((await (await page.request.get('/api/state')).json()).revision).toBe(
    before.revision,
  );
});

test('entrée couleur invalide sans mutation et clavier du diff', async ({
  page,
}) => {
  await page.goto('/');
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

test('export navigateur, import valide avec diff, fichier invalide sans écriture', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Tokens sémantiques' }),
  ).toBeVisible();
  const before = await (await page.request.get('/api/state')).json();
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
  expect((await (await page.request.get('/api/state')).json()).revision).toBe(
    before.revision,
  );
  await dialog.getByRole('button', { name: 'Valider et enregistrer' }).click();
  await expect(dialog).not.toBeVisible();
  const after = await (await page.request.get('/api/state')).json();
  expect(after.tokens['color.success'].$value).toBe('#125533');
  await page.locator('input[type=file]').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{bad'),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await (await page.request.get('/api/state')).json()).revision).toBe(
    after.revision,
  );
});

test('V2 : contraste proposé immédiat sans modifier les composants enregistrés', async ({
  page,
}) => {
  await page.goto('/');
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
  const current = await (await page.request.get('/api/state')).json();
  expect(current.tokens['color.brand'].$value).not.toBe('#FFFFFF');
});

test('V2 : brief privé persistant, indépendant du mode IA', async ({
  page,
}) => {
  await page.goto('/');
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
  await expect(
    page.getByRole('combobox', { name: 'Mode de travail' }),
  ).toHaveValue('manual');
});

test('V2 : recherche, brouillon récupéré après recharge et abandon sans écriture', async ({
  page,
}) => {
  await page.goto('/');
  const before = await (await page.request.get('/api/state')).json();
  await page.getByLabel('Rechercher un token').fill('space');
  const spaceKeys = Object.keys(before.tokens).filter((k) => k.includes('space'));
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
  expect((await (await page.request.get('/api/state')).json()).revision).toBe(
    before.revision,
  );
});

test('V2 : conflit multi-onglets visible dans le diff, aucune perte de données', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page
    .getByRole('combobox', { name: 'Token', exact: true })
    .selectOption('color.brand');
  await page.getByLabel('Valeur du token').fill('#223355');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  const other = await context.newPage();
  await other.goto('/');
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
  expect(
    (await (await page.request.get('/api/state')).json()).tokens['color.brand']
      .$value,
  ).toBe('#664422');
  await other.close();
});

test('V2 : capacité de session périmée simulée sans rejeu ambigu', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Tokens sémantiques' }).waitFor();
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

test('V2 : clavier, mobile 375 px et absence de stockage navigateur', async ({
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
  await page.goto('/');
  await page.getByRole('heading', { name: 'Tokens sémantiques' }).waitFor();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Aller aux tokens' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Design System', exact: true }),
  ).toBeFocused();
  await page.getByLabel('Valeur du token').fill('#114477');
  await page.getByRole('button', { name: 'Proposer', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(
    await page.locator('body').evaluate((el) => el.scrollWidth <= innerWidth),
  ).toBe(true);
});
