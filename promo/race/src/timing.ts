// 30 fps, 270 frames = 9 s.
export const FPS = 30;
export const DURATION = 270;
export const DRAW_START = 24; // 0.8 s of empty chart with the title (frame 0 is the preview)
export const DRAW_END = 174; // 5.8 s: every line reaches its total together
export const MARK_IN = 180; // highlights fade in
export const MARK_SOLID = 196;
export const LOOP_OUT = 252; // lines and highlights fade back to the empty chart; frame 270 = frame 0
