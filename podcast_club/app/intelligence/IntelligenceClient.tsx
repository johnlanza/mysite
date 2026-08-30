'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DiscoveryReview } from '@/components/DiscoveryReview';
import { MediaArtwork } from '@/components/MediaArtwork';
import { PodcastListenChooser } from '@/components/PodcastListenChooser';
import { withBasePath } from '@/lib/base-path';
import {
  getDiscoveryEpisodeFeedbackScore,
  getDiscoverySourceFeedbackScore,
  getDiscoveryThemeFeedbackScore,
  type DiscoveryFeedbackRecord
} from '@/lib/discovery-feedback';
import type { IntelligenceRecommendation, IntelligenceReport } from '@/lib/intelligence';
import { useSession } from '@/lib/use-session';

type DiscoveryMood = 'conversation' | 'story' | 'learn' | 'wildcard';
type TimeBudget = 'any' | 'short' | 'standard' | 'deep';

const MOODS: Array<{ id: DiscoveryMood; label: string; detail: string; terms: string[] }> = [
  { id: 'conversation', label: 'Discussion', detail: 'Ideas with room for disagreement', terms: ['behavior', 'history', 'power', 'money', 'investigation'] },
  { id: 'story', label: 'Story', detail: 'Narrative, people, and culture', terms: ['story', 'culture', 'history', 'mystery'] },
  { id: 'learn', label: 'Learn', detail: 'Science, history, and how things work', terms: ['science', 'technology', 'history', 'business', 'economics'] },
  { id: 'wildcard', label: 'Something different', detail: "Outside the club's usual subjects", terms: [] }
];

const TIMES: Array<{ id: TimeBudget; label: string }> = [
  { id: 'any', label: 'Any length' },
  { id: 'short', label: 'Under 45 min' },
  { id: 'standard', label: '45–75 min' },
  { id: 'deep', label: 'Over 75 min' }
];

function getDuration(item: IntelligenceRecommendation) {
  const badge = item.badges.find((value) => /\d+\s*min/i.test(value));
  return badge ? Number(badge.match(/\d+/)?.[0] || 0) : 0;
}

function fitsTime(item: IntelligenceRecommendation, budget: TimeBudget) {
  const duration = getDuration(item);
  if (budget === 'any' || !duration) return true;
  if (budget === 'short') return duration < 45;
  if (budget === 'standard') return duration >= 45 && duration <= 75;
  return duration > 75;
}

function moodBonus(item: IntelligenceRecommendation, mood: DiscoveryMood) {
  if (mood === 'wildcard') return Math.max(0, 8 - item.themes.length * 2);
  const terms = MOODS.find((option) => option.id === mood)?.terms || [];
  const haystack = [...item.themes, ...item.reasons].join(' ').toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 5 : 0), 0);
}

function RecommendationCard({ item, onSelect }: { item: IntelligenceRecommendation; onSelect: () => void }) {
  return (
    <article className="discovery-shortlist-card">
      <MediaArtwork url={item.href} title={item.title} kind="podcast" className="discovery-shortlist-art" fallback="🎧" />
      <div>
        <span className="badge">{item.confidence}</span>
        <h3>{item.title}</h3>
        <p>{item.subtitle}</p>
        <div className="podcast-meta-row">
          {item.themes.slice(0, 2).map((theme) => <span className="badge" key={`${item.id}-${theme}`}>{theme}</span>)}
          {getDuration(item) ? <span className="badge">{getDuration(item)} min</span> : null}
        </div>
      </div>
      <button type="button" className="ghost" onClick={onSelect}>View details ↑</button>
    </article>
  );
}

