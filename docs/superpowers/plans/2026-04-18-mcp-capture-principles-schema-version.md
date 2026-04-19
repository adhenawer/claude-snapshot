# MCP Capture + Schema Version + Principles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v0.2 of claude-snapshot with three additions: capture of MCP servers into the tarball, a formal `schemaVersion` field in the manifest, and an explicit Principles section in the README.

**Architecture:** MCP server configs live in `~/.claude.json` (outside `~/.claude/`) under the `mcpServers` key. Export reads only that key, classifies each server's install method from its `command` field (`npm`/`pip`/`binary`/`manual`), path-normalizes, writes `mcp-servers.json` to the tarball root, and records identity + method + checksum in the manifest. Diff reports added/changed/removed servers. Apply in v0.2 *reports* missing/changed MCPs (install method tells the user what to run) but does NOT auto-write `~/.claude.json` — that key also holds OAuth tokens and project state, so write-through is deferred to v0.3 behind a `--with-mcp` flag. The manifest gains `schemaVersion: '1.0.0'` (rename of the existing `version` field); reads accept both `schemaVersion` and legacy `version` for v0.1 compat, but reject major-version mismatches. README gains an explicit P1–P5 principles block.

**Tech Stack:** Node.js 18+ ESM, `tar@^7.0.0`, `node:test`, `node:crypto`, `node:fs/promises`. No new dependencies.

---

## File Structure

**Files to modify:**
- `src/snapshot.mjs` — add `CLAUDE_JSON_REL`, `SCHEMA_VERSION`, `SUPPORTED_SCHEMA_MAJOR` constants; add `classifyMcpMethod()`, `collectMcpServers()`; extend `collect()`, `buildManifest()`, `exportSnapshot()`, `readManifestFromTar()` (to validate schema), `diffSnapshot()`, `applySnapshot()`; rename manifest field `version` → `schemaVersion`.
- `tests/snapshot.test.mjs` — update two existing assertions checking `manifest.version`; add MCP + schema version suites.
- `tests/fixtures/.claude.json` — **new** fixture file next to `fake-claude-home/`.
- `commands/inspect.md` — surface `schemaVersion` and MCP count in skill output.
- `commands/diff.md` — surface MCP diff categories.
- `commands/apply.md` — surface MCP report + warn user what they need to install.
- `README.md` — add Principles section, MCP line in "What migrates", schema note in anatomy, updated mermaid diagram.
- `docs/DESIGN.md` — add three new Architecture Decisions (AD7: MCP scope, AD8: schemaVersion, AD9: report-not-write for MCPs).

**Files unchanged:** `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `package.json`, `commands/export.md` (no UX change needed — export is opaque).

---

## Task 1: Rename `version` → `schemaVersion` in manifest

**Files:**
- Modify: `src/snapshot.mjs:7-14` (add constant), `src/snapshot.mjs:158-167` (buildManifest return)
- Modify: `tests/snapshot.test.mjs:80` (buildManifest test), `tests/snapshot.test.mjs:165` (export test)

- [ ] **Step 1: Update tests to assert new field name (failing)**

Edit `tests/snapshot.test.mjs:80` — change:
```js
    assert.equal(manifest.version, '1.0.0');
```
to:
```js
    assert.equal(manifest.schemaVersion, '1.0.0');
```

Edit `tests/snapshot.test.mjs:165` — change:
```js
      assert.equal(manifest.version, '1.0.0');
```
to:
```js
      assert.equal(manifest.schemaVersion, '1.0.0');
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/snapshot.test.mjs 2>&1 | grep -E "(fail|pass)" | head -20`
Expected: two failures in `buildManifest > generates manifest with plugin list` and `exportSnapshot > tarball contains manifest.json as first entry`, reporting `manifest.schemaVersion === '1.0.0'` but got `undefined`.

- [ ] **Step 3: Add constants and rename field in buildManifest**

Edit `src/snapshot.mjs:7-14` — add after line `const GLOBAL_MD_PATTERN = /\.md$/;`:
```js
const SCHEMA_VERSION = '1.0.0';
const SUPPORTED_SCHEMA_MAJOR = 1;
```

Edit `src/snapshot.mjs:158-167` — in `buildManifest`, change the return object's first line:
```js
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
```

(Replace the existing `version: '1.0.0',` line with `schemaVersion: SCHEMA_VERSION,`.)

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/snapshot.test.mjs 2>&1 | tail -20`
Expected: all tests pass (20/20 or whatever current count).

- [ ] **Step 5: Commit**

```bash
git add src/snapshot.mjs tests/snapshot.test.mjs
git commit -m "refactor: rename manifest.version to manifest.schemaVersion

Clarifies that the field describes the manifest schema format, not
the plugin version. Introduces SCHEMA_VERSION and SUPPORTED_SCHEMA_MAJOR
constants for forward-looking migration support.
"
```

---

## Task 2: Validate `schemaVersion` on tarball read (with v0.1 compat)

**Files:**
- Modify: `src/snapshot.mjs:254-269` (readManifestFromTar)
- Modify: `tests/snapshot.test.mjs` — add new `describe('schema version validation', ...)` block

- [ ] **Step 1: Write failing test for current-version acceptance**

Append to `tests/snapshot.test.mjs` (before the round-trip describe block):
```js
// --- Schema version validation tests ---

describe('schema version validation', () => {
  it('accepts tarballs with matching schemaVersion', async () => {
    const { exportSnapshot, readManifestFromTar } = await import('../src/snapshot.mjs');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-schema-'));
    try {
      const outputPath = join(tempDir, 'snap.tar.gz');
      await exportSnapshot(FIXTURES, outputPath, { machineName: 'test' });
      const manifest = await readManifestFromTar(outputPath);
      assert.equal(manifest.schemaVersion, '1.0.0');
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it('accepts legacy manifests with version field (v0.1 compat)', async () => {
    const { readManifestFromTar } = await import('../src/snapshot.mjs');
    const tar = await import('tar');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-legacy-'));
    try {
      const stagingDir = join(tempDir, 'staging');
      await mkdir(stagingDir, { recursive: true });
      const legacyManifest = {
        version: '1.0.0',
        exportedAt: '2025-01-01T00:00:00.000Z',
        exportedFrom: 'legacy-machine',
        plugins: [], marketplaces: [], hooks: [], globalMd: [], checksums: {},
      };
      await writeFile(join(stagingDir, 'manifest.json'), JSON.stringify(legacyManifest));
      const tarPath = join(tempDir, 'legacy.tar.gz');
      await tar.create({ gzip: true, file: tarPath, cwd: stagingDir }, ['manifest.json']);
      const manifest = await readManifestFromTar(tarPath);
      assert.equal(manifest.schemaVersion, '1.0.0',
        'legacy version field should be normalized to schemaVersion');
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it('rejects tarballs with unsupported major schemaVersion', async () => {
    const { readManifestFromTar } = await import('../src/snapshot.mjs');
    const tar = await import('tar');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-future-'));
    try {
      const stagingDir = join(tempDir, 'staging');
      await mkdir(stagingDir, { recursive: true });
      const futureManifest = {
        schemaVersion: '99.0.0',
        exportedAt: '2099-01-01T00:00:00.000Z',
        exportedFrom: 'future-machine',
        plugins: [], marketplaces: [], hooks: [], globalMd: [], checksums: {},
      };
      await writeFile(join(stagingDir, 'manifest.json'), JSON.stringify(futureManifest));
      const tarPath = join(tempDir, 'future.tar.gz');
      await tar.create({ gzip: true, file: tarPath, cwd: stagingDir }, ['manifest.json']);
      await assert.rejects(
        readManifestFromTar(tarPath),
        /unsupported schemaVersion/i
      );
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/snapshot.test.mjs 2>&1 | grep -E "schema" | head -20`
Expected: "accepts legacy manifests" and "rejects tarballs with unsupported" both fail (the first because returned manifest has no `schemaVersion`, the second because no rejection is thrown).

