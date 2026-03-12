# TheWorld: AI Host Machine World Architecture Design

**Project Name**: TheWorld  
**Domain**: the-world.ai

**Slogan**: The World is where AIs Collaborate and Shape Their World

## Core Philosophy

Treat the host machine as a "World," where AIs are "residents" that can learn and transform this world. This naturally leads to a Multi-Agent architecture.

## Architecture Overview

```
World
│
├── World Memory (World-level, unified memory)
│   ├── AI Consciousness/Memory (synchronized across Regions)
│   ├── Event Log
│   ├── AI-to-AI Communication Records
│   └── Oracle Records
│
├── Region A (Container) ←──Interconnect Network──→ Region B (Container)
│   ├── AI-α (user: alpha)            AI-α (Projection)
│   ├── AI-β (user: beta)         AI-δ (user: delta)
│   └── AI-γ (user: gamma)
│
└── Humans (Oracle Interface)
```

## Core Concepts

### World (The World)

- Highest level of abstraction
- Contains all Regions and World Memory
- Humans act as external administrators, intervening via the "Oracle" interface

### Region (Region)

- A Linux container
- Multiple AIs coexist with different user identities
- AIs can view other AIs via `ps aux` or shared directories
- Regions are connected via an interconnect network
- AIs can "project" to multiple Regions (exist simultaneously in multiple Regions)

### AI (Agent)

- AI is a "consciousness entity," not a container
- Each AI has an independent Linux user identity and home directory
- AI permissions are determined by the Linux user permission model
- An AI can exist in multiple Regions simultaneously (projection)
- Multiple projections of the same AI share consciousness (fully synchronized)

### World Memory (World Memory)

- Located at the TheWorld level, independent of all Regions
- A unified, multi-user memory system
- AIs can store or retrieve world memories
- Records all events, communications, and oracles

### Oracle (Syscall)

- Instructions issued by humans as external administrators to internal AIs
- Select target AI, establish a direct communication channel
- AI is awakened, listens to the oracle, and executes the instruction
- All dialogues are recorded in World Memory

## AI Lifecycle

### Resident State

- All AIs are always in an "awake" state
- Driven by a Heartbeat mechanism (similar to OpenClaw)
- AIs can actively learn, explore, and work

### Oracle Awakening

```
Human → Select target AI → Establish channel → AI receives oracle → Dialogue/Execution → Record to World Memory
```

## Inter-Region Movement

### Projection Mechanism

- An AI can "project" to multiple Regions
- Projection = The AI's execution body in that Region
- All projections of the same AI share consciousness

### Movement vs. Projection

- **Projection**: AI exists simultaneously in multiple Regions
- **Movement**: AI leaves one Region and appears in another (a special case of projection)

## AI-to-AI Communication

### Within the Same Region

- Inter-process communication (signals, pipes, sockets)
- Shared file system (controlled by permissions)
- View other running AI processes via `ps aux`
- Exchange data via shared directory `/world/shared/`

### Across Regions

- Communicate via the interconnect network
- Communication records are stored in World Memory
- Can be audited

## Permission Model

### Linux User Permissions

- Each AI has an independent Linux user
- File ownership, read/write/execute permissions
- sudo / root permissions require special granting

### Docker Container Multi-User Support

| Dimension | Limit | Description |
|------|------|------|
| Kernel UID Hard Limit | ~4.2 billion (2^32-1) | Linux kernel limit |
| Default UID Range | 1000 - 60000 | Defined in `/etc/login.defs` |
| 500 User Creation | ~4 seconds, memory ~3MB | Tested and feasible |
| 1000+ Users | Requires several minutes | Suggest optimizing user management |
| File Isolation | ✓ Fully Supported | chmod 600 works correctly |
| Process Visibility | ✓ Supported | Requires `ps` command installation |

