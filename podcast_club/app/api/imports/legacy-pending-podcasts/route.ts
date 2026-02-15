import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { normalizeHeader, parseCsv, parsePositiveInt } from '@/lib/csv-import';
import { getRatingPoints } from '@/lib/ranking';
import MemberModel from '@/models/Member';
import PodcastModel from '@/models/Podcast';

type MappingValue = string | number | null | undefined;
type FieldMapping = Record<string, MappingValue>;

type LegacyPendingPodcastsPayload = {
  csv: string;
  mapping?: FieldMapping;
  options?: {
    batchId?: string;
    dryRun?: boolean;
  };
};

const IMPORT_SOURCE = 'legacy-pending-podcasts-csv';

function sanitizeBatchId(value?: string) {
  const raw = String(value || '').trim();
  if (!raw) return `legacy-pending-${Date.now()}`;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
}

function getColumnIndex(headers: string[], mapping: FieldMapping, key: string, fallback: number) {
  const mapValue = mapping[key];
  if (typeof mapValue === 'number' && mapValue >= 0 && mapValue < headers.length) {
    return mapValue;
  }

  const mappedHeader = normalizeHeader(String(mapValue || ''));
  if (mappedHeader) {
    const index = headers.findIndex((header) => header === mappedHeader);
    if (index >= 0) return index;
  }

  return fallback;
}

function firstNameKey(name: string) {
  return String(name || '')
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase();
}

function normalizeRating(value: string) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'No selection';
  if (normalized === 'my podcast') return 'My podcast';
  if (normalized === 'meh') return 'Meh';
  if (normalized === 'i like it.') return 'I like it.';
  if (normalized === 'i like it a lot.') return 'I like it a lot.';
  if (normalized === 'no selection' || normalized === 'no selection.') return 'No selection';
  return null;
}

