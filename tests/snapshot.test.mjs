import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, stat, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, 'fixtures/fake-claude-home');

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe(path) {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// --- Collector tests ---

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
    assert.equal(result.globalMd.length, 2, 'should find CLAUDE.md and RTK.md');
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

  it('collects MCP servers', async () => {
    const { collect } = await import('../src/snapshot.mjs');
    const result = await collect(FIXTURES);
    assert.equal(result.mcpServers.length, 3);
    assert.ok(result.mcpServers.some(s => s.name === 'filesystem'));
  });
});

// --- buildManifest tests ---

describe('buildManifest', () => {
  it('generates manifest with plugin list', async () => {
    const { collect, buildManifest } = await import('../src/snapshot.mjs');
    const collected = await collect(FIXTURES);
    const manifest = buildManifest(collected, 'test-machine');
    assert.equal(manifest.schemaVersion, '1.0.0');
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
});

// --- Path normalization tests ---

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

// --- sanitizeSettings tests ---

describe('sanitizeSettings', () => {
  it('rewrites nvm-pinned node binary to PATH-resolved node', async () => {
    const { sanitizeSettings } = await import('../src/snapshot.mjs');
    const settings = {
      statusLine: {
        type: 'command',
        command: 'exec "$HOME/.nvm/versions/node/v25.6.0/bin/node" script.js'
      }
    };
    const sanitized = sanitizeSettings(settings);
    assert.equal(
      sanitized.statusLine.command,
      'exec "node" script.js',
      'nvm-pinned node path must become plain `node`'
    );
  });

  it('handles multiple nvm node references in the same value', async () => {
    const { sanitizeSettings } = await import('../src/snapshot.mjs');
    const settings = {
      statusLine: {
        command: '$HOME/.nvm/versions/node/v20.0.0/bin/node a.js && $HOME/.nvm/versions/node/v22.1.0/bin/node b.js'
      }
    };
    const sanitized = sanitizeSettings(settings);
    assert.equal(sanitized.statusLine.command, 'node a.js && node b.js');
  });

  it('leaves non-nvm paths untouched', async () => {
    const { sanitizeSettings } = await import('../src/snapshot.mjs');
    const settings = {
      statusLine: { command: '$HOME/.claude/hooks/status.sh' },
      env: { PATH: '/usr/local/bin:/usr/bin' }
    };
    const sanitized = sanitizeSettings(settings);
    assert.equal(sanitized.statusLine.command, '$HOME/.claude/hooks/status.sh');
    assert.equal(sanitized.env.PATH, '/usr/local/bin:/usr/bin');
  });

  it('handles null settings without throwing', async () => {
    const { sanitizeSettings } = await import('../src/snapshot.mjs');
    assert.equal(sanitizeSettings(null), null);
  });

  it('sanitizes settings end-to-end through exportSnapshot', async () => {
    const { exportSnapshot } = await import('../src/snapshot.mjs');
    const tar = await import('tar');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-sanitize-'));
    try {
      // Simulate the real layout: ~/.claude and ~/.nvm sit as siblings under
      // the user home. exportSnapshot takes dirname(claudeHome) as userHome,
      // so placing both under tempDir gets the exporter home normalized to
      // $HOME, and the nvm path becomes $HOME/.nvm/... — ready for rewrite.
      const srcHome = join(tempDir, '.claude');
      await mkdir(join(srcHome, 'plugins'), { recursive: true });
      await writeFile(join(srcHome, 'settings.json'), JSON.stringify({
        statusLine: {
          type: 'command',
          command: `exec "${tempDir}/.nvm/versions/node/v25.6.0/bin/node" idx.js`
        }
      }));
      await writeFile(join(srcHome, 'plugins/installed_plugins.json'),
        JSON.stringify({ version: 2, plugins: {} }));

      const tarPath = join(tempDir, 'snap.tar.gz');
      await exportSnapshot(srcHome, tarPath, { machineName: 'test' });

      const extractDir = join(tempDir, 'extracted');
      await mkdir(extractDir, { recursive: true });
      await tar.extract({ file: tarPath, cwd: extractDir });

      const settings = JSON.parse(
        await readFile(join(extractDir, 'settings.json'), 'utf-8')
      );
      assert.ok(
        !settings.statusLine.command.includes('.nvm/versions/node'),
        `exported settings must not retain nvm node path: ${settings.statusLine.command}`
      );
      assert.ok(settings.statusLine.command.includes('"node"'));
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });
});

// --- Apply CLI command tests ---

describe('apply plugin install command', () => {
  it('uses `claude plugin install`, not the removed `claude plugin add`', async () => {
    const srcPath = resolve(__dirname, '../src/snapshot.mjs');
    const source = await readFile(srcPath, 'utf-8');
    assert.ok(
      source.includes('claude plugin install '),
      'apply must shell out to `claude plugin install`'
    );
    assert.ok(
      !/claude plugin add\s/.test(source),
      '`claude plugin add` is not a valid CLI subcommand — regression guard'
    );
  });
});

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

// --- Export tests ---

describe('exportSnapshot', () => {
  it('creates a .tar.gz file', async () => {
    const { exportSnapshot } = await import('../src/snapshot.mjs');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-test-'));
    try {
      const outputPath = join(tempDir, 'test-snapshot.tar.gz');
      await exportSnapshot(FIXTURES, outputPath, { full: false, machineName: 'test' });
      assert.ok(await fileExists(outputPath), 'tarball should exist');
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it('tarball contains manifest.json as first entry', async () => {
    const { exportSnapshot, readManifestFromTar } = await import('../src/snapshot.mjs');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-test-'));
    try {
      const outputPath = join(tempDir, 'test-snapshot.tar.gz');
      await exportSnapshot(FIXTURES, outputPath, { full: false, machineName: 'test' });
      const manifest = await readManifestFromTar(outputPath);
      assert.ok(manifest, 'should read manifest from tarball');
      assert.equal(manifest.schemaVersion, '1.0.0');
      assert.equal(manifest.exportedFrom, 'test');
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it('tarball contains settings.json and global MDs', async () => {
    const { exportSnapshot, listTarEntries } = await import('../src/snapshot.mjs');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-test-'));
    try {
      const outputPath = join(tempDir, 'test-snapshot.tar.gz');
      await exportSnapshot(FIXTURES, outputPath, { full: false, machineName: 'test' });
      const entries = await listTarEntries(outputPath);
      assert.ok(entries.includes('manifest.json'));
      assert.ok(entries.includes('settings.json'));
      assert.ok(entries.includes('global-md/CLAUDE.md'));
      assert.ok(entries.includes('global-md/RTK.md'));
      assert.ok(entries.includes('hooks/test-hook.sh'));
      assert.ok(entries.some(e => e.includes('installed_plugins.json')));
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

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
});

// --- Diff tests ---

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

// --- Apply tests ---

describe('applySnapshot', () => {
  it('extracts tarball and writes files to target claude home', async () => {
    const { exportSnapshot, applySnapshot } = await import('../src/snapshot.mjs');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-apply-'));
    try {
      const tarPath = join(tempDir, 'snapshot.tar.gz');
      await exportSnapshot(FIXTURES, tarPath, { full: false, machineName: 'test' });

      const targetHome = join(tempDir, 'target-claude');
      await mkdir(targetHome, { recursive: true });
      await mkdir(join(targetHome, 'plugins'), { recursive: true });
      await writeFile(join(targetHome, 'plugins/installed_plugins.json'),
        JSON.stringify({ version: 2, plugins: {} }));
      await writeFile(join(targetHome, 'settings.json'), '{}');

      await applySnapshot(tarPath, targetHome, { skipInstall: true });

      const targetSettings = await readJsonSafe(join(targetHome, 'settings.json'));
      assert.ok(targetSettings.env, 'settings should have env');

      const targetMd = await readFile(join(targetHome, 'CLAUDE.md'), 'utf-8');
      assert.ok(targetMd.includes('Test CLAUDE.md'), 'CLAUDE.md should be copied');

      const targetHook = await readFile(join(targetHome, 'hooks/test-hook.sh'), 'utf-8');
      assert.ok(targetHook.includes('test hook'), 'hook should be copied');
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it('creates .bak backup of existing conflicting files', async () => {
    const { exportSnapshot, applySnapshot } = await import('../src/snapshot.mjs');
    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-backup-'));
    try {
      const tarPath = join(tempDir, 'snapshot.tar.gz');
      await exportSnapshot(FIXTURES, tarPath, { full: false, machineName: 'test' });

      const targetHome = join(tempDir, 'target-claude');
      await mkdir(targetHome, { recursive: true });
      await mkdir(join(targetHome, 'plugins'), { recursive: true });
      await writeFile(join(targetHome, 'plugins/installed_plugins.json'),
        JSON.stringify({ version: 2, plugins: {} }));

      // Write existing CLAUDE.md with different content
      await writeFile(join(targetHome, 'CLAUDE.md'), 'existing content');
      await writeFile(join(targetHome, 'settings.json'), '{"existing": true}');

      await applySnapshot(tarPath, targetHome, { skipInstall: true });

      const backup = await readFile(join(targetHome, 'CLAUDE.md.bak'), 'utf-8');
      assert.equal(backup, 'existing content', 'should backup original');
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });
});

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

// --- Round-trip integration test ---

describe('round-trip: export -> inspect -> diff -> apply', () => {
  it('exports from fixtures, applies to empty target, result matches', async () => {
    const {
      exportSnapshot, readManifestFromTar, diffSnapshot, applySnapshot, collect
    } = await import('../src/snapshot.mjs');

    const tempDir = await mkdtemp(join(tmpdir(), 'snapshot-roundtrip-'));
    try {
      const tarPath = join(tempDir, 'roundtrip.tar.gz');

      // 1. Export from fixtures
      const exportManifest = await exportSnapshot(FIXTURES, tarPath, { machineName: 'source' });
      assert.equal(exportManifest.exportedFrom, 'source');

      // 2. Inspect
      const inspectManifest = await readManifestFromTar(tarPath);
      assert.equal(inspectManifest.exportedFrom, 'source');
      assert.equal(inspectManifest.plugins.length, exportManifest.plugins.length);

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
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });
});
