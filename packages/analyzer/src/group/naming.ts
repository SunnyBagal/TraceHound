// Deterministic names derived from file paths and package names.

/** Words that describe a file's role/layer rather than its responsibility. */
const ROLE_WORDS = new Set([
  "index", "main", "src", "lib", "utils", "util", "helpers", "types", "type", "d",
  "routes", "route", "router", "routers", "controller", "controllers", "handler", "handlers",
  "service", "services", "client", "clients", "api", "config", "server", "app", "store",
]);

const ACRONYMS = new Set(["api", "http", "db", "sql", "jwt", "id", "ui", "sse", "ws"]);

export function tokens(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function stem(file: string): string {
  const base = file.split("/").pop() ?? file;
  return base.replace(/\.d\.ts$/, "").replace(/\.[^.]+$/, "");
}

/** Responsibility tokens of a file: its stem minus role words ("exchange-routes" → ["exchange"]). */
export function responsibilityTokens(file: string): string[] {
  return tokens(stem(file)).filter((t) => !ROLE_WORDS.has(t));
}

export function titleCase(words: string[]): string {
  return words.map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

export function slug(text: string): string {
  return tokens(text).join("-") || "root";
}

/** Package display name: "@acme/order-service" → "Order Service", "." → repo name. */
export function packageTitle(pkgName: string): string {
  return titleCase(tokens(pkgName.replace(/^@[^/]+\//, "")));
}
