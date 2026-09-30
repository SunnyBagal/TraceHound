import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Budget, type BudgetCaps } from "../src/llm/budget.ts";
import { ResponseCache } from "../src/llm/cache.ts";
import { TokenFactoryClient } from "../src/llm/client.ts";
import { SpendLedger } from "../src/llm/ledger.ts";
import { PriceTable } from "../src/llm/prices.ts";
import { Project, ts, type SourceFile } from "ts-morph";
import { EvidenceStore, type ExtractContext } from "../src/extract/evidence.ts";

/** In-memory project rooted at "/" with bundler resolution, like the demo repo's tsconfig. */
export function memoryProject(files: Record<string, string>) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.Preserve,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      noEmit: true,
    },
  });
  const evidence = new EvidenceStore();
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(path, text);
    evidence.setFileText(path.replace(/^\//, ""), text);
  }
  const ctx: ExtractContext = { rel: (abs) => abs.replace(/^\//, ""), evidence };
  const sf = (path: string): SourceFile => project.getSourceFileOrThrow(path);
  return { project, ctx, evidence, sf };
}

export const TEST_PRICES = PriceTable.parse({
  placeholderFallback: { inputPer1M: 5, outputPer1M: 15 },
  models: {
    "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B": { inputPer1M: null, outputPer1M: null, placeholder: true },
    "priced/model": { inputPer1M: 1, outputPer1M: 2 },
  },
});

/** TokenFactoryClient wired to a fake fetch and a throwaway ledger/cache directory. */
export function fakeClient(fetchImpl: typeof fetch, opts: { caps?: BudgetCaps; readCache?: boolean; offline?: boolean; dir?: string; spentBefore?: number } = {}) {
  const dir = opts.dir ?? mkdtempSync(path.join(tmpdir(), "tracehound-test-"));
  const ledger = new SpendLedger(path.join(dir, "spend.jsonl"));
  const budget = new Budget(opts.caps ?? { totalUSD: 45, runUSD: 1 }, opts.spentBefore ?? ledger.totalUSD());
  const client = new TokenFactoryClient({
    apiKey: "test-key", prices: TEST_PRICES, budget, ledger, cache: new ResponseCache(path.join(dir, "cache")),
    readCache: opts.readCache ?? true, offline: opts.offline, fetch: fetchImpl,
  });
  return { client, ledger, budget, dir };
}
