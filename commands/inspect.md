---
name: inspect
description: Preview snapshot contents without extracting
allowed-tools: Bash, Read
---

# /snapshot:inspect

Show the contents of a Claude Code snapshot without extracting it.

## Usage

`/snapshot:inspect <path-to-snapshot.tar.gz>`

## Steps

1. Validate the path argument exists
2. Run inspect via the core script:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/snapshot.mjs" inspect "$SNAPSHOT_PATH"
```

3. Parse the JSON manifest and present a readable summary:
   - **First line:** `Schema {manifest.schemaVersion}` (e.g. `Schema 1.0.0`)
   - If `manifest.mcpServers.length > 0`, show a line: `MCP servers: N (npm: X, pip: Y, binary: Z, manual: W)` — counts grouped by each server's `method`. If `length === 0`, omit the line entirely.
   - Export date and source machine
   - Plugin list with versions
   - Marketplace registrations
   - Hook scripts
   - Global MD files
   - Whether it's a slim or full snapshot (check if manifest mentions cache entries)
