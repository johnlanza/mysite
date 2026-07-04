'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { withBasePath } from '@/lib/base-path';
import type { IntelligenceRecommendation, IntelligenceReport } from '@/lib/intelligence';
import { useSession } from '@/lib/use-session';

function RecommendationCard({ item }: { item: IntelligenceRecommendation }) {
  return (
    <article className="intelligence-card">
      <div className="intelligence-card-head">
        <div>
          <h3>{item.href ? <a href={item.href} target="_blank" rel="noreferrer">{item.title}</a> : item.title}</h3>
          <p>{item.subtitle}</p>
        </div>
        <span className="badge">{item.confidence}</span>
      </div>

      <div className="podcast-meta-row">
        {item.badges.map((badge) => (
          <span className="badge" key={`${item.id}-${badge}`}>
            {badge}
          </span>
        ))}
      </div>

      <ul className="intelligence-reasons">
        {item.reasons.length > 0 ? (
          item.reasons.map((reason) => <li key={`${item.id}-${reason}`}>{reason}</li>)
        ) : (
          <li>Recommended from the current club profile.</li>
        )}
      </ul>

      {item.credibility ? (
        <section className="intelligence-note">
          <span>Credibility screen</span>
          <p>{item.credibility.reasons.join(' ')}</p>
        </section>
      ) : null}

      {item.vetting ? (
        <section className="intelligence-note">
          <span>Vetting screen</span>
          <p>{item.vetting.reasons.join(' ')}</p>
        </section>
      ) : null}

      {item.notesPreview ? (
        <section className="intelligence-note">
          <span>Notes signal</span>
          <p>{item.notesPreview}</p>
        </section>
      ) : null}
    </article>
  );
}

export default function IntelligenceClient() {
  const { loading, member } = useSession();
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [error, setError] = useState('');
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    if (!member) return;

    const controller = new AbortController();
    setLoadingReport(true);
    setError('');

    fetch(withBasePath('/api/intelligence'), { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.message || `Request failed with status ${response.status}.`);
        }
        setReport(payload as IntelligenceReport);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setError(error instanceof Error ? error.message : 'Unable to load club intelligence.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingReport(false);
        }
      });

    return () => controller.abort();
  }, [member]);

  if (loading) {
    return (
      <section className="more-page intelligence-page page-stack">
        <div className="section-panel">
          <h2>Club Intelligence</h2>
          <p>Loading...</p>
        </div>
      </section>
    );
  }

  if (!member) {
    return (
      <section className="more-page intelligence-page page-stack">
        <div className="section-panel">
          <h2>Club Intelligence</h2>
          <p>Please login to view recommendations.</p>
          <Link className="action-link" href="/login">
            Go to Login
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="more-page intelligence-page page-stack">
      <div className="section-panel intelligence-panel">
        <div className="section-title-row">
          <h2>Club Intelligence</h2>
          <span className="badge">Beta</span>
        </div>

        {loadingReport ? <p className="muted-line">Finding longer, vetted episode candidates from the club archive...</p> : null}
        {error ? <p className="warning-banner">{error}</p> : null}

        {report ? (
          <>
            <div className="intelligence-source-grid">
              <div>
                <span>Podcasts reviewed</span>
                <strong>{report.stats.podcastsReviewed}</strong>
              </div>
              <div>
                <span>Discussed weight</span>
                <strong>{report.stats.discussedPodcastsWeighted}</strong>
              </div>
              <div>
                <span>Pending score weight</span>
                <strong>{report.stats.pendingPodcastsWeighted}</strong>
              </div>
              <div>
                <span>Fist-bumped carve outs</span>
                <strong>{report.stats.fistBumpedCarveOutsWeighted}</strong>
              </div>
            </div>

            <section className="intelligence-profile-card">
              <div>
                <span className="section-kicker">Current signal</span>
                <h3>What the club seems to like</h3>
              </div>
              <div className="podcast-meta-row">
                {(report.profile.topThemes.length > 0 ? report.profile.topThemes : ['No dominant theme yet']).map((theme) => (
                  <span className="badge" key={theme}>
                    {theme}
                  </span>
                ))}
              </div>
              {report.profile.topTerms.length > 0 ? <p>{report.profile.topTerms.join(', ')}</p> : null}
              {report.profile.discoveryQueries.length > 0 ? (
                <p className="intelligence-source-note">Discovery queries: {report.profile.discoveryQueries.join(' | ')}</p>
              ) : null}
            </section>

            <section className="intelligence-section">
              <div className="section-title-row">
                <h3>New Episode Discoveries</h3>
                <span className="badge">{report.podcasts.length}</span>
              </div>
              <p className="muted-line">{report.sourceStatus.podcasts}</p>
              <div className="intelligence-card-list">
                {report.podcasts.length === 0 ? (
                  <div className="empty-state">
                    <h3>No new episode discoveries yet</h3>
                    <p>Add discussed podcasts and meeting notes, or try again when Apple Podcasts Search is available.</p>
                  </div>
                ) : (
                  report.podcasts.map((item) => <RecommendationCard item={item} key={item.id} />)
                )}
              </div>
            </section>

            <section className="intelligence-section">
              <div className="section-title-row">
                <h3>Carve Out Discovery Seeds</h3>
                <span className="badge">{report.carveOuts.length}</span>
              </div>
              <p className="muted-line">{report.sourceStatus.carveOuts}</p>
              <div className="intelligence-card-list">
                {report.carveOuts.length === 0 ? (
                  <div className="empty-state">
                    <h3>No fist-bumped carve out seeds yet</h3>
                    <p>Fist bump carve outs that should influence future article, book, video, or movie discovery.</p>
                  </div>
                ) : (
                  report.carveOuts.map((item) => <RecommendationCard item={item} key={item.id} />)
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </section>
  );
}
