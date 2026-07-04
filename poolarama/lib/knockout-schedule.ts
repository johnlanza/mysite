export type KnockoutScheduleEntry = {
  day: string;
  date: string;
  time: string;
};

const knockoutScheduleByMatchNumber: Record<number, KnockoutScheduleEntry> = {
  73: { day: "Sunday", date: "June 28", time: "12:00 PM PT" },
  74: { day: "Monday", date: "June 29", time: "1:30 PM PT" },
  75: { day: "Monday", date: "June 29", time: "6:00 PM PT" },
  76: { day: "Monday", date: "June 29", time: "10:00 AM PT" },
  77: { day: "Tuesday", date: "June 30", time: "2:00 PM PT" },
  78: { day: "Tuesday", date: "June 30", time: "10:00 AM PT" },
  79: { day: "Tuesday", date: "June 30", time: "6:00 PM PT" },
  80: { day: "Wednesday", date: "July 1", time: "9:00 AM PT" },
  81: { day: "Wednesday", date: "July 1", time: "5:00 PM PT" },
  82: { day: "Wednesday", date: "July 1", time: "1:00 PM PT" },
  83: { day: "Thursday", date: "July 2", time: "4:00 PM PT" },
  84: { day: "Thursday", date: "July 2", time: "12:00 PM PT" },
  85: { day: "Thursday", date: "July 2", time: "8:00 PM PT" },
  86: { day: "Friday", date: "July 3", time: "3:00 PM PT" },
  87: { day: "Friday", date: "July 3", time: "6:30 PM PT" },
  88: { day: "Friday", date: "July 3", time: "11:00 AM PT" },
  89: { day: "Saturday", date: "July 4", time: "2:00 PM PT" },
  90: { day: "Saturday", date: "July 4", time: "10:00 AM PT" },
  91: { day: "Sunday", date: "July 5", time: "1:00 PM PT" },
  92: { day: "Sunday", date: "July 5", time: "4:00 PM PT" },
  93: { day: "Monday", date: "July 6", time: "12:00 PM PT" },
  94: { day: "Monday", date: "July 6", time: "5:00 PM PT" },
  95: { day: "Tuesday", date: "July 7", time: "9:00 AM PT" },
  96: { day: "Tuesday", date: "July 7", time: "1:00 PM PT" },
  97: { day: "Thursday", date: "July 9", time: "1:00 PM PT" },
  98: { day: "Friday", date: "July 10", time: "12:00 PM PT" },
  99: { day: "Saturday", date: "July 11", time: "2:00 PM PT" },
  100: { day: "Saturday", date: "July 11", time: "6:00 PM PT" },
  101: { day: "Tuesday", date: "July 14", time: "12:00 PM PT" },
  102: { day: "Wednesday", date: "July 15", time: "12:00 PM PT" },
  103: { day: "Saturday", date: "July 18", time: "2:00 PM PT" },
  104: { day: "Sunday", date: "July 19", time: "12:00 PM PT" }
};

export function getMatchNumber(label: string) {
  const match = label.match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function getKnockoutSchedule(label: string) {
  const matchNumber = getMatchNumber(label);
  return matchNumber ? knockoutScheduleByMatchNumber[matchNumber] || null : null;
}

export function formatKnockoutSchedule(label: string) {
  const schedule = getKnockoutSchedule(label);
  return schedule ? `${schedule.day}, ${schedule.date} at ${schedule.time}` : "";
}
