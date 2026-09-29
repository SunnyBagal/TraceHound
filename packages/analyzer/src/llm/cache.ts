import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Content-addressed cache of successful model responses: sha256(model + full request). */
export class ResponseCache {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  static key(model: string, request: unknown): string {
    return createHash("sha256").update(model).update("\0").update(JSON.stringify(request)).digest("hex");
  }

  get<T>(key: string): T | undefined {
    const file = path.join(this.dir, `${key}.json`);
    if (!existsSync(file)) return undefined;
    try {
      return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
      return undefined; // a corrupt entry is a miss, not a crash
    }
  }

  put(key: string, value: unknown): void {
    mkdirSync(this.dir, { recursive: true });
    const file = path.join(this.dir, `${key}.json`);
    writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2));
    renameSync(`${file}.tmp`, file); // atomic: concurrent runs never read half a file
  }
}
