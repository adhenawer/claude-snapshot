# buildwithclaude PR — Add claude-snapshot Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Submit a PR to `davepoon/buildwithclaude` adding `claude-snapshot` as a standalone plugin bundle so it's discoverable and installable via `buildwithclaude.com`.

**Architecture:** Fork the buildwithclaude repo, create `plugins/claude-snapshot/` with the full plugin source (commands + `src/snapshot.mjs` + `package.json`), adapt `plugin.json` to meet buildwithclaude manifest requirements, run validation, and open a PR following CONTRIBUTING.md conventions.

**Tech Stack:** GitHub CLI (`gh`), Node.js 18+, `npm test` (buildwithclaude validation suite)

---

## Why include `src/` in the bundle

The four commands (`export`, `apply`, `diff`, `inspect`) each call:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/snapshot.mjs" <verb> ...
```

`CLAUDE_PLUGIN_ROOT` is set by Claude Code to the installed plugin directory at runtime. For the commands to work when installed from buildwithclaude, `src/snapshot.mjs` (and its `tar` dependency) must live inside the bundle — there is no external fetch.

---

## File Structure

| Action | File |
|---|---|
| Create | `plugins/claude-snapshot/.claude-plugin/plugin.json` |
| Create | `plugins/claude-snapshot/package.json` |
| Create | `plugins/claude-snapshot/src/snapshot.mjs` (copy from source) |
| Create | `plugins/claude-snapshot/commands/export.md` (copy from source) |
| Create | `plugins/claude-snapshot/commands/apply.md` (copy from source) |
| Create | `plugins/claude-snapshot/commands/diff.md` (copy from source) |
| Create | `plugins/claude-snapshot/commands/inspect.md` (copy from source) |

All files are created inside a local fork of `davepoon/buildwithclaude`.

---

## Task 1: Fork and clone buildwithclaude

**Files:** none — git setup only

- [ ] **Step 1: Fork the repo**

```bash
gh repo fork davepoon/buildwithclaude --clone=false
```

Expected: `✓ Created fork <your-user>/buildwithclaude`

- [ ] **Step 2: Clone your fork**

```bash
gh repo clone adhenawer/buildwithclaude ~/Code/buildwithclaude
cd ~/Code/buildwithclaude
```

- [ ] **Step 3: Create the feature branch**

```bash
git checkout -b add-claude-snapshot
```

- [ ] **Step 4: Install buildwithclaude dependencies (needed for validation)**

```bash
npm install
```

Expected: packages installed without errors.

- [ ] **Step 5: Commit checkpoint**

```bash
git commit --allow-empty -m "chore: start add-claude-snapshot branch"
```

---

## Task 2: Create plugin directory skeleton

**Files:**
- Create: `plugins/claude-snapshot/.claude-plugin/plugin.json`
- Create: `plugins/claude-snapshot/package.json`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p ~/Code/buildwithclaude/plugins/claude-snapshot/.claude-plugin
mkdir -p ~/Code/buildwithclaude/plugins/claude-snapshot/src
mkdir -p ~/Code/buildwithclaude/plugins/claude-snapshot/commands
```

- [ ] **Step 2: Write plugin.json**

Create `plugins/claude-snapshot/.claude-plugin/plugin.json`:

```json
{
  "name": "claude-snapshot",
  "version": "0.2.0",
  "description": "Export and apply portable snapshots of your Claude Code setup across machines",
  "author": {
    "name": "Rodolfo Moraes",
    "url": "https://github.com/adhenawer"
  },
  "repository": "https://github.com/adhenawer/claude-snapshot",
  "license": "MIT",
  "keywords": [
    "snapshot",
    "config",
    "sync",
    "backup",
    "setup",
    "cross-machine",
    "export",
    "apply"
  ]
}
```

- [ ] **Step 3: Write package.json**

Create `plugins/claude-snapshot/package.json`:

```json
{
  "name": "claude-snapshot",
  "version": "0.2.0",
  "description": "Portable Claude Code setup snapshots — export, diff, and apply your config across machines",
  "type": "module",
  "main": "src/snapshot.mjs",
  "dependencies": {
    "tar": "^7.0.0"
  },
  "license": "MIT"
}
```

- [ ] **Step 4: Commit**

```bash
cd ~/Code/buildwithclaude
git add plugins/claude-snapshot/
git commit -m "feat: add claude-snapshot plugin skeleton"
```

---

## Task 3: Copy source and command files

**Files:**
- Create: `plugins/claude-snapshot/src/snapshot.mjs`
- Create: `plugins/claude-snapshot/commands/export.md`
- Create: `plugins/claude-snapshot/commands/apply.md`
- Create: `plugins/claude-snapshot/commands/diff.md`
- Create: `plugins/claude-snapshot/commands/inspect.md`

Source repo is at `/Users/adhenawer/Code/claude-snapshot/`.

