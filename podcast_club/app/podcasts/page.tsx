'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import IntelligenceClient from '@/app/intelligence/IntelligenceClient';
import { ListeningStyles } from '@/components/ListeningStyles';
import { MediaArtwork } from '@/components/MediaArtwork';
import { PodcastListenChooser } from '@/components/PodcastListenChooser';
import { withBasePath } from '@/lib/base-path';
import { fetchJson, getRequestErrorMessage } from '@/lib/client-fetch';
import { dedupePodcastsByContent } from '@/lib/podcast-dedupe';
import type { Podcast, SessionMember } from '@/lib/types';
import { RATING_OPTIONS } from '@/lib/ranking';

type PodcastTab = 'rank' | 'submit' | 'library';
const PODCAST_TABS = new Set<PodcastTab>(['rank', 'submit', 'library']);

const initialForm = {
  title: '',
  host: '',
  episodeCount: '',
  episodeNames: '',
  totalTimeMinutes: '',
  link: '',
  notes: ''
};

type PodcastMetadata = {
  provider?: string;
  title?: string;
  host?: string;
  episodeNames?: string;
  episodeCount?: number;
  totalTimeMinutes?: number | null;
  notes?: string;
  artworkUrl?: string | null;
};

function getRatingDisplay(option: string) {
  switch (option) {
    case 'I like it a lot.':
      return {
        label: 'Love it',
        detail: 'A strong candidate for a meeting.'
      };
    case 'I like it.':
      return {
        label: 'Like it',
        detail: 'Worth keeping in the mix.'
      };
    case 'Meh':
      return {
        label: 'Meh',
        detail: 'Not a priority right now.'
      };
    case 'My podcast':
      return {
        label: 'My Podcast',
        detail: 'Locked to your submission.'
      };
    default:
      return {
        label: option,
        detail: 'Save this rating.'
      };
  }
}

function getPodcastLinkHost(link: string) {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return 'Podcast link';
  }
}

