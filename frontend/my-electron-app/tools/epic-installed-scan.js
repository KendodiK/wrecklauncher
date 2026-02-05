#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function getEpicManifestsDir() {
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  return path.join(programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
}

function safeReadJson(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(text);
}

function toGame(itemJson) {
  // Epic uses PascalCase keys in .item JSON.
  return {
    appName: itemJson.AppName ?? null,
    displayName: itemJson.DisplayName ?? null,
    catalogItemId: itemJson.CatalogItemId ?? null,
    namespace: itemJson.Namespace ?? null,
    installLocation: itemJson.InstallLocation ?? null,
    launchExecutable: itemJson.LaunchExecutable ?? null,
    mainGameAppName: itemJson.MainGameAppName ?? null,
    appVersionString: itemJson.AppVersionString ?? null,
    installationGuid: itemJson.InstallationGuid ?? null,
  };
}

function main() {
  const manifestsDir = getEpicManifestsDir();

  if (!fs.existsSync(manifestsDir)) {
    // No launcher installed, or no manifests.
    process.stdout.write(JSON.stringify([]));
    return;
  }

  const files = fs
    .readdirSync(manifestsDir)
    .filter((f) => f.toLowerCase().endsWith('.item'))
    .map((f) => path.join(manifestsDir, f));

  const games = [];
  for (const file of files) {
    try {
      const json = safeReadJson(file);
      games.push(toGame(json));
    } catch (e) {
      // Ignore broken/partial manifests.
    }
  }

  games.sort((a, b) => String(a.displayName || a.appName || '').localeCompare(String(b.displayName || b.appName || '')));

  process.stdout.write(JSON.stringify(games));
}

main();
