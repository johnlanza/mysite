import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { normalizeHeader, parseCsv, parseDateValue, parsePositiveInt } from '@/lib/csv-import';
import CarveOutModel from '@/models/CarveOut';
import MeetingModel from '@/models/Meeting';
import MemberModel from '@/models/Member';
import PodcastModel from '@/models/Podcast';

type MappingValue = string | number | null | undefined;
type FieldMapping = Record<string, MappingValue>;

type LegacyImportPayload = {
  csv: string;
  mapping?: FieldMapping;
  options?: {
    batchId?: string;
    dryRun?: boolean;
  };
};

const IMPORT_SOURCE = 'legacy-meetings-csv';
const DEFAULT_OLD_DATE = new Date('2000-01-01T00:00:00.000Z');

function sanitizeBatchId(value?: string) {
  const raw = String(value || '').trim();
  if (!raw) return `legacy-${Date.now()}`;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
}

function getCellByMapping(row: string[], headers: string[], mapping: FieldMapping, key: string): string {
  const mapValue = mapping[key];
  if (typeof mapValue === 'number' && mapValue >= 0 && mapValue < row.length) {
    return String(row[mapValue] || '').trim();
  }

  const mappedHeader = normalizeHeader(String(mapValue ?? key));
  if (!mappedHeader) return '';

  const index = headers.findIndex((header) => header === mappedHeader);
  if (index < 0) return '';
  return String(row[index] || '').trim();
}

