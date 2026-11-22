// Renders the chart: H.264 yuv420p MP4 with faststart, two PNG stills, a 640 px phone copy and check frames.
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit" });
const remotion = join(root, "node_modules", ".bin", "remotion");
mkdirSync(join(root, "out", "frames"), { recursive: true });
mkdirSync(join(root, "renders"), { recursive: true });

const MP4 = "renders/tracehound-result.mp4";
run(remotion, ["render", "src/index.ts", "Chart", "out/raw.mp4", "--codec=h264", "--pixel-format=yuv420p", "--crf=18"]);
// faststart: moov atom first, so X and browsers start playing before the whole file arrives.
run("ffmpeg", ["-y", "-loglevel", "error", "-i", "out/raw.mp4", "-c", "copy", "-movflags", "+faststart", MP4]);
run(remotion, ["still", "src/index.ts", "Chart", "renders/tracehound-result-first.png", "--frame=0"]);
run(remotion, ["still", "src/index.ts", "Chart", "renders/tracehound-result-final.png", "--frame=225"]);
// Phone-size copy for the legibility check (not published).
run("ffmpeg", ["-y", "-loglevel", "error", "-i", MP4, "-vf", "scale=640:-2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "out/phone-640.mp4"]);
for (const s of ["0.5", "2.0", "3.5", "5.0", "6.5", "7.5", "8.8"]) {
  for (const [src, tag] of [[MP4, "1920"], ["out/phone-640.mp4", "640"]]) {
    run("ffmpeg", ["-y", "-loglevel", "error", "-ss", s, "-i", src, "-frames:v", "1", `out/frames/t${s}s-${tag}.png`]);
  }
}
console.log("mp4 bytes:", statSync(join(root, MP4)).size);
