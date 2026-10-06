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
