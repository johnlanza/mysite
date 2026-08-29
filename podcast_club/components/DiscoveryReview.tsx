'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { MediaArtwork } from '@/components/MediaArtwork';
import { PodcastListenChooser } from '@/components/PodcastListenChooser';
import { withBasePath } from '@/lib/base-path';
import { fetchJson } from '@/lib/client-fetch';
import {
  hasCompleteDiscoveryReview,
  type DiscoveryDiscussionLevel,
  type DiscoveryFeedbackRecord,
  type DiscoveryReviewDraft,
  type DiscoveryReviewLevel
} from '@/lib/discovery-feedback';
import type { GuestAppearance } from '@/lib/guest-appearances';
import type { IntelligenceRecommendation } from '@/lib/intelligence';

type FeedbackPayload = {
  history: Record<string, DiscoveryFeedbackRecord>;
  reviewCounts: Record<string, number>;
};

type ReviewField = 'attention' | 'subjectFit' | 'guestValue' | 'hostQuality';
type DiscussionField = 'discussionPotential';

const REVIEW_ROWS: Array<{
  field: ReviewField;
  label: string;
  options: Array<{ value: DiscoveryReviewLevel; label: string }>;
}> = [
  {
    field: 'attention',
    label: 'Did it hold your attention?',
    options: [{ value: 'strong', label: 'Yes' }, { value: 'mixed', label: 'Somewhat' }, { value: 'weak', label: 'No' }]
  },
  {
    field: 'subjectFit',
    label: 'Subject or premise',
    options: [{ value: 'strong', label: 'Strong' }, { value: 'mixed', label: 'Mixed' }, { value: 'weak', label: 'Not for me' }]
  },
  {
    field: 'guestValue',
    label: 'Guest or perspective',
    options: [{ value: 'strong', label: 'Strong' }, { value: 'mixed', label: 'Mixed' }, { value: 'weak', label: 'Weak' }]
  },
  {
    field: 'hostQuality',
    label: 'Host or presentation',
    options: [{ value: 'strong', label: 'Strong' }, { value: 'mixed', label: 'Fine' }, { value: 'weak', label: 'Weak' }]
  }
];

const DISCUSSION_ROW: {
  field: DiscussionField;
  label: string;
  options: Array<{ value: DiscoveryDiscussionLevel; label: string }>;
} = {
  field: 'discussionPotential',
  label: 'Society discussion potential',
  options: [{ value: 'strong', label: 'Strong' }, { value: 'maybe', label: 'Maybe' }, { value: 'weak', label: 'Weak' }]
};

function inferGuestName(item: IntelligenceRecommendation) {
  const title = item.title.trim();
  const directMatch = title.match(/\b(?:with|featuring|feat\.?|ft\.?)\s+([^|:–—-]{3,80})/i);
  if (directMatch?.[1]) return directMatch[1].trim();

  const pipeParts = title.split('|').map((part) => part.trim()).filter(Boolean);
  if (pipeParts.length >= 2) {
    const candidates = pipeParts.slice(1).filter((part) => {
      const key = part.toLowerCase();
      return !key.includes('podcast') && !/\bep(?:isode)?\.?\s*\d+/i.test(part) && part.split(/\s+/).length <= 7;
    });
    if (candidates[0]) return candidates[0];
  }

  const colonPrefix = title.split(':')[0]?.trim() || '';
  if (colonPrefix.split(/\s+/).length >= 2 && colonPrefix.split(/\s+/).length <= 5) return colonPrefix;
  return '';
}

function formatReleaseDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date);
}

