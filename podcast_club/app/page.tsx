'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AddToCalendar from '@/components/AddToCalendar';
import { MediaArtwork } from '@/components/MediaArtwork';
import { PodcastListenChooser } from '@/components/PodcastListenChooser';
import { UpcomingPodcastLink } from '@/components/UpcomingPodcastLink';
import { withBasePath } from '@/lib/base-path';
import { getCarveOutTypeLabel } from '@/lib/carveout-meta';
import type { IntelligenceRecommendation, IntelligenceReport } from '@/lib/intelligence';
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
  const [topSuggestion, setTopSuggestion] = useState<IntelligenceRecommendation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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

        void fetch(withBasePath('/api/intelligence'), { cache: 'no-store' })
          .then(async (response) => response.ok ? await response.json() as IntelligenceReport : null)
          .then((report) => setTopSuggestion(report?.podcasts[0] || null))
          .catch(() => setTopSuggestion(null));

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
        setTopSuggestion(null);
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
  const podcastsToRank = useMemo(() => {
    if (!member) return [];
    return pending.filter((podcast) => {
      const myRating = podcast.ratings.find((rating) => rating.member._id === member._id);
      return !myRating || myRating.value === 'No selection';
    });
  }, [pending, member]);
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
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    const podcastMatches = podcasts
      .filter((podcast) => [podcast.title, podcast.host, podcast.episodeNames, podcast.notes].some((value) => value?.toLowerCase().includes(query)))
      .map((podcast) => ({
        id: `podcast-${podcast._id}`,
        title: podcast.title,
        detail: podcast.episodeNames || podcast.host || 'Podcast',
        href: podcast.link,
        external: true,
        kind: 'podcast'
      }));
    const carveOutMatches = carveOuts
      .filter((carveOut) => [carveOut.title, carveOut.notes, carveOut.service, carveOut.type].some((value) => value?.toLowerCase().includes(query)))
      .map((carveOut) => ({
        id: `carveout-${carveOut._id}`,
        title: carveOut.title,
        detail: getCarveOutTypeLabel(carveOut.type),
        href: carveOut.url || '/carveouts',
        external: Boolean(carveOut.url),
        kind: carveOut.type
      }));
    const meetingMatches = meetings
      .filter((meeting) => [meeting.location, meeting.host.name, meeting.notes].some((value) => value?.toLowerCase().includes(query)))
      .map((meeting) => ({
        id: `meeting-${meeting._id}`,
        title: formatDate(meeting.date),
        detail: `${meeting.host.name} · ${meeting.location}`,
        href: '/meetings',
        external: false,
        kind: 'meeting'
      }));

    return [...podcastMatches, ...carveOutMatches, ...meetingMatches].slice(0, 8);
  }, [carveOuts, meetings, podcasts, searchQuery]);
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

        <PodcastListenChooser
          className="podcast-link-card"
          title={podcast.title}
          episodeNames={podcast.episodeNames}
          host={podcast.host}
          link={podcast.link}
        >
          <span>
            <strong>Choose where to listen</strong>
            <small>{getUrlLabel(podcast.link)}</small>
          </span>
          <span className="listen-trigger-chevron" aria-hidden="true" />
        </PodcastListenChooser>
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
              <div><strong>Beta discovery</strong><small>Uncovers new possibilities beyond the member ballot, which always stays first.</small></div>
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
      {nextMeeting ? (
        <div className="section-panel command-panel listen-next-panel" data-tone="meetings">
          <div className="listen-next-heading">
            <div>
              <p className="section-kicker">For the next meeting</p>
              <div className="hero-heading-row">
                <h2>Listen next</h2>
                <span className="badge">{nextMeetingPodcasts.length > 0 ? `${nextMeetingPodcasts.length} selected` : 'Picks coming soon'}</span>
              </div>
              <p className="muted-line">
                {formatDate(nextMeeting.date)} with {displayMemberName(nextMeeting.host)}.
              </p>
            </div>
          </div>
          {nextMeetingPodcasts.length > 0 ? (
            <div className="upcoming-podcast-list" aria-label="Podcasts for the next meeting">
              {nextMeetingPodcasts.map((podcast, index) => (
                <UpcomingPodcastLink key={podcast._id} podcast={podcast} position={index + 1} />
              ))}
            </div>
          ) : (
            <div className="listen-next-empty">
              <span aria-hidden="true">🎧</span>
              <strong>The host has not selected the podcast yet.</strong>
              <small>This card will become the fastest route to the episode as soon as it is chosen.</small>
            </div>
          )}
          <div className="home-meeting-detail-grid">
            <div><span>Host</span><strong>{displayMemberName(nextMeeting.host)}</strong></div>
            <div><span>Location</span><strong>{nextMeeting.location}</strong></div>
          </div>
          <AddToCalendar meeting={nextMeeting} podcastsById={podcastsById} />
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

      <section className="section-panel home-member-priority-panel podcasts-to-discuss-card">
        <div className="section-title-row">
          <div>
            <p className="section-kicker">Member picks come first</p>
            <h2>Active Ballot</h2>
          </div>
          <span className="badge">{podcastsToDiscuss.length}</span>
        </div>
        <p className="muted-line">
          Podcasts submitted by members and ranked by the club. These take priority over beta discoveries.
        </p>
        {podcastsToDiscuss.length > 0 ? (
          <div className="home-ballot-list">
            {podcastsToDiscuss.slice(0, 3).map((podcast, index) => (
              <article className="home-ballot-row" key={`home-ballot-${podcast._id}`}>
                <MediaArtwork
                  url={podcast.link}
                  title={podcast.title}
                  creator={podcast.host}
                  kind="podcast"
                  className="home-ballot-art"
                  fallback="🎧"
                />
                <div>
                  <span className="section-kicker">#{index + 1} member pick</span>
                  <h3>{podcast.title}</h3>
                  <small>{podcast.host || 'Podcast'} · Score {podcast.rankingScore}</small>
                </div>
                <span className="badge">
                  {podcast.missingVoters.length > 0 ? `${podcast.missingVoters.length} to vote` : 'Fully rated'}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No member picks are awaiting a vote.</h3>
            <p>Add a podcast when you find something the club should consider.</p>
          </div>
        )}
        <Link className="home-ballot-link" href={podcastsToDiscuss.length > 0 ? PODCAST_RANK_HREF : PODCAST_SUBMIT_HREF}>
          <span>
            <strong>{podcastsToDiscuss.length > 0 ? 'Review and vote on member picks' : 'Submit a podcast'}</strong>
            <small>{podcastsToDiscuss.length > 0 ? 'The club’s official candidate list' : 'Start the next active ballot'}</small>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      </section>

      {topSuggestion ? (
        <article className="section-panel home-suggestion-panel discovery-beta-card podcasts-to-discuss-card">
          <div className="home-suggestion-heading">
            <span className="section-kicker">NEW! Discovery BETA</span>
            <span className="badge discovery-beta-badge">BETA</span>
          </div>
          <MediaArtwork
            url={topSuggestion.href}
            title={topSuggestion.title}
            kind="podcast"
            className="home-suggestion-art"
            fallback="🎧"
            eager
          />
          <div className="home-suggestion-copy">
            <h2>{topSuggestion.title}</h2>
            <p>{topSuggestion.subtitle}</p>
            {topSuggestion.reasons[0] ? <small>{topSuggestion.reasons[0]}</small> : null}
          </div>
          <p className="discovery-beta-note">
            This beta uses our past history to uncover podcasts we may like. An episode becomes part of the Active Ballot above only when a member submits it.
          </p>
          <Link className="home-suggestion-link" href="/episode-discovery">
            <span>
              <strong>Explore this beta discovery</strong>
              <small>See why it surfaced and tune future discoveries</small>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        </article>
      ) : null}

      <section className="section-panel home-search-panel">
        <div className="section-title-row">
          <div><p className="section-kicker">Search</p><h2>Search Club History</h2></div>
          <span className="badge">{podcasts.length + meetings.length + carveOuts.length} items</span>
        </div>
        <label className="home-search-field">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Search podcasts, meetings, and carve outs</span>
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} type="search" placeholder="Search podcasts, meetings, and carve outs" />
        </label>
        <p className="muted-line">Podcasts, meeting notes, and carve outs.</p>
        {searchQuery.trim() ? (
          <div className="home-search-results" aria-live="polite">
            {searchResults.length === 0 ? <p>No matching club history.</p> : null}
            {searchResults.map((result) => result.external ? (
              <a key={result.id} href={result.href} target="_blank" rel="noreferrer"><span><strong>{result.title}</strong><small>{result.detail}</small></span><span aria-hidden="true">↗</span></a>
            ) : (
              <Link key={result.id} href="/meetings"><span><strong>{result.title}</strong><small>{result.detail}</small></span><span aria-hidden="true">→</span></Link>
            ))}
          </div>
        ) : null}
      </section>

      <section className="home-preview-grid" aria-label="Club shortcuts">
        <Link className="home-preview-card" href={PODCAST_RANK_HREF}>
          <MediaArtwork url={podcastsToDiscuss[0]?.link} title={podcastsToDiscuss[0]?.title} creator={podcastsToDiscuss[0]?.host} kind="podcast" className="home-preview-card-art" fallback="🎧" />
          <p className="section-kicker">Quick action</p>
          <h3>Rank podcasts</h3>
          <p>{podcastsToRank.length > 0 ? `${podcastsToRank.length} podcast${podcastsToRank.length === 1 ? ' needs' : 's need'} your rating.` : 'You’re caught up. Review the active ballot.'}</p>
          <strong>Review the ballot →</strong>
        </Link>
        <Link className="home-preview-card carveout" href="/carveouts">
          <MediaArtwork url={recentCarveOuts[0]?.url} title={recentCarveOuts[0]?.title} kind={recentCarveOuts[0]?.type || 'other'} className="home-preview-card-art" fallback="◇" />
          <p className="section-kicker">Recent carve out</p>
          <h3>{recentCarveOuts[0]?.title || 'See what members shared'}</h3>
          <p>{recentCarveOuts[0]?.notes || 'Books, articles, films, and other finds from the club.'}</p>
          <strong>See carve outs →</strong>
        </Link>
        <Link className="home-preview-card" href={PODCAST_LIBRARY_HREF}>
          <MediaArtwork url={recentDiscussedPodcasts[0]?.link} title={recentDiscussedPodcasts[0]?.title} creator={recentDiscussedPodcasts[0]?.host} kind="podcast" className="home-preview-card-art" fallback="▶" />
          <p className="section-kicker">Recently discussed</p>
          <h3>{recentDiscussedPodcasts[0]?.title || 'Club podcast archive'}</h3>
          <p>{recentDiscussedPodcasts[0]?.episodeNames || 'Return to past episodes and discussion notes without hunting.'}</p>
          <strong>Search the archive →</strong>
        </Link>
      </section>
    </section>
  );
}
