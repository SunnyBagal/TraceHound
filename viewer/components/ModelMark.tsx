import { modelDisplayName } from "@/lib/naming";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** The full disclosure, on every model-written mark's tooltip. */
export const MODEL_NAME_DISCLOSURE = "Name written by the model; prose not verified";

/**
 * The NVIDIA logo in its colours: the eye from svgl.app's NVIDIA icon (public/icons/
 * nvidia-color-eye.svg, the green path of nvidia-color.svg with the viewBox cropped to it; see
 * public/icons/CREDITS.md). The owner asked for the colour logo; it is always paired with the
 * disclosure text or tooltip, so its green is not read as the change view's "added".
 */
export function NvidiaLogo({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a vendored static icon
  return <img src={`${base}/icons/nvidia-color-eye.svg`} alt="" aria-hidden data-logo="nvidia-color-eye.svg" className={`block shrink-0 object-contain ${className}`} draggable={false} />;
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
