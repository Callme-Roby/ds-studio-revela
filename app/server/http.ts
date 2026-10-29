import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { proposeSchema } from '../shared/model.js';
import { Store, StudioError } from './store.js';
import { ProjectStore } from './project.js';
import { CodeTarget } from './code-target.js';
import { projectSchema } from '../shared/project.js';
import { CodexAdapter } from '../../connectors/agents/codex.js';
import { ClaudeAdapter } from '../../connectors/agents/claude.js';
import { auditProposal } from '../shared/rules.js';
import { unvalidatedAdapter } from '../../connectors/agents/unvalidated.js';
import type { AgentAdapter } from '../../connectors/agents/types.js';
import { figmaStatus } from '../../connectors/figma/contract.js';
import {
  ComponentStore,
  codeProposeSchema,
  componentPath,
} from './components.js';
import { previewBuilder } from './preview-build.js';
import { gitCommitter } from './git.js';
import { figmaSpecSchema, type FigmaSpec } from '../shared/figma-spec.js';
import { atomicWrite, readPrivate } from './files.js';
import { ProjectRegistry, resolveInside } from './registry.js';
import { ExternalTokens } from './external-tokens.js';
import { SettingsStore, settingsSchema } from './settings.js';
import { detectProject } from './detect.js';
import { ProjectRunner, choosePort, projectCommands } from './project-run.js';
import { zip } from './zip.js';
import { pluginTokens } from './figma-external.js';
import { cloneRepo, gitFetch, gitPush, gitStatus } from './project-git.js';
import { externalPath, externalProposeSchema } from './components.js';
import {
  componentSourceSchema,
  defaultExtensions,
  localUrl,
  newProjectSchema as cloneBase,
  previewSchema,
  tokenSourceSchema,
} from '../shared/projects.js';
import {
  newProjectSchema,
  projectSchema as dsProjectSchema,
} from '../shared/projects.js';
import { ClaudeCodeEditor } from '../../connectors/agents/claude-code.js';
import {
  ProjectCodeEditor,
  catalogRequest,
  catalogTarget,
  setupAnswer,
  setupRequest,
} from '../../connectors/agents/project-code.js';
import type { RecordInfo } from '../../scripts/runtime.mjs';

