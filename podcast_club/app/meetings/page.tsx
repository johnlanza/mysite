'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { withBasePath } from '@/lib/base-path';
import type { Meeting, Member, Podcast, SessionMember } from '@/lib/types';

const initialForm = {
  date: '',
  host: '',
  podcast: '',
  location: '',
  notes: ''
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function getHostAddress(hostId: string, members: Member[]) {
  return members.find((member) => member._id === hostId)?.address || '';
}

function isCompletedMeeting(meeting: Meeting) {
  if (meeting.status === 'completed') return true;
  if (meeting.status === 'scheduled') return false;
  if (meeting.completedAt) return true;
  return new Date(meeting.date).getTime() < Date.now();
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
        podcast: prev.podcast || '',
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
  const podcastOptions = useMemo(() => {
    const selected = podcasts.find((podcast) => podcast._id === form.podcast);
    if (!selected) return availablePodcasts;
    if (availablePodcasts.some((podcast) => podcast._id === selected._id)) return availablePodcasts;
    return [selected, ...availablePodcasts];
  }, [availablePodcasts, form.podcast, podcasts]);

  const pastMeetings = useMemo(() => {
    return meetings
      .filter((meeting) => isCompletedMeeting(meeting) || meeting._id !== nextMeeting?._id)
      .filter((meeting) => meeting._id !== nextMeeting?._id)
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [meetings, nextMeeting]);
  const recentPastMeetings = useMemo(() => pastMeetings.slice(0, 3), [pastMeetings]);

  function resetFormToCreate() {
    setEditingMeetingId(null);
    const host = members[0]?._id || '';
    setForm({
      ...initialForm,
      host,
      podcast: '',
      location: getHostAddress(host, members)
    });
  }

  function startEditMeeting(meeting: Meeting) {
    setEditingMeetingId(meeting._id);
    setError('');
    setForm({
      date: toDateInputValue(meeting.date),
      host: meeting.host._id,
      podcast: meeting.podcast?._id || '',
      location: meeting.location,
      notes: meeting.notes || ''
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);

    const payload = {
      ...form,
      podcast: form.podcast || null,
      date: new Date(form.date).toISOString()
    };

    const res = await fetch(editingMeetingId ? `/api/meetings/${editingMeetingId}` : '/api/meetings', {
      method: editingMeetingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.message || 'Unable to save meeting.');
      setSaving(false);
      return;
    }

    resetFormToCreate();
    await loadPageData();
    setSaving(false);
  }

  async function completeMeeting(meeting: Meeting) {
    const notes = window.prompt('Meeting Completed: Enter meeting notes to archive this meeting.');
    if (!notes) return;

    setError('');
    setWorkingMeetingId(meeting._id);

    const res = await fetch(`/api/meetings/${meeting._id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });

    if (!res.ok) {
      const payload = await res.json();
      setError(payload.message || 'Unable to complete meeting.');
      setWorkingMeetingId(null);
      return;
    }

    await loadPageData();
    setWorkingMeetingId(null);
  }

  async function deleteMeeting(meeting: Meeting) {
    const completed = isCompletedMeeting(meeting);
    const confirmText = completed ? window.prompt('Type DELETE to remove this past meeting.') : 'DELETE';

    if (completed && confirmText !== 'DELETE') {
      setError('Past meeting deletion cancelled. You must type DELETE exactly.');
      return;
    }

    if (!completed) {
      const confirmed = window.confirm('Delete this next meeting?');
      if (!confirmed) return;
    }

    setError('');
    setWorkingMeetingId(meeting._id);

    const res = await fetch(`/api/meetings/${meeting._id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(completed ? { confirmText } : {})
    });

    if (!res.ok) {
      const payload = await res.json();
      setError(payload.message || 'Unable to delete meeting.');
      setWorkingMeetingId(null);
      return;
    }

    if (editingMeetingId === meeting._id) {
      resetFormToCreate();
    }

    await loadPageData();
    setWorkingMeetingId(null);
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
  const displayMemberName = (person: { _id: string; name: string }) =>
    person._id === currentMember._id ? 'You' : person.name;
  const annotateSelfInList = (person: { _id: string; name: string }) =>
    person._id === currentMember._id ? `${person.name} (you)` : person.name;

  return (
    <section className="grid" style={{ marginTop: '1rem' }}>
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
                Podcast
                <select
                  value={form.podcast}
                  onChange={(event) => setForm((prev) => ({ ...prev, podcast: event.target.value }))}
                >
                  <option value="">TBD</option>
                  {podcastOptions.map((podcast) => (
                    <option key={podcast._id} value={podcast._id}>
                      {podcast.title}
                      {podcast.episodeNames ? ` | ${podcast.episodeNames}` : ''}
                      {podcast.totalTimeMinutes ? ` | ${podcast.totalTimeMinutes} min` : ''}
                      {getHostname(podcast.link) ? ` | ${getHostname(podcast.link)}` : ''}
                    </option>
                  ))}
                </select>
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
              <p>
                <strong>Location:</strong> {nextMeeting.location}
              </p>
              {nextMeeting.notes ? (
                <p>
                  <strong>Notes:</strong> {nextMeeting.notes}
                </p>
              ) : null}

              {canEditMeeting(nextMeeting) ? (
                <div className="inline" style={{ marginTop: '0.5rem' }}>
                  <button type="button" className="secondary" onClick={() => startEditMeeting(nextMeeting)}>
                    Edit
                  </button>
                  {currentMember.isAdmin ? (
                    <>
                      <button
                        type="button"
                        onClick={() => completeMeeting(nextMeeting)}
                        disabled={workingMeetingId === nextMeeting._id}
                      >
                        {workingMeetingId === nextMeeting._id ? 'Saving...' : 'Meeting Completed'}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => deleteMeeting(nextMeeting)}
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
              </p>
              <p>
                <strong>Podcast:</strong> {meeting.podcast?.title || <span className="badge tbd">TBD</span>}
              </p>
              {meeting.podcast?.host ? (
                <p>
                  <strong>Podcast Host:</strong> {meeting.podcast?.host}
                </p>
              ) : null}
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
                      onClick={() => deleteMeeting(meeting)}
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
            {pastMeetings.length === 0 ? <p>No past meetings yet.</p> : null}
            {pastMeetings.map((meeting) => (
              <div className="item" key={`past-all-${meeting._id}`}>
                <h4>{formatDate(meeting.date)}</h4>
                <p>
                  <strong>Host:</strong> {displayMemberName(meeting.host)}
                </p>
                <p>
                  <strong>Podcast:</strong> {meeting.podcast?.title || <span className="badge tbd">TBD</span>}
                </p>
                {meeting.podcast?.host ? (
                  <p>
                    <strong>Podcast Host:</strong> {meeting.podcast?.host}
                  </p>
                ) : null}
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
                        onClick={() => deleteMeeting(meeting)}
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
    </section>
  );
}
