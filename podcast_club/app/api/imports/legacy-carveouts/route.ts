import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import { normalizeHeader, parseCsv, parseDateValue } from '@/lib/csv-import';
import CarveOutModel from '@/models/CarveOut';
import MeetingModel from '@/models/Meeting';
import MemberModel from '@/models/Member';

type MappingValue = string | number | null | undefined;
type FieldMapping = Record<string, MappingValue>;

type LegacyCarveOutPayload = {
  csv: string;
  mapping?: FieldMapping;
  options?: {
    batchId?: string;
    dryRun?: boolean;
  };
};

const IMPORT_SOURCE = 'legacy-carveouts-csv';

function sanitizeBatchId(value?: string) {
  const raw = String(value || '').trim();
  if (!raw) return `legacy-carveouts-${Date.now()}`;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
}

function getColumnIndex(headers: string[], mapping: FieldMapping, key: string, fallbackIndex: number) {
  const mapValue = mapping[key];
  if (typeof mapValue === 'number' && mapValue >= 0 && mapValue < headers.length) {
    return mapValue;
  }

  const mappedHeader = normalizeHeader(String(mapValue || ''));
  if (mappedHeader) {
    const mappedIndex = headers.findIndex((header) => header === mappedHeader);
    if (mappedIndex >= 0) return mappedIndex;
  }

  return fallbackIndex;
}

