# GUI Desktop in Container (noVNC)

This project includes a ready-to-run container desktop based on noVNC, suitable for browser automation fallback and manual human verification flows.

The GUI image is built from `lscr.io/linuxserver/webtop:ubuntu-xfce` and pre-installs:

- Node.js 20
- `opencode-ai` CLI (`opencode`)
- `clawhub` CLI

## What You Get

- Linux desktop (XFCE) running inside Docker
- Browser-based remote desktop (noVNC)
- Shared host directory mounted into the desktop container
- Localhost-only exposure by default for safer access

## Start

```bash
docker compose -f docker/docker-compose.gui.yml up -d
```

The first run will build the local image `the-world/gui-desktop:latest`.

Open:

```text
http://127.0.0.1:3000
```

## Stop

```bash
docker compose -f docker/docker-compose.gui.yml down
```

## Volumes

- `${HOME}/.the-world/gui/config` -> `/config` (desktop/browser persistence)
- `${HOME}/.the-world/shared` -> `/workspace/shared` (shared files)

## Security Notes

- The web port is bound to `127.0.0.1` only in the compose file.
- If you need remote access from another machine, put it behind VPN or reverse proxy auth; do not expose directly to the public internet.

## Tips for Browser Stability

- `shm_size: 1gb` is enabled to reduce browser crashes.
- If the host is low on memory, reduce concurrent tabs/processes first.
