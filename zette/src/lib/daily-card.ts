export const DEFAULT_DAILY_CARD_TIME_ZONE = "America/Los_Angeles";

function formatDateParts(date: Date, timeZone: string): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
}

export function getDailyCardDateKey(
  date: Date = new Date(),
  timeZone: string = DEFAULT_DAILY_CARD_TIME_ZONE,
): string {
  let parts: Intl.DateTimeFormatPart[];

  try {
    parts = formatDateParts(date, timeZone);
  } catch {
    if (timeZone === DEFAULT_DAILY_CARD_TIME_ZONE) {
      throw new Error(`Invalid daily card time zone: ${timeZone}`);
    }

    parts = formatDateParts(date, DEFAULT_DAILY_CARD_TIME_ZONE);
  }

  const values = new Map(
    parts
      .filter(
        (part) =>
          part.type === "year" || part.type === "month" || part.type === "day",
      )
      .map((part) => [part.type, part.value]),
  );
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");

  if (!year || !month || !day) {
    throw new Error("Unable to build daily card date key.");
  }

  return `${year}-${month}-${day}`;
}
