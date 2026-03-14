'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { withBasePath } from '@/lib/base-path';
import { dedupePodcastsByContent } from '@/lib/podcast-dedupe';
import type { Meeting, Podcast, SessionMember } from '@/lib/types';
import { RATING_OPTIONS } from '@/lib/ranking';

const initialForm = {
  title: '',
  host: '',
  episodeCount: '',
  episodeNames: '',
  totalTimeMinutes: '',
  link: '',
  notes: ''
};

function isCompletedMeeting(meeting: Meeting) {
  if (meeting.status === 'completed') return true;
  if (meeting.status === 'scheduled') return false;
  if (meeting.completedAt) return true;
  return false;
}

function getMeetingPodcastIds(meeting: Meeting) {
  if (meeting.podcasts && meeting.podcasts.length > 0) {
    return meeting.podcasts.map((podcast) => podcast._id);
  }
  return meeting.podcast?._id ? [meeting.podcast._id] : [];
}

export default function PodcastsPage() {
  const [member, setMember] = useState<SessionMember | null>(null);
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [form, setForm] = useState(initialForm);
  const [savedRatings, setSavedRatings] = useState<Record<string, string>>({});
  const [draftRatings, setDraftRatings] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
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
  const ratingFadeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const ratingRemoveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const ratingToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const [podcastRes, meetingRes] = await Promise.all([
      fetch(withBasePath('/api/podcasts')),
      fetch(withBasePath('/api/meetings'))
    ]);
    if (!podcastRes.ok) return;

    const podcastData = (await podcastRes.json()) as Podcast[];
    setPodcasts(podcastData);
    if (meetingRes.ok) {
      setMeetings((await meetingRes.json()) as Meeting[]);
    } else {
      setMeetings([]);
    }

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
    setError('');
    setSuccess('');
    setSaving(true);

    const res = await fetch(withBasePath('/api/podcasts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    if (!res.ok) {
      const payload = await res.json();
      setError(payload.message || 'Unable to save podcast.');
      setSaving(false);
      return;
    }

    setForm(initialForm);
    await loadPageData();
    setSuccess('Podcast submitted successfully. It now appears in Podcasts To Discuss.');
    setSaving(false);
  }

  async function saveRating(podcastId: string) {
    const targetPodcast = podcasts.find((podcast) => podcast._id === podcastId);
    const isSubmitter = targetPodcast ? targetPodcast.submittedBy._id === member?._id : false;
    const rating = draftRatings[podcastId] || 'No selection';

    if (isSubmitter && rating !== 'My podcast') {
      showRatingToast("You can't rate your podcast.");
      setError('You cannot change your own submitted podcast rating from "My podcast".');
      return;
    }

    setError('');
    setSuccess('');
    setSavingRatingId(podcastId);

    try {
      const res = await fetch(withBasePath(`/api/podcasts/${podcastId}/vote`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating })
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message || 'Unable to save rating.');
        return;
      }

      clearRatingTimers(podcastId);
      setSavedRatings((prev) => ({ ...prev, [podcastId]: rating }));
      setDraftRatings((prev) => ({ ...prev, [podcastId]: rating }));
      setRecentlySavedRatings((prev) => ({
        ...prev,
        [podcastId]: { value: rating, title: targetPodcast?.title || 'Podcast', fading: false }
      }));
      showRatingToast(`Your rating for "${targetPodcast?.title || 'Podcast'}" was saved.`);

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
      const res = await fetch(withBasePath(`/api/podcasts/${deleteModalPodcast._id}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmText: deleteConfirmText })
      });

      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setError(payload?.message || 'Unable to delete podcast.');
        return;
      }

      setDeleteModalPodcast(null);
      setDeleteConfirmText('');
      await loadPageData();
    } catch {
      setError('Unable to delete podcast.');
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
  const podcastsToDiscuss = useMemo(() => {
    const assignedPodcastIds = new Set(
      meetings
        .filter((meeting) => !isCompletedMeeting(meeting))
        .flatMap((meeting) => getMeetingPodcastIds(meeting))
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
  const remainingPodcastsToDiscuss = useMemo(() => podcastsToDiscuss.slice(3), [podcastsToDiscuss]);
  const recentDiscussed = useMemo(() => discussed.slice(0, 3), [discussed]);
  const remainingDiscussed = useMemo(() => discussed.slice(3), [discussed]);
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
      return RATING_OPTIONS;
    }
    return RATING_OPTIONS.filter((option) => option !== 'My podcast');
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

  function renderPodcastDetails(podcast: Podcast) {
    return (
      <>
        <p>
          <strong>Host:</strong> {podcast.host || 'Unknown'}
        </p>
        <p>
          <strong># of Episodes:</strong> {podcast.episodeCount || 'Unknown'}
        </p>
        <p>
          <strong>Name of Episode(s):</strong> {podcast.episodeNames || 'Unknown'}
        </p>
        <p>
          <strong>Total Time (approx min):</strong> {podcast.totalTimeMinutes || 'Unknown'}
        </p>
        {podcast.notes ? <p>{podcast.notes}</p> : <p>No notes yet.</p>}
        <p>
          <strong>Submitted by:</strong> {displayMemberName(podcast.submittedBy)}
        </p>
      </>
    );
  }

  function renderRatingActions(podcast: Podcast, buttonLabel: string) {
    return (
      <div className="podcast-action-bar">
        <div className="inline podcast-action-bar-inner">
          {podcast.submittedBy._id === member?._id ? <span className="badge">Locked: your submission</span> : null}
          <select
            value={draftRatings[podcast._id] || 'No selection'}
            onChange={(event) => onDraftRatingChange(podcast, event.target.value)}
            disabled={savingRatingId === podcast._id}
          >
            {getRatingOptions(podcast).map((option) => (
              <option
                key={option}
                value={option}
                disabled={option === 'My podcast' && isMyPodcastTakenByAnotherMember(podcast)}
              >
                {option}
              </option>
            ))}
          </select>
          <button onClick={() => saveRating(podcast._id)} disabled={savingRatingId === podcast._id}>
            {savingRatingId === podcast._id
              ? 'Saving...'
              : recentlySavedRatings[podcast._id] && buttonLabel === 'Save Rating'
                ? 'Saved'
                : buttonLabel}
          </button>
          {canDeletePodcast(podcast) ? (
            <button className="secondary" onClick={() => openDeleteModal(podcast)}>
              Delete Podcast
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <section className="grid" style={{ marginTop: '1rem' }}>
        <div className="card">
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
    <section className="grid podcasts-page" style={{ marginTop: '1rem' }}>
      {ratingToast ? <div className="toast-banner">{ratingToast}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="grid two" style={{ alignItems: 'start' }}>
        <div className="grid">
          <div className="card">
            <h2>Submit Podcast</h2>
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
                Host
                <input
                  value={form.host}
                  onChange={(event) => setForm((prev) => ({ ...prev, host: event.target.value }))}
                  required
                />
              </label>
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
                Name of Episode(s)
                <input
                  value={form.episodeNames}
                  onChange={(event) => setForm((prev) => ({ ...prev, episodeNames: event.target.value }))}
                  required
                />
              </label>
              <label>
                Total Time (approx min)
                <input
                  type="number"
                  min={1}
                  value={form.totalTimeMinutes}
                  onChange={(event) => setForm((prev) => ({ ...prev, totalTimeMinutes: event.target.value }))}
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

          {discussed.length > 0 ? (
            <div className="card podcasts-previously-discussed-card">
              <h3>Podcasts Previously Discussed</h3>
              <div className="list" style={{ marginTop: '0.75rem' }}>
                {recentDiscussed.map((podcast) => (
                  <div className="item" key={podcast._id}>
                    <div className="inline podcast-item-head" style={{ justifyContent: 'space-between' }}>
                      <h4>{podcast.title}</h4>
                      <span className="badge">Discussed</span>
                    </div>
                    <p>
                      <strong>Description:</strong> {podcast.notes || 'No description yet.'}
                    </p>
                    <p>
                      <strong>Link:</strong>{' '}
                      <a href={podcast.link} target="_blank" rel="noreferrer">
                        {podcast.link}
                      </a>
                    </p>
                    {canDeletePodcast(podcast) ? (
                      <div className="inline" style={{ marginTop: '0.4rem' }}>
                        <button className="secondary" onClick={() => openDeleteModal(podcast)}>
                          Delete Podcast
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="inline" style={{ marginTop: '0.75rem' }}>
                <button type="button" className="secondary" onClick={() => setShowAllDiscussed((prev) => !prev)}>
                  {showAllDiscussed ? 'Show Recent Podcasts' : 'Show All Podcasts'}
                </button>
              </div>
              {showAllDiscussed ? (
                <div className="list" style={{ marginTop: '0.75rem' }}>
                  {remainingDiscussed.length === 0 ? <p>No additional previously discussed podcasts.</p> : null}
                  {remainingDiscussed.map((podcast) => (
                    <div className="item" key={`discussed-all-${podcast._id}`}>
                      <div className="inline podcast-item-head" style={{ justifyContent: 'space-between' }}>
                        <h4>{podcast.title}</h4>
                        <span className="badge">Discussed</span>
                      </div>
                      <p>
                        <strong>Description:</strong> {podcast.notes || 'No description yet.'}
                      </p>
                      <p>
                        <strong>Link:</strong>{' '}
                        <a href={podcast.link} target="_blank" rel="noreferrer">
                          {podcast.link}
                        </a>
                      </p>
                      {canDeletePodcast(podcast) ? (
                        <div className="inline" style={{ marginTop: '0.4rem' }}>
                          <button className="secondary" onClick={() => openDeleteModal(podcast)}>
                            Delete Podcast
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="grid">
        <div className="card podcasts-to-rank-card">
          <h2 style={{ marginTop: 0 }}>Podcasts to Rank</h2>
          {podcastsToRank.length > 0 ? <p>Rate each pending podcast. Rankings use your point system from the sheet.</p> : null}

          <div className="list" style={{ marginTop: '0.75rem' }}>
            {podcastsToRank.length === 0 ? <p>No podcasts left to rank.</p> : null}
            {podcastsToRank.map((podcast) => (
              <div
                className={`item${recentlySavedRatings[podcast._id]?.fading ? ' item-fading-out' : ''}`}
                key={podcast._id}
              >
                <div className="inline podcast-item-head" style={{ justifyContent: 'space-between' }}>
                  <h4>{podcast.title}</h4>
                  {savedRatings[podcast._id] === 'My podcast' ? <span className="badge my-podcast">My Podcast</span> : null}
                </div>
                <p>
                  <strong>Ranking score:</strong> {podcast.rankingScore}
                </p>
                <details className="podcast-details">
                  <summary>Details</summary>
                  <div className="podcast-details-body">{renderPodcastDetails(podcast)}</div>
                </details>
                {podcast.missingVoters.length > 0 ? (
                  <p className="warning-banner">
                    <strong>Warning:</strong> Missing votes from {formatMissingVoters(podcast.missingVoters)}
                  </p>
                ) : (
                  <p>
                    <strong>All members have rated.</strong>
                  </p>
                )}
                {recentlySavedRatings[podcast._id] ? (
                  <p className="success-message rating-confirmation">
                    Saved: {recentlySavedRatings[podcast._id].value}. This podcast will move out of your ranking queue.
                  </p>
                ) : null}
                {renderRatingActions(podcast, 'Save Rating')}
              </div>
            ))}
          </div>
        </div>

        <div className="card podcasts-to-discuss-page-card">
          <h2 style={{ marginTop: 0 }}>Podcasts To Discuss</h2>
          <p>Pending podcasts not assigned to a meeting yet, ranked highest to lowest.</p>

          <div className="list" style={{ marginTop: '0.75rem' }}>
            {recentPodcastsToDiscuss.length === 0 ? <p>No podcasts to discuss right now.</p> : null}
            {recentPodcastsToDiscuss.map((podcast) => (
              <div className="item" key={`ranked-${podcast._id}`}>
                <div className="inline podcast-item-head" style={{ justifyContent: 'space-between' }}>
                  <h4>{podcast.title}</h4>
                  <div className="inline" style={{ gap: '0.35rem' }}>
                    <span className="badge ranking-score">Score: {podcast.rankingScore}</span>
                    {savedRatings[podcast._id] === 'My podcast' ? <span className="badge my-podcast">My Podcast</span> : null}
                  </div>
                </div>
                <details className="podcast-details">
                  <summary>Details</summary>
                  <div className="podcast-details-body">{renderPodcastDetails(podcast)}</div>
                </details>
                {podcast.missingVoters.length > 0 ? (
                  <p className="warning-banner">
                    <strong>Warning:</strong> Missing votes from {formatMissingVoters(podcast.missingVoters)}
                  </p>
                ) : (
                  <p>
                    <strong>All members have rated.</strong>
                  </p>
                )}
                <p>
                  <strong>Your rating:</strong> {savedRatings[podcast._id]}
                </p>
                {renderRatingActions(podcast, 'Update Rating')}
              </div>
            ))}
          </div>
          <div className="inline" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="secondary" onClick={() => setShowAllPodcastsToDiscuss((prev) => !prev)}>
              {showAllPodcastsToDiscuss ? 'Show Recent Podcasts' : 'Show All Podcasts'}
            </button>
          </div>
          {showAllPodcastsToDiscuss ? (
            <div className="list" style={{ marginTop: '0.75rem' }}>
              {remainingPodcastsToDiscuss.length === 0 ? <p>No additional podcasts to discuss.</p> : null}
              {remainingPodcastsToDiscuss.map((podcast) => (
                <div className="item" key={`ranked-all-${podcast._id}`}>
                  <div className="inline podcast-item-head" style={{ justifyContent: 'space-between' }}>
                    <h4>{podcast.title}</h4>
                    <div className="inline" style={{ gap: '0.35rem' }}>
                      <span className="badge ranking-score">Score: {podcast.rankingScore}</span>
                      {savedRatings[podcast._id] === 'My podcast' ? (
                        <span className="badge my-podcast">My Podcast</span>
                      ) : null}
                    </div>
                  </div>
                  <details className="podcast-details">
                    <summary>Details</summary>
                    <div className="podcast-details-body">{renderPodcastDetails(podcast)}</div>
                  </details>
                  {podcast.missingVoters.length > 0 ? (
                    <p className="warning-banner">
                      <strong>Warning:</strong> Missing votes from {formatMissingVoters(podcast.missingVoters)}
                    </p>
                  ) : (
                    <p>
                      <strong>All members have rated.</strong>
                    </p>
                  )}
                  <p>
                    <strong>Your rating:</strong> {savedRatings[podcast._id]}
                  </p>
                  {renderRatingActions(podcast, 'Update Rating')}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        </div>
      </div>

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
