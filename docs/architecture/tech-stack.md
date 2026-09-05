# Tech Stack

Versions below are what Phase 1 actually installed. See `package.json` for exact ranges
and `package-lock.json` for the resolved tree.

## Decided & installed

| Concern               | Choice                                                                     | Version                        | Notes / ADR                                                                           |
| --------------------- | -------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| Framework             | **Next.js** (App Router)                                                   | `15.5.x`                       | Pinned to 15 for Node 20 compatibility — ADR-0001, ADR-0017.                          |
| Runtime               | **Node.js**                                                                | `>= 20.9` (dev on 20.20)       | `.nvmrc` = 20.                                                                        |
| Language              | **TypeScript** (strict + `noUncheckedIndexedAccess`, `noImplicitOverride`) | `5.9.x`                        |                                                                                       |
| UI runtime            | **React** (Server + Client Components)                                     | `19.1.0`                       |                                                                                       |
| Styling               | **Tailwind CSS v4** (CSS-first config, `@tailwindcss/postcss`)             | `4.x`                          | No `tailwind.config`; tokens in `globals.css`.                                        |
| Components            | **shadcn/ui** ("new-york", neutral, RSC)                                   | CLI `shadcn@2.x`               | Components copied into `src/components/ui`. Radix via the unified `radix-ui` package. |
| Icons                 | **lucide-react**                                                           | `0.5xx`                        | Single icon library. ADR-0017.                                                        |
| Theme                 | **next-themes**                                                            | `0.4.x`                        | Light / Dark / System — [../frontend/theme.md](../frontend/theme.md).                 |
| Toasts                | **sonner** (via shadcn)                                                    | `2.x`                          |                                                                                       |
| Package manager       | **npm**                                                                    | `>= 10` (bundled with Node 20) | Resolves OPEN DECISION OD-44. ADR-0018. `package-lock.json` committed.                |
| Internal mutations    | **Server Actions** (`defineAction`)                                        | —                              | ADR-0003, [server-actions.md](server-actions.md).                                     |
| External Worker comms | **REST Route Handlers** (`defineRouteHandler`, versioned, authenticated)   | —                              | ADR-0004, [rest-architecture.md](rest-architecture.md).                               |
| Env validation        | **@t3-oss/env-nextjs** + **Zod**                                           | `0.13.x` / `zod 4.x`           | [environment.md](environment.md).                                                     |
| Input validation      | **Zod**                                                                    | `4.x`                          | `parseInput` at every boundary.                                                       |
| Lint                  | **ESLint** (flat config) + `eslint-config-next` + `eslint-config-prettier` | `9.x` / `15.5.x`               | Custom `no-restricted-imports` guard for the server/client boundary.                  |
| Format                | **Prettier** + `prettier-plugin-tailwindcss`                               | `3.x`                          |                                                                                       |
| Tests                 | **Vitest**                                                                 | `3.x`                          | Foundational unit tests only in Phase 1.                                              |

## Database (not installed yet)

**PostgreSQL + Prisma** (ADR-0002) — added with the first persistent feature. No
`prisma/` directory or `@prisma/client` in Phase 1. See
[../data/database.md](../data/database.md) and `src/server/db/README.md`.

## Media tooling (not installed yet)

**ffmpeg / ImageMagick** for screenshot + thumbnail generation, invoked via
`execFile` / `spawn` with argument arrays only (ADR-0015). Added with the Files/Jobs
features.

## Explicitly not used

- **MongoDB / Mongoose** — replaced by PostgreSQL + Prisma. Do not reintroduce.
- **GraphQL** — internal ops use Server Actions.
- **Redis / Bull** — no queue by default; a durable-work mechanism is added only when a
  concrete requirement calls for one (OPEN DECISION OD-40).
- **React Query / SWR / axios** — the app is not API-dependent for its own UI.
- **A CSS-in-JS library** — Tailwind + shadcn only.
- **Elasticsearch** — legacy-wide concern, out of Studio's scope.

## Deferred / still open

See [../development/open-decisions.md](../development/open-decisions.md): session library
(OD-43), object storage backend (OD-42), background-job mechanism (OD-40), Telegram
webhook vs polling (OD-34), Worker credential scheme (OD-27), rate-limiting layer (OD-41),
Prisma naming (OD-45).
