export class BudgetExceededError extends Error {
  override name = "BudgetExceededError";
}

export interface BudgetCaps {
  totalUSD: number; // across all runs, from the ledger
  runUSD: number; // this process
}

export const DEFAULT_CAPS: BudgetCaps = { totalUSD: 45, runUSD: 1 };

export function capsFromEnv(env: NodeJS.ProcessEnv = process.env): BudgetCaps {
  const read = (name: string, fallback: number) => {
    const raw = env[name];
    if (raw === undefined || raw === "") return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number, got "${raw}"`);
    return value;
  };
  return { totalUSD: read("TRACEHOUND_BUDGET_TOTAL_USD", DEFAULT_CAPS.totalUSD), runUSD: read("TRACEHOUND_BUDGET_RUN_USD", DEFAULT_CAPS.runUSD) };
}

/**
 * Pre-call spend gate. Callers reserve a worst-case estimate before a request and settle it with
 * the actual cost afterwards; concurrent calls see each other's reservations, so parallel
 * requests can't jointly overshoot a cap.
 */
export class Budget {
  readonly caps: BudgetCaps;
  readonly spentBeforeRun: number;
  #runSpent = 0;
  #reserved = 0;

  constructor(caps: BudgetCaps, spentBeforeRun: number) {
    this.caps = caps;
    this.spentBeforeRun = spentBeforeRun;
  }

  get runSpent(): number {
    return this.#runSpent;
  }

  /** Throws BudgetExceededError (no request is made) if the estimate would cross either cap. */
  reserve(estimateUSD: number, what: string): { settle: (actualUSD: number) => void } {
    const run = this.#runSpent + this.#reserved + estimateUSD;
    const total = this.spentBeforeRun + run;
    const fmt = (n: number) => `$${n.toFixed(4)}`;
    if (run > this.caps.runUSD) {
      throw new BudgetExceededError(
        `refusing ${what}: estimated ${fmt(estimateUSD)} would bring this run to ${fmt(run)}, over TRACEHOUND_BUDGET_RUN_USD=${this.caps.runUSD}`,
      );
    }
    if (total > this.caps.totalUSD) {
      throw new BudgetExceededError(
        `refusing ${what}: estimated ${fmt(estimateUSD)} would bring total spend to ${fmt(total)}, over TRACEHOUND_BUDGET_TOTAL_USD=${this.caps.totalUSD}`,
      );
    }
    this.#reserved += estimateUSD;
    let settled = false;
    return {
      settle: (actualUSD: number) => {
        if (settled) return;
        settled = true;
        this.#reserved -= estimateUSD;
        this.#runSpent += actualUSD;
      },
    };
  }
}
