import type { Podcast, PodcastRating, SessionMember } from '@/lib/types';
import type { MeetingPodcastSelection } from '@/lib/meeting-podcasts';

type PodcastCardPerson = { _id: string; name: string };

function displayMemberName(person: PodcastCardPerson, currentMember: SessionMember | null) {
  return currentMember && person._id === currentMember._id ? 'You' : person.name;
}

function annotateSelfInList(name: string, currentMember: SessionMember | null) {
  return currentMember && name.trim().toLowerCase() === currentMember.name.trim().toLowerCase() ? `${name} (you)` : name;
}

function formatMissingVoters(names: string[], currentMember: SessionMember | null) {
  return names.length > 0 ? names.map((name) => annotateSelfInList(name, currentMember)).join(', ') : 'None';
}

function getPodcastLinkHost(link: string) {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return 'Podcast link';
  }
}

function getCurrentRating(ratings: PodcastRating[] | undefined, currentMember: SessionMember | null) {
  if (!currentMember || !ratings) return 'No selection';
  return ratings.find((rating) => rating.member._id === currentMember._id)?.value || 'No selection';
}

function hasRichPodcastMeta(podcast: MeetingPodcastSelection): podcast is Podcast {
  return 'rankingScore' in podcast && 'missingVoters' in podcast && 'ratings' in podcast && 'status' in podcast;
}

export default function MeetingSelectedPodcastCard({
  podcast,
  currentMember
}: {
  podcast: MeetingPodcastSelection;
  currentMember: SessionMember | null;
}) {
  const currentRating = getCurrentRating(hasRichPodcastMeta(podcast) ? podcast.ratings : undefined, currentMember);
  const showScore = hasRichPodcastMeta(podcast) && typeof podcast.rankingScore === 'number';
  const missingVoters = hasRichPodcastMeta(podcast) ? podcast.missingVoters : [];
  const isDiscussed = hasRichPodcastMeta(podcast) ? podcast.status === 'discussed' : false;
  const hostLabel = podcast.host || 'Unknown';
  const episodeCountLabel = podcast.episodeCount ? String(podcast.episodeCount) : 'Unknown';
  const timeLabel = podcast.totalTimeMinutes ? `${podcast.totalTimeMinutes} min` : 'Unknown';
  const submittedByLabel = podcast.submittedBy ? displayMemberName(podcast.submittedBy, currentMember) : 'Unknown';

  return (
    <div className="library-podcast-row meeting-selected-podcast-card">
      <div className="library-podcast-head">
        <h3>{podcast.title}</h3>
      </div>
      <div className="podcast-meta-row">
        {showScore ? <span className="badge ranking-score">Score {podcast.rankingScore}</span> : null}
        {hasRichPodcastMeta(podcast) ? (
          <span className="badge">{missingVoters.length > 0 ? `${missingVoters.length} missing` : 'Fully rated'}</span>
        ) : null}
        {isDiscussed ? <span className="badge">Discussed</span> : null}
        {currentRating === 'My podcast' ? <span className="badge my-podcast">My Podcast</span> : null}
      </div>
      <p>
        {timeLabel}
        {` | Your rating: ${currentRating}`}
      </p>
      <details className="podcast-details">
        <summary>Details</summary>
        <div className="podcast-details-body">
          <div className="podcast-detail-stack">
            {hasRichPodcastMeta(podcast) ? (
              <section className="podcast-detail-section">
                <div className="podcast-detail-heading">
                  <strong>Rating Snapshot</strong>
                  {showScore ? <span className="badge ranking-score">Score {podcast.rankingScore}</span> : null}
                </div>
                <dl className="podcast-detail-grid">
                  <div>
                    <dt>Your rating</dt>
                    <dd>{currentRating}</dd>
                  </div>
                  <div>
                    <dt>Club status</dt>
                    <dd>{missingVoters.length > 0 ? `${missingVoters.length} missing` : 'Fully rated'}</dd>
                  </div>
                  <div>
                    <dt>Podcast status</dt>
                    <dd>{isDiscussed ? 'Discussed' : 'Selected'}</dd>
                  </div>
                  <div>
                    <dt>Submitted by</dt>
                    <dd>{submittedByLabel}</dd>
                  </div>
                </dl>
              </section>
            ) : null}

            <section className="podcast-detail-section">
              <div className="podcast-detail-heading">
                <strong>Overview</strong>
              </div>
              <dl className="podcast-detail-grid">
                <div>
                  <dt>Host</dt>
                  <dd>{hostLabel}</dd>
                </div>
                <div>
                  <dt>Episodes</dt>
                  <dd>{episodeCountLabel}</dd>
                </div>
                <div>
                  <dt>Total time</dt>
                  <dd>{timeLabel}</dd>
                </div>
                <div>
                  <dt>Submitted by</dt>
                  <dd>{submittedByLabel}</dd>
                </div>
              </dl>
            </section>

            <section className="podcast-detail-section">
              <div className="podcast-detail-heading">
                <strong>Episode</strong>
              </div>
              <p className="podcast-detail-copy">{podcast.episodeNames || 'Unknown episode'}</p>
              <p className="podcast-detail-copy">{podcast.notes || 'No description yet.'}</p>
            </section>

            <a className="podcast-link-card" href={podcast.link} target="_blank" rel="noreferrer">
              <span>
                <strong>Open podcast</strong>
                <small>{getPodcastLinkHost(podcast.link)}</small>
              </span>
              <span aria-hidden="true">&gt;</span>
            </a>

            {hasRichPodcastMeta(podcast) && missingVoters.length > 0 ? (
              <p className="warning-banner">
                <strong>Missing votes:</strong> {formatMissingVoters(missingVoters, currentMember)}
              </p>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}
