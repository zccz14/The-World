# TheWorld Current Architecture (MVP v0.1)

**Status**: Migrating (v0.1 → v0.2)  
**Version**: 0.1.0  
**Last Updated**: 2026-03-10

## Overview

The current implementation is a streamlined MVP version that validates the feasibility of the core concepts. Through engineering trade-offs, we have chosen a simplified architecture to accelerate development and deployment.

**v0.2 Migration Direction**: Migrating from a synchronous command execution model to an asynchronous event-driven model, and from ephemeral task execution to persistent Agent services.

## Design Intent and Value Judgments

This section documents the core value judgments behind architectural decisions, guiding future evolution and preventing deviation.

### Core Principles

1.  **Oracle is Event Delivery, Not RPC Calls**
    - Tasks are inherently broad/heavyweight and may return multiple times or involve ongoing dialogue.
    - The synchronous `req/res` semantics are inherently mismatched for long-running tasks and multi-turn interactions.
    - Agents have reply sovereignty: they autonomously decide when/if/how to reply multiple times to humans.

2.  **Observability Over Low Latency**
    - The core value of serve-first is a stable operational plane, facilitating monitoring, governance, auditing, and operations.
    - Persistent processes are easier to observe for state, rate limiting, diagnostics, and scheduling than ephemeral executions.

3.  **Reliable Delivery Over Instant Response**
    - Failure strategy: "Better slow than lost."
    - Supports interruptibility, recoverability, auditability, and accountability.
    - Messages naturally leave traces, facilitating review, compliance, and defining responsibility boundaries.

4.  **Human Control is Paramount**
    - Supports approval gates, recall/cancellation, priority queue jumping, replay/review.
    - Defaults to automated execution but retains manual intervention capability.
    - All actions must be attributable to an AI identity and task context.

5.  **Single User is an MVP Compromise, Not the End State**
    - The end state remains multi-user isolation (each AI as an independent Linux user).
    - For now, we first secure the "container vs. host isolation" safety boundary.
    - The architecture must preserve an upgrade path and cannot be locked into a single-user model.

6.  **Reply Channel is Controlled**
    - Agents cannot arbitrarily write directly to humans; they must apply for "human output" through controlled `Action` (tool/skill).
    - Writes to `/world/outbox` should go through the authorized RegionDaemon channel to prevent forgery and ensure auditability.
    - RegionDaemon actively notifies WorldServer after a successful controlled write; WorldServer then forwards it to UI/ChatApp.

7.  **Assume Breach by Default**
    - Design premise: workloads may be compromised (RCE), not assuming containers are inherently secure.
    - Security goal: "Container compromise does not equal host compromise."
    - Runtime adheres to least privilege: non-root, minimal capabilities, disabling privileges and dangerous mounts.
    - Specific baselines are constrained by ADR-007, serving as a hard boundary for future evolution.

### Value Ranking

```
Controllability, Auditability, Observability > Low Latency
Reliable Delivery, Recoverability > Instant Response
Capability Completeness > Resource Savings
```

## Actual Architecture Diagram

