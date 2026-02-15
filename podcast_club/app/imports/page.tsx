'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { withBasePath } from '@/lib/base-path';
import type { SessionMember } from '@/lib/types';

type ImporterDefinition = {
  id: string;
  label: string;
  endpoint: string;
  description: string;
  mapping: Record<string, string | number>;
};

type ImportResponse = {
  batchId: string;
  importedMeetings?: number;
  importedPodcasts?: number;
  importedCarveOuts?: number;
  parsedRows?: number;
  parsedEntries?: number;
  warnings?: string[];
  message?: string;
};

const IMPORTERS: ImporterDefinition[] = [
  {
    id: 'legacy-meetings-v1',
    label: 'Previous Club Selections CSV',
    endpoint: '/api/imports/legacy-meetings',
    description:
      'Imports past meetings and podcasts. Host is matched by name; unknown hosts are assigned to the current admin.',
    mapping: {
      meetingDate: 0,
      meetingHostName: 1,
      podcastTitle: 2,
      podcastHost: 3,
      podcastEpisodeCount: 4,
      podcastEpisodeNames: 5,
      podcastTotalTimeMinutes: 6,
      podcastLink: 7,
      podcastNotes: 8,
      podcastSubmittedByName: 1
    }
  },
  {
    id: 'legacy-carveouts-v1',
    label: 'Past Carve Outs CSV',
    endpoint: '/api/imports/legacy-carveouts',
    description:
      'Imports carve outs from the Club Date/member matrix format. Parses title/link when possible and infers media type heuristically.',
    mapping: {
      clubDate: 0
    }
  },
  {
    id: 'legacy-pending-podcasts-v1',
    label: 'Current Podcast Queue CSV (Wank-O-Matic)',
    endpoint: '/api/imports/legacy-pending-podcasts',
    description:
      'Imports pending podcasts from Wank-O-Matic. Skips row 1 instructions and row 3 placeholder; maps owner from \"My podcast\" and ratings from member columns; ignores Missing column.',
    mapping: {
      podcastTitle: 0,
      podcastHost: 1,
      podcastEpisodeCount: 2,
      podcastEpisodeNames: 3,
      podcastTotalTimeMinutes: 4,
      podcastLink: 5,
      podcastNotes: 6
    }
  }
];

