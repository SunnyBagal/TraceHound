import { scrubGitEnv } from "../src/git-env.ts";
import { setDefaultFetch } from "../src/llm/transport.ts";

// A hook or `git rebase --exec` exports GIT_DIR & co.; tests must never inherit them (decision 032).
scrubGitEnv();

// Tests must never reach Nebius (or any network): no key, and the global fetch refuses.
// LLM tests inject a fake fetch into TokenFactoryClient instead.
delete process.env.NEBIUS_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`network disabled in tests (attempted ${String(input)})`);
}) as typeof fetch;

// 073a: the client's default transport (node:http/https) must hit the same guard, so it delegates to globalThis.fetch.
setDefaultFetch((url, init) => globalThis.fetch(url, init));
