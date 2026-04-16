---
description: Export your Claude Code setup as a portable snapshot
allowed-tools: Bash, Read
---

# /snapshot:export

Export your complete Claude Code setup (plugins, hooks, settings, CLAUDE.md) as a portable `.tar.gz` snapshot.

## Usage

- `/snapshot:export` — slim snapshot to ~/
- `/snapshot:export --full` — includes plugin caches for offline use
- `/snapshot:export --output /path/to/file.tar.gz` — custom output path

## Steps

1. Determine the plugin install path by finding the directory containing this skill file
2. Run the export via the core script:

```bash
PLUGIN_DIR="<resolved plugin root>"
RESULT=$(node "${PLUGIN_DIR}/src/snapshot.mjs" export $ARGS 2>&1)
echo "$RESULT"
```

3. Parse the JSON result and report to the user:
   - Number of plugins, hooks, MDs, and marketplaces included
   - Output file path and size
   - Whether it was a slim or full export

4. If `--full` was passed, note that the file may be larger (>50MB) due to plugin caches.
