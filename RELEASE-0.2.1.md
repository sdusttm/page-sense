# Release Notes - v0.2.1

## 🔍 Debugging & Diagnostics Release

**Release Date**: March 9, 2026

This is a **patch release** focused on improving debugging capabilities to diagnose sequential action issues, particularly with dropdown content capture.

---

## 🎯 What's New

### Snapshot Diffing
The headline feature of this release - see exactly what changed between snapshots after each action!

**Before:**
```
[Iteration 1] Executing: click dropdown
[Iteration 2] Starting...
(No visibility into what changed)
```

**After:**
```
[Iteration 1] Executing: click dropdown
[Iteration 2] 📊 SNAPSHOT DIFF: +1245 chars, +7 elements
[Iteration 2] ➕ ADDED (8 lines):
   1. * [ID: 16]  [Declarations](/declarations)
   2. * [ID: 17]  [Reports](/reports)
   ...
```

**Key Benefits:**
- ✅ Instantly see if dropdown content was captured
- ✅ Identify exactly what appeared/disappeared
- ✅ Warning when no changes detected (timing issue indicator)
- ✅ Verify interactive elements were annotated

### Enhanced Debug Logging

Added comprehensive logging throughout the execution flow:

```javascript
[Iteration X] Starting...
[Snapshot] Annotated 22 interactive elements
[Snapshot] Size: 6543 chars
[Snapshot] Contains "declaration"? true
[Snapshot] Contains "customs"? true
[Snapshot] First 50 lines: (preview)
[Iteration X] 📊 SNAPSHOT DIFF: +1245 chars, +7 elements
[LLM Call] Sending snapshot (6543 chars)...
[LLM Response] {commands: 1, isComplete: false}
[Iteration X] Executing: click on agent_id="16"
[Iteration X] Waiting 2000ms for UI to settle...
```

### Improved Timing

Increased wait times to allow dropdowns and dynamic content to fully render:
- Post-click delay: `1500ms` → `2000ms`
- Pre-snapshot delay: `800ms` → `1200ms`
- Total wait per action: `3200ms` (was `2300ms`)

---

## 🐛 Problem This Solves

### Issue
After clicking to open a dropdown, the second snapshot wasn't capturing the dropdown content, causing the LLM to fail finding the next element.

### Root Cause Unknown
Could be:
- Timing (not enough wait time)
- DOM structure (dropdown in portal)
- Visibility (hidden elements)
- Annotation (elements not marked)

### Solution
This release adds diagnostic tools to **identify** the root cause:

1. **Snapshot diff** shows if content was captured
2. **Element count** shows if new elements appeared
3. **Keyword search** verifies target content is present
4. **Preview** lets you see actual captured content
5. **Warnings** alert when something's wrong

---

## 🔧 Changes

### Code Changes

#### compareSnapshots Function
New utility function that compares two snapshots:

```typescript
function compareSnapshots(oldSnapshot: string, newSnapshot: string) {
    // Returns:
    // - addedLines: string[]
    // - removedLines: string[]
    // - addedChars: number
    // - addedElements: number (based on [ID: X] count)
    // - summary: string
}
```

#### Snapshot Tracking
```typescript
let previousSnapshot: string | null = null;

// After each iteration:
previousSnapshot = snapshot; // Store for next comparison
```

#### Diff Logging
```typescript
if (previousSnapshot) {
    const diff = compareSnapshots(previousSnapshot, snapshot);
    console.log(`📊 SNAPSHOT DIFF: ${diff.summary}`);
    // Log added/removed lines
    // Warn if no changes
}
```

### Timing Changes

**AiBehaviorMonitor.tsx line ~136:**
```typescript
// Before
const delay = isUIChangingAction ? 1500 : 500;

// After
const delay = isUIChangingAction ? 2000 : 500;
```

**AiBehaviorMonitor.tsx line ~45:**
```typescript
// Before
await new Promise(resolve => setTimeout(resolve, 800));

// After
await new Promise(resolve => setTimeout(resolve, 1200));
```

---

## 📦 Installation

### From npm (after publishing)
```bash
npm install page-sense-library@0.2.1
```

### Update Existing Installation
```bash
npm update page-sense-library
```

### Local Development
```bash
cd packages/page-sense-library
pnpm build
```

---

## 🧪 Testing

### Basic Test
1. Navigate to your app with TrackerProvider
2. Open DevTools Console (F12)
3. Click "👁️ AI Monitor"
4. Test: `"Open menu and click settings"` (or any multi-step task)
5. Watch the console for diff output

### Expected Output

**Good Case (Dropdown Captured):**
```
[Iteration 2] 📊 SNAPSHOT DIFF: +1200 chars, +5 elements
[Iteration 2] ➕ ADDED (8 lines):
   1. * [ID: 16]  [Settings](/settings)
   2. * [ID: 17]  [Profile](/profile)
   ...
```