```
Host Machine
│
├── ~/.the-world/                    # Data Storage
│   ├── audit/
│   │   └── world-memory-audit.jsonl # Audit Layer (long-term accumulation on host)
│   └── regions/
│       └── <region-name>/
│           ├── shared/              # Shared Files (mounted, unused)
│           ├── inbox/               # Oracle Delivery (v0.2 main channel, migrating)
│           └── outbox/              # AI Reply (v0.2 main channel, migrating)
│
├── TheWorldServer (Node.js, Port 3344)
│   ├── HTTP API Server
│   │   ├── GET  /health
│   │   ├── GET  /api/status
│   │   ├── POST /api/regions
│   │   ├── GET  /api/regions
│   │   ├── POST /api/ai
│   │   ├── GET  /api/ai
│   │   ├── POST /api/ai/speak
│   │   ├── POST /api/oracle/send (compatibility alias, internally calls speak)
│   │   ├── GET  /api/agent/:region/:user/status
│   │   ├── POST /api/agent/:region/:user/serve/start
│   │   ├── POST /api/agent/:region/:user/serve/stop
│   │   └── GET  /opencode/:region/*
│   │
│   └── AI Proxy (integrated in same service)
│       └── /v1/*                    # Forwards to real AI API
│
├── CLI (dio command)
│   ├── dio start                    # Start TheWorldServer
│   ├── dio stop                     # Stop TheWorldServer
│   ├── dio status                   # Check status
│   ├── dio region create            # Create Region
│   ├── dio region list              # List Regions
│   ├── dio ai create                # Register AI identity
│   ├── dio ai list                  # List AIs
│   ├── dio ai speak                 # Send message to AI (unified interface)
│   └── dio oracle send              # Send Oracle (compatibility alias)
│
├── EverMemOS (External Dependency)
│   └── http://localhost:1995        # World Memory System
│
└── Region Container (Docker)
    ├── GUI Desktop (webtop/noVNC)
    │   └── Browser entry (:3000, randomly mapped by host and can be proxied)
    │
    ├── RegionDaemon (Node.js)
    │   └── Control Server (:62191)  # Command execution, serve management
    │
    ├── agent user (execution semantics)
    │   ├── /home/agent/.opencode/config.json
    │   └── /home/agent/.config/opencode/opencode.jsonc
    │
    ├── abc user (GUI session user)
    │   └── /config
    │
    └── Mount Points
        ├── /world/shared            # Shared directory
        ├── /world/inbox             # Oracle reception
        └── /world/outbox            # AI output
```

## Core Components

### 1. TheWorldServer (Unified Service)

**Responsibilities**:

- HTTP API Server (Region, AI management)
- AI Proxy (API Key isolation and forwarding)
- Integration with EverMemOS
- Communication with RegionDaemon

**Port**: 3344 (unified port)

**Key Features**:

- Single process, simplified deployment
- Paths differentiate responsibilities (`/api/*` vs `/v1/*`)
- Integrated health checks and logging

**Code Location**: `src/server/TheWorldServer.ts`

### 2. AI Proxy Handler

**Responsibilities**:

- Validate AI identity (dummy key)
- Replace with real API Key
- Forward request to real AI service
- Record compressed working memory to EverMemOS and append full audit to host

**Identity Management**:

```typescript
// Generate dummy key when AI registers
const dummyKey = `tw-${aiName}-${Date.now()}`;

// Store mapping relationship
aiIdentities.set(dummyKey, { aiName, dummyKey });
```

**Security Mechanism**:

- AI only sees dummy key
- Real API Key only exists in TheWorldServer
- Request summaries recorded to EverMemOS, full records appended to host audit layer

**Code Location**: `src/proxy/AIProxyHandler.ts`

### 3. RegionDaemon (In-Container Daemon)

**Responsibilities**:

- Manage persistent opencode serve processes (main execution plane)
- Provide controlled outbox write channel (prevents forgery, ensures auditability)
- Monitor outbox changes and notify WorldServer
- Execute maintenance commands (degraded channel, as agent user)

**Port**:

- 62191: Control Server (complements World Server 3344: 3344 | 62191 = 0xFFFF)

**Design Principles (v0.2)**:

- **serve-first**: Container automatically starts `opencode serve --port 4096` on startup as the main execution engine.
- **Observability First**: Persistent processes facilitate monitoring state, rate limiting, diagnostics, and scheduling.
- **Controlled Output**: Agent applies to write to outbox via tool/skill, RegionDaemon validates and writes, then notifies WorldServer.

**Command Execution Flow (Maintenance Channel)**:

```
TheWorldServer → RegionDaemonClient → curl → RegionDaemon (agent context) → sh -lc <cmd>
```

**Current Implementation Status (v0.1)**:

- ✅ Container startup script already starts `opencode serve --port 4096`
- ❌ But main flow still uses temporary `execute('agent', 'opencode run ...')`
- ❌ Serve state management broken: serve from startup script not in `serveProcesses`
- ❌ Outbox monitoring and notification mechanism not implemented

**Code Location**: `src/region-daemon/RegionDaemon.ts`, `docker/services/region-daemon`

### 4. Region Container

**Base Image**: `lscr.io/linuxserver/webtop:ubuntu-xfce`

**Pre-installed Software**:

- opencode-ai (globally installed)
- clawhub (globally installed)
- bash, sudo, git, curl

**User Configuration**:

- `agent`: Command execution and opencode runtime semantics (compatible with existing flow)
- `abc`: GUI desktop session user (webtop native)
- Pre-configured opencode config files (`agent`)
- API points to `http://host.docker.internal:3344/v1`