export default function IntelligenceClient({ embedded = false }: { embedded?: boolean }) {
  const { loading, member } = useSession();
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [error, setError] = useState('');
  const [loadingReport, setLoadingReport] = useState(false);
  const [mood, setMood] = useState<DiscoveryMood | null>(null);
  const [timeBudget, setTimeBudget] = useState<TimeBudget>('any');
  const [selectedId, setSelectedId] = useState('');
  const [history, setHistory] = useState<Record<string, DiscoveryFeedbackRecord>>({});
  const [reviewCounts, setReviewCounts] = useState<Record<string, number>>({});
  const topCardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!member) return;
    const controller = new AbortController();
    setLoadingReport(true);
    setError('');

    Promise.all([
      fetch(withBasePath('/api/intelligence'), { cache: 'no-store', signal: controller.signal }),
      fetch(withBasePath('/api/discovery-feedback'), { cache: 'no-store', signal: controller.signal })
    ])
      .then(async ([reportResponse, feedbackResponse]) => {
        const payload = await reportResponse.json().catch(() => null);
        if (!reportResponse.ok) throw new Error(payload?.message || `Request failed with status ${reportResponse.status}.`);
        setReport(payload as IntelligenceReport);
        if (feedbackResponse.ok) {
          const feedback = await feedbackResponse.json() as {
            history?: Record<string, DiscoveryFeedbackRecord>;
            reviewCounts?: Record<string, number>;
          };
          setHistory(feedback.history || {});
          setReviewCounts(feedback.reviewCounts || {});
        }
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(requestError instanceof Error ? requestError.message : 'Unable to load club suggestions.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingReport(false);
      });
    return () => controller.abort();
  }, [member]);

  const themeSignals = useMemo(() => {
    const signals = new Map<string, { label: string; score: number }>();
    Object.entries(history).forEach(([recommendationKey, record]) => {
      const weight = getDiscoveryThemeFeedbackScore(record);
      const themes = record.themes.length
        ? record.themes
        : report?.podcasts.find((item) => item.id === recommendationKey)?.themes || [];
      themes.forEach((theme) => {
        const key = theme.trim().toLowerCase();
        if (!key) return;
        const current = signals.get(key);
        signals.set(key, { label: theme, score: (current?.score || 0) + weight });
      });
    });
    return signals;
  }, [history, report]);

  const sourceSignals = useMemo(() => {
    const signals = new Map<string, number>();
    Object.values(history).forEach((record) => {
      const key = record.sourceKey?.trim().toLowerCase();
      if (!key) return;
      signals.set(key, (signals.get(key) || 0) + getDiscoverySourceFeedbackScore(record));
    });
    return signals;
  }, [history]);

  const visibleThemeSignals = useMemo(
    () => [...themeSignals.values()]
      .filter((signal) => signal.score !== 0)
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score) || a.label.localeCompare(b.label))
      .slice(0, 3),
    [themeSignals]
  );

  const ranked = useMemo(() => {
    if (!report) return [];
    return report.podcasts
      .filter((item) => fitsTime(item, timeBudget))
      .map((item) => {
        const record = history[item.id];
        const feedbackBonus = record ? getDiscoveryEpisodeFeedbackScore(record) : 0;
        const learnedThemeBonus = item.themes.reduce(
          (total, theme) => total + (themeSignals.get(theme.trim().toLowerCase())?.score || 0),
          0
        );
        const sourceBonus = item.sourceKey ? sourceSignals.get(item.sourceKey.trim().toLowerCase()) || 0 : 0;
        return {
          item,
          adjustedScore: item.score + (mood ? moodBonus(item, mood) : 0) + feedbackBonus + sourceBonus + Math.max(-14, Math.min(14, learnedThemeBonus))
        };
      })
      .sort((a, b) => b.adjustedScore - a.adjustedScore)
      .map(({ item }) => item);
  }, [history, mood, report, sourceSignals, themeSignals, timeBudget]);

  const topSuggestion = ranked.find((item) => item.id === selectedId) || ranked[0];
  const shortlist = ranked.filter((item) => item.id !== topSuggestion?.id).slice(0, 6);
  const selectedMood = MOODS.find((option) => option.id === mood);
  const selectedTime = TIMES.find((option) => option.id === timeBudget) || TIMES[0];

  function showRecommendation(id: string) {
    setSelectedId(id);
    window.requestAnimationFrame(() => {
      topCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      topCardRef.current?.focus({ preventScroll: true });
    });
  }

  const Wrapper = embedded ? 'div' : 'section';
  const wrapperClassName = embedded
    ? 'intelligence-page podcast-discovery-embedded'
    : 'more-page intelligence-page page-stack';

  if (loading) {
    return <Wrapper className={wrapperClassName}><div className="section-panel"><h2>Discovery Lab <span className="badge discovery-beta-badge">NEW · BETA</span></h2><p>Loading...</p></div></Wrapper>;
  }

  if (!member) {
    return (
      <Wrapper className={wrapperClassName}>
        <div className="section-panel"><h2>Discovery Lab <span className="badge discovery-beta-badge">NEW · BETA</span></h2><p>Please login to view discoveries.</p><Link className="action-link" href="/login">Go to Login</Link></div>
      </Wrapper>
    );
  }

  return (
    <Wrapper className={wrapperClassName}>
      <div className="section-panel intelligence-panel discovery-controls-panel">
        <div className="section-title-row"><h2>Discovery Lab</h2><span className="badge discovery-beta-badge">NEW · BETA</span></div>
        <p className="muted-line">This beta uses our past history to uncover new shows and episodes the club may like.</p>
        <p className="discovery-beta-note">
          <strong>Member picks stay first.</strong> These discoveries are not on the active ballot. A discovery becomes a club candidate only after a member submits it.
        </p>
        <div className="discovery-learning-note" aria-label="How to use Discovery BETA">
          <span>1</span><p><strong>Choose a listening goal.</strong> The four choices reorder discoveries for the kind of episode you want now.</p>
          <span>2</span><p><strong>Review after listening.</strong> Separate the subject, guest, host, and discussion value—even if you stopped early.</p>
          <span>3</span><p><strong>Shared learning waits.</strong> Your scoring remains personal until three members independently review the same episode. The ballot stays untouched.</p>
        </div>
        {loadingReport ? <p className="muted-line">Finding strong episode candidates...</p> : null}
        {error ? <p className="warning-banner">{error}</p> : null}

        {report ? (
          <>
            <div className="discovery-control-heading">
              <strong>Discovery focus</strong>
              <span>Optional — choose one to reorder the suggestions</span>
            </div>
            <div className="discovery-mood-grid" role="group" aria-label="Optional discovery focus">
              {MOODS.map((option, index) => (
                <button
                  type="button"
                  key={option.id}
                  className={mood === option.id ? 'selected' : ''}
                  aria-pressed={mood === option.id}
                  onClick={() => { setMood((current) => current === option.id ? null : option.id); setSelectedId(''); }}
                >
                  <span className="discovery-mode-number" aria-hidden="true">0{index + 1}</span>
                  <span className="discovery-mode-copy"><strong>{option.label}</strong><small>{option.detail}</small></span>
                  <span className="discovery-selected-mark" aria-hidden="true">✓</span>
                </button>
              ))}
            </div>
            <div className="discovery-time-row" role="group" aria-label="Filter by listening time">
              <div className="discovery-control-heading">
                <strong>Listening time</strong>
                <span>Any length is on until you choose a range</span>
              </div>
              {TIMES.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={timeBudget === option.id ? 'selected' : ''}
                  aria-pressed={timeBudget === option.id}
                  onClick={() => { setTimeBudget(option.id); setSelectedId(''); }}
                >{option.label}</button>
              ))}
            </div>
            <div className="discovery-filter-status" aria-live="polite">
              <strong>{ranked.length} matching suggestion{ranked.length === 1 ? '' : 's'}.</strong>{' '}
              {selectedMood ? `${selectedMood.label} changes the order; ` : 'No discovery focus selected; '}{selectedTime.label.toLowerCase()} filters the list.
              <span className="discovery-learning-summary">
                {visibleThemeSignals.length
                  ? <>Your learning so far: {visibleThemeSignals.map((signal) => `${signal.label} ${signal.score > 0 ? '↑' : '↓'}`).join(' · ')}</>
                  : <>No personal signals yet. Review an episode after listening and this line will show what your beta is learning.</>}
              </span>
            </div>
          </>
        ) : null}
      </div>

      {topSuggestion ? (
        <article ref={topCardRef} id="top-beta-discovery" className="section-panel discovery-top-card" aria-live="polite" tabIndex={-1}>
          <div className="discovery-topline"><span className="section-kicker">NEW! Discovery BETA</span><span className="badge">{topSuggestion.confidence} match</span></div>
          <MediaArtwork url={topSuggestion.href} title={topSuggestion.title} kind="podcast" className="discovery-top-art" fallback="🎧" eager />
          <div className="discovery-top-copy">
            <h2>{topSuggestion.title}</h2>
            <p>{topSuggestion.subtitle}</p>
            <div className="podcast-meta-row">
              {topSuggestion.themes.map((theme) => <span className="badge" key={`${topSuggestion.id}-${theme}`}>{theme}</span>)}
              {getDuration(topSuggestion) ? <span className="badge">{getDuration(topSuggestion)} min</span> : null}
            </div>
          </div>
          <div className="discovery-top-actions">
            {topSuggestion.href ? (
              <PodcastListenChooser
                className="action-link"
                title={topSuggestion.subtitle || topSuggestion.title}
                episodeNames={topSuggestion.title}
                link={topSuggestion.href}
              >
                Choose where to listen
              </PodcastListenChooser>
            ) : null}
            {ranked.length > 1 ? <button type="button" className="ghost" onClick={() => showRecommendation(shortlist[0]?.id || '')}>Try another</button> : null}
          </div>
          <div className="discovery-why">
            <h3>Why this discovery stands out</h3>
            <p>It is the strongest current beta match for {selectedMood ? selectedMood.label.toLowerCase() : 'the club overall'} and {selectedTime.label.toLowerCase()}, based on the club signals above.</p>
            <ul>{topSuggestion.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul>
          </div>
          <DiscoveryReview
            item={topSuggestion}
            record={history[topSuggestion.id]}
            reviewCount={reviewCounts[topSuggestion.id] || 0}
            onUpdated={(payload) => {
              setSelectedId(topSuggestion.id);
              setHistory(payload.history);
              setReviewCounts(payload.reviewCounts);
            }}
          />
        </article>
      ) : report && !loadingReport ? (
        <div className="section-panel empty-state"><h3>No matches for this listening time</h3><p>Try Any length or another discussion style.</p><button type="button" className="ghost" onClick={() => setTimeBudget('any')}>Show every length</button></div>
      ) : null}

      {shortlist.length > 0 ? (
        <section className="section-panel discovery-shortlist-section">
          <div className="section-title-row"><h2>More Beta Discoveries</h2><span className="badge">{shortlist.length}</span></div>
          <div className="discovery-shortlist-grid">
            {shortlist.map((item) => <RecommendationCard key={item.id} item={item} onSelect={() => showRecommendation(item.id)} />)}
          </div>
        </section>
      ) : null}

      <details className="section-panel discovery-engine-note">
        <summary>Exactly what Discovery BETA learns</summary>
        <div className="discovery-engine-copy">
          <p><strong>Starts outside the ballot.</strong> It excludes podcasts already submitted by members, then looks for new possibilities using club ratings, selected episodes, meeting history, fist bumps, and meeting feedback.</p>
          <p><strong>Separates the signals.</strong> Subject and guest scores can shape related themes; host quality applies only to that show. “Find this guest elsewhere” keeps the guest without rewarding the original host.</p>
          <p><strong>Learns personally first.</strong> Reviews stay with each member&apos;s account. An episode needs three independent reviews before it is even eligible for future shared Society learning.</p>
          <p><strong>Remains reversible and private.</strong> A member can update or remove his review. Counts may be shared, but individual scores and notes are not.</p>
          <p><strong>Never votes for you.</strong> Discovery reviews cannot add, rank, or vote on the Active Ballot. A member must submit an episode before the club can vote on it.</p>
        </div>
      </details>
      {!embedded ? <Link className="action-link full-width-action" href="/podcasts?tab=rank">Go to the active podcast ballot</Link> : null}
    </Wrapper>
  );
}
