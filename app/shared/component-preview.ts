// Aperçu des composants d'un projet externe : correspondance fichier → composant
// → histoires Storybook. Fonctions pures, testées sans navigateur.

export type Story = {
  id: string;
  title: string;
  name: string;
  importPath: string;
};

// Nom du composant d'un fichier : Button.tsx → Button ; Button/index.tsx → Button.
export function componentName(file: string) {
  const parts = file.split('/');
  const base = parts.at(-1)!.replace(/\.[^.]+$/, '');
  return base === 'index' && parts.length > 1 ? parts.at(-2)! : base;
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
