'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AddToCalendar from '@/components/AddToCalendar';
import { MediaArtwork } from '@/components/MediaArtwork';
import MeetingSelectedPodcastCard from '@/components/MeetingSelectedPodcastCard';
import { UpcomingPodcastLink } from '@/components/UpcomingPodcastLink';
import { withBasePath } from '@/lib/base-path';
import { getCarveOutTypeLabel } from '@/lib/carveout-meta';
import { getMeetingPodcasts } from '@/lib/meeting-podcasts';
import { dedupePodcastsByContent } from '@/lib/podcast-dedupe';
import type { CarveOut, Meeting, Podcast, SessionMember } from '@/lib/types';

const PODCAST_LIBRARY_HREF = '/podcasts?tab=library';
const PODCAST_RANK_HREF = '/podcasts?tab=rank';
const PODCAST_SUBMIT_HREF = '/podcasts?tab=submit';
const CARVE_OUT_SHARE_HREF = '/carveouts?tab=share';
const MEETINGS_HREF = '/meetings';

type HomeAction = {
  kicker: string;
  title: string;
  detail: string;
  href: typeof PODCAST_RANK_HREF | typeof MEETINGS_HREF | typeof CARVE_OUT_SHARE_HREF | typeof PODCAST_SUBMIT_HREF;
  label: string;
  count: string;
};

