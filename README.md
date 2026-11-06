# Corelight Bundle Builder

Build a custom Corelight sensor bundle from a list of package git URLs, and optionally upload it straight to Fleet Manager.

## Download

- **Windows:** [Corelight Bundle Builder Setup.exe](../../releases/latest/download/Corelight.Bundle.Builder.Setup.0.1.0.exe)
- **macOS (Apple Silicon):** [Corelight Bundle Builder.dmg](../../releases/latest/download/Corelight.Bundle.Builder-0.1.0-arm64.dmg)

First launch is blocked by Gatekeeper/SmartScreen since the app is unsigned:
- macOS: right-click the app → Open
- Windows: "More info" → "Run anyway"

## What it does

- Paste package git URLs (one per line, or one at a time) with a branch/tag/commit for each.
- Or load an existing `.bundle` file to extend it — add, edit, or remove packages on top of what's already there.
- Click **Build Bundle** to download the result, or check **Upload to Fleet Manager** to push it to your Fleet and optionally assign it to a sensor policy.

Runs entirely on your machine. Nothing leaves it except the direct request to your own Fleet Manager if you choose to upload.

## Development

```sh
npm install
npm run app:dev     # run as a desktop app
npm run app:build   # produce a .dmg / .exe in dist/
```
