import { z } from 'zod';

// Projets connus de DS-Studio. Revela, livré avec le dépôt, est le projet
// intégré (toujours présent, non supprimable). Les autres projets sont des
// dossiers locaux ou des dépôts GitHub déclarés par l'étudiant.

export const builtinId = 'revela';

const figma = z
  .object({
    plugin: z.boolean(),
    fileUrl: z
      .string()
      .max(500)
      .refine(
        (u) =>
          u === '' ||
          /^https:\/\/(www\.)?figma\.com\/(design|file|board)\//.test(u),
        'Lien Figma attendu (https://www.figma.com/design/…).',
      ),
  })
  .strict();

export const newProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    root: z.string().trim().min(1).max(500),
    source: z
      .object({
        type: z.enum(['local', 'github']),
        url: z
          .string()
          .max(300)
          .refine(
            (u) =>
              u === '' ||
              /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?\/?$/.test(u),
            'URL GitHub attendue (https://github.com/compte/depot).',
          ),
      })
      .strict(),
    figma,
  })
  .strict();

// Fichiers de tokens du projet, relatifs à son dossier.
export const tokenSourceSchema = z
  .object({
    file: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .refine(
        (f) => !/^([a-zA-Z]:|[\/])/.test(f) && !f.split(/[\/]/).includes('..'),
        'Chemin relatif au dossier du projet, sans « .. ».',
      )
      .refine(
        (f) => /.(css|scss|json)$/.test(f),
        'Fichier .css, .scss ou .json attendu.',
      ),
    format: z.enum(['css', 'scss', 'json']),
  })
  .strict();
export type TokenSource = z.infer<typeof tokenSourceSchema>;

export const projectSchema = newProjectSchema.extend({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  createdAt: z.string().max(40),
  tokens: z.array(tokenSourceSchema).max(10).default([]),
});
export type Project = z.infer<typeof projectSchema>;
export type NewProject = z.infer<typeof newProjectSchema>;

export const registrySchema = z
  .object({
    version: z.literal(1),
    active: z.string().max(40),
    projects: z.array(projectSchema).max(50),
  })
  .strict();
export type Registry = z.infer<typeof registrySchema>;

// Vue envoyée à l'interface : le projet intégré en tête, état Git en lecture seule.
export type ProjectView = {
  id: string;
  name: string;
  builtin: boolean;
  root: string;
  source: Project['source'];
  figma: Project['figma'];
  git?: { branch: string; remote?: string; dirty: number } | null;
  exists: boolean;
  tokens: TokenSource[];
};
