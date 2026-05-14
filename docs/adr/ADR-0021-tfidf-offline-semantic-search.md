# ADR-0021: TF-IDF Embeddings for Offline Semantic Search

## Status

Accepted

## Context

The memory graph and knowledge graph modules need semantic similarity search — finding ideas, concepts, and sessions that are _meaningfully related_ rather than just keyword-matching. Options:

1. **External embedding API** (OpenAI, Cohere, Voyage) — High-quality dense embeddings but requires API calls, adds latency, costs per query, and creates an external dependency.
2. **Local embedding model** (via ONNX Runtime, Transformers.js) — High quality, offline, but adds ~200MB+ model downloads and native dependencies.
3. **TF-IDF vector space model** — Classical information retrieval approach. No external dependencies, deterministic, zero cost per query, but lower semantic quality than dense embeddings.

## Decision

We implement a **TF-IDF (Term Frequency–Inverse Document Frequency) vector space model** in `packages/core/src/embeddings/`. Documents are tokenized, weighted by TF-IDF, and compared via cosine similarity. The module provides:

- `indexDocument()` — Add a document to the corpus
- `semanticSearch()` — Find similar documents by cosine similarity
- `clusterDocuments()` — Group documents by similarity threshold
- `discoverConnections()` — Find cross-document concept bridges

The memory graph (`packages/core/src/memory-graph/`) uses these functions to index investigation summaries, idea descriptions, and synthesis outputs for cross-session retrieval.

## Consequences

**Positive:**

- **Zero dependencies** — Pure TypeScript, no native modules, no API keys, no network calls.
- **Deterministic** — Same input always produces the same similarity score. Testable and reproducible.
- **Offline-capable** — Works without internet, supporting air-gapped and privacy-sensitive environments.
- **Instant** — Cosine similarity computation is sub-millisecond even for thousands of documents.

**Negative:**

- **Semantic gap** — TF-IDF operates on lexical overlap, not semantic understanding. "Automobile" and "car" score low similarity despite being synonyms. Dense embeddings would capture this.
- **No contextual understanding** — Word order and grammar are lost in bag-of-words representation.
- **Vocabulary sensitivity** — Domain-specific jargon or novel terminology may not be handled well.
- **Upgrade path** — The `embeddings/` module's interface is designed to be swappable. A future ADR may replace TF-IDF with a local dense embedding model when the dependency cost is justified.
