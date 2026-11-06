// electron-builder afterPack hook.
// 1. Strips the camera/mic/Bluetooth usage descriptions Electron's default
//    Info.plist ships, which this app never uses. macOS only.
// 2. electron-builder's own node_modules dependency-pruning step silently
//    drops some legitimately-required transitive deps (observed:
//    call-bind-apply-helpers, required by express's qs -> side-channel
//    chain, even though it's a normal non-dev dependency physically present
//    in root node_modules) regardless of the "files" glob config. Rather
//    than fight electron-builder's internal walker, overwrite its copy of
//    node_modules with a verbatim copy of the real one post-pack. Runs on
//    every platform.
"use strict";

const { execFileSync } = require("node:child_process");
const { existsSync, cpSync, rmSync } = require("node:fs");
const { join } = require("node:path");

const KEYS_TO_STRIP = [
  "NSCameraUsageDescription",
  "NSMicrophoneUsageDescription",
  "NSBluetoothAlwaysUsageDescription",
  "NSBluetoothPeripheralUsageDescription",
];

const SKIP_TOP_LEVEL = new Set(["electron", "electron-builder", ".bin"]);

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

function appDir(context) {
  if (context.electronPlatformName === "darwin") {
    const productName = context.packager.appInfo.productFilename;
    return join(context.appOutDir, `${productName}.app`, "Contents", "Resources", "app");
  }
  return join(context.appOutDir, "resources", "app");
}

function fixNodeModules(context) {
  const srcRoot = join(__dirname, "..", "node_modules");
  const dest = join(appDir(context), "node_modules");
  if (!existsSync(srcRoot) || !existsSync(join(appDir(context), "package.json"))) {
    console.warn("[afterPack] skipping node_modules overwrite - app dir not found as expected.");
    return;
  }

  rmSync(dest, { recursive: true, force: true });
  cpSync(srcRoot, dest, {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(srcRoot.length + 1).split(/[\\/]/)[0];
      return !rel || !SKIP_TOP_LEVEL.has(rel);
    },
  });
  console.log(`[afterPack] replaced node_modules with the full root copy at ${dest}`);
}

module.exports = async function afterPack(context) {
  fixInfoPlist(context);
  fixNodeModules(context);
};
