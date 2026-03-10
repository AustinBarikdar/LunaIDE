/**
 * Search lines of text for a query string or regex pattern.
 * Returns matching line numbers (1-based) and trimmed text.
 */
export function searchLines(
  lines: string[],
  query: string,
  isRegex: boolean
): Array<{ line: number; text: string }> {
  const results: Array<{ line: number; text: string }> = [];
  const pattern = isRegex ? new RegExp(query, 'gm') : null;

  for (let i = 0; i < lines.length; i++) {
    if (pattern) pattern.lastIndex = 0; // Reset BEFORE test to avoid carry-over
    const match = pattern
      ? pattern.test(lines[i])
      : lines[i].includes(query);
    if (match) {
      results.push({ line: i + 1, text: lines[i].trim() });
    }
  }

  return results;
}
