export interface CalendarDay {
  date: string;
  weekday: number;
  month: number;
  day: number;
}

/** Sunday-first weeks with blank cells outside the requested date range. */
export function contributionWeeks(startDate: string, endDate: string): Array<Array<CalendarDay | null>> {
  if (!startDate || !endDate) return [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const weeks: Array<Array<CalendarDay | null>> = [];
  let week: Array<CalendarDay | null> = Array(7).fill(null);
  while (cursor <= end) {
    const weekday = cursor.getUTCDay();
    if (weekday === 0 && week.some(Boolean)) {
      weeks.push(week);
      week = Array(7).fill(null);
    }
    week[weekday] = {
      date: cursor.toISOString().slice(0, 10),
      weekday,
      month: cursor.getUTCMonth(),
      day: cursor.getUTCDate(),
    };
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (week.some(Boolean)) weeks.push(week);
  return weeks;
}
