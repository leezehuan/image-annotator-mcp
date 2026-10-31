const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { resolveCherryFilesDirectory } = require('../cherry-cache.js');

async function main() {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'cherry-directory-'));
  const bootConfigPath = path.join(fixture, 'boot-config.json');
  const fallbackUserDataDirectory = path.join(fixture, 'old-default');
  const fallback = path.join(fallbackUserDataDirectory, 'Data', 'Files');
  const customRoot = path.join(fixture, 'custom-data');
  const customFiles = path.join(customRoot, 'Data', 'Files');
  const options = { filesDirectory: '', bootConfigPath, fallbackUserDataDirectory };

  try {
    await fs.mkdir(fallback, { recursive: true });
    assert.equal(await resolveCherryFilesDirectory(options), fallback);
    await fs.mkdir(customFiles, { recursive: true });
    await fs.writeFile(bootConfigPath, JSON.stringify({
      'app.user_data_path': { 'Cherry Studio.exe': customRoot }
    }));
    assert.equal(await resolveCherryFilesDirectory(options), customFiles);
    process.stdout.write('PASS Cherry custom data directory takes precedence over a stale default cache\n');

    await fs.writeFile(bootConfigPath, JSON.stringify({
      'app.user_data_path': { 'Cherry Studio.exe': path.join(fixture, 'offline-drive') }
    }));
    await assert.rejects(resolveCherryFilesDirectory(options), /configured cache is unavailable/);
    assert.equal(await resolveCherryFilesDirectory({ ...options, filesDirectory: customFiles }), customFiles);
    await assert.rejects(
      resolveCherryFilesDirectory({ ...options, filesDirectory: path.join(fixture, 'missing') }),
      /CHERRY_STUDIO_FILES_DIR must point to Data\/Files/
    );
    process.stdout.write('PASS unavailable configured data does not silently use a different cache\n');

    await fs.writeFile(bootConfigPath, JSON.stringify({
      'app.user_data_path': { 'Cherry Studio.exe': customRoot, 'portable.exe': fallbackUserDataDirectory }
    }));
    await assert.rejects(resolveCherryFilesDirectory(options), /multiple data directories/);
    process.stdout.write('PASS ambiguous installations require an explicit cache directory\n');
  } finally {
    await fs.rm(fixture, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
