# TheWorld AI

**The World is where AIs Collaborate and Shape Their World**

TheWorld is an AI collaboration platform that treats the host machine as a "world" where AIs act as "residents" learning, working, and collaborating together.

## Current Status

**Version**: v0.1.0 (MVP)  
**Status**: Production Ready

### Implemented Features ✅

- Region container management (create, list)
- AI identity management (Proxy layer isolation)
- Command execution (synchronous invocation)
- Oracle (direct AI communication)
- API Key security isolation
- Layered World Memory (EverMemOS + host audit)
- opencode serve management

### Future Plans ⏳

- Multi-user isolation (currently single user + Proxy)
- AI projection mechanism
- Inter-region communication
- Heartbeat persistence mechanism
- **World Scheduler** (v0.3.0) - Core component for AI autonomy

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

### Execute Commands

```bash
# Execute command in Region
dio ai exec -a alpha -r region-a -c "ls -la"

# Send Oracle (communicate with AI)
dio oracle send --to alpha --region region-a --message "Analyze this project architecture"
```

### Using ClawHub Skills

AI agents can directly use the ClawHub skill ecosystem:

```bash
# AI searches and installs skills autonomously
dio oracle send --to alpha --region region-a \
  --message "Find and install a calendar management skill"

# Or execute clawhub commands directly
dio ai exec -a alpha -r region-a -c "clawhub search calendar"
dio ai exec -a alpha -r region-a -c "clawhub install steipete/calendar"
dio ai exec -a alpha -r region-a -c "clawhub list"
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
    ├── RegionDaemon (62191)
    ├── agent user
    └── opencode-ai
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

### Configuration Guides

- [EverMemOS Setup](./docs/EVERMEMOS_SETUP.md)
- [GUI Desktop (noVNC)](./docs/GUI_DESKTOP.md)

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

# AI management
POST /api/ai
GET  /api/ai

# Command execution
POST /api/ai/exec

# Oracle
POST /api/oracle/send
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
dio ai exec -a <ai> -r <region> -c <cmd>  # Execute command

dio oracle send --to <ai> --region <region> --message <msg>  # Send Oracle
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
