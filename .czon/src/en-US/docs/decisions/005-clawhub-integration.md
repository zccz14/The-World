# ADR-005: ClawHub Skills Integration

**Status**: Accepted  
**Date**: 2026-03-08  
**Decision Maker**: TheWorld Team

## Context

TheWorld requires a Skill ecosystem to allow AI to extend its capabilities. There are three options:

1.  Build a proprietary Skill ecosystem
2.  Adapt/translate OpenClaw Skills
3.  Natively integrate with ClawHub

## Decision

Choose **native integration with ClawHub**, pre-installing the `clawhub` CLI within the Region container.

## Rationale

### Ecosystem Value > Technical Differences

**Historical Lesson**: Deno's development was hindered by its incompatibility with the npm ecosystem, leading to eventual compromise.

**TheWorld's Differentiators**:

-   Multi-Agent architecture
-   Container-level isolation
-   World Memory
-   World Scheduler (planned)

These differentiators are not at the Skill level, so building a proprietary ecosystem is unnecessary.

### User Persona: One-Person Company

-   Prioritizes economics: Avoids wasting time reinventing the wheel.
-   Values quick results: Needs immediately usable Skills.
-   Focuses on value: Concentrates on business, not tooling complexities.

### Technical Feasibility

-   ClawHub provides a standard CLI tool.
-   Simple installation within the container (`npm install -g clawhub`).
-   Fully aligns with the "Zero Agentic on Host" principle.

## Implementation

-   Pre-install the `clawhub` CLI in the Region container.
-   Persist Skills in the container volume.
-   No cross-Region sharing (simplifies design).
-   Do not add a `dio skill` command (AI manages Skills itself).

## Consequences

**Positive**:

-   Immediate access to a mature Skill ecosystem.
-   Zero learning curve (uses standard `clawhub` commands).
-   Community-driven with continuous updates.

**Negative**:

-   Dependency on an external ecosystem (acceptable, similar to npm).
-   Each Region manages Skills independently (aligns with design principles).

## Alternatives

**Option A: Build Proprietary Ecosystem**

-   Pros: Full control.
-   Cons: Massive investment, starting an ecosystem from scratch.

**Option B: Adapt/Translate**

-   Pros: Allows for customization.
-   Cons: High maintenance cost, compatibility risks.

## References

-   [ClawHub](https://clawhub.ai)
-   [OpenClaw](https://github.com/openclaw/openclaw)
-   [Detailed Documentation](../clawhub-integration.md)