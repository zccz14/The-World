# ClawHub Skills Integration

## Overview

TheWorld natively supports the OpenClaw/ClawHub Skill ecosystem, enabling AI to utilize thousands of community-developed Skills while preserving TheWorld's unique value proposition.

## Why Choose ClawHub Compatibility?

### Ecosystem Value > Technical Differences

**Historical Lesson: Deno's Dilemma**

- Deno was technically superior to Node.js (security, native TypeScript)
- However, its incompatibility with the npm ecosystem hindered its growth
- It ultimately had to compromise and add npm support

**TheWorld's Choice**

- We have differentiated value (Multi-Agent, container isolation, World Memory)
- But we shouldn't reinvent the wheel for the Skill ecosystem
- Native ClawHub compatibility = immediate access to a mature ecosystem

### User Persona: One-Person Company

**Core Needs**:

- Prioritize economics: Don't waste time reinventing the wheel
- Quick results: Immediately usable Skills
- Architectural understanding: Appreciates the value of Multi-Agent
- Driven to deliver value: Focuses on business, not tooling complexities

**Value of ClawHub Compatibility**:

- Zero learning curve (AI uses standard commands)
- Immediate usability (thousands of ready-made Skills)
- Community-driven (continuous updates and maintenance)

## Architecture Design

### Core Principles

1.  **Fully Container-Managed**: All Skill logic resides within the Region container
2.  **Zero Agentic Host**: The host machine does not participate in any AI decision-making
3.  **Native Compatibility**: No translation or adaptation; direct use of the `clawhub` CLI

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Host Machine (TheWorld Server)                              │
│                                                              │
│  ~/.the-world/regions/<region>/skills/                      │
│    └── Pure storage, zero logic                             │
└─────────────────────────────────────────────────────────────┘
                          ↓ Mount
┌─────────────────────────────────────────────────────────────┐
│ Region Container                                            │
│                                                              │
│  Pre-installed Software:                                    │
│    ├── opencode-ai                                          │
│    ├── clawhub CLI ⭐ NEW                                  │
│    └── node, python, curl, jq, etc.                        │
│                                                              │
│  /home/agent/.openclaw/skills/ ⭐ Persistent               │
│    └── <author>/<skill-name>/                              │
│                                                              │
│  AI Agent Can Execute:                                      │
│    ├── clawhub search <query>                              │
│    ├── clawhub install <slug>                              │
│    ├── clawhub list                                        │
│    └── Use Skills directly (native OpenClaw way)           │
└─────────────────────────────────────────────────────────────┘
```

### Design Decisions

| Decision Point      | Choice               | Rationale                                      |
| ------------------- | -------------------- | ---------------------------------------------- |
| Management Location | Inside Container     | Aligns with "Zero Agentic Host" principle      |
| Network Access      | Direct Access        | Simple; efficiency is not a bottleneck         |
| Persistence         | Container Volume     | Independent per Region, simplifies design      |
| Cross-Region Sharing| No Sharing           | Avoids complexity; users won't use many Skills |
| CLI Integration     | No `dio skill` added | AI manages itself, reduces maintenance cost    |

## Implementation Details

### Files to Modify

1.  **docker/Dockerfile.region**
    - Add `npm install -g clawhub`
    - Create `/home/agent/.openclaw/skills/` directory

2.  **src/core/RegionManager.ts**
    - Add skills directory mount
    - Create skills directory in `ensureDirectory`

### Usage Examples

```bash
# AI autonomously searches, installs, and uses Skills
dio ai speak -t alpha -r region-a \
  -m "Search for a calendar skill, install it, and show me how to use it"

# Or using oracle (compatible alias)
dio oracle send --to alpha --region region-a \
  --message "Find and install a calendar management skill, then check my schedule"
```

### User Experience

**Typical Conversation Flow**:

```
User: "Help me find a calendar management skill"
AI: [Executes clawhub search calendar]
AI: "I found steipete/calendar. Should I install it?"
User: "Install it"
AI: [Executes clawhub install steipete/calendar]
AI: "Installed. It's ready to use now."
```

## Differences from OpenClaw

| Dimension | OpenClaw         | TheWorld                     |
| --------- | ---------------- | ---------------------------- |
| Focus     | Personal AI Assistant | Multi-Agent Infrastructure   |
| Architecture | Single Agent     | Multi-Agent + Region Containers |
| Isolation | Process-level    | Container-level              |
| Memory    | Local Files      | World Memory (EverMemOS)     |
| Skills    | Shared           | Independent per Region       |
| Scheduling| Passive Response | World Scheduler (Planned)    |

## Future Optimizations

**Phase 2 (Optional)**:

- Add `dio skill list` read-only command (for user convenience)
- Add host-side ClawHub caching proxy (improves performance)
- Log Skill usage in World Memory

**Phase 3 (Optional)**:

- Cross-Region Skill recommendations (based on usage frequency)
- Skill security scanning

## Reference Resources

- [ClawHub Official Site](https://clawhub.ai)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [Skills Repository](https://github.com/openclaw/skills)
- [ClawHub Documentation](https://github.com/openclaw/clawhub)