// Faux CLI Claude pour les tests : le premier argument choisit le scénario.
import { readdirSync } from 'node:fs';

const [mode, ...args] = process.argv.slice(2);
if (args.includes('--version')) {
  process.stdout.write(mode === 'old' ? '1.0.0 (Claude Code)\n' : '2.1.87 (Claude Code)\n');
  process.exit(0);
}
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (b) => (input += b));
process.stdin.on('end', () => {
  const out = (o) => process.stdout.write(JSON.stringify({ type: 'result', ...o }));
  // Deux tours, comme le vrai CLI avec --json-schema.
  const ok = (structured_output) =>
    out({ is_error: false, num_turns: 2, permission_denials: [], structured_output });
  if (mode === 'ok')
    ok({ message: 'Alerte plus sombre.', changes: [{ key: 'color.warning', value: '#7A4A00' }] });
  else if (mode === 'inspect')
    ok({
      message: JSON.stringify({
        args,
        cwdFiles: readdirSync(process.cwd()).length,
        envKeys: Object.keys(process.env),
        hasContext: JSON.parse(input).context.tokens['color.brand'] !== undefined,
      }),
      changes: [],
    });
  else if (mode === 'tool')
    out({ is_error: false, num_turns: 3, permission_denials: [{ tool_name: 'Bash' }], structured_output: { message: 'x', changes: [] } });
  else if (mode === 'text')
    out({ is_error: false, num_turns: 1, permission_denials: [], result: '{"message":"x","changes":[]}' });
  else if (mode === 'error') out({ is_error: true, num_turns: 1, result: 'Failed to authenticate SECRET_ACCOUNT' });
  else if (mode === 'badkey')
    ok({ message: 'x', changes: [{ key: 'color.inventée', value: '#000000' }] });
  else if (mode === 'leak') {
    process.stderr.write('PRIVATE_TOKEN_DETAIL');
    process.exit(1);
  }
});