**Bad Case (Dropdown Not Captured):**
```
[Iteration 2] 📊 SNAPSHOT DIFF: +10 chars, +0 elements
⚠️ WARNING: No changes detected in snapshot after action!
```

### Diagnosis

If you see the warning or `+0 elements`:
1. Dropdown is opening but not in snapshot
2. Possible causes:
   - Dropdown in React Portal (outside body)
   - Not enough wait time (try increasing further)
   - Dropdown uses shadow DOM
   - Visibility/display CSS issues

See `DROPDOWN-SNAPSHOT-DEBUGGING.md` for detailed troubleshooting steps.

---

## 📊 Performance Impact

### Added Overhead
- Snapshot comparison: ~5ms per iteration (negligible)
- Console logging: ~2ms (negligible)
- Increased wait times: +900ms per action
  - Total time for 2-action task: ~7-11 seconds (was 5-9 seconds)

### Trade-off
Slightly slower execution in exchange for:
- ✅ Better reliability (more time for UI to settle)
- ✅ Diagnostic visibility (identify issues quickly)
- ✅ Developer experience (understand what's happening)

---

## 📚 Documentation

### New Files
- `SNAPSHOT-DIFFING-FEATURE.md` - Complete feature guide
  - Implementation details
  - Diagnostic use cases
  - Advanced usage
  - Configuration options

- `SNAPSHOT-DIFF-UPDATE.md` - Technical implementation summary
  - Code changes
  - Expected output
  - Troubleshooting

- `DROPDOWN-SNAPSHOT-DEBUGGING.md` - Debugging guide
  - Root cause analysis
  - Manual inspection steps
  - Potential fixes
  - Test scenarios

### Updated Files
- `CHANGELOG.md` - Version history updated
- `RELEASE-0.2.1.md` - This file

---

## 🔄 Migration Guide

### From 0.2.0 to 0.2.1

**No Breaking Changes!** This is a drop-in replacement.

#### What Changes Automatically
- More debug output in console (can be disabled if needed)
- Slightly longer execution time per action
- Snapshot diffing between iterations

#### Optional Configuration

**Reduce console output** (if too verbose):
```typescript
// In AiBehaviorMonitor.tsx, comment out:
// console.log(`[Snapshot] First 50 lines:`, ...);
```

**Adjust timing** (if still having issues):
```typescript
// Line ~136 - Post-click delay
const delay = isUIChangingAction ? 3000 : 500; // Increase to 3000ms

// Line ~45 - Pre-snapshot delay
await new Promise(resolve => setTimeout(resolve, 1500)); // Increase to 1500ms
```

**Show more diff lines** (for deeper analysis):
```typescript
// Line ~120 - Show first 50 added lines instead of 20
diff.addedLines.slice(0, 50)
```

---

## 🎉 Use Cases

### Use Case 1: Diagnose Dropdown Issues
**Scenario**: Multi-step task fails because dropdown content isn't captured

**Solution**:
1. Check snapshot diff after dropdown click
2. If `+0 elements`, dropdown wasn't captured
3. Follow debugging guide to identify root cause

### Use Case 2: Verify Action Success
**Scenario**: Not sure if action actually changed the page

**Solution**:
1. Look at diff after action
2. If significant changes, action worked
3. If no changes, action might have failed silently

### Use Case 3: Optimize Timing
**Scenario**: Actions too slow, want to reduce delays

**Solution**:
1. Check diff timing
2. If changes appear consistently, can reduce delays
3. Monitor for regression

### Use Case 4: Debug New Features
**Scenario**: Adding new interaction patterns to your app

**Solution**:
1. Test with AI agent
2. Use diff to see if new elements are captured
3. Adjust timing or structure as needed

---

## 🐛 Known Issues

### 1. Snapshot Diff Noise
**Issue**: Dynamic content (timestamps, IDs) shows as changes
**Workaround**: Focus on meaningful content (element structure, text)
**Fix**: Consider semantic diffing in future release

### 2. Console Spam
**Issue**: Many logs can clutter console
**Workaround**: Filter console by `[Iteration]` or disable some logs
**Fix**: Add verbosity levels in future release

### 3. Line-based Comparison
**Issue**: Formatting changes show as add+remove
**Workaround**: Look at summary stats (char/element counts)
**Fix**: Consider structure-aware diffing in future

---

## 🔮 Future Enhancements

Based on feedback from this diagnostic release:

- [ ] Semantic snapshot diffing (ignore formatting)
- [ ] Configurable verbosity levels
- [ ] Visual diff UI in the AI Monitor panel
- [ ] Automatic root cause suggestions
- [ ] Snapshot history/replay
- [ ] Performance profiling dashboard

---

## 📝 License

MIT License - see LICENSE file for details

---

## 🙏 Feedback

Found the snapshot diffing helpful? Having issues?
- GitHub: https://github.com/sdusttm/page-sense
- Issues: https://github.com/sdusttm/page-sense/issues

---

**Use snapshot diffing to diagnose and fix sequential action issues faster!** 🔍