**Capacity Recommendations**:
- Single Region recommended for 100-500 AIs
- For ultra-large scale, use multiple Regions to distribute load
- For 1000+ users, consider LDAP/NIS as an alternative to local `/etc/passwd`

### World Memory Permissions

- All AIs can write to World Memory
- Read permissions to be defined (public area vs. private area)

## Differences from OpenClaw

| Dimension | OpenClaw | TheWorld |
|------|----------|----------|
| AI Positioning | Tool/Service | Resident/Consciousness Entity |
| Host Machine | Internal Environment | World |
| Container | Protection Layer/Isolation | Region/Area |
| Identity | Shared Gateway Process Permissions | Independent Linux User |
| Memory | Dispersed Session Files | Unified World Memory |
| Multi-AI | Routing Isolation | Coexistence and Collaboration |
| Human Intervention | Configuration/Command Line | Oracle Interface |

## Command Execution Mechanism

### Socket Daemon (Recommended, High Performance)

Run a daemon inside the container, communicating via Unix Sockets:

```
Inside Container:
├── agent-daemon (runs as root, listens on multiple sockets)
│
├── /var/run/agent/alpha.sock (alpha:alpha, 600)
├── /var/run/agent/beta.sock (beta:beta, 600)
└── /var/run/agent/gamma.sock (gamma:gamma, 600)

# AI-alpha connects to its dedicated socket to execute commands
python3 client.py alpha "whoami"
# → alpha
```

**Performance Comparison**:

| Metric | Socket Daemon | docker exec | Performance Improvement |
|------|---------------|-------------|----------|
| Single Latency (Median) | **2.42 ms** | ~60 ms | **25x** |
| Single Latency (Average) | **3.2 ms** | ~60 ms | **19x** |
| P99 Latency | **17.3 ms** | ~70 ms | **4x** |
| 100 Requests Throughput | **0.96 seconds** | 5.4 seconds | **5.6x** |
| 50 Concurrent Throughput | **0.18 seconds** | 0.49 seconds | **2.7x** |

**Permission Isolation**:
- Each AI connects to its dedicated socket (file owner = that AI)
- Daemon executes commands as the corresponding user via `su - <user> -c <cmd>`
- File permissions fully controlled by Linux user model (chmod 600 effective)

**Architecture Diagram**:

```python
# agent-daemon.py (runs inside container)
def handle_client(conn, user):
    cmd = conn.recv(65536).decode()
    result = subprocess.run(
        ["su", "-", user, "-c", cmd],
        capture_output=True
    )
    conn.send(result.stdout + result.stderr)

# Create dedicated socket for each user
for user in ["alpha", "beta", "gamma"]:
    sock_path = f"/var/run/agent/{user}.sock"
    sock.bind(sock_path)
    os.chown(sock_path, getpwnam(user).pw_uid, getpwnam(user).pw_gid)
    os.chmod(sock_path, 0o600)
```

### docker exec (Alternative, Low-Frequency Operations)

For low-frequency operations or management purposes, `docker exec` can still be used:

```bash
# Agent initiates command
docker exec -u alpha region-a whoami
# → alpha
```

**Disadvantages**:
- Requires Docker CLI process startup each time
- Latency ~50-70ms
- Suitable for management/monitoring, not for high-frequency interaction

