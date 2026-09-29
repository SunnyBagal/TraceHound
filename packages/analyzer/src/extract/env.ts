import { Node, type SourceFile } from "ts-morph";
import type { EnvReadFact } from "../schema.ts";
import type { ExtractContext } from "./evidence.ts";
import { envHelperCallName, processEnvName } from "./values.ts";

const ENV_OBJECTS = new Set(["process.env", "Bun.env", "import.meta.env", "Deno.env"]);

/** Env var reads: `process.env.X`, `process.env["X"]`, `const { X } = process.env`, `readEnv("X")` helpers. */
export function extractEnv(sf: SourceFile, ctx: ExtractContext): EnvReadFact[] {
  const file = ctx.rel(sf.getFilePath());
  const facts: EnvReadFact[] = [];
  const add = (node: Node, name: string, confidence: number, how: string) => {
    const evidenceId = ctx.evidence.addNode(node, file, { extractor: "env", confidence, detail: `reads env ${name} (${how})`, symbol: name });
    facts.push({ name, evidenceId });
  };

  sf.forEachDescendant((node) => {
    if (Node.isPropertyAccessExpression(node) && ENV_OBJECTS.has(node.getExpression().getText())) {
      add(node, node.getName(), 1, node.getExpression().getText());
      return;
    }
    if (Node.isElementAccessExpression(node)) {
      const name = processEnvName(node);
      if (name) add(node, name, 1, "process.env[...]");
      return;
    }
    if (Node.isVariableDeclaration(node)) {
      const init = node.getInitializer();
      const binding = node.getNameNode();
      if (init && ENV_OBJECTS.has(init.getText()) && Node.isObjectBindingPattern(binding)) {
        for (const el of binding.getElements()) add(el, el.getPropertyNameNode()?.getText() ?? el.getName(), 1, "destructured");
      }
      return;
    }
    if (Node.isCallExpression(node)) {
      const name = envHelperCallName(node);
      if (name) add(node, name, 0.9, `via ${node.getExpression().getText()}()`);
    }
  });

  return facts;
}
