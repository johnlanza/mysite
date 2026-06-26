# Podcast Club

## Source Of Truth

- Active development path: `/Users/johnlanza/Dev/mySite/podcast_club`
- Canonical git/deploy source: `johnlanza/mysite` (`main`)
- Render production service: `mysite`
- Render staging model: full `mysite` service, with Podcast Club served at `/podcastclub`
- `/Users/johnlanza/Dev/podcast_club` should resolve to this folder; do not create or deploy from a separate standalone copy.

Podcast Club web app with email/password auth, ranked voting, admin-managed meetings, and carve outs.

## Features

- Email/password authentication with secure HTTP-only session cookies
- First-user bootstrap registration creates the initial admin account
- Admin-managed member creation (with address and admin flag)
- Podcast submission by authenticated members
- Ranked voting based on your Google Sheet rules
  - `I like it a lot.` = 2 points
  - `I like it.` = 1 point
  - `Meh` / `My podcast` / `No selection` = 0 points
- Pending podcast ordering mirrors sheet behavior:
  - missing voters first
  - then ranking score descending
  - then title ascending
- Manual meeting scheduling/logging by admin only
- Home dashboard with next meeting plus discussed/pending podcast views
- Carve Out entries tied to both member and meeting

## Stack

- Next.js 16 (App Router, TypeScript)
- MongoDB Atlas via Mongoose
- `bcryptjs` for password hashing

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

Required vars:

- `MONGODB_URI`
- `MYSITE_SESSION_KEY`

Optional:

- `MONGODB_DB` (defaults to `podcast_club`)
- `MYSITE_SESSION_COOKIE` (defaults to `mysite_session`)
- `APP_BASE_URL` (defaults to `http://localhost:3000`; used for password reset links)
- `NEXT_PUBLIC_BASE_PATH` (set to `/podcastclub` when deploying under a subpath like `johnlanza.com/podcastclub`)
- `RESEND_API_KEY` (if set, sends password reset emails through Resend)
- `EMAIL_FROM` (required with `RESEND_API_KEY`, e.g. `Podcast Club <no-reply@yourdomain.com>`)
- `OWNER_RECOVERY_CODE` (one-time emergency admin recovery code; rotate after use)

3. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Deploying Under `/podcastclub`

To deploy at `johnlanza.com/podcastclub`:

1. Set environment variable:

```bash
NEXT_PUBLIC_BASE_PATH=/podcastclub
```

2. Set `APP_BASE_URL` to your full public URL:

```bash
APP_BASE_URL=https://johnlanza.com/podcastclub
```

3. Rebuild and restart:

```bash
npm run build
npm run start
```

4. Configure your reverse proxy to forward `/podcastclub/*` to this Next.js app.

## Full `mysite` Render Staging

Use a separate personal Render staging service for `johnlanza/mysite`, not a business Render workspace, environment group, datastore, or API key. The staging service should mirror the full `mysite` app and serve Podcast Club at `/podcastclub`.

Staging service setup:

- Repository: `johnlanza/mysite`
- Branch: a staging/review branch, or `main` after the change is intentionally pushed
- Build command: same as production `mysite`
- Start command: same as production `mysite`
- Public Podcast Club URL: `https://<mysite-staging-host>/podcastclub`
- `NEXT_PUBLIC_BASE_PATH=/podcastclub`
- `APP_BASE_URL=https://<mysite-staging-host>/podcastclub`

Personal staging data boundaries:

- Use a staging/test MongoDB database for Podcast Club, never the production Podcast Club database.
- Use separate staging values for `MYSITE_SESSION_KEY`, `SESSION_KEY`, and `POOLARAMA_ADMIN_TOKEN`.
- Use separate personal Render environment groups/datastores from business services.
- Set `POOLARAMA_DISABLE_AUTO_SYNC=true` unless the staging run is intentionally testing Poolarama live sync.
- Do not point staging at business Render services, business API keys, or business data stores.

Minimum full-`mysite` staging env:

- Root app: `DB_URL`, `SESSION_KEY`
- Podcast Club: `MONGODB_URI`, `MYSITE_SESSION_KEY`, `APP_BASE_URL`, `NEXT_PUBLIC_BASE_PATH`
- Optional Podcast Club: `MONGODB_DB`, `MYSITE_SESSION_COOKIE`, `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_RECOVERY_CODE`
- Poolarama: `POOLARAMA_MONGODB_URI` or a safe staging `DB_URL`, `POOLARAMA_DB_NAME`, `POOLARAMA_ADMIN_TOKEN`, `POOLARAMA_DISABLE_AUTO_SYNC`

## Render Preview/Staging Verification

Use this flow before merging a branch that changes auth, podcast submission, carve-out submission, or shared API/database behavior. For the chosen full-`mysite` staging model, Podcast Club is verified at `/podcastclub`. Render PR service previews are temporary service instances with their own `onrender.com` URL, and they copy settings from the base service when they are first created. Point previews at staging/test MongoDB databases before running this smoke test.

Preview or staging service env:

- `MONGODB_URI` for the staging/preview database
- `MYSITE_SESSION_KEY`
- `APP_BASE_URL` set to the full public preview/staging URL users open, including `/podcastclub`
- `NEXT_PUBLIC_BASE_PATH=/podcastclub`
- `MONGODB_DB` if the database name is not `podcast_club`
- `MYSITE_SESSION_COOKIE` only if the cookie name is not `mysite_session`

Local verification env:

- `RENDER_API_KEY`
- `RENDER_SERVICE_ID` for the preview or staging service being verified
- `PODCAST_CLUB_BASE_URL`, including `/podcastclub`
- `PODCAST_CLUB_EMAIL` and `PODCAST_CLUB_PASSWORD` for a non-production smoke-test member, or `PODCAST_CLUB_SESSION_COOKIE` with a valid cookie header
- Optional: `RENDER_DEPLOY_ID` to verify a specific deploy instead of the service's latest deploy

Run the full gate:

```bash
PODCAST_CLUB_BASE_URL=https://mysite-pr-123.onrender.com/podcastclub \
RENDER_API_KEY=... \
RENDER_SERVICE_ID=srv-... \
PODCAST_CLUB_EMAIL=smoke@example.com \
PODCAST_CLUB_PASSWORD=... \
npm run verify:render:preview
```

For a staging service, use the same env shape with the staging URL and service ID:

```bash
PODCAST_CLUB_BASE_URL=https://mysite-staging.onrender.com/podcastclub \
RENDER_API_KEY=... \
RENDER_SERVICE_ID=srv-... \
PODCAST_CLUB_EMAIL=smoke@example.com \
PODCAST_CLUB_PASSWORD=... \
npm run verify:render:staging
```

The wrapper first runs `render:status` with `RENDER_WAIT=1`, `RENDER_REQUIRED_STATUS=live`, and `RENDER_REQUIRE_SHA_MATCH=1`. It then runs `smoke:live`, which logs in, checks `/api/auth/me`, checks `/api/submission-health`, creates and verifies a temporary podcast, creates and verifies a temporary carve out against the first available meeting, then deletes both records.

Useful one-off commands:

```bash
RENDER_WAIT=1 RENDER_REQUIRED_STATUS=live RENDER_REQUIRE_SHA_MATCH=1 npm run render:status
PODCAST_CLUB_BASE_URL=https://mysite-staging.onrender.com/podcastclub npm run smoke:live
```

If Render does not expose a commit SHA for the target deploy, the full gate fails while `RENDER_REQUIRE_SHA_MATCH=1`. Only set `RENDER_REQUIRE_SHA_MATCH=0` after checking the deploy commit in the Render dashboard.

## Data Model

- `Member`: `name`, `email`, `passwordHash`, `address`, `isAdmin`
- `Podcast`: `title`, `link`, `description`, `submittedBy`, `ratings[]`, `status`, `discussedMeeting`
- `Meeting`: `date`, `host`, `podcast`, `location`, `notes`
- `CarveOut`: `title`, `type`, `url`, `notes`, `member`, `meeting`

