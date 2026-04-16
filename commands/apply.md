---
description: Apply a snapshot to this machine's Claude Code setup
allowed-tools: Bash, Read, AskUserQuestion
---

# /snapshot:apply

Apply a Claude Code snapshot to this machine, restoring the complete setup.

## Usage

`/snapshot:apply <path-to-snapshot.tar.gz>`

## Steps

1. Validate the path argument exists

2. **First run diff** to show the user what will change:

```bash
PLUGIN_DIR="<resolved plugin root>"
node "${PLUGIN_DIR}/src/snapshot.mjs" diff "$SNAPSHOT_PATH"
```

3. Present the diff summary and ask for confirmation:
   > "The following changes will be applied: [summary]. Existing files with conflicts will be backed up as `.bak`. Apply all? (y/n)"

4. If confirmed, run apply:

```bash
PLUGIN_DIR="<resolved plugin root>"
node "${PLUGIN_DIR}/src/snapshot.mjs" apply "$SNAPSHOT_PATH"
```

5. Report results:
   - Files written/overwritten
   - Backups created (.bak files)
   - Plugins installed (or failed to install)
   - Any warnings (e.g., runtime path differences between machines)

6. **Important:** Warn the user to restart Claude Code for changes to take full effect.
