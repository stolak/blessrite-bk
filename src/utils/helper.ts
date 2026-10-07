/**
 * Normalizes a date to midnight (00:00:00.000)
 * Useful for date comparisons without time component
 * @param date - Date to normalize (can be Date object, string, or number)
 * @returns Date object set to midnight
 */
export function normalizeToMidnight(date: Date | string | number): Date {
  return new Date(new Date(date).setHours(23, 59, 59, 0));
}

export function normalizeToEalerMoning(date: Date | string | number): Date {
  return new Date(new Date(date).setHours(0, 0, 0, 0));
}

/**
 * Gets the current date normalized to midnight
 * @returns Current date at 00:00:00.000
 */
export function getTodayAtMidnight(): Date {
  return normalizeToMidnight(new Date());
}
export function getNextCycle(dateStr: string): Date {
  const date = new Date(dateStr);

  const year: number = date.getUTCFullYear();
  const month: number = date.getUTCMonth(); // 0-based
  const day: number = date.getUTCDate();

  // Try same day next month (using UTC)
  const next = new Date(Date.UTC(year, month + 1, day));

  // If month overflowed → next month doesn't have this day
  if (next.getUTCMonth() !== (month + 1) % 12) {
    // Set to last day of next month
    return new Date(Date.UTC(year, month + 2, 0)); // day 0 = last day of (month+1)
  }

  return next;
}

export function getDayBeforeNextCycle(dateStr: string): Date {
  const nextCycle = getNextCycle(dateStr);

  // Subtract 1 day (in ms)
  const oneDayBefore = new Date(nextCycle.getTime() - 24 * 60 * 60 * 1000);

  return oneDayBefore;
}
