let pending = new Set<string>();

export function growNext(ids: Iterable<string>) {
  for (const id of ids) pending.add(id);
}

// hands over the pending ids and clears them, so a hint applies once
export function takeGrowHints(): Set<string> {
  const ids = pending;
  pending = new Set();
  return ids;
}
