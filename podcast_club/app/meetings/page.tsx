'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { withBasePath } from '@/lib/base-path';
import { MAX_MEETING_PODCASTS } from '@/lib/meeting-podcasts';
import type { Meeting, Member, Podcast, SessionMember } from '@/lib/types';

const initialForm = {
  date: '',
  host: '',
  podcasts: [] as string[],
  location: '',
  notes: ''
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function getHostAddress(hostId: string, members: Member[]) {
  return members.find((member) => member._id === hostId)?.address || '';
}

function isCompletedMeeting(meeting: Meeting) {
  if (meeting.status === 'completed') return true;
  if (meeting.status === 'scheduled') return false;
  if (meeting.completedAt) return true;
  return false;
}

function getMeetingPodcasts(meeting: Meeting) {
  if (meeting.podcasts && meeting.podcasts.length > 0) return meeting.podcasts;
  return meeting.podcast ? [meeting.podcast] : [];
}

function toDateInputValue(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function getHostname(link?: string) {
  if (!link) return '';
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export default function MeetingsPage() {
  const [currentMember, setCurrentMember] = useState<SessionMember | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [workingMeetingId, setWorkingMeetingId] = useState<string | null>(null);
  const [showAllPastMeetings, setShowAllPastMeetings] = useState(false);
  const [completeModalMeeting, setCompleteModalMeeting] = useState<Meeting | null>(null);
  const [completeNotes, setCompleteNotes] = useState('');
  const [deleteModalMeeting, setDeleteModalMeeting] = useState<Meeting | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  async function loadPageData() {
    const meRes = await fetch(withBasePath('/api/auth/me'), { cache: 'no-store' });
    if (!meRes.ok) {
      setCurrentMember(null);
      return;
    }

    const mePayload = await meRes.json();
    setCurrentMember(mePayload.member);

    const [memberRes, podcastRes, meetingRes] = await Promise.all([
      fetch(withBasePath('/api/members')),
      fetch(withBasePath('/api/podcasts')),
      fetch(withBasePath('/api/meetings'))
    ]);

    if (!memberRes.ok || !podcastRes.ok || !meetingRes.ok) return;

    const [memberData, podcastData, meetingData] = await Promise.all([
      memberRes.json(),
      podcastRes.json(),
      meetingRes.json()
    ]);

    setMembers(memberData);
    setPodcasts(podcastData);
    setMeetings(meetingData);

    setForm((prev) => {
      const host = prev.host || memberData[0]?._id || '';
      return {
        ...prev,
        host,
        podcasts: prev.podcasts || [],
        location: prev.location || getHostAddress(host, memberData)
      };
    });
  }

  useEffect(() => {
    void loadPageData();
  }, []);

  const nextMeeting = useMemo(() => {
    return meetings
      .filter((meeting) => !isCompletedMeeting(meeting))
      .sort((a, b) => +new Date(a.date) - +new Date(b.date))[0];
  }, [meetings]);

  const availablePodcasts = useMemo(() => podcasts.filter((podcast) => podcast.status === 'pending'), [podcasts]);
  const selectedPodcasts = useMemo(() => {
    return form.podcasts
      .map((podcastId) => podcasts.find((podcast) => podcast._id === podcastId))
      .filter((podcast): podcast is Podcast => Boolean(podcast));
  }, [form.podcasts, podcasts]);
  const podcastOptions = useMemo(() => {
    const selectedIds = new Set(form.podcasts);
    const selectedMissingFromPending = selectedPodcasts.filter(
      (podcast) => !availablePodcasts.some((availablePodcast) => availablePodcast._id === podcast._id)
    );

    return [...selectedMissingFromPending, ...availablePodcasts].filter((podcast) => !selectedIds.has(podcast._id));
  }, [availablePodcasts, form.podcasts, selectedPodcasts]);

  const pastMeetings = useMemo(() => {
    return meetings
      .filter((meeting) => isCompletedMeeting(meeting) || meeting._id !== nextMeeting?._id)
      .filter((meeting) => meeting._id !== nextMeeting?._id)
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [meetings, nextMeeting]);
  const recentPastMeetings = useMemo(() => pastMeetings.slice(0, 3), [pastMeetings]);
  const remainingPastMeetings = useMemo(() => pastMeetings.slice(3), [pastMeetings]);

  function resetFormToCreate() {
    setEditingMeetingId(null);
    const host = members[0]?._id || '';
    setForm({
      ...initialForm,
      host,
      podcasts: [],
      location: getHostAddress(host, members)
    });
  }

  function startEditMeeting(meeting: Meeting) {
    setEditingMeetingId(meeting._id);
    setError('');
    setForm({
      date: toDateInputValue(meeting.date),
      host: meeting.host._id,
      podcasts: getMeetingPodcasts(meeting).map((podcast) => podcast._id),
      location: meeting.location,
      notes: meeting.notes || ''
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);

    try {
      const payload = {
        ...form,
        podcasts: form.podcasts,
        date: new Date(form.date).toISOString()
      };

      const endpoint = editingMeetingId
        ? withBasePath(`/api/meetings/${editingMeetingId}`)
        : withBasePath('/api/meetings');
      const res = await fetch(endpoint, {
        method: editingMeetingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setError(data?.message || 'Unable to save meeting.');
        return;
      }

      resetFormToCreate();
      await loadPageData();
    } catch {
      setError('Unable to save meeting.');
    } finally {
      setSaving(false);
    }
  }

  function openCompleteMeetingModal(meeting: Meeting) {
    setError('');
    setCompleteModalMeeting(meeting);
    setCompleteNotes(meeting.notes || '');
  }

  function closeCompleteMeetingModal() {
    if (workingMeetingId) return;
    setCompleteModalMeeting(null);
    setCompleteNotes('');
  }

  async function confirmCompleteMeeting() {
    if (!completeModalMeeting) return;

    if (!completeNotes.trim()) {
      setError('Please enter meeting notes before completing the meeting.');
      return;
    }

    setError('');
    setWorkingMeetingId(completeModalMeeting._id);
    try {
      const res = await fetch(withBasePath(`/api/meetings/${completeModalMeeting._id}/complete`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: completeNotes })
      });

      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setError(payload?.message || 'Unable to complete meeting.');
        return;
      }

      setCompleteModalMeeting(null);
      setCompleteNotes('');
      await loadPageData();
    } catch {
      setError('Unable to complete meeting.');
    } finally {
      setWorkingMeetingId(null);
    }
  }

  function openDeleteMeetingModal(meeting: Meeting) {
    setError('');
    setDeleteModalMeeting(meeting);
    setDeleteConfirmText('');
  }

  function closeDeleteMeetingModal() {
    if (workingMeetingId) return;
    setDeleteModalMeeting(null);
    setDeleteConfirmText('');
  }

  async function confirmDeleteMeeting() {
    if (!deleteModalMeeting) return;
    const meeting = deleteModalMeeting;
    const completed = isCompletedMeeting(meeting);
    if (completed && deleteConfirmText !== 'DELETE') {
      setError('Past meeting deletion requires typing DELETE exactly.');
      return;
    }

    setError('');
    setWorkingMeetingId(meeting._id);

    try {
      const res = await fetch(withBasePath(`/api/meetings/${meeting._id}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(completed ? { confirmText: deleteConfirmText } : {})
      });

      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setError(payload?.message || 'Unable to delete meeting.');
        return;
      }

      if (editingMeetingId === meeting._id) {
        resetFormToCreate();
      }

      setDeleteModalMeeting(null);
      setDeleteConfirmText('');
      await loadPageData();
    } catch {
      setError('Unable to delete meeting.');
    } finally {
      setWorkingMeetingId(null);
    }
  }

  if (!currentMember) {
    return (
      <section className="grid" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h2>Meetings</h2>
          <p>Please login to view meetings.</p>
          <Link className="nav-link" href="/login">
            Go to Login
          </Link>
        </div>
      </section>
    );
  }

  const editingMeeting = editingMeetingId ? meetings.find((meeting) => meeting._id === editingMeetingId) || null : null;
  const canManageMeetingForm = Boolean(
    currentMember.isAdmin || (editingMeeting && editingMeeting.host._id === currentMember._id)
  );
  const canEditMeeting = (meeting: Meeting) => currentMember.isAdmin || meeting.host._id === currentMember._id;
  const isCurrentMemberHost = (meeting: Meeting) => meeting.host._id === currentMember._id;
  const displayMemberName = (person: { _id: string; name: string }) =>
    person._id === currentMember._id ? 'You' : person.name;
  const annotateSelfInList = (person: { _id: string; name: string }) =>
    person._id === currentMember._id ? `${person.name} (you)` : person.name;
  const renderMeetingPodcasts = (meeting: Meeting) => {
    const selectedMeetingPodcasts = getMeetingPodcasts(meeting);

    if (selectedMeetingPodcasts.length === 0) {
      return <p>Awaiting host podcast picks.</p>;
    }

    return (
      <div className="list">
        {selectedMeetingPodcasts.map((podcast) => (
          <div className="item" key={podcast._id}>
            <p>
              <strong>Title:</strong> {podcast.title}
              {podcast.host ? ` (${podcast.host})` : ''}
            </p>
            {podcast.notes ? (
              <p>
                <strong>Description:</strong> {podcast.notes}
              </p>
            ) : null}
            {podcast.link ? (
              <p>
                <strong>Link:</strong>{' '}
                <a href={podcast.link} target="_blank" rel="noreferrer">
                  {podcast.link}
                </a>
              </p>
            ) : null}
            {podcast.submittedBy ? (
              <p>
                <strong>Submitted by:</strong> {displayMemberName(podcast.submittedBy)}
                {podcast.submittedBy._id === currentMember._id ? (
                  <span className="badge my-podcast" style={{ marginLeft: '0.4rem' }}>My Podcast</span>
                ) : null}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  return (
    <section className="meetings-page grid" style={{ marginTop: '1rem' }}>
      <div className="grid two">
        <div className="card">
          <h2>{editingMeetingId ? 'Edit Meeting' : 'Schedule / Log Meeting'}</h2>
          {canManageMeetingForm ? (
            <form className="form" onSubmit={onSubmit}>
              <label>
                Date
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                  required
                />
              </label>
              <label>
                Host
                <select
                  value={form.host}
                  disabled={!currentMember.isAdmin}
                  onChange={(event) => {
                    const host = event.target.value;
                    setForm((prev) => ({ ...prev, host, location: getHostAddress(host, members) }));
                  }}
                  required
                >
                  {members.map((member) => (
                    <option key={member._id} value={member._id}>
                      {annotateSelfInList(member)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Podcasts
                <div className="list">
                  {selectedPodcasts.length === 0 ? <p>No podcasts selected yet. Leave empty for TBD.</p> : null}
                  {selectedPodcasts.map((podcast) => (
                    <div className="item" key={podcast._id}>
                      <div className="inline" style={{ justifyContent: 'space-between' }}>
                        <div>
                          <strong>{podcast.title}</strong>
                          <p>
                            {podcast.episodeNames ? `${podcast.episodeNames} | ` : ''}
                            {podcast.totalTimeMinutes ? `${podcast.totalTimeMinutes} min | ` : ''}
                            {getHostname(podcast.link) || podcast.link}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              podcasts: prev.podcasts.filter((podcastId) => podcastId !== podcast._id)
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {form.podcasts.length < MAX_MEETING_PODCASTS ? (
                    <select
                      value=""
                      onChange={(event) => {
                        const podcastId = event.target.value;
                        if (!podcastId) return;
                        setForm((prev) => ({
                          ...prev,
                          podcasts: [...prev.podcasts, podcastId]
                        }));
                      }}
                    >
                      <option value="">Add a podcast...</option>
                      {podcastOptions.map((podcast) => (
                        <option key={podcast._id} value={podcast._id}>
                          {podcast.title}
                          {podcast.episodeNames ? ` | ${podcast.episodeNames}` : ''}
                          {podcast.totalTimeMinutes ? ` | ${podcast.totalTimeMinutes} min` : ''}
                          {getHostname(podcast.link) ? ` | ${getHostname(podcast.link)}` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p>You can select up to {MAX_MEETING_PODCASTS} podcasts for one meeting.</p>
                  )}
                </div>
              </label>
              <label>
                Location
                <input
                  value={form.location}
                  placeholder="Host address or custom location"
                  onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
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
              <div className="inline">
                <button disabled={saving}>{saving ? 'Saving...' : editingMeetingId ? 'Save Changes' : 'Save Meeting'}</button>
                {editingMeetingId ? (
                  <button type="button" className="secondary" onClick={resetFormToCreate} disabled={saving}>
                    Cancel Edit
                  </button>
                ) : null}
              </div>
              {editingMeetingId ? null : (
                <p>
                  New meetings become the Next Meeting only when no scheduled meeting already exists. Otherwise they are archived as a past meeting.
                </p>
              )}
              {availablePodcasts.length === 0 ? <p>No podcasts to discuss right now. Select TBD if needed.</p> : null}
              {error ? <p className="error">{error}</p> : null}
            </form>
          ) : (
            <p>Only admins can create meetings. Hosts can edit meetings assigned to them.</p>
          )}
        </div>

        <div className="card">
          <h2>Next Meeting</h2>
          {nextMeeting ? (
            <div className="list">
              <div className="item">
                <h4>Meeting</h4>
                <p>
                  <strong>Date:</strong> {formatDate(nextMeeting.date)}
                </p>
                <p>
                  <strong>Host:</strong> {displayMemberName(nextMeeting.host)}
                  {isCurrentMemberHost(nextMeeting) ? <span className="badge" style={{ marginLeft: '0.4rem' }}>Host</span> : null}
                </p>
                <p>
                  <strong>Location:</strong> {nextMeeting.location}
                </p>
                {nextMeeting.notes ? (
                  <p>
                    <strong>Notes:</strong> {nextMeeting.notes}
                  </p>
                ) : null}
              </div>
              <div className="item">
                <h4>Podcasts</h4>
                {renderMeetingPodcasts(nextMeeting)}
              </div>

              {canEditMeeting(nextMeeting) ? (
                <div className="inline" style={{ marginTop: '0.5rem' }}>
                  <button type="button" className="secondary" onClick={() => startEditMeeting(nextMeeting)}>
                    Edit
                  </button>
                  {currentMember.isAdmin ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openCompleteMeetingModal(nextMeeting)}
                        disabled={workingMeetingId === nextMeeting._id}
                      >
                        {workingMeetingId === nextMeeting._id ? 'Saving...' : 'Meeting Completed'}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => openDeleteMeetingModal(nextMeeting)}
                        disabled={workingMeetingId === nextMeeting._id}
                      >
                        Delete Next Meeting
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p>No scheduled next meeting.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Past Meetings</h2>
        <div className="list">
          {recentPastMeetings.length === 0 ? <p>No past meetings yet.</p> : null}
          {recentPastMeetings.map((meeting) => (
            <div className="item" key={meeting._id}>
              <h4>{formatDate(meeting.date)}</h4>
              <p>
                <strong>Host:</strong> {displayMemberName(meeting.host)}
                {isCurrentMemberHost(meeting) ? <span className="badge" style={{ marginLeft: '0.4rem' }}>Host</span> : null}
              </p>
              <p>
                <strong>Podcasts:</strong>
              </p>
              {renderMeetingPodcasts(meeting)}
              <p>
                <strong>Location:</strong> {meeting.location}
              </p>
              {meeting.notes ? (
                <p>
                  <strong>Notes:</strong> {meeting.notes}
                </p>
              ) : null}
              {canEditMeeting(meeting) ? (
                <div className="inline" style={{ marginTop: '0.5rem' }}>
                  <button type="button" className="secondary" onClick={() => startEditMeeting(meeting)}>
                    Edit
                  </button>
                  {currentMember.isAdmin ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => openDeleteMeetingModal(meeting)}
                      disabled={workingMeetingId === meeting._id}
                    >
                      Delete (type DELETE)
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="inline" style={{ marginTop: '0.75rem' }}>
          <button type="button" className="secondary" onClick={() => setShowAllPastMeetings((prev) => !prev)}>
            {showAllPastMeetings ? 'Show Recent Meetings' : 'Show All Meetings'}
          </button>
        </div>
        {showAllPastMeetings ? (
          <div className="list" style={{ marginTop: '0.75rem' }}>
            {remainingPastMeetings.length === 0 ? <p>No additional past meetings.</p> : null}
            {remainingPastMeetings.map((meeting) => (
              <div className="item" key={`past-all-${meeting._id}`}>
                <h4>{formatDate(meeting.date)}</h4>
                <p>
                  <strong>Host:</strong> {displayMemberName(meeting.host)}
                  {isCurrentMemberHost(meeting) ? <span className="badge" style={{ marginLeft: '0.4rem' }}>Host</span> : null}
                </p>
                <p>
                  <strong>Podcasts:</strong>
                </p>
                {renderMeetingPodcasts(meeting)}
                <p>
                  <strong>Location:</strong> {meeting.location}
                </p>
                {meeting.notes ? (
                  <p>
                    <strong>Notes:</strong> {meeting.notes}
                  </p>
                ) : null}
                {canEditMeeting(meeting) ? (
                  <div className="inline" style={{ marginTop: '0.5rem' }}>
                    <button type="button" className="secondary" onClick={() => startEditMeeting(meeting)}>
                      Edit
                    </button>
                    {currentMember.isAdmin ? (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => openDeleteMeetingModal(meeting)}
                        disabled={workingMeetingId === meeting._id}
                      >
                        Delete (type DELETE)
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {completeModalMeeting ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="complete-meeting-title">
          <div className="modal-card">
            <h3 id="complete-meeting-title">Complete Meeting</h3>
            <p>Add notes to archive this meeting.</p>
            <label>
              Meeting notes
              <textarea
                value={completeNotes}
                onChange={(event) => setCompleteNotes(event.target.value)}
                placeholder="Discussed themes, takeaways, next actions..."
              />
            </label>
            <div className="inline" style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={confirmCompleteMeeting}
                disabled={workingMeetingId === completeModalMeeting._id}
              >
                {workingMeetingId === completeModalMeeting._id ? 'Saving...' : 'Meeting Completed'}
              </button>
              <button type="button" className="ghost" onClick={closeCompleteMeetingModal} disabled={Boolean(workingMeetingId)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteModalMeeting ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-meeting-title">
          <div className="modal-card">
            <h3 id="delete-meeting-title">Delete Meeting</h3>
            {isCompletedMeeting(deleteModalMeeting) ? (
              <p>
                Type <strong>DELETE</strong> to confirm deleting <strong>{formatDate(deleteModalMeeting.date)}</strong>.
              </p>
            ) : (
              <p>Delete this next meeting?</p>
            )}
            {isCompletedMeeting(deleteModalMeeting) ? (
              <label>
                Confirmation
                <input
                  value={deleteConfirmText}
                  onChange={(event) => setDeleteConfirmText(event.target.value)}
                  placeholder="DELETE"
                />
              </label>
            ) : null}
            <div className="inline" style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                className="secondary"
                onClick={confirmDeleteMeeting}
                disabled={workingMeetingId === deleteModalMeeting._id}
              >
                {workingMeetingId === deleteModalMeeting._id ? 'Deleting...' : 'Delete Meeting'}
              </button>
              <button type="button" className="ghost" onClick={closeDeleteMeetingModal} disabled={Boolean(workingMeetingId)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
