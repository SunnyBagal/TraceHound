// Renders the race: H.264 yuv420p MP4 with faststart, two PNG stills, a 640 px phone copy and check frames.
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit" });
const remotion = join(root, "node_modules", ".bin", "remotion");
mkdirSync(join(root, "out", "frames"), { recursive: true });
mkdirSync(join(root, "renders"), { recursive: true });

run("node", ["scripts/logos.mjs"]);
run(remotion, ["render", "src/index.ts", "Race", "out/race.raw.mp4", "--codec=h264", "--pixel-format=yuv420p", "--crf=18"]);
// faststart: moov atom first, so X and browsers start playing before the whole file arrives.
run("ffmpeg", ["-y", "-loglevel", "error", "-i", "out/race.raw.mp4", "-c", "copy", "-movflags", "+faststart", "renders/tracehound-race.mp4"]);
run(remotion, ["still", "src/index.ts", "Race", "renders/tracehound-race-first.png", "--frame=0"]);
run(remotion, ["still", "src/index.ts", "Race", "renders/tracehound-race-scoreboard.png", "--frame=240"]);
// Phone-size copy for the legibility check (not published).
run("ffmpeg", ["-y", "-loglevel", "error", "-i", "renders/tracehound-race.mp4", "-vf", "scale=640:-2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", "out/race-640.mp4"]);
for (const s of ["0.5", "1.5", "3.5", "6.0", "6.5", "7.5", "8.0", "8.95"]) {
  for (const [src, tag] of [["renders/tracehound-race.mp4", "1920"], ["out/race-640.mp4", "640"]]) {
    run("ffmpeg", ["-y", "-loglevel", "error", "-ss", s, "-i", src, "-frames:v", "1", `out/frames/t${s}s-${tag}.png`]);
  }
}
console.log("mp4 bytes:", statSync(join(root, "renders", "tracehound-race.mp4")).size);
