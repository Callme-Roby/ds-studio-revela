// Assemble figma-plugin/code.js : Figma n'accepte qu'un fichier, sans import.
import { readFile, writeFile } from 'node:fs/promises';

const dir = new URL('../figma-plugin/', import.meta.url);
const logic = (await readFile(new URL('src/logic.js', dir), 'utf8')).replace(
  /^export /gm,
  '',
);
const main = await readFile(new URL('src/main.js', dir), 'utf8');
await writeFile(
  new URL('code.js', dir),
  '// Fichier généré par npm run figma:build : modifier figma-plugin/src/.\n' +
    logic +
    '\n' +
    main,
);
console.log('figma-plugin/code.js écrit.');
