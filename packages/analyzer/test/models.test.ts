import { describe, expect, it } from "vitest";
import { closestModel } from "../src/llm/models.ts";

// The 4 Nemotron ids GET /models returned on 2026-09-30, plus unrelated ones.
const AVAILABLE = [
  "nvidia/Nemotron-3-Ultra-550b-a55b",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
  "nvidia/Nemotron-3_5-Lightning",
  "meta-llama/Llama-3.3-70B-Instruct",
  "Qwen/Qwen3-32B",
];

describe("closestModel", () => {
  it("suggests the case-insensitive match for the cookbook's lowercase Nano id", () => {
    expect(closestModel("nvidia/nvidia-nemotron-3-nano-30b-a3b", AVAILABLE)).toEqual({
      id: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
      reason: "same id, different letter case (model ids are case-sensitive)",
    });
  });

  it("tolerates punctuation differences and small typos", () => {
    expect(closestModel("nvidia/nemotron-3.5-lightning", AVAILABLE)?.id).toBe("nvidia/Nemotron-3_5-Lightning");
    expect(closestModel("nvidia/nemotron-3-super-120b-a21b", AVAILABLE)?.id).toBe("nvidia/nemotron-3-super-120b-a12b");
  });

  it("returns nothing for ids that aren't close to anything", () => {
    expect(closestModel("openai/gpt-oss-120b", AVAILABLE)).toBeUndefined();
  });
});
