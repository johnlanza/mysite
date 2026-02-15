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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export default function CarveOutsPage() {
  const [member, setMember] = useState<SessionMember | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [carveOuts, setCarveOuts] = useState<CarveOut[]>([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
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
  const displayMemberName = (person: { _id: string; name: string }) =>
    member && person._id === member._id ? 'You' : person.name;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
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
    setSaving(false);
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
        </form>
      </div>

      <div className="card carveouts-card">
        <h2>Carve Out Library</h2>
        <div className="list">
          {recentCarveOuts.length === 0 ? <p>No carve outs saved yet.</p> : null}
          {recentCarveOuts.map((carveOut) => (
            <div className="item" key={carveOut._id}>
              <div className="inline">
                <h4>{carveOut.title}</h4>
                <span className="badge">{carveOut.type}</span>
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
            {visibleCarveOuts.length === 0 ? <p>No carve outs saved yet.</p> : null}
            {visibleCarveOuts.map((carveOut) => (
              <div className="item" key={`all-${carveOut._id}`}>
                <div className="inline">
                  <h4>{carveOut.title}</h4>
                  <span className="badge">{carveOut.type}</span>
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
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
