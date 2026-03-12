# Region GUI Access (noVNC)

TheWorld uses a single Region container runtime. Region containers are GUI-first by default (ADR-006) and include browser-accessible desktop capability.

There is no separate standalone GUI container path anymore.

## What You Get

- Linux desktop (XFCE) inside each Region container
- Browser-based remote desktop (noVNC on container port `3000`)
- Unified host access via TheWorld proxy route: `/gui/:region/*`

## Usage

1. Create a Region:

```bash
dio region create -n region-a
```

2. Start TheWorld server:

```bash
dio start
```

3. Open GUI through unified proxy:

```text
http://127.0.0.1:3344/gui/region-a/
```

4. Optional: query GUI status/port:

```bash
curl http://127.0.0.1:3344/api/regions/region-a/gui
```

## Security Notes

- Recommended default is localhost-only access (`127.0.0.1`).
- If cross-machine access is needed, use VPN or authenticated reverse proxy. Do not expose directly to public internet.

## Notes

- Region runtime remains compatible with `agent` execution semantics while GUI session runs on webtop's native desktop user.
- GUI-first prioritizes capability completeness over resource minimization.
