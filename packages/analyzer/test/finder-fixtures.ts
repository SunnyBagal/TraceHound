// The finder's positive fixtures, one per family (decision 051), shared with the claim converter's tests (052).
export const AUTH = 'import type { Request, Response, NextFunction } from "express";\nexport function requireAuth(req: Request, res: Response, next: NextFunction) {\n  if (!req.headers.authorization) return res.status(401).end();\n  next();\n}\n';
export const QUEUE = 'import { Queue } from "bullmq";\nexport const emails = new Queue("emails");\n';

export const ROUTE_WITHOUT_AUTH: Record<string, string> = {
  "src/auth.ts": AUTH,
  "src/server.ts":
    'import express from "express";\nimport { requireAuth } from "./auth.ts";\nconst app = express();\n' +
    'app.get("/notes", requireAuth, (req, res) => res.json([]));\n' +
    'app.delete("/notes/:id", (req, res) => res.json({ id: req.params.id }));\n' +
    "app.listen(3000);\n",
};
export const PAYLOAD_FIELD_MISSING: Record<string, string> = {
  "src/queue.ts": QUEUE,
  "src/server.ts": 'import { emails } from "./queue.ts";\nexport async function signup(email: string) {\n  await emails.add("welcome", { to: email });\n}\nawait signup("a@b.c");\n',
  "src/worker.ts":
    'import { Worker, type Job } from "bullmq";\nasync function send(job: Job) {\n  const to = job.data.to;\n  const name = job.data.name;\n  console.log(to.trim(), name.trim());\n}\nnew Worker("emails", send);\n',
};
export const REQUEST_TO_FETCH: Record<string, string> = {
  "src/preview.ts": "export async function preview(target: string) {\n  const res = await fetch(target);\n  return res.text();\n}\n",
  "src/server.ts":
    'import express from "express";\nimport { preview } from "./preview.ts";\nconst app = express();\n' +
    'app.post("/preview", async (req, res) => {\n  const { url } = req.body;\n  res.send(await preview(url));\n});\napp.listen(3000);\n',
};