- [ ] **Step 1: Copy the Node.js core**

```bash
cp /Users/adhenawer/Code/claude-snapshot/src/snapshot.mjs \
   ~/Code/buildwithclaude/plugins/claude-snapshot/src/snapshot.mjs
```

- [ ] **Step 2: Copy commands**

```bash
cp /Users/adhenawer/Code/claude-snapshot/commands/export.md \
   ~/Code/buildwithclaude/plugins/claude-snapshot/commands/export.md

cp /Users/adhenawer/Code/claude-snapshot/commands/apply.md \
   ~/Code/buildwithclaude/plugins/claude-snapshot/commands/apply.md

cp /Users/adhenawer/Code/claude-snapshot/commands/diff.md \
   ~/Code/buildwithclaude/plugins/claude-snapshot/commands/diff.md

cp /Users/adhenawer/Code/claude-snapshot/commands/inspect.md \
   ~/Code/buildwithclaude/plugins/claude-snapshot/commands/inspect.md
```

- [ ] **Step 3: Verify all files are present**

```bash
find ~/Code/buildwithclaude/plugins/claude-snapshot -type f | sort
```

Expected output:
```
plugins/claude-snapshot/.claude-plugin/plugin.json
plugins/claude-snapshot/commands/apply.md
plugins/claude-snapshot/commands/diff.md
plugins/claude-snapshot/commands/export.md
plugins/claude-snapshot/commands/inspect.md
plugins/claude-snapshot/package.json
plugins/claude-snapshot/src/snapshot.mjs
```

- [ ] **Step 4: Commit**

```bash
cd ~/Code/buildwithclaude
git add plugins/claude-snapshot/
git commit -m "feat: add claude-snapshot source and commands"
```

---

## Task 4: Install plugin dependencies and run validation

- [ ] **Step 1: Install plugin's own dependencies**

```bash
cd ~/Code/buildwithclaude/plugins/claude-snapshot
npm install
```

Expected: `tar` package installed under `node_modules/`.

- [ ] **Step 2: Return to repo root and run validation**

```bash
cd ~/Code/buildwithclaude
npm test
```

Expected: all validations pass. If any fail, read the error — likely a missing required field in `plugin.json` or an invalid command frontmatter field.

- [ ] **Step 3: If validation fails — fix plugin.json fields**

Common issues per CONTRIBUTING.md:
- `name` must match directory name exactly: `claude-snapshot` ✓
- `author.url` required ✓ (already included above)
- `keywords` must be an array ✓

Re-run `npm test` after any fix until it passes.

- [ ] **Step 4: Commit validation fix (if any)**

```bash
cd ~/Code/buildwithclaude
git add plugins/claude-snapshot/
git commit -m "fix: pass buildwithclaude plugin validation"
```

---

## Task 5: Push and open the PR

- [ ] **Step 1: Push branch to your fork**

```bash
cd ~/Code/buildwithclaude
git push -u origin add-claude-snapshot
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create \
  --repo davepoon/buildwithclaude \
  --title "Add claude-snapshot plugin" \
  --body "$(cat <<'EOF'
## Summary

- Adds `claude-snapshot` as a standalone plugin bundle (`plugins/claude-snapshot/`)
- Provides 4 slash commands: `/snapshot:export`, `/snapshot:apply`, `/snapshot:diff`, `/snapshot:inspect`
- Self-contained: includes `src/snapshot.mjs` (Node.js 18+) and `tar` dependency so commands work after install

## Component Details

- **Name**: claude-snapshot
- **Type**: Plugin (Commands bundle)
- **Category**: automation-workflow / cross-machine sync
- **Source repo**: https://github.com/adhenawer/claude-snapshot

## Testing

- [ ] Ran validation (`npm test`) — passes
- [ ] Tested functionality locally
- [ ] No overlap with existing components (checked `commands-integration-sync`)

## Examples

```bash
# Install
/plugin install claude-snapshot@buildwithclaude

# Export your setup
/snapshot:export --output ~/Drive/claude-snapshot.tar.gz

# Apply on another machine
/snapshot:apply ~/Drive/claude-snapshot.tar.gz

# Preview without extracting
/snapshot:inspect ~/Drive/claude-snapshot.tar.gz

# Compare snapshot vs current setup
/snapshot:diff ~/Drive/claude-snapshot.tar.gz
```
EOF
)"
```

Expected: PR URL printed to stdout.

---

## Self-review

**Spec coverage:**
- ✅ Fork + branch with correct naming (`add-claude-snapshot`)
- ✅ Plugin manifest meets buildwithclaude requirements (name, version, description, author with URL, repository, license, keywords)
- ✅ Source included so commands work post-install
- ✅ `npm test` validation step
- ✅ PR title/description follows CONTRIBUTING.md format

**Placeholder scan:** None found — all steps contain exact commands.

**Type consistency:** N/A — no type definitions involved.
