# TheWorld AI

**Build a One Person Company with a world of AI teammates.**

TheWorld gives you a governed world map of Regions, where AI agents can descend into the right Region to work, collaborate, and keep improving.

Why OPC builders choose TheWorld:

- **Ecosystem-ready**: native ClawHub compatibility, including Anthropic-style Skill workflows.
- **Cost-efficient**: run multiple specialized AI collaborators on one machine.
- **Memory that compounds**: EverMemOS-backed layered memory for continuous recall and gradual persona shaping.

Built with discipline: assume-breach security baseline, control/workload separation, and auditable critical actions.

MVP is production-ready today; async event flow and World Scheduler are next.

## Current Status

**Version**: v0.1.0 (MVP) → v0.2.0 (迁移中)  
**Status**: v0.1 Production Ready, v0.2 Migrating to Async Event Model

### Implemented Features ✅

- Region container management (create, list)
- AI identity management (Proxy layer isolation)
- Command execution (synchronous invocation, maintenance channel)
- API Key security isolation
- Layered World Memory (EverMemOS + host audit)
- opencode serve auto-start (container startup)
- GUI Desktop support (webtop/noVNC)
- ClawHub Skills native integration

### Migrating Features 🚧 (v0.1 → v0.2)

- **Async Oracle mechanism**: inbox/outbox mounted, serve running, but main path still synchronous (migrating)
- **serve-first execution model**: serve process resident, but main path still uses temporary `opencode run` (migrating to attach)

### Future Plans ⏳

- Multi-user isolation (currently single user + Proxy, ultimate goal)
- AI projection mechanism
- Inter-region communication
- Heartbeat persistence mechanism
- **World Scheduler** (v0.3.0) - Core component for AI autonomy
- Human control mechanisms (approval gates, cancellation, replay)

See [Roadmap](./docs/04-roadmap.md) for details

## Quick Start

### Prerequisites

