'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { withBasePath } from '@/lib/base-path';
import type { Podcast, SessionMember } from '@/lib/types';
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

export default function PodcastsPage() {
  const [member, setMember] = useState<SessionMember | null>(null);
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [form, setForm] = useState(initialForm);
  const [savedRatings, setSavedRatings] = useState<Record<string, string>>({});
  const [draftRatings, setDraftRatings] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingPodcastId, setDeletingPodcastId] = useState<string | null>(null);
  const [deleteModalPodcast, setDeleteModalPodcast] = useState<Podcast | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showAllRanked, setShowAllRanked] = useState(false);
  const [showAllDiscussed, setShowAllDiscussed] = useState(false);

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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
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
    setSaving(false);
  }

  async function saveRating(podcastId: string) {
    const targetPodcast = podcasts.find((podcast) => podcast._id === podcastId);
    const isSubmitter = targetPodcast ? targetPodcast.submittedBy._id === member?._id : false;
    const rating = draftRatings[podcastId] || 'No selection';

    if (isSubmitter && rating !== 'My podcast') {
      setError('You cannot change your own submitted podcast rating from "My podcast".');
      return;
    }

    const res = await fetch(`/api/podcasts/${podcastId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating })
    });

    if (!res.ok) {
      const payload = await res.json();
      setError(payload.message || 'Unable to save rating.');
      return;
    }

    setSavedRatings((prev) => ({ ...prev, [podcastId]: rating }));
    await loadPageData();
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

    const res = await fetch(`/api/podcasts/${deleteModalPodcast._id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmText: deleteConfirmText })
    });

    const payload = await res.json();
    if (!res.ok) {
      setError(payload.message || 'Unable to delete podcast.');
      setDeletingPodcastId(null);
      return;
    }

    setDeleteModalPodcast(null);
    setDeleteConfirmText('');
    setDeletingPodcastId(null);
    await loadPageData();
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
    return pending.filter((podcast) => (savedRatings[podcast._id] || 'No selection') === 'No selection');
  }, [pending, savedRatings]);
  const podcastsRankedByYou = useMemo(() => {
    return pending.filter((podcast) => (savedRatings[podcast._id] || 'No selection') !== 'No selection');
  }, [pending, savedRatings]);
  const recentRankedByYou = useMemo(() => podcastsRankedByYou.slice(0, 3), [podcastsRankedByYou]);
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
      setError('You cannot change your own submitted podcast rating from "My podcast".');
      return;
    }

    setDraftRatings((prev) => ({
      ...prev,
      [podcast._id]: value
    }));
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
      <div className="grid two" style={{ alignItems: 'start' }}>
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
          {error ? <p className="error">{error}</p> : null}
        </form>
        </div>

        <div className="grid">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Podcasts to Rank</h2>
          <p>Rate each pending podcast. Rankings use your point system from the sheet.</p>

          <div className="list" style={{ marginTop: '0.75rem' }}>
            {podcastsToRank.length === 0 ? <p>No podcasts left to rank.</p> : null}
            {podcastsToRank.map((podcast) => (
              <div className="item" key={podcast._id}>
                <div className="inline podcast-item-head" style={{ justifyContent: 'space-between' }}>
                  <h4>{podcast.title}</h4>
                  {savedRatings[podcast._id] === 'My podcast' ? <span className="badge my-podcast">My Podcast</span> : null}
                </div>
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
                <p>
                  <strong>Ranking score:</strong> {podcast.rankingScore}
                </p>
                <p>
                  <strong>Missing voters:</strong>{' '}
                  {formatMissingVoters(podcast.missingVoters)}
                </p>

                <div className="inline">
                  {podcast.submittedBy._id === member._id ? <span className="badge">Locked: your submission</span> : null}
                  <select
                    value={draftRatings[podcast._id] || 'No selection'}
                    onChange={(event) => onDraftRatingChange(podcast, event.target.value)}
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
                  <button onClick={() => saveRating(podcast._id)}>Save Rating</button>
                  {canDeletePodcast(podcast) ? (
                    <button className="secondary" onClick={() => openDeleteModal(podcast)}>
                      Delete Podcast
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Podcasts You've Ranked</h2>
          <p>You can change your ranking at any time.</p>

          <div className="list" style={{ marginTop: '0.75rem' }}>
            {recentRankedByYou.length === 0 ? <p>You have not ranked any pending podcasts yet.</p> : null}
            {recentRankedByYou.map((podcast) => (
              <div className="item" key={`ranked-${podcast._id}`}>
                <div className="inline podcast-item-head" style={{ justifyContent: 'space-between' }}>
                  <h4>{podcast.title}</h4>
                  {savedRatings[podcast._id] === 'My podcast' ? <span className="badge my-podcast">My Podcast</span> : null}
                </div>
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
                <p>
                  <strong>Ranking score:</strong> {podcast.rankingScore}
                </p>
                <p>
                  <strong>Missing voters:</strong>{' '}
                  {formatMissingVoters(podcast.missingVoters)}
                </p>
                <p>
                  <strong>Your rating:</strong> {savedRatings[podcast._id]}
                </p>
                <div className="inline">
                  {podcast.submittedBy._id === member._id ? <span className="badge">Locked: your submission</span> : null}
                  <select
                    value={draftRatings[podcast._id] || 'No selection'}
                    onChange={(event) => onDraftRatingChange(podcast, event.target.value)}
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
                  <button onClick={() => saveRating(podcast._id)}>Update Rating</button>
                  {canDeletePodcast(podcast) ? (
                    <button className="secondary" onClick={() => openDeleteModal(podcast)}>
                      Delete Podcast
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="inline" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="secondary" onClick={() => setShowAllRanked((prev) => !prev)}>
              {showAllRanked ? 'Show Recent Podcasts' : 'Show All Podcasts'}
            </button>
          </div>
          {showAllRanked ? (
            <div className="list" style={{ marginTop: '0.75rem' }}>
              {podcastsRankedByYou.length === 0 ? <p>You have not ranked any pending podcasts yet.</p> : null}
              {podcastsRankedByYou.map((podcast) => (
                <div className="item" key={`ranked-all-${podcast._id}`}>
                  <div className="inline podcast-item-head" style={{ justifyContent: 'space-between' }}>
                    <h4>{podcast.title}</h4>
                    {savedRatings[podcast._id] === 'My podcast' ? (
                      <span className="badge my-podcast">My Podcast</span>
                    ) : null}
                  </div>
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
                  <p>
                    <strong>Ranking score:</strong> {podcast.rankingScore}
                  </p>
                  <p>
                    <strong>Missing voters:</strong>{' '}
                    {formatMissingVoters(podcast.missingVoters)}
                  </p>
                  <p>
                    <strong>Your rating:</strong> {savedRatings[podcast._id]}
                  </p>
                  <div className="inline">
                    {podcast.submittedBy._id === member._id ? <span className="badge">Locked: your submission</span> : null}
                    <select
                      value={draftRatings[podcast._id] || 'No selection'}
                      onChange={(event) => onDraftRatingChange(podcast, event.target.value)}
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
                    <button onClick={() => saveRating(podcast._id)}>Update Rating</button>
                    {canDeletePodcast(podcast) ? (
                      <button className="secondary" onClick={() => openDeleteModal(podcast)}>
                        Delete Podcast
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {discussed.length > 0 ? (
          <div className="card">
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
                  <p>
                    <strong>Final ranking score:</strong> {podcast.rankingScore}
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
                {discussed.map((podcast) => (
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
                    <p>
                      <strong>Final ranking score:</strong> {podcast.rankingScore}
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
