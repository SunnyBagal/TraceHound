import { modelDisplayName } from "@/lib/naming";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** The full disclosure, on every model-written mark's tooltip. */
export const MODEL_NAME_DISCLOSURE = "Name written by the model; prose not verified";

/**
 * The NVIDIA logo (public/icons/nvidia.svg, see CREDITS.md), drawn as a mask in currentColor: a
 * single-colour path, kept neutral so it never reads as the change view's green.
 */
export function NvidiaLogo({ className = "" }: { className?: string }) {
  const mask = `url("${base}/icons/nvidia.svg") center / contain no-repeat`;
  return <span aria-hidden data-logo="nvidia.svg" className={`block shrink-0 bg-current ${className}`} style={{ mask, WebkitMask: mask }} />;
}

/** Marks a model-written name on nodes and in lists: the small NVIDIA mark, with the disclosure as its tooltip. */
export function ModelMark({ className = "" }: { className?: string }) {
  return (
    <span data-testid="model-name-mark" role="img" title={MODEL_NAME_DISCLOSURE} aria-label={MODEL_NAME_DISCLOSURE} className={`inline-flex shrink-0 items-center text-muted ${className}`}>
      <NvidiaLogo className="h-3 w-3.5" />
    </span>
  );
}

/** Inspector: the NVIDIA logo and plain muted text naming the model; the tooltip carries the disclosure. */
export function NamedByModel({ model }: { model?: string }) {
  return (
    <span data-testid="model-written" title={MODEL_NAME_DISCLOSURE} className="inline-flex items-center gap-1.5 text-[13px] text-muted">
      <NvidiaLogo className="h-3.5 w-4" />
      Named by {modelDisplayName(model)}
    </span>
  );
}
