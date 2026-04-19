---
name: apply
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
node "${CLAUDE_PLUGIN_ROOT}/src/snapshot.mjs" diff "$SNAPSHOT_PATH"
```

3. Present the diff summary and ask for confirmation:
   > "The following changes will be applied: [summary]. Existing files with conflicts will be backed up as `.bak`. Apply all? (y/n)"

4. If confirmed, run apply:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/snapshot.mjs" apply "$SNAPSHOT_PATH"
```

5. Report results:
   - Files written/overwritten
   - Backups created (.bak files)
   - Plugins installed (or failed to install)
   - Any warnings (e.g., runtime path differences between machines)

6. **MCP servers — post-apply guidance:**

   If `result.mcpReport.missing` is non-empty, surface it as a dedicated section. For each missing server, show install guidance based on its `method`:

   - **npm**: "Install with the MCP's official install command (e.g. `claude mcp add {name} npx -y <package>`)."
   - **pip**: "Install with `uvx <package>` or the project's documented uv/pipx command."
   - **binary**: "This MCP points to a local binary ({command}). Confirm the binary exists on this machine or install it."
   - **manual**: "This MCP uses a custom command ({command}). Refer to its source documentation."

   > **Do NOT modify `~/.claude.json` yourself. v0.2 explicitly reports without writing because `.claude.json` also holds OAuth tokens. The user installs MCPs through their normal tooling; the snapshot tells them *what* to install, not *how to edit the file*.**

   If `result.mcpReport.matched` is non-empty, you can mention briefly that those MCPs were already present and no action is needed.

7. **Important:** Warn the user to restart Claude Code for changes to take full effect.