function resolveDate(value: string, rowIndex: number) {
  const parsed = parseDateValue(value);
  if (parsed) return parsed;

  const fallback = new Date(DEFAULT_OLD_DATE);
  fallback.setUTCDate(fallback.getUTCDate() + rowIndex);
  return fallback;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  await connectToDatabase();

  const [meetingBatches, podcastBatches] = await Promise.all([
    MeetingModel.distinct('importBatchId', { importSource: IMPORT_SOURCE, importBatchId: { $ne: null } }),
    PodcastModel.distinct('importBatchId', { importSource: IMPORT_SOURCE, importBatchId: { $ne: null } })
  ]);

  const merged = Array.from(new Set([...meetingBatches, ...podcastBatches].filter(Boolean))).sort((a, b) =>
    String(b).localeCompare(String(a))
  );

  return NextResponse.json({ batches: merged });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  try {
    const payload = (await req.json()) as LegacyImportPayload;
    const csv = String(payload.csv || '');
    const mapping = payload.mapping || {};
    const dryRun = Boolean(payload.options?.dryRun);
    const batchId = sanitizeBatchId(payload.options?.batchId);

    if (!csv.trim()) {
      return NextResponse.json({ message: 'csv is required.' }, { status: 400 });
    }

    const rows = parseCsv(csv);
    if (rows.length < 2) {
      return NextResponse.json(
        { message: 'CSV must include a header row and at least one data row.' },
        { status: 400 }
      );
    }

    const headers = rows[0].map((header) => normalizeHeader(header));
    const dataRows = rows.slice(1);

    await connectToDatabase();

    const members = await MemberModel.find().select('_id name email address').lean();
    const adminEmail = String(admin.member.email || '').toLowerCase();
    const memberByEmail = new Map(members.map((member) => [member.email.toLowerCase(), member]));
    const memberByName = new Map(members.map((member) => [member.name.toLowerCase(), member]));

    const warnings: string[] = [];

    if (dryRun) {
      return NextResponse.json({
        batchId,
        dryRun: true,
        rows: dataRows.length,
        message: 'Dry run complete. No records were written.'
      });
    }

    let importedMeetings = 0;
    let importedPodcasts = 0;

    for (let i = 0; i < dataRows.length; i += 1) {
      const row = dataRows[i];
      const rowNumber = i + 2;
      const rowHasValues = row.some((cell) => String(cell || '').trim());
      if (!rowHasValues) {
        continue;
      }

      const meetingHostEmail = getCellByMapping(row, headers, mapping, 'meetingHostEmail').toLowerCase();
      const meetingHostName = getCellByMapping(row, headers, mapping, 'meetingHostName').toLowerCase();
      const fallbackHost = memberByEmail.get(adminEmail);
      const meetingHost =
        memberByEmail.get(meetingHostEmail) || memberByName.get(meetingHostName) || fallbackHost;

      if (!meetingHost) {
        return NextResponse.json(
          { message: 'Importer could not resolve a fallback host member.' },
          { status: 400 }
        );
      }
      if ((meetingHostEmail || meetingHostName) && fallbackHost && String(meetingHost._id) === String(fallbackHost._id)) {
        warnings.push(`Row ${rowNumber}: host not found in members; assigned to admin.`);
      }

      const submittedByEmail = getCellByMapping(row, headers, mapping, 'podcastSubmittedByEmail').toLowerCase();
      const submittedByName = getCellByMapping(row, headers, mapping, 'podcastSubmittedByName').toLowerCase();
      const submittedBy =
        memberByEmail.get(submittedByEmail) ||
        memberByName.get(submittedByName) ||
        memberByEmail.get(meetingHostEmail) ||
        memberByName.get(meetingHostName) ||
        meetingHost;

      const podcastTitle = getCellByMapping(row, headers, mapping, 'podcastTitle') || `Imported podcast ${rowNumber}`;
      const podcastHost = getCellByMapping(row, headers, mapping, 'podcastHost') || 'Unknown';
      const podcastEpisodeNames = getCellByMapping(row, headers, mapping, 'podcastEpisodeNames') || 'Unknown';
      const podcastLink = getCellByMapping(row, headers, mapping, 'podcastLink') || '#';
      const podcastNotes = getCellByMapping(row, headers, mapping, 'podcastNotes');

      const episodeCount = parsePositiveInt(getCellByMapping(row, headers, mapping, 'podcastEpisodeCount'), 1);
      const totalTimeMinutes = parsePositiveInt(getCellByMapping(row, headers, mapping, 'podcastTotalTimeMinutes'), 1);

      const meetingDateInput = getCellByMapping(row, headers, mapping, 'meetingDate');
      const meetingDate = resolveDate(meetingDateInput, i);
      const meetingLocation = getCellByMapping(row, headers, mapping, 'meetingLocation') || meetingHost.address || 'Unknown';
      const meetingNotes = getCellByMapping(row, headers, mapping, 'meetingNotes');

      if (!getCellByMapping(row, headers, mapping, 'podcastTitle')) {
        warnings.push(`Row ${rowNumber}: podcast title missing, fallback title applied.`);
      }
      if (!meetingDateInput) {
        warnings.push(`Row ${rowNumber}: meeting date missing/invalid, fallback date applied.`);
      }

      const podcast = await PodcastModel.create({
        title: podcastTitle,
        host: podcastHost,
        episodeCount,
        episodeNames: podcastEpisodeNames,
        totalTimeMinutes,
        link: podcastLink,
        notes: podcastNotes,
        submittedBy: submittedBy._id,
        ratings: [],
        status: 'discussed',
        importBatchId: batchId,
        importSource: IMPORT_SOURCE
      });

      const meeting = await MeetingModel.create({
        date: meetingDate,
        host: meetingHost._id,
        podcast: podcast._id,
        location: meetingLocation,
        notes: meetingNotes,
        status: 'completed',
        completedAt: meetingDate,
        importBatchId: batchId,
        importSource: IMPORT_SOURCE
      });

      await PodcastModel.findByIdAndUpdate(podcast._id, { discussedMeeting: meeting._id });

      importedPodcasts += 1;
      importedMeetings += 1;
    }

    return NextResponse.json({
      batchId,
      importedMeetings,
      importedPodcasts,
      warnings
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to import legacy meetings.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { batchId?: string; confirmText?: string };
    const batchId = String(body.batchId || '').trim();

    if (!batchId) {
      return NextResponse.json({ message: 'batchId is required.' }, { status: 400 });
    }

    if (String(body.confirmText || '').trim() !== 'DELETE') {
      return NextResponse.json({ message: 'Type DELETE to confirm import rollback.' }, { status: 400 });
    }

    await connectToDatabase();

    const meetings = await MeetingModel.find({ importSource: IMPORT_SOURCE, importBatchId: batchId }).select('_id').lean();
    const meetingIds = meetings.map((meeting) => meeting._id);

    const [meetingDeleteResult, podcastDeleteResult] = await Promise.all([
      MeetingModel.deleteMany({ importSource: IMPORT_SOURCE, importBatchId: batchId }),
      PodcastModel.deleteMany({ importSource: IMPORT_SOURCE, importBatchId: batchId })
    ]);

    if (meetingIds.length > 0) {
      await CarveOutModel.deleteMany({ meeting: { $in: meetingIds } });
    }

    return NextResponse.json({
      batchId,
      deletedMeetings: meetingDeleteResult.deletedCount || 0,
      deletedPodcasts: podcastDeleteResult.deletedCount || 0
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to rollback imported records.' },
      { status: 500 }
    );
  }
}
