import Link from 'next/link';
import { connectToDatabase } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { buildClubIntelligenceReport, type IntelligenceRecommendation } from '@/lib/intelligence';
import { formatPodcastForClient } from '@/lib/podcasts';
import CarveOutModel from '@/models/CarveOut';
import MeetingModel from '@/models/Meeting';
import MemberModel from '@/models/Member';
import '@/models/Podcast';
import PodcastModel from '@/models/Podcast';

export const dynamic = 'force-dynamic';

type ObjectRecord = Record<string, unknown>;

function isObjectRecord(value: unknown): value is ObjectRecord {
  return Boolean(value && typeof value === 'object');
}

function getId(value: unknown) {
  if (!value) return '';
  if (isObjectRecord(value) && value._id) return String(value._id);
  return String(value);
}

function getName(value: unknown, fallback = 'Unknown') {
  if (isObjectRecord(value) && typeof value.name === 'string' && value.name.trim()) {
    return value.name;
  }
  return fallback;
}

function toIsoDate(value: unknown) {
  if (!value) return undefined;
  const date = value instanceof Date || typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
}

function getMeetingDate(value: unknown) {
  if (!isObjectRecord(value)) return undefined;
  return toIsoDate(value.date);
}

function getPodcastIdsFromMeeting(meeting: ObjectRecord) {
  const ids = new Set<string>();
  const podcasts = Array.isArray(meeting.podcasts) ? meeting.podcasts : [];
  podcasts.forEach((podcast) => {
    const id = getId(podcast);
    if (id) ids.add(id);
  });

  const podcastId = getId(meeting.podcast);
  if (podcastId) ids.add(podcastId);
  return [...ids];
}

async function getReport() {
  const session = await requireSession();
  if (!session.ok) return null;

  await connectToDatabase();

  const [members, podcasts, meetings, carveOuts] = await Promise.all([
    MemberModel.find().select('name').sort({ name: 1 }).lean(),
    PodcastModel.find()
      .populate('submittedBy', 'name')
      .populate('ratings.member', 'name')
      .populate('discussedMeeting', 'date')
      .lean(),
    MeetingModel.find().select('date notes podcast podcasts status completedAt createdAt').lean(),
    CarveOutModel.find()
      .populate('member', 'name')
      .populate('meeting', 'date')
      .populate('fistBumps.member', 'name')
      .sort({ createdAt: -1 })
      .lean()
  ]);

  const meetingNotesByPodcastId = new Map<string, string[]>();
  (meetings as ObjectRecord[]).forEach((meeting) => {
    const notes = typeof meeting.notes === 'string' ? meeting.notes.trim() : '';
    if (!notes) return;

    getPodcastIdsFromMeeting(meeting).forEach((podcastId) => {
      const current = meetingNotesByPodcastId.get(podcastId) || [];
      current.push(notes);
      meetingNotesByPodcastId.set(podcastId, current);
    });
  });

  const podcastInputs = podcasts.map((podcast) => {
    const formatted = formatPodcastForClient(podcast, members);
    return {
      ...formatted,
      meetingNotes: meetingNotesByPodcastId.get(formatted._id) || []
    };
  });

  const carveOutInputs = (carveOuts as ObjectRecord[])
    .filter((carveOut) => carveOut.member && carveOut.meeting)
    .map((carveOut) => {
      const fistBumps = Array.isArray(carveOut.fistBumps) ? carveOut.fistBumps : [];
      return {
        _id: getId(carveOut),
        title: typeof carveOut.title === 'string' ? carveOut.title : 'Untitled carve out',
        type: typeof carveOut.type === 'string' ? carveOut.type : 'other',
        service: typeof carveOut.service === 'string' ? carveOut.service : '',
        url: typeof carveOut.url === 'string' ? carveOut.url : '',
        notes: typeof carveOut.notes === 'string' ? carveOut.notes : '',
        member: { name: getName(carveOut.member, 'Club Member') },
        meeting: { date: getMeetingDate(carveOut.meeting) || '' },
        fistBumps: fistBumps.map((entry) => ({
          member: { name: getName(isObjectRecord(entry) ? entry.member : null, 'Club Member') }
        })),
        createdAt: toIsoDate(carveOut.createdAt)
      };
    });

  return buildClubIntelligenceReport({
    podcasts: podcastInputs,
    carveOuts: carveOutInputs
  });
}

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

      {item.notesPreview ? (
        <section className="intelligence-note">
          <span>Notes signal</span>
          <p>{item.notesPreview}</p>
        </section>
      ) : null}
    </article>
  );
}

export default async function IntelligencePage() {
  const report = await getReport();

  if (!report) {
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
            <h3>New Podcast Discoveries</h3>
            <span className="badge">{report.podcasts.length}</span>
          </div>
          <p className="muted-line">{report.sourceStatus.podcasts}</p>
          <div className="intelligence-card-list">
            {report.podcasts.length === 0 ? (
              <div className="empty-state">
                <h3>No new podcast discoveries yet</h3>
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
      </div>
    </section>
  );
}
