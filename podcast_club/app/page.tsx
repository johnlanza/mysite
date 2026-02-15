'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { withBasePath } from '@/lib/base-path';
import type { CarveOut, Meeting, Podcast, SessionMember } from '@/lib/types';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function isCompletedMeeting(meeting: Meeting) {
  if (meeting.status === 'completed') return true;
  if (meeting.status === 'scheduled') return false;
  if (meeting.completedAt) return true;
  return new Date(meeting.date).getTime() < Date.now();
}

export default function HomePage() {
  const [member, setMember] = useState<SessionMember | null>(null);
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [carveOuts, setCarveOuts] = useState<CarveOut[]>([]);
  const [showAllCarveOuts, setShowAllCarveOuts] = useState(false);
  const [showAllDiscussedPodcasts, setShowAllDiscussedPodcasts] = useState(false);
  const [showAllPodcastsToDiscuss, setShowAllPodcastsToDiscuss] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);

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
      } else {
        setMember(null);
        setMeetings([]);

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

  const pending = useMemo(() => podcasts.filter((podcast) => podcast.status === 'pending'), [podcasts]);
  const recentPendingPodcasts = useMemo(() => pending.slice(0, 3), [pending]);

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
  const displayMemberName = (person: { _id: string; name: string }) =>
    member && person._id === member._id ? 'You' : person.name;
  const annotateSelfInList = (name: string) =>
    member && name.trim().toLowerCase() === member.name.trim().toLowerCase() ? `${name} (you)` : name;
  const formatMissingVoters = (names: string[]) =>
    names.length > 0 ? names.map((name) => annotateSelfInList(name)).join(', ') : 'None';

  if (loading) {
    return (
      <section className="grid" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h2>Home</h2>
          <p>Loading...</p>
        </div>
      </section>
    );
  }

  if (!member) {
    return (
      <section className="grid two" style={{ marginTop: '1rem' }}>
        <div className="card discussed-card">
          <h3>Podcasts Previously Discussed</h3>
          <div className="list">
            {recentDiscussedPodcasts.length === 0 ? <p>No previously discussed podcasts.</p> : null}
            {recentDiscussedPodcasts.map((podcast) => (
              <div className="item" key={`public-home-discussed-${podcast._id}`}>
                <h4>{podcast.title}</h4>
                <p>
                  <strong>Description:</strong> {podcast.notes || 'No description yet.'}
                </p>
                <p>
                  <strong>Link:</strong>{' '}
                  <a href={podcast.link} target="_blank" rel="noreferrer">
                    {podcast.link}
                  </a>
                </p>
              </div>
            ))}
          </div>
          <div className="inline" style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setShowAllDiscussedPodcasts((prev) => !prev)}
            >
              {showAllDiscussedPodcasts ? 'Show Recent Podcasts' : 'Show All Podcasts'}
            </button>
          </div>
          {showAllDiscussedPodcasts ? (
            <div className="list" style={{ marginTop: '0.75rem' }}>
              {allDiscussedPodcasts.length === 0 ? <p>No previously discussed podcasts.</p> : null}
              {allDiscussedPodcasts.map((podcast) => (
                <div className="item" key={`public-home-discussed-all-${podcast._id}`}>
                  <h4>{podcast.title}</h4>
                  <p>
                    <strong>Description:</strong> {podcast.notes || 'No description yet.'}
                  </p>
                  <p>
                    <strong>Link:</strong>{' '}
                    <a href={podcast.link} target="_blank" rel="noreferrer">
                      {podcast.link}
                    </a>
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="card carveouts-card">
          <h3>Carve Outs</h3>
          <div className="list">
            {recentCarveOuts.length === 0 ? <p>No carve outs yet.</p> : null}
            {recentCarveOuts.map((carveOut) => (
              <div className="item" key={`public-home-carveout-${carveOut._id}`}>
                <div className="inline" style={{ justifyContent: 'space-between' }}>
                  <h4>{carveOut.title}</h4>
                  <span className="badge">{carveOut.type}</span>
                </div>
                <p>
                  <strong>Meeting:</strong> {formatDate(carveOut.meeting.date)}
                </p>
                {carveOut.url ? (
                  <p>
                    <a href={carveOut.url} target="_blank" rel="noreferrer">
                      {carveOut.url}
                    </a>
                  </p>
                ) : null}
                {carveOut.notes ? <p>{carveOut.notes}</p> : null}
              </div>
            ))}
          </div>
          <div className="inline" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="secondary" onClick={() => setShowAllCarveOuts((prev) => !prev)}>
              {showAllCarveOuts ? 'Show Recent Carve Outs' : 'Show All Carve Outs'}
            </button>
          </div>
          {showAllCarveOuts ? (
            <div className="list" style={{ marginTop: '0.75rem' }}>
              {allCarveOuts.length === 0 ? <p>No carve outs yet.</p> : null}
              {allCarveOuts.map((carveOut) => (
                <div className="item" key={`public-home-carveout-all-${carveOut._id}`}>
                  <div className="inline" style={{ justifyContent: 'space-between' }}>
                    <h4>{carveOut.title}</h4>
                    <span className="badge">{carveOut.type}</span>
                  </div>
                  <p>
                    <strong>Meeting:</strong> {formatDate(carveOut.meeting.date)}
                  </p>
                  {carveOut.url ? (
                    <p>
                      <a href={carveOut.url} target="_blank" rel="noreferrer">
                        {carveOut.url}
                      </a>
                    </p>
                  ) : null}
                  {carveOut.notes ? <p>{carveOut.notes}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="grid two" style={{ marginTop: '1rem' }}>
      <div className="card">
        <h2>Next Meeting</h2>
        {nextMeeting ? (
          <div className="item">
            <h4>{formatDate(nextMeeting.date)}</h4>
            <p>
              <strong>Host:</strong> {displayMemberName(nextMeeting.host)}
            </p>
            <p>
              <strong>Podcast:</strong> {nextMeeting.podcast?.title || <span className="badge tbd">TBD</span>}
            </p>
            {nextMeeting.podcast?.host ? (
              <p>
                <strong>Podcast Host:</strong> {nextMeeting.podcast?.host}
              </p>
            ) : null}
            {nextMeeting.podcast?.link ? (
              <p>
                <strong>Link:</strong>{' '}
                <a href={nextMeeting.podcast?.link} target="_blank" rel="noreferrer">
                  {nextMeeting.podcast?.link}
                </a>
              </p>
            ) : null}
            <p>
              <strong>Location:</strong> {nextMeeting.location}
            </p>
          </div>
        ) : (
          <p>No upcoming meeting scheduled yet.</p>
        )}
      </div>

      <div className="card">
        <h3>Podcasts You Need to Rank</h3>
        {!member ? <p>Sign in to see your personal ranking queue.</p> : null}
        <div className="list">
          {member && podcastsToRank.length === 0 ? <p>You have ranked all available podcasts.</p> : null}
          {(member ? podcastsToRank : pending).map((podcast) => (
            <div key={`rank-queue-${podcast._id}`} className="item">
              <h4>{podcast.title}</h4>
              <p>
                <strong>Host:</strong> {podcast.host || 'Unknown'}
              </p>
              <p>
                <strong>Episode(s):</strong> {podcast.episodeNames || 'Unknown'}
              </p>
              <p>
                <a href={podcast.link} target="_blank" rel="noreferrer">
                  {podcast.link}
                </a>
              </p>
            </div>
          ))}
        </div>
        <p>
          <Link className="nav-link" href="/podcasts">
            Rank Podcasts
          </Link>
        </p>
      </div>

      <div className="card podcasts-to-discuss-card">
        <h3>Podcasts To Discuss</h3>
        <div className="list">
          {recentPendingPodcasts.length === 0 ? <p>No recent pending podcasts.</p> : null}
          {recentPendingPodcasts.map((podcast) => (
            <div key={podcast._id} className="item">
              <h4>{podcast.title}</h4>
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
                <strong>Ranking:</strong> {podcast.rankingScore}
              </p>
              {podcast.missingVoters.length > 0 ? (
                <p className="warning-banner">
                  <strong>Warning:</strong> Missing votes from {formatMissingVoters(podcast.missingVoters)}
                </p>
              ) : (
                <p>
                  <strong>All members have rated.</strong>
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="inline" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowAllPodcastsToDiscuss((prev) => !prev)}
          >
            {showAllPodcastsToDiscuss ? 'Show Recent Podcasts' : 'Show All Podcasts'}
          </button>
        </div>
        {showAllPodcastsToDiscuss ? (
          <div className="list" style={{ marginTop: '0.75rem' }}>
            {pending.length === 0 ? <p>No pending podcasts.</p> : null}
            {pending.map((podcast) => (
              <div key={`pending-all-${podcast._id}`} className="item">
                <h4>{podcast.title}</h4>
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
                  <strong>Ranking:</strong> {podcast.rankingScore}
                </p>
                {podcast.missingVoters.length > 0 ? (
                  <p className="warning-banner">
                    <strong>Warning:</strong> Missing votes from {formatMissingVoters(podcast.missingVoters)}
                  </p>
                ) : (
                  <p>
                    <strong>All members have rated.</strong>
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card carveouts-card">
        <h3>Carve Outs</h3>

        <div className="list">
          {recentCarveOuts.length === 0 ? <p>No recent carve outs.</p> : null}
          {recentCarveOuts.map((carveOut) => (
            <div className="item" key={carveOut._id}>
              <div className="inline" style={{ justifyContent: 'space-between' }}>
                <h4>{carveOut.title}</h4>
                <span className="badge">{carveOut.type}</span>
              </div>
              <p>
                <strong>Shared by:</strong> {displayMemberName(carveOut.member)}
              </p>
              <p>
                <strong>Meeting:</strong> {formatDate(carveOut.meeting.date)}
              </p>
              <p>
                <strong>Link:</strong>{' '}
                {carveOut.url ? (
                  <a href={carveOut.url} target="_blank" rel="noreferrer">
                    {carveOut.url}
                  </a>
                ) : (
                  'No link provided.'
                )}
              </p>
            </div>
          ))}
        </div>

        <div className="inline" style={{ marginTop: '0.75rem' }}>
          <button type="button" className="secondary" onClick={() => setShowAllCarveOuts((prev) => !prev)}>
            {showAllCarveOuts ? 'Show Recent Carve Outs' : 'Show All Carve Outs'}
          </button>
        </div>

        {showAllCarveOuts ? (
          <div className="list" style={{ marginTop: '0.75rem' }}>
            {allCarveOuts.length === 0 ? <p>No carve outs yet.</p> : null}
            {allCarveOuts.map((carveOut) => (
              <div className="item" key={`all-${carveOut._id}`}>
                <div className="inline" style={{ justifyContent: 'space-between' }}>
                  <h4>{carveOut.title}</h4>
                  <span className="badge">{carveOut.type}</span>
                </div>
                <p>
                  <strong>Meeting:</strong> {formatDate(carveOut.meeting.date)}
                </p>
                <p>
                  <strong>Shared by:</strong> {displayMemberName(carveOut.member)}
                </p>
                <p>
                  <strong>Link:</strong>{' '}
                  {carveOut.url ? (
                    <a href={carveOut.url} target="_blank" rel="noreferrer">
                      {carveOut.url}
                    </a>
                  ) : (
                    'No link provided.'
                  )}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card discussed-card">
        <h3>Podcasts Discussed</h3>
        <div className="list">
          {recentDiscussedPodcasts.length === 0 ? <p>No recent discussed podcasts yet.</p> : null}
          {recentDiscussedPodcasts.map((podcast) => (
            <div className="item" key={`home-discussed-${podcast._id}`}>
              <div className="inline" style={{ justifyContent: 'space-between' }}>
                <h4>{podcast.title}</h4>
                <span className="badge">Discussed</span>
              </div>
              <p>
                <strong>Meeting:</strong>{' '}
                {podcast.discussedMeetingDate ? formatDate(podcast.discussedMeetingDate) : 'Unknown'}
              </p>
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
                <strong>Final ranking:</strong> {podcast.rankingScore}
              </p>
            </div>
          ))}
        </div>
        <div className="inline" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowAllDiscussedPodcasts((prev) => !prev)}
          >
            {showAllDiscussedPodcasts ? 'Show Recent Podcasts' : 'Show All Podcasts'}
          </button>
        </div>
        {showAllDiscussedPodcasts ? (
          <div className="list" style={{ marginTop: '0.75rem' }}>
            {allDiscussedPodcasts.length === 0 ? <p>No discussed podcasts yet.</p> : null}
            {allDiscussedPodcasts.map((podcast) => (
              <div className="item" key={`home-discussed-all-${podcast._id}`}>
                <div className="inline" style={{ justifyContent: 'space-between' }}>
                  <h4>{podcast.title}</h4>
                  <span className="badge">Discussed</span>
                </div>
                <p>
                  <strong>Meeting:</strong>{' '}
                  {podcast.discussedMeetingDate ? formatDate(podcast.discussedMeetingDate) : 'Unknown'}
                </p>
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
                  <strong>Final ranking:</strong> {podcast.rankingScore}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
