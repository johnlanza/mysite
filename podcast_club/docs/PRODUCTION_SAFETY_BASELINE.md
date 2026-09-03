# Podcast Club production safety baseline

This is the repeatable minimum release gate for the Royal Podcast Society. It intentionally separates read-only production verification from staging write tests.

## Before a production push

Run from `podcast_club/`:

```bash
npm ci
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Confirm the change is based on current `origin/main`, review the Podcast Club-only diff, and confirm no local secret or production-data export is tracked.

Email-producing events must have stable provider idempotency keys. Current covered events are new podcast submissions, meeting selection changes, weekly review reminders, one-time review reminders, and their admin reports.

## After Render deploys

Run the GET-only production regression and require the deployed commit:

```bash
npm run check:production -- https://www.johnlanza.com/podcastclub $(git rev-parse HEAD)
npm run check:database
```

These checks cover public pages, PWA assets, anonymous authorization boundaries, public archives, non-placeholder podcast durations, database referential integrity, and the Render commit exposed by `/api/health`. They never sign in, write records, or send email. `check:database` requires `MONGODB_URI` and prints counts and field types, never member details or credentials.

Authenticated create/update/delete flows belong on staging only. The existing `verify:render:staging` gate performs those writes against a staging database; production write smoke requires a separate explicit override and is not part of this baseline.

## Known production follow-ups (2026-09-03)

- One carve-out (`Secret Mall Apartment`) references a missing meeting and is omitted from the public archive. Repair requires explicit production-data approval.
- The production `PasswordResetToken.expiresAt` index is missing its declared TTL setting, leaving 12 expired-token records eligible for cleanup. Correcting the index is a separate database migration.
- Member weekly reminder keys include the temporary emergency lock applied during the duplicate-review-email incident. The next successful weekly claim is expected to normalize each value back to a string.
- Exact Render provenance was not externally observable before `/api/health`; releases after this baseline must prove the running commit through that endpoint.
