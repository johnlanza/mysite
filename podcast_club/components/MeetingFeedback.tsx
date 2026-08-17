'use client';

import { useEffect, useState } from 'react';
import { withBasePath } from '@/lib/base-path';
import { fetchJson, getRequestErrorMessage } from '@/lib/client-fetch';

type FeedbackOption = 'listen' | 'discussion' | 'surprise';
type FeedbackSummary = {
  selections: FeedbackOption[];
  counts: Record<FeedbackOption, number>;
  responseCount: number;
};

const OPTIONS: Array<{ id: FeedbackOption; icon: string; label: string }> = [
  { id: 'listen', icon: '🎧', label: 'Great listen' },
  { id: 'discussion', icon: '💬', label: 'Great discussion' },
  { id: 'surprise', icon: '✦', label: 'Changed my mind' }
];

const EMPTY_COUNTS: Record<FeedbackOption, number> = { listen: 0, discussion: 0, surprise: 0 };

export function MeetingFeedback({ podcast, meetingId }: { podcast: { _id: string; title: string }; meetingId: string }) {
  const [summary, setSummary] = useState<FeedbackSummary>({ selections: [], counts: EMPTY_COUNTS, responseCount: 0 });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(withBasePath(`/api/meeting-feedback?podcastId=${encodeURIComponent(podcast._id)}`), {
      cache: 'no-store',
      signal: controller.signal
    })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: FeedbackSummary | null) => {
        if (payload) setSummary(payload);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [podcast._id]);

  async function toggle(option: FeedbackOption) {
    if (saving) return;
    const selections = summary.selections.includes(option)
      ? summary.selections.filter((value) => value !== option)
      : [...summary.selections, option];
    const previous = summary;
    setSummary((current) => ({ ...current, selections }));
    setSaving(true);
    setMessage('');
    try {
      const result = await fetchJson<FeedbackSummary>(withBasePath('/api/meeting-feedback'), {
        method: 'PUT',
        body: { podcastId: podcast._id, meetingId, selections }
      });
      if (!result.ok) {
        setSummary(previous);
        setMessage(result.message || 'Unable to save feedback.');
        return;
      }
      setSummary(result.data);
      setMessage(selections.length ? 'Saved.' : 'Feedback cleared.');
    } catch (error) {
      setSummary(previous);
      setMessage(getRequestErrorMessage(error, 'Unable to save feedback.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="meeting-feedback-card" aria-labelledby={`feedback-${podcast._id}`}>
      <div className="meeting-feedback-heading">
        <div>
          <p className="section-kicker">Meeting Feedback</p>
          <h3 id={`feedback-${podcast._id}`}>{podcast.title}</h3>
        </div>
        <span className="badge">Choose all that apply</span>
      </div>
      <div className="meeting-feedback-options" role="group" aria-label={`Feedback for ${podcast.title}. Choose all that apply.`}>
        {OPTIONS.map((option) => {
          const selected = summary.selections.includes(option.id);
          return (
            <button
              type="button"
              key={option.id}
              className={selected ? 'selected' : ''}
              aria-pressed={selected}
              onClick={() => toggle(option.id)}
              disabled={saving}
            >
              <span aria-hidden="true">{option.icon}</span>
              <strong>{option.label}</strong>
              <small>{summary.counts[option.id] || 0}</small>
            </button>
          );
        })}
      </div>
      <p className="meeting-feedback-note">
        {summary.responseCount ? `${summary.responseCount} member${summary.responseCount === 1 ? '' : 's'} responded.` : 'Be the first to respond.'}
        {message ? ` ${message}` : ''}
      </p>
    </section>
  );
}
