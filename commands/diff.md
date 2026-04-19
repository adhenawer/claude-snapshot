---
name: diff
description: Compare a snapshot against your current Claude Code setup
allowed-tools: Bash, Read
---

# /snapshot:diff

Compare a Claude Code snapshot against your current local setup. Shows what would change if you applied it.

## Usage

`/snapshot:diff <path-to-snapshot.tar.gz>`

## Steps

1. Validate the path argument exists
2. Run diff via the core script:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/snapshot.mjs" diff "$SNAPSHOT_PATH"
```

3. Parse the JSON diff result and present as a readable report:

**Format:**
```
Plugins:
  + plugin-name@version        (missing locally)
  ~ plugin-name local -> snapshot  (version mismatch)
  = plugin-name@version        (match)

Hooks:
  + hook-name.sh               (missing locally)
  = hook-name.sh               (match)

Global MDs:
  + NEWFILE.md                 (missing locally)
  ~ CLAUDE.md                  (content differs)
  = RTK.md                     (match)

Settings:
  ~ settings.json              (content differs)
  = settings.json              (match)

MCP servers:
  + MCP: server-name (npm)     (missing locally)
  = 3 MCP servers already present.
```

Use `+` for additions, `~` for changes, `=` for matches.

**MCP servers rendering:**
- If `diff.mcpServers.added.length > 0`, render each as `+ MCP: {name} ({method})`, followed by the note: "These MCP servers are in the snapshot but not on this machine. Apply will tell you how to install each."
- If `diff.mcpServers.matched.length > 0` and `added` is empty, render a single line: `= {N} MCP servers already present.`
