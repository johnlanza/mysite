export type CalendarEventInput = {
  id: string;
  title: string;
  startDate: string;
  startHour: number;
  endHour: number;
  timeZone: string;
  location?: string;
  description?: string;
};

export type CalendarEventLinks = {
  googleUrl: string;
  icsContent: string;
  icsFilename: string;
};

export const PODCAST_CLUB_MEETING_TIME_ZONE = 'America/Los_Angeles';
export const PODCAST_CLUB_MEETING_START_HOUR = 19;
export const PODCAST_CLUB_MEETING_END_HOUR = 22;

function toUtcDateKey(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');

  return `${year}${month}${day}`;
}

function toIsoDate(value: string) {
  const key = toUtcDateKey(value);
  if (!key) return '';

  return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
}

function addDaysToDateKey(value: string, days: number) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const nextDate = new Date(Date.UTC(year, month - 1, day + days));

  return toUtcDateKey(nextDate.toISOString());
}

function toLocalDateTimeKey(dateKey: string, hour: number) {
  return `${dateKey}T${String(hour).padStart(2, '0')}0000`;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.get('year')),
    Number(values.get('month')) - 1,
    Number(values.get('day')),
    Number(values.get('hour')),
    Number(values.get('minute')),
    Number(values.get('second'))
  );

  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(dateKey: string, hour: number, timeZone: string) {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(4, 6));
  const day = Number(dateKey.slice(6, 8));
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour));
  const firstOffset = getTimeZoneOffsetMs(utcGuess, timeZone);
  const firstUtc = new Date(utcGuess.getTime() - firstOffset);
  const secondOffset = getTimeZoneOffsetMs(firstUtc, timeZone);

  if (firstOffset === secondOffset) return firstUtc;
  return new Date(utcGuess.getTime() - secondOffset);
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function buildUtcTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function formatUtcDateTime(value: Date) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function buildIcsFile(event: CalendarEventInput, startUtc: Date, endUtc: Date) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Royal Podcast Society//Podcast Club//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(event.id)}@royal-podcast-society`,
    `DTSTAMP:${buildUtcTimestamp()}`,
    `DTSTART:${formatUtcDateTime(startUtc)}`,
    `DTEND:${formatUtcDateTime(endUtc)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : '',
    event.description ? `DESCRIPTION:${escapeIcsText(event.description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean);

  return `${lines.join('\r\n')}\r\n`;
}

export function createCalendarEventLinks(event: CalendarEventInput): CalendarEventLinks | null {
  const startDateKey = toUtcDateKey(event.startDate);
  if (!startDateKey) return null;

  const endDateKey = event.endHour > event.startHour ? startDateKey : addDaysToDateKey(startDateKey, 1);
  const isoDate = toIsoDate(event.startDate);
  const startUtc = zonedDateTimeToUtc(startDateKey, event.startHour, event.timeZone);
  const endUtc = zonedDateTimeToUtc(endDateKey, event.endHour, event.timeZone);
  const googleParams = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toLocalDateTimeKey(startDateKey, event.startHour)}/${toLocalDateTimeKey(endDateKey, event.endHour)}`,
    details: event.description || '',
    location: event.location || '',
    ctz: event.timeZone,
    sf: 'true',
    output: 'xml'
  });
  const icsFile = buildIcsFile(event, startUtc, endUtc);

  return {
    googleUrl: `https://calendar.google.com/calendar/u/0/r/eventedit?${googleParams.toString()}`,
    icsContent: icsFile,
    icsFilename: `royal-podcast-society-${isoDate || startDateKey}.ics`
  };
}