- Node.js 18+
- Docker 20.10+
- EverMemOS (deployed at http://localhost:1995)

### Installation

```bash
# Clone repository
git clone https://github.com/the-world/the-world-ai.git
cd the-world-ai

# Install dependencies
npm install

# Build
npm run build
```

### Configuration

```bash
# Copy configuration template
cp .env.example .env

# Edit .env file with required configuration:
# - REAL_AI_API_KEY: Your AI API Key
# - EVERMEMOS_URL: EverMemOS address
# - LLM_API_KEY: API Key used by EverMemOS
# - VECTORIZE_API_KEY: Vectorization API Key
```

See [EverMemOS Setup Guide](./docs/EVERMEMOS_SETUP.md) for details

### Start System

```bash
# Start TheWorld server (background)
dio start

# Check status
dio status
```

### Create Region and AI

```bash
# Create Region container
dio region create -n region-a

# Register AI identity
dio ai create -n alpha
dio ai create -n beta

# List AIs
dio ai list
```

### Communicate with AI

```bash
# Speak to AI (unified interface with memory recall)
dio ai speak -t alpha -r region-a -m "Analyze this project architecture"

# Or use oracle send (compatibility alias)
dio oracle send --to alpha --region region-a --message "Analyze this project architecture"

# Recall memory only (cross-region, no AI execution)
dio ai:memory:recall -t alpha -q "project architecture"

# Remember memory asynchronously (for testing)
dio ai:memory:remember -t alpha -k fact -c "Alpha prefers concise summaries"

# Check memory pipeline health
dio ai:memory:health

# Note: Every message automatically triggers memory recall from EverMemOS
# AI receives context in /home/agent/MEMORY.md before responding
```

### Using ClawHub Skills

AI agents can directly use the ClawHub skill ecosystem:

```bash
# AI searches and installs skills autonomously
dio ai speak -t alpha -r region-a \
  -m "Find and install a calendar management skill"

# Or use oracle (compatibility alias)
dio oracle send --to alpha --region region-a \
  --message "Find and install a calendar management skill"
```

Skills are managed entirely within Region containers using the standard `clawhub` CLI. See [ClawHub Integration](./docs/clawhub-integration.md) for details.

## Core Concepts

### Region

- Docker container providing isolated execution environment
- Pre-installed with opencode-ai and clawhub CLI
- Mounted shared directories and skills storage

### AI (Agent)

- Identity managed through Proxy layer
- Each AI has a unique dummy key
- Can execute commands and call AI APIs

### Proxy

- Isolates real API Key
- Validates AI identity
- Records audit logs

### World Memory

- Layered memory design
- Working/Knowledge/Episode memories are stored as compact summaries in EverMemOS
- Full audit records are appended on host machine for traceability
- Audit file path: `~/.the-world/audit/world-memory-audit.jsonl`
- Shared across Regions

## Core Value: Security Stance

- Assume breach: workloads may eventually have RCE, so design for damage containment instead of trust by default
- Container compromise must not imply host compromise; this is a baseline security goal, not an advanced feature
- Default to least privilege: non-root runtime, minimal Linux capabilities, no privileged mode, no dangerous host mounts
- Isolate control plane from workload plane: never expose Docker daemon control (`docker.sock` / unauthenticated engine APIs) to business containers
- Keep actions attributable and reversible through audit trails, controlled output channels, and operational guardrails

See [ADR-007: Runtime Security Baseline](./docs/decisions/007-runtime-security-baseline.md) for the enforceable decisions.

## Architecture

```
Host Machine
│
├── TheWorldServer (3344)
│   ├── HTTP API (/api/*)
│   └── AI Proxy (/v1/*)
│
├── CLI (dio)
│   └── HTTP Client
│
├── EverMemOS (1995)
│   └── World Memory
│
└── Region Container
    ├── GUI Desktop (3000)
    ├── RegionDaemon (62191)
    ├── agent user (execution)
    └── abc user (GUI session)
```

See [Current Architecture Documentation](./docs/02-current-arch.md) for details

## Documentation

### Core Documentation

- [Long-term Vision](./docs/01-vision.md) - TheWorld's complete vision
- [Current Architecture](./docs/02-current-arch.md) - MVP implementation details
- [Development Roadmap](./docs/04-roadmap.md) - Future plans

### Design Decisions

- [ADR-001: Single User Architecture](./docs/decisions/001-single-user.md)
- [ADR-002: Unified Port](./docs/decisions/002-unified-port.md)
- [ADR-003: Synchronous Command Execution](./docs/decisions/003-sync-oracle.md)
- [ADR-004: World Scheduler](./docs/decisions/004-world-scheduler.md)
- [ADR-005: ClawHub Skills Integration](./docs/decisions/005-clawhub-integration.md)
- [ADR-006: GUI-first Region Default](./docs/decisions/006-gui-first-region.md)
- [ADR-007: Runtime Security Baseline](./docs/decisions/007-runtime-security-baseline.md)
- [ADR-008: Unified AI Speak and Memory Recall](./docs/decisions/008-unified-ai-speak-and-memory-recall.md)
- [ADR-009: Memory Primitives Remember/Recall](./docs/decisions/009-memory-primitives-remember-recall.md)

### Configuration Guides

- [EverMemOS Setup](./docs/EVERMEMOS_SETUP.md)
- [GUI Desktop (noVNC)](./docs/GUI_DESKTOP.md)
- [Privileged Maintenance Flow](./docs/maintenance-privileged-ops.md)

### Historical Documents (Archived)

- [design.md](./docs/archive/design.md) - Early complete design
- [design-new.md](./docs/archive/design-new.md) - MVP design draft
- [SERVER_REDESIGN.md](./docs/archive/SERVER_REDESIGN.md) - Server refactoring proposal
- [MVP_SUMMARY.md](./docs/archive/MVP_SUMMARY.md) - MVP implementation summary

## Development

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build
npm run build

# Start server (foreground)
npm run start:server

# Format code
npm run format

# Lint code
npm run lint
```

## API Reference

### HTTP API

```bash
# Health check
GET /health

# Status query
GET /api/status

# Region management
POST /api/regions
GET  /api/regions
GET  /api/regions/:region/gui

# AI management
POST /api/ai
GET  /api/ai

# AI Communication (unified speak interface)
POST /api/ai/speak

# AI Memory Recall (cross-region)
POST /api/ai/memory/recall

# AI Memory Remember (async)
POST /api/ai/memory/remember

# AI Memory Health
GET  /api/ai/memory/health

# OpenCode MCP (memory tools)
POST /mcp/memory

# Oracle (compatibility alias for speak)
POST /api/oracle/send

# Region GUI Proxy
GET  /gui/:region/*
```

### CLI Commands

```bash
dio start                           # Start server
dio stop                            # Stop server
dio status                          # Check status

dio region create -n <name>         # Create Region
dio region list                     # List Regions

dio ai create -n <name>             # Register AI
dio ai list                         # List AIs
dio ai speak -t <ai> -r <region> -m <msg>  # Speak to AI (unified interface)
dio ai:memory:recall -t <ai> -q <query>    # Recall AI memory to stdout (cross-region)
dio ai:memory:remember -t <ai> -k <kind> -c <content>  # Remember memory (async)
dio ai:memory:health                 # Memory pipeline health

dio oracle send --to <ai> --region <region> --message <msg>  # Send Oracle (compatibility alias)
```

## Engineering Decisions

The current MVP implements a simplified version of the core concepts through the following engineering trade-offs to accelerate development:

1. **Single User Architecture** - Uses a single `agent` user + Proxy layer identity isolation, rather than independent users for each AI
2. **Unified Port** - Single service port 3344, rather than separate API and Proxy services
3. **Synchronous Execution** - Direct HTTP calls, rather than asynchronous message queues
4. **Passive Architecture** - Fully reactive (user-triggered), lacking World Scheduler for AI autonomy (planned for v0.3.0)

These decisions provide sufficient functionality for the MVP stage while significantly reducing complexity. See the `docs/decisions/` directory for details.

## Contributing

Contributions are welcome! Please read first:

- [Current Architecture](./docs/02-current-arch.md) to understand implementation details
- [Development Roadmap](./docs/04-roadmap.md) to understand future direction
- [Design Decisions](./docs/decisions/) to understand engineering trade-offs

## License

MIT
