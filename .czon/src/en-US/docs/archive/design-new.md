# TheWorld MVP Architecture Design

## Project Overview

**Project Name**: TheWorld  
**NPM Package Name**: the-world-ai  
**CLI Command**: dio  
**Slogan**: The World is where AIs Collaborate and Shape Their World

### Core Concept

Treat the host machine as a "world," with AIs as "inhabitants" within it. Achieve AI isolation and collaboration through Region containers. Each AI runs opencode as an independent Linux user, securely accessing AI APIs via a proxy server.

## Architecture Overview

```
Host Machine
│
├── ~/.the-world/                 # Data storage directory
│   ├── regions/
│   │   └── region-a/
│   │       ├── shared/           # Shared files
│   │       ├── inbox/            # Oracle message reception
│   │       └── outbox/           # AI output
│
├── the-world-ai (Node.js CLI + Proxy Server)
│   ├── dio start                    # Start system
│   ├── dio region create            # Create Region container
│   ├── dio ai create alpha          # Create AI user
│   ├── dio ai exec alpha "cmd"      # Execute command
│   └── Proxy Server (:3456)         # AI API request forwarding
│
├── EverMemOS (Deployed)
│   └── http://localhost:1995        # World memory system
│
└── Region-A (Docker Container)
    ├── Socket Daemon (root)
    ├── opencode-ai (globally installed)
    ├── AI-alpha (Linux user)
    ├── AI-beta (Linux user)
    └── AI-gamma (Linux user)
```

## Core Components

### 1. TheWorld CLI (Runs on Host)

**Responsibilities**:
- Manage system lifecycle (start/stop)
- Create and manage Region containers
- Create and manage AI users
- Provide AI API proxy server
- Record system events to EverMemOS

**Tech Stack**:
- Node.js 18+
- TypeScript
- oclif (CLI framework)
- dockerode (Docker API)
- express + http-proxy-middleware (proxy server)

### 2. AI Proxy Server

**Responsibilities**:
- Authenticate AI identity (dummy key)
- Replace with real API Key
- Forward requests to real AI services
- Record audit logs to EverMemOS
- Prevent API Key leakage

**Security Mechanisms**:
- AIs can only access dummy keys
- Proxy server holds real API Keys
- All requests logged to EverMemOS (audit trail)

### 3. Region Container

**Responsibilities**:
- Provide isolated environment for AIs
- Run Socket Daemon (command execution)
- Provide filesystem isolation
- Manage AI user permissions

**Tech Stack**:
- Node.js 20 Alpine
- opencode-ai (globally installed)
- Linux user permission model

### 4. Socket Daemon

**Responsibilities**:
- Listen on multiple Unix sockets (one per AI)
- Execute commands (as the corresponding AI user)
- High-performance command execution (< 10ms latency)

### 5. EverMemOS Integration

**Memory Types**:
- `episodic_memory`: AI conversation history
- `event_log`: System events
- Custom: Oracle records, inter-AI communication

**Usage**:
- AI consciousness/memory storage
- Event log recording
- Audit trail

## Data Flow

### AI Executing opencode Commands

```
User → dio ai exec alpha "analyze code"
  → TheWorld CLI (Host)
    → Docker API
      → Region Container
        → Socket Daemon
          → su - alpha -c "opencode analyze code"
            → opencode reads ~/.opencode/config.json
              → API Key: dummy-alpha-xxx
                → Send request to http://host.docker.internal:3456/v1
                  → AI Proxy Server (Host)
                    → Validate dummy key
                    → Replace with real API Key
                    → Forward to https://api.openai.com/v1
                    → Record audit log to EverMemOS
                      ← Return response
                    ← Return to opencode
                  ← Return result
                ← Output result
```

### Oracle Flow

```
User → dio oracle send --to alpha --message "hello"
  → TheWorld CLI
    → Record to EverMemOS
    → Write to ~/.the-world/regions/region-a/inbox/oracle.msg
      → Region Container
        → AI-alpha monitors inbox
          → Read oracle content
            → Execute corresponding operation
```

## Security Model

