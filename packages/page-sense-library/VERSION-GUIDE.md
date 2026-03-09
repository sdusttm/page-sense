# Version Display Guide

## What It Is

The AI Monitor now shows the library version in **green text** below the title:

```
🧠 AI Behavior Intake
v0.1.3-dev              ← This confirms you're using the latest version!
```

Hover over the version to see the build timestamp.

## Why It's Useful

**Before:** Hard to know if app_home picked up your latest library changes
**After:** Just look at the version number - if it matches what you expect, you're good!

## How to Update Version

### Method 1: Quick Bump (Recommended)

```bash
cd /Users/mtian/page-sense/packages/page-sense-library
./bump-version.sh
```

This automatically:
1. Updates `BUILD_TIME` to current timestamp
2. Rebuilds the library
3. Shows what version will display

### Method 2: Manual Update

Edit `src/version.ts`:
```typescript
export const VERSION = '0.1.3-dev';
export const BUILD_TIME = '2026-03-08T17:30:00Z'; // ← Update this!
```

Then rebuild:
```bash
pnpm build
```

## Verification

After rebuilding, check app_home:

1. **Start/Refresh app_home:**
   ```bash
   cd /Users/mtian/flexone/client_app/app_home
   pnpm dev
   ```

2. **Open browser:** http://localhost:47003

3. **Click AI Monitor button** (bottom right)

4. **Look for version:** Should show `v0.1.3-dev` in green

5. **Hover over version:** Should show recent build time

## Version Naming

Use semantic versioning with dev suffix:

- `0.1.3-dev` - Development version (current)
- `0.1.3` - Stable release
- `0.2.0-dev` - Next minor version in development
- `1.0.0` - Major release

## Workflow

### During Development

```bash
# Terminal 1: Watch and auto-rebuild (updates BUILD_TIME on each rebuild)
./watch-and-build.sh

# Terminal 2: Run app_home
cd /Users/mtian/flexone/client_app/app_home
pnpm dev

# Make changes to src/
# → Watch script rebuilds automatically
# → app_home hot-reloads
# → Refresh browser to see new version timestamp
```

### When Making Significant Changes

```bash
# Bump version and rebuild
./bump-version.sh

# Or manually update version.ts and rebuild
vim src/version.ts
pnpm build
```

### Before Committing

```bash
# Bump version to confirm it's a new build
./bump-version.sh

# Commit
git add -A
git commit -m "feat: your changes"
git push origin main
```

## Troubleshooting

### Version Not Updating in Browser

**Problem:** Still shows old version after rebuild

**Solutions:**
1. **Hard refresh browser:** `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
2. **Restart dev server:**
   ```bash
   # In app_home terminal
   Ctrl+C
   pnpm dev
   ```
3. **Verify library was rebuilt:**
   ```bash
   ls -lh dist/index.mjs
   # Check timestamp is recent
   ```
4. **Check built file has new version:**
   ```bash
   grep "0.1.3-dev" dist/index.mjs
   ```

### Version Shows "undefined"

**Problem:** Version not exported correctly

**Fix:**
1. Check `src/version.ts` exists
2. Check `src/components/AiBehaviorMonitor.tsx` imports it:
   ```typescript
   import { VERSION, BUILD_TIME } from '../version';
   ```
3. Rebuild: `pnpm build`

### Version Shows Old Number

**Problem:** Browser cached old version

**Fix:**
1. Hard refresh: `Cmd+Shift+R`
2. Or clear browser cache
3. Or open in incognito mode

## File Locations

```
page-sense-library/
├── src/
│   ├── version.ts              ← Version definition
│   └── components/
│       └── AiBehaviorMonitor.tsx  ← Displays version
├── dist/
│   ├── index.mjs               ← Built file (check version here)
│   └── index.js
├── bump-version.sh             ← Quick update script
├── watch-and-build.sh          ← Auto-rebuild on changes
└── package.json                ← NPM version (0.1.3-dev)
```

## Example Output

### In Browser
```
┌──────────────────────────────────┐
│ 🧠 AI Behavior Intake            │
│ v0.1.3-dev          ⏸️  ✕      │  ← Version in green
├──────────────────────────────────┤
│ [Type command here]    [Cmd]     │
│ [✨ Draw AI Visualization]       │
└──────────────────────────────────┘
```

### In Terminal (bump-version.sh)
```
🔄 Bumping version timestamp...
✅ Updated BUILD_TIME to: 2026-03-08T17:45:23Z

📦 Version: 0.1.3-dev
🕐 Build Time: 2026-03-08T17:45:23Z

🔨 Rebuilding library...
[build output...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Version bumped and library rebuilt!

The AI Monitor will now show:
  v0.1.3-dev
  Built: 2026-03-08T17:45:23Z

💡 app_home will auto-reload if dev server is running
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Tips

1. **Always bump before testing** - Easy way to confirm new code is running
2. **Check version first** - Before debugging, verify you're testing latest version
3. **Use in development** - Helps track which version caused issues
4. **Document in commits** - Reference version in git commits for traceability

## Quick Reference

```bash
# Bump version and rebuild
./bump-version.sh

# Just rebuild (keeps same timestamp)
pnpm build

# Watch and auto-rebuild
./watch-and-build.sh

# Check current version in dist
grep "VERSION = " dist/index.mjs

# Verify in app_home
cd /Users/mtian/flexone/client_app/app_home
./verify-library.sh
```

## Summary

✅ **Version displayed in UI** - Easy visual confirmation
✅ **Build timestamp on hover** - Know exactly when it was built
✅ **Quick bump script** - One command to update
✅ **Auto-updates in dev** - Watch mode keeps version current

Look for the **green v0.1.3-dev** text in the AI Monitor! 🟢
