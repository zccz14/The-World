# Privileged Maintenance Implementation Notes (Single Approver)

## Objective

Provide a minimal privileged maintenance channel while keeping Regions non-privileged by default:

- Containers/systems can only request tickets; they cannot directly obtain root shell access.
- After human (single user) approval, the host executes allowlisted actions via `docker exec -u root`.
- The entire process retains state and execution results.

## Design Boundaries

- Single approver model (no multi‑role/multi‑person approval introduced).
- Only allowlisted actions are supported: `apt_update`, `install_packages`.
- Arbitrary command passthrough is not supported (prohibits `bash -c <user_input>`).

## Data Model

Maintenance tickets are stored in: `~/.the-world/maintenance/tickets.json`

Core fields:

- `id`
- `region`
- `action`
- `params`
- `reason`
- `status` (`requested` | `approved` | `rejected` | `done` | `failed`)
- `expiresAt`
- `result` (populated after execution)

## API

- `POST /api/maintenance/tickets` – create a ticket
- `GET /api/maintenance/tickets` – list tickets (filterable by `status`)
- `GET /api/maintenance/tickets/:id` – query a ticket
- `POST /api/maintenance/tickets/:id/approve` – approve
- `POST /api/maintenance/tickets/:id/reject` – reject
- `POST /api/maintenance/tickets/:id/run` – execute

## CLI

- `dio maintenance:request -r <region> -a apt_update -m "…"`
- `dio maintenance:request -r <region> -a install_packages -p "jq,curl" -m "…"`
- `dio maintenance:approve -i <ticket-id>`
- `dio maintenance:reject -i <ticket-id> -m "…"`
- `dio maintenance:run -i <ticket-id>`
- `dio maintenance:status -i <ticket-id>`
- `dio maintenance:status -s requested`

## Executor

- Host execution entry point: `DockerManager.execInContainer(..., user='root')`
- Fixed script inside container: `/usr/local/bin/tw-maint`
- `tw-maint` only accepts allowlisted actions and performs parameter validation.

## Testing

### Automated Tests

`npm test -- MaintenanceManager.test.ts`

Coverage points:

- `install_packages` parameter validation
- State transitions (request → approve → run → done)
- Unapproved tickets cannot be executed
- Expired tickets are rejected for execution

### Manual Integration Testing

1. Create a Region: `dio region create -n region-a`
2. Submit a ticket: `dio maintenance:request -r region-a -a apt_update -m "refresh apt index"`
3. Approve the ticket: `dio maintenance:approve -i <id>`
4. Execute the ticket: `dio maintenance:run -i <id>`
5. Query the result: `dio maintenance:status -i <id>`