### 1. API Key Isolation

- **AI Perspective**: Can only see dummy key (`tw-alpha-123456`)
- **Proxy Server**: Holds real API Keys, forwards after authentication
- **Advantage**: AIs cannot leak or obtain real API Keys

### 2. Filesystem Isolation

- Linux user permission model
- AI-alpha cannot read AI-beta's `chmod 600` files
- Shared directory `/world/shared` (777 permissions)

### 3. Audit Trail

- All AI API requests logged to EverMemOS
- Traceable history of each AI's actions

## Implementation Details

### Project Structure

```
the-world-ai/
├── src/
│   ├── cli/                      # oclif CLI commands
│   │   ├── commands/
│   │   │   ├── start.ts                  # Start system
│   │   │   ├── stop.ts                   # Stop system
│   │   │   ├── status.ts                 # Check status
│   │   │   ├── oracle/send.ts            # Oracle
│   │   │   ├── region/
│   │   │   │   ├── create.ts             # Create Region
│   │   │   │   └── list.ts               # List Regions
│   │   │   └── ai/
│   │   │       ├── create.ts             # Create AI
│   │   │       ├── exec.ts               # Execute command
│   │   │       └── list.ts               # List AIs
│   │   └── index.ts
│   │
│   ├── proxy/                            # AI API proxy server
│   │   └── AIProxyServer.ts              # Proxy server main logic
│   │
│   ├── core/
│   │   ├── DockerManager.ts              # Docker API wrapper
│   │   ├── RegionManager.ts              # Region management
│   │   └── AIUserManager.ts              # AI user management
│   │
│   ├── memory/
│   │   ├── EverMemOSClient.ts
│   │   ├── MemoryManager.ts
│   │   └── types.ts
│   │
│   ├── region-daemon/
│   │   ├── daemon.ts
│   │   └── client.ts
│   │
│   └── utils/
│       ├── logger.ts
│       ├── config.ts
│       └── types.ts
│
├── docker/
│   ├── Dockerfile.region
│   └── init-scripts/
│       └── init-users.sh
│
├── dist/                         # Build artifacts
├── bin/run                       # CLI entry point
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### Key Commands

#### `dio start`
- Check environment variables
- Verify EverMemOS connection
- Start AI Proxy Server (listens on :3456)

#### `dio region create <name>`
- Build Region image (if not exists)
- Create container and mount filesystem
- Start Socket Daemon

#### `dio ai create <name>`
- Register AI with proxy server (generate dummy key)
- Create Linux user inside container
- Inject opencode configuration (includes dummy key)

#### `dio ai exec <ai> <cmd>`
- Execute command via Socket Daemon
- Run as AI user

### Environment Configuration

```bash
# EverMemOS configuration
EVERMEMOS_URL=http://localhost:1995

# Real AI API Key (used by proxy server)
REAL_AI_API_KEY=sk-xxxxxxxxxxxx

# AI service target address
AI_TARGET_BASE_URL=https://api.openai.com

# Proxy server port
AI_PROXY_PORT=3456

# TheWorld data storage path (optional, defaults to ~/.the-world)
# WORLD_DATA_DIR=/custom/path/to/data
```

## Next Steps

- [x] Implement project structure
- [x] Implement AI Proxy Server
- [ ] Implement Region container build (needs testing)
- [ ] Implement Socket Daemon (needs testing)
- [ ] Implement CLI commands (needs testing)
- [ ] Write documentation
- [ ] Publish to npm

## Current Status

✅ **Completed**:
1. Project base structure
2. TypeScript configuration
3. oclif CLI framework
4. Core code implementation:
   - AI Proxy Server
   - EverMemOS client
   - Docker manager
   - Region manager
   - AI user manager
   - Socket Daemon
5. All CLI commands implemented

🚧 **To Be Tested**:
1. Region container build (Docker image)
2. Socket Daemon actual operation
3. Complete end-to-end flow
4. Integration with EverMemOS

📝 **To Be Refined**:
1. Error handling
2. Logging optimization
3. Configuration validation
4. Unit tests
5. Documentation improvement