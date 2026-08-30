import { describe, expect, it } from 'vitest';
import { isValidBranchName, isValidRepoName, parseRepoSlug } from '../src/api/validate.js';

/**
 * Input validation at the HTTP edge. These values arrive from query strings and
 * path segments and are echoed back in reports, so they are constrained here
 * rather than escaped at each point of use.
 */

describe('isValidBranchName', () => {
  it.each(['main', 'release/2.1', 'feature/JIRA-123_fix', 'v1.0+build', 'a'.repeat(255)])(
    'accepts %s',
    (name) => {
      expect(isValidBranchName(name)).toBe(true);
    },
  );

  it.each([
    ['empty', ''],
    ['too long', 'a'.repeat(256)],
    ['a space', 'my branch'],
    ['markup', '<script>alert(1)</script>'],
    ['a leading slash', '/main'],
    ['a leading dash', '-main'],
    ['a leading dot', '.main'],
    ['a trailing slash', 'main/'],
    ['a trailing dot', 'main.'],
    ['a .lock suffix', 'main.lock'],
    ['a double dot', 'a..b'],
    ['a double slash', 'a//b'],
    ['a reflog expression', 'main@{1}'],
    ['a comma', 'my,branch'],
    ['an asterisk', 'refs/*'],
    ['a tilde', 'main~1'],
    ['a caret', 'main^'],
    ['a colon', 'main:foo'],
    ['a backslash', 'main\\foo'],
    ['a control character', 'main\u0000'],
    ['a newline', 'main\nfoo'],
  ])('rejects %s', (_label, name) => {
    expect(isValidBranchName(name)).toBe(false);
  });
});

describe('parseRepoSlug', () => {
  it('splits a well-formed slug', () => {
    expect(parseRepoSlug('acme/widgets')).toEqual({ owner: 'acme', name: 'widgets' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseRepoSlug('  acme/widgets  ')).toEqual({ owner: 'acme', name: 'widgets' });
  });

  it.each([
    ['a missing name', 'acme'],
    ['an extra segment', 'acme/widgets/extra'],
    ['an empty owner', '/widgets'],
    ['an empty name', 'acme/'],
    ['a path traversal attempt', 'acme/../etc'],
    ['a non-string', 42],
    ['an empty string', ''],
  ])('rejects %s', (_label, slug) => {
    expect(parseRepoSlug(slug)).toBeNull();
  });
});

describe('isValidRepoName', () => {
  it('accepts names GitHub itself allows', () => {
    expect(isValidRepoName('my-repo.js_2')).toBe(true);
  });

  it.each(['has space', 'slash/name', '', 'a'.repeat(101)])('rejects %s', (name) => {
    expect(isValidRepoName(name)).toBe(false);
  });
});
