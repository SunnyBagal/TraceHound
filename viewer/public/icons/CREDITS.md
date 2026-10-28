# Technology icons

Vendored from [svgl.app](https://svgl.app) (looked up via its public API, `https://api.svgl.app?search=<name>`)
on 2026-09-30. Served from this directory; the viewer never hotlinks them. Trademarks belong to
their owners; the icons only label a technology that a snapshot fact proves (see
`viewer/lib/tech.ts`).

| File | Technology | Source (svgl variant) | Project |
| --- | --- | --- | --- |
| `redis.svg` | Redis | https://svgl.app/library/redis.svg | https://redis.io/ |
| `postgresql.svg` | PostgreSQL | https://svgl.app/library/postgresql.svg | https://www.postgresql.org/ |
| `prisma.svg` | Prisma | https://svgl.app/library/prisma_dark.svg (dark-theme variant) | https://prisma.io/ |
| `express.svg` | Express.js | https://svgl.app/library/expressjs_dark.svg (dark-theme variant) | https://expressjs.com |
| `bun.svg` | Bun | https://svgl.app/library/bun.svg | https://bun.sh (press kit: https://bun.sh/press-kit) |

## Redis "R" (broker nodes)

`redis-r.svg` is Simple Icons' `icons/redis.svg` from the npm package `simple-icons@16.3.0`
(https://cdn.jsdelivr.net/npm/simple-icons@16.3.0/icons/redis.svg), vendored unmodified on
2026-10-04 (sha256 `428b86deb14c8bdacdcdf75987fe454f367bcd078a7e4ae3f84de29aa5bdf136`). Simple
Icons is released under CC0-1.0; its data file lists no separate licence for this icon (source
and guidelines: https://redis.io/brand-guidelines). The file is a single path with no colour,
so the viewer draws it as a CSS mask filled with `--logo-redis` (`#FF4438`, the hex in Simple
Icons' data for Redis). It marks a Redis node the snapshot shows used as a broker; a Redis node
used to store data keeps `redis.svg` (`viewer/lib/tech.ts`, `redisUse`).

## NVIDIA logo (model-written names)

`nvidia.svg` is Simple Icons' `icons/nvidia.svg` from the npm package `simple-icons@16.3.0`
(https://cdn.jsdelivr.net/npm/simple-icons@16.3.0/icons/nvidia.svg), vendored unmodified on
2026-10-06 (sha256 `b0e4cfc12712c840d4d630c9a717200fbd09aeeadbd3faeac13bda2e2ed050b0`). Simple
Icons is released under CC0-1.0; its data file lists no separate licence for this icon (source:
https://www.nvidia.com/en-us). NVIDIA's trademark belongs to NVIDIA; the viewer uses the logo only
to say that a component's name was written by an NVIDIA Nemotron model (the naming pass). The
file is a single path with no colour, so the viewer draws it as a CSS mask in the surrounding
muted text colour (`viewer/components/ModelMark.tsx`), not in NVIDIA green, which would read as
the change view's "added".

## NVIDIA logo in colour (model-written names, landing page)

`nvidia-color.svg` is svgl.app's NVIDIA icon, dark-theme variant
(https://svgl.app/library/nvidia-icon-dark.svg, found via `https://api.svgl.app?search=nvidia`),
vendored unmodified on 2026-10-07 (sha256
`c0ba24515aa21f07119e15914abbde64dd17b42fd95518a15df208a615c3810e`). Brand guidelines:
https://www.nvidia.com/en-us/about-nvidia/legal-info/logo-brand-usage. The landing page shows it
in the Models section.

`nvidia-color-eye.svg` is derived from it: the green (`#77B900`) path alone, with the viewBox
cropped to that path (`56.5 31.2 249.5 166`; sha256 `3d0ff94ca476e49e5e94cf00a011b7f3362f8a54c5b69db7001e38aa8be3468e`), because the full icon's wordmark is unreadable at
badge size. The viewer uses it, in colour at the owner's request, for every model-written
name (`viewer/components/ModelMark.tsx`), always beside the disclosure text or with it as the
tooltip. It replaces the single-colour `nvidia.svg` above, which stays vendored but unused.

## Landing hero brand marks (`brands/`)

Vendored on 2026-10-27 for the landing page's hero only, with the owner's approval; trademarks
belong to their owners and the marks only name the coding agents whose pull requests TraceHound
reviews (and NVIDIA, whose Nemotron models it runs on). Unmodified files:

| File | Mark | Source | Licence of the file |
| --- | --- | --- | --- |
| `brands/claude.svg` | Claude | https://cdn.jsdelivr.net/npm/simple-icons@15/icons/claude.svg | CC0-1.0 (Simple Icons) |
| `brands/openai.svg` | ChatGPT / OpenAI | https://cdn.jsdelivr.net/npm/simple-icons@15/icons/openai.svg | CC0-1.0 (Simple Icons) |
| `brands/cursor.svg` | Cursor | https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1/icons/cursor.svg | MIT (Lobe Icons) |
| `brands/antigravity-color.svg` | Google Antigravity | https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1/icons/antigravity-color.svg | MIT (Lobe Icons) |
| `brands/opencode.svg` | OpenCode | https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1/icons/opencode.svg | MIT (Lobe Icons) |

The NVIDIA mark on the hero reuses `nvidia.svg` above. Single-colour files are drawn as CSS
masks filled with the brand's colour on its tile.

## Code reviewers (benchmark page)

The `/benchmark` page marks each reviewer's row with its logo. All are drawn as single-colour CSS
masks in the surrounding text colour (`viewer/components/benchmark/ReviewerMark.tsx`), so a file's
own colours never show. Vendored unmodified on 2026-10-28. Trademarks belong to their owners; the
logos only label that company's reviewer in an aggregate results table.

| File | Reviewer | Source | Licence of the file | sha256 |
| --- | --- | --- | --- | --- |
| `brands/augment.svg` | Augment Code | https://www.augmentcode.com/favicon.svg (the company's own favicon; not in Simple Icons, svgl or Lobe Icons) | the company's | `5151bb83fc6ee1f848f183923f25ea92fc2125ec0e7495e2a55b47dc4fd10e81` |
| `brands/cursor.svg` | Cursor | reused from the row above | MIT (Lobe Icons) | |
| `brands/greptile.svg` | Greptile | https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.101.0/icons/greptile.svg | MIT (Lobe Icons) | `ee036d35f5234a4c64ddfc0a4ca42095211ed842c777ca9e8d01f345f5c7d667` |
| `brands/githubcopilot.svg` | GitHub Copilot | https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.101.0/icons/githubcopilot.svg | MIT (Lobe Icons) | `bbc7fddc13448236e5edea8c399d2072dc40aa5da5bca07f7a2f412405c500a3` |
| `brands/coderabbit.svg` | CodeRabbit | https://cdn.jsdelivr.net/npm/simple-icons@16.3.0/icons/coderabbit.svg | CC0-1.0 (Simple Icons) | `8132ef42750b608836a8b1de6a29a218cfe25251fdb4c3a58fb37929499ec042` |
