# claude-snapshot

Portable Claude Code setup snapshots. Export your config, plugins, hooks, and settings — apply on another machine.

## Install

```
/plugin install adhenawer/claude-snapshot
```

## Commands

- `/snapshot:export [--full] [--output <path>]` — Export your setup as a portable snapshot
- `/snapshot:inspect <path>` — Preview snapshot contents without extracting
- `/snapshot:diff <path>` — Compare a snapshot against your current setup
- `/snapshot:apply <path>` — Apply a snapshot to this machine

## What migrates

| Artifact | Included |
|---|---|
| settings.json (plugins, hooks, permissions, env, statusLine) | Yes |
| CLAUDE.md + global .md files | Yes |
| Plugin manifests + marketplace registrations | Yes |
| Hook scripts | Yes |
| Plugin caches (with --full) | Yes |
| Sessions, history, telemetry | No |

## License

MIT