function getActionTone(href: HomeAction['href']) {
  if (href === MEETINGS_HREF) return 'meetings';
  if (href === CARVE_OUT_SHARE_HREF) return 'carveouts';
  return 'podcasts';
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function isCompletedMeeting(meeting: Meeting) {
  if (meeting.status === 'completed') return true;
  if (meeting.status === 'scheduled') return false;
  if (meeting.completedAt) return true;
  return false;
}

export default function HomePage() {
  const [member, setMember] = useState<SessionMember | null>(null);
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [carveOuts, setCarveOuts] = useState<CarveOut[]>([]);
  const [fistBumpingId, setFistBumpingId] = useState<string | null>(null);
  const [showAllCarveOuts, setShowAllCarveOuts] = useState(false);
  const [showAllDiscussedPodcasts, setShowAllDiscussedPodcasts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [publicLibraryLoading, setPublicLibraryLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setPublicLibraryLoading(true);

      const me = await fetch(withBasePath('/api/auth/me'), { cache: 'no-store' });
      if (me.ok) {
        const mePayload = await me.json();
        const sessionMember = mePayload.member as SessionMember;
        setMember(sessionMember);
        const [podcastRes, meetingRes, carveOutRes] = await Promise.all([
          fetch(withBasePath('/api/podcasts'), { cache: 'no-store' }),
          fetch(withBasePath('/api/meetings'), { cache: 'no-store' }),
          fetch(withBasePath('/api/carveouts'), { cache: 'no-store' })
        ]);

        if (podcastRes.ok) {
          setPodcasts(await podcastRes.json());
        } else {
          setPodcasts([]);
        }

        if (meetingRes.ok) {
          setMeetings(await meetingRes.json());
        } else {
          setMeetings([]);
        }

        if (carveOutRes.ok) {
          setCarveOuts(await carveOutRes.json());
        } else {
          setCarveOuts([]);
        }
        setPublicLibraryLoading(false);
      } else {
        setMember(null);
        setMeetings([]);
        setLoading(false);

        const [podcastRes, carveOutRes] = await Promise.all([
          fetch(withBasePath('/api/podcasts'), { cache: 'no-store' }),
          fetch(withBasePath('/api/carveouts'), { cache: 'no-store' })
        ]);

        if (podcastRes.ok) {
          setPodcasts(await podcastRes.json());
        } else {
          setPodcasts([]);
        }

        if (carveOutRes.ok) {
          setCarveOuts(await carveOutRes.json());
        } else {
          setCarveOuts([]);
        }
        setPublicLibraryLoading(false);
      }

      setLoading(false);
    }

    void loadData();
  }, []);

  const nextMeeting = useMemo(() => {
    return meetings
      .filter((meeting) => !isCompletedMeeting(meeting))
      .sort((a, b) => +new Date(a.date) - +new Date(b.date))[0];
  }, [meetings]);
  const podcastsById = useMemo(() => new Map(podcasts.map((podcast) => [podcast._id, podcast])), [podcasts]);
  const nextMeetingPodcasts = useMemo(
    () => (nextMeeting ? getMeetingPodcasts(nextMeeting, podcastsById) : []),
    [nextMeeting, podcastsById]
  );

  const pending = useMemo(() => podcasts.filter((podcast) => podcast.status === 'pending'), [podcasts]);
  const podcastsToDiscuss = useMemo(() => {
    const assignedPodcastIds = new Set(
      meetings
        .filter((meeting) => !isCompletedMeeting(meeting))
        .flatMap((meeting) => getMeetingPodcasts(meeting).map((podcast) => podcast._id))
        .filter((podcastId): podcastId is string => Boolean(podcastId))
    );

    return dedupePodcastsByContent(
      pending
      .filter((podcast) => !assignedPodcastIds.has(podcast._id))
      .sort((a, b) => {
        if (b.rankingScore !== a.rankingScore) return b.rankingScore - a.rankingScore;
        return a.title.localeCompare(b.title);
      })
    );
  }, [pending, meetings]);
  const recentPodcastsToDiscuss = useMemo(() => podcastsToDiscuss.slice(0, 3), [podcastsToDiscuss]);

  const podcastsToRank = useMemo(() => {
    if (!member) return [];
    return pending.filter((podcast) => {
      const myRating = podcast.ratings.find((rating) => rating.member._id === member._id);
      return !myRating || myRating.value === 'No selection';
    });
  }, [pending, member]);
  const recentPodcastsToRank = useMemo(() => podcastsToRank.slice(0, 3), [podcastsToRank]);

  const recentCarveOuts = useMemo(() => {
    return [...carveOuts]
      .sort((a, b) => +new Date(b.meeting.date) - +new Date(a.meeting.date))
      .slice(0, 3);
  }, [carveOuts]);

  const allCarveOuts = useMemo(() => {
    return [...carveOuts].sort((a, b) => +new Date(b.meeting.date) - +new Date(a.meeting.date));
  }, [carveOuts]);
  const remainingCarveOuts = useMemo(() => allCarveOuts.slice(3), [allCarveOuts]);
  const previouslyDiscussed = useMemo(
    () => podcasts.filter((podcast) => podcast.status === 'discussed'),
    [podcasts]
  );
  const allDiscussedPodcasts = useMemo(() => {
    return [...previouslyDiscussed].sort((a, b) => {
      const aTime = a.discussedMeetingDate ? +new Date(a.discussedMeetingDate) : 0;
      const bTime = b.discussedMeetingDate ? +new Date(b.discussedMeetingDate) : 0;
      if (bTime !== aTime) return bTime - aTime;
      return a.title.localeCompare(b.title);
    });
  }, [previouslyDiscussed]);
  const recentDiscussedPodcasts = useMemo(() => {
    return allDiscussedPodcasts.slice(0, 3);
  }, [allDiscussedPodcasts]);
  const remainingDiscussedPodcasts = useMemo(() => allDiscussedPodcasts.slice(3), [allDiscussedPodcasts]);
  const displayMemberName = (person: { _id: string; name: string }) =>
    member && person._id === member._id ? 'You' : person.name;
  const primaryAction: HomeAction = (() => {
    if (podcastsToRank.length > 0) {
      return {
        kicker: 'Priority',
        title: 'Rank podcasts',
        detail: `${podcastsToRank.length} podcast${podcastsToRank.length === 1 ? ' needs' : 's need'} your rating.`,
        href: PODCAST_RANK_HREF,
        label: 'Start Ranking',
        count: `${podcastsToRank.length} left`
      };
    }

    if (nextMeeting) {
      return {
        kicker: 'Up next',
        title: 'View the next meeting',
        detail: `${formatDate(nextMeeting.date)} with ${displayMemberName(nextMeeting.host)}.`,
        href: MEETINGS_HREF,
        label: 'View Meeting',
        count:
          getMeetingPodcasts(nextMeeting, podcastsById).length > 0
            ? `${getMeetingPodcasts(nextMeeting, podcastsById).length} podcasts`
            : 'TBD'
      };
    }

    if (recentCarveOuts.length === 0) {
      return {
        kicker: 'Start sharing',
        title: 'Share a carve out',
        detail: 'Add a book, article, video, or idea that landed with you.',
        href: CARVE_OUT_SHARE_HREF,
        label: 'Share Carve Out',
        count: 'New'
      };
    }

    return {
      kicker: 'Keep it moving',
      title: 'Submit a podcast',
      detail: 'Add something for the club to consider next.',
      href: PODCAST_SUBMIT_HREF,
      label: 'Submit Podcast',
      count: 'Next'
    };
  })();
  const isCurrentMemberHost = (meeting: Meeting) => Boolean(member && meeting.host._id === member._id);
  const hasFistBumped = (carveOut: CarveOut) =>
    Boolean(member && carveOut.fistBumps?.some((entry) => entry.member._id === member._id));
  const canFistBump = (carveOut: CarveOut) =>
    Boolean(member && carveOut.member._id !== member._id && !hasFistBumped(carveOut));
  const canRemoveFistBump = (carveOut: CarveOut) =>
    Boolean(member && carveOut.member._id !== member._id && hasFistBumped(carveOut));
  const getFistBumpNames = (carveOut: CarveOut) =>
    (carveOut.fistBumps || []).map((entry) => displayMemberName(entry.member));
  const getInitials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');
  const formatFistBumps = (carveOut: CarveOut) => {
    const names = getFistBumpNames(carveOut);
    if (names.length === 0) return 'No fist bumps yet.';
    if (names.length === 1) return `Fist bumped by ${names[0]}.`;
    if (names.length === 2) return `Fist bumped by ${names[0]} and ${names[1]}.`;
    return `Fist bumped by ${names[0]}, ${names[1]}, and ${names.length - 2} others.`;
  };
  const formatPublicFistBumps = (carveOut: CarveOut) => {
    const count = carveOut.fistBumps?.length || 0;
    if (count === 0) return 'No fist bumps yet.';
    if (count === 1) return '1 fist bump';
    return `${count} fist bumps`;
  };
  const getUrlLabel = (value: string) => {
    try {
      return new URL(value).hostname.replace(/^www\./, '');
    } catch {
      return value;
    }
  };
  async function giveFistBump(carveOutId: string) {
    setFistBumpingId(carveOutId);

    try {
      const res = await fetch(withBasePath(`/api/carveouts/${carveOutId}/fist-bump`), {
        method: 'POST'
      });

      const payload = (await res.json().catch(() => null)) as (CarveOut & { message?: string }) | null;
      if (!res.ok || !payload) return;

      setCarveOuts((prev) => prev.map((carveOut) => (carveOut._id === carveOutId ? payload : carveOut)));
    } finally {
      setFistBumpingId(null);
    }
  }

  async function removeFistBump(carveOutId: string) {
    setFistBumpingId(carveOutId);

    try {
      const res = await fetch(withBasePath(`/api/carveouts/${carveOutId}/fist-bump`), {
        method: 'DELETE'
      });

      const payload = (await res.json().catch(() => null)) as (CarveOut & { message?: string }) | null;
      if (!res.ok || !payload) return;

      setCarveOuts((prev) => prev.map((carveOut) => (carveOut._id === carveOutId ? payload : carveOut)));
    } finally {
      setFistBumpingId(null);
    }
  }

  function renderFistBumpStrip(carveOut: CarveOut, interactive: boolean) {
    const names = getFistBumpNames(carveOut);
    const visibleNames = names.slice(0, 3);
    const extraCount = Math.max(0, names.length - visibleNames.length);

    return (
      <div className="carveout-appreciation-strip">
        {interactive ? (
          carveOut.member._id !== member?._id ? (
            <button
              type="button"
              className={`fist-bump-pill${hasFistBumped(carveOut) ? ' is-sent' : ''}`}
              onClick={() => (hasFistBumped(carveOut) ? removeFistBump(carveOut._id) : giveFistBump(carveOut._id))}
              disabled={(!canFistBump(carveOut) && !canRemoveFistBump(carveOut)) || fistBumpingId === carveOut._id}
            >
              <span className="fist-bump-pill-mark" aria-hidden="true">
                👊
              </span>
              <span>
                {fistBumpingId === carveOut._id
                  ? 'Sending...'
                  : hasFistBumped(carveOut)
                    ? 'Undo fist bump'
                    : 'Give fist bump'}
              </span>
            </button>
          ) : (
            <div className="fist-bump-owner-note">Your carve out</div>
          )
        ) : (
          <div className="fist-bump-owner-note">Club appreciation</div>
        )}

        <div className="carveout-fist-bumps-meta">
          {interactive && names.length > 0 ? (
            <div className="fist-bump-avatar-row" aria-hidden="true">
              {visibleNames.map((name) => (
                <span key={`${carveOut._id}-${name}`} className="fist-bump-avatar">
                  {getInitials(name)}
                </span>
              ))}
              {extraCount > 0 ? <span className="fist-bump-avatar extra">+{extraCount}</span> : null}
            </div>
          ) : null}
          <p>{interactive ? formatFistBumps(carveOut) : formatPublicFistBumps(carveOut)}</p>
        </div>
      </div>
    );
  }

  function renderPublicPodcastCard(podcast: Podcast, keyPrefix: string) {
    return (
      <article className="public-library-card" key={`${keyPrefix}-${podcast._id}`}>
        <MediaArtwork
          url={podcast.link}
          title={podcast.title}
          kind="podcast"
          creator={podcast.host}
          className="public-card-artwork"
          fallback="🎧"
        />
        <div className="public-card-head">
          <div>
            <h3>{podcast.title}</h3>
            <p>{podcast.host || 'Podcast'}</p>
          </div>
          <span className="badge">Discussed</span>
        </div>

        <div className="podcast-detail-grid public-detail-grid">
          <div>
            <span>Discussed</span>
            <strong>{podcast.discussedMeetingDate ? formatDate(podcast.discussedMeetingDate) : 'Meeting date unavailable'}</strong>
          </div>
          <div>
            <span>Runtime</span>
            <strong>{podcast.totalTimeMinutes ? `${podcast.totalTimeMinutes} min` : 'Unknown'}</strong>
          </div>
          <div>
            <span>Episodes</span>
            <strong>{podcast.episodeCount || 'Unknown'}</strong>
          </div>
        </div>

        {podcast.episodeNames ? (
          <section className="public-copy-section">
            <span>Episode name{podcast.episodeCount === 1 ? '' : 's'}</span>
            <p>{podcast.episodeNames}</p>
          </section>
        ) : null}

        {podcast.notes ? (
          <section className="public-copy-section">
            <span>Notes</span>
            <p>{podcast.notes}</p>
          </section>
        ) : null}

        <a className="podcast-link-card" href={podcast.link} target="_blank" rel="noreferrer">
          <span>
            <strong>Open podcast</strong>
            <small>{getUrlLabel(podcast.link)}</small>
          </span>
          <span aria-hidden="true">&gt;</span>
        </a>
      </article>
    );
  }

  function renderPublicCarveOutCard(carveOut: CarveOut, keyPrefix: string) {
    return (
      <article className="public-library-card" key={`${keyPrefix}-${carveOut._id}`}>
        <MediaArtwork
          url={carveOut.url}
          title={carveOut.title}
          kind={carveOut.type}
          className="public-card-artwork"
          fallback="✦"
        />
        <div className="public-card-head">
          <div>
            <h3>{carveOut.title}</h3>
            <p>Shared with the club</p>
          </div>
          <div className="podcast-meta-row">
            <span className="badge">{getCarveOutTypeLabel(carveOut.type)}</span>
            {carveOut.service ? <span className="badge secondary-badge">{carveOut.service}</span> : null}
          </div>
        </div>

        <div className="podcast-detail-grid public-detail-grid">
          <div>
            <span>Meeting</span>
            <strong>{formatDate(carveOut.meeting.date)}</strong>
          </div>
          {carveOut.service ? (
            <div>
              <span>Service</span>
              <strong>{carveOut.service}</strong>
            </div>
          ) : null}
          <div>
            <span>Appreciation</span>
            <strong>{formatPublicFistBumps(carveOut)}</strong>
          </div>
        </div>

        {carveOut.notes ? (
          <section className="public-copy-section">
            <span>Why it landed</span>
            <p>{carveOut.notes}</p>
          </section>
        ) : null}

        {carveOut.url ? (
          <a className="carveout-link-row" href={carveOut.url} target="_blank" rel="noreferrer">
            <span>
              <strong>Open resource</strong>
              <small>{getUrlLabel(carveOut.url)}</small>
            </span>
            <span aria-hidden="true">&gt;</span>
          </a>
        ) : null}
      </article>
    );
  }

  if (loading) {
    return (
      <section className="page-stack">
        <div className="section-panel">
          <h2>Home</h2>
          <p>Loading...</p>
        </div>
      </section>
    );
  }

  if (!member) {
    return (
      <section className="public-home page-stack">
        <div className="section-panel command-panel public-welcome-panel">
          <div>
            <p className="section-kicker">The Society, upgraded</p>
            <div className="hero-heading-row">
              <h2>Find the next great conversation</h2>
              <span className="badge">New member experience</span>
            </div>
            <p className="muted-line">
              Meeting picks, voting, recommendations, listening styles, and the club archive now work together in one easier place.
            </p>
          </div>
          <div className="public-entry-actions">
            <Link className="action-link full-width-action" href="/login">
              Sign in with an email link
            </Link>
            <a className="ghost public-secondary-action" href="#club-archive">Explore the public archive</a>
          </div>
        </div>

        <div className="section-panel public-update-panel">
          <div className="section-title-row">
            <h2>What’s new</h2>
            <span className="badge">Built from member feedback</span>
          </div>
          <div className="public-update-grid">
            <article>
              <span className="public-update-icon" aria-hidden="true">🎧</span>
              <div><strong>Listen next</strong><small>Upcoming meeting episodes are prominent, pictured, and easy to tap on the go.</small></div>
            </article>
            <article>
              <span className="public-update-icon" aria-hidden="true">↕</span>
              <div><strong>Vote with confidence</strong><small>The active ballot now has a clear home, separate from past discussions.</small></div>
            </article>
            <article>
              <span className="public-update-icon" aria-hidden="true">✦</span>
              <div><strong>Find better episodes</strong><small>Suggestions explain the match and learn from each member’s reactions.</small></div>
            </article>
            <article>
              <span className="public-update-icon" aria-hidden="true">👊</span>
              <div><strong>Share what landed</strong><small>Artwork, carve-out filters, fist bumps, and flexible meeting feedback keep ideas moving.</small></div>
            </article>
          </div>
        </div>

        <div id="club-archive" className="section-panel public-library-panel discussed-card">
          <div className="section-title-row">
            <h2>Discussed Podcasts</h2>
            <span className="badge">{allDiscussedPodcasts.length}</span>
          </div>
          <p className="muted-line">Only completed discussions are public. Candidate podcasts stay private to members.</p>

          <div className="public-library-list">
            {publicLibraryLoading ? (
              <div className="empty-state">
                <span className="empty-state-kicker">Club archive</span>
                <h3>Loading discussed podcasts…</h3>
              </div>
            ) : recentDiscussedPodcasts.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-kicker">No archive yet</span>
                <h3>No discussed podcasts</h3>
                <p>Completed podcast discussions will appear here once the archive has entries.</p>
              </div>
            ) : null}
            {recentDiscussedPodcasts.map((podcast) => renderPublicPodcastCard(podcast, 'public-home-discussed'))}
          </div>

          {showAllDiscussedPodcasts ? (
            <div className="public-library-list public-expanded-list">
              {remainingDiscussedPodcasts.length === 0 ? <p>No additional previously discussed podcasts.</p> : null}
              {remainingDiscussedPodcasts.map((podcast) => renderPublicPodcastCard(podcast, 'public-home-discussed-all'))}
            </div>
          ) : null}

          {remainingDiscussedPodcasts.length > 0 ? (
            <button
              type="button"
              className="ghost public-show-all"
              onClick={() => setShowAllDiscussedPodcasts((prev) => !prev)}
            >
              {showAllDiscussedPodcasts ? 'Show Recent' : `Show All ${allDiscussedPodcasts.length}`}
            </button>
          ) : null}
        </div>

        <div className="section-panel public-library-panel carveouts-card">
          <div className="section-title-row">
            <h2>Carve Outs</h2>
            <span className="badge">{allCarveOuts.length}</span>
          </div>
          <p className="muted-line">Resources and ideas shared after meetings. Member names stay private; appreciation counts are public.</p>

          <div className="public-library-list">
            {publicLibraryLoading ? (
              <div className="empty-state">
                <span className="empty-state-kicker">Shared finds</span>
                <h3>Loading carve outs…</h3>
              </div>
            ) : recentCarveOuts.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-kicker">No shared finds yet</span>
                <h3>No carve outs</h3>
                <p>Shared resources will appear here after members add them to the club archive.</p>
              </div>
            ) : null}
            {recentCarveOuts.map((carveOut) => renderPublicCarveOutCard(carveOut, 'public-home-carveout'))}
          </div>

          {showAllCarveOuts ? (
            <div className="public-library-list public-expanded-list">
              {remainingCarveOuts.length === 0 ? <p>No additional carve outs.</p> : null}
              {remainingCarveOuts.map((carveOut) => renderPublicCarveOutCard(carveOut, 'public-home-carveout-all'))}
            </div>
          ) : null}

          {remainingCarveOuts.length > 0 ? (
            <button type="button" className="ghost public-show-all" onClick={() => setShowAllCarveOuts((prev) => !prev)}>
              {showAllCarveOuts ? 'Show Recent' : `Show All ${allCarveOuts.length}`}
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="home-dashboard page-stack">
      {nextMeeting && nextMeetingPodcasts.length > 0 ? (
        <div className="section-panel command-panel listen-next-panel" data-tone="meetings">
          <div className="listen-next-heading">
            <div>
              <p className="section-kicker">For the next meeting</p>
              <div className="hero-heading-row">
                <h2>Listen next</h2>
                <span className="badge">
                  {nextMeetingPodcasts.length} podcast{nextMeetingPodcasts.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="muted-line">
                {formatDate(nextMeeting.date)} with {displayMemberName(nextMeeting.host)}.
              </p>
            </div>
          </div>
          <div className="upcoming-podcast-list" aria-label="Podcasts for the next meeting">
            {nextMeetingPodcasts.map((podcast, index) => (
              <UpcomingPodcastLink key={podcast._id} podcast={podcast} position={index + 1} />
            ))}
          </div>
          <Link className="listen-next-meeting-link" href="/meetings">
            <span>
              <strong>View meeting details</strong>
              <small>Host, location, calendar, and full notes</small>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : (
        <div className="section-panel command-panel" data-tone={getActionTone(primaryAction.href)}>
          <div>
            <p className="section-kicker">{primaryAction.kicker}</p>
            <div className="hero-heading-row">
              <h2>{primaryAction.title}</h2>
              <span className="badge">{primaryAction.count}</span>
            </div>
            <p className="muted-line">{primaryAction.detail}</p>
          </div>
          <Link className="action-link full-width-action" href={primaryAction.href} data-tone={getActionTone(primaryAction.href)}>
            {primaryAction.label}
          </Link>
        </div>
      )}

      <div className="section-panel todo-panel">
        <div className="section-title-row">
          <h2>Quick Actions</h2>
          <span className="badge">{podcastsToRank.length} to rank</span>
        </div>
        <div className="todo-list">
          <Link
            className={`todo-row${podcastsToRank.length > 0 ? ' primary' : ''}`}
            href={PODCAST_RANK_HREF}
            data-tone="podcasts"
          >
            <span>
              <strong>{podcastsToRank.length > 0 ? 'Rank podcasts' : 'Ranking complete'}</strong>
              <small>
                {podcastsToRank.length > 0
                  ? `${podcastsToRank.length} podcast${podcastsToRank.length === 1 ? ' needs' : 's need'} your rating.`
                  : 'Browse candidates or add something new.'}
              </small>
            </span>
            <span aria-hidden="true">&gt;</span>
          </Link>
          <Link className="todo-row" href={MEETINGS_HREF} data-tone="meetings">
            <span>
              <strong>{nextMeeting ? 'View meeting' : 'Meetings'}</strong>
              <small>{nextMeeting ? `${formatDate(nextMeeting.date)} is next.` : 'Review meeting history.'}</small>
            </span>
            <span aria-hidden="true">&gt;</span>
          </Link>
          <Link className="todo-row" href={PODCAST_SUBMIT_HREF} data-tone="podcasts">
            <span>
              <strong>Submit a podcast</strong>
              <small>Add something for the club to consider.</small>
            </span>
            <span aria-hidden="true">&gt;</span>
          </Link>
          <Link className="todo-row" href={CARVE_OUT_SHARE_HREF} data-tone="carveouts">
            <span>
              <strong>Share a carve out</strong>
              <small>Post something that made an impact.</small>
            </span>
            <span aria-hidden="true">&gt;</span>
          </Link>
        </div>
      </div>

      <div className="dashboard-hero section-panel">
        <p className="section-kicker">Next Meeting</p>
        {nextMeeting ? (
          <>
            <div className="hero-heading-row">
              <h2>{formatDate(nextMeeting.date)}</h2>
              {isCurrentMemberHost(nextMeeting) ? <span className="badge">Host</span> : null}
            </div>
            <div className="hero-meta-grid">
              <div>
                <span>Host</span>
                <strong>{displayMemberName(nextMeeting.host)}</strong>
              </div>
              <div>
                <span>Podcasts</span>
                <strong>{nextMeetingPodcasts.length > 0 ? nextMeetingPodcasts.length : 'TBD'}</strong>
              </div>
            </div>
            <p className="location-line">{nextMeeting.location}</p>
            <AddToCalendar meeting={nextMeeting} podcastsById={podcastsById} />
            {nextMeetingPodcasts.length > 0 ? (
              <div className="meeting-selected-podcast-list">
                {nextMeetingPodcasts.map((podcast) => (
                  <MeetingSelectedPodcastCard key={podcast._id} podcast={podcast} currentMember={member} />
                ))}
              </div>
            ) : (
              <p className="muted-line">Awaiting host podcast picks.</p>
            )}
            <Link className="action-link full-width-action" href="/meetings" data-tone="meetings">
              View Meeting
            </Link>
          </>
        ) : (
          <>
            <h2>No meeting scheduled</h2>
            <p className="muted-line">Check the meetings page for past discussions or schedule the next one.</p>
            <Link className="action-link full-width-action" href="/meetings" data-tone="meetings">
              View Meetings
            </Link>
          </>
        )}
      </div>

      {podcastsToRank.length > 0 ? (
        <div className="section-panel podcasts-to-rank-card">
          <div className="section-title-row">
            <h2>Up Next to Rank</h2>
            <Link href={PODCAST_RANK_HREF}>Rank All</Link>
          </div>
          <div className="compact-list">
            {recentPodcastsToRank.map((podcast) => (
              <Link key={`rank-queue-${podcast._id}`} className="compact-row" href={PODCAST_RANK_HREF}>
                <span>
                  <strong>{podcast.title}</strong>
                  <small>
                    {podcast.totalTimeMinutes ? `${podcast.totalTimeMinutes} min` : podcast.host || 'Unknown host'}
                    {podcast.episodeNames ? ` | ${podcast.episodeNames}` : ''}
                  </small>
                </span>
                <span aria-hidden="true">&gt;</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="section-panel carveouts-card">
        <div className="section-title-row">
          <h2>Recent Carve Outs</h2>
          <Link href="/carveouts">View All</Link>
        </div>
        <div className="compact-list">
          {recentCarveOuts.length === 0 ? <p>No recent carve outs.</p> : null}
          {recentCarveOuts.map((carveOut) => (
            <div className="compact-card" key={carveOut._id}>
              <div className="compact-card-head">
                <h3>{carveOut.title}</h3>
                <div className="podcast-meta-row">
                  <span className="badge">{getCarveOutTypeLabel(carveOut.type)}</span>
                  {carveOut.service ? <span className="badge secondary-badge">{carveOut.service}</span> : null}
                </div>
              </div>
              <p>
                Shared by {displayMemberName(carveOut.member)} for {formatDate(carveOut.meeting.date)}
              </p>
              {carveOut.service ? <p>Found on {carveOut.service}.</p> : null}
              {carveOut.notes ? <p>{carveOut.notes}</p> : null}
              {renderFistBumpStrip(carveOut, true)}
            </div>
          ))}
        </div>
      </div>

      <div className="section-panel podcasts-to-discuss-card">
        <div className="section-title-row">
          <h2>Top Podcast Candidates</h2>
          <Link href={PODCAST_LIBRARY_HREF}>View All</Link>
        </div>
        <div className="compact-list">
          {recentPodcastsToDiscuss.length === 0 ? <p>No podcasts to discuss yet.</p> : null}
          {recentPodcastsToDiscuss.map((podcast) => (
            <Link key={podcast._id} className="compact-row" href={PODCAST_LIBRARY_HREF}>
              <span>
                <strong>{podcast.title}</strong>
                <small>
                  Score {podcast.rankingScore}
                  {podcast.missingVoters.length > 0 ? ` | Missing ${podcast.missingVoters.length}` : ' | Fully rated'}
                </small>
              </span>
              <span aria-hidden="true">&gt;</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="section-panel discussed-card">
        <div className="section-title-row">
          <h2>Recently Discussed Podcasts</h2>
          <Link href={PODCAST_LIBRARY_HREF}>View Library</Link>
        </div>
        <div className="compact-list">
          {recentDiscussedPodcasts.length === 0 ? <p>No recent discussed podcasts yet.</p> : null}
          {recentDiscussedPodcasts.map((podcast) => (
            <Link key={`home-discussed-${podcast._id}`} className="compact-row" href={PODCAST_LIBRARY_HREF}>
              <span>
                <strong>{podcast.title}</strong>
                <small>{podcast.discussedMeetingDate ? formatDate(podcast.discussedMeetingDate) : 'Meeting unknown'}</small>
              </span>
              <span aria-hidden="true">&gt;</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
