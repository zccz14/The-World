# ADR-007: Runtime Security Baseline (Assume Breach)

## Status

Accepted

## Date

2026-03-10

## Context

TheWorld's core runtime plane is built on containers. Containers are not virtual machines and share the kernel with the host; once a business workload suffers an RCE, the risk can propagate along permission and mount boundaries.

We do not adopt the "containers are inherently secure" assumption, but rather an Assume Breach stance:

-   Assume business code may be compromised by default.
-   Focus on controlling lateral movement and host impact after a breach.
-   Security boundaries must be established upfront in architecture and default configurations, not remediated ad-hoc by operations.

## Decision

TheWorld adopts the following mandatory security baseline at runtime:

1.  **Run as non-root by default**
    -   Business container processes must use a non-root user.
    -   Do not revert to root by default for convenience (e.g., debugging, permission shortcuts).

2.  **Minimize Linux capabilities**
    -   Default to `cap-drop=ALL`.
    -   Add only the minimal necessary set on a case-by-case basis (e.g., `NET_BIND_SERVICE`).
    -   Prohibit granting high-risk capabilities (e.g., `SYS_ADMIN`) as a standard practice.

3.  **Prohibit high-risk runtime parameters**
    -   Prohibit `--privileged` as a standard mode of operation.
    -   Prohibit enabling `hostPID`, `hostNetwork`, and other strongly host-coupled modes by default.

4.  **Prohibit high-risk mounts and control plane exposure**
    -   Prohibit mounting `docker.sock` into business containers.
    -   Prohibit mounting the host root directory `/` and sensitive system paths (e.g., `/etc`, `/proc`, `/var/lib/docker`).
    -   The control plane (container orchestration, Daemon management capabilities) must not be directly exposed to the workload plane.

5.  **Recommend enabling user namespace protection**
    -   Prioritize using `userns-remap` or rootless runtime modes.
    -   The goal is to map high-privilege identities inside the container to low-privilege identities on the host, reducing the payoff of an escape.

6.  **Auditing and attribution as default capabilities**
    -   Critical operations must be auditable and attributable to an AI identity and task context.
    -   Controlled output channels (e.g., authorized writes to an outbox) are part of the security boundary.

## Rationale

### 1. Risks are real and often amplified by misconfiguration

In real-world attack and defense scenarios, "RCE + root + high-risk mounts/privileged parameters" can rapidly escalate container risk into host risk.

### 2. Defaults determine the actual security ceiling

If security boundaries are not the default, they will eventually be bypassed under efficiency pressure. Embedding security constraints into default configurations ensures consistent enforcement.

### 3. Least privilege is the most cost-effective and high-impact control measure

Compared to complex protection systems, non-root execution and minimal capabilities directly block numerous high-risk exploitation paths.

## Consequences

### Positive

✅ Significantly reduces the probability of a "container RCE directly escalating to host compromise".  
✅ Security policies are auditable, automatable for checks, and can evolve sustainably.  
✅ Provides a unified security boundary for multi-user isolation and Scheduler evolution.

### Negative

⚠️ Initial increase in permission adaptation work (directory ownership, port binding, startup scripts).  
⚠️ Some legacy scripts may fail due to non-root/cap-drop and require refactoring.  
⚠️ Reduced debugging convenience (an intentional constraint).

## Exception Mechanism

Temporary exceptions are permitted but must satisfy all of the following:

1.  Have a clear business necessity and risk explanation.
2.  Have an exception record ID and expiration time.
3.  Have an alternative plan and rollback strategy.
4.  Be traceable in audit logs.

Exceptions not documented are considered policy violations.

## Implementation Checklist

-   Images and runtime parameters default to using a non-root user.
-   Runtime parameters default to `cap-drop=ALL`.
-   CI/deployment stages block `docker.sock` mounts, `--privileged`, and mounts of sensitive host paths.
-   Security-related exceptions are documented separately and reviewed periodically.

## Related Decisions

-   ADR-001: Use a single agent user instead of multi-user isolation.
-   ADR-006: Region defaults to GUI-first containers.