# claude-snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that exports/imports portable snapshots of the complete Claude Code setup across machines.

**Architecture:** Plugin with 4 slash commands (`/snapshot:export`, `/snapshot:inspect`, `/snapshot:diff`, `/snapshot:apply`) implemented as markdown skill files. Core logic lives in a Node.js helper script (`snapshot.mjs`) invoked via Bash from the skills. The helper handles tarball creation/extraction, manifest generation, checksums, and path normalization.

**Tech Stack:** Node.js (built-in `fs`, `crypto`, `child_process`, `zlib`, `tar` via npm), Claude Code plugin system (`.claude-plugin/` + skill .md files)

---

## File Structure

```
claude-snapshot/
├── .claude-plugin/
│   ├── plugin.json              # plugin metadata + command registration
│   └── marketplace.json         # GitHub marketplace manifest
├── commands/
│   ├── export.md                # /snapshot:export skill
│   ├── inspect.md               # /snapshot:inspect skill
│   ├── diff.md                  # /snapshot:diff skill
│   └── apply.md                 # /snapshot:apply skill
├── src/
│   └── snapshot.mjs             # core logic (export, inspect, diff, apply)
├── package.json
├── tests/
│   ├── snapshot.test.mjs        # unit tests for core logic
│   └── fixtures/
│       └── fake-claude-home/    # mock ~/.claude/ for testing
│           ├── settings.json
│           ├── CLAUDE.md
│           ├── hooks/
│           │   └── test-hook.sh
│           └── plugins/
│               ├── installed_plugins.json
│               ├── known_marketplaces.json
│               └── blocklist.json
├── README.md
└── LICENSE
```

**Design decisions:**
- `snapshot.mjs` is a single file with all core logic. No premature splitting — 4 commands share types, constants, and helpers. Split only if it exceeds ~500 lines.
- Skill `.md` files are thin wrappers: validate args, call `node snapshot.mjs <subcommand>`, format output.
- `tar` npm package is the only external dependency.

---

### Task 1: Scaffold plugin structure

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `package.json`
- Create: `README.md`
- Create: `LICENSE`

- [ ] **Step 1: Create the project directory and initialize**

```bash
cd /Users/adhenawer/Code
mkdir -p claude-snapshot/.claude-plugin
mkdir -p claude-snapshot/commands
mkdir -p claude-snapshot/src
mkdir -p claude-snapshot/tests/fixtures/fake-claude-home/hooks
mkdir -p claude-snapshot/tests/fixtures/fake-claude-home/plugins
cd claude-snapshot
```

- [ ] **Step 2: Create package.json**

Create `package.json`:

```json
{
  "name": "claude-snapshot",
  "version": "0.1.0",
  "description": "Portable Claude Code setup snapshots — export, diff, and apply your config across machines",
  "type": "module",
  "main": "src/snapshot.mjs",
  "files": ["src/", "commands/", ".claude-plugin/"],
  "scripts": {
    "test": "node --test tests/snapshot.test.mjs"
  },
  "dependencies": {
    "tar": "^7.0.0"
  },
  "keywords": ["claude-code", "plugin", "snapshot", "config", "sync"],
  "license": "MIT"
}
```

- [ ] **Step 3: Create plugin.json**

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "snapshot",
  "version": "0.1.0",
  "description": "Export and apply portable snapshots of your Claude Code setup across machines",
  "author": {
    "name": "Rodolfo Moraes"
  },
  "repository": "https://github.com/adhenawer/claude-snapshot",
  "license": "MIT",
  "commands": [
    "./commands/export.md",
    "./commands/inspect.md",
    "./commands/diff.md",
    "./commands/apply.md"
  ],
  "keywords": ["snapshot", "config", "sync", "backup", "setup"]
}
```

- [ ] **Step 4: Create marketplace.json**

Create `.claude-plugin/marketplace.json`:

```json
{
  "name": "claude-snapshot",
  "owner": {
    "name": "Rodolfo Moraes",
    "email": "adhenawer@msn.com"
  },
  "plugins": [
    {
      "name": "snapshot",
      "source": "./",
      "version": "0.1.0",
      "description": "Export and apply portable snapshots of your Claude Code setup across machines",
      "category": "utilities",
      "tags": ["snapshot", "config", "sync", "backup"]
    }
  ]
}
```

- [ ] **Step 5: Create README.md**

Create `README.md`:

```markdown
# claude-snapshot

Portable Claude Code setup snapshots. Export your config, plugins, hooks, and settings — apply on another machine.

## Install

\`\`\`
/plugin install adhenawer/claude-snapshot
\`\`\`

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
```

- [ ] **Step 6: Create MIT LICENSE file**

Create `LICENSE` with MIT license text, copyright 2026 Rodolfo Moraes.

- [ ] **Step 7: Install dependencies and commit**

```bash
cd /Users/adhenawer/Code/claude-snapshot
npm install
git init
git add -A
git commit -m "scaffold: plugin structure with metadata and README"
```

---

### Task 2: Test fixtures

**Files:**
- Create: `tests/fixtures/fake-claude-home/settings.json`
- Create: `tests/fixtures/fake-claude-home/CLAUDE.md`
- Create: `tests/fixtures/fake-claude-home/RTK.md`
- Create: `tests/fixtures/fake-claude-home/hooks/test-hook.sh`
- Create: `tests/fixtures/fake-claude-home/plugins/installed_plugins.json`
- Create: `tests/fixtures/fake-claude-home/plugins/known_marketplaces.json`
- Create: `tests/fixtures/fake-claude-home/plugins/blocklist.json`

- [ ] **Step 1: Create fake settings.json**

Create `tests/fixtures/fake-claude-home/settings.json`:

