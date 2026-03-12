# ADR-009: Convergence of Memory Primitives Remember / Recall with External Interfaces

## Status

Accepted

## Date

2026-03-10

## Context

The current system possesses basic World Memory capabilities, but two issues exist:

1.  Memory semantics are scattered across different code paths, lacking unified primitives.
2.  The Recall assembly logic and external interfaces are not fully converged, making it difficult to stably evaluate hit rates.

To subsequently inject memory capabilities into the OpenCode process endogenously via MCP/Tool, it is first necessary to stabilize the external interfaces and memory pipeline on the host side.

## Decision

### 1) Introduce Two Unified Primitives

-   `remember`: Asynchronously writes high-value information into the memory system.
-   `recall`: Retrieves and assembles memory briefs based on a query that can be directly injected into the context.

### 2) Recall Always Crosses Regions

Recall does not accept a region as a retrieval boundary. Retrieval is performed globally based on `aiName + query`.

### 3) Remember Asynchronous Write + RecentStore Compensation

Since EverMemOS is not immediately recallable after a write, the Remember process adopts:

1.  First write to `RecentStore` (immediately readable)
2.  Asynchronous write to EverMemOS
3.  After obtaining the `request_id`, call `/api/v1/stats/request` to query the status
4.  Delete the corresponding item in RecentStore once the status is `success` (recallable)

If `stats/request` is unavailable or misses, use search as a fallback for verification; if still unconfirmable, rely on TTL for cleanup.

### 4) Prioritize Convergence of External Interfaces

First, complete and stabilize the following interfaces:

-   `POST /api/ai/memory/remember`
-   `POST /api/ai/memory/recall`
-   `GET /api/ai/memory/health`

Subsequent MCP Tools will directly reuse the same pipeline implementation to avoid divergence from dual implementations.

### 5) Quality Metrics

The primary metric is `recall hit rate`, i.e., the proportion of items returned by recall that are ultimately used in the final answer.

## Recall Process (Unified 6 Steps)

1.  Query RecentStore (same aiName, short window)
2.  Query EverMemOS (aiName + query, group unrestricted)
3.  Fuse and deduplicate (text normalization + source weighting)
4.  Rerank and score (relevance > freshness > importance > source credibility)
5.  Assemble brief (within budget)
6.  Return to Agent (MCP) or external API (testing)

## Related Decisions

-   ADR-008: Unifying AI Speak Interface and Mandatory Memory Recall