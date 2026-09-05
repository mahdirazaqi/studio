# Tech Stack

Versions below are what Phase 1 actually installed. See `package.json` for exact ranges
and `package-lock.json` for the resolved tree.

## Decided & installed

| Concern               | Choice                                                                     | Version                            | Notes / ADR                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Framework             | **Next.js** (App Router)                                                   | `15.5.x`                           | Pinned to 15 for Node 20 compatibility — ADR-0001, ADR-0017.                                                                              |
| Runtime               | **Node.js**                                                                | `>= 20.9` (dev on 20.20)           | `.nvmrc` = 20.                                                                                                                            |
| Language              | **TypeScript** (strict + `noUncheckedIndexedAccess`, `noImplicitOverride`) | `5.9.x`                            |                                                                                                                                           |
| UI runtime            | **React** (Server + Client Components)                                     | `19.1.0`                           |                                                                                                                                           |
| Styling               | **Tailwind CSS v4** (CSS-first config, `@tailwindcss/postcss`)             | `4.x`                              | No `tailwind.config`; tokens in `globals.css`.                                                                                            |
| Components            | **shadcn/ui** ("new-york", neutral, RSC)                                   | CLI `shadcn@2.x`                   | Components copied into `src/components/ui`. Radix via the unified `radix-ui` package.                                                     |
| Icons                 | **lucide-react**                                                           | `0.5xx`                            | Single icon library. ADR-0017.                                                                                                            |
| Theme                 | **next-themes**                                                            | `0.4.x`                            | Light / Dark / System — [../frontend/theme.md](../frontend/theme.md).                                                                     |
| Toasts                | **sonner** (via shadcn)                                                    | `2.x`                              |                                                                                                                                           |
| Package manager       | **npm**                                                                    | `>= 10` (bundled with Node 20)     | Resolves OPEN DECISION OD-44. ADR-0018. `package-lock.json` committed.                                                                    |
| Database              | **PostgreSQL + Prisma**                                                    | Postgres 16 (dev); Prisma `6.19.x` | ADR-0002; [database.md](database.md). Pinned to Prisma 6 (not the newly-released 7) for the same Node-20/stability reasoning as ADR-0017. |
| Password hashing      | **bcrypt** via `bcryptjs`                                                  | `3.x`                              | Pure JS, no native build step. [authentication.md](authentication.md), ADR-0020.                                                          |
| Authentication        | Custom DB-backed sessions (opaque token, httpOnly cookie)                  | —                                  | ADR-0020, [authentication.md](authentication.md). No NextAuth/Auth.js, no JWT.                                                            |
| Internal mutations    | **Server Actions** (`defineAction`)                                        | —                                  | ADR-0003, [server-actions.md](server-actions.md).                                                                                         |
| External Worker comms | **REST Route Handlers** (`defineRouteHandler`, versioned, authenticated)   | —                                  | ADR-0004, [rest-architecture.md](rest-architecture.md).                                                                                   |
| Env validation        | **@t3-oss/env-nextjs** + **Zod**                                           | `0.13.x` / `zod 4.x`               | [environment.md](environment.md).                                                                                                         |
| Input validation      | **Zod**                                                                    | `4.x`                              | `parseInput` at every boundary.                                                                                                           |
| Lint                  | **ESLint** (flat config) + `eslint-config-next` + `eslint-config-prettier` | `9.x` / `15.5.x`                   | Custom `no-restricted-imports` guard for the server/client boundary.                                                                      |
| Format                | **Prettier** + `prettier-plugin-tailwindcss`                               | `3.x`                              |                                                                                                                                           |
| Tests                 | **Vitest**                                                                 | `3.x`                              | Foundational unit tests only in Phase 1.                                                                                                  |
| File storage          | `StorageAdapter` interface; **local disk** the only implementation         | —                                  | ADR-0024, [files.md](files.md). Swappable for S3-compatible storage later without an application-layer change.                            |
| File type sniffing    | **file-type**                                                              | `21.x`                             | Magic-byte detection — never trusts the client's declared MIME type. [files.md](files.md).                                                |
| Image dimension probe | **image-size**                                                             | `2.x`                              | Pure JS, no subprocess. Images only — audio/video duration probing needs `ffprobe`, not introduced yet.                                   |

## Database

**PostgreSQL + Prisma** (ADR-0002) — installed in Phase 2 with the first persistent
models (`Department`, `User`, `Session`); `File` added in Phase 4. See
[database.md](database.md), [files.md](files.md), and
[../data/database.md](../data/database.md).

## Media tooling

**Installed (Phase 4):** `file-type` (content sniffing) and `image-size` (dimension
probing) — both pure JS, no subprocess, no native build step.

**Not installed yet:** `ffmpeg` / `ImageMagick` for screenshot + thumbnail generation and
audio/video duration probing, invoked via `execFile` / `spawn` with argument arrays only
(ADR-0015) when they are added — with the Jobs feature.

## Explicitly not used

- **MongoDB / Mongoose** — replaced by PostgreSQL + Prisma. Do not reintroduce.
- **GraphQL** — internal ops use Server Actions.
- **Redis / Bull** — no queue by default; a durable-work mechanism is added only when a
  concrete requirement calls for one (OPEN DECISION OD-40).
- **React Query / SWR / axios** — the app is not API-dependent for its own UI.
- **A CSS-in-JS library** — Tailwind + shadcn only.
- **Elasticsearch** — legacy-wide concern, out of Studio's scope.

## Deferred / still open

See [../development/open-decisions.md](../development/open-decisions.md): the _specific_
object storage backend beyond local disk (OD-42, interface half resolved — ADR-0024),
background-job mechanism (OD-40), Telegram webhook vs polling (OD-34), Worker credential
scheme (OD-27), rate-limiting layer (OD-41). Session library (OD-43) and
Prisma naming (OD-45) are resolved — ADR-0020, ADR-0021.