export async function createStudioServer(options: {
  root: string;
  store: Store;
  agent?: AgentAdapter;
  claude?: AgentAdapter;
  dev?: boolean;
  // Fichier tokens.css écrit sans code-target.json (ds/tokens.css en usage normal).
  codeFile?: string;
  // Dossier du DS (par défaut ds/ du dépôt), code des composants et agent de
  // code ; remplaçables en test.
  dsDir?: string;
  components?: ComponentStore;
  editor?: Pick<ClaudeCodeEditor, 'edit'>;
  // Agent de code des projets externes ; remplaçable en test.
  projectEditor?: Pick<ProjectCodeEditor, 'edit'>;
  // Recompilation de dist/ après validation de code (par défaut hors mode dev).
  rebuild?: () => Promise<void>;
  control?: { record: RecordInfo; stop: () => void };
}) {
  const { root, store } = options;
  const adapters: Record<string, AgentAdapter> = {
    codex: options.agent ?? new CodexAdapter(),
    claude: options.claude ?? new ClaudeAdapter(),
    gemini: unvalidatedAdapter('gemini'),
  };
  const project = new ProjectStore(store.directory);
  const code = new CodeTarget(
    store.directory,
    () => store.snapshot(),
    options.codeFile,
  );
  const preview = previewBuilder(root);
  const dsDir = options.dsDir ?? path.join(root, 'ds');
  const components =
    options.components ??
    new ComponentStore(
      path.join(dsDir, 'src'),
      store.directory,
      path.join(root, '.ds-studio-preview'),
      preview.build,
      gitCommitter(path.join(dsDir, 'src')),
    );
  // dist/ est compilé depuis ds/ du dépôt : inutile pour un autre dossier DS.
  const rebuild =
    options.rebuild ??
    (options.dev || options.dsDir ? undefined : preview.rebuildDist);
  const editor = options.editor ?? new ClaudeCodeEditor(dsDir);
  const projectEditor = options.projectEditor ?? new ProjectCodeEditor();
  // Export Figma (composants et écrans) préparé par l'atelier, lu par le plugin.
  const specFile = path.join(store.directory, 'figma-spec.json');
  let figmaSpec: FigmaSpec | null = await readPrivate(specFile, 8_000_000)
    .then((raw) => figmaSpecSchema.parse(JSON.parse(raw)))
    .catch(() => null);
  const projects = new ProjectRegistry(store.directory, root);
  const settings = new SettingsStore(store.directory);
  const externalStores = new Map<
    string,
    { key: string; store: ComponentStore }
  >();
  async function externalComponents(id: string) {
    const p = await projects.project(id);
    if (!p.components.length)
      throw new StudioError(
        'Aucun dossier de composants déclaré pour ce projet.',
        409,
      );
    // Page catalogue de l'app (si c'est un chemin) : éditable comme un composant.
    const catalog = p.preview.catalog.startsWith('/')
      ? await catalogTarget(p.root, p.preview.catalog)
      : null;
    const dirs = [
      ...p.components.map((c) => c.dir),
      ...(catalog ? [catalog.dir] : []),
    ];
    const key = JSON.stringify([p.root, p.components, catalog?.dir]);
    const cached = externalStores.get(id);
    if (cached?.key === key)
      return { project: p, store: cached.store, catalog };
    const store = new ComponentStore(
      p.root,
      projects.stateDir(id),
      path.join(root, '.ds-studio-preview'),
      undefined,
      gitCommitter(p.root),
      {
        dirs,
        extensions: [
          ...new Set([
            ...p.components.flatMap((c) => c.extensions),
            'tsx',
            'css',
          ]),
        ],
      },
    );
    externalStores.set(id, { key, store });
    return { project: p, store, catalog };
  }
  // Projet tout juste ajouté (actif) : la détection pré-remplit ses réglages,
  // comme l'assistant de démarrage. Seul l'état de DS-Studio est écrit ;
  // tout reste modifiable dans la vue d'ensemble.
  async function prefill() {
    const list = await projects.list();
    const id = list.active;
    try {
      const p = await projects.project(id);
      if (p.tokens.length || p.components.length) return list;
      const d = await detectProject(p.root);
      if (d.tokens.length)
        await projects.setSources(
          id,
          d.tokens.slice(0, 2).map(({ file, format }) => ({ file, format })),
        );
      if (d.components.length)
        await projects.setComponents(
          id,
          d.components.slice(0, 1).map((c) => ({
            dir: c.dir,
            extensions: [...defaultExtensions],
          })),
        );
      if (!p.preview.url && (d.preview.url || d.preview.catalog)) {
        // Port déjà attribué à un autre projet : le suivant, pour que deux
        // projets n'affichent jamais le même serveur.
        const taken = list.projects
          .filter((x) => x.id !== id)
          .map((x) => x.preview.url.match(/:(\d{2,5})(?:\/|$)/)?.[1]);
        let url = d.preview.url;
        const m = url.match(/^(.*:)(\d{2,5})$/);
        if (m) {
          let port = Number(m[2]);
          while (taken.includes(String(port))) port++;
          url = `${m[1]}${port}`;
        }
        await projects.setPreview(id, { ...d.preview, url });
      }
    } catch {
      /* Détection facultative : le projet reste ajouté, à régler à la main. */
    }
    return projects.list();
  }
  // Serveur de dev lancé par DS-Studio : son adresse réelle (port libre
  // choisi par lui) devient l'adresse d'aperçu du projet.
  const runner = new ProjectRunner((id, address) => {
    void projects
      .project(id)
      .then((p) =>
        p.preview.url === address
          ? undefined
          : projects.setPreview(id, { ...p.preview, url: address }),
      )
      .catch(() => {});
  });
  const csrf = randomBytes(32).toString('hex');
  let busy = false;
  let closing = false;
  const active = new Set<AbortController>();
  const vite = options.dev
    ? await (
        await import('vite')
      ).createServer({
        root,
        server: { middlewareMode: true, host: '127.0.0.1' },
        appType: 'spa',
      })
    : null;
  const server = http.createServer(async (req, res) => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const origin = `http://127.0.0.1:${port}`;
    const send = (status: number, value: unknown) => {
      if (!res.destroyed) {
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
        });
        res.end(JSON.stringify(value));
      }
    };
    if (closing) res.setHeader('Connection', 'close');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'${options.dev ? ' ws://127.0.0.1:*' : ''}; frame-src 'self' http://localhost:* http://127.0.0.1:* http://[::1]:* https://localhost:*; frame-ancestors 'self'; base-uri 'none'; form-action 'self'`,
    );
    try {
      const url = new URL(req.url ?? '/', origin);
      // Seule exception : le plugin Figma (iframe d'origine « null ») lit la
      // révision validée et les tokens, en GET, rien d'autre. Figma impose un
      // nom de domaine : localhost est accepté pour cette route uniquement.
      const figmaRoute =
        (url.pathname === '/api/figma/tokens' ||
          url.pathname === '/api/figma/spec' ||
          url.pathname === '/api/figma/projects') &&
        req.headers.origin === 'null';
      // Figma tourne sur une page publique : Chromium envoie d'abord un
      // préflight « Private Network Access » avant d'atteindre localhost.
      const figmaPlugin =
        figmaRoute && (req.method === 'GET' || req.method === 'OPTIONS');
      if (
        req.headers.host !== `127.0.0.1:${port}` &&
        !(figmaPlugin && req.headers.host === `localhost:${port}`)
      )
        throw new StudioError(
          'Hôte refusé. Utilisez l’adresse 127.0.0.1 affichée au démarrage.',
          403,
        );
      if (req.headers.origin && req.headers.origin !== origin && !figmaPlugin)
        throw new StudioError('Origine non autorisée.', 403);
      if (req.headers['sec-fetch-site'] === 'cross-site' && !figmaPlugin)
        throw new StudioError('Requête externe refusée.', 403);
      if (figmaPlugin && req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': 'null',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Private-Network': 'true',
          'Access-Control-Max-Age': '600',
        });
        return res.end();
      }
      if (url.pathname.startsWith('/_studio/')) {
        const control = options.control;
        if (
          !control ||
          req.headers['x-studio-control'] !== control.record.token
        )
          throw new StudioError('Contrôle privé refusé.', 403);
        const { token: _token, ...identity } = control.record;
        if (url.pathname === '/_studio/health' && req.method === 'GET')
          return send(200, identity);
        if (url.pathname === '/_studio/stop' && req.method === 'POST') {
          send(200, identity);
          setImmediate(control.stop);
          return;
        }
        throw new StudioError('Route inconnue.', 404);
      }
      if (url.pathname.startsWith('/api/')) {
        if (req.method === 'GET') {
          if (url.pathname === '/api/bootstrap')
            return send(200, {
              csrf,
              figma: figmaStatus,
              agents: [],
            });
          if (url.pathname === '/api/agents')
            return send(
              200,
              await Promise.all(
                Object.values(adapters).map(async (a) => ({
                  id: a.id,
                  ...(await a.status()),
                })),
              ),
            );
          if (url.pathname === '/api/project')
            return send(200, await project.read());
          if (url.pathname === '/api/state') return send(200, store.snapshot());
          if (url.pathname === '/api/code')
            return send(200, await code.status());
          if (url.pathname === '/api/figma/projects') {
            // Projets proposés au plugin : Revela et ceux cochés « plugin Figma ».
            if (figmaPlugin)
              res.setHeader('Access-Control-Allow-Origin', 'null');
            const { projects: all } = await projects.list();
            return send(200, {
              projects: all
                .filter((p) => p.builtin || p.figma.plugin)
                .map((p) => ({
                  id: p.id,
                  name: p.name,
                  collection: p.builtin
                    ? 'Revela · DS-Studio'
                    : `${p.name} · DS-Studio`,
                  components: p.builtin,
                })),
            });
          }
          if (
            url.pathname === '/api/figma/tokens' &&
            url.searchParams.get('project') &&
            url.searchParams.get('project') !== 'revela'
          ) {
            if (figmaPlugin)
              res.setHeader('Access-Control-Allow-Origin', 'null');
            const id = z
              .string()
              .regex(/^[a-z0-9-]{1,40}$/)
              .parse(url.searchParams.get('project'));
            const p = await projects.project(id);
            if (!p.figma.plugin)
              throw new StudioError(
                'Ce projet n’est pas synchronisé avec Figma (case « plugin Figma »).',
                403,
              );
            const service = new ExternalTokens(p, projects.stateDir(id));
            const { tokens } = await service.read();
            const history = await service.history();
            return send(200, {
              revision: history[0]?.revision ?? 0,
              collection: `${p.name} · DS-Studio`,
              tokens: pluginTokens(tokens),
            });
          }
          if (url.pathname === '/api/figma/tokens') {
            if (figmaPlugin)
              res.setHeader('Access-Control-Allow-Origin', 'null');
            const { revision, tokens } = store.snapshot();
            return send(200, { revision, tokens });
          }
          if (url.pathname === '/api/projects')
            return send(200, await projects.list());
          if (url.pathname === '/api/settings')
            return send(200, await settings.read());
          if (url.pathname === '/api/figma/plugin.zip') {
            // Plugin de développement tel que livré dans figma-plugin/.
            const dir = path.join(root, 'figma-plugin');
            const files = await Promise.all(
              ['manifest.json', 'code.js', 'ui.html'].map(async (name) => ({
                name: `ds-studio-figma-plugin/${name}`,
                data: await fs.readFile(path.join(dir, name)),
              })),
            );
            files.push({
              name: 'ds-studio-figma-plugin/LISEZMOI.txt',
              data: Buffer.from(
                'Plugin Figma DS-Studio\r\n\r\n1. Figma desktop : Plugins > Development > Import plugin from manifest...\r\n2. Choisissez manifest.json dans ce dossier.\r\n3. DS-Studio ouvert (npm start), lancez le plugin : Lire DS-Studio, puis Appliquer.\r\n',
              ),
            });
            res.writeHead(200, {
              'Content-Type': 'application/zip',
              'Content-Disposition':
                'attachment; filename="ds-studio-figma-plugin.zip"',
            });
            return res.end(zip(files));
          }
          const detect = url.pathname.match(
            /^\/api\/projects\/([a-z0-9-]{1,40})\/detect$/,
          );
          if (detect)
            return send(
              200,
              await detectProject((await projects.project(detect[1])).root),
            );
          const projectGet = url.pathname.match(
            /^\/api\/projects\/([a-z0-9-]{1,40})\/(git|components|components\/file|preview\/check|stories|setup)$/,
          );
          if (projectGet) {
            const [, id, what] = projectGet;
            if (what === 'setup') {
              // Mise en route : dépendances, environnement, commandes, catalogue.
              const p = await projects.project(id);
              const catalog = p.preview.catalog.startsWith('/')
                ? await catalogTarget(p.root, p.preview.catalog)
                : null;
              return send(200, {
                commands: await projectCommands(p.root),
                run: runner.status(id),
                catalog: catalog
                  ? await fs
                      .access(path.join(p.root, catalog.file))
                      .then(() => true)
                      .catch(() => false)
                  : /^https?:/.test(p.preview.catalog),
              });
            }
            if (what === 'preview/check') {
              // Le serveur de dev répond-il ? Adresse locale seulement.
              const target = (await projects.project(id)).preview.url;
              if (!target || !localUrl.test(target))
                return send(200, {
                  reachable: false,
                  detail: 'Aucune adresse d’aperçu.',
                });
              try {
                const r = await fetch(target, {
                  signal: AbortSignal.timeout(3000),
                  redirect: 'manual',
                });
                return send(200, {
                  reachable: true,
                  detail: `Répond (${r.status}).`,
                });
              } catch {
                return send(200, {
                  reachable: false,
                  detail:
                    'Ne répond pas : lancez le serveur de développement du projet.',
                });
              }
            }
            if (what === 'stories') {
              // Histoires Storybook (index.json), si le catalogue est un Storybook local.
              const catalog = (await projects.project(id)).preview.catalog;
              if (!localUrl.test(catalog)) return send(200, { stories: [] });
              try {
                const r = await fetch(
                  catalog.replace(/\/$/, '') + '/index.json',
                  {
                    signal: AbortSignal.timeout(3000),
                  },
                );
                const index = (await r.json()) as {
                  entries?: Record<
                    string,
                    {
                      id: string;
                      title: string;
                      name: string;
                      importPath?: string;
                      type?: string;
                    }
                  >;
                };
                const stories = Object.values(index.entries ?? {})
                  .filter((e) => e.type !== 'docs')
                  .slice(0, 2000)
                  .map(({ id, title, name, importPath }) => ({
                    id,
                    title,
                    name,
                    importPath: importPath ?? '',
                  }));
                return send(200, { stories });
              } catch {
                return send(200, {
                  stories: [],
                  detail: 'Storybook ne répond pas.',
                });
              }
            }
            if (what === 'git')
              return send(
                200,
                await gitStatus((await projects.project(id)).root),
              );
            const { store: cs } = await externalComponents(id);
            if (what === 'components')
              return send(200, {
                files: await cs.list(),
                history: await cs.history(),
              });
            const file = z
              .string()
              .max(300)
              .regex(externalPath)
              .parse(url.searchParams.get('path'));
            return send(200, { path: file, content: await cs.read(file) });
          }
          const projectTokens = url.pathname.match(
            /^\/api\/projects\/([a-z0-9-]{1,40})\/tokens$/,
          );
          if (projectTokens) {
            const id = projectTokens[1];
            const service = new ExternalTokens(
              await projects.project(id),
              projects.stateDir(id),
            );
            return send(200, {
              ...(await service.read()),
              history: await service.history(),
            });
          }
          if (url.pathname === '/api/components')
            return send(200, {
              files: await components.list(),
              history: await components.history(),
            });
          if (url.pathname === '/api/components/usages')
            return send(200, await components.usages());
          if (url.pathname === '/api/components/file') {
            const file = z
              .string()
              .regex(componentPath)
              .parse(url.searchParams.get('path'));
            return send(200, {
              path: file,
              content: await components.read(file),
            });
          }
          if (url.pathname === '/api/figma/spec/status') {
            if (!figmaSpec)
              throw new StudioError('Aucun export Figma préparé.', 404);
            return send(200, {
              revision: figmaSpec.revision,
              codeRevision: figmaSpec.codeRevision,
              date: figmaSpec.date,
              components: figmaSpec.components.length,
              variants: figmaSpec.components.reduce(
                (n, c) => n + c.variants.length,
                0,
              ),
              screens: figmaSpec.screens.length,
            });
          }
          if (url.pathname === '/api/figma/spec') {
            if (figmaPlugin)
              res.setHeader('Access-Control-Allow-Origin', 'null');
            if (!figmaSpec)
              throw new StudioError(
                'Aucun export Figma préparé : DS-Studio → Intégrations → Préparer l’export Figma.',
                404,
              );
            return send(200, figmaSpec);
          }
          if (url.pathname === '/api/export')
            return send(200, store.snapshot().tokens);
          throw new StudioError('Route inconnue.', 404);
        }
        if (req.method !== 'POST')
          throw new StudioError('Méthode non autorisée.', 405);
        if (req.headers['x-ds-studio'] !== csrf)
          throw new StudioError(
            'Validation de session manquante. Rechargez la page.',
            403,
          );
        if (!req.headers['content-type']?.startsWith('application/json'))
          throw new StudioError('JSON requis.', 415);
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          // Un fichier de composant complet peut dépasser la limite générale.
          if (
            size >
            (url.pathname === '/api/figma/spec'
              ? 6_000_000
              : url.pathname.endsWith('/components/propose')
                ? 450_000
                : 128_000)
          )
            throw new StudioError('Requête trop volumineuse.', 413);
          chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          throw new StudioError('JSON invalide.');
        }
        if (url.pathname === '/api/project') {
          const b = z
            .object({ base: z.string().max(64), project: projectSchema })
            .strict()
            .parse(body);
          return send(200, await project.save(b.base, b.project));
        }
        if (url.pathname === '/api/proposals') {
          const b = proposeSchema.parse(body);
          return send(200, store.propose(b.revision, b.changes));
        }
        if (url.pathname === '/api/import') {
          const b = z
            .object({
              revision: z.number().int().nonnegative(),
              tokens: z.unknown(),
            })
            .strict()
            .parse(body);
          return send(200, store.proposeImport(b.revision, b.tokens));
        }
        if (url.pathname === '/api/undo') {
          const b = z
            .object({
              revision: z.number().int().nonnegative(),
              id: z.string().uuid(),
            })
            .strict()
            .parse(body);
          return send(200, store.proposeUndo(b.revision, b.id));
        }
        if (url.pathname === '/api/commit') {
          const b = z
            .object({
              id: z.string().uuid(),
              acknowledged: z.boolean().optional(),
            })
            .strict()
            .parse(body);
          // Les contrôles Revela s'imposent ici aussi : une proposition, même venue
          // d'une IA, ne passe pas un problème introduit sans accord explicite.
          const pending = store.pending(b.id);
          const checks =
            pending && auditProposal(store.snapshot().tokens, pending);
          if (checks?.introduced.length && !b.acknowledged)
            throw new StudioError(
              `Cette proposition introduit ${checks.introduced.length} problème(s) : cochez l’accord explicite dans le diff.`,
              409,
            );
          const state = await store.commit(b.id);
          // La révision est acquise ; le code suit, sans pouvoir l'annuler.
          return send(200, { state, code: await code.write() });
        }
        const projectRoute = url.pathname.match(
          /^\/api\/projects\/([a-z0-9-]{1,40})\/(sources|preview|component-dirs|tokens\/propose|tokens\/commit|tokens\/undo|components\/propose|components\/commit|components\/discard|components\/undo|git\/fetch|git\/push|catalog\/generate|agent|run\/start|run\/stop|ai-setup)$/,
        );
        if (projectRoute) {
          const [, id, action] = projectRoute;
          if (action === 'sources') {
            const b = z
              .object({ tokens: z.array(tokenSourceSchema).max(10) })
              .strict()
              .parse(body);
            await projects.setSources(id, b.tokens);
            return send(200, await projects.list());
          }
          if (action === 'preview') {
            await projects.setPreview(id, previewSchema.parse(body));
            return send(200, await projects.list());
          }
          if (action === 'component-dirs') {
            const b = z
              .object({ components: z.array(componentSourceSchema).max(10) })
              .strict()
              .parse(body);
            await projects.setComponents(id, b.components);
            return send(200, await projects.list());
          }
          if (action === 'git/fetch' || action === 'git/push') {
            z.object({}).strict().parse(body);
            const projectRoot = (await projects.project(id)).root;
            return send(
              200,
              await (action === 'git/fetch'
                ? gitFetch(projectRoot)
                : gitPush(projectRoot)),
            );
          }
          if (action === 'catalog/generate') {
            const b = z
              .object({ route: z.string().regex(/^\/[a-z0-9-]{1,40}$/) })
              .strict()
              .parse(body);
            const p = await projects.project(id);
            if (!p.components.length)
              throw new StudioError(
                'Déclarez d’abord les dossiers de composants.',
                409,
              );
            const target = await catalogTarget(p.root, b.route);
            if (!target)
              throw new StudioError(
                'Routeur non reconnu (Next.js attendu : app/ ou pages/). Créez la page à la main et indiquez son chemin.',
                409,
              );
            if (busy)
              throw new StudioError('Une demande IA est déjà en cours.', 429);
            const status = await adapters.claude.status();
            if (!status.available) throw new StudioError(status.detail, 503);
            // Le chemin du catalogue rend son dossier éditable (sur diff).
            if (p.preview.catalog !== b.route)
              await projects.setPreview(id, { ...p.preview, catalog: b.route });
            busy = true;
            const controller = new AbortController();
            active.add(controller);
            const cancel = () => controller.abort();
            res.once('close', cancel);
            try {
              const reply = await projectEditor.edit(
                p,
                catalogRequest(
                  target,
                  b.route,
                  p.components.map((c) => c.dir),
                ),
                (rel) => rel.startsWith(`${target.dir}/`),
                controller.signal,
              );
              const { store: cs } = await externalComponents(id);
              const proposal = reply.changes.length
                ? await cs.propose(
                    reply.changes,
                    'claude',
                    `Page catalogue ${b.route}`,
                  )
                : null;
              return send(200, {
                message: reply.message,
                denied: reply.denied,
                proposal,
              });
            } finally {
              busy = false;
              active.delete(controller);
              res.off('close', cancel);
            }
          }
          if (action === 'run/start' || action === 'run/stop') {
            const b = z
              .object({ task: z.enum(['install', 'dev']) })
              .strict()
              .parse(body);
            const p = await projects.project(id);
            if (action === 'run/stop')
              return send(200, runner.stop(id, b.task));
            if (b.task === 'install')
              return send(200, await runner.start(id, p.root, 'install'));
            // Un port propre au projet : jamais celui d'un autre projet ni un
            // port occupé ; l'adresse d'aperçu le suit aussitôt.
            const portOf = (u: string) =>
              Number(u.match(/:(\d{2,5})(?:\/|$)/)?.[1]) || 0;
            const others = (await projects.list()).projects
              .filter((x) => x.id !== id && !x.builtin)
              .map((x) => portOf(x.preview.url))
              .filter(Boolean);
            const port = await choosePort(
              portOf(p.preview.url) || 3000,
              others,
            );
            const url = `http://localhost:${port}`;
            if (p.preview.url !== url)
              await projects.setPreview(id, { ...p.preview, url });
            return send(200, await runner.start(id, p.root, 'dev', port));
          }
          if (action === 'ai-setup') {
            // Configuration par Claude : lecture seule d'une copie du projet ;
            // sa réponse (JSON) règle tokens, composants et aperçu, vérifiés ici.
            z.object({}).strict().parse(body);
            const p = await projects.project(id);
            if (busy)
              throw new StudioError('Une demande IA est déjà en cours.', 429);
            const status = await adapters.claude.status();
            if (!status.available) throw new StudioError(status.detail, 503);
            busy = true;
            const controller = new AbortController();
            active.add(controller);
            const cancel = () => controller.abort();
            res.once('close', cancel);
            try {
              const reply = await projectEditor.edit(
                p,
                setupRequest(await detectProject(p.root)),
                () => false,
                controller.signal,
              );
              let raw: unknown = null;
              try {
                raw = JSON.parse(reply.message.match(/\{[\s\S]*\}/)?.[0] ?? '');
              } catch {
                /* Réponse non JSON : refusée ci-dessous. */
              }
              const found = setupAnswer.safeParse(raw);
              if (!found.success)
                throw new StudioError(
                  'Réponse de Claude illisible : rien n’a été réglé. Réessayez ou réglez à la main.',
                  502,
                );
              const a = found.data;
              // Chaque élément est vérifié : un chemin absent est écarté.
              const tokens = [];
              for (const t of a.tokens)
                if (
                  await resolveInside(p.root, t.file).then(
                    () => true,
                    () => false,
                  )
                )
                  tokens.push(t);
              const dirs = [];
              for (const d of a.components) {
                const stat = await fs
                  .lstat(path.join(p.root, d))
                  .catch(() => null);
                if (stat?.isDirectory() && !stat.isSymbolicLink()) dirs.push(d);
              }
              if (tokens.length) await projects.setSources(id, tokens);
              if (dirs.length)
                await projects.setComponents(
                  id,
                  dirs.map((dir) => ({
                    dir,
                    extensions: [...defaultExtensions],
                  })),
                );
              if (!p.preview.url && a.preview && localUrl.test(a.preview))
                await projects.setPreview(id, {
                  ...p.preview,
                  url: a.preview,
                });
              return send(200, {
                summary: a.summary,
                env: a.env,
                tokens: tokens.map((t) => t.file),
                components: dirs,
                projects: await projects.list(),
              });
            } finally {
              busy = false;
              active.delete(controller);
              res.off('close', cancel);
            }
          }
          if (action === 'agent') {
            // Assistant du projet : Claude édite une copie ; les fichiers de
            // tokens deviennent une proposition de valeurs, les composants une
            // proposition de code. Chacune passe par son diff et sa validation.
            const b = z
              .object({ message: z.string().trim().min(1).max(8000) })
              .strict()
              .parse(body);
            const p = await projects.project(id);
            const tokenFiles = new Set(p.tokens.map((t) => t.file));
            const cs = p.components.length
              ? (await externalComponents(id)).store
              : null;
            if (!tokenFiles.size && !cs)
              throw new StudioError(
                'Déclarez d’abord des fichiers de tokens ou des dossiers de composants.',
                409,
              );
            if (busy)
              throw new StudioError('Une demande IA est déjà en cours.', 429);
            const status = await adapters.claude.status();
            if (!status.available) throw new StudioError(status.detail, 503);
            busy = true;
            const controller = new AbortController();
            active.add(controller);
            const cancel = () => controller.abort();
            res.once('close', cancel);
            try {
              const scope = [
                ...[...tokenFiles].map((f) => `${f} (tokens)`),
                ...p.components.map((c) => `${c.dir}/ (composants)`),
              ].join(', ');
              const reply = await projectEditor.edit(
                p,
                `Demande de l'utilisateur :\n${b.message}\n\nTu peux modifier uniquement : ${scope}. Dans les fichiers de tokens, ne change que des valeurs existantes. Toute autre modification sera ignorée.`,
                (rel) => tokenFiles.has(rel) || !!cs?.allowed(rel),
                controller.signal,
              );
              const tokenChanges = reply.changes.filter((c) =>
                tokenFiles.has(c.path),
              );
              const codeChanges = reply.changes.filter(
                (c) => !tokenFiles.has(c.path),
              );
              const notes: string[] = [];
              let tokenProposal = null;
              if (tokenChanges.length) {
                const service = new ExternalTokens(p, projects.stateDir(id));
                const { changes, ignored } =
                  await service.changesFrom(tokenChanges);
                if (ignored)
                  notes.push(
                    `${ignored} modification(s) de fichier de tokens hors valeurs ignorée(s).`,
                  );
                if (changes.length)
                  try {
                    tokenProposal = await service.propose(
                      changes.slice(0, 50),
                      'claude',
                      b.message.slice(0, 300),
                    );
                  } catch (e) {
                    notes.push(`Variables refusées : ${(e as Error).message}`);
                  }
              }
              const codeProposal =
                codeChanges.length && cs
                  ? await cs.propose(
                      codeChanges,
                      'claude',
                      b.message.slice(0, 200),
                    )
                  : null;
              return send(200, {
                message: [reply.message, ...notes].join('\n'),
                denied: reply.denied,
                tokenProposal,
                codeProposal,
              });
            } finally {
              busy = false;
              active.delete(controller);
              res.off('close', cancel);
            }
          }
          if (action.startsWith('components/')) {
            const { store: cs } = await externalComponents(id);
            if (action === 'components/propose') {
              const b = externalProposeSchema.parse(body);
              return send(
                200,
                await cs.propose(b.changes, 'manual', b.message),
              );
            }
            const b = z
              .object({ id: z.string().uuid(), git: z.boolean().optional() })
              .strict()
              .parse(body);
            if (action === 'components/discard') {
              cs.discard(b.id);
              return send(200, {});
            }
            if (action === 'components/undo')
              return send(200, await cs.undo(b.id));
            return send(200, {
              ...(await cs.commit(b.id, b.git)),
              rebuilt: false,
            });
          }
          const service = new ExternalTokens(
            await projects.project(id),
            projects.stateDir(id),
          );
          if (action === 'tokens/propose') {
            const b = z
              .object({
                changes: z
                  .array(
                    z
                      .object({
                        id: z.string().max(400),
                        value: z.string().max(200),
                      })
                      .strict(),
                  )
                  .min(1)
                  .max(50),
                message: z.string().max(300).default(''),
              })
              .strict()
              .parse(body);
            return send(
              200,
              await service.propose(b.changes, 'manual', b.message),
            );
          }
          const b = z
            .object({ id: z.string().uuid(), git: z.boolean().optional() })
            .strict()
            .parse(body);
          if (action === 'tokens/commit') {
            const entry = await service.commit(b.id);
            // Commit Git facultatif des seuls fichiers de tokens modifiés.
            const files = [...new Set(entry.patches.map((p) => p.file))];
            const git = b.git
              ? await gitCommitter((await projects.project(id)).root)(
                  files,
                  `DS t${entry.revision} · ${entry.patches.map((p) => p.key).join(', ')}`.slice(
                    0,
                    200,
                  ),
                )
              : undefined;
            return send(200, { ...entry, git });
          }
          return send(200, await service.undo(b.id));
        }
        if (url.pathname === '/api/settings') {
          const b = settingsSchema.partial().strict().parse(body);
          return send(200, await settings.update(b));
        }
        if (url.pathname === '/api/projects/clone') {
          const b = z
            .object({
              name: cloneBase.shape.name,
              url: z.string().max(300),
              dest: z.string().trim().min(1).max(500),
              figma: cloneBase.shape.figma,
            })
            .strict()
            .parse(body);
          await cloneRepo(b.url, b.dest);
          await projects.add({
            name: b.name,
            root: b.dest,
            source: { type: 'github', url: b.url },
            figma: b.figma,
          });
          return send(200, await prefill());
        }
        if (url.pathname === '/api/projects/add') {
          await projects.add(newProjectSchema.parse(body));
          return send(200, await prefill());
        }
        if (url.pathname === '/api/projects/active') {
          const b = z
            .object({ id: z.string().max(40) })
            .strict()
            .parse(body);
          await projects.setActive(b.id);
          return send(200, await projects.list());
        }
        if (url.pathname === '/api/projects/remove') {
          const b = z
            .object({ id: z.string().max(40) })
            .strict()
            .parse(body);
          await projects.remove(b.id);
          return send(200, await projects.list());
        }
        if (url.pathname === '/api/projects/figma') {
          const b = z
            .object({
              id: z.string().max(40),
              figma: dsProjectSchema.shape.figma,
            })
            .strict()
            .parse(body);
          await projects.updateFigma(b.id, b.figma);
          return send(200, await projects.list());
        }
        if (url.pathname === '/api/components/propose') {
          const b = codeProposeSchema.parse(body);
          return send(
            200,
            await components.propose(b.changes, 'manual', b.message),
          );
        }
        if (url.pathname === '/api/components/commit') {
          const b = z
            .object({ id: z.string().uuid(), git: z.boolean().optional() })
            .strict()
            .parse(body);
          const result = await components.commit(b.id, b.git);
          preview.drop(b.id);
          // Le code est écrit ; la recompilation de l'interface suit sans l'annuler.
          let rebuilt = false;
          if (rebuild)
            rebuilt = await rebuild().then(
              () => true,
              () => false,
            );
          return send(200, { ...result, rebuilt });
        }
        if (url.pathname === '/api/components/discard') {
          const b = z.object({ id: z.string().uuid() }).strict().parse(body);
          components.discard(b.id);
          preview.drop(b.id);
          return send(200, {});
        }
        if (url.pathname === '/api/components/undo') {
          const b = z.object({ id: z.string().uuid() }).strict().parse(body);
          return send(200, await components.undo(b.id));
        }
        if (url.pathname === '/api/components/agent') {
          const b = z
            .object({ message: z.string().trim().min(1).max(8000) })
            .strict()
            .parse(body);
          if (busy)
            throw new StudioError('Une demande IA est déjà en cours.', 429);
          const status = await adapters.claude.status();
          if (!status.available) throw new StudioError(status.detail, 503);
          busy = true;
          const controller = new AbortController();
          active.add(controller);
          const cancel = () => controller.abort();
          res.once('close', cancel);
          try {
            const rules = await fs
              .readFile(path.join(root, 'workspace', 'DESIGN_RULES.md'), 'utf8')
              .catch(() => '');
            const reply = await editor.edit(
              b.message,
              { rules },
              controller.signal,
            );
            const proposal = reply.changes.length
              ? await components.propose(
                  reply.changes,
                  'claude',
                  b.message.slice(0, 200),
                )
              : null;
            return send(200, {
              message: reply.message,
              denied: reply.denied,
              proposal,
            });
          } finally {
            busy = false;
            active.delete(controller);
            res.off('close', cancel);
          }
        }
        if (url.pathname === '/api/figma/spec') {
          const spec = figmaSpecSchema.parse(body);
          await atomicWrite(specFile, JSON.stringify(spec));
          figmaSpec = spec;
          return send(200, { revision: spec.revision });
        }
        if (url.pathname === '/api/code/sync') {
          z.object({}).strict().parse(body);
          return send(200, await code.write());
        }
        if (url.pathname === '/api/agent') {
          const b = z
            .object({
              agent: z.enum(['codex', 'claude', 'gemini']),
              message: z.string().trim().min(1).max(8000),
              revision: z.number().int().nonnegative(),
              history: z
                .array(
                  z
                    .object({
                      role: z.enum(['user', 'assistant']),
                      text: z.string().max(12000),
                    })
                    .strict(),
                )
                .max(10),
            })
            .strict()
            .parse(body);
          if (b.revision !== store.snapshot().revision)
            throw new StudioError(
              'DS modifié depuis votre dernier affichage. Réessayez.',
              409,
            );
          if (busy)
            throw new StudioError('Une demande IA est déjà en cours.', 429);
          busy = true;
          const controller = new AbortController();
          active.add(controller);
          const cancel = () => controller.abort();
          res.once('close', cancel);
          try {
            const context = async (name: string) => {
              const file = path.join(root, 'workspace', name);
              const stat = await fs.lstat(file);
              if (stat.isSymbolicLink() || stat.size > 32_000)
                throw new StudioError(
                  `Contexte ${name} refusé (lien ou taille).`,
                );
              return fs.readFile(file, 'utf8');
            };
            const reply = await adapters[b.agent].reply(
              b.message,
              {
                tokens: store.snapshot().tokens,
                brief:
                  (await context('PFE.md')) +
                  '\nBrief privé DS-Studio :\n' +
                  JSON.stringify((await project.read()).project),
                rules: await context('DESIGN_RULES.md'),
                history: b.history,
              },
              controller.signal,
            );
            const proposal = reply.changes.length
              ? store.propose(
                  b.revision,
                  reply.changes,
                  b.agent as 'codex' | 'claude',
                )
              : null;
            return send(200, { message: reply.message, proposal });
          } finally {
            busy = false;
            active.delete(controller);
            res.off('close', cancel);
          }
        }
        throw new StudioError('Route inconnue.', 404);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD')
        throw new StudioError('Méthode non autorisée.', 405);
      // Aperçu compilé d'une proposition de code, servi depuis la mémoire.
      const codePreview = url.pathname.match(
        /^\/preview\/code\/([0-9a-f-]{36})\/(.*)$/,
      );
      if (codePreview) {
        const asset = preview.asset(codePreview[1], codePreview[2]);
        if (!asset) throw new StudioError('Aperçu expiré : reproposez.', 404);
        res.setHeader('Content-Type', asset.type);
        return res.end(asset.body);
      }
      if (vite) {
        const allowed = [
          '/app/client/',
          '/app/shared/',
          '/ds/src/',
          '/node_modules/',
          '/@vite/',
          '/@id/',
        ];
        if (
          url.pathname !== '/' &&
          url.pathname !== '/index.html' &&
          !allowed.some((prefix) => url.pathname.startsWith(prefix))
        )
          throw new StudioError('Source privée non distribuée.', 403);
        vite.middlewares(req, res);
        return;
      }
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.includes('..') || pathname.includes('\\'))
        throw new StudioError('Chemin refusé.', 403);
      let file: string;
      if (pathname.startsWith('/assets/'))
        file = path.join(root, 'dist', pathname);
      else if (pathname === '/' || pathname === '/index.html')
        file = path.join(root, 'dist', 'index.html');
      else throw new StudioError('Fichier introuvable.', 404);
      const data = await fs.readFile(file);
      const ext = path.extname(file);
      res.setHeader(
        'Content-Type',
        (
          {
            '.html': 'text/html; charset=utf-8',
            '.js': 'text/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.svg': 'image/svg+xml',
          } as Record<string, string>
        )[ext] ?? 'application/octet-stream',
      );
      res.end(data);
    } catch (error) {
      if (error instanceof z.ZodError)
        return send(400, {
          error:
            'Données invalides : ' +
            error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; '),
        });
      if (error instanceof StudioError)
        return send(error.status, { error: error.message });
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return send(404, {
          error: 'Fichier introuvable. Exécutez npm run build avant npm start.',
        });
      return send(500, { error: urlSafeMessage(error) });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return {
    server,
    close: async () => {
      for (const c of active) c.abort();
      runner.stopAll();
      closing = true;
      const closed = new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      // Un onglet ouvert interroge l'état toutes les 1,2 s sur une connexion
      // persistante : sans cela, l'arrêt attendrait la fin de cette connexion.
      server.closeIdleConnections();
      const force = setTimeout(() => server.closeAllConnections(), 2000);
      await closed;
      clearTimeout(force);
      await vite?.close();
    },
  };
}
function urlSafeMessage(error: unknown) {
  // Les erreurs agent sont rédigées dans l'adaptateur, jamais de stderr brut ni de stack.
  const message = (error as Error).message ?? '';
  if (
    /^(CLI |Codex |Claude |Version non|Échec Codex|Échec Claude|Délai CLI|Demande interrompue|Le CLI|Réponse CLI|claude non|gemini non|Impossible de démarrer)/.test(
      message,
    )
  )
    return message;
  return 'Opération impossible. Aucune validation automatique. Vérifiez les données et relancez si nécessaire.';
}
