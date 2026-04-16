---
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
PLUGIN_DIR="<resolved plugin root>"
node "${PLUGIN_DIR}/src/snapshot.mjs" inspect "$SNAPSHOT_PATH"
```

3. Parse the JSON manifest and present a readable summary:
   - Export date and source machine
   - Plugin list with versions
   - Marketplace registrations
   - Hook scripts
   - Global MD files
   - Whether it's a slim or full snapshot (check if manifest mentions cache entries)
