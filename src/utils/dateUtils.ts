/**
 * Date and Time Utilities for STAGRA Environmental Telemetry System
 * Formats all timestamps and displays in Indian Standard Time (IST, UTC+05:30).
 */

export const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Format time in HH:mm:ss (IST)
 */
export const formatTimeIST = (dateInput: Date | string | number | null | undefined): string => {
  if (!dateInput) return '--:--:--';
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '--:--:--';

  return d.toLocaleTimeString('en-IN', {
    timeZone: IST_TIMEZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

/**
 * Format time in HH:mm (IST)
 */
export const formatShortTimeIST = (dateInput: Date | string | number | null | undefined): string => {
  if (!dateInput) return '--:--';
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '--:--';

  return d.toLocaleTimeString('en-IN', {
    timeZone: IST_TIMEZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Format time with explicit IST indicator, e.g. "14:32:05 IST"
 */
export const formatTimeWithIST = (dateInput: Date | string | number | null | undefined): string => {
  const formatted = formatTimeIST(dateInput);
  return formatted === '--:--:--' ? '--' : `${formatted} IST`;
};

/**
 * Format date and time in IST, e.g. "02 Sep 2026, 14:32:05 IST"
 */
export const formatDateTimeIST = (dateInput: Date | string | number | null | undefined): string => {
  if (!dateInput) return '--';
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '--';

  return (
    d.toLocaleString('en-IN', {
      timeZone: IST_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }) + ' IST'
  );
};

/**
 * Format date and time for tabular displays: "YYYY-MM-DD HH:mm:ss IST"
 */
export const formatDateTimeTableIST = (dateInput: Date | string | number | null | undefined): string => {
  if (!dateInput) return '--';
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '--';

  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const map: Record<string, string> = {};
  parts.forEach((p) => {
    map[p.type] = p.value;
  });

  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second} IST`;
};

/**
 * Format chart labels in IST based on duration
 */
export const formatChartLabelIST = (
  dateInput: Date | string | number | null | undefined,
  timeRange?: string
): string => {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';

  if (timeRange === '1h' || timeRange === '6h') {
    return d.toLocaleTimeString('en-IN', {
      timeZone: IST_TIMEZONE,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const dateStr = d.toLocaleDateString('en-IN', {
    timeZone: IST_TIMEZONE,
    month: 'short',
    day: 'numeric',
  });
  const timeStr = d.toLocaleTimeString('en-IN', {
    timeZone: IST_TIMEZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${dateStr} ${timeStr}`;
};
