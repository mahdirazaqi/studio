# feature: telegram

**Scope:** the Telegram bot — a conversational front-end for creating and monitoring
Jobs. A thin adapter that translates Telegram updates into use-case calls.

**Key rules** (`docs/integrations/telegram.md`, ADR-0014):

- The adapter holds **no business logic** and **no in-memory conversation state**.
- Wizard state is **durable** (a `TelegramWizardState` row), keyed by telegram user id,
  with a step field and a TTL sweep.
- Telegram users resolve to a real `User` and get the **identical** role + department
  authorization as the web UI — never a bypass.

**Not built yet.** Depends on the database layer, the jobs/templates/files features, and
the webhook-vs-polling decision (OPEN DECISION OD-34). The webhook Route Handler, if
chosen, lives at `src/app/api/telegram/webhook/route.ts` and uses `@/server/api`.

Will contain: `server/` (update parsing, identity resolution, wizard-state repo,
outbound notifications), `domain/` (wizard steps), `schemas/`.
