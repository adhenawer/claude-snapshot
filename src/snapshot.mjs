import { readFile, readdir, stat, writeFile, mkdir, rm, chmod } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { homedir, hostname } from 'node:os';
import * as tar from 'tar';

// --- Constants ---

const GLOBAL_MD_PATTERN = /\.md$/;
const SCHEMA_VERSION = '1.0.0';
const SUPPORTED_SCHEMA_MAJOR = 1;
const SETTINGS_FILE = 'settings.json';
const INSTALLED_PLUGINS = 'plugins/installed_plugins.json';
const KNOWN_MARKETPLACES = 'plugins/known_marketplaces.json';
const BLOCKLIST = 'plugins/blocklist.json';
const HOOKS_DIR = 'hooks';

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

// normalizePaths rewrites <user-home> → $HOME, but some paths stay
// machine-specific afterwards — notably nvm-managed Node binaries which pin
// a Node version (e.g. `$HOME/.nvm/versions/node/v25.6.0/bin/node`) that
// rarely exists on the target. Rewrite those to `node` so the target shell
// resolves them from PATH instead.
export function sanitizeSettings(obj) {
  if (!obj) return obj;
  const json = JSON.stringify(obj);
  const replaced = json.replace(
    /\$HOME\/\.nvm\/versions\/node\/[^/"\s]+\/bin\/node/g,
    'node'
  );
  return JSON.parse(replaced);
}

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

// --- Collector ---

export async function collect(claudeHome) {
  // Read settings.json
  const settingsPath = join(claudeHome, SETTINGS_FILE);
  const settings = await readJsonSafe(settingsPath);

  // Collect global .md files (top-level only)
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
      const entry = entries[0];
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
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exportedFrom: machineName || hostname(),
    plugins,
    marketplaces,
    hooks: hooks.map(h => `hooks/${h.name}`),
    globalMd: globalMd.map(m => m.name),
    checksums,
  };
}

// --- Tarball export ---

export async function exportSnapshot(claudeHome, outputPath, options = {}) {
  const { full = false, machineName } = options;
  const collected = await collect(claudeHome);
  const manifest = buildManifest(collected, machineName);

  // Determine the home dir for path normalization
  // claudeHome is the .claude directory; the user home is its parent
  const userHome = dirname(claudeHome);

  // Normalize paths in settings, then sanitize machine-specific absolute
  // paths that survive $HOME normalization (e.g. nvm Node binary pins).
  const normalizedSettings = collected.settings
    ? sanitizeSettings(normalizePaths(collected.settings, userHome))
    : null;

  // Create temp staging dir
  const stagingDir = outputPath + '.staging';
  await mkdir(stagingDir, { recursive: true });

  try {
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

    // Build list of entries to include
    const entries = ['manifest.json'];
    if (normalizedSettings) entries.push('settings.json');
    if (collected.globalMd.length > 0) entries.push('global-md');
    if (collected.hooks.length > 0) entries.push('hooks');
    // Always include plugins dir if any manifest exists
    if (collected.installedPlugins || collected.knownMarketplaces || collected.blocklist) {
      entries.push('plugins');
    }

    // Create tarball
    await tar.create(
      { gzip: true, file: outputPath, cwd: stagingDir },
      entries
    );
  } finally {
    // Clean up staging
    await rm(stagingDir, { recursive: true, force: true });
  }

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

export async function listTarEntries(tarPath) {
  const entries = [];
  await tar.list({
    file: tarPath,
    onReadEntry(entry) {
      const p = entry.path.replace(/\/$/, '');
      if (p) entries.push(p);
    }
  });
  return entries;
}

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

  // Diff settings
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

// --- Apply ---

export async function applySnapshot(tarPath, claudeHome, options = {}) {
  const { skipInstall = false } = options;
  const actualHome = dirname(claudeHome);

  // Extract tarball to temp staging dir
  const stagingDir = tarPath + '.apply-staging';
  await mkdir(stagingDir, { recursive: true });

  try {
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
      const dir = dirname(targetPath);
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
          // Route child output to our stderr so the user sees install
          // progress without polluting the JSON we print on stdout.
          execSync(`claude plugin install ${pluginId}`, {
            stdio: ['ignore', process.stderr, process.stderr],
          });
        } catch (e) {
          console.error(`Warning: failed to install ${pluginId}: ${e.message}`);
        }
      }
    }

    return manifest;
  } finally {
    // Clean up staging
    await rm(stagingDir, { recursive: true, force: true });
  }
}

// --- CLI entry point ---

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
