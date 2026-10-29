import { test } from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../app/server/store.js';
import { tokensSchema } from '../app/shared/model.js';
import { createStudioServer } from '../app/server/http.js';
import { ClaudeAdapter } from '../connectors/agents/claude.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seed = tokensSchema.parse(
  JSON.parse(
    await readFile(
      path.join(root, 'workspace/design-system.tokens.json'),
      'utf8',
    ),
  ),
);
async function fixture(
  t: { after: (fn: () => Promise<void>) => void },
  dev = false,
) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ds-http-'));
  const store = new Store(directory, seed);
  await store.init();
  const app = await createStudioServer({
    root,
    store,
    dev,
    agent: {
      id: 'codex',
      async status() {
        return { available: false, detail: 'Non authentifié (simulation)' };
      },
      async reply() {
        throw new Error('Codex indisponible : authentification nécessaire.');
      },
    },
    claude: new ClaudeAdapter(process.execPath, [
      path.join(root, 'tests/fixtures/fake-claude.mjs'),
      'ok',
    ]),
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const port = (app.server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;
  const boot = await (await fetch(origin + '/api/bootstrap')).json();
  const post = (
    route: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(origin + '/api/' + route, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-DS-Studio': boot.csrf,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  return { origin, post, store };
}
test('API manuelle complète sans IA ni Figma, export égal au disque', async (t) => {
  const { origin, post, store } = await fixture(t);
  const boot = await (await fetch(origin + '/api/bootstrap')).json();
  assert.equal(boot.figma.connected, false);
  const proposed = await post('proposals', {
    revision: 0,
    changes: [{ key: 'color.brand', value: '#112233' }],
  });
  assert.equal(proposed.status, 200);
  const p = await proposed.json();
  assert.equal(store.snapshot().revision, 0);
  const accepted = await post('commit', { id: p.id });
  assert.equal(accepted.status, 200);
  const result = await accepted.json();
  assert.equal(result.state.revision, 1);
  assert.equal(result.code.status, 'disabled');
  assert.deepEqual(await (await fetch(origin + '/api/code')).json(), {
    configured: false,
  });
  assert.equal(
    (await (await fetch(origin + '/api/export')).json())['color.brand'].$value,
    '#112233',
  );
  const undo = await (await post('undo', { revision: 1, id: p.id })).json();
  assert.equal((await post('commit', { id: undo.id })).status, 200);
  assert.equal(
    store.snapshot().tokens['color.brand'].$value,
    seed['color.brand'].$value,
  );
});
test('plugin Figma : lecture seule des tokens depuis l’origine null, rien d’autre', async (t) => {
  const { origin } = await fixture(t);
  const ok = await fetch(origin + '/api/figma/tokens', {
    headers: { Origin: 'null', 'Sec-Fetch-Site': 'cross-site' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'null');
  const body = await ok.json();
  assert.deepEqual(Object.keys(body).sort(), ['revision', 'tokens']);
  assert.equal(body.tokens['color.brand'].$value, seed['color.brand'].$value);
  // Hôte localhost : accepté pour la seule lecture du plugin.
  const viaLocalhost = (route: string, headers: Record<string, string>) =>
    new Promise<number>((resolve, reject) => {
      const { port } = new URL(origin);
      http
        .get(
          {
            host: '127.0.0.1',
            port,
            path: route,
            headers: { Host: `localhost:${port}`, ...headers },
          },
          (r) => {
            r.resume();
            resolve(r.statusCode!);
          },
        )
        .on('error', reject);
    });
  assert.equal(
    await viaLocalhost('/api/figma/tokens', { Origin: 'null' }),
    200,
  );
  assert.equal(await viaLocalhost('/api/state', { Origin: 'null' }), 403);
  assert.equal(await viaLocalhost('/api/figma/tokens', {}), 403);
  // Préflight Private Network Access envoyé par Chromium depuis figma.com.
  const pre = await fetch(origin + '/api/figma/tokens', {
    method: 'OPTIONS',
    headers: {
      Origin: 'null',
      'Access-Control-Request-Private-Network': 'true',
    },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-private-network'), 'true');
  assert.equal(pre.headers.get('access-control-allow-methods'), 'GET');
  const preState = await fetch(origin + '/api/state', {
    method: 'OPTIONS',
    headers: { Origin: 'null' },
  });
  assert.equal(preState.status, 403);
  for (const [route, init] of [
    ['/api/figma/tokens', { headers: { Origin: 'https://evil.example' } }],
    ['/api/project', { headers: { Origin: 'null' } }],
    ['/api/state', { headers: { Origin: 'null' } }],
    [
      '/api/commit',
      {
        method: 'POST',
        headers: { Origin: 'null', 'Content-Type': 'application/json' },
        body: '{}',
      },
    ],
  ] as const) {
    const r = await fetch(origin + route, init as RequestInit);
    assert.equal(r.status, 403, route);
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  }
});
test('contrôles Revela imposés par le serveur : accord explicite exigé', async (t) => {
  const { post, store } = await fixture(t);
  const p = await (
    await post('proposals', {
      revision: 0,
      changes: [{ key: 'color.surface', value: '#FFF5F5' }],
    })
  ).json();
  const refused = await post('commit', { id: p.id });
  assert.equal(refused.status, 409);
  assert.match((await refused.json()).error, /accord explicite/);
  assert.equal(store.snapshot().revision, 0);
  assert.equal(
    (await post('commit', { id: p.id, acknowledged: true })).status,
    200,
  );
  assert.equal(store.snapshot().tokens['color.surface'].$value, '#FFF5F5');
});
test('Claude propose via le même diff, source tracée, aucune écriture avant validation', async (t) => {
  const { post, store } = await fixture(t);
  const r = await post('agent', {
    agent: 'claude',
    message: 'Assombris l’alerte.',
    revision: 0,
    history: [],
  });
  assert.equal(r.status, 200);
  const { message, proposal } = await r.json();
  assert.equal(message, 'Alerte plus sombre.');
  assert.equal(proposal.source, 'claude');
  assert.deepEqual(proposal.patches, [
    { key: 'color.warning', before: '#8F5600', after: '#7A4A00' },
  ]);
  assert.equal(store.snapshot().revision, 0);
  assert.equal((await post('commit', { id: proposal.id })).status, 200);
  assert.equal(store.snapshot().history[0].source, 'claude');
});
test('CSRF, origine étrangère, rebinding Host et périmètre refusés', async (t) => {
  const { origin, post, store } = await fixture(t);
  const body = {
    revision: 0,
    changes: [{ key: 'color.brand', value: '#112233' }],
  };
  assert.equal(
    (await post('proposals', body, { 'X-DS-Studio': '' })).status,
    403,
  );
  assert.equal(
    (await post('proposals', body, { Origin: 'https://evil.invalid' })).status,
    403,
  );
  const hostStatus = await new Promise<number | undefined>(
    (resolve, reject) => {
      http
        .get(
          origin + '/api/state',
          { headers: { Host: 'evil.invalid' } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        )
        .on('error', reject);
    },
  );
  assert.equal(hostStatus, 403);
  assert.equal(
    (await post('proposals', { ...body, path: '../../outside' })).status,
    400,
  );
  assert.equal(
    (
      await post('proposals', {
        revision: 0,
        changes: [{ key: '../../outside', value: '#112233' }],
      })
    ).status,
    400,
  );
  assert.equal((await post('figma/write', {})).status, 404);
  assert.equal((await fetch(origin + '/.ds-studio/state.json')).status, 404);
  assert.equal((await fetch(origin + '/workspace/PFE.md')).status, 404);
  assert.equal(store.snapshot().revision, 0);
});
test('requêtes malformées et trop grandes refusées', async (t) => {
  const { origin, post } = await fixture(t);
  assert.equal(
    (await post('import', { revision: 0, tokens: { wrong: true } })).status,
    400,
  );
  assert.equal((await post('proposals', {})).status, 400);
  assert.equal((await post('agent', { data: 'x'.repeat(129000) })).status, 413);
  const boot = await (await fetch(origin + '/api/bootstrap')).json();
  assert.equal(
    (
      await fetch(origin + '/api/commit', {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          'X-DS-Studio': boot.csrf,
        },
        body: '{bad',
      })
    ).status,
    400,
  );
});
test('IA sans compte, adaptateur non implémenté ou réponse IA : aucune mutation', async (t) => {
  const { post, store } = await fixture(t);
  const body = { agent: 'codex', revision: 0, message: 'Bonjour', history: [] };
  const response = await post('agent', body);
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /authentification/);
  assert.equal((await post('agent', { ...body, agent: 'gemini' })).status, 500);
  // Claude (faux CLI) répond par une proposition : rien n'est écrit pour autant.
  assert.equal((await post('agent', { ...body, agent: 'claude' })).status, 200);
  assert.equal(store.snapshot().revision, 0);
});

test('mode dev : frontend servi, workspace et backend non distribués', async (t) => {
  const { origin } = await fixture(t, true);
  for (const route of [
    '/',
    '/app/client/main.tsx',
    '/app/shared/model.ts',
    '/@vite/client',
  ])
    assert.equal((await fetch(origin + route)).status, 200);
  for (const route of [
    '/workspace/PFE.md',
    '/app/server/http.ts',
    '/connectors/agents/codex.ts',
    '/.ds-studio/state.json',
    '/.git/config',
  ])
    assert.equal((await fetch(origin + route)).status, 403);
});

test('brief : API fermée, révision conflictuelle et aucun fichier privé servi', async (t) => {
  const { origin, post, store } = await fixture(t);
  const initial = await (await fetch(origin + '/api/project')).json();
  const body = {
    ...initial,
    project: { ...initial.project, name: 'PFE test' },
  };
  assert.equal(
    (await post('project', body, { 'X-DS-Studio': '' })).status,
    403,
  );
  assert.equal((await post('project', body)).status, 200);
  assert.equal((await post('project', body)).status, 409);
  assert.equal(
    (await post('project', { ...body, path: '../../escape' })).status,
    400,
  );
  assert.equal((await fetch(origin + '/.ds-studio/project.json')).status, 404);
  assert.equal(store.snapshot().revision, 0);
});

test('mode manuel disponible immédiatement même si la détection IA ne répond jamais', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ds-no-agent-'));
  const store = new Store(directory, seed);
  await store.init();
  const app = await createStudioServer({
    root,
    store,
    agent: {
      id: 'codex',
      async status() {
        return new Promise(() => {});
      },
      async reply() {
        throw new Error('Non disponible');
      },
    },
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const response = await fetch(origin + '/api/bootstrap', {
    signal: AbortSignal.timeout(2000),
  });
  assert.equal(response.status, 200);
  assert.equal(typeof (await response.json()).csrf, 'string');
});

test('composants : propose, aperçu, valide, annule ; agent de code via diff ; périmètre fermé', async (t) => {
  const { cp } = await import('node:fs/promises');
  const { ComponentStore } = await import('../app/server/components.js');
  const directory = await mkdtemp(path.join(tmpdir(), 'ds-http-comp-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(path.join(root, 'ds'), path.join(directory, 'ds'), {
    recursive: true,
  });
  const store = new Store(path.join(directory, 'data'), seed);
  await store.init();
  const components = new ComponentStore(
    path.join(directory, 'ds', 'src'),
    store.directory,
    path.join(directory, 'preview'),
  );
  let rebuilt = 0;
  const app = await createStudioServer({
    root,
    store,
    components,
    rebuild: async () => {
      rebuilt++;
    },
    claude: new ClaudeAdapter(process.execPath, [
      path.join(root, 'tests/fixtures/fake-claude.mjs'),
      'ok',
    ]),
    editor: {
      async edit() {
        return {
          message: 'Ghost ajouté.',
          denied: 0,
          changes: [
            {
              path: 'components/Ghost.tsx',
              content: 'export const Ghost = () => null;\n',
            },
          ],
        };
      },
    },
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const { csrf } = await (await fetch(origin + '/api/bootstrap')).json();
  const post = (route: string, body: unknown) =>
    fetch(origin + '/api/' + route, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-DS-Studio': csrf,
      },
      body: JSON.stringify(body),
    });
  const list = await (await fetch(origin + '/api/components')).json();
  assert.ok(
    list.files.some(
      (f: { path: string }) => f.path === 'components/Button.tsx',
    ),
  );
  assert.equal(
    (await fetch(origin + '/api/components/file?path=../package.json')).status,
    400,
  );
  const css = (
    await (
      await fetch(origin + '/api/components/file?path=components/Button.css')
    ).json()
  ).content;
  const p = await (
    await post('components/propose', {
      changes: [
        { path: 'components/Button.css', content: css + '\n/* test */\n' },
      ],
    })
  ).json();
  assert.equal(p.source, 'manual');
  assert.equal(
    (
      await post('components/propose', {
        changes: [{ path: '../evil.ts', content: '' }],
      })
    ).status,
    400,
  );
  // Aperçu absent (aucun compilateur injecté) : 404, jamais un fichier du disque.
  assert.equal(
    (await fetch(`${origin}/preview/code/${p.id}/index.html`)).status,
    404,
  );
  const done = await (
    await post('components/commit', { id: p.id, git: false })
  ).json();
  assert.equal(done.entry.revision, 1);
  assert.equal(done.rebuilt, true);
  assert.equal(rebuilt, 1);
  assert.match(
    await readFile(
      path.join(directory, 'ds/src/components/Button.css'),
      'utf8',
    ),
    /\/\* test \*\//,
  );
  const agent = await (
    await post('components/agent', { message: 'Ajoute Ghost' })
  ).json();
  assert.equal(agent.message, 'Ghost ajouté.');
  assert.equal(agent.proposal.source, 'claude');
  await assert.rejects(() =>
    readFile(path.join(directory, 'ds/src/components/Ghost.tsx')),
  );
  assert.equal(
    (await post('components/discard', { id: agent.proposal.id })).status,
    200,
  );
  assert.equal(
    (await post('components/commit', { id: agent.proposal.id })).status,
    404,
  );
  const undo = await (
    await post('components/undo', { id: done.entry.id })
  ).json();
  assert.equal((await post('components/commit', { id: undo.id })).status, 200);
  assert.equal(
    await readFile(
      path.join(directory, 'ds/src/components/Button.css'),
      'utf8',
    ),
    css,
  );
  // Le vrai ds/ du dépôt n'a jamais été touché.
  assert.doesNotMatch(
    await readFile(path.join(root, 'ds/src/components/Button.css'), 'utf8'),
    /\/\* test \*\//,
  );
});

test('export Figma : dépôt par l’atelier (CSRF), lecture par le plugin (origine null), rien d’autre', async (t) => {
  const { origin, post } = await fixture(t);
  assert.equal((await fetch(origin + '/api/figma/spec')).status, 404);
  const spec = JSON.parse(
    await readFile(path.join(root, 'tests/fixtures/figma-spec.json'), 'utf8'),
  );
  assert.equal((await post('figma/spec', { ...spec, version: 2 })).status, 400);
  assert.equal(
    (await post('figma/spec', spec, { 'X-DS-Studio': '' })).status,
    403,
  );
  assert.equal((await post('figma/spec', spec)).status, 200);
  const status = await (await fetch(origin + '/api/figma/spec/status')).json();
  assert.deepEqual(
    [status.components, status.variants, status.screens],
    [11, 19, 3],
  );
  const plugin = await fetch(origin + '/api/figma/spec', {
    headers: { Origin: 'null', 'Sec-Fetch-Site': 'cross-site' },
  });
  assert.equal(plugin.status, 200);
  assert.equal(plugin.headers.get('access-control-allow-origin'), 'null');
  assert.equal((await plugin.json()).components.length, 11);
  // Le plugin ne peut ni déposer un export ni lire le statut.
  const forged = await fetch(origin + '/api/figma/spec', {
    method: 'POST',
    headers: { Origin: 'null', 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  });
  assert.equal(forged.status, 403);
  assert.equal(
    (
      await fetch(origin + '/api/figma/spec/status', {
        headers: { Origin: 'null' },
      })
    ).status,
    403,
  );
});

test('projets : ajout protégé (CSRF), bascule, retrait ; Revela toujours présent', async (t) => {
  const { origin, post } = await fixture(t);
  const folder = await mkdtemp(path.join(tmpdir(), 'ds-http-proj-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const body = {
    name: 'Site vitrine',
    root: folder,
    source: { type: 'local', url: '' },
    figma: { plugin: true, fileUrl: '' },
  };
  assert.equal(
    (await post('projects/add', body, { 'X-DS-Studio': '' })).status,
    403,
  );
  assert.equal(
    (await post('projects/add', { ...body, root: 'relatif' })).status,
    400,
  );
  const added = await (await post('projects/add', body)).json();
  assert.equal(added.active, 'site-vitrine');
  assert.deepEqual(
    added.projects.map((p: { id: string }) => p.id),
    ['revela', 'site-vitrine'],
  );
  assert.equal((await post('projects/active', { id: 'revela' })).status, 200);
  assert.equal(
    (await (await fetch(origin + '/api/projects')).json()).active,
    'revela',
  );
  assert.equal((await post('projects/remove', { id: 'revela' })).status, 400);
  const removed = await (
    await post('projects/remove', { id: 'site-vitrine' })
  ).json();
  assert.deepEqual(
    removed.projects.map((p: { id: string }) => p.id),
    ['revela'],
  );
  // Le plugin Figma (origine null) n'a pas accès aux projets.
  assert.equal(
    (await fetch(origin + '/api/projects', { headers: { Origin: 'null' } }))
      .status,
    403,
  );
});

test('variables d’un projet externe : sources, proposition, validation sur place, annulation', async (t) => {
  const { origin, post } = await fixture(t);
  const folder = await mkdtemp(path.join(tmpdir(), 'ds-http-tok-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(path.join(folder, 'styles'));
  const css = ':root {\n  --brand: #3355FF;\n}\n';
  await writeFile(path.join(folder, 'styles', 'tokens.css'), css);
  await post('projects/add', {
    name: 'Site',
    root: folder,
    source: { type: 'local', url: '' },
    figma: { plugin: false, fileUrl: '' },
  });
  assert.equal(
    (
      await post('projects/site/sources', {
        tokens: [{ file: '../x.css', format: 'css' }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post('projects/site/sources', {
        tokens: [{ file: 'styles/tokens.css', format: 'css' }],
      })
    ).status,
    200,
  );
  const read = await (await fetch(origin + '/api/projects/site/tokens')).json();
  assert.deepEqual(
    read.tokens.map((x: { id: string }) => x.id),
    ['styles/tokens.css#brand'],
  );
  assert.equal(
    (
      await post('projects/site/tokens/propose', {
        changes: [{ id: 'styles/tokens.css#brand', value: 'red;}' }],
      })
    ).status,
    400,
  );
  const p = await (
    await post('projects/site/tokens/propose', {
      changes: [{ id: 'styles/tokens.css#brand', value: '#112233' }],
    })
  ).json();
  assert.equal(
    await readFile(path.join(folder, 'styles', 'tokens.css'), 'utf8'),
    css,
  );
  const entry = await (
    await post('projects/site/tokens/commit', { id: p.id })
  ).json();
  assert.equal(entry.revision, 1);
  assert.equal(
    await readFile(path.join(folder, 'styles', 'tokens.css'), 'utf8'),
    css.replace('#3355FF', '#112233'),
  );
  const undo = await (
    await post('projects/site/tokens/undo', { id: entry.id })
  ).json();
  await post('projects/site/tokens/commit', { id: undo.id });
  assert.equal(
    await readFile(path.join(folder, 'styles', 'tokens.css'), 'utf8'),
    css,
  );
  // Le plugin (origine null) n'y a pas accès.
  assert.equal(
    (
      await fetch(origin + '/api/projects/site/tokens', {
        headers: { Origin: 'null' },
      })
    ).status,
    403,
  );
});

test('composants et Git d’un projet externe : dossiers vérifiés, chemins fermés, plugin refusé', async (t) => {
  const { origin, post } = await fixture(t);
  const folder = await mkdtemp(path.join(tmpdir(), 'ds-http-comp-ext-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(path.join(folder, 'ui'));
  await writeFile(
    path.join(folder, 'ui', 'Card.css'),
    '.card { padding: 8px; }\n',
  );
  await writeFile(path.join(folder, 'secret.env'), 'TOKEN=x\n');
  await post('projects/add', {
    name: 'App',
    root: folder,
    source: { type: 'local', url: '' },
    figma: { plugin: false, fileUrl: '' },
  });
  assert.equal(
    (await fetch(origin + '/api/projects/app/components')).status,
    409,
  );
  assert.equal(
    (
      await post('projects/app/component-dirs', {
        components: [{ dir: '../x', extensions: ['css'] }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post('projects/app/component-dirs', {
        components: [{ dir: 'absent', extensions: ['css'] }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post('projects/app/component-dirs', {
        components: [{ dir: 'ui', extensions: ['css'] }],
      })
    ).status,
    200,
  );
  const list = await (
    await fetch(origin + '/api/projects/app/components')
  ).json();
  assert.deepEqual(
    list.files.map((f: { path: string }) => f.path),
    ['ui/Card.css'],
  );
  assert.equal(
    (await fetch(origin + '/api/projects/app/components/file?path=secret.env'))
      .status,
    400,
  );
  assert.equal(
    (await fetch(origin + '/api/projects/app/components/file?path=../x.css'))
      .status,
    400,
  );
  assert.equal(
    (
      await post('projects/app/components/propose', {
        changes: [{ path: 'secret.env', content: 'x' }],
      })
    ).status,
    400,
  );
  const p = await (
    await post('projects/app/components/propose', {
      changes: [{ path: 'ui/Card.css', content: '.card { padding: 16px; }\n' }],
    })
  ).json();
  const done = await (
    await post('projects/app/components/commit', { id: p.id, git: false })
  ).json();
  assert.equal(done.entry.revision, 1);
  assert.equal(
    await readFile(path.join(folder, 'ui', 'Card.css'), 'utf8'),
    '.card { padding: 16px; }\n',
  );
  assert.deepEqual(
    await (await fetch(origin + '/api/projects/app/git')).json(),
    { repo: false },
  );
  assert.equal(
    (
      await fetch(origin + '/api/projects/app/components', {
        headers: { Origin: 'null' },
      })
    ).status,
    403,
  );
  assert.equal(
    (await post('projects/app/git/push', {}, { Origin: 'null' })).status,
    403,
  );
});

test('plugin Figma téléchargeable : archive avec manifest, code et interface', async (t) => {
  const { origin } = await fixture(t);
  const r = await fetch(origin + '/api/figma/plugin.zip');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/zip');
  assert.match(
    r.headers.get('content-disposition') ?? '',
    /ds-studio-figma-plugin\.zip/,
  );
  const archive = Buffer.from(await r.arrayBuffer());
  const names = archive.toString('latin1');
  for (const name of ['manifest.json', 'code.js', 'ui.html', 'LISEZMOI.txt'])
    assert.ok(names.includes(`ds-studio-figma-plugin/${name}`), name);
  const manifest = await readFile(
    path.join(root, 'figma-plugin', 'manifest.json'),
  );
  assert.ok(archive.includes(manifest));
});

test('plugin multi-projets et aperçu : projets cochés seulement, adresses locales seulement', async (t) => {
  const { origin, post } = await fixture(t);
  const folder = await mkdtemp(path.join(tmpdir(), 'ds-http-plug-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const { writeFile } = await import('node:fs/promises');
  await writeFile(
    path.join(folder, 'tokens.css'),
    ':root {\n  --brand: #3355ff;\n  --gap: 1rem;\n}\n',
  );
  const add = (name: string, plugin: boolean) =>
    post('projects/add', {
      name,
      root: folder,
      source: { type: 'local', url: '' },
      figma: { plugin, fileUrl: '' },
    });
  await add('Site', false);
  await post('projects/site/sources', {
    tokens: [{ file: 'tokens.css', format: 'css' }],
  });
  const plugin = (route: string) =>
    fetch(origin + route, { headers: { Origin: 'null' } });
  let list = await (await plugin('/api/figma/projects')).json();
  assert.deepEqual(
    list.projects.map((p: { id: string }) => p.id),
    ['revela'],
  );
  assert.equal((await plugin('/api/figma/tokens?project=site')).status, 403);
  await post('projects/figma', {
    id: 'site',
    figma: { plugin: true, fileUrl: '' },
  });
  list = await (await plugin('/api/figma/projects')).json();
  assert.deepEqual(
    list.projects.map(
      (p: { id: string; collection: string; components: boolean }) => [
        p.id,
        p.collection,
        p.components,
      ],
    ),
    [
      ['revela', 'Revela · DS-Studio', true],
      ['site', 'Site · DS-Studio', false],
    ],
  );
  const r = await plugin('/api/figma/tokens?project=site');
  assert.equal(r.headers.get('access-control-allow-origin'), 'null');
  assert.deepEqual(await r.json(), {
    revision: 0,
    collection: 'Site · DS-Studio',
    tokens: {
      brand: { $type: 'color', $value: '#3355FF' },
      gap: { $type: 'dimension', $value: 16 },
    },
  });
  assert.equal((await plugin('/api/figma/tokens?project=../x')).status, 400);
  // Aperçu : adresses locales uniquement ; vérification sans serveur lancé.
  assert.equal(
    (
      await post('projects/site/preview', {
        url: 'https://evil.example',
        catalog: '',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post('projects/site/preview', {
        url: 'http://localhost:9',
        catalog: '/ds',
      })
    ).status,
    200,
  );
  const check = await (
    await fetch(origin + '/api/projects/site/preview/check')
  ).json();
  assert.equal(check.reachable, false);
  assert.deepEqual(
    await (await fetch(origin + '/api/projects/site/stories')).json(),
    { stories: [] },
  );
  // Le plugin n'a pas accès aux autres routes du projet.
  assert.equal((await plugin('/api/projects/site/preview/check')).status, 403);
  const csp =
    (await fetch(origin + '/')).headers.get('content-security-policy') ?? '';
  assert.match(csp, /frame-src 'self' http:\/\/localhost:\*/);
});

test('page catalogue générée par l’agent (faux CLI) : copie du projet, seul le dossier de la page proposé', async (t) => {
  const { ProjectCodeEditor } =
    await import('../connectors/agents/project-code.js');
  const directory = await mkdtemp(path.join(tmpdir(), 'ds-http-cat-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { writeFile, mkdir } = await import('node:fs/promises');
  const site = path.join(directory, 'site');
  await mkdir(path.join(site, 'src', 'app'), { recursive: true });
  await mkdir(path.join(site, 'src', 'components'), { recursive: true });
  await mkdir(path.join(site, 'node_modules', 'lourd'), { recursive: true });
  await writeFile(
    path.join(site, 'src', 'components', 'Card.tsx'),
    'export default function Card() { return <div />; }\n',
  );
  await writeFile(path.join(site, 'next.config.ts'), 'export default {};\n');
  await writeFile(path.join(site, 'node_modules', 'lourd', 'index.js'), 'x');
  const store = new Store(path.join(directory, 'data'), seed);
  await store.init();
  const fake = path.join(root, 'tests/fixtures/fake-claude.mjs');
  const app = await createStudioServer({
    root,
    store,
    claude: new ClaudeAdapter(process.execPath, [fake, 'ok']),
    projectEditor: new ProjectCodeEditor(process.execPath, [fake, 'catalog']),
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const { csrf } = await (await fetch(origin + '/api/bootstrap')).json();
  const post = (route: string, body: unknown) =>
    fetch(origin + '/api/' + route, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-DS-Studio': csrf,
      },
      body: JSON.stringify(body),
    });
  await post('projects/add', {
    name: 'Site',
    root: site,
    source: { type: 'local', url: '' },
    figma: { plugin: false, fileUrl: '' },
  });
  assert.equal(
    (await post('projects/site/catalog/generate', { route: '/ds-studio' }))
      .status,
    409,
  );
  await post('projects/site/component-dirs', {
    components: [{ dir: 'src/components', extensions: ['tsx'] }],
  });
  assert.equal(
    (await post('projects/site/catalog/generate', { route: '../x' })).status,
    400,
  );
  const r = await (
    await post('projects/site/catalog/generate', { route: '/ds-studio' })
  ).json();
  assert.equal(r.message, 'Page catalogue créée. Demande reçue : ok.');
  assert.deepEqual(
    r.proposal.files.map((f: { path: string }) => f.path),
    ['src/app/ds-studio/page.tsx'],
  );
  // Rien d'écrit avant validation ; le projet réel n'a pas bougé.
  await assert.rejects(() =>
    readFile(path.join(site, 'src/app/ds-studio/page.tsx')),
  );
  assert.equal(
    await readFile(path.join(site, 'next.config.ts'), 'utf8'),
    'export default {};\n',
  );
  const projectsNow = await (await fetch(origin + '/api/projects')).json();
  assert.equal(projectsNow.projects[1].preview.catalog, '/ds-studio');
  const done = await (
    await post('projects/site/components/commit', {
      id: r.proposal.id,
      git: false,
    })
  ).json();
  assert.equal(done.entry.revision, 1);
  assert.match(
    await readFile(path.join(site, 'src/app/ds-studio/page.tsx'), 'utf8'),
    /section id="Card"/,
  );
  assert.match(
    await readFile(path.join(site, 'src/components/Card.tsx'), 'utf8'),
    /<div \/>/,
  );
  const files = await (
    await fetch(origin + '/api/projects/site/components')
  ).json();
  assert.ok(
    files.files.some(
      (f: { path: string }) => f.path === 'src/app/ds-studio/page.tsx',
    ),
  );
});
