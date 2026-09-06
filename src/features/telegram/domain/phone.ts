/**
 * Pure phone-number normalization for Telegram account linking
 * (docs/domain/users.md "Telegram linkage", ADR-0036). No I/O, no Prisma
 * import — mirrors every other feature's `domain/` layer.
 *
 * Deliberately not a full phone-parsing library (no `libphonenumber` — that
 * would be a dependency for a single narrow comparison). The rule is simple
 * and stated once: strip everything but digits. Whoever sets a `User.phone`
 * (today: `prisma db seed` / a direct administrative write — there is no
 * profile-editing UI yet) and Telegram's own "share contact" value both pass
 * through this same function before being compared, so as long as both are
 * entered with the same country-code convention (e.g. always with the
 * country code, no leading `0` trunk prefix), a match is exact. This is a
 * known, accepted limitation, not a general phone-number solution.
 */
export function normalizePhone(raw: string): string | null {
  const digitsOnly = raw.replace(/\D/g, "");
  return digitsOnly.length > 0 ? digitsOnly : null;
}
