# feature: telegram

**Scope:** the Telegram bot — a conversational front-end for creating and monitoring
Jobs. A thin adapter that translates Telegram updates into use-case calls.

**Status: implemented (Phase 8).** See
[`docs/integrations/telegram.md`](../../../docs/integrations/telegram.md) for the full
mechanism and ADR-0035/0036/0037/0038 for the decisions behind it.

**Key rules** (`docs/integrations/telegram.md`, ADR-0014/0035/0036/0037/0038):

- The adapter holds **no business logic** and **no in-memory conversation state**.
  `features/telegram/bot/composer.ts` maps updates to use-case calls and renders replies —
  every real decision (authorization, Template/Job state, validation) happens inside the
  use case it calls.
- **Cross-feature `use-cases` imports are deliberate here** — this feature imports
  directly from `features/jobs/use-cases`, `features/templates/use-cases`, and
  `features/files/use-cases`, the one place in the codebase that pattern is expected
  (see `docs/architecture/project-structure.md` §3). Telegram is a second entry point
  onto those same application services, not a competing implementation.
- Wizard state is **durable** — a `TelegramWizardState` row, keyed by Telegram user id,
  with an explicit `step` enum and lazy TTL expiration (`TELEGRAM_WIZARD_TTL_MINUTES`).
  Every step change is one atomic conditional `UPDATE ... WHERE step IN (fromSteps)`,
  protecting against duplicate/racing Telegram updates the same way `Job.state`
  transitions do.
- Telegram users resolve to a real `User` (`resolveTelegramIdentity`) and get the
  **identical** role + department authorization as the web UI — never a bypass. Identity
  linking is phone-based and unique (`User.phone`/`User.telegramUserId`), matching only a
  **self**-shared Telegram contact.

## Contents

```
domain/       wizard.ts (TelegramWizardFlow/Step, WizardSlot, advanceTrackCursor — the
              pure function that lets Single Track and Album share one collection loop),
              callback-data.ts (encode/decode stable action codes), phone.ts (normalizePhone)
schemas/      wizard-payload.schema.ts — validates TelegramWizardState.payload on every
              read/write, reusing jobs' job-asset-input.schema.ts for tracks[][]
repository/   telegram-repository.ts — the only module querying User.phone/telegramUserId
              and the TelegramWizardState table; advanceWizardState is the atomic
              conditional-update primitive (mirrors job-repository.ts's transitionJobRow)
use-cases/    resolve-telegram-identity, link-telegram-account, load-active-wizard-state,
              pick-template, enter-collection-phase, set-delivery-choice, set-track-count,
              collect-asset-value, confirm-wizard, cancel-wizard,
              cancel-all-jobs-for-telegram (the one genuinely new piece of orchestration —
              loops the unmodified single-Job cancelJob, not a new Jobs bulk-cancel
              capability)
bot/          composer.ts (the Telegraf Composer/adapter — no business logic),
              register.ts (attaches the composer to the singleton bot exactly once),
              keyboards.ts / messages.ts (pure rendering), incoming.ts (downloads
              Telegram media into a transport-neutral IncomingAssetValue)
```

The Telegraf client singleton itself lives outside this feature, at
`@/server/adapters/telegram/client.ts` (mirrors `@/server/adapters/storage`'s split from
`features/files`). The webhook Route Handler is
`src/app/api/telegram/webhook/route.ts`, authenticated by
`@/server/telegram-webhook-auth`.

## Flows (implemented)

- **Single Track**: pick an `ACTIVE` template (`getTemplateForJobForm`) → ask delivery
  choice → collect every slot value, one message at a time → confirm → `createJob`.
- **Album**: pick template → ask track count (1–20) → repeat Single Track's exact
  per-slot collection loop once per track (`advanceTrackCursor`) → confirm → `createJob`
  once per track. No grouping entity — independent Jobs (resolves OD-12).
- **List Jobs / Job detail / Retry / Cancel**: `listDepartmentJobs`/`getJob`/`retryJob`/
  `cancelJob`, unmodified.
- **Cancel All**: `cancelAllJobsForTelegram` — department-scoped, cancelable-state Jobs
  only (the direct fix for a real legacy security bug: unscoped system-wide cancel).

**Not built, deliberately:** outbound Job-lifecycle notifications (Rendered/Uploaded/
Error DMs — no trigger point exists yet, no durable delivery mechanism, OD-40 stays
open), `deliverToTelegram` as a Job field, Telegram-specific aspect-ratio validation
(matches the dashboard — OD-14 stays open), any Template-authoring surface via Telegram,
a self-service phone-editing UI (Users-feature scope — see ADR-0036).
