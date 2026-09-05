/**
 * Text normalisation with an offset map back to the original.
 *
 * The map is the whole point. Matching in normalised space is easy; the hard
 * requirement is being able to say *where in the original document* the match
 * sits, because that is what produces the page number and the highlight. So
 * every normalised character records the index of the original character it
 * came from, and a ligature that expands to two characters maps both back to
 * the single source character.
 */

const LIGATURES: Record<string, string> = {
  "ﬀ": "ff",
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
  "ﬅ": "st",
  "ﬆ": "st",
};

const QUOTES: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "′": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "‟": '"',
  "″": '"',
};

/** Hyphens, dashes and the minus sign, all flattened to "-". */
const DASH = /[‐-―−⁃]/;

/** A hyphen (of any kind) immediately before a line break: a word split across lines. */
const HYPHEN_LINEBREAK = /^[-‐-―−][ \t]*\r?\n[ \t]*/;

export interface Normalised {
  text: string;
  /** map[i] is the index in the original string that normalised character i came from. */
  map: number[];
}

export function normalise(input: string): Normalised {
  const out: string[] = [];
  const map: number[] = [];
  let i = 0;

  const emit = (chars: string, sourceIndex: number): void => {
    for (const ch of chars) {
      out.push(ch);
      map.push(sourceIndex);
    }
  };

  while (i < input.length) {
    const ch = input[i];

    // De-hyphenate a word broken across a line, before whitespace collapsing
    // gets the chance to turn the break into a space.
    const rest = input.slice(i, i + 24);
    const hyphenBreak = HYPHEN_LINEBREAK.exec(rest);
    if (hyphenBreak) {
      i += hyphenBreak[0].length;
      continue;
    }

    if (/\s/.test(ch)) {
      let j = i;
      while (j < input.length && /\s/.test(input[j])) j += 1;
      // Never emit a leading space; a run in the middle becomes exactly one.
      if (out.length > 0) emit(" ", i);
      i = j;
      continue;
    }

    if (LIGATURES[ch]) emit(LIGATURES[ch], i);
    else if (QUOTES[ch]) emit(QUOTES[ch], i);
    else if (DASH.test(ch)) emit("-", i);
    else emit(ch.toLowerCase(), i);

    i += 1;
  }

  // Drop a trailing space so needle and haystack normalise consistently.
  if (out.length > 0 && out[out.length - 1] === " ") {
    out.pop();
    map.pop();
  }

  return { text: out.join(""), map };
}

/**
 * Levenshtein ratio in [0, 1]. Two rows rather than a full matrix, because the
 * fuzzy tier calls this across many candidate windows.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  let previous = new Array<number>(b.length + 1);
  let current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    const ca = a[i - 1];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = ca === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    [previous, current] = [current, previous];
  }

  const distance = previous[b.length];
  return Math.max(0, 1 - distance / Math.max(a.length, b.length));
}

/**
 * Dice coefficient over character bigrams. Cheap and order-insensitive, so it
 * is used to shortlist candidate windows before paying for edit distance.
 */
export function bigramDice(aBigrams: Map<string, number>, b: string): number {
  if (b.length < 2) return 0;
  let shared = 0;
  let total = 0;
  const seen = new Map<string, number>();

  for (let i = 0; i < b.length - 1; i += 1) {
    const gram = b.slice(i, i + 2);
    const used = seen.get(gram) ?? 0;
    if ((aBigrams.get(gram) ?? 0) > used) {
      shared += 1;
      seen.set(gram, used + 1);
    }
    total += 1;
  }

  let aTotal = 0;
  for (const count of aBigrams.values()) aTotal += count;
  return aTotal + total === 0 ? 0 : (2 * shared) / (aTotal + total);
}

export function bigramCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < text.length - 1; i += 1) {
    const gram = text.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}
