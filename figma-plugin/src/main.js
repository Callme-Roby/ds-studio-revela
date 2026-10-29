// Fil principal du plugin (API Figma). Concaténé après logic.js dans code.js.
// N'écrit que dans la collection « Revela · DS-Studio », après clic sur un plan
// affiché, puis relit les variables pour prouver l'écriture.

figma.showUI(__html__, { width: 480, height: 700, themeColors: true });

async function readFigma() {
  const all = await figma.variables.getLocalVariableCollectionsAsync();
  const collection = all.find((c) => c.name === COLLECTION) || null;
  const variables = {};
  if (!collection) return { collection, state: { revision: null, variables } };
  const mode = collection.modes[0].modeId;
  for (const id of collection.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (!v) continue;
    const written = v.getPluginData(WRITTEN);
    variables[v.name] = {
      type: v.resolvedType,
      value: v.valuesByMode[mode],
      written: written ? JSON.parse(written) : undefined,
      variable: v,
    };
  }
  return {
    collection,
    state: { revision: collection.getPluginData(REVISION) || null, variables },
  };
}

async function apply(source, expected, overwrite) {
  const { collection: found, state } = await readFigma();
  const p = plan(source, state);
  // Validation liée au plan affiché : si Figma ou DS-Studio a bougé, rien n'est écrit.
  if (planKey(p) !== expected)
    throw new Error(
      'Figma ou DS-Studio a changé depuis l’affichage du diff : relisez avant d’appliquer.',
    );
  // Sans accord, les variables modifiées dans Figma sont laissées intactes.
  // Un conflit de type n'est jamais remplacé.
  const replaceable = p.conflicts.filter((c) => !c.reason.startsWith('type'));
  const collection =
    found || figma.variables.createVariableCollection(COLLECTION);
  const mode = collection.modes[0].modeId;
  const rows = [...p.create, ...p.update, ...(overwrite ? replaceable : [])];
  for (const row of rows) {
    const token = source.tokens[row.key];
    const value = toFigma(token);
    const v =
      (state.variables[row.name] && state.variables[row.name].variable) ||
      figma.variables.createVariable(row.name, collection, row.type);
    v.setValueForMode(mode, value);
    v.scopes = scopesFor(row.key, token);
    v.description = `Géré par DS-Studio · révision ${source.revision}`;
    v.setPluginData(WRITTEN, JSON.stringify(value));
  }
  collection.setPluginData(REVISION, String(source.revision));
  // Relecture complète après écriture.
  const after = plan(source, (await readFigma()).state);
  return { written: rows.length, readback: after, synced: isSynced(after) };
}

// Variables de la collection, par nom (« color/brand »), pour les liaisons.
async function variablesByName() {
  const { state } = await readFigma();
  return Object.fromEntries(
    Object.entries(state.variables).map(([name, v]) => [name, v.variable]),
  );
}

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'plan') {
      const { state } = await readFigma();
      const p = plan(msg.source, state);
      figma.ui.postMessage({ type: 'plan', plan: p, key: planKey(p) });
    } else if (msg.type === 'apply') {
      const result = await apply(msg.source, msg.key, msg.overwrite === true);
      figma.ui.postMessage({ type: 'applied', ...result });
      figma.notify(
        result.synced
          ? `Variables Figma à jour (révision ${msg.source.revision}), relues.`
          : 'Écriture faite, mais la relecture montre des écarts.',
      );
    } else if (msg.type === 'build') {
      const variables = await variablesByName();
      if (!Object.keys(variables).length)
        throw new Error(
          'Appliquez d’abord les variables : les composants s’y lient.',
        );
      const result = await buildAll(figma, msg.spec, variables);
      figma.ui.postMessage({ type: 'built', ...result });
      figma.notify(
        `${result.components} composants et ${result.screens} écrans construits, liés aux variables.`,
      );
    } else if (msg.type === 'close') figma.closePlugin();
  } catch (e) {
    figma.ui.postMessage({ type: 'error', message: e.message || String(e) });
  }
};