export default function PodcastsPage() {
  const [member, setMember] = useState<SessionMember | null>(null);
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [form, setForm] = useState(initialForm);
  const [savedRatings, setSavedRatings] = useState<Record<string, string>>({});
  const [draftRatings, setDraftRatings] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [fillingDetails, setFillingDetails] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState('');
  const [savingRatingId, setSavingRatingId] = useState<string | null>(null);
  const [ratingToast, setRatingToast] = useState('');
  const [recentlySavedRatings, setRecentlySavedRatings] = useState<
    Record<string, { value: string; title: string; fading: boolean }>
  >({});
  const [deletingPodcastId, setDeletingPodcastId] = useState<string | null>(null);
  const [deleteModalPodcast, setDeleteModalPodcast] = useState<Podcast | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showAllPodcastsToDiscuss, setShowAllPodcastsToDiscuss] = useState(false);
  const [showAllDiscussed, setShowAllDiscussed] = useState(false);
  const [activeTab, setActiveTab] = useState<PodcastTab>('rank');
  const ratingFadeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const ratingRemoveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const ratingToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const libraryHeadingRef = useRef<HTMLHeadingElement | null>(null);

  function browseLibrary() {
    setActiveTab('library');
    window.requestAnimationFrame(() => {
      const heading = libraryHeadingRef.current;
      if (!heading) return;
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start'
      });
    });
  }

  function clearRatingTimers(podcastId: string) {
    const fadeTimer = ratingFadeTimers.current[podcastId];
    if (fadeTimer) {
      clearTimeout(fadeTimer);
      delete ratingFadeTimers.current[podcastId];
    }

    const removeTimer = ratingRemoveTimers.current[podcastId];
    if (removeTimer) {
      clearTimeout(removeTimer);
      delete ratingRemoveTimers.current[podcastId];
    }
  }

  function showRatingToast(message: string) {
    setRatingToast(message);
    if (ratingToastTimer.current) {
      clearTimeout(ratingToastTimer.current);
    }
    ratingToastTimer.current = setTimeout(() => {
      setRatingToast('');
      ratingToastTimer.current = null;
    }, 3000);
  }

  async function loadPageData() {
    const meRes = await fetch(withBasePath('/api/auth/me'), { cache: 'no-store' });
    if (!meRes.ok) {
      setMember(null);
      return;
    }

    const mePayload = await meRes.json();
    setMember(mePayload.member);

    const podcastRes = await fetch(withBasePath('/api/podcasts'));
    if (!podcastRes.ok) return;

    const podcastData = (await podcastRes.json()) as Podcast[];
    setPodcasts(podcastData);
    const nextRatings: Record<string, string> = {};
    podcastData.forEach((podcast) => {
      const mine = podcast.ratings.find((rating) => rating.member._id === mePayload.member._id);
      nextRatings[podcast._id] = mine?.value || 'No selection';
    });
    setSavedRatings(nextRatings);
    setDraftRatings(nextRatings);
  }

  useEffect(() => {
    void loadPageData();
  }, []);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab') as PodcastTab | null;
    if (requestedTab && PODCAST_TABS.has(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, []);

  useEffect(() => {
    const fadeTimers = ratingFadeTimers.current;
    const removeTimers = ratingRemoveTimers.current;

    return () => {
      Object.values(fadeTimers).forEach((timer) => clearTimeout(timer));
      Object.values(removeTimers).forEach((timer) => clearTimeout(timer));
      if (ratingToastTimer.current) {
        clearTimeout(ratingToastTimer.current);
      }
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const result = await fetchJson(withBasePath('/api/podcasts'), {
        method: 'POST',
        body: form
      });

      if (!result.ok) {
        setError(result.message || 'Unable to save podcast.');
        return;
      }

      setForm(initialForm);
      await loadPageData();
      setSuccess('Podcast submitted successfully. It now appears on the active ballot.');
    } catch (error) {
      setError(getRequestErrorMessage(error, 'Unable to save podcast.'));
    } finally {
      setSaving(false);
    }
  }

  async function fillDetailsFromLink() {
    if (!form.link.trim() || fillingDetails) return;
    setError('');
    setMetadataMessage('');
    setFillingDetails(true);

    try {
      const response = await fetch(withBasePath(`/api/podcast-metadata?url=${encodeURIComponent(form.link.trim())}`));
      const payload = (await response.json().catch(() => null)) as (PodcastMetadata & { message?: string }) | null;
      if (!response.ok || !payload) {
        setMetadataMessage(payload?.message || 'Unable to read that link. You can still enter the details manually.');
        return;
      }

      setForm((current) => ({
        ...current,
        title: payload.title || current.title,
        host: payload.host || current.host,
        episodeNames: payload.episodeNames || current.episodeNames,
        episodeCount: payload.episodeCount ? String(payload.episodeCount) : current.episodeCount,
        totalTimeMinutes: payload.totalTimeMinutes ? String(payload.totalTimeMinutes) : current.totalTimeMinutes,
        notes: payload.notes || current.notes
      }));
      setMetadataMessage(`Details filled from ${payload.provider || 'the episode link'}. Please review before adding.`);
    } catch {
      setMetadataMessage('Unable to read that link. You can still enter the details manually.');
    } finally {
      setFillingDetails(false);
    }
  }

  async function saveRating(podcastId: string, selectedRating?: string) {
    const targetPodcast = podcasts.find((podcast) => podcast._id === podcastId);
    const isSubmitter = targetPodcast ? targetPodcast.submittedBy._id === member?._id : false;
    const rating = selectedRating || draftRatings[podcastId] || 'No selection';

    if (isSubmitter && rating !== 'My podcast') {
      showRatingToast("You can't rate your podcast.");
      setError('You cannot change your own submitted podcast rating from "My podcast".');
      return;
    }

    setError('');
    setSuccess('');
    setDraftRatings((prev) => ({ ...prev, [podcastId]: rating }));
    setSavingRatingId(podcastId);

    try {
      const result = await fetchJson<Podcast>(withBasePath(`/api/podcasts/${podcastId}/vote`), {
        method: 'POST',
        body: { rating }
      });

      if (!result.ok) {
        setError(result.message || 'Unable to save rating.');
        return;
      }

      clearRatingTimers(podcastId);
      setSavedRatings((prev) => ({ ...prev, [podcastId]: rating }));
      setDraftRatings((prev) => ({ ...prev, [podcastId]: rating }));
      setRecentlySavedRatings((prev) => ({
        ...prev,
        [podcastId]: { value: rating, title: targetPodcast?.title || 'Podcast', fading: false }
      }));

      ratingFadeTimers.current[podcastId] = setTimeout(() => {
        setRecentlySavedRatings((prev) =>
          prev[podcastId]
            ? {
                ...prev,
                [podcastId]: { ...prev[podcastId], fading: true }
              }
            : prev
        );
        delete ratingFadeTimers.current[podcastId];
      }, 1800);

      ratingRemoveTimers.current[podcastId] = setTimeout(() => {
        setRecentlySavedRatings((prev) => {
          const next = { ...prev };
          delete next[podcastId];
          return next;
        });
        delete ratingRemoveTimers.current[podcastId];
      }, 2600);

      await loadPageData();
    } catch (error) {
      setError(getRequestErrorMessage(error, 'Unable to save rating.'));
    } finally {
      setSavingRatingId((current) => (current === podcastId ? null : current));
    }
  }

  function canDeletePodcast(podcast: Podcast) {
    if (!member) return false;
    if (member.isAdmin) return true;
    return podcast.status !== 'discussed' && podcast.submittedBy._id === member._id;
  }

  function openDeleteModal(podcast: Podcast) {
    setError('');
    setDeleteModalPodcast(podcast);
    setDeleteConfirmText('');
  }

  function closeDeleteModal() {
    if (deletingPodcastId) return;
    setDeleteModalPodcast(null);
    setDeleteConfirmText('');
  }

  async function confirmDeletePodcast() {
    if (!deleteModalPodcast) return;

    setError('');
    setDeletingPodcastId(deleteModalPodcast._id);
    try {
      const result = await fetchJson(withBasePath(`/api/podcasts/${deleteModalPodcast._id}`), {
        method: 'DELETE',
        body: { confirmText: deleteConfirmText }
      });

      if (!result.ok) {
        setError(result.message || 'Unable to delete podcast.');
        return;
      }

      setDeleteModalPodcast(null);
      setDeleteConfirmText('');
      await loadPageData();
    } catch (error) {
      setError(getRequestErrorMessage(error, 'Unable to delete podcast.'));
    } finally {
      setDeletingPodcastId(null);
    }
  }

  const pending = useMemo(() => podcasts.filter((podcast) => podcast.status === 'pending'), [podcasts]);
  const discussed = useMemo(() => {
    return podcasts
      .filter((podcast) => podcast.status === 'discussed')
      .sort((a, b) => {
        const aTime = a.discussedMeetingDate ? +new Date(a.discussedMeetingDate) : 0;
        const bTime = b.discussedMeetingDate ? +new Date(b.discussedMeetingDate) : 0;
        if (bTime !== aTime) return bTime - aTime;
        return a.title.localeCompare(b.title);
      });
  }, [podcasts]);
  const podcastsToRank = useMemo(() => {
    return pending.filter((podcast) => {
      if (recentlySavedRatings[podcast._id]) return true;
      return (savedRatings[podcast._id] || 'No selection') === 'No selection';
    });
  }, [pending, recentlySavedRatings, savedRatings]);
  const activeRankCount = useMemo(() => {
    return pending.filter((podcast) => {
      if (recentlySavedRatings[podcast._id]) return false;
      return (savedRatings[podcast._id] || 'No selection') === 'No selection';
    }).length;
  }, [pending, recentlySavedRatings, savedRatings]);
  const savedRankCount = podcastsToRank.length - activeRankCount;
  const podcastsToDiscuss = useMemo(() => {
    return dedupePodcastsByContent(
      pending
      .sort((a, b) => {
        if (b.rankingScore !== a.rankingScore) return b.rankingScore - a.rankingScore;
        return a.title.localeCompare(b.title);
      })
    );
  }, [pending]);
  const recentPodcastsToDiscuss = useMemo(() => podcastsToDiscuss.slice(0, 3), [podcastsToDiscuss]);
  const recentDiscussed = useMemo(() => discussed.slice(0, 3), [discussed]);
  const displayMemberName = (person: { _id: string; name: string }) =>
    member && person._id === member._id ? 'You' : person.name;
  const annotateSelfInList = (name: string) =>
    member && name.trim().toLowerCase() === member.name.trim().toLowerCase() ? `${name} (you)` : name;
  const formatMissingVoters = (names: string[]) =>
    names.length > 0 ? names.map((name) => annotateSelfInList(name)).join(', ') : 'None';

  function isMyPodcastTakenByAnotherMember(podcast: Podcast) {
    return podcast.ratings.some((rating) => rating.value === 'My podcast' && rating.member._id !== member?._id);
  }

  function getRatingOptions(podcast: Podcast) {
    if (podcast.submittedBy._id === member?._id) {
      return RATING_OPTIONS.filter((option) => option === 'My podcast');
    }
    return RATING_OPTIONS.filter((option) => option !== 'My podcast' && option !== 'No selection');
  }

  function onDraftRatingChange(podcast: Podcast, value: string) {
    const isSubmitter = podcast.submittedBy._id === member?._id;

    if (!isSubmitter && value === 'My podcast') {
      setError('Only the member who submitted this podcast can use "My podcast".');
      return;
    }

    if (isSubmitter && value !== 'My podcast') {
      showRatingToast("You can't rate your podcast.");
      setError('You cannot change your own submitted podcast rating from "My podcast".');
      return;
    }

    setDraftRatings((prev) => ({
      ...prev,
      [podcast._id]: value
    }));
  }

  function renderPodcastDetails(podcast: Podcast, options: { includeRating?: boolean; includeManage?: boolean } = {}) {
    const currentRating = savedRatings[podcast._id] || 'No selection';
    const hostLabel = podcast.host || 'Unknown';
    const episodeCountLabel = podcast.episodeCount ? String(podcast.episodeCount) : 'Unknown';
    const timeLabel = podcast.totalTimeMinutes ? `${podcast.totalTimeMinutes} min` : 'Unknown';
    const canManage = options.includeManage !== false && canDeletePodcast(podcast);

    return (
      <div className="podcast-detail-stack">
        <section className="podcast-detail-section">
          <div className="podcast-detail-heading">
            <strong>Overview</strong>
          </div>
          <dl className="podcast-detail-grid">
            <div>
              <dt>Host</dt>
              <dd>{hostLabel}</dd>
            </div>
            <div>
              <dt>Episodes</dt>
              <dd>{episodeCountLabel}</dd>
            </div>
            <div>
              <dt>Total time</dt>
              <dd>{timeLabel}</dd>
            </div>
            <div>
              <dt>Submitted by</dt>
              <dd>{displayMemberName(podcast.submittedBy)}</dd>
            </div>
          </dl>
        </section>

        <section className="podcast-detail-section">
          <div className="podcast-detail-heading">
            <strong>Episode</strong>
          </div>
          <p className="podcast-detail-copy">{podcast.episodeNames || 'Unknown episode'}</p>
          <p className="podcast-detail-copy">{podcast.notes || 'No description yet.'}</p>
        </section>

        <PodcastListenChooser
          className="podcast-link-card"
          title={podcast.title}
          episodeNames={podcast.episodeNames}
          host={podcast.host}
          link={podcast.link}
        >
          <span>
            <strong>Choose where to listen</strong>
            <small>{getPodcastLinkHost(podcast.link)}</small>
          </span>
          <span className="listen-trigger-chevron" aria-hidden="true" />
        </PodcastListenChooser>

        {podcast.missingVoters.length > 0 ? (
          <p className="warning-banner">
            <strong>Missing votes:</strong> {formatMissingVoters(podcast.missingVoters)}
          </p>
        ) : null}

        {options.includeRating ? (
          <section className="podcast-detail-section podcast-rating-section">
            <div className="podcast-detail-heading">
              <strong>Your rating</strong>
              <span className="badge">{currentRating}</span>
            </div>
            {renderRatingControls(podcast)}
          </section>
        ) : null}

        {canManage ? (
          <section className="podcast-manage-section">
            <div>
              <strong>Manage podcast</strong>
              <small>Remove this item from the club library.</small>
            </div>
            <button type="button" className="secondary" onClick={() => openDeleteModal(podcast)}>
              Delete Podcast
            </button>
          </section>
        ) : null}
      </div>
    );
  }

  function renderRatingControls(podcast: Podcast) {
    const selectedRating = draftRatings[podcast._id] || 'No selection';
    const isSubmitter = podcast.submittedBy._id === member?._id;

    return (
      <div className="rating-choice-panel">
        {isSubmitter ? <span className="badge">Locked: your submission</span> : null}
        <div className="rating-choice-grid" role="group" aria-label={`Rate ${podcast.title}`}>
          {getRatingOptions(podcast).map((option) => {
            const selected = selectedRating === option;
            const savingThis = savingRatingId === podcast._id;
            const ratingDisplay = getRatingDisplay(option);
            return (
              <button
                key={option}
                type="button"
                className={`rating-choice${selected ? ' selected' : ''}`}
                aria-pressed={selected}
                onClick={() => {
                  onDraftRatingChange(podcast, option);
                  void saveRating(podcast._id, option);
                }}
                disabled={savingThis || (option === 'My podcast' && isMyPodcastTakenByAnotherMember(podcast))}
              >
                <span>
                  <strong>{savingThis && selected ? 'Saving...' : ratingDisplay.label}</strong>
                  <small>{ratingDisplay.detail}</small>
                </span>
                <span className="rating-choice-status" aria-hidden="true">
                  {selected ? 'Selected' : 'Tap'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <section className="podcasts-page page-stack">
        <div className="section-panel">
          <h2>Podcasts</h2>
          <p>Please login to submit and rank podcasts.</p>
          <Link className="nav-link" href="/login">
            Go to Login
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="podcasts-page page-stack">
      {ratingToast ? <div className="toast-banner">{ratingToast}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="section-panel page-intro-panel">
        <div>
          <p className="section-kicker">Podcasts</p>
          <h2>Find the Next Discussion</h2>
          <p className="muted-line">Member submissions and voting come first. Beta discovery follows with new podcasts from beyond the club’s current list.</p>
        </div>
        <button type="button" className="page-intro-action" onClick={() => setActiveTab(activeTab === 'submit' ? 'rank' : 'submit')}>
          {activeTab === 'submit' ? 'Back to Podcasts' : 'Add a Podcast'} <span aria-hidden="true">→</span>
        </button>
      </div>

      {activeTab !== 'submit' ? <ListeningStyles member={member} compact /> : null}

      {activeTab !== 'submit' ? (
        <div className="section-panel podcasts-to-rank-card">
          <div className="section-title-row">
            <div><p className="section-kicker">Vote Next</p><h2>Rank Podcasts</h2></div>
            <span className="badge">{activeRankCount} left</span>
          </div>
          <div className="rank-flow-status" aria-live="polite">
            <strong>{savedRankCount > 0 ? 'Saved' : activeRankCount === 0 ? 'All ranked' : 'Queue ready'}</strong>
            <span>
              {savedRankCount > 0
                ? `${savedRankCount} saved and clearing from the queue.`
                : activeRankCount === 1
                  ? '1 podcast is waiting for your rating.'
                  : `${activeRankCount} podcasts are waiting for your ratings.`}
            </span>
          </div>

          <div className="rank-card-list">
            {podcastsToRank.length === 0 ? (
              <div className="empty-state rank-empty-state">
                <h3>Ranking complete</h3>
                <p>You are caught up on pending podcast ratings. Browse the library or add something new for the group to consider.</p>
                <div className="empty-state-actions">
                  <button type="button" aria-controls="podcast-library" onClick={browseLibrary}>
                    Browse Library
                  </button>
                  <button type="button" className="ghost" onClick={() => setActiveTab('submit')}>
                    Submit Podcast
                  </button>
                </div>
              </div>
            ) : null}
            {podcastsToRank.map((podcast) => {
              const savedRating = recentlySavedRatings[podcast._id];
              return (
                <div
                  className={`rank-podcast-card${savedRating ? ' rating-saved' : ''}${savedRating?.fading ? ' item-fading-out' : ''}`}
                  key={podcast._id}
                >
                  <div className="rank-podcast-head podcast-with-art">
                    <MediaArtwork
                      url={podcast.link}
                      title={podcast.title}
                      creator={podcast.host}
                      kind="podcast"
                      className="podcast-list-art"
                      fallback="🎧"
                    />
                    <div>
                      <h3>{podcast.title}</h3>
                      <p>
                        {podcast.totalTimeMinutes ? `${podcast.totalTimeMinutes} min` : podcast.host || 'Unknown host'}
                        {podcast.submittedBy ? ` | ${displayMemberName(podcast.submittedBy)}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="podcast-meta-row">
                    <span className="badge ranking-score">Score {podcast.rankingScore}</span>
                    <span className="badge">{podcast.missingVoters.length > 0 ? `${podcast.missingVoters.length} missing` : 'Fully rated'}</span>
                    {savedRatings[podcast._id] === 'My podcast' ? <span className="badge my-podcast">My Podcast</span> : null}
                  </div>

                  {savedRating ? (
                    <div className="rank-saved-message" role="status">
                      <strong>Saved</strong>
                      <span>{getRatingDisplay(savedRating.value).label}. Moving to the next podcast.</span>
                    </div>
                  ) : (
                    <>
                      <details className="podcast-details">
                        <summary>Details</summary>
                        <div className="podcast-details-body">
                          {renderPodcastDetails(podcast, { includeManage: false })}
                        </div>
                      </details>

                      {renderRatingControls(podcast)}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeTab === 'submit' ? (
        <div className="section-panel submit-podcast-panel">
          <div className="section-title-row"><h2>Submit Podcast</h2><button type="button" className="ghost" onClick={() => setActiveTab('rank')}>Close</button></div>
          <form className="form" onSubmit={onSubmit}>
            <label>
              Podcast Title
              <input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
            </label>
            <label>
              Link
              <input
                type="url"
                value={form.link}
                onChange={(event) => setForm((prev) => ({ ...prev, link: event.target.value }))}
                required
              />
            </label>
            <div className="podcast-import-helper">
              <span>
                <strong>Save some typing</strong>
                <small>Paste an Apple Podcasts, Spotify, or YouTube episode link first.</small>
              </span>
              <button type="button" className="ghost" onClick={fillDetailsFromLink} disabled={!form.link.trim() || fillingDetails}>
                {fillingDetails ? 'Reading link...' : 'Fill details from link'}
              </button>
            </div>
            {metadataMessage ? <p className="metadata-message" role="status">{metadataMessage}</p> : null}
            <label>
              Host
              <input
                value={form.host}
                onChange={(event) => setForm((prev) => ({ ...prev, host: event.target.value }))}
                required
              />
            </label>
            <label>
              Name of Episode(s)
              <input
                value={form.episodeNames}
                onChange={(event) => setForm((prev) => ({ ...prev, episodeNames: event.target.value }))}
                required
              />
            </label>
            <div className="form-grid-two">
              <label>
                # of Episodes
                <input
                  type="number"
                  min={1}
                  value={form.episodeCount}
                  onChange={(event) => setForm((prev) => ({ ...prev, episodeCount: event.target.value }))}
                  required
                />
              </label>
              <label>
                Total Minutes
                <input
                  type="number"
                  min={1}
                  value={form.totalTimeMinutes}
                  onChange={(event) => setForm((prev) => ({ ...prev, totalTimeMinutes: event.target.value }))}
                  required
                />
              </label>
            </div>
            <label>
              Notes
              <textarea
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </label>
            <button disabled={saving}>{saving ? 'Saving...' : 'Add Podcast'}</button>
            {success ? <p className="success-message">{success}</p> : null}
          </form>
        </div>
      ) : null}

      {activeTab !== 'submit' ? (
        <div id="podcast-library" className="podcast-library-stack">
          <div className="section-panel podcasts-to-discuss-page-card">
            <div className="section-title-row">
              <h2 ref={libraryHeadingRef} tabIndex={-1}>Active Ballot</h2>
              <span className="badge">{podcastsToDiscuss.length}</span>
            </div>
            <p className="muted-line">Every podcast still up for consideration, highest-rated first. Use Rank to cast or update your vote.</p>
            <div className="library-list">
              {recentPodcastsToDiscuss.length === 0 ? <p>No podcasts are on the active ballot right now.</p> : null}
              {(showAllPodcastsToDiscuss ? podcastsToDiscuss : recentPodcastsToDiscuss).map((podcast, index) => (
                <div className="library-podcast-row" key={`ranked-${podcast._id}`}>
                  <div className="library-podcast-head podcast-with-art">
                    <MediaArtwork
                      url={podcast.link}
                      title={podcast.title}
                      creator={podcast.host}
                      kind="podcast"
                      className="podcast-list-art"
                      fallback="🎧"
                    />
                    <div>
                      <small className="podcast-rank-number">#{index + 1}</small>
                      <h3>{podcast.title}</h3>
                    </div>
                  </div>
                  <div className="podcast-meta-row">
                    <span className="badge ranking-score">Score {podcast.rankingScore}</span>
                    <span className="badge">{podcast.missingVoters.length > 0 ? `${podcast.missingVoters.length} missing` : 'Fully rated'}</span>
                    {savedRatings[podcast._id] === 'My podcast' ? <span className="badge my-podcast">My Podcast</span> : null}
                  </div>
                  <p>
                    {podcast.totalTimeMinutes ? `${podcast.totalTimeMinutes} min` : podcast.host || 'Unknown host'}
                    {` | Your rating: ${savedRatings[podcast._id] || 'No selection'}`}
                  </p>
                  <details className="podcast-details">
                    <summary>Details and rating</summary>
                    <div className="podcast-details-body">
                      {renderPodcastDetails(podcast, { includeRating: true })}
                    </div>
                  </details>
                </div>
              ))}
            </div>
            {podcastsToDiscuss.length > 3 ? (
              <button type="button" className="ghost full-width-action" onClick={() => setShowAllPodcastsToDiscuss((prev) => !prev)}>
                {showAllPodcastsToDiscuss ? 'Show Recent' : `Show All (${podcastsToDiscuss.length})`}
              </button>
            ) : null}
          </div>

          <IntelligenceClient embedded />

          <div className="section-panel podcasts-previously-discussed-card">
            <div className="section-title-row">
              <h2>Past Discussions</h2>
              <span className="badge">{discussed.length}</span>
            </div>
            <p className="muted-line">The archive of episodes the club has already discussed.</p>
            <div className="library-list">
              {discussed.length === 0 ? <p>No previously discussed podcasts.</p> : null}
              {(showAllDiscussed ? discussed : recentDiscussed).map((podcast) => (
                <div className="library-podcast-row" key={`discussed-${podcast._id}`}>
                  <div className="library-podcast-head podcast-with-art">
                    <MediaArtwork
                      url={podcast.link}
                      title={podcast.title}
                      creator={podcast.host}
                      kind="podcast"
                      className="podcast-list-art"
                      fallback="🎧"
                    />
                    <div><h3>{podcast.title}</h3></div>
                  </div>
                  <div className="podcast-meta-row">
                    <span className="badge">Discussed</span>
                  </div>
                  <p>{podcast.notes || 'No description yet.'}</p>
                  <details className="podcast-details">
                    <summary>Details</summary>
                    <div className="podcast-details-body">
                      {renderPodcastDetails(podcast, { includeManage: true })}
                    </div>
                  </details>
                </div>
              ))}
            </div>
            {discussed.length > 3 ? (
              <button type="button" className="ghost full-width-action" onClick={() => setShowAllDiscussed((prev) => !prev)}>
                {showAllDiscussed ? 'Show Recent' : `Show All (${discussed.length})`}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {deleteModalPodcast ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-podcast-title">
          <div className="modal-card">
            <h3 id="delete-podcast-title">Delete Podcast</h3>
            <p>
              Type <strong>DELETE</strong> to confirm deleting <strong>{deleteModalPodcast.title}</strong>.
            </p>
            <label>
              Confirmation
              <input
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder="DELETE"
              />
            </label>
            <div className="inline" style={{ marginTop: '0.5rem' }}>
              <button
                className="secondary"
                onClick={confirmDeletePodcast}
                disabled={deletingPodcastId === deleteModalPodcast._id}
              >
                {deletingPodcastId === deleteModalPodcast._id ? 'Deleting...' : 'Delete Podcast'}
              </button>
              <button className="ghost" onClick={closeDeleteModal} disabled={Boolean(deletingPodcastId)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
