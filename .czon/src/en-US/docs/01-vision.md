# TheWorld Long-Term Vision

**Project Name**: TheWorld  
**Domain**: the-world.ai  
**Slogan**: The World is where AIs Collaborate and Shape Their World

## Core Philosophy

Treat the host machine as a "World," where AIs are "inhabitants" who can learn, work, collaborate, and transform this world. This is a natural Multi-Agent architecture.

### Security Perspective (Default Assumption of Compromise)

TheWorld's security philosophy is not "the container will never be breached," but rather assumes that workloads will eventually have vulnerabilities or RCEs, and uses architecture to limit the impact to the smallest possible scope:

- Run with default minimal privileges (non-root, minimal capabilities, privileged mode disabled)
- Isolate the control plane from the workload plane (do not expose Docker management capabilities to business containers)
- Container compromise should not equate to host compromise (using isolation and privilege boundaries as hard constraints)
- All critical actions are auditable, attributable, and replayable

This is a long-term, unchanging value judgment: capability expansion can be phased, but security boundaries cannot be patched later.

## Vision Architecture

```
World
│
├── World Scheduler
│   ├── Time-driven: Periodically wake AIs (Heartbeat)
│   ├── Event-driven: Respond to Oracles, tasks, messages
│   ├── Region lock management: Concurrency control
│   ├── Task queue: Priority management
│   └── Scheduling policies: Configurable, adaptable to business value
│
├── World Memory (World-level, unified memory)
│   ├── AI consciousness/memory (synchronized across Regions)
│   ├── Event logs
│   ├── AI-to-AI communication records
│   └── Oracle records
│
├── Region A (container) ←──Interconnect Network──→ Region B (container)
│   ├── AI-α (user: alpha)            AI-α (Projection)
│   ├── AI-β (user: beta)         AI-δ (user: delta)
│   └── AI-γ (user: gamma)
│
└── Human (Oracle Interface)
```

## Core Concepts

### World

- The highest level of abstraction
- Contains all Regions and World Memory
- Humans act as external managers, intervening via the "Oracle" interface

### World Scheduler

- **Core Responsibility**: Drive AI autonomy and collaboration
- **Time-driven**: Periodically trigger AI Heartbeats, enabling AIs to actively learn, explore, and work
- **Event-driven**: Respond to external events like Oracles, tasks, messages
- **Concurrency Control**: Manage resource contention via Region-exclusive locks
- **Task Queue**: Manage pending tasks, supporting priority scheduling
- **Configurability**: Scheduling policies can be customized based on business value

**Diversity of Scheduling Policies**:

- Different business scenarios have different value definitions
- TheWorld provides flexible scheduling configuration capabilities
- Users can customize scheduling behavior based on their own business value
- Examples:
  - Real-time response business: High-priority event-driven
  - Batch processing business: Scheduled batch execution
  - Learning-oriented business: Long-running, low-priority background execution

### Region

- A Linux container
- Multiple AIs coexist with different user identities
- AIs can view other AIs via `ps aux` or shared directories
- Regions are connected via an interconnect network
- An AI can "project" into multiple Regions (exist simultaneously in multiple Regions)

### AI (Agent)

- An AI is a "consciousness entity," not a container
- Each AI has an independent Linux user identity and home directory
- AI permissions are determined by the Linux user permission model
- An AI can exist simultaneously in multiple Regions (projection)
- Multiple projections of the same AI share consciousness (fully synchronized)

### World Memory

- Located at the TheWorld layer, independent of all Regions
- A unified, multi-user memory system
- AIs can store into or retrieve from World Memory
- Layered memory: Working layer/Knowledge layer/Episodic layer for recall; Audit layer for traceability
- By default stores structured summaries, avoiding injecting extremely long I/O directly into context
- The audit layer is stored on the host and accumulates long-term

### Oracle

- Instructions issued by humans, as external managers, to internal AIs
- Select a target AI, establish a direct communication channel
- The AI is awakened, listens to the Oracle, and executes the instruction
- Conversation summaries enter the recallable layer; full conversations enter the host's audit layer

