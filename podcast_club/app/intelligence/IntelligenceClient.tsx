'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MediaArtwork } from '@/components/MediaArtwork';
import { PodcastListenChooser } from '@/components/PodcastListenChooser';
import { withBasePath } from '@/lib/base-path';
import { fetchJson } from '@/lib/client-fetch';
import type { IntelligenceRecommendation, IntelligenceReport } from '@/lib/intelligence';
import { useSession } from '@/lib/use-session';

type DiscoveryMood = 'conversation' | 'story' | 'learn' | 'wildcard';
type TimeBudget = 'any' | 'short' | 'standard' | 'deep';
type TasteReaction = 'listen' | 'discuss' | 'less';
type TasteHistoryRecord = {
  reaction: TasteReaction;
  themes: string[];
  discussionSignals: number;
};

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

const REACTION_OPTIONS: Array<{ id: TasteReaction; label: string; detail: string }> = [
  { id: 'listen', label: 'More like this', detail: 'Raise this episode and give related themes a modest future boost.' },
  { id: 'discuss', label: 'Strong discussion', detail: 'Raise it most and favor similar discussion themes in later discoveries.' },
  { id: 'less', label: 'Less like this', detail: 'Lower this episode and reduce the weight of its themes later.' }
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
  const [mood, setMood] = useState<DiscoveryMood>('conversation');
  const [timeBudget, setTimeBudget] = useState<TimeBudget>('any');
  const [selectedId, setSelectedId] = useState('');
  const [reactions, setReactions] = useState<Record<string, TasteReaction>>({});
  const [history, setHistory] = useState<Record<string, TasteHistoryRecord>>({});
  const [feedbackMessage, setFeedbackMessage] = useState('');
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
            reactions?: Record<string, TasteReaction>;
            history?: Record<string, TasteHistoryRecord>;
          };
          setReactions(feedback.reactions || {});
          setHistory(feedback.history || {});
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
      const weight = record.reaction === 'discuss'
        ? 4 + Math.min(2, record.discussionSignals)
        : record.reaction === 'listen'
          ? 2
          : -3;
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
        const reaction = reactions[item.id];
        const feedbackBonus = reaction === 'discuss' ? 12 : reaction === 'listen' ? 7 : reaction === 'less' ? -30 : 0;
        const learnedThemeBonus = item.themes.reduce(
          (total, theme) => total + (themeSignals.get(theme.trim().toLowerCase())?.score || 0),
          0
        );
        return {
          item,
          adjustedScore: item.score + moodBonus(item, mood) + feedbackBonus + Math.max(-12, Math.min(12, learnedThemeBonus))
        };
      })
      .sort((a, b) => b.adjustedScore - a.adjustedScore)
      .map(({ item }) => item);
  }, [mood, reactions, report, themeSignals, timeBudget]);

  const topSuggestion = ranked.find((item) => item.id === selectedId) || ranked[0];
  const shortlist = ranked.filter((item) => item.id !== topSuggestion?.id).slice(0, 6);
  const selectedMood = MOODS.find((option) => option.id === mood) || MOODS[0];
  const selectedTime = TIMES.find((option) => option.id === timeBudget) || TIMES[0];

  function showRecommendation(id: string) {
    setSelectedId(id);
    window.requestAnimationFrame(() => {
      topCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      topCardRef.current?.focus({ preventScroll: true });
    });
  }

  async function saveReaction(item: IntelligenceRecommendation, reaction: TasteReaction) {
    const nextReaction = reactions[item.id] === reaction ? undefined : reaction;
    const previousReactions = reactions;
    const previousHistory = history;
    const previousSelectedId = selectedId;
    const nextReactions = { ...reactions };
    const nextHistory = { ...history };
    if (nextReaction) {
      nextReactions[item.id] = nextReaction;
      nextHistory[item.id] = {
        reaction: nextReaction,
        themes: item.themes,
        discussionSignals: Math.min(3, item.reasons.length)
      };
    } else {
      delete nextReactions[item.id];
      delete nextHistory[item.id];
    }
    setReactions(nextReactions);
    setHistory(nextHistory);
    setSelectedId('');
    setFeedbackMessage('');

    const result = await fetchJson<{
      reactions: Record<string, TasteReaction>;
      history: Record<string, TasteHistoryRecord>;
    }>(withBasePath('/api/discovery-feedback'), {
      method: 'PUT',
      body: {
        recommendationKey: item.id,
        title: item.title,
        href: item.href || '',
        reaction: nextReaction || null,
        themes: item.themes,
        discussionSignals: Math.min(3, item.reasons.length)
      }
    });
    if (!result.ok) {
      setReactions(previousReactions);
      setHistory(previousHistory);
      setSelectedId(previousSelectedId);
      setFeedbackMessage(result.message || 'Unable to save this preference.');
      return;
    }
    setReactions(result.data.reactions);
    setHistory(result.data.history);
    setFeedbackMessage(!nextReaction
      ? `Undone. ${item.title} no longer shapes your personal beta ranking.`
      : nextReaction === 'less'
        ? `Saved to your account. ${item.title} moves down now, and its themes receive less weight in later beta discoveries.`
        : nextReaction === 'discuss'
          ? `Saved to your account. ${item.title} receives the strongest boost, and its themes gain extra weight in later discoveries.`
          : `Saved to your account. ${item.title} moves up, and its themes receive a modest boost in later beta discoveries.`);
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
          <span>2</span><p><strong>React after reviewing one.</strong> Your choice moves that episode and teaches your personal beta which themes to favor later.</p>
          <span>3</span><p><strong>Your ballot stays untouched.</strong> Only a member submission can place an episode on the Active Ballot. Tap a selected reaction again to undo it.</p>
        </div>
        {loadingReport ? <p className="muted-line">Finding strong episode candidates...</p> : null}
        {error ? <p className="warning-banner">{error}</p> : null}

        {report ? (
          <>
            <div className="discovery-mood-grid" role="group" aria-label="What kind of podcast are you looking for?">
              {MOODS.map((option, index) => (
                <button
                  type="button"
                  key={option.id}
                  className={mood === option.id ? 'selected' : ''}
                  aria-pressed={mood === option.id}
                  onClick={() => { setMood(option.id); setSelectedId(''); }}
                >
                  <span className="discovery-mode-number" aria-hidden="true">0{index + 1}</span>
                  <span className="discovery-mode-copy"><strong>{option.label}</strong><small>{option.detail}</small></span>
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
            <div className="discovery-filter-status" aria-live="polite">
              <strong>{ranked.length} matching suggestion{ranked.length === 1 ? '' : 's'}.</strong>{' '}
              {selectedMood.label} changes the order; {selectedTime.label.toLowerCase()} filters the list.
              <span className="discovery-learning-summary">
                {visibleThemeSignals.length
                  ? <>Your learning so far: {visibleThemeSignals.map((signal) => `${signal.label} ${signal.score > 0 ? '↑' : '↓'}`).join(' · ')}</>
                  : <>No personal signals yet. React to a discovery below and this line will show what your beta is learning.</>}
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
            <p>It is the strongest current beta match for {selectedMood.label.toLowerCase()} and {selectedTime.label.toLowerCase()}, based on the club signals above.</p>
            <ul>{topSuggestion.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul>
          </div>
          <div className="discovery-feedback">
            <span><span className="new-feature-badge">NEW!</span><strong>Teach your Discovery BETA</strong><small>Choose the single best signal. It saves to your member account and follows you across devices. It never changes the Active Ballot.</small></span>
            <div className="discovery-feedback-options">
              {REACTION_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={reactions[topSuggestion.id] === option.id ? 'selected' : ''}
                  aria-pressed={reactions[topSuggestion.id] === option.id}
                  onClick={() => saveReaction(topSuggestion, option.id)}
                ><strong>{option.label}</strong><small>{option.detail}</small></button>
              ))}
            </div>
            {feedbackMessage ? <small role="status" className="discovery-feedback-message">{feedbackMessage}</small> : null}
          </div>
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
          <p><strong>Learns personally.</strong> More like this modestly favors an episode and its themes. Strong discussion gives the largest boost to that episode and similar discussion themes. Less like this lowers both.</p>
          <p><strong>Remains reversible.</strong> Tap your selected reaction again to undo it. Each member&apos;s choices stay with his own account across sign-in and devices.</p>
          <p><strong>Never votes for you.</strong> Discovery reactions cannot add, rank, or vote on the Active Ballot. A member must submit an episode before the club can vote on it.</p>
        </div>
      </details>
      {!embedded ? <Link className="action-link full-width-action" href="/podcasts?tab=rank">Go to the active podcast ballot</Link> : null}
    </Wrapper>
  );
}
