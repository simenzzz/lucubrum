/**
 * Duration parsing utilities.
 * Single source of truth for parsing duration strings like '15m', '7d', '2w'.
 */

/**
 * Parse a duration string into milliseconds.
 * Supports: s (seconds), m (minutes), h (hours), d (days), w (weeks).
 * @param duration - Duration string like '15m', '7d', '2w'
 * @param label - Optional label for error messages (e.g. env var name)
 * @throws Error if format is invalid
 */
export function parseDurationMs(duration: string, label?: string): number {
  const match = duration.match(/^(\d+)([smhdw])$/);
  if (!match) {
    const context = label ? ` (${label})` : '';
    throw new Error(
      `Invalid duration format${context}: "${duration}". Expected format: <number><unit> where unit is s, m, h, d, or w. Examples: 30s, 15m, 1h, 7d, 2w`
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    case 'w':
      return value * 7 * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
}

/**
 * Parse a duration string into seconds.
 * Supports: s (seconds), m (minutes), h (hours), d (days), w (weeks).
 * @param duration - Duration string like '15m', '7d', '2w'
 * @param label - Optional label for error messages (e.g. env var name)
 * @throws Error if format is invalid
 */
export function parseDurationSeconds(duration: string, label?: string): number {
  return parseDurationMs(duration, label) / 1000;
}