- [ ] **Step 3: Implement validation in readManifestFromTar**

Replace `src/snapshot.mjs:254-269` (the existing `readManifestFromTar`) with:
```js
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
  if (!manifestContent) return null;
  const raw = JSON.parse(manifestContent);

  // Backward compat: v0.1 tarballs used `version` instead of `schemaVersion`
  if (!raw.schemaVersion && raw.version) {
    raw.schemaVersion = raw.version;
  }
  if (!raw.schemaVersion) {
    throw new Error('Invalid snapshot: manifest has no schemaVersion field');
  }
  const major = parseInt(raw.schemaVersion.split('.')[0], 10);
  if (major !== SUPPORTED_SCHEMA_MAJOR) {
    throw new Error(
      `Unsupported schemaVersion ${raw.schemaVersion}: this claude-snapshot ` +
      `supports major version ${SUPPORTED_SCHEMA_MAJOR}. Upgrade claude-snapshot or re-export.`
    );
  }
  return raw;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/snapshot.test.mjs 2>&1 | tail -20`
Expected: all schema validation tests pass, all previous tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/snapshot.mjs tests/snapshot.test.mjs
git commit -m "feat: validate schemaVersion on tarball read with v0.1 compat

readManifestFromTar now normalizes legacy 'version' to 'schemaVersion'
and rejects major-version mismatches with an actionable error message.
"
```

---

## Task 3: MCP install-method classifier (pure function)

**Files:**
- Modify: `src/snapshot.mjs` — add `classifyMcpMethod()` after the path-normalization block (around line 53).
- Modify: `tests/snapshot.test.mjs` — add new `describe('classifyMcpMethod', ...)` block.

- [ ] **Step 1: Write failing tests for the classifier**

Append to `tests/snapshot.test.mjs` (after the `path normalization` describe block, before `exportSnapshot`):
```js
// --- MCP classifier tests ---

