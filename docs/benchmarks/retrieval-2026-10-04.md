# Exact retrieval benchmark — 2026-10-04

## Environment

- Linux 6.8.0 x86-64
- Intel Core i5-1035G1, 8 logical CPUs
- 24.96 GB RAM
- `@tursodatabase/database` 0.7.1
- 384-dimensional `float32` vectors matching the production local embedding dimensions

## Method

`pnpm benchmark:retrieval` builds a temporary local Turso database containing deterministic synthetic
chunks, performs one warm-up query, then measures five exact cosine-distance queries returning 20
rows. The benchmark contains no user content and removes its temporary database afterward.

| Chunks  | Median retrieval | P95 retrieval | Database size | Process RSS | Incremental insertion |
| ------- | ---------------- | ------------- | ------------- | ----------- | --------------------- |
| 10,000  | 26.57 ms         | 27.40 ms      | 20.74 MB      | 108.13 MB   | 897.94 ms             |
| 50,000  | 146.01 ms        | 147.50 ms     | 103.73 MB     | 195.69 MB   | 3,758.34 ms           |
| 100,000 | 299.71 ms        | 307.90 ms     | 207.49 MB     | 292.05 MB   | 10,354.16 ms          |

## Decision

Exact retrieval remains acceptable for the initial local release at up to 100,000 chunks: measured
median latency remains below 300 ms on the recorded mid-range laptop. Latency and storage grow roughly
linearly, so approximate indexing is not justified yet. Revisit this decision if representative user
data exceeds 100,000 chunks or the end-to-end interaction budget is missed on supported lower-end
hardware.

These figures are a local baseline, not a cross-platform performance guarantee.
