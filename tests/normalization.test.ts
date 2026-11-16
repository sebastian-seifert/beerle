import { describe, expect, it } from 'vitest';
import {
  isValidGermanTileChar,
  normalizeBeerString,
  normalizeInputKey,
  splitGraphemes,
} from '../src/shared/normalization';

describe('German beer string normalization', () => {
  it('uppercases standard words and preserves Ä, Ö, Ü as single tiles', () => {
    expect(normalizeBeerString('Kölsch')).toBe('KÖLSCH');
    expect(normalizeBeerString('Märzen')).toBe('MÄRZEN');
    expect(normalizeBeerString('Lübzer')).toBe('LÜBZER');
    expect(normalizeBeerString('Löwenbräu')).toBe('LÖWENBRÄU');
  });

  it('converts ß and ẞ to SS', () => {
    expect(normalizeBeerString('Weißbier')).toBe('WEISSBIER');
    expect(normalizeBeerString('Reißdorf')).toBe('REISSDORF');
    expect(normalizeBeerString('WEIẞBIER')).toBe('WEISSBIER');
  });

  it('strips apostrophes, hyphens, spaces, and dots', () => {
    expect(normalizeBeerString("Beck's")).toBe('BECKS');
    expect(normalizeBeerString('Beck’s')).toBe('BECKS');
    expect(normalizeBeerString('Augustiner-Bräu')).toBe('AUGUSTINERBRÄU');
    expect(normalizeBeerString('St. Georgen')).toBe('STGEORGEN');
  });

  it('normalizes foreign accented loan characters while keeping Ä, Ö, Ü', () => {
    expect(normalizeBeerString('Cuvée')).toBe('CUVEE');
    expect(normalizeBeerString('Café-Bräu')).toBe('CAFEBRÄU');
    expect(normalizeBeerString('Crème')).toBe('CREME');
  });

  it('strips Private Use Area and non-letter characters safely', () => {
    expect(normalizeBeerString('A\uE001B\uE002C\uE003')).toBe('ABC');
  });

  it('validates allowed tile characters', () => {
    expect(isValidGermanTileChar('A')).toBe(true);
    expect(isValidGermanTileChar('Ä')).toBe(true);
    expect(isValidGermanTileChar('Ö')).toBe(true);
    expect(isValidGermanTileChar('Ü')).toBe(true);
    expect(isValidGermanTileChar('ß')).toBe(false);
    expect(isValidGermanTileChar('1')).toBe(false);
    expect(isValidGermanTileChar('-')).toBe(false);
  });

  it('normalizes physical keyboard inputs including ß -> SS', () => {
    expect(normalizeInputKey('a')).toBe('A');
    expect(normalizeInputKey('ä')).toBe('Ä');
    expect(normalizeInputKey('ö')).toBe('Ö');
    expect(normalizeInputKey('ü')).toBe('Ü');
    expect(normalizeInputKey('ß')).toBe('SS');
    expect(normalizeInputKey('é')).toBe('E');
    expect(normalizeInputKey('1')).toBeNull();
    expect(normalizeInputKey('Enter')).toBeNull();
  });

  it('splits normalized strings into grapheme arrays cleanly', () => {
    expect(splitGraphemes('KÖLSCH')).toEqual(['K', 'Ö', 'L', 'S', 'C', 'H']);
  });
});