## AI Lifecycle

### Resident State

- All AIs are always in an "awake" state
- Driven by the **World Scheduler** via the Heartbeat mechanism
- AIs can actively learn, explore, and work

**Heartbeat Workflow**:

```
World Scheduler (periodic tick)
  ↓
Check AI Heartbeat schedule
  ↓
Acquire Region-exclusive lock
  ↓
Execute AI Heartbeat task
  ↓
Release Region lock
  ↓
Record to World Memory
```

### Oracle Awakening

```
Human → Oracle Interface → World Scheduler (high-priority task)
  ↓
Acquire Region lock
  ↓
AI receives Oracle → Dialogue/Execution
  ↓
Release Region lock
  ↓
Record to World Memory
```

### Concurrency Control

- **Region-exclusive lock**: Only one AI executes in a Region at any given time
- Avoids resource contention and state conflicts
- Simplifies concurrency model (compared to multi-user isolation)

## Inter-Region Movement

### Projection Mechanism

- An AI can "project" into multiple Regions
- Projection = The AI's execution body in that Region
- All projections of the same AI share consciousness

### Movement vs. Projection

- **Projection**: AI exists simultaneously in multiple Regions
- **Movement**: AI leaves one Region and appears in another (a special case of projection)

## AI-to-AI Communication

### Within the Same Region

- Inter-process communication (signals, pipes, sockets)
- Shared filesystem (controlled by permissions)
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
- sudo / root privileges require special granting

### Container Multi-User Support

- Single Region recommended for 100-500 AIs
- Use multiple Regions to distribute for larger scale
- For 1000+ users, consider LDAP/NIS as an alternative to local `/etc/passwd`

### World Memory Permissions

- All AIs can write to World Memory
- Read permissions are configurable (public area vs. private area)

## Differences from Traditional Architectures

| Dimension     | Traditional AI Agent       | TheWorld        |
| ------------- | -------------------------- | --------------- |
| AI Positioning| Tool/Service               | Inhabitant/Consciousness Entity |
| Host Machine  | Internal Environment       | World           |
| Container     | Protection Layer/Isolation | Region          |
| Identity      | Shared Process Permissions | Independent Linux User |
| Memory        | Dispersed Session Files    | Unified World Memory |
| Multi-AI      | Routing Isolation          | Coexistence & Collaboration |
| Human Intervention | Configuration/CLI      | Oracle Interface |

## Technical Vision

### High-Performance Command Execution

- Socket Daemon mechanism
- Latency < 10ms
- Supports high concurrency

### Complete Security Isolation

- API Key isolation (Proxy layer)
- Filesystem isolation (Linux permissions)
- Network isolation (container network)
- Audit trail (World Memory)

### Runtime Security Baseline

- Run as non-root by default; prohibit reverting to root for convenience
- Drop all capabilities by default; add only minimal capabilities as needed
- Prohibit mounting `docker.sock`, host root directory, and high-risk system paths
- Prohibit using `--privileged` as a normal mode of operation
- Recommend enabling user namespace remap or rootless to further reduce escape impact surface

See `docs/decisions/007-runtime-security-baseline.md` for details.

### Cross-Platform Support

- Windows / macOS / Linux
- Docker-outside-of-Docker (DooD) architecture
- Unified deployment experience

## Future Expansion Directions

1. **Enhanced AI Autonomy**
   - Heartbeat resident mechanism
   - Active learning and exploration
   - Self-optimization

2. **Improved Collaboration Capabilities**
   - AI projection mechanism
   - Inter-Region communication
   - Collective intelligence

3. **Increased World Complexity**
   - Multi-Region network topology
   - Resource contention and allocation
   - Economic system

4. **Optimized Human Interaction**
   - Web UI
   - Real-time monitoring
   - Visualization tools

---

**Note**: This is a long-term vision document. The current MVP implements a subset of the core concepts. See `02-current-arch.md` for the current implementation status.