```json
{
  "env": {
    "TEST_VAR": "1"
  },
  "permissions": {
    "defaultMode": "bypassPermissions"
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/Users/testuser/.claude/hooks/test-hook.sh"
          }
        ]
      }
    ]
  },
  "statusLine": {
    "type": "command",
    "command": "bash -c 'echo status'"
  },
  "enabledPlugins": {
    "context7@claude-plugins-official": true,
    "claude-hud@claude-hud": true
  },
  "extraKnownMarketplaces": {
    "claude-hud": {
      "source": {
        "source": "github",
        "repo": "jarrodwatts/claude-hud"
      }
    }
  }
}
```

- [ ] **Step 2: Create fake CLAUDE.md and RTK.md**

Create `tests/fixtures/fake-claude-home/CLAUDE.md`:

```markdown
# Test CLAUDE.md
Global instructions for testing.
```

Create `tests/fixtures/fake-claude-home/RTK.md`:

```markdown
# Test RTK
RTK config for testing.
```

- [ ] **Step 3: Create fake hook script**

Create `tests/fixtures/fake-claude-home/hooks/test-hook.sh`:

```bash
#!/bin/bash
echo "test hook"
```

- [ ] **Step 4: Create fake plugin manifests**

Create `tests/fixtures/fake-claude-home/plugins/installed_plugins.json`:

```json
{
  "version": 2,
  "plugins": {
    "context7@claude-plugins-official": [
      {
        "scope": "user",
        "installPath": "/Users/testuser/.claude/plugins/cache/claude-plugins-official/context7/unknown",
        "version": "unknown",
        "installedAt": "2026-03-25T00:16:06.025Z",
        "lastUpdated": "2026-03-26T02:41:56.865Z",
        "gitCommitSha": "abc123"
      }
    ],
    "supabase@claude-plugins-official": [
      {
        "scope": "project",
        "projectPath": "/Users/testuser/Code/myproject",
        "installPath": "/Users/testuser/.claude/plugins/cache/claude-plugins-official/supabase/1.0.0",
        "version": "1.0.0",
        "installedAt": "2026-03-25T00:10:11.704Z",
        "lastUpdated": "2026-03-25T00:10:11.704Z",
        "gitCommitSha": "def456"
      }
    ],
    "claude-hud@claude-hud": [
      {
        "scope": "user",
        "installPath": "/Users/testuser/.claude/plugins/cache/claude-hud/claude-hud/0.0.12",
        "version": "0.0.12",
        "installedAt": "2026-04-15T01:04:48.566Z",
        "lastUpdated": "2026-04-15T01:04:48.566Z",
        "gitCommitSha": "ghi789"
      }
    ]
  }
}
```

Create `tests/fixtures/fake-claude-home/plugins/known_marketplaces.json`:

```json
{
  "claude-hud": {
    "source": {
      "source": "github",
      "repo": "jarrodwatts/claude-hud"
    }
  }
}
```

Create `tests/fixtures/fake-claude-home/plugins/blocklist.json`:

```json
{
  "blocked": []
}
```

- [ ] **Step 5: Commit fixtures**

```bash
git add tests/
git commit -m "test: add fixture data for fake ~/.claude/ home"
```

---

### Task 3: Core logic — collector + manifest generation

**Files:**
- Create: `src/snapshot.mjs`
- Create: `tests/snapshot.test.mjs`

- [ ] **Step 1: Write failing tests for collector and manifest**

Create `tests/snapshot.test.mjs`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, 'fixtures/fake-claude-home');

// We'll import from src/snapshot.mjs once it exists
let collect, buildManifest;

describe('collector', () => {
  it('collects settings.json', async () => {
    const { collect } = await import('../src/snapshot.mjs');
    const result = await collect(FIXTURES);
    assert.ok(result.settings, 'should have settings');
    assert.equal(result.settings.permissions.defaultMode, 'bypassPermissions');
  });

  it('collects global md files', async () => {
    const { collect } = await import('../src/snapshot.mjs');
    const result = await collect(FIXTURES);
    assert.ok(result.globalMd.length === 2, 'should find CLAUDE.md and RTK.md');
    const names = result.globalMd.map(m => m.name).sort();
    assert.deepEqual(names, ['CLAUDE.md', 'RTK.md']);
  });

  it('collects hook scripts', async () => {
    const { collect } = await import('../src/snapshot.mjs');
    const result = await collect(FIXTURES);
    assert.equal(result.hooks.length, 1);
    assert.equal(result.hooks[0].name, 'test-hook.sh');
  });

  it('collects plugin manifests', async () => {
    const { collect } = await import('../src/snapshot.mjs');
    const result = await collect(FIXTURES);
    assert.ok(result.installedPlugins, 'should have installed_plugins.json');
    assert.ok(result.knownMarketplaces, 'should have known_marketplaces.json');
    assert.ok(result.blocklist, 'should have blocklist.json');
  });

  it('filters out project-scoped plugins from manifest', async () => {
    const { collect } = await import('../src/snapshot.mjs');
    const result = await collect(FIXTURES);
    const pluginNames = Object.keys(result.installedPlugins.plugins);
    assert.ok(!pluginNames.includes('supabase@claude-plugins-official'),
      'should exclude project-scoped plugins');
    assert.ok(pluginNames.includes('context7@claude-plugins-official'),
      'should include user-scoped plugins');
  });
});

describe('buildManifest', () => {
  it('generates manifest with plugin list', async () => {
    const { collect, buildManifest } = await import('../src/snapshot.mjs');
    const collected = await collect(FIXTURES);
    const manifest = buildManifest(collected, 'test-machine');
    assert.equal(manifest.version, '1.0.0');
    assert.equal(manifest.exportedFrom, 'test-machine');
    assert.ok(manifest.plugins.length > 0);
    assert.ok(manifest.plugins.every(p => p.scope === 'user'),
      'all plugins should be user-scoped');
  });

  it('generates manifest with marketplace list', async () => {
    const { collect, buildManifest } = await import('../src/snapshot.mjs');
    const collected = await collect(FIXTURES);
    const manifest = buildManifest(collected, 'test-machine');
    assert.ok(manifest.marketplaces.length > 0);
    assert.equal(manifest.marketplaces[0].name, 'claude-hud');
  });

  it('generates checksums for all files', async () => {
    const { collect, buildManifest } = await import('../src/snapshot.mjs');
    const collected = await collect(FIXTURES);
    const manifest = buildManifest(collected, 'test-machine');
    assert.ok(manifest.checksums['settings.json'], 'should have settings checksum');
    assert.ok(manifest.checksums['hooks/test-hook.sh'], 'should have hook checksum');
  });
});