export default function ImportsPage() {
  const [member, setMember] = useState<SessionMember | null>(null);
  const [selectedImporterId, setSelectedImporterId] = useState<string>(IMPORTERS[0].id);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [batchId, setBatchId] = useState('');
  const [batches, setBatches] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);

  const selectedImporter = useMemo(
    () => IMPORTERS.find((importer) => importer.id === selectedImporterId) || IMPORTERS[0],
    [selectedImporterId]
  );

  async function loadSession() {
    setLoading(true);

    const res = await fetch(withBasePath('/api/auth/me'), { cache: 'no-store' });
    if (!res.ok) {
      setMember(null);
      setLoading(false);
      return;
    }

    const payload = await res.json();
    setMember(payload.member);
    setLoading(false);
  }

  async function loadBatches(importer: ImporterDefinition) {
    const res = await fetch(withBasePath(importer.endpoint), { cache: 'no-store' });
    if (!res.ok) {
      setBatches([]);
      return;
    }

    const payload = (await res.json()) as { batches?: string[] };
    setBatches(Array.isArray(payload.batches) ? payload.batches : []);
  }

  useEffect(() => {
    void loadSession();
  }, []);

  useEffect(() => {
    if (!member?.isAdmin) {
      setBatches([]);
      return;
    }
    void loadBatches(selectedImporter);
  }, [member, selectedImporter]);

  async function runImport(event: FormEvent) {
    event.preventDefault();
    setError('');
    setResult(null);

    if (!csvFile) {
      setError('Please select a CSV file.');
      return;
    }

    setSaving(true);

    try {
      const csvText = await csvFile.text();
      const res = await fetch(withBasePath(selectedImporter.endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv: csvText,
          mapping: selectedImporter.mapping,
          options: {
            ...(batchId.trim() ? { batchId: batchId.trim() } : {})
          }
        })
      });

      const payload = (await res.json()) as ImportResponse & { message?: string };

      if (!res.ok) {
        setError(payload.message || 'Import failed.');
        setSaving(false);
        return;
      }

      setResult(payload);
      setCsvFile(null);
      setBatchId('');
      const fileInput = document.getElementById('legacy-import-file') as HTMLInputElement | null;
      if (fileInput) {
        fileInput.value = '';
      }
      await loadBatches(selectedImporter);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import failed.');
    }

    setSaving(false);
  }

  async function deleteBatch(batch: string) {
    const confirmText = window.prompt(`Type DELETE to rollback import batch: ${batch}`);
    if (confirmText !== 'DELETE') {
      return;
    }

    setError('');
    setDeletingBatchId(batch);

    const res = await fetch(withBasePath(selectedImporter.endpoint), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: batch, confirmText })
    });

    const payload = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      setError(payload.message || 'Unable to rollback import batch.');
      setDeletingBatchId(null);
      return;
    }

    if (result?.batchId === batch) {
      setResult(null);
    }

    await loadBatches(selectedImporter);
    setDeletingBatchId(null);
  }

  if (loading) {
    return (
      <section className="grid" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h2>Imports</h2>
          <p>Loading...</p>
        </div>
      </section>
    );
  }

  if (!member) {
    return (
      <section className="grid" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h2>Imports</h2>
          <p>Please login to run imports.</p>
          <Link className="nav-link" href="/login">
            Go to Login
          </Link>
        </div>
      </section>
    );
  }

  if (!member.isAdmin) {
    return (
      <section className="grid" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h2>Imports</h2>
          <p>Only admins can run imports.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid two" style={{ marginTop: '1rem' }}>
      <div className="card">
        <h2>Run Import</h2>
        <form className="form" onSubmit={runImport}>
          <label>
            Importer
            <select value={selectedImporterId} onChange={(event) => setSelectedImporterId(event.target.value)}>
              {IMPORTERS.map((importer) => (
                <option key={importer.id} value={importer.id}>
                  {importer.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            CSV File
            <input
              id="legacy-import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setCsvFile(event.target.files?.[0] || null)}
              required
            />
          </label>

          <label>
            Batch ID (optional)
            <input
              value={batchId}
              placeholder="legacy-2026-02-15"
              onChange={(event) => setBatchId(event.target.value)}
            />
          </label>

          <button disabled={saving}>{saving ? 'Importing...' : 'Run Import'}</button>

          <p>{selectedImporter.description}</p>

          {error ? <p className="error">{error}</p> : null}
        </form>

        {result ? (
          <div style={{ marginTop: '1rem' }}>
            <h3>Latest Result</h3>
            <p>
              <strong>Batch:</strong> {result.batchId}
            </p>
            {typeof result.importedMeetings === 'number' ? (
              <p>
                <strong>Meetings Imported:</strong> {result.importedMeetings}
              </p>
            ) : null}
            {typeof result.importedPodcasts === 'number' ? (
              <p>
                <strong>Podcasts Imported:</strong> {result.importedPodcasts}
              </p>
            ) : null}
            {typeof result.parsedEntries === 'number' ? (
              <p>
                <strong>Parsed Entries:</strong> {result.parsedEntries}
              </p>
            ) : null}
            {typeof result.parsedRows === 'number' ? (
              <p>
                <strong>Parsed Rows:</strong> {result.parsedRows}
              </p>
            ) : null}
            {typeof result.importedCarveOuts === 'number' ? (
              <p>
                <strong>Carve Outs Imported:</strong> {result.importedCarveOuts}
              </p>
            ) : null}
            {result.warnings && result.warnings.length > 0 ? (
              <div>
                <p>
                  <strong>Warnings:</strong>
                </p>
                <ul>
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2>Previous Imports</h2>
        <div className="inline" style={{ marginBottom: '0.75rem' }}>
          <button className="secondary" onClick={() => void loadBatches(selectedImporter)} type="button">
            Refresh
          </button>
        </div>

        {batches.length === 0 ? <p>No import batches found.</p> : null}

        {batches.map((batch) => (
          <div key={batch} className="inline" style={{ alignItems: 'center', marginBottom: '0.5rem' }}>
            <code>{batch}</code>
            <button
              className="secondary"
              onClick={() => void deleteBatch(batch)}
              disabled={deletingBatchId === batch}
              type="button"
            >
              {deletingBatchId === batch ? 'Deleting...' : 'Delete Batch'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
