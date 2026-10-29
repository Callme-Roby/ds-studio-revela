import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CodexAdapter,
  restrictedArgs,
  runCli,
} from '../connectors/agents/codex.js';
import { unvalidatedAdapter } from '../connectors/agents/unvalidated.js';
import { ClaudeAdapter, replySchema } from '../connectors/agents/claude.js';
import { tokenKeys, tokensSchema } from '../app/shared/model.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const seed = tokensSchema.parse(
  JSON.parse(
    await readFile(
      new URL('../workspace/design-system.tokens.json', import.meta.url),
      'utf8',
    ),
  ),
);
test('CLI réellement absent : erreur exploitable et mode manuel disponible', async () => {
  const adapter = new CodexAdapter('ds-studio-definitely-missing-cli');
  assert.equal((await adapter.status()).available, false);
  await assert.rejects(
    () =>
      runCli('ds-studio-definitely-missing-cli', [], '', {}, undefined, 500),
    /CLI Codex absent/,
  );
});
test('erreur CLI non authentifié simulée, stderr sensible jamais exposé', async () => {
  await assert.rejects(
    () =>
      runCli(
        process.execPath,
        [
          '-e',
          "process.stderr.write('FAKE_PRIVATE_AUTH_DETAIL');process.exit(1)",
        ],
        '',
      ),
    (e) =>
      /Codex indisponible/.test((e as Error).message) &&
      !(e as Error).message.includes('PRIVATE'),
  );
});
test('arrêt interrompt réellement un processus enfant', async () => {
  const c = new AbortController();
  const result = runCli(
    process.execPath,
    ['-e', 'setInterval(()=>{},1000)'],
    '',
    {},
    c.signal,
  );
  c.abort();
  await assert.rejects(() => result, /interrompue/);
});
test('timeout du processus enfant exécuté', async () => {
  await assert.rejects(
    () =>
      runCli(
        process.execPath,
        ['-e', 'setInterval(()=>{},1000)'],
        '',
        {},
        undefined,
        50,
      ),
    /Délai CLI/,
  );
});
test('Gemini indisponible explicitement', async () => {
  const a = unvalidatedAdapter('gemini');
  assert.equal((await a.status()).available, false);
  await assert.rejects(() => a.reply('test', {} as never), /non implémenté/);
});

const fake = fileURLToPath(new URL('./fixtures/fake-claude.mjs', import.meta.url));
const claude = (mode: string) =>
  new ClaudeAdapter(process.execPath, [fake, mode]);
const context = {
  tokens: seed,
  brief: 'brief',
  rules: 'règles',
  history: [],
};
test('Claude : profil sans outils, dossier vide, environnement filtré', async () => {
  const reply = await claude('inspect').reply('test', context);
  const seen = JSON.parse(reply.message);
  const flag = (f: string) => seen.args[seen.args.indexOf(f) + 1];
  assert.equal(flag('--tools'), '');
  assert.equal(flag('--setting-sources'), '');
  assert.equal(flag('--mcp-config'), '{"mcpServers":{}}');
  assert.equal(flag('--permission-mode'), 'dontAsk');
  assert.equal(flag('--model'), 'claude-sonnet-5-5');
  assert.equal(flag('--effort'), 'medium');
  assert.ok(seen.args.includes('--strict-mcp-config'));
  assert.ok(seen.args.includes('--no-session-persistence'));
  assert.ok(!seen.args.some((a: string) => /dangerously|bypass/i.test(a)));
  assert.equal(seen.cwdFiles, 0);
  assert.equal(seen.hasContext, true);
  assert.ok(!seen.envKeys.some((k: string) => /API_KEY|TOKEN|SECRET/i.test(k)));
  // Le schéma imposé n'autorise que des clés de tokens existantes.
  assert.deepEqual(JSON.parse(replySchema).properties.changes.items.properties.key.enum, tokenKeys);
});
test('Claude : réponse valide transformée en changements', async () => {
  const a = claude('ok');
  assert.equal((await a.status()).available, true);
  assert.deepEqual((await a.reply('test', context)).changes, [
    { key: 'color.warning', value: '#7A4A00' },
  ]);
});
test('Claude : outil tenté, erreur service, clé inventée, version et fuite refusés', async () => {
  await assert.rejects(() => claude('tool').reply('t', context), /hors du profil sans outils/);
  // Texte libre sans sortie structurée : refusé, plus de repli sur l'analyse du texte.
  await assert.rejects(() => claude('text').reply('t', context), /hors du profil sans outils/);
  await assert.rejects(
    () => claude('error').reply('t', context),
    (e) => /Échec Claude/.test((e as Error).message) && !(e as Error).message.includes('SECRET'),
  );
  await assert.rejects(() => claude('badkey').reply('t', context));
  const old = await claude('old').status();
  assert.equal(old.available, false);
  assert.match(old.detail, /Version non qualifiée/);
  await assert.rejects(
    () => claude('leak').reply('t', context),
    (e) => /Claude indisponible/.test((e as Error).message) && !(e as Error).message.includes('PRIVATE'),
  );
  assert.equal(
    (await new ClaudeAdapter('ds-studio-definitely-missing-cli').status()).available,
    false,
  );
});
test('configuration restrictive ne contient aucune permission automatique', () => {
  assert(restrictedArgs.includes('--ignore-user-config'));
  assert(restrictedArgs.includes('read-only'));
  assert(restrictedArgs.includes('mcp_servers={}'));
  assert(
    !restrictedArgs.some(
      (a) => a.includes('dangerously') || a.includes('approve-for-me'),
    ),
  );
});

test('sortie UTF-8 scindée entre buffers conservée', async () => {
  const result = await runCli(
    process.execPath,
    [
      '-e',
      'process.stdout.write(Buffer.from([0xc3]));setTimeout(()=>process.stdout.write(Buffer.from([0xa9])),20)',
    ],
    '',
  );
  assert.equal(result, 'é');
});
