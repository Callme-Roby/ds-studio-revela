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

// Dossiers de composants du projet et extensions de fichiers éditables.
export const defaultExtensions = [
  'tsx',
  'jsx',
  'ts',
  'js',
  'vue',
  'svelte',
  'css',
  'scss',
  'html',
];
export const componentSourceSchema = z
  .object({
    dir: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine(
        (d) =>
          /^[\w@.-]+(\/[\w@.-]+)*$/.test(d) &&
          !d.split('/').some((p) => p === '..' || p === '.'),
        'Dossier relatif au projet (ex. src/components), sans « .. ».',
      ),
    extensions: z
      .array(z.string().regex(/^[a-z0-9]{1,8}$/))
      .min(1)
      .max(12),
  })
  .strict();
export type ComponentSource = z.infer<typeof componentSourceSchema>;

// Aperçu : serveur de développement du projet (local uniquement) et page
// catalogue des composants (chemin dans l'app, ou URL Storybook locale).
export const localUrl =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?(\/[^\s]*)?$/;
export const previewSchema = z
  .object({
    url: z
      .string()
      .trim()
      .max(300)
      .refine(
        (u) => u === '' || localUrl.test(u),
        'Adresse locale attendue (ex. http://localhost:3000).',
      ),
    catalog: z
      .string()
      .trim()
      .max(300)
      .refine(
        (c) => c === '' || /^\/[^\s]*$/.test(c) || localUrl.test(c),
        'Chemin dans l’app (ex. /ds-studio) ou adresse locale (ex. Storybook).',
      ),
  })
  .strict();
export type PreviewConfig = z.infer<typeof previewSchema>;

export const projectSchema = newProjectSchema.extend({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  createdAt: z.string().max(40),
  tokens: z.array(tokenSourceSchema).max(10).default([]),
  components: z.array(componentSourceSchema).max(10).default([]),
  preview: previewSchema.default({ url: '', catalog: '' }),
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
  components: ComponentSource[];
  preview: PreviewConfig;
};
