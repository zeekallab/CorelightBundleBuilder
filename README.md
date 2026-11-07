# Corelight Bundle Builder

Build a custom Corelight sensor bundle from a list of package git URLs, and optionally upload it straight to Fleet Manager.

## Download

- **Windows:** [Corelight Bundle Builder Setup.exe](../../releases/latest/download/Corelight.Bundle.Builder.Setup.1.0.3.exe)
- **macOS (Apple Silicon):** [Corelight Bundle Builder.dmg](../../releases/latest/download/Corelight.Bundle.Builder-1.0.3-arm64.dmg)

The app is unsigned, so first launch is blocked:
- **macOS** may say the app "is damaged and can't be opened" — that's Gatekeeper, not real corruption. Fix: `xattr -dr com.apple.quarantine "/Applications/Corelight Bundle Builder.app"` (or wherever you placed it), then open normally. Right-click → Open doesn't always clear this message.
- **Windows:** click "More info" → "Run anyway" on the SmartScreen prompt.
- If the app icon appears in the Dock/taskbar but no window shows up, quit any other running copy first (only one instance can run at a time) and relaunch.

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