function extractFirstUrl(input: string) {
  const match = input.match(/https?:\/\/[^\s"<>]+/i);
  if (!match) return null;
  return match[0].replace(/[),.;]+$/g, '');
}

function deriveTitleAndUrl(raw: string) {
  const cell = String(raw || '').trim();
  const url = extractFirstUrl(cell);

  if (!url) {
    return {
      title: cell.slice(0, 200) || 'Imported carve out',
      url: ''
    };
  }

  const before = cell.slice(0, cell.indexOf(url)).replace(/[\s:;,-]+$/g, '').trim();
  const after = cell.slice(cell.indexOf(url) + url.length).replace(/^[\s:;,-]+/g, '').trim();
  const fallbackTitle = before || after;

  return {
    title: fallbackTitle.slice(0, 200) || url,
    url
  };
}

function inferCarveOutType(title: string, url: string, notes: string): 'book' | 'video' | 'movie' | 'podcast' | 'article' | 'other' {
  const text = `${title} ${url} ${notes}`.toLowerCase();

  const isPodcast =
    text.includes('podcast') ||
    text.includes('podcasts.apple.com') ||
    text.includes('spotify.com/show') ||
    text.includes('overcast.fm');
  if (isPodcast) return 'podcast';

  const isBook =
    text.includes('goodreads.com') ||
    text.includes('book') ||
    text.includes('novel') ||
    text.includes('memoir') ||
    text.includes('biography');
  if (isBook) return 'book';

  const isMovie =
    text.includes('movie') ||
    text.includes('film') ||
    text.includes('documentary') ||
    text.includes('imdb.com/title');
  if (isMovie) return 'movie';

  const isVideo =
    text.includes('youtu.be') ||
    text.includes('youtube.com') ||
    text.includes('netflix.com') ||
    text.includes('netflix') ||
    text.includes('primevideo.com') ||
    text.includes('vimeo.com') ||
    text.includes('video');
  if (isVideo) return 'video';

  const isArticle =
    text.includes('substack.com') ||
    text.includes('medium.com') ||
    text.includes('nytimes.com') ||
    text.includes('article') ||
    text.includes('essay') ||
    text.includes('blog');
  if (isArticle) return 'article';

  return 'other';
}

function toDateKey(value: Date) {
  return [value.getUTCFullYear(), String(value.getUTCMonth() + 1).padStart(2, '0'), String(value.getUTCDate()).padStart(2, '0')].join('-');
}

function firstNameKey(fullName: string) {
  return String(fullName || '')
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase();
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  await connectToDatabase();

  const batches = await CarveOutModel.distinct('importBatchId', {
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
    const payload = (await req.json()) as LegacyCarveOutPayload;
    const csv = String(payload.csv || '');
    const mapping = payload.mapping || {};
    const dryRun = Boolean(payload.options?.dryRun);
    const batchId = sanitizeBatchId(payload.options?.batchId);

    if (!csv.trim()) {
      return NextResponse.json({ message: 'csv is required.' }, { status: 400 });
    }

    const rows = parseCsv(csv);
    if (rows.length < 2) {
      return NextResponse.json({ message: 'CSV must include at least a header and one data row.' }, { status: 400 });
    }

    const headers = rows[0].map((header) => normalizeHeader(header));
    const dateColumnIndex = getColumnIndex(headers, mapping, 'clubDate', 0);
    const contributorColumns = headers
      .map((header, index) => ({ header, index }))
      .filter((entry) => entry.index !== dateColumnIndex && entry.header);

    if (contributorColumns.length === 0) {
      return NextResponse.json({ message: 'No contributor columns found in CSV header.' }, { status: 400 });
    }

    await connectToDatabase();

    const [members, meetings] = await Promise.all([
      MemberModel.find().select('_id name').lean(),
      MeetingModel.find().select('_id date').lean()
    ]);

    const adminMember = members.find((member) => String(member._id) === admin.member._id);
    if (!adminMember) {
      return NextResponse.json({ message: 'Admin member not found.' }, { status: 400 });
    }

    const memberByFirstName = new Map<string, (typeof members)[number]>();
    for (const member of members) {
      const key = firstNameKey(member.name);
      if (!key || memberByFirstName.has(key)) continue;
      memberByFirstName.set(key, member);
    }

    const meetingByDate = new Map<string, (typeof meetings)[number]>();
    for (const meeting of meetings) {
      const parsed = new Date(meeting.date);
      if (Number.isNaN(parsed.getTime())) continue;
      const key = toDateKey(parsed);
      if (!meetingByDate.has(key)) {
        meetingByDate.set(key, meeting);
      }
    }

    let parsedEntries = 0;
    let importableEntries = 0;
    const warnings: string[] = [];

    const importRows = rows.slice(1);
    for (let rowIndex = 0; rowIndex < importRows.length; rowIndex += 1) {
      const row = importRows[rowIndex];
      const dateValue = String(row[dateColumnIndex] || '').trim();
      const parsedDate = parseDateValue(dateValue);
      const rowNumber = rowIndex + 2;

      if (!parsedDate) {
        if (row.some((cell) => String(cell || '').trim())) {
          warnings.push(`Row ${rowNumber}: could not parse Club Date; row skipped.`);
        }
        continue;
      }

      const meeting = meetingByDate.get(toDateKey(parsedDate));
      if (!meeting) {
        warnings.push(`Row ${rowNumber}: no meeting found for ${dateValue}; carve outs skipped for this row.`);
        continue;
      }

      for (const column of contributorColumns) {
        const rawCell = String(row[column.index] || '').trim();
        if (!rawCell) continue;

        parsedEntries += 1;

        const member = memberByFirstName.get(column.header) || adminMember;
        if (!memberByFirstName.get(column.header)) {
          warnings.push(`Row ${rowNumber}, column ${column.index + 1}: member '${column.header}' not found; assigned to admin.`);
        }

        const parsed = deriveTitleAndUrl(rawCell);
        const type = inferCarveOutType(parsed.title, parsed.url, rawCell);

        if (dryRun) {
          importableEntries += 1;
          continue;
        }

        await CarveOutModel.create({
          title: parsed.title,
          type,
          url: parsed.url,
          notes: rawCell,
          member: member._id,
          meeting: meeting._id,
          importBatchId: batchId,
          importSource: IMPORT_SOURCE
        });

        importableEntries += 1;
      }
    }

    return NextResponse.json({
      batchId,
      dryRun,
      parsedEntries,
      importedCarveOuts: importableEntries,
      warnings
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to import legacy carve outs.' },
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

    const result = await CarveOutModel.deleteMany({ importSource: IMPORT_SOURCE, importBatchId: batchId });

    return NextResponse.json({
      batchId,
      deletedCarveOuts: result.deletedCount || 0
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to rollback imported carve outs.' },
      { status: 500 }
    );
  }
}
