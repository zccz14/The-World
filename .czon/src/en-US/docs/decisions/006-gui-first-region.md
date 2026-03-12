# ADR-006: Region Defaults to GUI-first Container

## Status

Accepted (In Implementation)

## Date

2026-03-09

## Context

TheWorld's long-term goal is for AI to work continuously in the real world, not just within idealized API environments.

The practical constraint is: a vast number of systems remain semi-closed or are not API-first.

- Many critical processes can only be completed via Web UI (login, CAPTCHA, human verification, complex forms)
- Many business systems do not expose complete APIs, or their API capabilities are not equivalent to their UI capabilities
- A purely headless approach creates a capability gap in these scenarios

If we default to insisting on No GUI, the system's functional completeness will be inversely limited by the closed nature of the external world. TheWorld cannot force external systems to open their APIs, so it should prioritize adapting to reality.

## Decision

The default Region image adopts a GUI-first strategy:

1.  **Each Region has remote-accessible desktop capabilities by default** (independent GUI session)
2.  **Access entry is uniformly proxied by TheWorld** (planned route: `/gui/:region/*`), not exposing raw Docker ports as the primary entry point
3.  **Default security boundary is localhost-only** (`127.0.0.1`); cross-machine access requires additional tunneling or authenticated reverse proxy
4.  **Prioritize stability and capability completeness**; resource overhead is an acceptable cost
5.  **User model prioritizes technical risk minimization**:
    - Short-term: maintain compatibility with existing `agent` execution semantics
    - GUI base native users (e.g., `abc`) are handled via a compatibility layer
    - Do not sacrifice stability for "naming consistency"

## Rationale

### 1. Capability Completeness Over Resource Saving

GUI is not an experience enhancement; it is a capability foundation. Having GUI by default covers unpredictable non-API scenarios, preventing functional boundaries from being locked by external systems.

### 2. Reality Adaptation Over Ideal Assumptions

"All systems should have APIs" is an ideal state, not the current reality. TheWorld's default runtime should strive to match the capabilities of real user systems.

### 3. Defaults Represent Stance

Default configurations define the system's true capability boundaries. Adopting GUI-first places "available capabilities" upfront, rather than remediating after failures.

### 4. Aligns with TheWorld's Goal

TheWorld emphasizes AI working "in the world." A significant portion of real-world interaction occurs in graphical interfaces and browsers. GUI-first better aligns with this positioning.

## Consequences

### Positive Impacts

✅ Covers key scenarios like anti-crawling, CAPTCHA, login sessions  
✅ Enhances visual debugging and manual takeover capabilities  
✅ Increases system robustness for unknown tasks  
✅ Reduces task failures caused by "external systems not being open"

### Negative Impacts

⚠️ Increased resource consumption per Region (CPU/Memory/VRAM)  
⚠️ More complex operational and security surface (remote desktop entry, session management)  
⚠️ Migration cost exists with current `agent` path assumptions

### Risk Mitigation

- Default binding to `127.0.0.1` only
- Unified access via TheWorld proxy entry, avoiding scattered ports
- Maintain `agent` semantic compatibility, adopt gradual migration
- Reserve headless as a fallback path (for fault recovery, not as default)

## Implementation Scope

### Architecture / Operations

- Migrate default Region image from headless base to GUI base
- Each Region maintains an independent GUI session
- TheWorld Server adds new GUI proxy routing

### Documentation / Awareness

- Clearly define GUI-first as the default strategy
- Recast headless as an exception strategy and fallback plan

## Non-Goals

- Do not pursue public internet direct GUI connectivity at this stage
- Do not pursue reverting to default headless for resource saving at this stage
- Do not mandate immediate refactoring of all user models (`agent`/`abc`) at this stage

## Relationship to Current State

The current MVP (v0.1) implementation still primarily uses headless Regions. This ADR defines the default strategy for the next phase. Implementation will proceed with compatibility-first and gradual migration.

## Related Decisions

- ADR-001: Single-User Architecture
- ADR-002: Unified Port Architecture
- ADR-003: Synchronous Command Execution
- ADR-005: ClawHub Skills Integration