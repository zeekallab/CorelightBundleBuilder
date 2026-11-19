// Launch the Electron app with a clean environment — strips
// ELECTRON_RUN_AS_NODE/ELECTRON_NO_ATTACH_CONSOLE so `npm run app:dev` works
// regardless of ambient shell exports.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;

const child = spawn(electronPath, [".", ...process.argv.slice(2)], { stdio: "inherit", env });
child.on("close", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("Failed to launch Electron:", err.message);
  process.exit(1);
});