export function DiscoveryReview({
  item,
  record,
  reviewCount,
  onUpdated
}: {
  item: IntelligenceRecommendation;
  record?: DiscoveryFeedbackRecord;
  reviewCount: number;
  onUpdated: (payload: FeedbackPayload) => void;
}) {
  const [draft, setDraft] = useState<Partial<DiscoveryReviewDraft>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [guestResults, setGuestResults] = useState<GuestAppearance[]>([]);
  const [guestSearchMessage, setGuestSearchMessage] = useState('');
  const [guestSearching, setGuestSearching] = useState(false);

  const hasSavedReview = hasCompleteDiscoveryReview(record);
  const reviewComplete = hasCompleteDiscoveryReview({ ...draft, themes: [], discussionSignals: 0 });
  const societyRemaining = Math.max(0, 3 - reviewCount);
  const inferredGuest = useMemo(() => inferGuestName(item), [item]);
  const guestReady = !draft.findGuestElsewhere || (draft.guestName || inferredGuest).trim().length >= 3;
  const canSave = reviewComplete && guestReady;

  useEffect(() => {
    setDraft(hasCompleteDiscoveryReview(record) ? {
      listenState: record.listenState,
      attention: record.attention,
      subjectFit: record.subjectFit,
      guestValue: record.guestValue,
      hostQuality: record.hostQuality,
      discussionPotential: record.discussionPotential,
      findGuestElsewhere: Boolean(record.findGuestElsewhere),
      guestName: record.guestName || '',
      note: record.note || ''
    } : {});
  }, [item.id, record]);

  useEffect(() => {
    setMessage('');
    setGuestResults([]);
    setGuestSearchMessage('');
  }, [item.id]);

  function chooseListenState(listenState: DiscoveryReviewDraft['listenState']) {
    setDraft((current) => ({
      ...current,
      listenState,
      ...(listenState === 'stopped' && !current.attention ? { attention: 'weak' as const } : {})
    }));
    setMessage('');
  }

  async function saveReview(event: FormEvent) {
    event.preventDefault();
    if (!reviewComplete) {
      setMessage('Complete each row so Discovery can separate what worked from what did not.');
      return;
    }
    if (!guestReady) {
      setMessage('Enter the guest’s full name so Discovery knows whom to find elsewhere.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const result = await fetchJson<FeedbackPayload>(withBasePath('/api/discovery-feedback'), {
        method: 'PUT',
        body: {
          recommendationKey: item.id,
          title: item.title,
          href: item.href || '',
          sourceKey: item.sourceKey || '',
          themes: item.themes,
          discussionSignals: Math.min(3, item.reasons.length),
          ...draft,
          guestName: draft.findGuestElsewhere ? draft.guestName || inferredGuest : '',
          note: draft.note || ''
        }
      });
      if (!result.ok) {
        setMessage(result.message || 'Unable to save this review.');
        return;
      }
      onUpdated(result.data);
      setMessage('Saved to your account. Your detailed note remains private.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save this review.');
    } finally {
      setSaving(false);
    }
  }

  async function removeReview() {
    setSaving(true);
    setMessage('');
    try {
      const result = await fetchJson<FeedbackPayload>(withBasePath('/api/discovery-feedback'), {
        method: 'PUT',
        body: { recommendationKey: item.id, title: item.title, remove: true }
      });
      if (!result.ok) {
        setMessage(result.message || 'Unable to remove this review.');
        return;
      }
      onUpdated(result.data);
      setDraft({});
      setGuestResults([]);
      setMessage('Review removed. This episode no longer shapes your personal Discovery ranking.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to remove this review.');
    } finally {
      setSaving(false);
    }
  }

  async function searchGuestAppearances() {
    const guestName = (draft.guestName || inferredGuest).trim();
    if (guestName.length < 3) {
      setGuestSearchMessage('Enter the guest’s full name first.');
      return;
    }
    setGuestSearching(true);
    setGuestSearchMessage('');
    setGuestResults([]);
    try {
      const params = new URLSearchParams({
        guestName,
        excludeShow: item.showTitle || '',
        excludeEpisodeId: item.id
      });
      const result = await fetchJson<{ appearances: GuestAppearance[] }>(
        withBasePath(`/api/intelligence/guest-appearances?${params.toString()}`)
      );
      if (!result.ok) {
        setGuestSearchMessage(result.message || 'Unable to search for other appearances.');
        return;
      }
      setGuestResults(result.data.appearances || []);
      setGuestSearchMessage(result.data.appearances.length
        ? `Found ${result.data.appearances.length} other show${result.data.appearances.length === 1 ? '' : 's'} featuring ${guestName}.`
        : `No strong Apple Podcasts matches found for ${guestName}. Try the full guest name.`);
    } catch (error) {
      setGuestSearchMessage(error instanceof Error ? error.message : 'Unable to search for other appearances.');
    } finally {
      setGuestSearching(false);
    }
  }

  return (
    <div className="discovery-review">
      <div className="discovery-review-heading">
        <span><span className="new-feature-badge">NEW!</span><strong>Review after listening</strong></span>
        <small>Separate the subject, guest, host, and discussion value. Your reaction cannot change the Active Ballot.</small>
      </div>

      <div className="discovery-review-start" role="group" aria-label="How much of this episode did you hear?">
        <button type="button" className={draft.listenState === 'listened' ? 'selected' : ''} aria-pressed={draft.listenState === 'listened'} onClick={() => chooseListenState('listened')}>
          <strong>I listened</strong><small>I heard enough to review it</small>
        </button>
        <button type="button" className={draft.listenState === 'stopped' ? 'selected' : ''} aria-pressed={draft.listenState === 'stopped'} onClick={() => chooseListenState('stopped')}>
          <strong>I stopped early</strong><small>It did not earn more listening time</small>
        </button>
      </div>

      {draft.listenState ? (
        <form className="discovery-review-form" onSubmit={saveReview}>
          {REVIEW_ROWS.map((row) => (
            <fieldset className="discovery-review-row" key={row.field}>
              <legend>{row.label}</legend>
              <div role="group" aria-label={row.label}>
                {row.options.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={draft[row.field] === option.value ? 'selected' : ''}
                    aria-pressed={draft[row.field] === option.value}
                    onClick={() => setDraft((current) => ({ ...current, [row.field]: option.value }))}
                  >{option.label}</button>
                ))}
              </div>
            </fieldset>
          ))}
          <fieldset className="discovery-review-row">
            <legend>{DISCUSSION_ROW.label}</legend>
            <div role="group" aria-label={DISCUSSION_ROW.label}>
              {DISCUSSION_ROW.options.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={draft.discussionPotential === option.value ? 'selected' : ''}
                  aria-pressed={draft.discussionPotential === option.value}
                  onClick={() => setDraft((current) => ({ ...current, discussionPotential: option.value }))}
                >{option.label}</button>
              ))}
            </div>
          </fieldset>

          <label className="discovery-guest-toggle">
            <input
              type="checkbox"
              checked={Boolean(draft.findGuestElsewhere)}
              onChange={(event) => setDraft((current) => ({
                ...current,
                findGuestElsewhere: event.target.checked,
                guestName: event.target.checked ? current.guestName || inferredGuest : current.guestName
              }))}
            />
            <span><strong>Find this guest on another show</strong><small>Keep the guest signal without rewarding a host or show that did not work.</small></span>
          </label>

          {draft.findGuestElsewhere ? (
            <div className="discovery-guest-search">
              <label htmlFor={`guest-name-${item.id}`}>Guest name</label>
              <div>
                <input
                  id={`guest-name-${item.id}`}
                  value={draft.guestName || ''}
                  onChange={(event) => setDraft((current) => ({ ...current, guestName: event.target.value }))}
                  placeholder="Confirm or enter the guest’s full name"
                  maxLength={120}
                />
                <button type="button" className="ghost" disabled={guestSearching} onClick={searchGuestAppearances}>
                  {guestSearching ? 'Searching…' : 'Find other interviews'}
                </button>
              </div>
              {guestSearchMessage ? <small role="status">{guestSearchMessage}</small> : null}
            </div>
          ) : null}

          {guestResults.length ? (
            <div className="discovery-guest-results" aria-label="Other guest appearances">
              {guestResults.map((appearance) => (
                <article key={appearance.id}>
                  <MediaArtwork url={appearance.href} title={appearance.title} creator={appearance.host} kind="podcast" fallback="🎧" />
                  <div>
                    <strong>{appearance.title}</strong>
                    <small>{appearance.showTitle}{appearance.durationMinutes ? ` · ${appearance.durationMinutes} min` : ''}{formatReleaseDate(appearance.releaseDate) ? ` · ${formatReleaseDate(appearance.releaseDate)}` : ''}</small>
                  </div>
                  <PodcastListenChooser title={appearance.showTitle} episodeNames={appearance.title} host={appearance.host} link={appearance.href} className="ghost">
                    Listen options
                  </PodcastListenChooser>
                </article>
              ))}
              <small className="discovery-guest-caveat">These are other appearances—not endorsements of the episode or host. Compare the choices before listening.</small>
            </div>
          ) : null}

          <label className="discovery-review-note" htmlFor={`discovery-note-${item.id}`}>
            <span>Optional private note</span>
            <textarea
              id={`discovery-note-${item.id}`}
              value={draft.note || ''}
              onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
              placeholder="What worked, what did not, or what should Discovery try instead?"
              maxLength={600}
              rows={3}
            />
          </label>

          <div className="discovery-society-threshold">
            <strong>{reviewCount >= 3 ? 'Society threshold reached' : `${reviewCount} of 3 independent reviews`}</strong>
            <small>{reviewCount >= 3
              ? 'This episode is eligible to inform a future shared Society profile. Individual notes stay private.'
              : `Your scoring remains personal. ${societyRemaining} more independent review${societyRemaining === 1 ? '' : 's'} ${societyRemaining === 1 ? 'is' : 'are'} needed before any shared learning.`}</small>
          </div>

          <div className="discovery-review-actions">
            <button type="submit" className="action-link" disabled={saving || !canSave}>{saving ? 'Saving…' : hasSavedReview ? 'Update my review' : 'Save my review'}</button>
            {hasSavedReview ? <button type="button" className="ghost" disabled={saving} onClick={removeReview}>Remove my review</button> : null}
          </div>
          {message ? <small role="status" className="discovery-feedback-message">{message}</small> : null}
        </form>
      ) : (
        <p className="discovery-review-prompt">Choose one option after trying the episode. Opening a listening app by itself does not count as a review.</p>
      )}
    </div>
  );
}
