// Diff ligne à ligne (plus longue sous-suite commune), suffisant pour des
// fichiers de composants de quelques centaines de lignes.

export type DiffLine = { kind: ' ' | '+' | '-'; text: string };

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before === '' ? [] : before.replace(/\r\n/g, '\n').split('\n');
  const b = after === '' ? [] : after.replace(/\r\n/g, '\n').split('\n');
  // Préfixe et suffixe communs retirés : la table ne couvre que la zone modifiée.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const x = a.slice(start, endA);
  const y = b.slice(start, endB);
  const lcs = Array.from(
    { length: x.length + 1 },
    () => new Uint32Array(y.length + 1),
  );
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      lcs[i][j] =
        x[i] === y[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const middle: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      middle.push({ kind: ' ', text: x[i] });
      i++;
      j++;
    } else if (
      i < x.length &&
      (j === y.length || lcs[i + 1][j] >= lcs[i][j + 1])
    ) {
      // Suppressions avant ajouts, comme un diff unifié.
      middle.push({ kind: '-', text: x[i++] });
    } else middle.push({ kind: '+', text: y[j++] });
  }
  return [
    ...a.slice(0, start).map((text) => ({ kind: ' ' as const, text })),
    ...middle,
    ...a.slice(endA).map((text) => ({ kind: ' ' as const, text })),
  ];
}

// Ne garde que les lignes modifiées et `context` lignes autour, façon diff unifié.
export function hunks(lines: DiffLine[], context = 3) {
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (l.kind !== ' ')
      for (let k = i - context; k <= i + context; k++) keep.add(k);
  });
  const out: ({ gap: true } | (DiffLine & { line: number }))[] = [];
  let line = 0;
  let last = -2;
  lines.forEach((l, i) => {
    if (l.kind !== '+') line++;
    if (!keep.has(i)) return;
    if (i !== last + 1 && out.length) out.push({ gap: true });
    out.push({ ...l, line });
    last = i;
  });
  return out;
}

export function stats(lines: DiffLine[]) {
  return {
    added: lines.filter((l) => l.kind === '+').length,
    removed: lines.filter((l) => l.kind === '-').length,
  };
}
