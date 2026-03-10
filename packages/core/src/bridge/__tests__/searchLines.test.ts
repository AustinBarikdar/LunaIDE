import { describe, it, expect } from 'vitest';
import { searchLines } from '../searchLines.js';

describe('searchLines', () => {
  it('finds plain text matches across multiple lines', () => {
    const lines = ['hello world', 'foo bar', 'hello again'];
    const results = searchLines(lines, 'hello', false);
    expect(results).toEqual([
      { line: 1, text: 'hello world' },
      { line: 3, text: 'hello again' },
    ]);
  });

  it('finds regex matches on consecutive lines', () => {
    const lines = ['local x = 1', 'local y = 2', 'print(x)'];
    const results = searchLines(lines, 'local \\w+ = \\d+', true);
    expect(results).toEqual([
      { line: 1, text: 'local x = 1' },
      { line: 2, text: 'local y = 2' },
    ]);
  });

  it('does not miss matches due to regex lastIndex carry-over', () => {
    // This is the specific bug: with `g` flag regex, lastIndex carries over
    // between test() calls, causing matches to be missed on subsequent lines
    // when the match position is past the string length of the next line.
    const lines = [
      'aaaa match_here bbbb',  // match at index 5
      'match_here',             // match at index 0 — would be missed if lastIndex > 0
      'cc match_here dd',       // match at middle
    ];
    const results = searchLines(lines, 'match_here', true);
    expect(results).toHaveLength(3);
    expect(results[0].line).toBe(1);
    expect(results[1].line).toBe(2);
    expect(results[2].line).toBe(3);
  });

  it('returns empty array when no matches', () => {
    const lines = ['foo', 'bar', 'baz'];
    const results = searchLines(lines, 'xyz', false);
    expect(results).toEqual([]);
  });

  it('trims matched text in results', () => {
    const lines = ['  indented line  '];
    const results = searchLines(lines, 'indented', false);
    expect(results).toEqual([{ line: 1, text: 'indented line' }]);
  });
});
