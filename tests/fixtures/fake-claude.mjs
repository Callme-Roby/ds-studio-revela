// Faux CLI Claude pour les tests : le premier argument choisit le scénario.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const [mode, ...args] = process.argv.slice(2);
if (args.includes('--version')) {
  process.stdout.write(
    mode === 'old' ? '1.0.0 (Claude Code)\n' : '2.1.87 (Claude Code)\n',
  );
  process.exit(0);
}
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (b) => (input += b));
process.stdin.on('end', () => {
  const out = (o) =>
    process.stdout.write(JSON.stringify({ type: 'result', ...o }));
  // Deux tours, comme le vrai CLI avec --json-schema.
  const ok = (structured_output) =>
    out({
      is_error: false,
      num_turns: 2,
      permission_denials: [],
      structured_output,
    });
  if (mode === 'ok')
    ok({
      message: 'Alerte plus sombre.',
      changes: [{ key: 'color.warning', value: '#7A4A00' }],
    });
  else if (mode === 'inspect')
    ok({
      message: JSON.stringify({
        args,
        cwdFiles: readdirSync(process.cwd()).length,
        envKeys: Object.keys(process.env),
        hasContext:
          JSON.parse(input).context.tokens['color.brand'] !== undefined,
      }),
      changes: [],
    });
  else if (mode === 'tool')
    out({
      is_error: false,
      num_turns: 3,
      permission_denials: [{ tool_name: 'Bash' }],
      structured_output: { message: 'x', changes: [] },
    });
  else if (mode === 'text')
    out({
      is_error: false,
      num_turns: 1,
      permission_denials: [],
      result: '{"message":"x","changes":[]}',
    });
  else if (mode === 'error')
    out({
      is_error: true,
      num_turns: 1,
      result: 'Failed to authenticate SECRET_ACCOUNT',
    });
  else if (mode === 'badkey')
    ok({
      message: 'x',
      changes: [{ key: 'color.inventée', value: '#000000' }],
    });
  else if (mode === 'code') {
    // Agent de code : édite la copie de ds/ (dossier courant), tente aussi
    // d'écrire hors de src/ et hors de la copie ; seul src/ doit compter.
    const css = readFileSync('src/components/Button.css', 'utf8');
    writeFileSync(
      'src/components/Button.css',
      css.replace('var(--radius-control)', 'var(--radius-lg)'),
    );
    writeFileSync(
      'src/components/Ghost.tsx',
      'export const Ghost = () => null;\n',
    );
    writeFileSync('tokens.css', '/* modifié */');
    writeFileSync('../hors-copie.txt', 'x');
    out({
      is_error: false,
      num_turns: 6,
      permission_denials: [{ tool_name: 'Write' }],
      result: 'Boutons plus arrondis ; composant Ghost ajouté.',
    });
  } else if (mode === 'catalog') {
    // Page catalogue dans la copie du projet ; tente aussi de toucher un
    // composant et la config : seule la page doit être proposée.
    mkdirSync('src/app/ds-studio', { recursive: true });
    writeFileSync(
      'src/app/ds-studio/page.tsx',
      'import Card from "@/components/Card";\nexport default function Page() {\n  return <section id="Card"><h2>Card</h2><Card /></section>;\n}\n',
    );
    writeFileSync(
      'src/components/Card.tsx',
      'export default function Card() { return null; }\n',
    );
    writeFileSync('next.config.ts', '// modifié');
    out({
      is_error: false,
      num_turns: 8,
      permission_denials: [],
      result: `Page catalogue créée. Demande reçue : ${input.includes('src/app/ds-studio/page.tsx') ? 'ok' : 'chemin absent'}.`,
    });
  } else if (mode === 'assist') {
    // Assistant d'un projet externe : une valeur de token changée, un token
    // ajouté (ignoré), un composant modifié, la config touchée (hors périmètre).
    const css = readFileSync('src/app/globals.css', 'utf8');
    writeFileSync(
      'src/app/globals.css',
      css.replace('#111111', '#222222').replace('}', '  --nouveau: 1px;\n}'),
    );
    writeFileSync(
      'src/components/Card.tsx',
      'export default function Card() { return <article />; }\n',
    );
    writeFileSync('next.config.ts', '// modifié');
    out({
      is_error: false,
      num_turns: 5,
      permission_denials: [],
      result: `Texte plus doux. Périmètre : ${input.includes('src/app/globals.css (tokens)') ? 'ok' : 'absent'}.`,
    });
  } else if (mode === 'setup') {
    // Configuration : réponse JSON entourée d'un bloc de code, un chemin
    // inexistant (à écarter), et une écriture tentée (à ignorer).
    writeFileSync('next.config.ts', '// modifié');
    out({
      is_error: false,
      num_turns: 4,
      permission_denials: [],
      result:
        '```json\n' +
        JSON.stringify({
          tokens: [
            { file: 'src/app/globals.css', format: 'css' },
            { file: 'src/absent.css', format: 'css' },
          ],
          components: ['src/components', 'src/inexistant'],
          preview: 'http://localhost:3000',
          env: [{ name: 'DATABASE_URL', why: 'Lue au démarrage.' }],
          summary: `Projet Next.js. Lecture seule : ${input.includes('NE MODIFIE AUCUN FICHIER') ? 'ok' : 'absent'}.`,
        }) +
        '\n```',
    });
  } else if (mode === 'leak') {
    process.stderr.write('PRIVATE_TOKEN_DETAIL');
    process.exit(1);
  }
});
