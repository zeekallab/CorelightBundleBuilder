# Corelight Bundle Builder

Build a custom Corelight sensor bundle from a list of package git URLs, and optionally upload it straight to Fleet Manager.

## Download

- **Windows:** [Corelight Bundle Builder Setup.exe](../../releases/latest/download/Corelight.Bundle.Builder.Setup.1.1.0.exe)
- **macOS (Apple Silicon):** [Corelight Bundle Builder.dmg](../../releases/latest/download/Corelight.Bundle.Builder-1.1.0-arm64.dmg)

The macOS build is signed and notarized — it opens normally with no warnings.
The Windows build is still unsigned, so SmartScreen will prompt: click "More
info" → "Run anyway".

If the app icon appears in the Dock/taskbar but no window shows up, quit any
other running copy first (only one instance can run at a time) and relaunch.

## What it does

- Paste package git URLs (one per line, or one at a time) with a branch/tag/commit for each.
- Or load one or more existing `.bundle` files to extend them — their package lists get merged (duplicates collapsed) into one list you can add, edit, or remove from.
- Click **Build Bundle** to download the result, or check **Upload to Fleet Manager** to push it to your Fleet and optionally assign it to a sensor policy.

Runs entirely on your machine. Nothing leaves it except the direct request to your own Fleet Manager if you choose to upload.

## Development

```sh
npm install
npm run app:dev     # run as a desktop app
npm run app:build   # produce a .dmg / .exe in dist/
```