describe('path normalization', () => {
  it('replaces absolute home paths with $HOME', async () => {
    const { normalizePaths } = await import('../src/snapshot.mjs');
    const settings = {
      hooks: {
        PreToolUse: [{
          matcher: 'Bash',
          hooks: [{ type: 'command', command: '/Users/testuser/.claude/hooks/test-hook.sh' }]
        }]
      }
    };
    const normalized = normalizePaths(settings, '/Users/testuser');
    assert.equal(
      normalized.hooks.PreToolUse[0].hooks[0].command,
      '$HOME/.claude/hooks/test-hook.sh'
    );
  });

  it('resolves $HOME paths back to actual home', async () => {
    const { resolvePaths } = await import('../src/snapshot.mjs');
    const settings = {
      hooks: {
        PreToolUse: [{
          matcher: 'Bash',
          hooks: [{ type: 'command', command: '$HOME/.claude/hooks/test-hook.sh' }]
        }]
      }
    };
    const resolved = resolvePaths(settings, '/Users/newuser');
    assert.equal(
      resolved.hooks.PreToolUse[0].hooks[0].command,
      '/Users/newuser/.claude/hooks/test-hook.sh'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/adhenawer/Code/claude-snapshot
npm test
```

Expected: FAIL — `Cannot find module '../src/snapshot.mjs'`

- [ ] **Step 3: Implement collector, buildManifest, and path normalization**

Create `src/snapshot.mjs`:

```javascript
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { homedir, hostname } from 'node:os';

// --- Constants ---

const GLOBAL_MD_PATTERN = /\.md$/;
const SETTINGS_FILE = 'settings.json';
const INSTALLED_PLUGINS = 'plugins/installed_plugins.json';
const KNOWN_MARKETPLACES = 'plugins/known_marketplaces.json';
const BLOCKLIST = 'plugins/blocklist.json';
const HOOKS_DIR = 'hooks';

// Files/dirs that are NOT part of the setup (session data, caches, etc.)
const IGNORE_MD = new Set(['memory']);

// --- Helpers ---

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function readJsonSafe(path) {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// --- Path normalization ---

export function normalizePaths(obj, homeDir) {
  const json = JSON.stringify(obj);
  const escaped = homeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const replaced = json.replace(new RegExp(escaped, 'g'), '$HOME');
  return JSON.parse(replaced);
}

export function resolvePaths(obj, homeDir) {
  const json = JSON.stringify(obj);
  const replaced = json.replace(/\$HOME/g, homeDir);
  return JSON.parse(replaced);
}

// --- Collector ---

export async function collect(claudeHome) {
  // Read settings.json
  const settingsPath = join(claudeHome, SETTINGS_FILE);
  const settings = await readJsonSafe(settingsPath);

  // Collect global .md files (top-level only, skip dirs like memory/)
  const topLevelEntries = await readdir(claudeHome, { withFileTypes: true });
  const globalMd = [];
  for (const entry of topLevelEntries) {
    if (entry.isFile() && GLOBAL_MD_PATTERN.test(entry.name)) {
      const content = await readFile(join(claudeHome, entry.name), 'utf-8');
      globalMd.push({ name: entry.name, content });
    }
  }

  // Collect hook scripts
  const hooks = [];
  const hooksDir = join(claudeHome, HOOKS_DIR);
  if (await fileExists(hooksDir)) {
    const hookEntries = await readdir(hooksDir, { withFileTypes: true });
    for (const entry of hookEntries) {
      if (entry.isFile()) {
        const content = await readFile(join(hooksDir, entry.name), 'utf-8');
        hooks.push({ name: entry.name, content });
      }
    }
  }

  // Collect plugin manifests
  const installedPluginsRaw = await readJsonSafe(join(claudeHome, INSTALLED_PLUGINS));

  // Filter out project-scoped plugins
  let installedPlugins = null;
  if (installedPluginsRaw) {
    const filtered = {};
    for (const [key, entries] of Object.entries(installedPluginsRaw.plugins || {})) {
      const userScoped = entries.filter(e => e.scope === 'user');
      if (userScoped.length > 0) {
        filtered[key] = userScoped;
      }
    }
    installedPlugins = { ...installedPluginsRaw, plugins: filtered };
  }

  const knownMarketplaces = await readJsonSafe(join(claudeHome, KNOWN_MARKETPLACES));
  const blocklist = await readJsonSafe(join(claudeHome, BLOCKLIST));

  return {
    settings,
    globalMd,
    hooks,
    installedPlugins,
    knownMarketplaces,
    blocklist,
  };
}

// --- Manifest builder ---

export function buildManifest(collected, machineName) {
  const { settings, globalMd, hooks, installedPlugins, knownMarketplaces } = collected;

  // Build plugin list from installed_plugins.json
  const plugins = [];
  if (installedPlugins) {
    for (const [key, entries] of Object.entries(installedPlugins.plugins)) {
      const [name, marketplace] = key.split('@');
      const entry = entries[0]; // take first (most recent)
      plugins.push({
        name,
        marketplace,
        version: entry.version,
        scope: entry.scope,
      });
    }
  }

  // Build marketplace list from settings.extraKnownMarketplaces
  const marketplaces = [];
  if (settings?.extraKnownMarketplaces) {
    for (const [name, config] of Object.entries(settings.extraKnownMarketplaces)) {
      marketplaces.push({
        name,
        source: config.source?.source || 'github',
        repo: config.source?.repo || '',
      });
    }
  }

  // Build checksums
  const checksums = {};
  if (settings) {
    checksums['settings.json'] = sha256(JSON.stringify(settings, null, 2));
  }
  for (const md of globalMd) {
    checksums[`global-md/${md.name}`] = sha256(md.content);
  }
  for (const hook of hooks) {
    checksums[`hooks/${hook.name}`] = sha256(hook.content);
  }

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    exportedFrom: machineName || hostname(),
    plugins,
    marketplaces,
    hooks: hooks.map(h => `hooks/${h.name}`),
    globalMd: globalMd.map(m => m.name),
    checksums,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all tests in `collector`, `buildManifest`, and `path normalization` suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/snapshot.mjs tests/snapshot.test.mjs
git commit -m "feat: collector, manifest builder, and path normalization"
```

---

### Task 4: Core logic — tarball export

**Files:**
- Modify: `src/snapshot.mjs`
- Modify: `tests/snapshot.test.mjs`

- [ ] **Step 1: Write failing tests for tarball export**

Append to `tests/snapshot.test.mjs`:

```javascript
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

describe('exportSnapshot', () => {
  let tempDir;

  it('creates a .tar.gz file', async () => {
    const { exportSnapshot } = await import('../src/snapshot.mjs');
    tempDir = await mkdtemp(join(tmpdir(), 'snapshot-test-'));
    const outputPath = join(tempDir, 'test-snapshot.tar.gz');
    await exportSnapshot(FIXTURES, outputPath, { full: false, machineName: 'test' });
    assert.ok(await fileExists(outputPath), 'tarball should exist');
  });

  it('tarball contains manifest.json as first entry', async () => {
    const { exportSnapshot, readManifestFromTar } = await import('../src/snapshot.mjs');
    tempDir = await mkdtemp(join(tmpdir(), 'snapshot-test-'));
    const outputPath = join(tempDir, 'test-snapshot.tar.gz');
    await exportSnapshot(FIXTURES, outputPath, { full: false, machineName: 'test' });
    const manifest = await readManifestFromTar(outputPath);
    assert.ok(manifest, 'should read manifest from tarball');
    assert.equal(manifest.version, '1.0.0');
    assert.equal(manifest.exportedFrom, 'test');
  });

  it('tarball contains settings.json and global MDs', async () => {
    const { exportSnapshot, listTarEntries } = await import('../src/snapshot.mjs');
    tempDir = await mkdtemp(join(tmpdir(), 'snapshot-test-'));
    const outputPath = join(tempDir, 'test-snapshot.tar.gz');
    await exportSnapshot(FIXTURES, outputPath, { full: false, machineName: 'test' });
    const entries = await listTarEntries(outputPath);
    assert.ok(entries.includes('manifest.json'));
    assert.ok(entries.includes('settings.json'));
    assert.ok(entries.includes('global-md/CLAUDE.md'));
    assert.ok(entries.includes('global-md/RTK.md'));
    assert.ok(entries.includes('hooks/test-hook.sh'));
    assert.ok(entries.includes('plugins/installed_plugins.json'));
  });

  // cleanup
  it('cleanup temp', async () => {
    if (tempDir) await rm(tempDir, { recursive: true });
  });
});
```

Also add at the top of the test file (alongside existing imports):

```javascript
import { join } from 'node:path';
```

And add the helper:

```javascript
async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
```

Import `stat` from `node:fs/promises` at the top.

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
npm test
```

Expected: FAIL — `exportSnapshot is not a function`

- [ ] **Step 3: Implement exportSnapshot, readManifestFromTar, listTarEntries**

Append to `src/snapshot.mjs`:

```javascript
import * as tar from 'tar';
import { writeFile, mkdir } from 'node:fs/promises';

// --- Tarball export ---

export async function exportSnapshot(claudeHome, outputPath, options = {}) {
  const { full = false, machineName } = options;
  const collected = await collect(claudeHome);
  const manifest = buildManifest(collected, machineName);

  // Normalize paths in settings
  const normalizedSettings = collected.settings
    ? normalizePaths(collected.settings, claudeHome.replace(/\/.claude\/?$/, '').replace(/\/\.claude\/.*$/, '') || homedir())
    : null;

  // Create temp staging dir
  const stagingDir = join(outputPath + '.staging');
  await mkdir(stagingDir, { recursive: true });

  // Write manifest first
  await writeFile(join(stagingDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Write settings
  if (normalizedSettings) {
    await writeFile(join(stagingDir, 'settings.json'), JSON.stringify(normalizedSettings, null, 2));
  }

  // Write global MDs
  const mdDir = join(stagingDir, 'global-md');
  await mkdir(mdDir, { recursive: true });
  for (const md of collected.globalMd) {
    await writeFile(join(mdDir, md.name), md.content);
  }

  // Write hooks
  const hooksStaging = join(stagingDir, 'hooks');
  await mkdir(hooksStaging, { recursive: true });
  for (const hook of collected.hooks) {
    await writeFile(join(hooksStaging, hook.name), hook.content);
  }

  // Write plugin manifests
  const pluginsStaging = join(stagingDir, 'plugins');
  await mkdir(pluginsStaging, { recursive: true });
  if (collected.installedPlugins) {
    await writeFile(join(pluginsStaging, 'installed_plugins.json'),
      JSON.stringify(collected.installedPlugins, null, 2));
  }
  if (collected.knownMarketplaces) {
    await writeFile(join(pluginsStaging, 'known_marketplaces.json'),
      JSON.stringify(collected.knownMarketplaces, null, 2));
  }
  if (collected.blocklist) {
    await writeFile(join(pluginsStaging, 'blocklist.json'),
      JSON.stringify(collected.blocklist, null, 2));
  }

  // Create tarball
  await tar.create(
    { gzip: true, file: outputPath, cwd: stagingDir },
    ['manifest.json', 'settings.json', 'global-md', 'hooks', 'plugins']
  );

  // Clean up staging
  await rm(stagingDir, { recursive: true });

  return manifest;
}

// --- Tarball reading ---

export async function readManifestFromTar(tarPath) {
  let manifestContent = '';
  await tar.list({
    file: tarPath,
    onReadEntry(entry) {
      if (entry.path === 'manifest.json') {
        const chunks = [];
        entry.on('data', chunk => chunks.push(chunk));
        entry.on('end', () => {
          manifestContent = Buffer.concat(chunks).toString('utf-8');
        });
      }
    }
  });
  return manifestContent ? JSON.parse(manifestContent) : null;
}

export async function listTarEntries(tarPath) {
  const entries = [];
  await tar.list({
    file: tarPath,
    onReadEntry(entry) {
      // Normalize: remove trailing slashes for dirs
      const p = entry.path.replace(/\/$/, '');
      if (p) entries.push(p);
    }
  });
  return entries;
}
```

Also add `rm` to the `import { readFile, readdir, stat }` line at the top:

```javascript
import { readFile, readdir, stat, writeFile, mkdir, rm } from 'node:fs/promises';
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/snapshot.mjs tests/snapshot.test.mjs
git commit -m "feat: tarball export with manifest, settings, MDs, hooks, plugins"
```

---

### Task 5: Core logic — diff (reconciler)

**Files:**
- Modify: `src/snapshot.mjs`
- Modify: `tests/snapshot.test.mjs`

- [ ] **Step 1: Write failing tests for diff**

Append to `tests/snapshot.test.mjs`:

```javascript
describe('diffSnapshot', () => {
  it('detects missing plugins', async () => {
    const { diffSnapshot } = await import('../src/snapshot.mjs');
    const manifest = {
      plugins: [
        { name: 'superpowers', marketplace: 'claude-plugins-official', version: '5.0.7', scope: 'user' },
        { name: 'context7', marketplace: 'claude-plugins-official', version: 'unknown', scope: 'user' },
      ],
      marketplaces: [],
      hooks: [],
      globalMd: ['CLAUDE.md'],
      checksums: {},
    };
    // FIXTURES has context7 and claude-hud, not superpowers
    const diff = await diffSnapshot(manifest, FIXTURES);
    assert.ok(diff.plugins.added.some(p => p.name === 'superpowers'), 'superpowers should be added');
    assert.ok(diff.plugins.matched.some(p => p.name === 'context7'), 'context7 should match');
  });

  it('detects missing hooks', async () => {
    const { diffSnapshot } = await import('../src/snapshot.mjs');
    const manifest = {
      plugins: [],
      marketplaces: [],
      hooks: ['hooks/test-hook.sh', 'hooks/missing-hook.sh'],
      globalMd: [],
      checksums: {},
    };
    const diff = await diffSnapshot(manifest, FIXTURES);
    assert.ok(diff.hooks.matched.includes('test-hook.sh'), 'test-hook should match');
    assert.ok(diff.hooks.added.includes('missing-hook.sh'), 'missing-hook should be added');
  });

  it('detects missing global MDs', async () => {
    const { diffSnapshot } = await import('../src/snapshot.mjs');
    const manifest = {
      plugins: [],
      marketplaces: [],
      hooks: [],
      globalMd: ['CLAUDE.md', 'NEWFILE.md'],
      checksums: {},
    };
    const diff = await diffSnapshot(manifest, FIXTURES);
    assert.ok(diff.globalMd.matched.includes('CLAUDE.md'));
    assert.ok(diff.globalMd.added.includes('NEWFILE.md'));
  });

  it('detects checksum mismatches', async () => {
    const { diffSnapshot } = await import('../src/snapshot.mjs');
    const manifest = {
      plugins: [],
      marketplaces: [],
      hooks: [],
      globalMd: ['CLAUDE.md'],
      checksums: {
        'global-md/CLAUDE.md': 'wrong-checksum',
      },
    };
    const diff = await diffSnapshot(manifest, FIXTURES);
    assert.ok(diff.globalMd.changed.includes('CLAUDE.md'), 'CLAUDE.md should show as changed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `diffSnapshot is not a function`

- [ ] **Step 3: Implement diffSnapshot**

Append to `src/snapshot.mjs`:

```javascript
// --- Diff / Reconciler ---

export async function diffSnapshot(manifest, claudeHome) {
  const local = await collect(claudeHome);

  // Diff plugins
  const localPluginKeys = local.installedPlugins
    ? new Set(Object.keys(local.installedPlugins.plugins))
    : new Set();

  const pluginDiff = { added: [], matched: [], versionMismatch: [] };
  for (const p of manifest.plugins) {
    const key = `${p.name}@${p.marketplace}`;
    if (!localPluginKeys.has(key)) {
      pluginDiff.added.push(p);
    } else {
      const localEntry = local.installedPlugins.plugins[key][0];
      if (localEntry.version !== p.version) {
        pluginDiff.versionMismatch.push({
          ...p,
          localVersion: localEntry.version,
        });
      } else {
        pluginDiff.matched.push(p);
      }
    }
  }

  // Diff hooks
  const localHookNames = new Set(local.hooks.map(h => h.name));
  const hookDiff = { added: [], matched: [] };
  for (const hookPath of manifest.hooks) {
    const name = hookPath.replace('hooks/', '');
    if (localHookNames.has(name)) {
      hookDiff.matched.push(name);
    } else {
      hookDiff.added.push(name);
    }
  }

  // Diff global MDs
  const localMdNames = new Set(local.globalMd.map(m => m.name));
  const mdDiff = { added: [], matched: [], changed: [] };
  for (const mdName of manifest.globalMd) {
    if (!localMdNames.has(mdName)) {
      mdDiff.added.push(mdName);
    } else {
      // Check checksum if available
      const checksumKey = `global-md/${mdName}`;
      if (manifest.checksums[checksumKey]) {
        const localMd = local.globalMd.find(m => m.name === mdName);
        const localChecksum = sha256(localMd.content);
        if (localChecksum !== manifest.checksums[checksumKey]) {
          mdDiff.changed.push(mdName);
        } else {
          mdDiff.matched.push(mdName);
        }
      } else {
        mdDiff.matched.push(mdName);
      }
    }
  }

  // Diff settings keys (shallow comparison of top-level keys)
  const settingsDiff = { added: [], changed: [], matched: [] };
  if (manifest.checksums['settings.json'] && local.settings) {
    const localChecksum = sha256(JSON.stringify(local.settings, null, 2));
    if (localChecksum !== manifest.checksums['settings.json']) {
      settingsDiff.changed.push('settings.json');
    } else {
      settingsDiff.matched.push('settings.json');
    }
  }

  return {
    plugins: pluginDiff,
    hooks: hookDiff,
    globalMd: mdDiff,
    settings: settingsDiff,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/snapshot.mjs tests/snapshot.test.mjs
git commit -m "feat: diff/reconciler compares snapshot manifest vs local setup"
```

---

### Task 6: Core logic — apply

**Files:**
- Modify: `src/snapshot.mjs`
- Modify: `tests/snapshot.test.mjs`

- [ ] **Step 1: Write failing tests for apply**

Append to `tests/snapshot.test.mjs`:

```javascript
import { cp } from 'node:fs/promises';

describe('applySnapshot', () => {
  let tempDir;
  let targetHome;

  it('extracts tarball and writes files to target claude home', async () => {
    const { exportSnapshot, applySnapshot } = await import('../src/snapshot.mjs');

    // Create snapshot from fixtures
    tempDir = await mkdtemp(join(tmpdir(), 'snapshot-apply-'));
    const tarPath = join(tempDir, 'snapshot.tar.gz');
    await exportSnapshot(FIXTURES, tarPath, { full: false, machineName: 'test' });

    // Create empty target
    targetHome = join(tempDir, 'target-claude');
    await mkdir(targetHome, { recursive: true });
    await mkdir(join(targetHome, 'plugins'), { recursive: true });
    // Write an empty installed_plugins to simulate fresh install
    await writeFile(join(targetHome, 'plugins/installed_plugins.json'),
      JSON.stringify({ version: 2, plugins: {} }));
    await writeFile(join(targetHome, SETTINGS_FILE), '{}');

    // Apply (skipInstall: true to avoid calling claude CLI in tests)
    await applySnapshot(tarPath, targetHome, { skipInstall: true });

    // Verify files were written
    const targetSettings = await readJsonSafe(join(targetHome, 'settings.json'));
    assert.ok(targetSettings.env, 'settings should have env');

    const targetMd = await readFile(join(targetHome, 'CLAUDE.md'), 'utf-8');
    assert.ok(targetMd.includes('Test CLAUDE.md'), 'CLAUDE.md should be copied');

    const targetHook = await readFile(join(targetHome, 'hooks/test-hook.sh'), 'utf-8');
    assert.ok(targetHook.includes('test hook'), 'hook should be copied');
  });

  it('creates .bak backup of existing conflicting files', async () => {
    const { exportSnapshot, applySnapshot } = await import('../src/snapshot.mjs');

    tempDir = await mkdtemp(join(tmpdir(), 'snapshot-backup-'));
    const tarPath = join(tempDir, 'snapshot.tar.gz');
    await exportSnapshot(FIXTURES, tarPath, { full: false, machineName: 'test' });

    targetHome = join(tempDir, 'target-claude');
    await mkdir(targetHome, { recursive: true });
    await mkdir(join(targetHome, 'plugins'), { recursive: true });
    await writeFile(join(targetHome, 'plugins/installed_plugins.json'),
      JSON.stringify({ version: 2, plugins: {} }));

    // Write existing CLAUDE.md with different content
    await writeFile(join(targetHome, 'CLAUDE.md'), 'existing content');
    await writeFile(join(targetHome, 'settings.json'), '{"existing": true}');

    await applySnapshot(tarPath, targetHome, { skipInstall: true });

    // Check backup was created
    const backup = await readFile(join(targetHome, 'CLAUDE.md.bak'), 'utf-8');
    assert.equal(backup, 'existing content', 'should backup original');
  });

  it('cleanup', async () => {
    if (tempDir) await rm(tempDir, { recursive: true });
  });
});
```

Add `writeFile` import from `node:fs/promises` at top of test file. Also import `SETTINGS_FILE` or just use the string `'settings.json'`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `applySnapshot is not a function`

- [ ] **Step 3: Implement applySnapshot**

Append to `src/snapshot.mjs`:

```javascript
import { copyFile, rename } from 'node:fs/promises';

// --- Apply ---

export async function applySnapshot(tarPath, claudeHome, options = {}) {
  const { skipInstall = false } = options;
  const actualHome = claudeHome.replace(/\/.claude\/?$/, '') || homedir();

  // Extract tarball to temp staging dir
  const stagingDir = tarPath + '.apply-staging';
  await mkdir(stagingDir, { recursive: true });
  await tar.extract({ file: tarPath, cwd: stagingDir });

  // Read manifest
  const manifest = JSON.parse(
    await readFile(join(stagingDir, 'manifest.json'), 'utf-8')
  );

  // Helper: backup existing file before overwriting
  async function backupAndWrite(targetPath, content) {
    if (await fileExists(targetPath)) {
      const existing = await readFile(targetPath, 'utf-8');
      if (existing !== content) {
        await writeFile(targetPath + '.bak', existing);
      }
    }
    const dir = targetPath.substring(0, targetPath.lastIndexOf('/'));
    await mkdir(dir, { recursive: true });
    await writeFile(targetPath, content);
  }

  // Apply settings.json (resolve $HOME paths)
  const settingsStaging = join(stagingDir, 'settings.json');
  if (await fileExists(settingsStaging)) {
    const raw = JSON.parse(await readFile(settingsStaging, 'utf-8'));
    const resolved = resolvePaths(raw, actualHome);
    await backupAndWrite(
      join(claudeHome, 'settings.json'),
      JSON.stringify(resolved, null, 2)
    );
  }

  // Apply global MDs
  const mdDir = join(stagingDir, 'global-md');
  if (await fileExists(mdDir)) {
    const mdFiles = await readdir(mdDir);
    for (const name of mdFiles) {
      const content = await readFile(join(mdDir, name), 'utf-8');
      await backupAndWrite(join(claudeHome, name), content);
    }
  }

  // Apply hooks
  const hooksStaging = join(stagingDir, 'hooks');
  if (await fileExists(hooksStaging)) {
    const hookFiles = await readdir(hooksStaging);
    for (const name of hookFiles) {
      const content = await readFile(join(hooksStaging, name), 'utf-8');
      const targetPath = join(claudeHome, 'hooks', name);
      await backupAndWrite(targetPath, content);
      // Make hook executable
      const { chmod } = await import('node:fs/promises');
      await chmod(targetPath, 0o755);
    }
  }

  // Apply plugin manifests
  const pluginsStaging = join(stagingDir, 'plugins');
  if (await fileExists(pluginsStaging)) {
    const pluginFiles = await readdir(pluginsStaging);
    for (const name of pluginFiles) {
      const content = await readFile(join(pluginsStaging, name), 'utf-8');
      await backupAndWrite(join(claudeHome, 'plugins', name), content);
    }
  }

  // Install plugins via claude CLI (unless skipped for tests)
  if (!skipInstall && manifest.plugins.length > 0) {
    const { execSync } = await import('node:child_process');
    for (const plugin of manifest.plugins) {
      const pluginId = `${plugin.name}@${plugin.marketplace}`;
      try {
        execSync(`claude plugin add ${pluginId}`, { stdio: 'inherit' });
      } catch (e) {
        console.error(`Warning: failed to install ${pluginId}: ${e.message}`);
      }
    }
  }

  // Clean up staging
  await rm(stagingDir, { recursive: true });

  return manifest;
}
```

Update the imports at the top of `src/snapshot.mjs` — consolidate all `fs/promises` imports into one line:

```javascript
import { readFile, readdir, stat, writeFile, mkdir, rm, chmod, copyFile } from 'node:fs/promises';
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/snapshot.mjs tests/snapshot.test.mjs
git commit -m "feat: apply snapshot with backup, path resolution, and plugin install"
```

---

### Task 7: Core logic — CLI entry point

**Files:**
- Modify: `src/snapshot.mjs`

- [ ] **Step 1: Add CLI entry point to snapshot.mjs**

Append to `src/snapshot.mjs`:

```javascript
// --- CLI entry point ---
// Called from skill .md files via: node src/snapshot.mjs <command> [args]

async function cli() {
  const [,, command, ...args] = process.argv;

  const claudeHome = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');

  switch (command) {
    case 'export': {
      const full = args.includes('--full');
      const outputIdx = args.indexOf('--output');
      const dateSuffix = new Date().toISOString().slice(0, 10);
      const defaultName = `claude-snapshot-${dateSuffix}${full ? '-full' : ''}.tar.gz`;
      const outputPath = outputIdx !== -1
        ? resolve(args[outputIdx + 1])
        : join(homedir(), defaultName);
      const manifest = await exportSnapshot(claudeHome, outputPath, { full });
      console.log(JSON.stringify({
        status: 'ok',
        path: outputPath,
        plugins: manifest.plugins.length,
        hooks: manifest.hooks.length,
        globalMd: manifest.globalMd.length,
        marketplaces: manifest.marketplaces.length,
        full,
      }));
      break;
    }

    case 'inspect': {
      const tarPath = resolve(args[0]);
      const manifest = await readManifestFromTar(tarPath);
      console.log(JSON.stringify({ status: 'ok', manifest }));
      break;
    }

    case 'diff': {
      const tarPath = resolve(args[0]);
      const manifest = await readManifestFromTar(tarPath);
      const diff = await diffSnapshot(manifest, claudeHome);
      console.log(JSON.stringify({ status: 'ok', diff, manifest }));
      break;
    }

    case 'apply': {
      const tarPath = resolve(args[0]);
      const manifest = await applySnapshot(tarPath, claudeHome);
      console.log(JSON.stringify({ status: 'ok', manifest }));
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Usage: snapshot.mjs <export|inspect|diff|apply> [args]');
      process.exit(1);
  }
}

// Only run CLI if this is the main module
if (process.argv[1]?.endsWith('snapshot.mjs')) {
  cli().catch(err => {
    console.error(JSON.stringify({ status: 'error', message: err.message }));
    process.exit(1);
  });
}
```

- [ ] **Step 2: Quick manual test**

```bash
cd /Users/adhenawer/Code/claude-snapshot
node src/snapshot.mjs export --output /tmp/test-snapshot.tar.gz
```

Expected: JSON output with `status: ok` and tarball at `/tmp/test-snapshot.tar.gz`.

```bash
node src/snapshot.mjs inspect /tmp/test-snapshot.tar.gz
```

Expected: JSON with manifest contents.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests still PASS (CLI code is additive, doesn't break existing exports).

- [ ] **Step 4: Commit**

```bash
git add src/snapshot.mjs
git commit -m "feat: CLI entry point for export, inspect, diff, apply"
```

---

### Task 8: Skill files (slash commands)

**Files:**
- Create: `commands/export.md`
- Create: `commands/inspect.md`
- Create: `commands/diff.md`
- Create: `commands/apply.md`

- [ ] **Step 1: Create export command**

Create `commands/export.md`:

````markdown
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

1. Determine the plugin install path relative to this skill file
2. Run the export via the core script
3. Report results to the user

```bash
PLUGIN_DIR="$(dirname "$(dirname "$(realpath "$0")")")"
RESULT=$(node "${PLUGIN_DIR}/src/snapshot.mjs" export $ARGS 2>&1)
echo "$RESULT"
```

Parse the JSON result and report:
- Number of plugins, hooks, MDs, and marketplaces included
- Output file path and size
- Whether it was a slim or full export

If `--full` was passed, warn that the file may be large (>50MB) due to plugin caches.
````

- [ ] **Step 2: Create inspect command**

Create `commands/inspect.md`:

````markdown
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
PLUGIN_DIR="$(dirname "$(dirname "$(realpath "$0")")")"
node "${PLUGIN_DIR}/src/snapshot.mjs" inspect "$SNAPSHOT_PATH"
```

3. Parse the JSON manifest and present a readable summary:
   - Export date and source machine
   - Plugin list with versions
   - Marketplace registrations
   - Hook scripts
   - Global MD files
   - Whether it's a slim or full snapshot
````

- [ ] **Step 3: Create diff command**

Create `commands/diff.md`:

````markdown
---
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
PLUGIN_DIR="$(dirname "$(dirname "$(realpath "$0")")")"
node "${PLUGIN_DIR}/src/snapshot.mjs" diff "$SNAPSHOT_PATH"
```

3. Parse the JSON diff result and present as a readable report:

**Format:**
```
Plugins:
  + plugin-name@version        (missing locally)
  ~ plugin-name local → snapshot  (version mismatch)
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
```

Use `+` for additions, `~` for changes, `=` for matches.
````

- [ ] **Step 4: Create apply command**

Create `commands/apply.md`:

````markdown
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
PLUGIN_DIR="$(dirname "$(dirname "$(realpath "$0")")")"
node "${PLUGIN_DIR}/src/snapshot.mjs" diff "$SNAPSHOT_PATH"
```

3. Present the diff summary and ask for confirmation:
   > "The following changes will be applied: [summary]. Existing files with conflicts will be backed up as `.bak`. Apply all? (y/n)"

4. If confirmed, run apply:

```bash
PLUGIN_DIR="$(dirname "$(dirname "$(realpath "$0")")")"
node "${PLUGIN_DIR}/src/snapshot.mjs" apply "$SNAPSHOT_PATH"
```

5. Report results:
   - Files written/overwritten
   - Backups created
   - Plugins installed (or failed)
   - Any warnings (e.g., runtime path differences)

6. **Important:** Warn the user to restart Claude Code for changes to take effect.
````

- [ ] **Step 5: Commit**

```bash
git add commands/
git commit -m "feat: slash command skill files for export, inspect, diff, apply"
```

---

### Task 9: Integration test — full round-trip

**Files:**
- Modify: `tests/snapshot.test.mjs`

- [ ] **Step 1: Write round-trip integration test**

Append to `tests/snapshot.test.mjs`:

```javascript
describe('round-trip: export → inspect → diff → apply', () => {
  let tempDir;

  it('exports from fixtures, applies to empty target, result matches', async () => {
    const {
      exportSnapshot, readManifestFromTar, diffSnapshot, applySnapshot, collect
    } = await import('../src/snapshot.mjs');

    tempDir = await mkdtemp(join(tmpdir(), 'snapshot-roundtrip-'));
    const tarPath = join(tempDir, 'roundtrip.tar.gz');

    // 1. Export from fixtures
    const exportManifest = await exportSnapshot(FIXTURES, tarPath, { machineName: 'source' });
    assert.equal(exportManifest.exportedFrom, 'source');

    // 2. Inspect
    const inspectManifest = await readManifestFromTar(tarPath);
    assert.equal(inspectManifest.exportedFrom, 'source');
    assert.deepEqual(inspectManifest.plugins.length, exportManifest.plugins.length);

    // 3. Create empty target and apply
    const targetHome = join(tempDir, 'target');
    await mkdir(targetHome, { recursive: true });
    await mkdir(join(targetHome, 'plugins'), { recursive: true });
    await writeFile(join(targetHome, 'plugins/installed_plugins.json'),
      JSON.stringify({ version: 2, plugins: {} }));
    await writeFile(join(targetHome, 'settings.json'), '{}');

    await applySnapshot(tarPath, targetHome, { skipInstall: true });

    // 4. Collect from target and verify key artifacts exist
    const targetCollected = await collect(targetHome);
    assert.ok(targetCollected.settings.env, 'target should have env from snapshot');
    assert.ok(targetCollected.globalMd.length >= 2, 'target should have CLAUDE.md + RTK.md');
    assert.ok(targetCollected.hooks.length >= 1, 'target should have hook');

    // 5. Diff should show everything as matched (no additions needed)
    const diff = await diffSnapshot(inspectManifest, targetHome);
    assert.equal(diff.plugins.added.length, 0, 'no plugins should be missing after apply');
    assert.equal(diff.hooks.added.length, 0, 'no hooks should be missing after apply');
    assert.equal(diff.globalMd.added.length, 0, 'no MDs should be missing after apply');
  });

  it('cleanup', async () => {
    if (tempDir) await rm(tempDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: all tests PASS, including the round-trip test.

- [ ] **Step 3: Commit**

```bash
git add tests/snapshot.test.mjs
git commit -m "test: round-trip integration test (export → inspect → diff → apply)"
```

---

### Task 10: Final polish and publish prep

**Files:**
- Modify: `package.json` (verify fields)
- Create: `.gitignore`

- [ ] **Step 1: Create .gitignore**

Create `.gitignore`:

```
node_modules/
dist/
*.tar.gz
*.staging/
.DS_Store
```

- [ ] **Step 2: Run full test suite one final time**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: add .gitignore"
```

- [ ] **Step 4: Create GitHub repo and push**

```bash
gh repo create adhenawer/claude-snapshot --public --description "Portable Claude Code setup snapshots — export, diff, and apply your config across machines" --source . --push
```

- [ ] **Step 5: Tag v0.1.0**

```bash
git tag v0.1.0
git push origin v0.1.0
```

- [ ] **Step 6: Test install as plugin**

From a separate terminal or session:
```
/plugin install adhenawer/claude-snapshot
```

Verify the 4 slash commands appear: `/snapshot:export`, `/snapshot:inspect`, `/snapshot:diff`, `/snapshot:apply`.
