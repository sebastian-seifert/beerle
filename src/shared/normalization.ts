const ALLOWED_TILE_CHAR_REGEX = /^[A-ZÄÖÜ]$/;

/**
 * Normalizes a German beer brand, brewery name, or guess into canonical uppercase tiles.
 * - Converts `ß` and `ẞ` to `SS`
 * - Preserves `Ä`, `Ö`, `Ü` as single-tile characters
 * - Strips foreign accents (e.g. `é` -> `E`) and non-letter punctuation (spaces, hyphens, apostrophes, dots)
 */
export function normalizeBeerString(input: string): string {
  const composed = input.normalize('NFC');
  let result = '';

  for (const ch of composed) {
    if (ch === 'ß' || ch === 'ẞ') {
      result += 'SS';
    } else if (ch === 'ä' || ch === 'Ä') {
      result += 'Ä';
    } else if (ch === 'ö' || ch === 'Ö') {
      result += 'Ö';
    } else if (ch === 'ü' || ch === 'Ü') {
      result += 'Ü';
    } else {
      result += ch
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
    }
  }

  return result.replace(/[^A-ZÄÖÜ]/g, '');
}

/**
 * Returns true if the given string is a single valid Beerle tile character (`A-Z`, `Ä`, `Ö`, `Ü`).
 */
export function isValidGermanTileChar(char: string): boolean {
  return ALLOWED_TILE_CHAR_REGEX.test(char);
}

/**
 * Normalizes a physical keyboard `KeyboardEvent.key` value into tile input (`"A"`..`"Z"`, `"Ä"`, `"Ö"`, `"Ü"`, or `"SS"` for `"ß"`).
 * Returns `null` for non-character keys (e.g. `"Enter"`, `"Shift"`, `"1"`).
 */
export function normalizeInputKey(key: string): string | null {
  if (key.length !== 1) {
    return null;
  }
  const normalized = normalizeBeerString(key);
  return normalized.length > 0 ? normalized : null;
}

/**
 * Splits a normalized Beerle string into an array of single-tile characters.
 */
export function splitGraphemes(word: string): string[] {
  return Array.from(word);
}
