# claude-snapshot

Portable Claude Code setup snapshots. Export your config, plugins, hooks, and settings — apply on another machine in under 2 minutes.

## Why

- **Multiple machines** — Keep your personal and work setups in sync. Export at home, drop the file on Drive, apply at work.
- **Mac format / OS reinstall** — Save a snapshot before wiping your machine. Restore your entire Claude Code setup after a fresh install.
- **Safe rollback** — About to experiment with new plugins or risky config changes? Take a snapshot first. If things break, apply the snapshot and you're back to a known good state.
- **Onboarding** — New team member? Share your team's snapshot and they're up and running with the same plugins, hooks, and conventions.

## Install

```
/plugin install adhenawer/claude-snapshot
```

## Commands

| Command | Description |
|---|---|
| `/snapshot:export` | Export your setup as a portable `.tar.gz` snapshot |
| `/snapshot:export --full` | Include plugin caches for offline restore |
| `/snapshot:export --output <path>` | Custom output path |
| `/snapshot:inspect <path>` | Preview snapshot contents without extracting |
| `/snapshot:diff <path>` | Compare a snapshot against your current setup |
| `/snapshot:apply <path>` | Apply a snapshot to this machine (with confirmation) |

## Typical workflows

### Sync between machines

```bash
# On your personal machine
/snapshot:export --output ~/Drive/claude-snapshot.tar.gz

# On your work machine
/snapshot:apply ~/Drive/claude-snapshot.tar.gz
```

### Backup before format

```bash
# Before wiping
/snapshot:export --full --output ~/Desktop/claude-backup.tar.gz

# After fresh install + Claude Code installed
/snapshot:apply ~/Desktop/claude-backup.tar.gz
```

### Safe experimentation

```bash
# Save current state
/snapshot:export --output ~/claude-before-experiment.tar.gz

# Try new plugins, change hooks, break things...

# Something went wrong? Roll back
/snapshot:apply ~/claude-before-experiment.tar.gz
```

## What migrates

| Artifact | Included |
|---|---|
| settings.json (plugins, hooks, permissions, env, statusLine) | Yes |
| CLAUDE.md + global .md files | Yes |
| Plugin manifests + marketplace registrations | Yes |
| Hook scripts | Yes |
| Plugin caches (with `--full`) | Yes |
| Sessions, history, telemetry | No |
| Project-scoped plugins | No |

## How it works

1. **Export** reads `~/.claude/` and creates a portable `.tar.gz` with a `manifest.json` index
2. Absolute paths (like `/Users/you/`) are normalized to `$HOME` for portability
3. **Apply** extracts the snapshot, resolves `$HOME` for the target machine, backs up any conflicting files as `.bak`, and installs missing plugins

## License

MIT
