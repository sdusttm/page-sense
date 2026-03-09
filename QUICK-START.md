# Quick Start - page-sense-library Development

## Setup Complete ✅

Your local page-sense-library is now linked to the app_home project!

## Directory Structure
```
/Users/mtian/page-sense/               ← YOU ARE HERE
├── packages/page-sense-library/       ← Edit source code here
│   ├── src/                          ← TypeScript source files
│   └── dist/                         ← Built files (auto-generated)
└── apps/host/                        ← Demo app

/Users/mtian/flexone/client_app/
└── app_home/                         ← Uses your local library via symlink
```

## Development Commands

### In page-sense-library

```bash
# Build once
cd /Users/mtian/page-sense/packages/page-sense-library
pnpm build

# Watch mode (auto-rebuild on changes) - RECOMMENDED
pnpm dev
```

### In app_home

```bash
# Start dev server
cd /Users/mtian/flexone/client_app/app_home
pnpm dev

# Access at:
https://app.local.trade-dev.flexport.com/home
```

## Workflow

1. **Open two terminals:**
   - Terminal 1: `cd /Users/mtian/page-sense/packages/page-sense-library && pnpm dev`
   - Terminal 2: `cd /Users/mtian/flexone/client_app/app_home && pnpm dev`

2. **Edit files** in `/Users/mtian/page-sense/packages/page-sense-library/src/`

3. **Watch Terminal 1** for build success

4. **Refresh browser** to see changes

## Key Files to Edit

### TrackerProvider.tsx
- Event tracking logic
- Context provider setup
- Data-agent-id injection

### AiBehaviorMonitor.tsx
- UI component (chat interface)
- Event display
- API communication

### index.ts
- Exports (what's available to import)

## Testing Your Changes

1. Make changes to source files
2. Watch build complete (if using `pnpm dev`)
3. Refresh `https://app.local.trade-dev.flexport.com/home`
4. Click AI Monitor icon (👁️) in bottom-right
5. Test commands like:
   - "Click the navigation button"
   - "Show me the events"
   - "Fill in the search box"

## Debugging

### Add Console Logs
```typescript
// In any .tsx file
console.log('[DEBUG] My variable:', myVariable);
```

### Check Browser Console
```
Cmd+Option+I (Chrome DevTools)
Console tab → Look for [DEBUG] logs
```

### Check Terminal Output
```
Watch for TypeScript errors in Terminal 1 (build)
Watch for runtime errors in Terminal 2 (dev server)
```

## Common Issues

### Changes not appearing?
- Rebuild: `pnpm build` in page-sense-library
- Clear cache: `rm -rf .next` in app_home
- Hard refresh: Cmd+Shift+R in browser

### Build fails?
- Check TypeScript errors in Terminal 1
- Verify syntax in changed files
- Run `pnpm install` if dependencies missing

### Symlink broken?
```bash
cd /Users/mtian/flexone/client_app
pnpm install
```

## Documentation

- Full setup: `/Users/mtian/flexone/client_app/app_home/LOCAL-PAGE-SENSE-SETUP.md`
- Integration: `/Users/mtian/flexone/client_app/app_home/PAGE-SENSE-INTEGRATION.md`
- API endpoint: `/Users/mtian/flexone/client_app/app_home/src/app/api/agent/route.ts`

## Publishing Changes

When you're ready to publish:

1. Commit changes in page-sense repo
2. Update version in package.json
3. Build: `pnpm build`
4. Publish: `npm publish`
5. Update app_home to use new version

## Need Help?

- Check TypeScript errors: Look at Terminal 1 output
- Check runtime errors: Browser DevTools console
- Check API errors: Terminal 2 (Next.js server logs)
- Read source code: Files are well-commented