function parseDurationMinutes(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return 1;

  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return Math.max(1, Math.round(asNumber));
  }

  const hoursMatch = raw.toLowerCase().match(/(\d+(?:\.\d+)?)\s*h/);
  if (hoursMatch) {
    const hours = Number(hoursMatch[1]);
    if (Number.isFinite(hours) && hours > 0) {
      return Math.max(1, Math.round(hours * 60));
    }
  }

  const minutesMatch = raw.toLowerCase().match(/(\d+(?:\.\d+)?)\s*m/);
  if (minutesMatch) {
    const minutes = Number(minutesMatch[1]);
    if (Number.isFinite(minutes) && minutes > 0) {
      return Math.max(1, Math.round(minutes));
    }
  }

  return 1;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  await connectToDatabase();

  const batches = await PodcastModel.distinct('importBatchId', {
    importSource: IMPORT_SOURCE,
    importBatchId: { $ne: null }
  });

  const normalized = batches.filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)));
  return NextResponse.json({ batches: normalized });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  try {
    const payload = (await req.json()) as LegacyPendingPodcastsPayload;
    const csv = String(payload.csv || '');
    const mapping = payload.mapping || {};
    const dryRun = Boolean(payload.options?.dryRun);
    const batchId = sanitizeBatchId(payload.options?.batchId);

    if (!csv.trim()) {
      return NextResponse.json({ message: 'csv is required.' }, { status: 400 });
    }

    const rows = parseCsv(csv);
    if (rows.length < 4) {
      return NextResponse.json(
        { message: 'CSV must include instruction row, header row, placeholder row, and data rows.' },
        { status: 400 }
      );
    }

    const headerRow = rows[1];
    const headers = headerRow.map((header) => normalizeHeader(header));
    const dataRows = rows.slice(3);

    const titleIndex = getColumnIndex(headers, mapping, 'podcastTitle', 0);
    const hostIndex = getColumnIndex(headers, mapping, 'podcastHost', 1);
    const episodeCountIndex = getColumnIndex(headers, mapping, 'podcastEpisodeCount', 2);
    const episodeNamesIndex = getColumnIndex(headers, mapping, 'podcastEpisodeNames', 3);
    const totalTimeIndex = getColumnIndex(headers, mapping, 'podcastTotalTimeMinutes', 4);
    const linkIndex = getColumnIndex(headers, mapping, 'podcastLink', 5);
    const notesIndex = getColumnIndex(headers, mapping, 'podcastNotes', 6);

    await connectToDatabase();

    const members = await MemberModel.find().select('_id name').lean();
    const membersByFirstName = new Map<string, (typeof members)[number]>();
    for (const member of members) {
      const key = firstNameKey(member.name);
      if (!key || membersByFirstName.has(key)) continue;
      membersByFirstName.set(key, member);
    }

    const memberRatingColumns = headers
      .map((header, index) => ({ header, index }))
      .filter((column) => {
        if (!column.header) return false;
        if (column.index <= notesIndex) return false;
        if (column.header === 'missing' || column.header === '_sortkey') return false;
        return membersByFirstName.has(column.header);
      })
      .map((column) => ({ ...column, member: membersByFirstName.get(column.header)! }));

    const warnings: string[] = [];

    let parsedRows = 0;
    let importedPodcasts = 0;

    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
      const row = dataRows[rowIndex];
      const rowNumber = rowIndex + 4;
      const titleRaw = String(row[titleIndex] || '').trim();

      if (!titleRaw) continue;
      if (titleRaw.toLowerCase().startsWith('enter podcast here')) continue;

      parsedRows += 1;

      const host = String(row[hostIndex] || '').trim() || 'Unknown';
      const episodeNames = String(row[episodeNamesIndex] || '').trim() || 'Unknown';
      const link = String(row[linkIndex] || '').trim() || '#';
      const notes = String(row[notesIndex] || '').trim();
      const episodeCount = parsePositiveInt(String(row[episodeCountIndex] || ''), 1);
      const totalTimeMinutes = parseDurationMinutes(String(row[totalTimeIndex] || ''));

      const ratings: { member: string; value: string; points: number }[] = [];
      const owners: string[] = [];

      for (const column of memberRatingColumns) {
        const rawRating = String(row[column.index] || '').trim();
        const normalized = normalizeRating(rawRating);

        if (!normalized || normalized === 'No selection') {
          if (rawRating && !normalized) {
            warnings.push(`Row ${rowNumber}, ${column.member.name}: unrecognized rating '${rawRating}', treated as No selection.`);
          }
          continue;
        }

        ratings.push({
          member: String(column.member._id),
          value: normalized,
          points: getRatingPoints(normalized)
        });

        if (normalized === 'My podcast') {
          owners.push(String(column.member._id));
        }
      }

      if (owners.length === 0) {
        warnings.push(`Row ${rowNumber}: no 'My podcast' owner found; row skipped.`);
        continue;
      }

      let submittedBy = owners[0];
      if (owners.length > 1) {
        warnings.push(`Row ${rowNumber}: multiple 'My podcast' owners found; using first match.`);
      }

      if (dryRun) {
        importedPodcasts += 1;
        continue;
      }

      await PodcastModel.create({
        title: titleRaw,
        host,
        episodeCount,
        episodeNames,
        totalTimeMinutes,
        link,
        notes,
        submittedBy,
        ratings,
        status: 'pending',
        discussedMeeting: null,
        importBatchId: batchId,
        importSource: IMPORT_SOURCE
      });

      importedPodcasts += 1;
    }

    return NextResponse.json({
      batchId,
      dryRun,
      parsedRows,
      importedPodcasts,
      ratingColumns: memberRatingColumns.map((column) => column.member.name),
      warnings
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to import pending podcasts.' },
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

    const result = await PodcastModel.deleteMany({
      importSource: IMPORT_SOURCE,
      importBatchId: batchId,
      status: 'pending'
    });

    return NextResponse.json({
      batchId,
      deletedPodcasts: result.deletedCount || 0
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to rollback imported podcasts.' },
      { status: 500 }
    );
  }
}
