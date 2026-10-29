import path from 'node:path';
import { z } from 'zod';
import { atomicWrite, readPrivate } from './files.js';

// Réglages de l'atelier (privés) : démarrage terminé, IA choisie pour
// l'assistant. Aucun identifiant ici : les IA passent par leur CLI officiel,
// connecté par l'étudiant lui-même.
export const settingsSchema = z
  .object({
    onboarded: z.boolean(),
    agent: z.enum(['claude', 'codex', 'none']),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
const defaults: Settings = { onboarded: false, agent: 'claude' };

export class SettingsStore {
  private file: string;
  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'settings.json');
  }
  async read(): Promise<Settings> {
    try {
      return {
        ...defaults,
        ...settingsSchema
          .partial()
          .parse(JSON.parse(await readPrivate(this.file, 10_000))),
      };
    } catch {
      return defaults;
    }
  }
  async update(patch: Partial<Settings>) {
    const next = settingsSchema.parse({ ...(await this.read()), ...patch });
    await atomicWrite(this.file, JSON.stringify(next, null, 2));
    return next;
  }
}
