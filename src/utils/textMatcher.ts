/**
 * Fuzzy String Similarity calculation mirroring Python's `thefuzz.fuzz.ratio` and `partial_ratio`
 */

export function calculateLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export function fuzzyRatio(str1: string, str2: string): number {
  const s1 = str1.trim().toLowerCase();
  const s2 = str2.trim().toLowerCase();

  if (s1 === s2) return 100;
  if (!s1 || !s2) return 0;

  const distance = calculateLevenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);

  if (maxLength === 0) return 100;
  return Math.round((1 - distance / maxLength) * 100);
}

export function fuzzyPartialRatio(str1: string, str2: string): number {
  const s1 = str1.trim().toLowerCase();
  const s2 = str2.trim().toLowerCase();

  if (s1 === s2) return 100;
  if (!s1 || !s2) return 0;

  const [shorter, longer] = s1.length <= s2.length ? [s1, s2] : [s2, s1];
  let maxRatio = 0;

  for (let i = 0; i <= longer.length - shorter.length; i++) {
    const sub = longer.substring(i, i + shorter.length);
    const ratio = fuzzyRatio(shorter, sub);
    if (ratio > maxRatio) {
      maxRatio = ratio;
    }
  }

  return maxRatio;
}

export function isTextDuplicate(
  newText: string,
  buffer: string[],
  thresholdPercent = 85
): { isDuplicate: boolean; highestSimilarity: number; matchedWith?: string } {
  const cleanNew = newText.trim().toLowerCase();
  if (!cleanNew || cleanNew.length < 3) {
    return { isDuplicate: true, highestSimilarity: 100 };
  }

  let maxSim = 0;
  let matchedStr: string | undefined;

  for (const prevText of buffer) {
    const ratio = fuzzyRatio(cleanNew, prevText);
    const partial = fuzzyPartialRatio(cleanNew, prevText);
    const score = Math.max(ratio, partial);

    if (score > maxSim) {
      maxSim = score;
      matchedStr = prevText;
    }

    if (score >= thresholdPercent) {
      return { isDuplicate: true, highestSimilarity: score, matchedWith: prevText };
    }
  }

  return { isDuplicate: false, highestSimilarity: maxSim, matchedWith: matchedStr };
}
