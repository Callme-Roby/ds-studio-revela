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
import { ClaudeCodeEditor } from '../../connectors/agents/claude-code.js';
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
      `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'${options.dev ? ' ws://127.0.0.1:*' : ''}; frame-ancestors 'self'; base-uri 'none'; form-action 'self'`,
    );
    try {
      const url = new URL(req.url ?? '/', origin);
      // Seule exception : le plugin Figma (iframe d'origine « null ») lit la
      // révision validée et les tokens, en GET, rien d'autre. Figma impose un
      // nom de domaine : localhost est accepté pour cette route uniquement.
      const figmaRoute =
        url.pathname === '/api/figma/tokens' && req.headers.origin === 'null';
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
          if (url.pathname === '/api/code') return send(200, await code.status());
          if (url.pathname === '/api/figma/tokens') {
            if (figmaPlugin) res.setHeader('Access-Control-Allow-Origin', 'null');
            const { revision, tokens } = store.snapshot();
            return send(200, { revision, tokens });
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
            return send(200, { path: file, content: await components.read(file) });
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
          if (size > (url.pathname === '/api/components/propose' ? 450_000 : 128_000))
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
            .object({ id: z.string().uuid(), acknowledged: z.boolean().optional() })
            .strict()
            .parse(body);
          // Les contrôles Revela s'imposent ici aussi : une proposition, même venue
          // d'une IA, ne passe pas un problème introduit sans accord explicite.
          const pending = store.pending(b.id);
          const checks = pending && auditProposal(store.snapshot().tokens, pending);
          if (checks?.introduced.length && !b.acknowledged)
            throw new StudioError(
              `Cette proposition introduit ${checks.introduced.length} problème(s) : cochez l’accord explicite dans le diff.`,
              409,
            );
          const state = await store.commit(b.id);
          // La révision est acquise ; le code suit, sans pouvoir l'annuler.
          return send(200, { state, code: await code.write() });
        }
        if (url.pathname === '/api/components/propose') {
          const b = codeProposeSchema.parse(body);
          return send(200, await components.propose(b.changes, 'manual', b.message));
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
            const reply = await editor.edit(b.message, { rules }, controller.signal);
            const proposal = reply.changes.length
              ? await components.propose(reply.changes, 'claude', b.message.slice(0, 200))
              : null;
            return send(200, { message: reply.message, denied: reply.denied, proposal });
          } finally {
            busy = false;
            active.delete(controller);
            res.off('close', cancel);
          }
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
              ? store.propose(b.revision, reply.changes, b.agent as 'codex' | 'claude')
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
