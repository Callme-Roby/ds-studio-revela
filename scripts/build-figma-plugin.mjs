// Assemble figma-plugin/code.js : Figma n'accepte qu'un fichier, sans import.
import { readFile, writeFile } from 'node:fs/promises';

const dir = new URL('../figma-plugin/', import.meta.url);
// Modules sources sans import ni export : un seul script pour Figma.
const strip = async (name) =>
  (await readFile(new URL(`src/${name}`, dir), 'utf8'))
    .replace(/^import .*\r?\n/gm, '')
    .replace(/^export /gm, '');
const logic = await strip('logic.js');
const build = await strip('build.js');
const main = await readFile(new URL('src/main.js', dir), 'utf8');
await writeFile(
  new URL('code.js', dir),
  '// Fichier généré par npm run figma:build : modifier figma-plugin/src/.\n' +
    logic +
    '\n' +
    build +
    '\n' +
    main,
);
console.log('figma-plugin/code.js écrit.');