## API Summary

- Auth:
  - `POST /api/auth/register` (first user bootstraps admin; otherwise requires one-time join code)
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
  - `GET /api/auth/setup-status`
  - `POST /api/auth/forgot-password`
  - `POST /api/auth/reset-password`
  - `POST /api/auth/emergency-recover` (one-time break-glass admin password reset using `OWNER_RECOVERY_CODE`)
- Join Codes:
  - `GET /api/join-codes` (admin)
  - `POST /api/join-codes` (admin)
- Password Reset Codes:
  - `POST /api/password-reset-codes` (admin; generates one-time reset code for a member)
- Members:
  - `GET /api/members` (authenticated)
  - `POST /api/members` (admin)
- Podcasts:
  - `GET /api/podcasts` (authenticated)
  - `POST /api/podcasts` (authenticated)
  - `POST /api/podcasts/:id/vote` (authenticated; saves rating)
- Meetings:
  - `GET /api/meetings` (authenticated)
  - `POST /api/meetings` (admin)
  - `PATCH /api/meetings/:id` (admin)
  - `DELETE /api/meetings/:id` (admin; past meetings require `confirmText: "DELETE"`)
  - `POST /api/meetings/:id/complete` (admin; archives scheduled meeting with notes)
- Carve Outs:
  - `GET /api/carveouts` (authenticated)
  - `POST /api/carveouts` (authenticated)
- Legacy Import:
  - `GET /api/imports/legacy-meetings` (admin; list import batch IDs)
  - `POST /api/imports/legacy-meetings` (admin; import historical meetings/podcasts from CSV)
  - `DELETE /api/imports/legacy-meetings` (admin; rollback a prior import batch)
  - `GET /api/imports/legacy-carveouts` (admin; list carve out import batch IDs)
  - `POST /api/imports/legacy-carveouts` (admin; import historical carve outs from CSV)
  - `DELETE /api/imports/legacy-carveouts` (admin; rollback a carve out import batch)
  - `GET /api/imports/legacy-pending-podcasts` (admin; list pending-podcast import batch IDs)
  - `POST /api/imports/legacy-pending-podcasts` (admin; import current pending podcasts from Wank-O-Matic CSV)
  - `DELETE /api/imports/legacy-pending-podcasts` (admin; rollback a pending-podcast import batch)
  - Admin UI: `/imports`

## Google Sheet Mapping

Your Apps Script logic is now mirrored conceptually in the app:

- ranking column -> `podcast.rankingScore` (sum of rating points)
- missing column -> `podcast.missingVoters`
- sort key behavior -> API sorting order for pending podcasts
- contributor selections -> `podcast.ratings[]` entries per member

Legacy CSV import is available via `POST /api/imports/legacy-meetings`.

Request body:

```json
{
  "csv": "Date,Host,Podcast,Podcast Link\\n2023-01-01,Jane,Example Show,https://example.com",
  "mapping": {
    "meetingDate": 0,
    "meetingHostName": 1,
    "podcastTitle": 2,
    "podcastHost": 3,
    "podcastEpisodeCount": 4,
    "podcastEpisodeNames": 5,
    "podcastTotalTimeMinutes": 6,
    "podcastLink": 7,
    "podcastNotes": 8,
    "podcastSubmittedByName": 1
  },
  "options": {
    "batchId": "legacy-2026-02-15",
    "dryRun": false
  }
}
```

Notes:
- Imported records are marked with `importBatchId` and `importSource`.
- Imported meetings are always saved as completed (`Past Meetings`), and imported podcasts as discussed (`Podcasts Previously Discussed`).
- Missing optional values are filled with safe defaults.
- Mapping accepts either CSV header names or zero-based column indexes.
- To rollback an import, call `DELETE /api/imports/legacy-meetings` with `{ \"batchId\": \"...\", \"confirmText\": \"DELETE\" }`.
