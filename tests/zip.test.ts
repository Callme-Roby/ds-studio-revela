import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, zip } from '../app/server/zip.js';

// Relecture de l'archive par son répertoire central, comme un outil de décompression.
function read(archive: Buffer) {
  const end = archive.length - 22;
  assert.equal(archive.readUInt32LE(end), 0x06054b50);
  const count = archive.readUInt16LE(end + 10);
  let p = archive.readUInt32LE(end + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    assert.equal(archive.readUInt32LE(p), 0x02014b50);
    const crc = archive.readUInt32LE(p + 16);
    const size = archive.readUInt32LE(p + 20);
    const nameLength = archive.readUInt16LE(p + 28);
    const local = archive.readUInt32LE(p + 42);
    const name = archive.toString('utf8', p + 46, p + 46 + nameLength);
    assert.equal(archive.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + archive.readUInt16LE(local + 26);
    const data = archive.subarray(start, start + size);
    assert.equal(crc32(data), crc, name);
    out[name] = data.toString('utf8');
    p += 46 + nameLength;
  }
  return out;
}

test('crc32 : valeurs de référence', () => {
  assert.equal(crc32(Buffer.from('')), 0);
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('zip : fichiers relus à l’identique, noms UTF-8', () => {
  const archive = zip([
    {
      name: 'plugin/manifest.json',
      data: Buffer.from('{"name":"Revela · DS-Studio"}'),
    },
    { name: 'plugin/LISEZMOI.txt', data: Buffer.from('Étape 1') },
  ]);
  assert.deepEqual(read(archive), {
    'plugin/manifest.json': '{"name":"Revela · DS-Studio"}',
    'plugin/LISEZMOI.txt': 'Étape 1',
  });
});
