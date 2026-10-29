import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const dir = await mkdtemp(path.join(tmpdir(), 'ds-e2e-'));
// Copie du DS : les validations de code des tests n'écrivent jamais dans ds/.
const ds = path.join(dir, 'ds');
await cp('ds', ds, { recursive: true });
const child = spawn(
  process.execPath,
  ['--import', 'tsx', 'app/server/index.ts'],
  {
    env: {
      ...process.env,
      PORT: '4318',
      DS_STUDIO_DATA_DIR: path.join(dir, 'data'),
      DS_STUDIO_DS_DIR: ds,
    },
    stdio: 'inherit',
  },
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill('SIGTERM'));
child.on('exit', async (code) => {
  await rm(dir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
