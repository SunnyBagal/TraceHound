// Repo profile (decision 041): how one target repo installs, tests and typechecks, and from which
// directory. A task names its profile; the harness has no per-repo branches. Every command runs in
// `workdir`. The profile and the task's own setup / regression / typecheck are merged into one
// CheckPlan, which is all the run reads.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/** In a typecheck command: replaced by the tsc the harness picked (the repo's own, else the image's). */
export const TSC_PLACEHOLDER = "$TSC";

export const RepoProfile = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    /** Repo-relative directory every profile command runs in ("." = the repo root). */
    workdir: z
      .string()
      .min(1)
      .default(".")
      .refine((d) => !path.posix.isAbsolute(d) && !d.split("/").includes(".."), "workdir must be a path inside the repo"),
    /** Run once while the network is still on; must exit 0. */
    install: z.string().min(1).optional(),
    /** The repo's test suite: a regression command (baseline vs after the patch). */
    test: z.string().min(1).optional(),
    /** The repo's typecheck; `$TSC` is the repo's own tsc from node_modules when present, else the image's. */
    typecheck: z.string().min(1).optional(),
  })
  .strict();
export type RepoProfile = z.infer<typeof RepoProfile>;

export function loadProfile(file: string): RepoProfile {
  const abs = path.resolve(file);
  if (!existsSync(abs)) throw new Error(`repo profile ${abs} does not exist`);
  return RepoProfile.parse(JSON.parse(readFileSync(abs, "utf8")));
}

/** What a run executes around the agent, with every command as it is run from /work. */
export interface CheckPlan {
  setup: string[]; // network on; each must exit 0
  regression: string[];
  /** Run as `cd <package> && <command>`; a command may contain `$TSC` until the run resolves it. */
  typecheck: { package: string; command: string }[];
}

export const inDir = (dir: string, cmd: string) => (dir === "." ? cmd : `cd ${JSON.stringify(dir)} && ${cmd}`);

/** Profile first (install, test, typecheck in its workdir), then whatever the task adds. */
export function checkPlan(
  spec: { setup: string[]; regression: string[]; typecheck?: { packages: string[]; command: string } },
  profile?: RepoProfile,
): CheckPlan {
  const own = (spec.typecheck?.packages ?? []).map((pkg) => ({ package: pkg, command: spec.typecheck!.command }));
  if (!profile) return { setup: spec.setup, regression: spec.regression, typecheck: own };
  return {
    setup: [...(profile.install ? [inDir(profile.workdir, profile.install)] : []), ...spec.setup],
    regression: [...(profile.test ? [inDir(profile.workdir, profile.test)] : []), ...spec.regression],
    typecheck: [...(profile.typecheck ? [{ package: profile.workdir, command: profile.typecheck }] : []), ...own],
  };
}
