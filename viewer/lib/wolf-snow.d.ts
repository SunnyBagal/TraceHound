export interface SnowWolfOptions {
  /** CSS px per dot (the canvas is 286×129 dots) */
  cell?: number;
  dot?: number;
  margin?: number;
  groundRows?: number;
  background?: string;
  wolfColor?: string;
  groundColor?: string;
  snowGlint?: string;
  pawColor?: string;
  pawLife?: number;
  speed?: number;
  maxFps?: number;
}

export function createSnowWolfMono(canvas: HTMLCanvasElement, options?: SnowWolfOptions): { destroy(): void };