**Mount Points**:

- `/world/shared` - Shared directory (777 permissions, unused)
- `/world/inbox` - Oracle delivery (v0.2 main channel, migrating)
  - Format: `oracle-{timestamp}-human-{aiName}.txt`
  - Permissions: Agent readable, accessed via tool/skill
- `/world/outbox` - AI reply (v0.2 main channel, migrating)
  - Format: `response-{timestamp}.txt`
  - Permissions: Write-only via controlled RegionDaemon write (prevents forgery)

**Code Location**: `docker/Dockerfile.region`

### 5. CLI Tool (dio)

**Framework**: oclif

**Command Structure**:

```
dio
├── start                 # Start TheWorldServer (background)
├── stop                  # Stop TheWorldServer
├── status                # Check status
├── region
│   ├── create           # Create Region container
│   └── list             # List Regions
├── ai
│   ├── create           # Register AI (generate dummy key)
│   ├── list             # List AIs
│   └── exec             # Execute command
└── oracle
    └── send             # Send Oracle
```

**Operation Mode**: HTTP client (calls TheWorldServer API)

**Code Location**: `src/cli/commands/`

## Data Flow

### AI Conversation Flow (Unified speakToAI Interface)

```
User
  ↓ dio ai speak -t alpha -m "hello" or dio oracle send --to alpha --message "hello"
TheWorldServer (3344)
  ↓ POST /api/ai/speak (or /api/oracle/send compatibility alias)
AIUserManager.speakToAI()
  ↓ 1. logIncomingMessage (log inbound message to EverMemOS + audit layer)
  ↓ 2. buildWakeupMemory (recall relevant memory from EverMemOS)
  ↓ 3. Write to /home/agent/MEMORY.md
  ↓ 4. Construct opencode run --file /home/agent/MEMORY.md
RegionDaemonClient
  ↓ docker exec <region> curl http://localhost:62191/execute
RegionDaemon (in container)
  ↓ POST /execute
executeAsAgent(opencode run ...)
  ↓ opencode run --file /home/agent/MEMORY.md --attach http://localhost:4096
  ↓ AI reads recalled memory in MEMORY.md
  ↓ AI generates reply
Return Result
  ↓ 5. extractTextFromOpencodeOutput (parse JSON output)
  ↓ 6. logOutgoingMessage (log outbound message to EverMemOS + audit layer)
Return to User
```

**Key Features**:

- Forces memory recall for each conversation, ensuring contextual continuity.
- Memory written to `/home/agent/MEMORY.md`, auditable and debuggable.
- Supports multi-source messages (human/ai/system).
- Degrades gracefully if EverMemOS is unavailable, does not block execution.

### AI Calling API Flow

```
In-container agent user
  ↓ opencode run "hello"
Read ~/.opencode/config.json
  ↓ apiKey: tw-alpha-xxx
  ↓ apiBaseUrl: http://host.docker.internal:3344/v1
TheWorldServer AI Proxy (3344/v1)
  ↓ Validate dummy key
  ↓ Replace with real API Key
Forward to real AI service
  ↓ https://api.openai.com/v1
Return response
```

### Oracle Flow (v0.2 Target Model)

**Current Implementation Status (v0.1.1)**:

- ✅ Unified `speakToAI` interface, all messages follow the same flow.
- ✅ Forced memory recall, retrieves relevant context from EverMemOS before each dialogue.
- ✅ `/api/oracle/send` retained as a compatibility alias.
- ⚠️ Still uses synchronous call model (waits for AI reply before returning).
- ❌ inbox/outbox asynchronous model not enabled (planned for v0.2).

**v0.2 Asynchronous Evolution Direction**:

```
User
  ↓ dio oracle send --to alpha --message "hello"
TheWorldServer
  ↓ POST /api/oracle/send
  ↓ Generate message_id, write to /world/inbox/message-{id}.msg
  ↓ Log to EverMemOS + host audit layer (status: pending)
  ↓ Immediately return message_id (does not wait for AI reply)

In-container Agent (persistent opencode serve)
  ↓ Monitor inbox via tool/skill (or actively notified by RegionDaemon)
  ↓ Read message content, recall memory (same as current speakToAI flow)
  ↓ Autonomously decide processing strategy
  ↓ May call "reply to human" tool/skill multiple times
  ↓ Each reply written to /world/outbox/response-{timestamp}.msg
  ↓ Written via controlled RegionDaemon write (prevents forgery, ensures auditability)

RegionDaemon
  ↓ Monitor outbox write events
  ↓ Notify WorldServer (WebSocket/HTTP callback)

WorldServer
  ↓ Update message status (processing → partial_response → completed)
  ↓ Forward to UI/ChatApp/human subscription channel
  ↓ Log to EverMemOS + audit layer

Human
  ↓ Query message status and historical replies via UI/CLI
  ↓ Can recall unexecuted messages
  ↓ Can replay completed messages
```

**Design Semantics**: Messages are asynchronous event deliveries, not synchronous RPC calls. The core memory recall flow remains unchanged; only the transport layer changes from synchronous HTTP to asynchronous files.

## Configuration Management

### Environment Variables (.env)

```bash
# EverMemOS
EVERMEMOS_URL=http://localhost:1995

# AI API
REAL_AI_API_KEY=sk-xxx
AI_TARGET_BASE_URL=https://api.openai.com/v1
REAL_AI_MODEL=claude-opus-4-6-thinking

# TheWorld Server
SERVER_PORT=3344

# EverMemOS Configuration
LLM_API_KEY=sk-xxx
VECTORIZE_API_KEY=vz-xxx

# Data Directory (optional)
WORLD_DATA_DIR=~/.the-world
```

**Code Location**: `src/utils/config.ts`

## Implemented Features

✅ **Core Features (v0.1 stable)**:

- Region container management (create, list)
- AI identity management (register, list)
- Command execution (synchronous calls, maintenance channel)
- API Key isolation (Proxy layer)
- Layered memory (EverMemOS summary layer + host audit layer)
- GUI Desktop support (webtop/noVNC)

✅ **Advanced Features**:

- opencode serve auto-start (on container startup)
- opencode instance proxy (`/opencode/:region/*`)
- Health checks and status queries
- ClawHub Skills native integration

## Features in Migration (v0.1 → v0.2)

🚧 **Asynchronous Oracle Mechanism**:

- ✅ inbox/outbox directories already mounted
- ✅ Container automatically starts `opencode serve --port 4096` on startup
- ⚠️ Oracle still uses synchronous call model (pending migration)
- ❌ Outbox monitoring and notification mechanism (to be implemented)
- ❌ Agent "reply to human" tool/skill (to be implemented)
- ❌ Oracle status query interface (to be implemented)

🚧 **serve-first Execution Model**:

- ✅ Serve process is persistent
- ❌ Main flow still uses temporary `opencode run` (to be migrated to attach)
- ❌ Serve state management broken (serve from startup script not in serveProcesses)

## Unimplemented Features

❌ **Core Architectural Components**:

- **Complete Asynchronous Oracle Chain** ⭐ Migrating
  - Outbox monitoring and notification
  - Agent controlled reply channel
  - Oracle state machine and query interface
  - Recall/cancel/replay mechanism

- **World Scheduler** ⭐ Critical Missing Component
  - Current architecture is completely passive/reactive.
  - Lacks core mechanism to drive AI autonomy.
  - Cannot implement Heartbeat, task queues, priority scheduling.
  - See `docs/decisions/004-world-scheduler.md` for details.

❌ **Vision Features**:

- Multi-user isolation (currently single agent user, end-state goal)
- AI projection mechanism
- Inter-Region communication
- Heartbeat persistent mechanism (depends on World Scheduler)
- Inter-AI process communication
- Approval gates and manual intervention mechanisms

## ClawHub Skills Integration

### Design Decision

TheWorld chooses **native compatibility** with the OpenClaw/ClawHub Skill ecosystem, rather than building its own or translating:

**Core Reasons**:

1.  **Ecosystem First**: ClawHub has a mature Skill ecosystem (4.6k+ stars, 60k+ commits).
2.  **Avoid Deno Trap**: Translation/adaptation approach is high-risk, ecosystem value > technical differences.
3.  **One-Person Company Principle**: Quick results, don't reinvent the wheel, focus on differentiated value.

**Differentiated Value**:

- Multi-Agent native architecture
- Container-level security isolation
- World Memory unified memory
- World Scheduler (planned)

