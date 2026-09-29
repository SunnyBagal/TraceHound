/** Case/punctuation-insensitive form: "nvidia/NVIDIA-Nemotron-3-Nano" → "nvidianvidianemotron3nano". */
const normalize = (id: string) => id.toLowerCase().replace(/[^a-z0-9]/g, "");

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

/**
 * Closest available model id to a requested one that the API didn't list: an exact
 * case-insensitive match first, then ignoring punctuation, then the smallest edit distance
 * (only if reasonably close).
 */
export function closestModel(requested: string, available: string[]): { id: string; reason: string } | undefined {
  const lower = requested.toLowerCase();
  const exactCase = available.find((id) => id.toLowerCase() === lower);
  if (exactCase) return { id: exactCase, reason: "same id, different letter case (model ids are case-sensitive)" };
  const norm = normalize(requested);
  const punct = available.find((id) => normalize(id) === norm);
  if (punct) return { id: punct, reason: "same id, different case/punctuation" };
  const ranked = available
    .map((id) => ({ id, d: editDistance(normalize(id), norm) }))
    .sort((a, b) => a.d - b.d || a.id.localeCompare(b.id));
  const best = ranked[0];
  return best && best.d <= Math.max(3, Math.floor(norm.length / 4)) ? { id: best.id, reason: `closest id (edit distance ${best.d})` } : undefined;
}
