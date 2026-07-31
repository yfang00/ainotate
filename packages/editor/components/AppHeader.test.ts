import { describe, expect, test } from 'bun:test';
import { getAnnotateHeaderActions } from './AppHeader';

describe('getAnnotateHeaderActions', () => {
  test('offers Close and Approve for a clean review', () => {
    expect(getAnnotateHeaderActions(false)).toEqual({
      secondary: 'Close',
      primary: 'Approve',
    });
  });

  test('offers Reset and Submit when feedback exists', () => {
    expect(getAnnotateHeaderActions(true)).toEqual({
      secondary: 'Reset',
      primary: 'Submit',
    });
  });
});
