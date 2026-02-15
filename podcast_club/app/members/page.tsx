'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { US_STATE_CODES } from '@/lib/address';
import { withBasePath } from '@/lib/base-path';
import type { Member, SessionMember } from '@/lib/types';

const initialForm = {
  name: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  password: '',
  isAdmin: false
};

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [currentMember, setCurrentMember] = useState<SessionMember | null>(null);
  const [activeJoinCodes, setActiveJoinCodes] = useState(0);
  const [generatedJoinCode, setGeneratedJoinCode] = useState('');
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [generatingClaimCodeFor, setGeneratingClaimCodeFor] = useState<string | null>(null);
  const [generatingResetCodeFor, setGeneratingResetCodeFor] = useState<string | null>(null);
  const [generatedClaimCodeByMember, setGeneratedClaimCodeByMember] = useState<
    Record<string, { code: string; expiresAt: string }>
  >({});
  const [generatedResetCodeByMember, setGeneratedResetCodeByMember] = useState<
    Record<string, { code: string; expiresAt: string }>
  >({});
  const [previewingMemberId, setPreviewingMemberId] = useState<string | null>(null);

  async function loadMembers() {
    const meRes = await fetch(withBasePath('/api/auth/me'), { cache: 'no-store' });
    if (!meRes.ok) {
      setCurrentMember(null);
      return;
    }

    const mePayload = await meRes.json();
    setCurrentMember(mePayload.member);

    const membersRes = await fetch(withBasePath('/api/members'));
    if (!membersRes.ok) return;
    setMembers(await membersRes.json());

    if (mePayload.member.isAdmin) {
      const codesRes = await fetch(withBasePath('/api/join-codes'));
      if (codesRes.ok) {
        const codePayload = await codesRes.json();
        setActiveJoinCodes(Number(codePayload.activeCodes || 0));
      }
    }
  }

  useEffect(() => {
    void loadMembers();
  }, []);

  function startEdit(member: Member) {
    setEditingId(member._id);
    setError('');
    setForm({
      name: member.name,
      email: member.email,
      addressLine1: member.addressLine1 || '',
      addressLine2: member.addressLine2 || '',
      city: member.city || '',
      state: member.state || '',
      postalCode: member.postalCode || '',
      password: '',
      isAdmin: member.isAdmin
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setError('');
    setForm(initialForm);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);

    const payload = {
      name: form.name,
      email: form.email,
      addressLine1: form.addressLine1,
      addressLine2: form.addressLine2,
      city: form.city,
      state: form.state,
      postalCode: form.postalCode,
      isAdmin: form.isAdmin,
      ...(editingId ? {} : { password: form.password })
    };

    const res = await fetch(editingId ? `/api/members/${editingId}` : '/api/members', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const payload = await res.json();
      setError(payload.message || 'Unable to save member.');
      setSaving(false);
      return;
    }

    if (!editingId) {
      const payload = await res.json();
      if (payload.claimCode) {
        setGeneratedClaimCodeByMember((prev) => ({
          ...prev,
          [payload._id]: {
            code: String(payload.claimCode),
            expiresAt: String(payload.claimCodeExpiresAt || '')
          }
        }));
      }
    }

    setForm(initialForm);
    setEditingId(null);
    await loadMembers();
    setSaving(false);
  }

  async function generateJoinCode() {
    setError('');
    setGeneratingCode(true);

    const res = await fetch(withBasePath('/api/join-codes'), { method: 'POST' });
    if (!res.ok) {
      const payload = await res.json();
      setError(payload.message || 'Unable to generate join code.');
      setGeneratingCode(false);
      return;
    }

    const payload = await res.json();
    setGeneratedJoinCode(payload.code || '');
    setActiveJoinCodes((prev) => prev + 1);
    setGeneratingCode(false);
  }

  async function generatePasswordResetCode(member: Member) {
    setError('');
    setGeneratingResetCodeFor(member._id);

    const res = await fetch(withBasePath('/api/password-reset-codes'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member._id })
    });

    if (!res.ok) {
      const payload = await res.json();
      setError(payload.message || 'Unable to generate password reset code.');
      setGeneratingResetCodeFor(null);
      return;
    }

    const payload = await res.json();
    setGeneratedResetCodeByMember((prev) => ({
      ...prev,
      [member._id]: {
        code: String(payload.code || ''),
        expiresAt: String(payload.expiresAt || '')
      }
    }));
    setGeneratingResetCodeFor(null);
  }

  async function generateClaimCode(member: Member) {
    setError('');
    setGeneratingClaimCodeFor(member._id);

    const res = await fetch(withBasePath('/api/account-claim-codes'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member._id })
    });

    if (!res.ok) {
      const payload = await res.json();
      setError(payload.message || 'Unable to generate claim code.');
      setGeneratingClaimCodeFor(null);
      return;
    }

    const payload = await res.json();
    setGeneratedClaimCodeByMember((prev) => ({
      ...prev,
      [member._id]: {
        code: String(payload.code || ''),
        expiresAt: String(payload.expiresAt || '')
      }
    }));
    setGeneratingClaimCodeFor(null);
  }

  async function deleteMember(member: Member) {
    setError('');
    const confirmation = window.prompt(`Type DELETE to permanently delete ${member.name}.`, '');
    if (confirmation === null) return;

    setDeletingId(member._id);
    const res = await fetch(`/api/members/${member._id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation })
    });

    if (!res.ok) {
      const payload = await res.json();
      setError(payload.message || 'Unable to delete member.');
      window.alert(payload.message || 'Unable to delete member.');
      setDeletingId(null);
      return;
    }

    await loadMembers();
    setDeletingId(null);
  }

  async function previewAsMember(member: Member) {
    setError('');
    setPreviewingMemberId(member._id);

    const res = await fetch(withBasePath('/api/auth/preview'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member._id })
    });

    if (!res.ok) {
      const payload = await res.json();
      setError(payload.message || 'Unable to start preview.');
      setPreviewingMemberId(null);
      return;
    }

    window.location.assign(withBasePath('/'));
  }

  if (!currentMember) {
    return (
      <section className="grid" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h2>Members</h2>
          <p>Please login to view members.</p>
          <Link className="nav-link" href="/login">
            Go to Login
          </Link>
        </div>
      </section>
    );
  }
  const annotateSelfInList = (member: Member) =>
    member._id === currentMember._id ? `${member.name} (you)` : member.name;

  return (
    <section className="grid two" style={{ marginTop: '1rem' }}>
      <div className="card">
        <h2>{editingId ? 'Edit Member' : 'Add Member'}</h2>
        {currentMember.isAdmin ? (
          <>
            <div className="item" style={{ marginBottom: '1rem' }}>
              <h3 style={{ marginTop: 0 }}>Join Codes</h3>
              <p>
                <strong>Active unused codes:</strong> {activeJoinCodes}
              </p>
              <div className="inline">
                <button type="button" onClick={generateJoinCode} disabled={generatingCode}>
                  {generatingCode ? 'Generating...' : 'Generate One-Time Join Code'}
                </button>
              </div>
              {generatedJoinCode ? (
                <p>
                  <strong>Latest code:</strong> {generatedJoinCode}
                </p>
              ) : null}
            </div>

            <form className="form" onSubmit={onSubmit}>
              <label>
                Name
                <input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
              </label>
              <label>
                Address Line 1
                <input
                  value={form.addressLine1}
                  onChange={(event) => setForm((prev) => ({ ...prev, addressLine1: event.target.value }))}
                  required
                />
              </label>
              <label>
                Address Line 2 (Optional)
                <input
                  value={form.addressLine2}
                  onChange={(event) => setForm((prev) => ({ ...prev, addressLine2: event.target.value }))}
                />
              </label>
              <label>
                City
                <input
                  value={form.city}
                  onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
                  required
                />
              </label>
              <label>
                State
                <select
                  value={form.state}
                  onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value }))}
                  required
                >
                  <option value="">Select state</option>
                  {US_STATE_CODES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ZIP Code
                <input
                  value={form.postalCode}
                  onChange={(event) => setForm((prev) => ({ ...prev, postalCode: event.target.value }))}
                  required
                />
              </label>
              {!editingId ? (
                <label>
                  Password (Optional)
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                    minLength={12}
                  />
                </label>
              ) : null}
              {!editingId ? (
                <p style={{ marginTop: '-0.25rem' }}>
                  Leave password blank to create a pending account and issue a one-time claim code.
                </p>
              ) : null}
              <div className="checkbox-row">
                <input
                  id="member-is-admin"
                  type="checkbox"
                  checked={form.isAdmin}
                  onChange={(event) => setForm((prev) => ({ ...prev, isAdmin: event.target.checked }))}
                />
                <label htmlFor="member-is-admin" style={{ margin: 0 }}>
                  Grant admin access
                </label>
              </div>
              <div className="inline">
                <button disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update Member' : 'Add Member'}</button>
                {editingId ? (
                  <button type="button" className="secondary" onClick={cancelEdit} disabled={saving}>
                    Cancel
                  </button>
                ) : null}
              </div>
              {error ? <p className="error">{error}</p> : null}
            </form>
          </>
        ) : (
          <p>Only admins can add members.</p>
        )}
      </div>

      <div className="card">
        <h2>Members</h2>
        <div className="list">
          {members.length === 0 ? <p>No members yet.</p> : null}
          {members.map((member) => (
            <div className="item" key={member._id}>
              <div className="inline">
                <h4>{annotateSelfInList(member)}</h4>
                {member.isAdmin ? <span className="badge">Admin</span> : null}
                {member.accountStatus === 'pending' ? <span className="badge">Pending Claim</span> : null}
              </div>
              <p>{member.email}</p>
              <p>{member.address}</p>
              {currentMember.isAdmin ? (
                <div className="inline">
                  <button type="button" className="secondary" onClick={() => startEdit(member)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => previewAsMember(member)}
                    disabled={previewingMemberId === member._id || member._id === currentMember._id}
                  >
                    {previewingMemberId === member._id ? 'Previewing...' : 'Preview as'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => deleteMember(member)}
                    disabled={deletingId === member._id || member._id === currentMember._id}
                  >
                    {deletingId === member._id ? 'Deleting...' : 'Delete'}
                  </button>
                  {member.accountStatus === 'pending' ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => generateClaimCode(member)}
                      disabled={generatingClaimCodeFor === member._id}
                    >
                      {generatingClaimCodeFor === member._id ? 'Generating...' : 'Generate Claim Code'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => generatePasswordResetCode(member)}
                    disabled={generatingResetCodeFor === member._id}
                  >
                    {generatingResetCodeFor === member._id ? 'Generating...' : 'Generate Password Reset Code'}
                  </button>
                </div>
              ) : null}
              {generatedResetCodeByMember[member._id] ? (
                <p>
                  <strong>Reset code:</strong> {generatedResetCodeByMember[member._id].code} (expires{' '}
                  {new Date(generatedResetCodeByMember[member._id].expiresAt).toLocaleTimeString()})
                </p>
              ) : null}
              {generatedClaimCodeByMember[member._id] ? (
                <p>
                  <strong>Claim code:</strong> {generatedClaimCodeByMember[member._id].code} (expires{' '}
                  {new Date(generatedClaimCodeByMember[member._id].expiresAt).toLocaleString()})
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
