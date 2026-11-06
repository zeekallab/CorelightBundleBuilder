// electron-builder afterPack hook.
// 1. Strips the camera/mic/Bluetooth usage descriptions Electron's default
//    Info.plist ships, which this app never uses. macOS only.
// 2. electron-builder's own node_modules dependency-pruning step silently
//    drops some legitimately-required transitive deps (observed:
//    call-bind-apply-helpers, required by express's qs -> side-channel
//    chain, even though it's a normal non-dev dependency physically present
//    in root node_modules) regardless of the "files" glob config. Rather
//    than fight electron-builder's internal walker, replace its copy of
//    node_modules with a clean, PRODUCTION-ONLY install done in isolation
//    (see buildProdNodeModules) - copying the real root node_modules
//    wholesale was tried first and shipped electron-builder's own 200MB+
//    build-time deps (app-builder-bin, typescript, 7zip-bin, node-gyp...)
//    inside the app, which is exactly the opposite of minimal.
"use strict";

const { execFileSync } = require("node:child_process");
const { existsSync, cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const KEYS_TO_STRIP = [
  "NSCameraUsageDescription",
  "NSMicrophoneUsageDescription",
  "NSBluetoothAlwaysUsageDescription",
  "NSBluetoothPeripheralUsageDescription",
];

function fixInfoPlist(context) {
  if (context.electronPlatformName !== "darwin") return;

  const productName = context.packager.appInfo.productFilename;
  const plist = join(context.appOutDir, `${productName}.app`, "Contents", "Info.plist");
  if (!existsSync(plist)) {
    console.warn(`[afterPack] Info.plist not found at ${plist} - skipping permission strip.`);
    return;
  }

  for (const key of KEYS_TO_STRIP) {
    try {
      execFileSync("/usr/libexec/PlistBuddy", ["-c", `Delete :${key}`, plist], { stdio: "pipe" });
      console.log(`[afterPack] removed ${key} from Info.plist`);
    } catch {
      /* key absent - nothing to remove */
    }
  }
}

// electron-builder writes app-update.yml for its built-in autoUpdater, which
// this app's code never calls - dead weight either way.
function removeUpdateConfig(context) {
  const resourcesDir =
    context.electronPlatformName === "darwin"
      ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : join(context.appOutDir, "resources");
  const updateYml = join(resourcesDir, "app-update.yml");
  if (existsSync(updateYml)) {
    rmSync(updateYml, { force: true });
    console.log(`[afterPack] removed unused app-update.yml`);
  }
}

function appDir(context) {
  if (context.electronPlatformName === "darwin") {
    const productName = context.packager.appInfo.productFilename;
    return join(context.appOutDir, `${productName}.app`, "Contents", "Resources", "app");
  }
  return join(context.appOutDir, "resources", "app");
}

// Installs ONLY this app's runtime dependencies (package.json "dependencies",
// none of "devDependencies") into an isolated staging folder outside the
// real project tree, so electron and electron-builder's own build-time deps
// never enter the mix. Cached by a hash of the dependencies object - only
// reinstalls when that actually changes.
function buildProdNodeModules() {
  const rootDir = join(__dirname, "..");
  const rootPkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
  const stagingDir = join(rootDir, ".prod-node-modules-staging");
  const stagingNodeModules = join(stagingDir, "node_modules");
  const stampFile = join(stagingDir, ".deps-hash");
  const depsHash = JSON.stringify(rootPkg.dependencies || {});

  if (existsSync(stagingNodeModules) && existsSync(stampFile) && readFileSync(stampFile, "utf8") === depsHash) {
    console.log("[afterPack] reusing cached production-only node_modules");
    return stagingNodeModules;
  }

  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  writeFileSync(
    join(stagingDir, "package.json"),
    JSON.stringify({ name: "cbb-prod-deps", private: true, dependencies: rootPkg.dependencies }, null, 2)
  );
  // On Windows npm is a .cmd shim, not resolvable by execFileSync without shell:true.
  execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: stagingDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  writeFileSync(stampFile, depsHash);
  return stagingNodeModules;
}

function fixNodeModules(context) {
  const dest = join(appDir(context), "node_modules");
  if (!existsSync(join(appDir(context), "package.json"))) {
    console.warn("[afterPack] skipping node_modules replacement - app dir not found as expected.");
    return;
  }

  const srcRoot = buildProdNodeModules();
  rmSync(dest, { recursive: true, force: true });
  cpSync(srcRoot, dest, { recursive: true });
  console.log(`[afterPack] replaced node_modules with a production-only install at ${dest}`);
}

module.exports = async function afterPack(context) {
  fixInfoPlist(context);
  fixNodeModules(context);
  removeUpdateConfig(context);
};
