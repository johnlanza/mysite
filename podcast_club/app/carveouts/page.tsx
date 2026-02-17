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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
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
  const [showAllCarveOuts, setShowAllCarveOuts] = useState(false);

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

  const visibleCarveOuts = useMemo(
    () => carveOuts.filter((carveOut) => carveOut.meeting && carveOut.member),
    [carveOuts]
  );
  const recentCarveOuts = useMemo(() => visibleCarveOuts.slice(0, 3), [visibleCarveOuts]);
  const remainingCarveOuts = useMemo(() => visibleCarveOuts.slice(3), [visibleCarveOuts]);
  const displayMemberName = (person: { _id: string; name: string }) =>
    member && person._id === member._id ? 'You' : person.name;
  const canManageCarveOut = (carveOut: CarveOut) =>
    Boolean(member && (member.isAdmin || carveOut.member._id === member._id));

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
    <section className="grid two" style={{ marginTop: '1rem' }}>
      <div className="card">
        <h2>Add Carve Out</h2>
        <form className="form" onSubmit={onSubmit}>
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
          <label>
            Notes
            <textarea
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </label>
          <button disabled={saving || meetings.length === 0}>{saving ? 'Saving...' : 'Add Carve Out'}</button>
          {meetings.length === 0 ? <p>Create a meeting first to attach carve outs.</p> : null}
          {error ? <p className="error">{error}</p> : null}
          {success ? <p className="success-message">{success}</p> : null}
        </form>
      </div>

      <div className="card carveouts-card">
        <h2>Carve Out Library</h2>
        <div className="list">
          {recentCarveOuts.length === 0 ? <p>No carve outs saved yet.</p> : null}
          {recentCarveOuts.map((carveOut) => (
            <div className="item" key={carveOut._id}>
              <div className="inline carveout-item-head" style={{ justifyContent: 'space-between' }}>
                <h4>{carveOut.title}</h4>
                <div className="inline" style={{ gap: '0.35rem' }}>
                  <span className="badge">{carveOut.type}</span>
                  {carveOut.member._id === member._id ? <span className="badge my-carveout">My Carve Out</span> : null}
                </div>
              </div>
              <p>
                <strong>Shared by:</strong> {displayMemberName(carveOut.member)}
              </p>
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
              {canManageCarveOut(carveOut) ? (
                <div className="inline" style={{ marginTop: '0.4rem' }}>
                  <button type="button" className="secondary" onClick={() => openEditModal(carveOut)}>
                    Edit Carve Out
                  </button>
                  <button type="button" className="secondary" onClick={() => openDeleteModal(carveOut)}>
                    Delete Carve Out
                  </button>
                </div>
              ) : null}
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
            {remainingCarveOuts.length === 0 ? <p>No additional carve outs.</p> : null}
            {remainingCarveOuts.map((carveOut) => (
              <div className="item" key={`all-${carveOut._id}`}>
                <div className="inline carveout-item-head" style={{ justifyContent: 'space-between' }}>
                  <h4>{carveOut.title}</h4>
                  <div className="inline" style={{ gap: '0.35rem' }}>
                    <span className="badge">{carveOut.type}</span>
                    {carveOut.member._id === member._id ? <span className="badge my-carveout">My Carve Out</span> : null}
                  </div>
                </div>
                <p>
                  <strong>Shared by:</strong> {displayMemberName(carveOut.member)}
                </p>
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
                {canManageCarveOut(carveOut) ? (
                  <div className="inline" style={{ marginTop: '0.4rem' }}>
                    <button type="button" className="secondary" onClick={() => openEditModal(carveOut)}>
                      Edit Carve Out
                    </button>
                    <button type="button" className="secondary" onClick={() => openDeleteModal(carveOut)}>
                      Delete Carve Out
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

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
