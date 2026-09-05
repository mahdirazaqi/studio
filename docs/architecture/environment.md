# Environment Configuration

## Mechanism

`src/server/env.ts` uses `@t3-oss/env-nextjs` + Zod. It is the **only** place
`process.env` is read. Import `env` from it everywhere else.

```ts
import { env } from "@/server/env";
env.NODE_ENV; // typed, validated
```

## Three tiers

| Tier                              | Where                         | Rules                                                                                         |
| --------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| **Server (secret / server-only)** | `server: { ... }` in `env.ts` | Never sent to the client. Accessing one in client code is a build-time error.                 |
| **Client (browser-safe)**         | `client: { ... }` in `env.ts` | MUST be prefixed `NEXT_PUBLIC_`. MUST NOT be a secret. Listed explicitly in `runtimeEnv`.     |
| **Development-only**              | `.env` (git-ignored)          | Local overrides. `.env.example` (committed) documents every variable with placeholder values. |

## Failure behavior

- A missing or malformed **required** variable throws at startup with a clear,
  itemized message (`onValidationError`), naming each offending variable and pointing to
  `.env.example`.
- `emptyStringAsUndefined: true` — blank `.env` lines don't accidentally satisfy a
  variable.
- `SKIP_ENV_VALIDATION=1` bypasses validation for tasks that don't need a real env
  (isolated type-checks). Do **not** use it to run the app.

## Phase 1 variables

All optional (the app has no required config yet):

| Variable    | Purpose                                            | Default       |
| ----------- | -------------------------------------------------- | ------------- |
| `NODE_ENV`  | `development` \| `test` \| `production`            | `development` |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` \| `silent` | `info`        |
| `APP_URL`   | absolute base URL for link building                | —             |

## Adding a variable (later phases)

1. Add it to `server` or `client` in `env.ts` with a Zod schema (mark required when it
   genuinely is — e.g. `DATABASE_URL`).
2. Add it to `runtimeEnv`.
3. Document it in `.env.example` (placeholder value only).
4. Never commit the real value. Never reuse a secret from the legacy repo.
