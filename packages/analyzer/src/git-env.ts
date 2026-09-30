// Git environment hygiene (decision 032). Inside a git hook or `git rebase --exec`, git exports
// variables such as GIT_DIR that override `git -C <dir>`: a child `git init/add/commit` then
// writes into the caller's repository instead of <dir>. Every git we spawn gets an env without
// them. No imports: the viewer's test setup uses this file too (`@tracehound/analyzer/git-env`).

/** Variables that select or reconfigure a repository behind the back of `git -C`. */
export const REPO_SELECTING_GIT_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
] as const;

const CONFIG_PAIR = /^GIT_CONFIG_(KEY|VALUE)_\d+$/;

export function isRepoSelectingGitVar(name: string): boolean {
  return (REPO_SELECTING_GIT_VARS as readonly string[]).includes(name) || CONFIG_PAIR.test(name);
}

/** A copy of `env` without the repo-selecting git variables: pass it as `env` to every git spawn. */
export function cleanGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !isRepoSelectingGitVar(name))) as NodeJS.ProcessEnv;
}

/** Deletes those variables from `env` in place (test setup files); returns the names removed. */
export function scrubGitEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const removed = Object.keys(env).filter(isRepoSelectingGitVar);
  for (const name of removed) delete env[name];
  return removed;
}
