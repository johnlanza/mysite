export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  function pushValue() {
    currentRow.push(currentValue.trim());
    currentValue = '';
  }

  function pushRow() {
    if (currentRow.length === 1 && currentRow[0] === '') {
      currentRow = [];
      return;
    }
    rows.push(currentRow);
    currentRow = [];
  }

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      pushValue();
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      pushValue();
      pushRow();
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    pushValue();
    pushRow();
  }

  return rows;
}

export function normalizeHeader(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function parseDateValue(value: string): Date | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const asNumber = Number(normalized);
  if (Number.isFinite(asNumber) && asNumber > 20000 && asNumber < 80000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const millis = excelEpoch + asNumber * 24 * 60 * 60 * 1000;
    const excelDate = new Date(millis);
    if (!Number.isNaN(excelDate.getTime())) {
      return excelDate;
    }
  }

  return null;
}

export function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number(String(value || '').trim());
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.max(1, Math.round(parsed));
}

export function parseDurationMinutes(value: string): number | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const numericMinutes = Number(normalized);
  if (Number.isFinite(numericMinutes) && numericMinutes > 0) {
    return Math.max(1, Math.round(numericMinutes));
  }

  const colonParts = normalized.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (colonParts) {
    const first = Number(colonParts[1]);
    const second = Number(colonParts[2]);
    const third = colonParts[3] === undefined ? null : Number(colonParts[3]);
    const totalMinutes = third === null ? first + second / 60 : first * 60 + second + third / 60;
    return Math.max(1, Math.round(totalMinutes));
  }

  const isoDuration = normalized.match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (isoDuration) {
    const totalMinutes =
      Number(isoDuration[1] || 0) * 60 + Number(isoDuration[2] || 0) + Number(isoDuration[3] || 0) / 60;
    return totalMinutes > 0 ? Math.max(1, Math.round(totalMinutes)) : null;
  }

  const hours = normalized.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i)?.[1];
  const minutes = normalized.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/i)?.[1];
  const seconds = normalized.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/i)?.[1];
  if (hours || minutes || seconds) {
    const totalMinutes = Number(hours || 0) * 60 + Number(minutes || 0) + Number(seconds || 0) / 60;
    return totalMinutes > 0 ? Math.max(1, Math.round(totalMinutes)) : null;
  }

  return null;
}
