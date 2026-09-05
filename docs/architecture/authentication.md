# Authentication

**`DECIDED` — implemented in Phase 2.** Resolves **OD-43** (session/auth library) and is
recorded as **ADR-0020**. This page documents what actually runs; the boundary contract
(where `getCurrentUser()` lives, what it must never do) is in
[authentication-boundary.md](authentication-boundary.md) and is unchanged by this phase —
every caller already used `getCurrentUser()` / `requireUser()`, and nothing outside
`@/server/auth` needed to change when the real backend landed.

## Mechanism

Custom, DB-backed sessions with an opaque bearer token in an httpOnly cookie. **No
NextAuth/Auth.js, no JWT.**

```
Browser                          Server
┌──────────────┐   Cookie:        ┌────────────────────────────────────┐
│ studio_session│ ───────────────▶│ SHA-256(token) → Session.tokenHash  │
│ = <raw token> │                 │  lookup, join User + Department     │
└──────────────┘                 └────────────────────────────────────┘
```

- **Issuing a session** (`createSession` in `src/server/auth/session.ts`): generate 32
  random bytes (`node:crypto randomBytes`), base64url-encode them as the raw token, hash
  it with SHA-256, store `{ tokenHash, userId, expiresAt }` in the `Session` table, and
  return the raw token to the caller so it can be set as a cookie. **The raw token is
  never persisted anywhere** — only its hash.
- **Resolving a session** (`resolveSession`): hash the incoming cookie value and look up
  that hash. A match resolves only if `expiresAt` is in the future **and** the joined
  `User.status === "ACTIVE"`. Anything else — no cookie, unknown hash, expired, or a
  disabled user — resolves to nothing, uniformly, at `@/server/auth/current-user`
  (`getCurrentUser()` returns `null`).
- **Ending a session** (`endSession` / logout): delete the `Session` row by its token
  hash. Immediate and server-authoritative — there is no client-only "forget the cookie"
  logout path.

### Why not a signed JWT

A signed/stateless token (JWT) can't be revoked without an extra blocklist — the exact
mechanism the DB-session approach doesn't need. With an opaque token + server-side lookup:

- **Logout is real deletion**, not "hope the client discards it."
- **Disabling a user takes effect on every existing session immediately** (Security
  Requirements §1, §2), because the same query that resolves a session also checks
  `status`. No separate revocation sweep, no stale-session window.
- **No `SESSION_SECRET` is needed.** A JWT's security rests entirely on the signing key;
  ours rests on the token being unguessable (32 random bytes) and the hash lookup failing
  for anything else. A tampered cookie value just doesn't match a row — it doesn't forge
  a session the way a stolen/derived JWT signing key would.

The trade-off is a database read per request to resolve identity (mitigated by React
`cache()` de-duping it once per request) — an acceptable cost for a panel application,
and the safer default for something this security-sensitive.

## Password hashing

`src/server/auth/password.ts` — **bcrypt via `bcryptjs`** (cost factor 12). `bcryptjs` is
a well-established, dependency-free, pure-JavaScript implementation: no native build step,
so it installs identically in every environment this app runs in (a real concern in a
constrained/sandboxed build environment). No custom cryptography was written.

- `hashPassword(plainText)` → stored `passwordHash`. Never logged, never returned from a
  repository read used outside the auth feature, never sent to a client component.
- `verifyPassword(plainText, hash)` → boolean, via `bcrypt.compare`.
- **Timing side-channel guard:** when no user matches the submitted email, `signIn` still
  calls `verifyPassword` — against a fixed, precomputed `UNKNOWN_USER_DUMMY_HASH` — instead
  of short-circuiting. Skipping the bcrypt comparison entirely on an unknown email would
  make that path measurably faster than "known email, wrong password," which is enough of
  a signal to enumerate valid accounts over many requests.

## Login flow

```
SignInForm (client)
    │  signInAction({ email, password })
    ▼
signInAction  — defineAction, auth: "public"
    │  1. parseInput(signInSchema)         (Zod — always runs first)
    │  2. signIn(input)                     (use case)
    │  3. setSessionCookie(session)         (only on success)
    ▼
signIn (use case, src/features/auth/use-cases/sign-in.ts)
    │  find user by email (features/users repository)
    │  verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH)
    │  reject unless: user exists AND password valid AND status === ACTIVE
    │  → same generic error for all three failure causes
    ▼
createSession(user.id)  →  { token, expiresAt }
```

- **One generic failure message** ("Invalid email or password.") for an unknown email, a
  wrong password, **and** a disabled account. Security Requirements §1 explicitly asks to
  avoid "email does not exist" / "password is incorrect"; Phase 2 extends the same
  reasoning to account status — a disabled user gets no signal that their account exists
  and is merely disabled.
- **Cookie writes happen in the Server Action, not the use case.** Use cases never import
  `next/*` request APIs (project-structure.md); `signIn` returns the issued session as
  plain data, and `signInAction` calls `setSessionCookie`.
