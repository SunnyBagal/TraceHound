// 30 fps, 270 frames = 9 s. Frame numbers, not seconds.
export const FPS = 30;
export const DURATION = 270;
export const TITLE_END = 36; // 1.2 s: title card (also the preview frame)
export const RACE_END = 186; // 6.2 s: last tick of every racer lands here
export const NOBODY_SOLID = 194; // "Nobody finished." fully shown from here (~0.8 s before the scoreboard)
export const SCORE_IN = 218; // 7.27 s: scoreboard fades in
export const SCORE_SOLID = 228;
export const RESET = 231; // under the opaque scoreboard the track goes back to the title state
export const LOOP_OUT = 258; // scoreboard fades out to the title card; frame 270 = frame 0
export const TICK = 6; // frames one tick takes to ease forward (200 ms)

const RACE_LEN = RACE_END - TITLE_END;

/** Start frame of tick k (1-based) for a racer with n ticks: even pace, the last tick ends at RACE_END. */
export const tickStart = (k: number, n: number) => TITLE_END + (k / n) * RACE_LEN - TICK;
