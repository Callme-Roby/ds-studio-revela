// Aperçu des composants d'un projet externe : correspondance fichier → composant
// → histoires Storybook. Fonctions pures, testées sans navigateur.

export type Story = {
  id: string;
  title: string;
  name: string;
  importPath: string;
};

// Nom du composant d'un fichier : Button.tsx → Button ; Button/index.tsx →
// Button ; Button.module.css, Button.stories.tsx → Button (même composant).
export function componentName(file: string) {
  const parts = file.split('/');
  const base = parts.at(-1)!.split('.')[0];
  return base === 'index' && parts.length > 1 ? parts.at(-2)! : base;
}

// Fichier de la page catalogue elle-même (ex. src/app/ds-studio/page.tsx pour
// /ds-studio) : son aperçu est la page entière, sans ancre.
export function inCatalogPage(file: string, catalog: string) {
  if (!catalog.startsWith('/')) return false;
  const seg = catalog.replace(/^\/+|\/+$/g, '');
  return (
    !!seg &&
    ['src/app', 'app', 'src/pages', 'pages'].some((base) =>
      file.startsWith(`${base}/${seg}/`),
    )
  );
}

// Histoires d'un composant : même fichier importé, ou titre qui finit par son nom.
export function storiesFor(stories: Story[], file: string) {
  const name = componentName(file).toLowerCase();
  return stories.filter(
    (s) =>
      s.importPath.toLowerCase().includes(`/${name}.`) ||
      s.title.split('/').at(-1)!.trim().toLowerCase() === name,
  );
}
