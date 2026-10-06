/** "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B" → "Nemotron Nano"; unknown ids pass through. */
export function modelDisplayName(model: string | undefined): string {
  if (!model) return "model";
  const size = /\b(nano|super|ultra|lightning)\b/i.exec(model.replace(/[-_/]/g, " "))?.[1];
  if (/nemotron/i.test(model) && size) return `Nemotron ${size[0]!.toUpperCase()}${size.slice(1).toLowerCase()}`;
  return model.split("/").pop()!;
}

