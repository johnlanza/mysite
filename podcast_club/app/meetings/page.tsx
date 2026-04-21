'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { withBasePath } from '@/lib/base-path';
import { MAX_MEETING_PODCASTS } from '@/lib/meeting-podcasts';
import type { Meeting, Member, Podcast, SessionMember } from '@/lib/types';

type MeetingTab = 'next' | 'schedule' | 'history';

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

function formatDateInputLabel(value: string) {
  if (!value) return 'Choose a date';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return 'Choose a date';

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
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
  const [activeTab, setActiveTab] = useState<MeetingTab>('next');
  const [podcastPickerOpen, setPodcastPickerOpen] = useState(false);

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
      const host = prev.host || '';
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
  const selectedHostAddress = form.host ? getHostAddress(form.host, members) : '';
  const locationSource = form.host && form.location
    ? form.location === selectedHostAddress
      ? 'Host address'
      : 'Custom'
    : '';

  function resetFormToCreate() {
    setEditingMeetingId(null);
    setPodcastPickerOpen(false);
    setForm({
      ...initialForm,
      podcasts: [],
      location: ''
    });
  }

  function startEditMeeting(meeting: Meeting) {
    setEditingMeetingId(meeting._id);
    setError('');
    setActiveTab('schedule');
    setPodcastPickerOpen(false);
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
      setActiveTab('next');
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
  const renderMeetingPodcastRows = (meeting: Meeting) => {
    const selectedMeetingPodcasts = getMeetingPodcasts(meeting);

    if (selectedMeetingPodcasts.length === 0) {
      return <p className="muted-line">Awaiting host podcast picks.</p>;
    }

    return (
      <div className="compact-list">
        {selectedMeetingPodcasts.map((podcast) => {
          const content = (
            <>
              <span>
                <strong>{podcast.title}</strong>
                <small>
                  {podcast.totalTimeMinutes ? `${podcast.totalTimeMinutes} min` : podcast.host || 'Podcast'}
                  {podcast.submittedBy ? ` | ${displayMemberName(podcast.submittedBy)}` : ''}
                </small>
              </span>
              <span aria-hidden="true">&gt;</span>
            </>
          );

          return podcast.link ? (
            <a key={podcast._id} className="compact-row" href={podcast.link} target="_blank" rel="noreferrer">
              {content}
            </a>
          ) : (
            <div key={podcast._id} className="compact-row">
              {content}
            </div>
          );
        })}
      </div>
    );
  };
  const renderMeetingMeta = (meeting: Meeting) => {
    const meetingPodcasts = getMeetingPodcasts(meeting);
    const completed = isCompletedMeeting(meeting);

    return (
      <div className="meeting-detail-grid">
        <div>
          <span>Host</span>
          <strong>{displayMemberName(meeting.host)}</strong>
        </div>
        <div>
          <span>Podcasts</span>
          <strong>{meetingPodcasts.length || 'TBD'}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{completed ? 'Completed' : 'Scheduled'}</strong>
        </div>
        <div>
          <span>Role</span>
          <strong>{isCurrentMemberHost(meeting) ? 'Host' : 'Member'}</strong>
        </div>
      </div>
    );
  };
  const renderMeetingLocation = (meeting: Meeting) => (
    <div className="meeting-location-card">
      <span>Location</span>
      <strong>{meeting.location || 'TBD'}</strong>
    </div>
  );
  const renderMeetingNotes = (meeting: Meeting) =>
    meeting.notes ? (
      <div className="meeting-notes-card">
        <span>Notes</span>
        <p>{meeting.notes}</p>
      </div>
    ) : null;
  const renderMeetingActions = (meeting: Meeting, options: { allowComplete?: boolean } = {}) => {
    if (!canEditMeeting(meeting)) return null;
    const working = workingMeetingId === meeting._id;

    return (
      <div className="meeting-action-panel">
        <div className="meeting-primary-actions">
          <button type="button" className="ghost" onClick={() => startEditMeeting(meeting)}>
            Edit
          </button>
          {currentMember.isAdmin && options.allowComplete ? (
            <button type="button" onClick={() => openCompleteMeetingModal(meeting)} disabled={working}>
              {working ? 'Saving...' : 'Complete'}
            </button>
          ) : null}
        </div>
        {currentMember.isAdmin ? (
          <div className="meeting-danger-section">
            <div>
              <strong>Delete meeting</strong>
              <small>{isCompletedMeeting(meeting) ? 'Remove this meeting from history.' : 'Remove this scheduled meeting.'}</small>
            </div>
            <button type="button" className="secondary" onClick={() => openDeleteMeetingModal(meeting)} disabled={working}>
              Delete
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section className="meetings-page page-stack">
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="podcast-tabs meeting-tabs" role="tablist" aria-label="Meeting sections">
        {[
          { id: 'next' as const, label: 'Next', count: nextMeeting ? 1 : 0 },
          { id: 'schedule' as const, label: editingMeetingId ? 'Edit' : 'Schedule' },
          { id: 'history' as const, label: 'History', count: pastMeetings.length }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'podcast-tab active' : 'podcast-tab'}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' ? <small>{tab.count}</small> : null}
          </button>
        ))}
      </div>

      {activeTab === 'next' ? (
        <div className="section-panel meeting-hero-panel">
          {nextMeeting ? (
            <>
              <div className="hero-heading-row">
                <div>
                  <p className="section-kicker">Next Meeting</p>
                  <h2>{formatDate(nextMeeting.date)}</h2>
                </div>
                {isCurrentMemberHost(nextMeeting) ? <span className="badge">Host</span> : null}
              </div>
              {renderMeetingMeta(nextMeeting)}
              {renderMeetingLocation(nextMeeting)}
              {renderMeetingNotes(nextMeeting)}
              <div className="meeting-detail-section">
                <div className="podcast-detail-heading">
                  <strong>Podcasts</strong>
                  <span className="badge">{getMeetingPodcasts(nextMeeting).length || 'TBD'}</span>
                </div>
                {renderMeetingPodcastRows(nextMeeting)}
              </div>
              {renderMeetingActions(nextMeeting, { allowComplete: true })}
            </>
          ) : (
            <div className="empty-state">
              <h3>No meeting scheduled</h3>
              <p>Create the next meeting when the club has a date.</p>
              {currentMember.isAdmin ? (
                <button type="button" className="ghost" onClick={() => setActiveTab('schedule')}>
                  Schedule Meeting
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {activeTab === 'schedule' ? (
        <div className="section-panel schedule-meeting-panel">
          <h2>{editingMeetingId ? 'Edit Meeting' : 'Schedule Meeting'}</h2>
          {canManageMeetingForm ? (
            <form className="form schedule-meeting-form" onSubmit={onSubmit}>
              <div className="schedule-form-section">
                <h3>Meeting Details</h3>
                <label>
                  Date
                  <span className="date-picker-control">
                    <span className="date-picker-icon" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <path d="M7 3v4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
                        <path d="M17 3v4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
                        <path d="M4.5 8h15" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
                        <rect x="4" y="5" width="16" height="16" rx="2.5" stroke="currentColor" strokeWidth="2.1" />
                      </svg>
                    </span>
                    <span className="date-picker-copy">
                      <strong>{formatDateInputLabel(form.date)}</strong>
                      <small>{form.date ? 'Tap to change' : 'Tap to open calendar'}</small>
                    </span>
                    <span className="date-picker-action">Select</span>
                    <input
                      className="date-picker-native"
                      aria-label="Meeting date"
                      type="date"
                      value={form.date}
                      onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                      required
                    />
                  </span>
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
                    <option value="" disabled>
                      Add a host...
                    </option>
                    {members.map((member) => (
                      <option key={member._id} value={member._id}>
                        {annotateSelfInList(member)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="schedule-form-section">
                <div className="schedule-section-heading">
                  <h3>Podcasts</h3>
                  <span className="badge">{selectedPodcasts.length}/{MAX_MEETING_PODCASTS}</span>
                </div>
                <div className="meeting-form-podcast-list">
                  {selectedPodcasts.length === 0 ? <p className="muted-line">No podcasts selected yet. Leave empty for TBD.</p> : null}
                  {selectedPodcasts.map((podcast) => (
                    <div className="meeting-form-podcast" key={podcast._id}>
                      <span>
                        <strong>{podcast.title}</strong>
                        <small>
                          {podcast.episodeNames ? `${podcast.episodeNames} | ` : ''}
                          {podcast.totalTimeMinutes ? `${podcast.totalTimeMinutes} min | ` : ''}
                          {getHostname(podcast.link) || podcast.link}
                        </small>
                      </span>
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
                  ))}
                  {form.podcasts.length < MAX_MEETING_PODCASTS ? (
                    <details
                      className="meeting-podcast-picker"
                      open={podcastPickerOpen}
                      onToggle={(event) => setPodcastPickerOpen(event.currentTarget.open)}
                    >
                      <summary className="meeting-picker-summary">
                        <span>
                          <strong>Add Podcast</strong>
                          <small>{podcastOptions.length} available</small>
                        </span>
                        <span aria-hidden="true">+</span>
                      </summary>
                      <div className="meeting-picker-list">
                        {podcastOptions.length === 0 ? <p className="muted-line">No more podcasts available.</p> : null}
                        {podcastOptions.map((podcast) => (
                          <button
                            type="button"
                            className="meeting-picker-option"
                            key={podcast._id}
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                podcasts: [...prev.podcasts, podcast._id]
                              }));
                              setPodcastPickerOpen(false);
                            }}
                          >
                            <span>
                              <strong>{podcast.title}</strong>
                              <small>
                                {podcast.episodeNames ? `${podcast.episodeNames} | ` : ''}
                                {podcast.totalTimeMinutes ? `${podcast.totalTimeMinutes} min | ` : ''}
                                {getHostname(podcast.link) || podcast.link}
                              </small>
                            </span>
                            <span aria-hidden="true">+</span>
                          </button>
                        ))}
                      </div>
                    </details>
                  ) : (
                    <p className="muted-line">You can select up to {MAX_MEETING_PODCASTS} podcasts for one meeting.</p>
                  )}
                </div>
              </div>

              <div className="schedule-form-section">
                <div className="schedule-section-heading">
                  <h3>Location</h3>
                  {locationSource ? <span className="badge">{locationSource}</span> : null}
                </div>
                <label>
                  <span className="sr-only">Location</span>
                  <input
                    value={form.location}
                    placeholder={form.host ? 'Host address or custom location' : 'Select a host first'}
                    disabled={!form.host}
                    onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
                    required={Boolean(form.host)}
                  />
                </label>
              </div>

              <div className="schedule-form-section">
                <h3>Notes</h3>
                <label>
                  <span className="sr-only">Notes</span>
                  <textarea
                    value={form.notes}
                    onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </label>
              </div>

              <div className="meeting-action-row meeting-save-bar">
                <button disabled={saving}>{saving ? 'Saving...' : editingMeetingId ? 'Save Changes' : 'Save Meeting'}</button>
                {editingMeetingId ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      resetFormToCreate();
                      setActiveTab('next');
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
              {editingMeetingId ? null : (
                <p className="muted-line">
                  New meetings become the Next Meeting only when no scheduled meeting already exists. Otherwise they are archived as history.
                </p>
              )}
              {availablePodcasts.length === 0 ? <p className="muted-line">No podcasts to discuss right now. Select TBD if needed.</p> : null}
            </form>
          ) : (
            <p>Only admins can create meetings. Hosts can edit meetings assigned to them.</p>
          )}
        </div>
      ) : null}

      {activeTab === 'history' ? (
        <div className="section-panel meetings-history-panel">
          <div className="section-title-row">
            <h2>Past Meetings</h2>
            <span className="badge">{pastMeetings.length}</span>
          </div>
          <div className="meeting-history-list">
            {recentPastMeetings.length === 0 ? <p>No past meetings yet.</p> : null}
            {(showAllPastMeetings ? pastMeetings : recentPastMeetings).map((meeting) => (
              <div className="meeting-history-card" key={meeting._id}>
                <div className="library-podcast-head">
                  <h3>{formatDate(meeting.date)}</h3>
                  <div className="podcast-meta-row">
                    <span className="badge">{isCompletedMeeting(meeting) ? 'Completed' : 'Scheduled'}</span>
                    {isCurrentMemberHost(meeting) ? <span className="badge">Host</span> : null}
                  </div>
                </div>
                {renderMeetingMeta(meeting)}
                {renderMeetingLocation(meeting)}
                <details className="podcast-details">
                  <summary>Podcasts and notes</summary>
                  <div className="podcast-details-body">
                    <div className="podcast-detail-stack">
                      {renderMeetingNotes(meeting)}
                      <div className="meeting-detail-section">
                        <div className="podcast-detail-heading">
                          <strong>Podcasts</strong>
                          <span className="badge">{getMeetingPodcasts(meeting).length || 'TBD'}</span>
                        </div>
                        {renderMeetingPodcastRows(meeting)}
                      </div>
                      {renderMeetingActions(meeting)}
                    </div>
                  </div>
                </details>
              </div>
            ))}
          </div>
          {pastMeetings.length > 3 ? (
            <button type="button" className="ghost full-width-action" onClick={() => setShowAllPastMeetings((prev) => !prev)}>
              {showAllPastMeetings ? 'Show Recent' : `Show All (${pastMeetings.length})`}
            </button>
          ) : null}
        </div>
      ) : null}

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
