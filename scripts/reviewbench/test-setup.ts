import { scrubGitEnv } from "../../packages/analyzer/src/git-env.ts";

// Same rules as the packages' setup files: no inherited GIT_DIR & co. (decision 032), no key, no network.
scrubGitEnv();
delete process.env.NEBIUS_API_KEY;
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`network disabled in tests (attempted ${String(input)})`);
}) as typeof fetch;
