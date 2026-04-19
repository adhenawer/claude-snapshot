---
name: export
description: Export your Claude Code setup as a portable snapshot
allowed-tools: Bash, Read
---

# /snapshot:export

Export your complete Claude Code setup (plugins, hooks, settings, CLAUDE.md) as a portable `.tar.gz` snapshot.

## Usage

`/snapshot:export` — writes to `~/claude-snapshot-YYYY-MM-DD.tar.gz`

## Steps

1. Run the export via the core script, passing any user arguments:

```bash
RESULT=$(node "${CLAUDE_PLUGIN_ROOT}/src/snapshot.mjs" export $ARGS 2>&1)
echo "$RESULT"
```

2. Parse the JSON result and report to the user:
   - Output file path (emphasize this — it's what they'll pass to `/snapshot:apply` on the other machine)
   - Number of plugins, hooks, MDs, and marketplaces included
