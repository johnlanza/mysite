'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { MediaArtwork } from '@/components/MediaArtwork';
import { withBasePath } from '@/lib/base-path';
import { fetchJson } from '@/lib/client-fetch';
import type { IntelligenceRecommendation, IntelligenceReport } from '@/lib/intelligence';
import { useSession } from '@/lib/use-session';

type DiscoveryMood = 'conversation' | 'story' | 'learn' | 'wildcard';
type TimeBudget = 'any' | 'short' | 'standard' | 'deep';
type TasteReaction = 'listen' | 'discuss' | 'less';

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
      <button type="button" className="ghost" onClick={onSelect}>View recommendation</button>
    </article>
  );
}

export default function IntelligenceClient() {
  const { loading, member } = useSession();
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [error, setError] = useState('');
  const [loadingReport, setLoadingReport] = useState(false);
  const [mood, setMood] = useState<DiscoveryMood>('conversation');
  const [timeBudget, setTimeBudget] = useState<TimeBudget>('any');
  const [selectedId, setSelectedId] = useState('');
  const [reactions, setReactions] = useState<Record<string, TasteReaction>>({});
  const [feedbackMessage, setFeedbackMessage] = useState('');

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
          const feedback = await feedbackResponse.json() as { reactions?: Record<string, TasteReaction> };
          setReactions(feedback.reactions || {});
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

  const ranked = useMemo(() => {
    if (!report) return [];
    return report.podcasts
      .filter((item) => fitsTime(item, timeBudget))
      .map((item) => {
        const reaction = reactions[item.id];
        const feedbackBonus = reaction === 'discuss' ? 12 : reaction === 'listen' ? 7 : reaction === 'less' ? -30 : 0;
        return { item, adjustedScore: item.score + moodBonus(item, mood) + feedbackBonus };
      })
      .sort((a, b) => b.adjustedScore - a.adjustedScore)
      .map(({ item }) => item);
  }, [mood, reactions, report, timeBudget]);

  const topSuggestion = ranked.find((item) => item.id === selectedId) || ranked[0];
  const shortlist = ranked.filter((item) => item.id !== topSuggestion?.id).slice(0, 6);
  const selectedMood = MOODS.find((option) => option.id === mood) || MOODS[0];
  const selectedTime = TIMES.find((option) => option.id === timeBudget) || TIMES[0];

  async function saveReaction(item: IntelligenceRecommendation, reaction: TasteReaction) {
    const nextReaction = reactions[item.id] === reaction ? undefined : reaction;
    const previous = reactions;
    const next = { ...reactions };
    if (nextReaction) next[item.id] = nextReaction;
    else delete next[item.id];
    setReactions(next);
    setFeedbackMessage('');

    const result = await fetchJson<{ reactions: Record<string, TasteReaction> }>(withBasePath('/api/discovery-feedback'), {
      method: 'PUT',
      body: { recommendationKey: item.id, title: item.title, href: item.href || '', reaction: nextReaction || null }
    });
    if (!result.ok) {
      setReactions(previous);
      setFeedbackMessage(result.message || 'Unable to save this preference.');
      return;
    }
    setReactions(result.data.reactions);
    setFeedbackMessage('Saved to your member profile.');
  }

  if (loading) {
    return <section className="more-page intelligence-page page-stack"><div className="section-panel"><h2>Podcast Suggestions</h2><p>Loading...</p></div></section>;
  }

  if (!member) {
    return (
      <section className="more-page intelligence-page page-stack">
        <div className="section-panel"><h2>Podcast Suggestions</h2><p>Please login to view recommendations.</p><Link className="action-link" href="/login">Go to Login</Link></div>
      </section>
    );
  }

  return (
    <section className="more-page intelligence-page page-stack">
      <div className="section-panel intelligence-panel discovery-controls-panel">
        <div className="section-title-row"><h2>Podcast Suggestions</h2><span className="badge">Beta</span></div>
        <p className="muted-line">Suggestions use club ratings, past discussions, carve-out fist bumps, and meeting feedback.</p>
        {loadingReport ? <p className="muted-line">Finding strong episode candidates...</p> : null}
        {error ? <p className="warning-banner">{error}</p> : null}

        {report ? (
          <>
            <div className="discovery-mood-grid" role="group" aria-label="What kind of podcast are you looking for?">
              {MOODS.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={mood === option.id ? 'selected' : ''}
                  aria-pressed={mood === option.id}
                  onClick={() => { setMood(option.id); setSelectedId(''); }}
                >
                  <strong>{option.label}</strong><small>{option.detail}</small>
                </button>
              ))}
            </div>
            <div className="discovery-time-row" role="group" aria-label="Filter by listening time">
              <strong>Listening time</strong>
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
            <p className="discovery-filter-status" aria-live="polite">
              <strong>{ranked.length} matching suggestion{ranked.length === 1 ? '' : 's'}.</strong>{' '}
              {selectedMood.label} changes the order; {selectedTime.label.toLowerCase()} filters the list.
            </p>
          </>
        ) : null}
      </div>

      {topSuggestion ? (
        <article className="section-panel discovery-top-card" aria-live="polite">
          <div className="discovery-topline"><span className="section-kicker">Top Suggestion</span><span className="badge">{topSuggestion.confidence} confidence</span></div>
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
            {topSuggestion.href ? <a className="action-link" href={topSuggestion.href} target="_blank" rel="noreferrer">Listen now</a> : null}
            {ranked.length > 1 ? <button type="button" className="ghost" onClick={() => setSelectedId(shortlist[0]?.id || '')}>Try another</button> : null}
          </div>
          <div className="discovery-why">
            <h3>Why this is the top suggestion</h3>
            <p>It is the strongest current match for {selectedMood.label.toLowerCase()} and {selectedTime.label.toLowerCase()}, based on the club signals above.</p>
            <ul>{topSuggestion.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul>
          </div>
          <div className="discovery-feedback">
            <span><strong>Tune your suggestions</strong><small>These choices update this list and stay with your member account. They are separate from podcast voting.</small></span>
            <div>
              {([['listen', 'More like this'], ['discuss', 'Strong discussion'], ['less', 'Less like this']] as Array<[TasteReaction, string]>).map(([reaction, label]) => (
                <button
                  type="button"
                  key={reaction}
                  className={reactions[topSuggestion.id] === reaction ? 'selected' : ''}
                  aria-pressed={reactions[topSuggestion.id] === reaction}
                  onClick={() => saveReaction(topSuggestion, reaction)}
                >{label}</button>
              ))}
            </div>
            {feedbackMessage ? <small role="status">{feedbackMessage}</small> : null}
          </div>
        </article>
      ) : report && !loadingReport ? (
        <div className="section-panel empty-state"><h3>No matches for this listening time</h3><p>Try Any length or another discussion style.</p><button type="button" className="ghost" onClick={() => setTimeBudget('any')}>Show every length</button></div>
      ) : null}

      {shortlist.length > 0 ? (
        <section className="section-panel discovery-shortlist-section">
          <div className="section-title-row"><h2>More Suggestions</h2><span className="badge">{shortlist.length}</span></div>
          <div className="discovery-shortlist-grid">
            {shortlist.map((item) => <RecommendationCard key={item.id} item={item} onSelect={() => setSelectedId(item.id)} />)}
          </div>
        </section>
      ) : null}

      <details className="section-panel discovery-engine-note">
        <summary>How suggestions work</summary>
        <p>The engine uses ratings, selected podcasts, meeting history, fist bumps, and meeting feedback. It balances familiar interests with less obvious choices; listening styles never rank members.</p>
      </details>
      <Link className="action-link full-width-action" href="/podcasts?tab=rank">Go to the active podcast ballot</Link>
    </section>
  );
}
