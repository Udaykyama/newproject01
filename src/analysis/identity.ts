/**
 * The identity of a test, as a single string.
 *
 * Detection and cost attribution must agree exactly on what counts as "the
 * same test" — if the two ever diverged, flake-induced waste would be
 * attributed against keys that never match and silently report zero. Keeping
 * one definition here makes that divergence impossible.
 */

/** A NUL byte cannot appear in a suite or test name, so keys stay unambiguous. */
const IDENTITY_SEPARATOR = '\u0000';

export function testKey(suite: string, name: string): string {
  return `${suite}${IDENTITY_SEPARATOR}${name}`;
}
