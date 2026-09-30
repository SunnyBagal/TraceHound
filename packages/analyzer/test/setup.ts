import { scrubGitEnv } from "../src/git-env.ts";

// A hook or `git rebase --exec` exports GIT_DIR & co.; tests must never inherit them (decision 032).
scrubGitEnv();

// Tests must never reach Nebius (or any network): no key, and the global fetch refuses.
// LLM tests inject a fake fetch into TokenFactoryClient instead.
delete process.env.NEBIUS_API_KEY;
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`network disabled in tests (attempted ${String(input)})`);
}) as typeof fetch;
