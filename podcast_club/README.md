# Podcast Club

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

- Next.js 14 (App Router, TypeScript)
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
- `SESSION_SECRET`

Optional:

- `MONGODB_DB` (defaults to `podcast_club`)
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