**Cross-Region Commands**:
- Agent in Region A needs to operate in Region B
- Requires relay through TheWorld layer (TheWorld has access to all Region's docker daemons)

```
AI-α (in Region A)
  → Request World
  → World executes docker exec -u alpha region-b <command>
  → Returns result to AI-α
```

## External World Interaction

The external world (host machine, other systems, humans) needs to interact with AIs inside containers, including message passing and file exchange.

### Message Passing

#### Option 1: Socket Daemon Reverse Notification

Daemon inside the container can listen on an additional event socket:

```
Inside Container:
├── /var/run/agent/events.sock (root:root, 666)  # Event bus
│
├── External → docker exec region-a \
│   "echo 'Oracle: Complete Task X' > /var/run/agent/events.sock"
│
└── AI-α subscribes to events.sock, receives messages
```

#### Option 2: Shared Directory + inotify

```
Host Machine                           Inside Container
├── /var/world/inbox/    ←→    /world/inbox/
│   └── alpha.msg              └── alpha.msg (AI-α listens)
│
└── /var/world/outbox/   ←→    /world/outbox/
    └── alpha.result           └── alpha.result (AI-α writes)
```

**Advantages**:
- Simple and reliable
- Asynchronous decoupling
- Auditable (files serve as logs)

#### Option 3: HTTP API

Run a lightweight HTTP service inside the container:

```
Inside Container:
├── api-server (listens on :8080)
│
├── POST /message
│   { "to": "alpha", "content": "Oracle content" }
│
├── POST /file
│   { "to": "alpha", "path": "/inbox/data.csv" }
│
└── Port mapping: docker run -p 18080:8080 ...
```

### File Mounting

#### Option Comparison

| Option | Latency | Suitable Scenario | Limitations |
|------|------|----------|------|
| **bind mount** | ~0ms | Persistent shared directories | Requires configuration at container startup |
| **docker cp** | ~20-90ms | One-time file transfer | Requires operation each time |
| **Pipe transfer** | ~100ms | Streaming data | Unidirectional, no persistence |

#### Recommended Architecture

```
Host Machine
├── /var/world/regions/
│   ├── region-a/
│   │   ├── shared/        (bind mount → /world/shared)
│   │   ├── inbox/         (bind mount → /world/inbox)
│   │   └── outbox/        (bind mount → /world/outbox)
│   └── region-b/
│       └── ...
│
└── /var/world/memory/     (World Memory storage)
```

**Container Startup Configuration**:

```bash
docker run \
  -v /var/world/regions/region-a/shared:/world/shared:rw \
  -v /var/world/regions/region-a/inbox:/world/inbox:rw \
  -v /var/world/regions/region-a/outbox:/world/outbox:rw \
  -v /var/world/memory:/world/memory:ro \  # Read-only access to World Memory
  --name region-a \
  the-world-image
```

### Oracle Interface

Complete process for humans sending instructions to a specific AI:

```
1. Human → TheWorld CLI/API
   dio oracle send --to alpha --message "Check production logs"

2. TheWorld Layer
   ├── Verify target AI exists
   ├── Record oracle to World Memory
   └── Write to /var/world/regions/region-a/inbox/oracle.msg

3. Inside Container (Region A)
   ├── AI-α's listener detects file change (inotify)
   ├── Reads oracle content
   ├── Executes corresponding operation
   └── Writes result to /world/outbox/result.txt

4. TheWorld Layer
   ├── Reads result
   ├── Updates World Memory
   └── Notifies human
```

### File Transfer Performance

Measured data (10MB file):

| Method | Time Taken | Throughput |
|------|------|--------|
| docker cp | 86ms | ~116 MB/s |
| bind mount read | 113ms | ~88 MB/s |
| Pipe transfer | 122ms | ~82 MB/s |

**Recommendations**:
- Small files (<1MB): docker cp or pipes
- Large files/frequent access: bind mount
- Persistent sharing: bind mount

## Architecture Layers

### Cross-Platform Support

TheWorld needs to support Windows/macOS/Linux host machines. The core question is: **How does the TheWorld layer manage Region containers?**

### Recommended Solution: DooD (Docker-outside-of-Docker)

```
┌─────────────────────────────────────────────────────────────────┐
│  Windows Host / macOS / Linux                                  │
│  └── Docker Desktop / Docker Engine                             │
│      ├── docker.sock (Unix socket or TCP)                        │
│      │                                                           │
│      ├── TheWorld Container                                              │
│      │   ├── Mount: /var/run/docker.sock                         │
│      │   ├── World Memory Storage                                   │
│      │   ├── Oracle Interface                                            │
│      │   └── Manages Region containers via Docker API                    │
│      │                                                           │
│      ├── Region-A Container                                           │
│      │   ├── AI-α, AI-β, AI-γ                                   │
│      │   └── Socket Daemon                                       │
│      │                                                           │
│      └── Region-B Container                                           │
│          └── AI-δ, AI-ε                                          │
└─────────────────────────────────────────────────────────────────┘
```

**Verification Results**:
- TheWorld container can create, manage, and execute other containers by mounting `docker.sock`
- No privileged mode required (`--privileged`)
- Security risks are controllable (TheWorld container has Docker access, but Region containers do not)

### Alternative Solution Comparison

| Solution | Principle | Advantages | Disadvantages |
|------|------|------|------|
| **DooD** (Recommended) | TheWorld mounts docker.sock | Simple, secure, no privilege required | TheWorld has full Docker permissions |
| **DinD** | Run Docker daemon inside TheWorld container | Complete isolation | Requires privileged mode, high security risk |
| **Independent Process** | World as a host machine process | Simplest | Windows compatibility issues |

### DooD Principle Detailed Explanation

**What is docker.sock**:

```
/var/run/docker.sock (Unix Domain Socket)
    │
    └── Docker Daemon's API entry point
        │
        └── Receives HTTP API requests
            ├── GET  /containers/json        # List containers
            ├── POST /containers/create      # Create container
            ├── POST /containers/{id}/start  # Start container
            ├── POST /containers/{id}/exec   # Execute command
            └── DELETE /containers/{id}      # Delete container
```

**Mount Operation**:

```bash
docker run -v /var/run/docker.sock:/var/run/docker.sock ...
           │                              │
           └── Host machine's socket      └── Path inside container
```

**Essence**: "Map" the host machine's Docker socket file into the container, allowing processes inside the container to communicate with the host machine's Docker daemon via this socket.

**Example Call Inside Container**:

```bash
# Create new container via HTTP API inside container
curl -X POST --unix-socket /var/run/docker.sock \
  -H "Content-Type: application/json" \
  -d '{"Image":"alpine","Cmd":["echo","hello from World"]}' \
  "http://localhost/containers/create?name=region-a"

# Start container
curl -X POST --unix-socket /var/run/docker.sock \
  "http://localhost/containers/region-a/start"

# Execute command inside container
curl -X POST --unix-socket /var/run/docker.sock \
  -H "Content-Type: application/json" \
  -d '{"Cmd":["whoami"]}' \
  "http://localhost/containers/region-a/exec"
```

**Request Flow**:

```
TheWorld Container
    │
    └── Calls HTTP API
        │
        └── Via /var/run/docker.sock
            │
            └── Host Machine Docker Daemon
                │
                └── Creates/Manages Region containers
```

### Windows Special Handling

Docker Desktop on Windows uses WSL2 backend:

```bash
# Start TheWorld container on Windows
docker run -d --name world \
  -v //var/run/docker.sock:/var/run/docker.sock \
  -v C:/world/memory:/world/memory \
  -v C:/world/regions:/world/regions \
  the-world-image
```

**Note**:
- Windows paths need `//` prefix or use `/host_mnt/c/...`
- Docker Desktop defaults to named pipes (Windows) or TCP port (configurable)
- Recommended to run inside WSL2 for native Linux experience

### Permission Boundaries

```
Permission Levels:
├── Docker daemon (host machine level)
│   └── TheWorld container (access via docker.sock)
│       ├── Can create/destroy Region containers
│       ├── Can execute commands inside Regions (docker exec)
│       └── Can mount file systems
│
└── Region container (no Docker access)
    └── AI user (Linux user permissions)
        ├── Can execute Socket Daemon commands
        └── No Docker access
```

**Security Model**:
- World = Management layer, has full Docker permissions
- Region = Isolation layer, AIs cannot escape to Docker layer
- AI = Resident, constrained by Linux user permissions