'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { withBasePath } from '@/lib/base-path';
import type { CarveOut, Meeting, SessionMember } from '@/lib/types';

const initialForm = {
  title: '',
  type: 'other',
  url: '',
  notes: '',
  meeting: ''
};

type CarveOutForm = typeof initialForm;
type CarveOutTab = 'library' | 'share';
const CARVE_OUT_TABS = new Set<CarveOutTab>(['library', 'share']);

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function getCarveOutTypeLabel(value: string) {
  const labels: Record<string, string> = {
    article: 'Article',
    book: 'Book',
    movie: 'Movie',
    podcast: 'Podcast',
    video: 'Video',
    other: 'Other'
  };

  return labels[value] || value;
}

export default function CarveOutsPage() {
  const [member, setMember] = useState<SessionMember | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [carveOuts, setCarveOuts] = useState<CarveOut[]>([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [editModalCarveOut, setEditModalCarveOut] = useState<CarveOut | null>(null);
  const [editForm, setEditForm] = useState<CarveOutForm>(initialForm);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [deleteModalCarveOut, setDeleteModalCarveOut] = useState<CarveOut | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingCarveOutId, setDeletingCarveOutId] = useState<string | null>(null);
  const [fistBumpingId, setFistBumpingId] = useState<string | null>(null);
  const [showAllCarveOuts, setShowAllCarveOuts] = useState(false);
  const [activeTab, setActiveTab] = useState<CarveOutTab>('library');

  async function loadPageData() {
    const meRes = await fetch(withBasePath('/api/auth/me'), { cache: 'no-store' });
    if (!meRes.ok) {
      setMember(null);
      return;
    }

    const mePayload = await meRes.json();
    setMember(mePayload.member);

    const [meetingRes, carveOutRes] = await Promise.all([
      fetch(withBasePath('/api/meetings')),
      fetch(withBasePath('/api/carveouts'))
    ]);

    if (!meetingRes.ok || !carveOutRes.ok) return;

    const [meetingData, carveOutData] = await Promise.all([meetingRes.json(), carveOutRes.json()]);

    setMeetings(meetingData);
    setCarveOuts(carveOutData);

    setForm((prev) => ({
      ...prev,
      meeting: prev.meeting || meetingData[0]?._id || ''
    }));
  }

  useEffect(() => {
    void loadPageData();
  }, []);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab') as CarveOutTab | null;
    if (requestedTab && CARVE_OUT_TABS.has(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, []);

  const visibleCarveOuts = useMemo(
    () => carveOuts.filter((carveOut) => carveOut.meeting && carveOut.member),
    [carveOuts]
  );
  const recentCarveOuts = useMemo(() => visibleCarveOuts.slice(0, 3), [visibleCarveOuts]);
  const displayedCarveOuts = showAllCarveOuts ? visibleCarveOuts : recentCarveOuts;
  const displayMemberName = (person: { _id: string; name: string }) =>
    member && person._id === member._id ? 'You' : person.name;
  const canManageCarveOut = (carveOut: CarveOut) =>
    Boolean(member && (member.isAdmin || carveOut.member._id === member._id));
  const hasFistBumped = (carveOut: CarveOut) =>
    Boolean(member && carveOut.fistBumps?.some((entry) => entry.member._id === member._id));
  const canFistBump = (carveOut: CarveOut) =>
    Boolean(member && carveOut.member._id !== member._id && !hasFistBumped(carveOut));
  const canRemoveFistBump = (carveOut: CarveOut) =>
    Boolean(member && carveOut.member._id !== member._id && hasFistBumped(carveOut));
  const getFistBumpNames = (carveOut: CarveOut) => (carveOut.fistBumps || []).map((entry) => displayMemberName(entry.member));
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
  const getUrlLabel = (value: string) => {
    try {
      return new URL(value).hostname.replace(/^www\./, '');
    } catch {
      return 'Open link';
    }
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    const res = await fetch(withBasePath('/api/carveouts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.message || 'Unable to save carve out.');
      setSaving(false);
      return;
    }

    setForm((prev) => ({ ...initialForm, meeting: prev.meeting }));
    await loadPageData();
    setSuccess('Carve out submitted successfully.');
    setActiveTab('library');
    setSaving(false);
  }

  function openEditModal(carveOut: CarveOut) {
    setError('');
    setSuccess('');
    setEditModalCarveOut(carveOut);
    setEditForm({
      title: carveOut.title,
      type: carveOut.type,
      url: carveOut.url || '',
      notes: carveOut.notes || '',
      meeting: carveOut.meeting._id
    });
  }

  function closeEditModal() {
    if (savingEditId) return;
    setEditModalCarveOut(null);
    setEditForm(initialForm);
  }

  async function saveEditCarveOut() {
    if (!editModalCarveOut) return;

    setError('');
    setSuccess('');
    setSavingEditId(editModalCarveOut._id);
    try {
      const res = await fetch(withBasePath(`/api/carveouts/${editModalCarveOut._id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });

      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setError(payload?.message || 'Unable to update carve out.');
        return;
      }

      setEditModalCarveOut(null);
      setEditForm(initialForm);
      await loadPageData();
      setSuccess('Carve out updated successfully.');
    } catch {
      setError('Unable to update carve out.');
    } finally {
      setSavingEditId(null);
    }
  }

  function openDeleteModal(carveOut: CarveOut) {
    setError('');
    setSuccess('');
    setDeleteModalCarveOut(carveOut);
    setDeleteConfirmText('');
  }

  function closeDeleteModal() {
    if (deletingCarveOutId) return;
    setDeleteModalCarveOut(null);
    setDeleteConfirmText('');
  }

  async function confirmDeleteCarveOut() {
    if (!deleteModalCarveOut) return;

    setError('');
    setSuccess('');
    setDeletingCarveOutId(deleteModalCarveOut._id);
    try {
      const res = await fetch(withBasePath(`/api/carveouts/${deleteModalCarveOut._id}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmText: deleteConfirmText })
      });

      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setError(payload?.message || 'Unable to delete carve out.');
        return;
      }

      setDeleteModalCarveOut(null);
      setDeleteConfirmText('');
      await loadPageData();
      setSuccess('Carve out deleted successfully.');
    } catch {
      setError('Unable to delete carve out.');
    } finally {
      setDeletingCarveOutId(null);
    }
  }

  async function giveFistBump(carveOutId: string) {
    setError('');
    setSuccess('');
    setFistBumpingId(carveOutId);

    try {
      const res = await fetch(withBasePath(`/api/carveouts/${carveOutId}/fist-bump`), {
        method: 'POST'
      });

      const payload = (await res.json().catch(() => null)) as (CarveOut & { message?: string }) | null;
      if (!res.ok) {
        setError(payload?.message || 'Unable to fist bump carve out.');
        return;
      }
      if (!payload) {
        setError('Unable to fist bump carve out.');
        return;
      }

      setCarveOuts((prev) => prev.map((carveOut) => (carveOut._id === carveOutId ? payload : carveOut)));
      setSuccess('Fist bump sent.');
    } catch {
      setError('Unable to fist bump carve out.');
    } finally {
      setFistBumpingId(null);
    }
  }

  async function removeFistBump(carveOutId: string) {
    setError('');
    setSuccess('');
    setFistBumpingId(carveOutId);

    try {
      const res = await fetch(withBasePath(`/api/carveouts/${carveOutId}/fist-bump`), {
        method: 'DELETE'
      });

      const payload = (await res.json().catch(() => null)) as (CarveOut & { message?: string }) | null;
      if (!res.ok) {
        setError(payload?.message || 'Unable to remove fist bump.');
        return;
      }
      if (!payload) {
        setError('Unable to remove fist bump.');
        return;
      }

      setCarveOuts((prev) => prev.map((carveOut) => (carveOut._id === carveOutId ? payload : carveOut)));
      setSuccess('Fist bump removed.');
    } catch {
      setError('Unable to remove fist bump.');
    } finally {
      setFistBumpingId(null);
    }
  }

  function renderFistBumpStrip(carveOut: CarveOut) {
    const names = getFistBumpNames(carveOut);
    const visibleNames = names.slice(0, 3);
    const extraCount = Math.max(0, names.length - visibleNames.length);

    return (
      <div className="carveout-appreciation-strip">
        <div className="carveout-appreciation-copy">
          <strong>Appreciation</strong>
          <small>{formatFistBumps(carveOut)}</small>
        </div>
        {carveOut.member._id !== member?._id ? (
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
                  ? 'Fist bumped'
                  : 'Fist bump'}
            </span>
          </button>
        ) : (
          <div className="fist-bump-owner-note">Your carve out</div>
        )}

        <div className="carveout-fist-bumps-meta">
          {names.length > 0 ? (
            <div className="fist-bump-avatar-row" aria-hidden="true">
              {visibleNames.map((name) => (
                <span key={`${carveOut._id}-${name}`} className="fist-bump-avatar">
                  {getInitials(name)}
                </span>
              ))}
              {extraCount > 0 ? <span className="fist-bump-avatar extra">+{extraCount}</span> : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderCarveOutCard(carveOut: CarveOut) {
    return (
      <article className="carveout-library-card" key={carveOut._id}>
        <div className="carveout-card-head">
          <div>
            <h3>{carveOut.title}</h3>
          </div>
        </div>

        <div className="podcast-meta-row">
          <span className="badge">{getCarveOutTypeLabel(carveOut.type)}</span>
          {carveOut.member._id === member?._id ? <span className="badge my-carveout">Mine</span> : null}
        </div>

        <div className="carveout-detail-grid">
          <div>
            <span>Shared by</span>
            <strong>{displayMemberName(carveOut.member)}</strong>
          </div>
          <div>
            <span>Meeting</span>
            <strong>{formatDate(carveOut.meeting.date)}</strong>
          </div>
        </div>

        {carveOut.notes ? (
          <section className="carveout-notes-card">
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

        {renderFistBumpStrip(carveOut)}

        {canManageCarveOut(carveOut) ? (
          <details className="podcast-details carveout-manage-details">
            <summary>Manage</summary>
            <div className="carveout-manage-panel">
              <button type="button" className="ghost" onClick={() => openEditModal(carveOut)}>
                Edit
              </button>
              <div className="meeting-danger-section">
                <div>
                  <strong>Delete carve out</strong>
                  <small>Remove this shared resource.</small>
                </div>
                <button type="button" className="secondary" onClick={() => openDeleteModal(carveOut)}>
                  Delete
                </button>
              </div>
            </div>
          </details>
        ) : null}
      </article>
    );
  }

  if (!member) {
    return (
      <section className="grid" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h2>Carve Outs</h2>
          <p>Please login to manage carve outs.</p>
          <Link className="nav-link" href="/login">
            Go to Login
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="carveouts-page page-stack">
      {error ? <div className="error-banner">{error}</div> : null}
      {success ? <div className="toast-banner">{success}</div> : null}

      <div className="podcast-tabs carveout-tabs" role="tablist" aria-label="Carve out sections">
        {[
          { id: 'library' as const, label: 'Library', count: visibleCarveOuts.length },
          { id: 'share' as const, label: 'Share' }
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

      {activeTab === 'library' ? (
        <div className="section-panel carveouts-library-panel">
          <div className="section-title-row">
            <h2>Carve Outs</h2>
            <span className="badge">{visibleCarveOuts.length} saved</span>
          </div>
          <p className="muted-line">Browse what members shared and send a fist bump when something lands.</p>

          {visibleCarveOuts.length === 0 ? (
            <div className="empty-state">
              <h3>No carve outs yet</h3>
              <p>Share the first book, article, video, or side thread from a meeting.</p>
              <button type="button" className="ghost" onClick={() => setActiveTab('share')}>
                Share Carve Out
              </button>
            </div>
          ) : (
            <>
              <div className="carveout-library-list">{displayedCarveOuts.map((carveOut) => renderCarveOutCard(carveOut))}</div>

              {visibleCarveOuts.length > 3 ? (
                <button type="button" className="ghost carveout-show-all" onClick={() => setShowAllCarveOuts((prev) => !prev)}>
                  {showAllCarveOuts ? 'Show Recent' : `Show All (${visibleCarveOuts.length})`}
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {activeTab === 'share' ? (
        <div className="section-panel carveout-share-panel">
          <div className="section-title-row">
            <h2>Share a Carve Out</h2>
            <span className="badge">{meetings.length === 1 ? '1 meeting' : `${meetings.length} meetings`}</span>
          </div>

          <form className="form carveout-share-form" onSubmit={onSubmit}>
            <div className="carveout-form-section">
              <h3>Resource</h3>
              <label>
                Title
                <input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  required
                />
              </label>
              <label>
                Type
                <select value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}>
                  <option value="book">Book</option>
                  <option value="video">Video</option>
                  <option value="movie">Movie</option>
                  <option value="podcast">Podcast</option>
                  <option value="article">Article</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                URL
                <input
                  type="url"
                  value={form.url}
                  onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
                />
              </label>
            </div>

            <div className="carveout-form-section">
              <h3>Context</h3>
              <label>
                Meeting
                <select
                  value={form.meeting}
                  onChange={(event) => setForm((prev) => ({ ...prev, meeting: event.target.value }))}
                  required
                >
                  {meetings.map((meeting) => (
                    <option key={meeting._id} value={meeting._id}>
                      {formatDate(meeting.date)} - {displayMemberName(meeting.host)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="carveout-form-section">
              <h3>Why it landed</h3>
              <label>
                <span className="sr-only">Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </label>
            </div>

            {meetings.length === 0 ? <p className="muted-line">Create a meeting first to attach carve outs.</p> : null}
            <button className="full-width-action" disabled={saving || meetings.length === 0}>
              {saving ? 'Saving...' : 'Add Carve Out'}
            </button>
          </form>
        </div>
      ) : null}

      {editModalCarveOut ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-carveout-title">
          <div className="modal-card">
            <h3 id="edit-carveout-title">Edit Carve Out</h3>
            <label>
              Title
              <input
                value={editForm.title}
                onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
            </label>
            <label>
              Type
              <select value={editForm.type} onChange={(event) => setEditForm((prev) => ({ ...prev, type: event.target.value }))}>
                <option value="book">Book</option>
                <option value="video">Video</option>
                <option value="movie">Movie</option>
                <option value="podcast">Podcast</option>
                <option value="article">Article</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              URL
              <input
                type="url"
                value={editForm.url}
                onChange={(event) => setEditForm((prev) => ({ ...prev, url: event.target.value }))}
              />
            </label>
            <label>
              Meeting
              <select
                value={editForm.meeting}
                onChange={(event) => setEditForm((prev) => ({ ...prev, meeting: event.target.value }))}
                required
              >
                {meetings.map((meeting) => (
                  <option key={meeting._id} value={meeting._id}>
                    {formatDate(meeting.date)} - {displayMemberName(meeting.host)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <textarea
                value={editForm.notes}
                onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </label>
            <div className="inline" style={{ marginTop: '0.5rem' }}>
              <button type="button" onClick={saveEditCarveOut} disabled={savingEditId === editModalCarveOut._id || meetings.length === 0}>
                {savingEditId === editModalCarveOut._id ? 'Saving...' : 'Save Changes'}
              </button>
              <button type="button" className="ghost" onClick={closeEditModal} disabled={Boolean(savingEditId)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteModalCarveOut ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-carveout-title">
          <div className="modal-card">
            <h3 id="delete-carveout-title">Delete Carve Out</h3>
            <p>
              Type <strong>DELETE</strong> to confirm deleting <strong>{deleteModalCarveOut.title}</strong>.
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
                type="button"
                className="secondary"
                onClick={confirmDeleteCarveOut}
                disabled={deletingCarveOutId === deleteModalCarveOut._id}
              >
                {deletingCarveOutId === deleteModalCarveOut._id ? 'Deleting...' : 'Delete Carve Out'}
              </button>
              <button type="button" className="ghost" onClick={closeDeleteModal} disabled={Boolean(deletingCarveOutId)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
