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
