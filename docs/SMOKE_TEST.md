# claude-snapshot smoke test

Manual protocol for validating a release end-to-end across two real machines. Run before cutting a new version tag.

## Setup

- **Machine A** (source): your primary dev machine with a real `~/.claude/` setup, at least 2 installed plugins, at least 1 hook, at least 1 MCP server configured.
- **Machine B** (target): a second machine — different OS ideally, different username definitely — with Claude Code installed but a minimal `~/.claude/`.
- Shared path (Drive, scp target, USB): any way to move a file from A to B.

## Protocol

### 1. Export on Machine A

```bash
/snapshot:export --output ~/smoke-test.tar.gz
```

- [ ] Command completes without error.
- [ ] Output JSON shows `status: "ok"`.
- [ ] The reported plugin/hook/globalMd counts match what you expect.
- [ ] File size is reasonable (< 5 MB for slim, depends on config for `--full`).

### 2. Inspect on Machine A (self-check)

```bash
/snapshot:inspect ~/smoke-test.tar.gz
```

- [ ] Shows correct schema version (`1.0.0`).
- [ ] Plugin list matches installed plugins.
- [ ] MCP server count matches `~/.claude.json` mcpServers count.
- [ ] No `/Users/<you>` paths visible in the output (paths should be normalized as `$HOME`).

### 3. Transfer to Machine B

```bash
# Example via scp
scp ~/smoke-test.tar.gz user@machine-b:~/
```

### 4. Diff on Machine B (dry-run sanity)

```bash
/snapshot:diff ~/smoke-test.tar.gz
```

- [ ] Plugins listed as "added" are all real plugins Machine B does not have.
- [ ] MCP servers listed as "added" are expected.
- [ ] No "changed" category for unexpected files.

### 5. Apply on Machine B

```bash
/snapshot:apply ~/smoke-test.tar.gz
```

- [ ] Claude presents the diff and asks for confirmation. Answer `y`.
- [ ] Apply completes. Conflicting local files are written to `<file>.bak`.
- [ ] `mcpReport.missing` lists MCP servers that need install, with correct `method` classification.

### 6. Post-apply validation on Machine B

```bash
# Check hooks are executable
ls -l ~/.claude/hooks/

# Check settings resolve to Machine B's paths
grep -o '/Users/[a-z]*' ~/.claude/settings.json | sort -u
grep -o '/home/[a-z]*' ~/.claude/settings.json | sort -u
```

- [ ] All hook scripts have the owner-executable bit (`-rwx------` or `-rwxr-xr-x`).
- [ ] No Machine A username appears in any path in `~/.claude/settings.json`.
- [ ] Machine B username appears in resolved paths.

### 7. Restart Claude Code on Machine B

- [ ] Close and reopen Claude Code (or run `/reload-plugins`).
- [ ] Plugins from snapshot appear installed.
- [ ] Installing the MCP servers flagged by `mcpReport.missing` (manually via `claude mcp add ...` or `npx ...`) makes them available.

### 8. Rollback test (optional but valuable)

```bash
# On Machine B, restore original state
for f in ~/.claude/*.bak; do mv "$f" "${f%.bak}"; done
```

- [ ] Restart Claude Code. Config on Machine B returns to its original state.

## Pass criteria

Every checkbox above must be checked. If any step fails, do not tag a release — file an issue referencing this checklist and the failing step.