describe('classifyMcpMethod', () => {
  it('classifies npx as npm', async () => {
    const { classifyMcpMethod } = await import('../src/snapshot.mjs');
    assert.equal(classifyMcpMethod({ command: 'npx', args: ['-y', '@anthropic/mcp-filesystem'] }), 'npm');
  });

  it('classifies uvx as pip', async () => {
    const { classifyMcpMethod } = await import('../src/snapshot.mjs');
    assert.equal(classifyMcpMethod({ command: 'uvx', args: ['mcp-server-git'] }), 'pip');
  });

  it('classifies uv as pip', async () => {
    const { classifyMcpMethod } = await import('../src/snapshot.mjs');
    assert.equal(classifyMcpMethod({ command: 'uv', args: ['run', 'mcp-server'] }), 'pip');
  });

  it('classifies absolute path as binary', async () => {
    const { classifyMcpMethod } = await import('../src/snapshot.mjs');
    assert.equal(classifyMcpMethod({ command: '/usr/local/bin/my-mcp' }), 'binary');
  });

  it('classifies node command as binary', async () => {
    const { classifyMcpMethod } = await import('../src/snapshot.mjs');
    assert.equal(classifyMcpMethod({ command: 'node', args: ['/path/to/server.js'] }), 'binary');
  });

  it('classifies unknown command as manual', async () => {
    const { classifyMcpMethod } = await import('../src/snapshot.mjs');
    assert.equal(classifyMcpMethod({ command: 'my-custom-runner' }), 'manual');
  });

  it('classifies missing command as manual', async () => {
    const { classifyMcpMethod } = await import('../src/snapshot.mjs');
    assert.equal(classifyMcpMethod({}), 'manual');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/snapshot.test.mjs 2>&1 | grep -E "classifyMcpMethod|fail" | head -20`
Expected: 7 failures — `classifyMcpMethod` is not an export of `src/snapshot.mjs`.

- [ ] **Step 3: Implement classifier**

Insert in `src/snapshot.mjs` after the `resolvePaths` function (currently ending at line 53):
```js
// --- MCP server classification ---

export function classifyMcpMethod(server) {
  const command = server?.command;
  if (!command) return 'manual';
  if (command === 'npx' || command === 'npm') return 'npm';
  if (command === 'uvx' || command === 'uv' || command === 'pipx') return 'pip';
  if (command === 'node' || command === 'python' || command === 'python3') return 'binary';
  if (command.startsWith('/') || command.startsWith('./') || command.startsWith('../')) return 'binary';
  return 'manual';
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/snapshot.test.mjs 2>&1 | tail -10`
Expected: all 7 classifier tests pass, all previous tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/snapshot.mjs tests/snapshot.test.mjs
git commit -m "feat: add classifyMcpMethod for MCP server install-method inference

Classifies based on the 'command' field: npx/npm → npm, uvx/uv/pipx → pip,
node/python/absolute-path → binary, everything else → manual.

This helps the apply command tell users what install tool to run for
missing MCPs after restoring a snapshot on a new machine.
"
```

---

## Task 4: MCP collector + test fixture

**Files:**
- Create: `tests/fixtures/.claude.json` — **new** fixture
- Modify: `src/snapshot.mjs` — add `collectMcpServers()` + `CLAUDE_JSON_FILENAME` constant
- Modify: `tests/snapshot.test.mjs` — add `describe('collectMcpServers', ...)` block

- [ ] **Step 1: Create the fixture file**

Create `tests/fixtures/.claude.json` with:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-filesystem", "/Users/testuser/Code"],
      "env": {}
    },
    "git": {
      "command": "uvx",
      "args": ["mcp-server-git", "--repository", "/Users/testuser/repos/project"],
      "env": {}
    },
    "custom": {
      "command": "/Users/testuser/bin/my-mcp",
      "args": [],
      "env": { "MCP_HOME": "/Users/testuser/.config/mcp" }
    }
  },
  "oauthAccount": "SHOULD_NOT_APPEAR_IN_SNAPSHOT",
  "projects": { "some-project": { "allowedTools": ["Bash"] } }
}
```

- [ ] **Step 2: Write failing tests**

Append to `tests/snapshot.test.mjs` after the `classifyMcpMethod` describe block:
```js
// --- MCP collector tests ---

describe('collectMcpServers', () => {
  it('reads mcpServers from sibling .claude.json', async () => {
    const { collectMcpServers } = await import('../src/snapshot.mjs');
    const servers = await collectMcpServers(FIXTURES);
    assert.equal(servers.length, 3);
    const names = servers.map(s => s.name).sort();
    assert.deepEqual(names, ['custom', 'filesystem', 'git']);
  });

  it('attaches classified install method to each server', async () => {
    const { collectMcpServers } = await import('../src/snapshot.mjs');
    const servers = await collectMcpServers(FIXTURES);
    const byName = Object.fromEntries(servers.map(s => [s.name, s]));
    assert.equal(byName.filesystem.method, 'npm');
    assert.equal(byName.git.method, 'pip');
    assert.equal(byName.custom.method, 'binary');
  });

  it('ignores non-mcpServers keys (oauthAccount, projects)', async () => {
    const { collectMcpServers } = await import('../src/snapshot.mjs');
    const servers = await collectMcpServers(FIXTURES);
    const serialized = JSON.stringify(servers);
    assert.ok(!serialized.includes('SHOULD_NOT_APPEAR_IN_SNAPSHOT'),
      'oauthAccount value must not leak into collected MCPs');
    assert.ok(!serialized.includes('allowedTools'),
      'project config must not leak into collected MCPs');
  });

  it('returns empty array when .claude.json does not exist', async () => {
    const { collectMcpServers } = await import('../src/snapshot.mjs');
    const emptyDir = await mkdtemp(join(tmpdir(), 'snapshot-no-mcp-'));
    try {
      const fakeHome = join(emptyDir, '.claude');
      await mkdir(fakeHome);
      const servers = await collectMcpServers(fakeHome);
      assert.deepEqual(servers, []);
    } finally {
      await rm(emptyDir, { recursive: true });
    }
  });

  it('returns empty array when .claude.json has no mcpServers key', async () => {
    const { collectMcpServers } = await import('../src/snapshot.mjs');
    const emptyDir = await mkdtemp(join(tmpdir(), 'snapshot-no-mcp-key-'));
    try {
      const fakeHome = join(emptyDir, '.claude');
      await mkdir(fakeHome);
      await writeFile(join(emptyDir, '.claude.json'), JSON.stringify({ oauthAccount: 'x' }));
      const servers = await collectMcpServers(fakeHome);
      assert.deepEqual(servers, []);
    } finally {
      await rm(emptyDir, { recursive: true });
    }
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `node --test tests/snapshot.test.mjs 2>&1 | grep -E "collectMcpServers|fail" | head -20`
Expected: 5 failures — `collectMcpServers` is not an export.

- [ ] **Step 4: Implement collectMcpServers**

Insert in `src/snapshot.mjs` right before `// --- Collector ---` (currently at line 55):
```js
// --- MCP collection ---

const CLAUDE_JSON_FILENAME = '.claude.json';

export async function collectMcpServers(claudeHome) {
  const claudeJsonPath = join(dirname(claudeHome), CLAUDE_JSON_FILENAME);
  const raw = await readJsonSafe(claudeJsonPath);
  if (!raw || !raw.mcpServers) return [];
  const servers = [];
  for (const [name, config] of Object.entries(raw.mcpServers)) {
    servers.push({
      name,
      command: config.command,
      args: config.args || [],
      env: config.env || {},
      method: classifyMcpMethod(config),
    });
  }
  return servers;
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `node --test tests/snapshot.test.mjs 2>&1 | tail -10`
Expected: all 5 collectMcpServers tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/snapshot.mjs tests/snapshot.test.mjs tests/fixtures/.claude.json
git commit -m "feat: collect MCP server configs from sibling .claude.json

collectMcpServers reads ~/.claude.json next to ~/.claude/, extracts
only the mcpServers key, and attaches a classified install method
per entry. OAuth tokens and project state in .claude.json are
explicitly ignored.
"
```

---

## Task 5: Wire MCP into export pipeline (collect, manifest, tarball)

**Files:**
- Modify: `src/snapshot.mjs` — `collect()`, `buildManifest()`, `exportSnapshot()`
- Modify: `tests/snapshot.test.mjs` — extend `collector`, `buildManifest`, `exportSnapshot` describes

- [ ] **Step 1: Write failing tests**

Append inside the existing `describe('collector', ...)` block in `tests/snapshot.test.mjs` (add as last `it` before the closing `})`):
```js
  it('collects MCP servers', async () => {
    const { collect } = await import('../src/snapshot.mjs');
    const result = await collect(FIXTURES);
    assert.equal(result.mcpServers.length, 3);
    assert.ok(result.mcpServers.some(s => s.name === 'filesystem'));
  });
```

Append inside the existing `describe('buildManifest', ...)` block:
```js
  it('includes MCP server identities in manifest', async () => {
    const { collect, buildManifest } = await import('../src/snapshot.mjs');
    const collected = await collect(FIXTURES);
    const manifest = buildManifest(collected, 'test-machine');
    assert.ok(Array.isArray(manifest.mcpServers));
    assert.equal(manifest.mcpServers.length, 3);
    const fs = manifest.mcpServers.find(s => s.name === 'filesystem');
    assert.equal(fs.method, 'npm');
    assert.ok(manifest.checksums['mcp-servers.json'],
      'manifest should checksum mcp-servers.json');
  });
```

Append inside the existing `describe('exportSnapshot', ...)` block:
```js
  it('tarball contains mcp-servers.json with $HOME-normalized paths', async () => {
    const { exportSnapshot, listTarEntries } = await import('../src/snapshot.mjs');
    const tar = await import('tar');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-mcp-'));
    try {
      const outputPath = join(tempDir, 'snap.tar.gz');
      await exportSnapshot(FIXTURES, outputPath, { machineName: 'test' });
      const entries = await listTarEntries(outputPath);
      assert.ok(entries.includes('mcp-servers.json'), 'mcp-servers.json should be in tarball');

      // Extract and verify content
      const extractDir = join(tempDir, 'extract');
      await mkdir(extractDir, { recursive: true });
      await tar.extract({ file: outputPath, cwd: extractDir });
      const mcpContent = await readFile(join(extractDir, 'mcp-servers.json'), 'utf-8');
      assert.ok(mcpContent.includes('$HOME'), 'paths should be normalized to $HOME');
      assert.ok(!mcpContent.includes('/Users/testuser'), 'literal /Users/testuser must not remain');
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/snapshot.test.mjs 2>&1 | grep -E "MCP|mcp|fail" | head -20`
Expected: 3 new failures.

- [ ] **Step 3: Wire collect() to include mcpServers**

Edit `src/snapshot.mjs:104-112` — change the `collect` return statement to:
```js
  const mcpServers = await collectMcpServers(claudeHome);

  return {
    settings,
    globalMd,
    hooks,
    installedPlugins,
    knownMarketplaces,
    blocklist,
    mcpServers,
  };
}
```

- [ ] **Step 4: Update buildManifest to include mcpServers + checksum**

Edit `src/snapshot.mjs:116-168`. Change the destructure line and add MCP list + checksum:

Replace line 117:
```js
  const { settings, globalMd, hooks, installedPlugins, knownMarketplaces, mcpServers } = collected;
```

Replace the checksums block (currently `src/snapshot.mjs:146-156`):
```js
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
  if (mcpServers && mcpServers.length > 0) {
    const mcpJson = JSON.stringify(
      Object.fromEntries(mcpServers.map(s => [s.name, { command: s.command, args: s.args, env: s.env }])),
      null, 2
    );
    checksums['mcp-servers.json'] = sha256(mcpJson);
  }
```

Replace the return block (currently `src/snapshot.mjs:158-167`):
```js
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exportedFrom: machineName || hostname(),
    plugins,
    marketplaces,
    hooks: hooks.map(h => `hooks/${h.name}`),
    globalMd: globalMd.map(m => m.name),
    mcpServers: (mcpServers || []).map(s => ({ name: s.name, method: s.method })),
    checksums,
  };
}
```

- [ ] **Step 5: Wire exportSnapshot to write mcp-servers.json to staging**

Edit `src/snapshot.mjs:172-250` (the `exportSnapshot` function). Insert this block after the "Write plugin manifests" block (after line 227 `}`) and before the "Build list of entries to include" comment (currently line 229):

```js
    // Write MCP servers (path-normalized)
    if (collected.mcpServers && collected.mcpServers.length > 0) {
      const mcpDict = Object.fromEntries(
        collected.mcpServers.map(s => [s.name, { command: s.command, args: s.args, env: s.env }])
      );
      const normalizedMcp = normalizePaths(mcpDict, userHome);
      await writeFile(
        join(stagingDir, 'mcp-servers.json'),
        JSON.stringify(normalizedMcp, null, 2)
      );
    }
```

Then add `mcp-servers.json` to the entries list. Modify the block starting at `const entries = ['manifest.json'];` (currently line 230):
```js
    // Build list of entries to include
    const entries = ['manifest.json'];
    if (normalizedSettings) entries.push('settings.json');
    if (collected.globalMd.length > 0) entries.push('global-md');
    if (collected.hooks.length > 0) entries.push('hooks');
    if (collected.installedPlugins || collected.knownMarketplaces || collected.blocklist) {
      entries.push('plugins');
    }
    if (collected.mcpServers && collected.mcpServers.length > 0) {
      entries.push('mcp-servers.json');
    }
```

- [ ] **Step 6: Run tests to verify pass**

Run: `node --test tests/snapshot.test.mjs 2>&1 | tail -20`
Expected: all tests pass (including the new MCP tests and the round-trip test).

- [ ] **Step 7: Commit**

```bash
git add src/snapshot.mjs tests/snapshot.test.mjs
git commit -m "feat: include MCP servers in snapshot export pipeline

Collect appends MCPs to the collected artifacts. buildManifest records
each server's name + classified method and a checksum over a canonical
mcp-servers.json. exportSnapshot writes that file to the tarball with
\$HOME-normalized paths for portability.
"
```

---

## Task 6: MCP diff logic

**Files:**
- Modify: `src/snapshot.mjs` — extend `diffSnapshot()`
- Modify: `tests/snapshot.test.mjs` — extend `describe('diffSnapshot', ...)`

- [ ] **Step 1: Write failing tests**

Append inside the existing `describe('diffSnapshot', ...)` block in `tests/snapshot.test.mjs`:
```js
  it('detects missing MCP servers', async () => {
    const { diffSnapshot } = await import('../src/snapshot.mjs');
    const manifest = {
      schemaVersion: '1.0.0',
      plugins: [], marketplaces: [], hooks: [], globalMd: [],
      mcpServers: [
        { name: 'filesystem', method: 'npm' },
        { name: 'new-server', method: 'pip' },
      ],
      checksums: {},
    };
    const diff = await diffSnapshot(manifest, FIXTURES);
    assert.ok(diff.mcpServers.matched.some(s => s.name === 'filesystem'),
      'filesystem should match (exists locally)');
    assert.ok(diff.mcpServers.added.some(s => s.name === 'new-server'),
      'new-server should be in added');
  });

  it('returns empty mcpServers diff when manifest has none', async () => {
    const { diffSnapshot } = await import('../src/snapshot.mjs');
    const manifest = {
      schemaVersion: '1.0.0',
      plugins: [], marketplaces: [], hooks: [], globalMd: [],
      mcpServers: [],
      checksums: {},
    };
    const diff = await diffSnapshot(manifest, FIXTURES);
    assert.deepEqual(diff.mcpServers.added, []);
    assert.deepEqual(diff.mcpServers.matched, []);
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/snapshot.test.mjs 2>&1 | grep -E "MCP|mcp|fail" | head -20`
Expected: 2 new failures — `diff.mcpServers` is undefined.

- [ ] **Step 3: Extend diffSnapshot**

Edit `src/snapshot.mjs:285-362` (the `diffSnapshot` function). Insert this block after the `// Diff settings` block (which ends around line 354 at the `}` after `settingsDiff`) and before the final `return` statement:

```js
  // Diff MCP servers
  const localMcpNames = new Set((local.mcpServers || []).map(s => s.name));
  const mcpDiff = { added: [], matched: [] };
  for (const s of (manifest.mcpServers || [])) {
    if (localMcpNames.has(s.name)) {
      mcpDiff.matched.push(s);
    } else {
      mcpDiff.added.push(s);
    }
  }
```

Change the return statement (currently `src/snapshot.mjs:356-361`) to:
```js
  return {
    plugins: pluginDiff,
    hooks: hookDiff,
    globalMd: mdDiff,
    settings: settingsDiff,
    mcpServers: mcpDiff,
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/snapshot.test.mjs 2>&1 | tail -20`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/snapshot.mjs tests/snapshot.test.mjs
git commit -m "feat: diff MCP servers between snapshot and local state

diffSnapshot now produces diff.mcpServers.{added, matched}. v0.2 does
not detect config drift (same name, different command) — that's v0.3
work once apply supports MCP write-through.
"
```

---

## Task 7: MCP report in apply (no auto-write)

**Files:**
- Modify: `src/snapshot.mjs` — extend `applySnapshot()` and the `apply` CLI branch
- Modify: `tests/snapshot.test.mjs` — extend `describe('applySnapshot', ...)`

- [ ] **Step 1: Write failing test**

Append inside the existing `describe('applySnapshot', ...)` block:
```js
  it('returns mcpReport listing servers that need install', async () => {
    const { exportSnapshot, applySnapshot } = await import('../src/snapshot.mjs');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-mcp-apply-'));
    try {
      const tarPath = join(tempDir, 'snapshot.tar.gz');
      await exportSnapshot(FIXTURES, tarPath, { machineName: 'test' });

      const targetHome = join(tempDir, 'target-claude');
      await mkdir(targetHome, { recursive: true });
      await mkdir(join(targetHome, 'plugins'), { recursive: true });
      await writeFile(join(targetHome, 'plugins/installed_plugins.json'),
        JSON.stringify({ version: 2, plugins: {} }));
      // Target has NO .claude.json, so all snapshot MCPs are "missing"

      const result = await applySnapshot(tarPath, targetHome, { skipInstall: true });

      assert.ok(result.mcpReport, 'apply result should include mcpReport');
      assert.equal(result.mcpReport.missing.length, 3);
      const methods = result.mcpReport.missing.map(s => s.method).sort();
      assert.deepEqual(methods, ['binary', 'npm', 'pip']);
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it('does NOT modify ~/.claude.json during apply', async () => {
    const { exportSnapshot, applySnapshot } = await import('../src/snapshot.mjs');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-no-mcp-write-'));
    try {
      const tarPath = join(tempDir, 'snapshot.tar.gz');
      await exportSnapshot(FIXTURES, tarPath, { machineName: 'test' });

      const targetHome = join(tempDir, 'target-claude');
      await mkdir(targetHome, { recursive: true });
      await mkdir(join(targetHome, 'plugins'), { recursive: true });
      await writeFile(join(targetHome, 'plugins/installed_plugins.json'),
        JSON.stringify({ version: 2, plugins: {} }));

      // Pre-existing .claude.json with sensitive OAuth data
      const claudeJsonPath = join(tempDir, '.claude.json');
      const preExisting = { oauthAccount: 'PRESERVE_ME', mcpServers: {} };
      await writeFile(claudeJsonPath, JSON.stringify(preExisting));

      await applySnapshot(tarPath, targetHome, { skipInstall: true });

      const afterContent = await readFile(claudeJsonPath, 'utf-8');
      assert.ok(afterContent.includes('PRESERVE_ME'),
        'v0.2 apply must not overwrite existing .claude.json (OAuth preservation)');
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/snapshot.test.mjs 2>&1 | grep -E "mcpReport|mcp|fail" | head -20`
Expected: 1 failure — `result.mcpReport` is undefined. (The second test will pass incidentally since nothing is currently writing `.claude.json`, but we keep it as a safety guardrail.)

- [ ] **Step 3: Build mcpReport in applySnapshot**

Edit `src/snapshot.mjs:366-456` (the `applySnapshot` function). Insert this block just before the final `return manifest;` statement (currently line 451):

```js
    // Build MCP report (do NOT write to ~/.claude.json in v0.2)
    const mcpStagingPath = join(stagingDir, 'mcp-servers.json');
    let mcpReport = { missing: [], matched: [] };
    if (await fileExists(mcpStagingPath) && manifest.mcpServers) {
      const localMcp = await collectMcpServers(claudeHome);
      const localNames = new Set(localMcp.map(s => s.name));
      for (const s of manifest.mcpServers) {
        if (localNames.has(s.name)) {
          mcpReport.matched.push(s);
        } else {
          mcpReport.missing.push(s);
        }
      }
    }
```

Change the return statement — replace `return manifest;` with:
```js
    return { ...manifest, mcpReport };
```

- [ ] **Step 4: Update apply CLI branch to surface report**

Edit `src/snapshot.mjs:502-507` (the `apply` case in `cli()`). Replace with:
```js
    case 'apply': {
      const tarPath = resolve(args[0]);
      const result = await applySnapshot(tarPath, claudeHome);
      console.log(JSON.stringify({
        status: 'ok',
        manifest: result,
        mcpReport: result.mcpReport,
      }));
      break;
    }
```

- [ ] **Step 5: Run tests to verify pass**

Run: `node --test tests/snapshot.test.mjs 2>&1 | tail -20`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/snapshot.mjs tests/snapshot.test.mjs
git commit -m "feat: report MCP servers that need install after apply

applySnapshot returns mcpReport.{missing, matched}. v0.2 deliberately
does NOT write ~/.claude.json — it contains OAuth tokens and project
state that must not be clobbered. The user sees a list of MCPs with
install methods and runs the appropriate install themselves.

Write-through behind a --with-mcp flag is deferred to v0.3.
"
```

---

## Task 8: Update skill files (inspect, diff, apply)

**Files:**
- Modify: `commands/inspect.md`
- Modify: `commands/diff.md`
- Modify: `commands/apply.md`

- [ ] **Step 1: Read current inspect.md to know what to patch**

Run: `cat commands/inspect.md`
Note the structure — it describes how Claude should interpret the JSON output.

- [ ] **Step 2: Update commands/inspect.md**

In `commands/inspect.md`, find the section that describes what to display from the manifest. Add surface-level fields for `schemaVersion` and `mcpServers`. Locate the list of manifest fields the skill extracts, and add these two bullets near the top of the fields list:

```markdown
- **Schema version**: show `manifest.schemaVersion` on the first line of the summary (e.g. "Schema 1.0.0").
- **MCP servers**: if `manifest.mcpServers.length > 0`, show a line like `MCP servers: N (npm: X, pip: Y, binary: Z, manual: W)` using counts grouped by `method`.
```

If the skill file uses a single cohesive prompt, splice those instructions into the appropriate spot — match the existing voice and style. The engineer applying this plan should read the existing file and preserve its structure; the goal is *these two data points must appear in the inspect output*.

- [ ] **Step 3: Update commands/diff.md**

In `commands/diff.md`, find the section that renders the diff categories (plugins, hooks, globalMd, settings). Add an MCP category rendering instruction:

```markdown
### MCP servers

If `diff.mcpServers.added.length > 0`:
- Show `+ MCP: {name} ({method})` for each added server.
- After the list, add a note: "These MCP servers are in the snapshot but not on this machine. Apply will tell you how to install each."

If `diff.mcpServers.matched.length > 0` and `added.length === 0`:
- Show: "= {N} MCP servers already present."
```

- [ ] **Step 4: Update commands/apply.md**

In `commands/apply.md`, add a post-apply section that surfaces `mcpReport`:

```markdown
### After apply: MCP installation guidance

When the apply script completes, its JSON output includes `mcpReport.missing` — a list of MCP servers from the snapshot that are NOT in the target's `~/.claude.json`. For each, show:

- **npm** method → "Install with: run the MCP's official install command (e.g. `claude mcp add {name} npx -y <package>`)."
- **pip** method → "Install with: `uvx <package>` or the project's documented uv/pipx command."
- **binary** method → "This MCP points to a local binary ({command}). Confirm the binary exists on this machine or install it."
- **manual** method → "This MCP uses a custom command ({command}). Refer to its source documentation."

**Do NOT modify `~/.claude.json` yourself.** v0.2 explicitly reports without writing because `.claude.json` also holds OAuth tokens. The user installs MCPs through their normal tooling; the snapshot tells them *what* to install, not *how to edit the file*.
```

- [ ] **Step 5: Manual verification**

Run: `node src/snapshot.mjs export --output /tmp/test-snap.tar.gz` (in a dev env where `~/.claude/` exists)

Then: `node src/snapshot.mjs inspect /tmp/test-snap.tar.gz | python3 -m json.tool | head -30`

Expected: JSON output includes `"schemaVersion": "1.0.0"` and `"mcpServers": [...]`.

Then: `node src/snapshot.mjs apply /tmp/test-snap.tar.gz 2>&1 | python3 -m json.tool | grep -A 10 mcpReport`

Expected: `mcpReport.missing` and `mcpReport.matched` arrays present. Cleanup: `rm /tmp/test-snap.tar.gz`.

*Note: this step verifies the CLI surface; if running on a machine without a full Claude Code setup, use the fixtures via a one-off test script instead.*

- [ ] **Step 6: Commit**

```bash
git add commands/inspect.md commands/diff.md commands/apply.md
git commit -m "docs: surface schemaVersion + MCP data in skill commands

inspect now shows schema version + MCP count. diff now renders an MCP
category with install methods. apply shows post-apply guidance for
manually installing missing MCPs, with an explicit warning that the
plugin does NOT write to ~/.claude.json.
"
```

---

## Task 9: Add Principles section to README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Insert Principles section between "Why" and "Prior art"**

Edit `README.md:22`. Insert this block **after** the "Why" section (which ends at line 20 with the `- **Onboarding**` bullet) and **before** the `## Prior art` heading:

```markdown
## Principles

Design decisions in this plugin are evaluated against these principles.

**[P1] Minimal Blast Radius**: one-shot commands, no daemon, no background watch, no network. Every side effect is triggered by an explicit user command and scoped to `~/.claude/` plus the output tarball path.

**[P2] Allowlist Over Denylist**: snapshots contain an explicit list of artifacts (settings, `CLAUDE.md`, hooks, plugin manifests, MCP servers). New files Claude Code adds in future versions are NOT auto-captured — plugin updates decide what gets included. This is the opposite trade-off from wholesale-capture tools; we pay with manual maintenance and gain predictable, auditable snapshot contents.

**[P3] No Network, Ever**: export and apply are local-only. Plugin reinstallation during apply delegates to Claude Code's own `/plugin install` mechanism, which manages network access itself. claude-snapshot makes zero outbound requests.

**[P4] Diff Before Destroy**: every `apply` is preceded by a diff summary the user must acknowledge. Every overwritten file is first copied to `<file>.bak`. Snapshot contents are always inspectable without extraction via `/snapshot:inspect`.

**[P5] Cross-Platform First-Class**: the plugin is Node.js, not bash. It runs the same on macOS and Linux without polyfills, different code paths, or GNU-coreutils assumptions. Windows via WSL is supported; native Windows is best-effort.
```

- [ ] **Step 2: Manual verification**

Run: `head -80 README.md` and visually confirm the Principles section appears between "Why" and "Prior art".

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add explicit Principles section to README

Documents P1-P5 (Minimal Blast Radius, Allowlist Over Denylist, No
Network Ever, Diff Before Destroy, Cross-Platform First-Class) as the
public contract of the plugin.
"
```

---

## Task 10: Document MCP + schemaVersion in README and DESIGN

**Files:**
- Modify: `README.md` — "What migrates" table, "Snapshot anatomy" block
- Modify: `docs/DESIGN.md` — add three Architecture Decisions

- [ ] **Step 1: Add MCP row to README "What migrates" table**

Edit `README.md:102` (inside the "What migrates" table, just after the "Hook scripts" row at line 101). Insert:
```markdown
| MCP servers (from `~/.claude.json`, `mcpServers` key only — OAuth tokens excluded) | Yes (report only on apply) |
```

- [ ] **Step 2: Update Snapshot anatomy block in README**

Edit `README.md:123-134`. Replace the entire code block with:
```markdown
claude-snapshot-YYYY-MM-DD.tar.gz
├── manifest.json           # schemaVersion, plugins, marketplaces, hooks, MDs, MCPs, checksums
├── settings.json           # your Claude Code settings
├── mcp-servers.json        # MCP server configs (only if you have any; path-normalized)
├── global-md/              # CLAUDE.md and other root-level .md files
├── hooks/                  # your custom hook scripts
├── plugins/
│   ├── installed_plugins.json
│   ├── known_marketplaces.json
│   └── blocklist.json
└── cache/                  # (only with --full)
```

- [ ] **Step 3: Note apply behavior for MCPs in README "How it works"**

Edit `README.md:119` (the numbered list at the end of "How it works"). Add a fourth item:
```markdown
4. **MCP servers** are captured from `~/.claude.json` (the `mcpServers` key only) and included in the tarball. On apply, claude-snapshot *reports* which MCPs need installation on the target machine — it does NOT auto-write `~/.claude.json` because that file also holds OAuth tokens and project state.
```

- [ ] **Step 4: Add three Architecture Decisions to DESIGN.md**

Append to `docs/DESIGN.md` (at the end of the file):

```markdown

---

## AD7 — MCP scope: capture `mcpServers` key only, not entire `.claude.json`

**Context.** `~/.claude.json` contains `mcpServers`, OAuth tokens, per-project allowed-tools lists, session history pointers, and analytics caches. Users asked for MCP portability.

**Decision.** Read `~/.claude.json`, extract only the `mcpServers` sub-tree, discard the rest, and write the extracted MCPs to `mcp-servers.json` in the tarball. OAuth tokens and project state never leave the machine.

**Consequences.** MCP portability works for the overwhelmingly common case (stateless server configs). Server-specific secrets embedded in `env` blocks still travel in the snapshot — users who put API keys in MCP `env` should use `--exclude-mcp` (backlog) or keep secrets in a separate mechanism.

---

## AD8 — Manifest field: `schemaVersion` over `version`

**Context.** The original manifest field `version: '1.0.0'` was ambiguous — is it the plugin version, the snapshot format, or the machine config version?

**Decision.** Rename to `schemaVersion`. Introduce `SCHEMA_VERSION` and `SUPPORTED_SCHEMA_MAJOR` constants. Read path normalizes a legacy `version` field (v0.1 tarballs) into `schemaVersion`. Major version mismatches throw a clear error directing the user to upgrade claude-snapshot or re-export.

**Consequences.** Future format changes are versionable without ambiguity. v0.1 snapshots remain readable. Downstream tooling (if anyone builds any) has a stable contract.

---

## AD9 — MCP apply: report, do not write

**Context.** `~/.claude.json` is a shared file holding OAuth tokens, session state, and project allowed-tools lists — not just MCP configs. Overwriting it on apply would clobber user-specific state in ways that vary across machines.

**Decision.** On apply, read the snapshot's `mcp-servers.json` and produce an `mcpReport` summary (`missing`, `matched`). The skill surfaces this to the user along with install-method guidance (`npm`/`pip`/`binary`/`manual`). The plugin does NOT modify `~/.claude.json`. A future `--with-mcp` flag (v0.3) could opt the user into write-through with `.bak` backup.

**Consequences.** Users do one extra step after apply (install MCPs via `claude mcp add ...` or equivalent). This matches P4 (diff before destroy) and avoids a category of destructive failure modes.
```

- [ ] **Step 5: Manual verification**

Run:
```bash
grep -c "MCP servers" README.md
grep -c "AD7\|AD8\|AD9" docs/DESIGN.md
```
Expected: README contains at least 2 mentions of "MCP servers"; DESIGN.md contains exactly 3 AD headers.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/DESIGN.md
git commit -m "docs: document MCP capture + schemaVersion in README and DESIGN

README: MCP line in 'What migrates', mcp-servers.json in anatomy,
apply behavior clarified in 'How it works'.

DESIGN: three new ADs (AD7 MCP scope, AD8 schemaVersion naming,
AD9 report-not-write for MCPs).
"
```

---

## Task 11: Cross-machine simulation + tarball corruption tests

**Files:**
- Modify: `tests/snapshot.test.mjs` — add two new `describe` blocks

- [ ] **Step 1: Write cross-machine simulation test**

Append to `tests/snapshot.test.mjs` (before the round-trip describe block):
```js
// --- Cross-machine simulation ---

describe('cross-machine apply', () => {
  it('resolves $HOME for a different user path on the target', async () => {
    const { exportSnapshot, applySnapshot, collect } = await import('../src/snapshot.mjs');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-xmachine-'));
    try {
      // Build source fake home simulating /Users/alice
      const aliceRoot = join(tempDir, 'alice-root');
      const aliceClaude = join(aliceRoot, '.claude');
      await mkdir(join(aliceClaude, 'hooks'), { recursive: true });
      await mkdir(join(aliceClaude, 'plugins'), { recursive: true });
      await writeFile(join(aliceClaude, 'settings.json'), JSON.stringify({
        hooks: {
          PreToolUse: [{
            matcher: 'Bash',
            hooks: [{ type: 'command', command: `${aliceRoot}/.claude/hooks/guard.sh` }]
          }]
        },
        env: { ALICE_VAR: `${aliceRoot}/work` }
      }));
      await writeFile(join(aliceClaude, 'CLAUDE.md'), '# Alice personal config');
      await writeFile(join(aliceClaude, 'hooks/guard.sh'), '#!/bin/bash\necho alice-guard');
      await writeFile(join(aliceClaude, 'plugins/installed_plugins.json'),
        JSON.stringify({ version: 2, plugins: {} }));
      await writeFile(join(aliceRoot, '.claude.json'), JSON.stringify({
        mcpServers: {
          'filesystem': {
            command: 'npx',
            args: ['-y', '@anthropic/mcp-filesystem', `${aliceRoot}/workspace`],
            env: {}
          }
        }
      }));

      // Export from alice
      const tarPath = join(tempDir, 'alice-snapshot.tar.gz');
      await exportSnapshot(aliceClaude, tarPath, { machineName: 'alice-mac' });

      // Build target fake home simulating /Users/bob (different user path entirely)
      const bobRoot = join(tempDir, 'bob-root');
      const bobClaude = join(bobRoot, '.claude');
      await mkdir(join(bobClaude, 'plugins'), { recursive: true });
      await writeFile(join(bobClaude, 'plugins/installed_plugins.json'),
        JSON.stringify({ version: 2, plugins: {} }));
      await writeFile(join(bobClaude, 'settings.json'), '{}');

      // Apply snapshot to bob's machine
      const result = await applySnapshot(tarPath, bobClaude, { skipInstall: true });

      // 1. Settings paths resolved to bob, no alice trace
      const bobSettings = await readFile(join(bobClaude, 'settings.json'), 'utf-8');
      assert.ok(bobSettings.includes(bobRoot),
        `settings should reference ${bobRoot}, got: ${bobSettings}`);
      assert.ok(!bobSettings.includes(aliceRoot),
        `settings must not contain any alice path, got: ${bobSettings}`);

      // 2. Hook script copied and executable
      const bobHook = join(bobClaude, 'hooks/guard.sh');
      const hookStat = await stat(bobHook);
      assert.ok(hookStat.mode & 0o100, 'hook must be executable (owner +x)');

      // 3. CLAUDE.md copied
      const bobMd = await readFile(join(bobClaude, 'CLAUDE.md'), 'utf-8');
      assert.ok(bobMd.includes('Alice personal config'));

      // 4. MCP report surfaces filesystem as missing (bob has no .claude.json)
      assert.ok(result.mcpReport.missing.some(s => s.name === 'filesystem'),
        'filesystem MCP should be reported as missing on bob');

      // 5. Verify no alice path leaked anywhere under bob's .claude
      const bobCollected = await collect(bobClaude);
      const serialized = JSON.stringify(bobCollected);
      assert.ok(!serialized.includes(aliceRoot),
        'no alice path should appear anywhere in bob\'s collected state');
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });
});
```

- [ ] **Step 2: Write tarball corruption tests**

Append to `tests/snapshot.test.mjs`:
```js
// --- Tarball corruption tests ---

describe('tarball corruption', () => {
  it('returns null when tarball has no manifest.json', async () => {
    const { readManifestFromTar } = await import('../src/snapshot.mjs');
    const tar = await import('tar');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-no-manifest-'));
    try {
      const stagingDir = join(tempDir, 'staging');
      await mkdir(stagingDir);
      await writeFile(join(stagingDir, 'settings.json'), '{}');
      const tarPath = join(tempDir, 'broken.tar.gz');
      await tar.create({ gzip: true, file: tarPath, cwd: stagingDir }, ['settings.json']);
      const result = await readManifestFromTar(tarPath);
      assert.equal(result, null, 'should return null when no manifest.json');
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it('throws SyntaxError when manifest.json contains invalid JSON', async () => {
    const { readManifestFromTar } = await import('../src/snapshot.mjs');
    const tar = await import('tar');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-bad-json-'));
    try {
      const stagingDir = join(tempDir, 'staging');
      await mkdir(stagingDir);
      await writeFile(join(stagingDir, 'manifest.json'), '{ this is not valid json');
      const tarPath = join(tempDir, 'broken.tar.gz');
      await tar.create({ gzip: true, file: tarPath, cwd: stagingDir }, ['manifest.json']);
      await assert.rejects(readManifestFromTar(tarPath), SyntaxError);
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it('throws on non-existent tarball path', async () => {
    const { readManifestFromTar } = await import('../src/snapshot.mjs');
    await assert.rejects(
      readManifestFromTar('/tmp/this-file-does-not-exist-xyz123.tar.gz'),
      /ENOENT/
    );
  });
});
```

- [ ] **Step 3: Run tests to verify pass**

Run: `node --test tests/snapshot.test.mjs 2>&1 | tail -20`
Expected: all new tests pass. The cross-machine test is the most important — it exercises the full export → apply round-trip with path translation on a simulated different machine.

- [ ] **Step 4: Commit**

```bash
git add tests/snapshot.test.mjs
git commit -m "test: add cross-machine simulation + tarball corruption tests

Cross-machine test builds two distinct fake homes (alice/bob) with
different root paths, exports from one, applies to the other, and
asserts: (1) settings resolve to target paths, (2) no source paths
leak, (3) hooks get +x, (4) MCP report flags missing servers.

Corruption tests cover: missing manifest, invalid JSON in manifest,
non-existent tarball path.
"
```

---

## Task 12: CLI contract test + golden manifest

**Files:**
- Create: `tests/fixtures/golden-manifest.json` — **new** expected manifest shape
- Modify: `tests/snapshot.test.mjs` — add `describe('CLI contract', ...)` and `describe('golden manifest', ...)`

- [ ] **Step 1: Write CLI contract tests (failing until run)**

Append to `tests/snapshot.test.mjs`:
```js
// --- CLI contract tests ---

describe('CLI contract', () => {
  const SCRIPT = resolve(__dirname, '../src/snapshot.mjs');

  it('export emits status:ok JSON with path and counts', async () => {
    const { execSync } = await import('node:child_process');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-cli-'));
    try {
      const outputPath = join(tempDir, 'cli-snap.tar.gz');
      const env = { ...process.env, CLAUDE_CONFIG_DIR: FIXTURES };
      const stdout = execSync(
        `node ${SCRIPT} export --output ${outputPath}`,
        { env, encoding: 'utf-8' }
      );
      const result = JSON.parse(stdout);
      assert.equal(result.status, 'ok');
      assert.equal(result.path, outputPath);
      assert.ok(typeof result.plugins === 'number');
      assert.ok(typeof result.hooks === 'number');
      assert.ok(typeof result.globalMd === 'number');
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it('inspect emits status:ok JSON with manifest', async () => {
    const { execSync } = await import('node:child_process');
    const { exportSnapshot } = await import('../src/snapshot.mjs');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-cli-inspect-'));
    try {
      const tarPath = join(tempDir, 'snap.tar.gz');
      await exportSnapshot(FIXTURES, tarPath, { machineName: 'cli-test' });
      const stdout = execSync(
        `node ${SCRIPT} inspect ${tarPath}`,
        { encoding: 'utf-8' }
      );
      const result = JSON.parse(stdout);
      assert.equal(result.status, 'ok');
      assert.equal(result.manifest.schemaVersion, '1.0.0');
      assert.equal(result.manifest.exportedFrom, 'cli-test');
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it('apply emits status:ok JSON with mcpReport', async () => {
    const { execSync } = await import('node:child_process');
    const { exportSnapshot } = await import('../src/snapshot.mjs');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-cli-apply-'));
    try {
      const tarPath = join(tempDir, 'snap.tar.gz');
      await exportSnapshot(FIXTURES, tarPath, { machineName: 'cli-test' });

      const targetHome = join(tempDir, 'target', '.claude');
      await mkdir(join(targetHome, 'plugins'), { recursive: true });
      await writeFile(join(targetHome, 'plugins/installed_plugins.json'),
        JSON.stringify({ version: 2, plugins: {} }));
      await writeFile(join(targetHome, 'settings.json'), '{}');

      const env = { ...process.env, CLAUDE_CONFIG_DIR: targetHome };
      // skipInstall is a library flag, not exposed via CLI; we allow the install step to no-op
      // because there's no `claude` binary in the test env — the script will print a warning and continue.
      const stdout = execSync(
        `node ${SCRIPT} apply ${tarPath}`,
        { env, encoding: 'utf-8' }
      );
      const result = JSON.parse(stdout);
      assert.equal(result.status, 'ok');
      assert.ok(result.mcpReport, 'apply output must include mcpReport');
      assert.ok(Array.isArray(result.mcpReport.missing));
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it('unknown command exits 1 with error to stderr', async () => {
    const { execSync } = await import('node:child_process');
    assert.throws(() => {
      execSync(`node ${SCRIPT} invalid-command`, { encoding: 'utf-8', stdio: 'pipe' });
    }, /Unknown command|exit code 1/);
  });
});
```

- [ ] **Step 2: Run tests to verify pass**

Run: `node --test tests/snapshot.test.mjs 2>&1 | grep -E "CLI|fail" | head -20`
Expected: all 4 CLI contract tests pass.

- [ ] **Step 3: Create golden manifest fixture**

First, generate the current shape to freeze:
```bash
node -e "
const { collect, buildManifest } = await import('./src/snapshot.mjs');
const c = await collect('tests/fixtures/fake-claude-home');
const m = buildManifest(c, 'GOLDEN_MACHINE');
m.exportedAt = 'GOLDEN_TIMESTAMP';
console.log(JSON.stringify(m, null, 2));
" > tests/fixtures/golden-manifest.json
```

Verify the generated `tests/fixtures/golden-manifest.json` looks sensible (has `schemaVersion: "1.0.0"`, plugins array, marketplaces array, mcpServers array with 3 entries, checksums dict). Commit this file as the contract reference.

- [ ] **Step 4: Write golden manifest test**

Append to `tests/snapshot.test.mjs`:
```js
// --- Golden manifest shape contract ---

describe('golden manifest shape', () => {
  it('buildManifest output matches committed golden file (modulo timestamp)', async () => {
    const { collect, buildManifest } = await import('../src/snapshot.mjs');
    const golden = JSON.parse(
      await readFile(resolve(__dirname, 'fixtures/golden-manifest.json'), 'utf-8')
    );
    const collected = await collect(FIXTURES);
    const actual = buildManifest(collected, 'GOLDEN_MACHINE');
    actual.exportedAt = 'GOLDEN_TIMESTAMP';
    assert.deepEqual(actual, golden,
      'manifest shape drifted from golden; if intentional, regenerate tests/fixtures/golden-manifest.json');
  });
});
```

- [ ] **Step 5: Run tests to verify pass**

Run: `node --test tests/snapshot.test.mjs 2>&1 | tail -20`
Expected: golden test passes. If it fails, either the manifest shape changed (regenerate the golden) or a real regression exists.

- [ ] **Step 6: Commit**

```bash
git add tests/snapshot.test.mjs tests/fixtures/golden-manifest.json
git commit -m "test: add CLI contract tests + golden manifest shape check

CLI contract spawns actual node subprocess via execSync and parses
stdout JSON — catches regressions in the skill<->script interface.

Golden manifest file locks the manifest shape; future schema changes
must either keep the shape stable or explicitly regenerate the golden
(which makes the intent visible in the PR diff).
"
```

---

## Task 13: GitHub Actions CI matrix

**Files:**
- Create: `.github/workflows/test.yml` — **new**

- [ ] **Step 1: Create the workflow file**

Write `.github/workflows/test.yml`:
```yaml
name: test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest]
        node: [18, 20, 22]
    runs-on: ${{ matrix.os }}
    name: test / ${{ matrix.os }} / node-${{ matrix.node }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm test
```

- [ ] **Step 2: Verify package.json has an appropriate test script**

Run: `grep -A2 '"scripts"' package.json`
Expected output includes a `"test"` entry that runs the tests.

If the `"test"` script is missing or not pointing at the test file, edit `package.json` to add:
```json
"scripts": {
  "test": "node --test tests/snapshot.test.mjs"
}
```

- [ ] **Step 3: Validate workflow syntax locally**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/test.yml'))" && echo "YAML OK"`
Expected: `YAML OK`.

- [ ] **Step 4: Commit and push to trigger CI**

```bash
git add .github/workflows/test.yml package.json
git commit -m "ci: add test matrix across macOS + Linux, Node 18/20/22

Catches GNU-vs-BSD coreutils differences, Node ESM quirks, and path
separator issues across 6 cells (2 OS x 3 Node versions).
"
```

- [ ] **Step 5: Observe the first CI run**

After push, go to the GitHub Actions tab for the repo. Wait for all 6 matrix cells to finish. If any cell fails, the failure is almost certainly platform-specific (e.g. a `readdir` order assumption, a path separator, a Node version incompatibility). Fix the underlying issue; do NOT suppress the failure.

---

## Task 14: Manual smoke test checklist (cross-machine validation)

**Files:**
- Create: `docs/SMOKE_TEST.md` — **new**

- [ ] **Step 1: Write the checklist file**

Write `docs/SMOKE_TEST.md`:
```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/SMOKE_TEST.md
git commit -m "docs: add manual cross-machine smoke test checklist

Protocol for validating end-to-end flow (export → transfer → diff →
apply → post-apply assertions → rollback) on two real machines with
different OS and usernames. Required before tagging a release.
"
```

---

## Self-Review (already applied)

**Spec coverage** — four asks mapped to tasks:
1. *MCP capture* → Tasks 3, 4, 5, 6, 7, 8 (classifier, collector, fixture, export pipeline, diff, apply report, skill surfacing)
2. *schemaVersion* → Tasks 1, 2 (rename + validation); documented in Task 10
3. *Principles in README* → Task 9
4. *Deep testing + cross-machine validation* → Tasks 11 (cross-machine sim + corruption), 12 (CLI contract + golden manifest), 13 (CI matrix), 14 (manual smoke test protocol)

**Type consistency** — `mcpServers` array shape is consistent across `collect` output (`{name, command, args, env, method}`), `buildManifest` output (`{name, method}` — identity only), and `diffSnapshot.mcpServers.{added, matched}` (uses manifest shape). `mcpReport` uses manifest shape.

**Placeholder scan** — no TBDs, all code blocks complete, all test assertions typed in full.

**Risk notes for the implementer:**
- If `~/.claude.json` does not exist on the source machine, `collectMcpServers` returns `[]` and the tarball simply won't contain `mcp-servers.json`. The whole MCP path is opt-in based on presence.
- The MCP collector uses `dirname(claudeHome)` to find `.claude.json`. On unusual setups where `CLAUDE_CONFIG_DIR` points far from `$HOME`, this could resolve wrongly. Not addressed in v0.2 — out of scope.
- Tests use the existing `FIXTURES` constant which resolves to `tests/fixtures/fake-claude-home`. Its parent (`tests/fixtures/`) will hold the new `.claude.json`. Confirmed this doesn't conflict with any existing fixture.
- Task 8 skill file edits describe the *intent* rather than prescribing exact line edits because the existing skill files are compact behavioral prompts — applying diff-style patches risks breaking prose flow. The engineer should read each current file, find the natural insertion point, and integrate the new instructions in voice.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-18-mcp-capture-principles-schema-version.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatches a fresh subagent per task, review between tasks, fast iteration. Best for this plan because Tasks 1-7 + 11-12 are code-heavy with TDD cycles that benefit from clean-context execution.

**2. Inline Execution** — executes tasks in this session, batched with checkpoints. Cheaper on tokens but risks context bloat across 14 tasks.

**Suggested grouping for either mode:**
- Batch 1 (schema + MCP core): T1 → T2 → T3 → T4 → T5 → T6 → T7 (commit after each; all TDD; ~2h total)
- Batch 2 (UX surfaces): T8 → T9 → T10 (docs; ~30min)
- Batch 3 (deep testing): T11 → T12 → T13 (~1h; T13 needs a push to GitHub to observe CI)
- Batch 4 (human protocol): T14 (~15min writing; execution is manual and happens pre-release)

**Which approach?**