- **No `redirect()` inside the action.** `defineAction`'s `catch` would intercept Next's
  internal `NEXT_REDIRECT` throw and turn it into an error result. The action returns
  `{ redirectTo: "/" }` on success; the client component navigates
  (`router.push` + `router.refresh()`) after checking `result.ok`.
- Validation is Zod (`signInSchema`), shared between the client form (UX only) and the
  Server Action (authoritative) — [`conventions.md`](../development/conventions.md) §5.

## Logout flow

`signOutAction` (`auth: "public"` — signing out must succeed even against an
already-invalid session): read the cookie token, delete the matching `Session` row
(`signOut` use case → `endSession`), clear the cookie, return `{ redirectTo: "/sign-in"
}`. The client redirects and calls `router.refresh()` so the dashboard layout (which reads
`getCurrentUser()` on every request) re-evaluates and bounces to `/sign-in`.

## Current user & the authenticated shell

- `getCurrentUser()` (`@/server/auth/current-user`) — reads the cookie, resolves the
  session, returns a minimal `CurrentUser` (`id`, `role`, `departmentId`, `displayName`,
  `email`) or `null`. Wrapped in React `cache()`.
- `src/app/(dashboard)/layout.tsx` calls `getCurrentUser()` and `redirect("/sign-in")` on
  `null`. Every route under the `(dashboard)` group is therefore protected by one check at
  the layout, not repeated per page (CLAUDE.md: "do not duplicate authentication checks").
- `src/app/(auth)/sign-in/page.tsx` does the inverse: an already-authenticated visitor is
  redirected to `/`.
- The resolved user is passed down as a plain, minimal prop (`{ displayName, email, role
}`) to `AppSidebar` — not the full `CurrentUser` type — so the client component never
  imports anything from `@/server/*` (ESLint-enforced boundary,
  [server-client-boundary.md](server-client-boundary.md)).
- The sidebar footer shows the real signed-in user (initials, name, email, role badge) and
  a **Sign out** action — replacing Phase 1's static "Not signed in" placeholder.

## Caching

`src/app/(dashboard)/layout.tsx` and `src/app/(auth)/sign-in/page.tsx` both call
`cookies()` (via `getCurrentUser`), which opts the whole route into Next.js's dynamic
rendering — confirmed in the production build output (every dashboard route and
`/sign-in` are marked `ƒ (Dynamic)`, none `○ (Static)`). Session-dependent HTML is
therefore never served from a shared/static cache. The session cookie itself is set with
`Cache-Control` left at Next's per-request default for dynamic routes (`private, no-cache,
no-store, must-revalidate` — verified in the manual scenario run below), so an
intermediate cache cannot serve one user's authenticated page to another.

## What Phase 2 deliberately does not do

- **No authorization matrix.** `@/server/authz`'s `authorize()` still allows `ADMIN` only,
  exactly as Phase 1 left it — Phase 3's job. Phase 2 only makes sure the `Actor` it
  receives (`userId`, `role`, `departmentId`) is real, not that every capability is
  correctly gated.
- **No user management** (create/disable/role-change) — the schema and the "disabled users
  can't authenticate" guarantee exist; the UI/use cases to disable someone do not.
- **No "remember me" / multi-device session listing** — a single fixed-duration session
  per login. `Session.userId` is indexed so a future "sign out everywhere" feature doesn't
  need a schema change.
- **No rate limiting on login** — Security Requirements §10 flags this as needed; the
  mechanism is still OPEN DECISION OD-41 and is not implemented here.

## Verification

Manually verified against a real PostgreSQL instance and a real (`next build` +
`next start`) server:

| Scenario                                              | Result                                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1. Valid login (active user, correct password)        | `signIn` issues a session; `resolveSession` returns the user.                                |
| 2. Invalid password                                   | Generic "Invalid email or password."; no session created.                                    |
| 3. Unknown email                                      | Same generic message; no session created.                                                    |
| 4. Disabled user, correct password                    | Same generic message; no session created.                                                    |
| 5. Logout                                             | Session row deleted; the same token no longer resolves.                                      |
| 6. Unauthenticated dashboard access (`GET /`)         | `307` redirect to `/sign-in`, `Cache-Control: private, no-cache, no-store, must-revalidate`. |
| 7. Authenticated reload (`GET /` with a valid cookie) | `200`, dashboard renders with the real user's name/email; `GET /sign-in` redirects to `/`.   |

Also covered by automated tests: `src/server/auth/password.test.ts` (hashing round-trip,
salting, the dummy hash never verifies), `src/server/auth/session.test.ts`
(create/resolve/expire/disable/end, mocked `db`), `src/features/auth/use-cases/
sign-in.test.ts` (all four outcomes above, mocked repository/session, including that the
unknown-email and wrong-password error messages are byte-for-byte identical).
