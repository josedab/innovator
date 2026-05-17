/**
 * Generate a simple TF-IDF-inspired embedding for a text chunk.
 * Uses term frequency vectors for lightweight local similarity search
 * without requiring an external embedding API.
 */
export function generateEmbedding(text: string): number[] {
  const tokens = tokenize(text);
  const termFreq = new Map<string, number>();

  for (const token of tokens) {
    termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
  }

  // Build a fixed-size hash-based vector
  const vectorSize = 256;
  const vector = new Array<number>(vectorSize).fill(0);

  for (const [term, freq] of termFreq) {
    const hash = simpleHash(term);
    const index = Math.abs(hash) % vectorSize;
    // Use sign of secondary hash to allow positive/negative values
    const sign = simpleHash(term + "_salt") % 2 === 0 ? 1 : -1;
    vector[index] += sign * freq;
  }

  // L2 normalize
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= magnitude;
    }
  }

  return vector;
}

/**
 * Compute cosine similarity between two embedding vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denominator = Math.sqrt(magA) * Math.sqrt(magB);
  return denominator === 0 ? 0 : dot / denominator;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash;
}