### Implementation Method

**Architecture**: Fully managed within the container.

- Region container pre-installs `clawhub` CLI.
- AI directly uses standard clawhub commands.
- Skills persisted in container volumes (independent per Region).
- Host machine has zero Agentic logic (safety boundary).

**Network**: Container directly accesses clawhub.ai  
**Persistence**: `~/.the-world/regions/<region>/skills/` → `/home/agent/.openclaw/skills/`  
**Sharing**: Not shared across Regions (simplified design).

See: `docs/clawhub-integration.md` and `docs/decisions/005-clawhub-integration.md`

## Engineering Trade-offs

### Choice 1: Single User vs Multi-User

**Choice**: Single `agent` user

**Reasoning**:

- Simplifies deployment (no need for dynamic user creation).
- Reduces complexity (no need to manage user permissions).
- Proxy layer already provides identity isolation.
- Sufficient for MVP stage.

**See**: `docs/decisions/001-single-user.md`

### Choice 2: Unified Port vs Separate Ports

**Choice**: Single port 3344

**Reasoning**:

- Simplifies configuration (only need to manage one port).
- Simplifies deployment (no need for multiple services).
- Path-based responsibility differentiation is clear enough.

**See**: `docs/decisions/002-unified-port.md`

### Choice 3: Synchronous Call vs Asynchronous Message

**v0.1 Choice**: Synchronous HTTP call

**Reasoning**:

- Low latency (no file polling needed).
- Simplifies error handling.
- Quick validation for MVP stage.

**v0.2 Migration Direction**: Asynchronous event-driven

**Migration Reasoning**:

- Task nature is broad/heavyweight, synchronous semantics mismatch.
- Supports multiple replies and ongoing dialogue.
- Interruptible, recoverable, auditable.
- Agents have reply sovereignty.

**See**: `docs/decisions/003-sync-oracle.md` (historical stage decision, v0.2 has shifted to async model)

### Choice 4: GUI-first Default vs Headless-first Default

**Choice**: GUI-first as default Region strategy (implementing)

**Reasoning**:

- Many real-world systems are not API-first; closed UI workflows exist.
- Critical paths like login, CAPTCHA, human verification require graphical interface capabilities.
- Capability completeness value outweighs resource savings.
- Default should approximate real user system capabilities, not idealized interface assumptions.

**Note**:

- Current v0.1 implementation still primarily uses headless Region.
- Migration to GUI-first determined in ADR-006.
- Headless retained as a degraded path, no longer the default stance.

**See**: `docs/decisions/006-gui-first-region.md`

## Performance Characteristics

### Command Execution Latency

- RegionDaemon internal execution: ~2-5ms
- Via docker exec + curl: ~50-100ms
- Overall acceptable

### Concurrency Capability

- TheWorldServer: Single process, Node.js async I/O
- RegionDaemon: Single process, supports multiple concurrent requests
- Actual test: 50 concurrent requests < 1 second

### Resource Usage

- TheWorldServer: ~50MB memory
- Region Container: Baseline memory higher with GUI-first than headless (depends on desktop session and browser load).
- Each opencode serve: ~50MB memory

## Deployment Requirements

### Host Machine

- Node.js 18+
- Docker 20.10+
- Available port: 3344

### External Dependencies

- EverMemOS (http://localhost:1995)
- AI API service (OpenAI / Anthropic / custom)

### Storage

- `~/.the-world/`: Data directory
- `~/.the-world/regions/<name>/`: Data for each Region
- `~/.the-world/audit/world-memory-audit.jsonl`: Host audit layer
- `~/.the-world/server.pid`: Server PID
- `~/.the-world/server.log`: Server log

## Monitoring and Debugging

### Health Check

```bash
curl http://localhost:3344/health
# {"status":"healthy","timestamp":...}
```

### Status Query

```bash
curl http://localhost:3344/api/status
# {"status":"ok","regions":2,"aiIdentities":3,"uptime":...}
```

### Log Locations

- TheWorldServer: `~/.the-world/server.log`
- RegionDaemon: `docker logs <region-name>`

## Next Steps

See `docs/04-roadmap.md` for future plans.

---

**Note**: This is an accurate description of the current implementation. Differences from the long-term vision are intentional engineering trade-offs; see the `docs/decisions/` directory for details.