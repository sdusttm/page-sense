# Snapshot Diff Feature - Update Summary

## What Was Added

A snapshot comparison feature that shows exactly what changed between iterations after each action executes.

## Changes Made

### 1. Added compareSnapshots Function
**Location**: Top of `AiBehaviorMonitor.tsx` (after imports)

```typescript
function compareSnapshots(oldSnapshot: string, newSnapshot: string) {
    // Line-by-line comparison
    // Returns: addedLines, removedLines, addedChars, addedElements, summary
}
```

### 2. Track Previous Snapshot
**Location**: Sequential execution loop initialization

```typescript
let previousSnapshot: string | null = null;
```

### 3. Show Diff After Each Snapshot
**Location**: After capturing snapshot in each iteration

```typescript
if (previousSnapshot) {
    const diff = compareSnapshots(previousSnapshot, snapshot);
    console.log(`📊 SNAPSHOT DIFF: ${diff.summary}`);
    // Log added lines
    // Log removed lines
    // Warn if no changes detected
}
```

### 4. Store Snapshot for Next Comparison
**Location**: End of each iteration

```typescript
previousSnapshot = snapshot;
```

## Output Format

### Summary Line
```
📊 SNAPSHOT DIFF: +1245 chars, +7 elements
```

### Added Content
```
➕ ADDED (15 lines):
   1. * [ID: 16]  [Declarations](/declarations)
   2. * [ID: 17]  [Reports](/reports)
   ...
   (shows first 20, then "... and X more lines")
```

### Removed Content
```
➖ REMOVED (2 lines):
   1. [Customs ▼]
   ...
   (shows first 10, then "... and X more lines")
```

### Warning for No Changes
```
⚠️ WARNING: No changes detected in snapshot after action!
```

## Why This Helps

### Problem Diagnosis
The diff immediately shows if:
- ✅ Dropdown content WAS captured (added lines show menu items)
- ❌ Dropdown content was NOT captured (no added elements)
- ⚠️ Captured too early (no changes detected)
- 📊 How much content changed (character/element counts)

### Example: Dropdown Issue
**If working correctly:**
```
[Iteration 1] click dropdown
[Iteration 2] 📊 SNAPSHOT DIFF: +1245 chars, +7 elements
[Iteration 2] ➕ ADDED: (shows all dropdown items with agent IDs)
```

**If NOT working:**
```
[Iteration 1] click dropdown
[Iteration 2] 📊 SNAPSHOT DIFF: +5 chars, +0 elements
⚠️ WARNING: No changes detected
```
→ Immediately tells you dropdown wasn't captured!

## Usage

### Basic Testing
1. Open http://localhost:3000
2. Open DevTools Console (F12)
3. Run any multi-step instruction
4. Watch the diff output between iterations

### What to Look For

#### Good Signs ✅
- Character count increases significantly
- Element count increases
- Added lines show target content
- Specific keywords appear in added lines

#### Bad Signs ❌
- Character count unchanged or minimal change
- Element count stays same (+0 elements)
- Warning about no changes
- Target keywords not in added lines

### Advanced Analysis

#### Search Added Content
```javascript
// After running test, in console:
// Look for specific keywords in added content
diff.addedLines.filter(line => line.includes('declaration'))
```

#### Count New Agent IDs
```javascript
// See how many interactive elements were added
const newIds = diff.addedLines
    .map(line => line.match(/\[ID: (\d+)\]/))
    .filter(Boolean)
    .length;
console.log('New interactive elements:', newIds);
```

## Files Modified

1. **AiBehaviorMonitor.tsx**
   - Added `compareSnapshots` function (lines ~9-30)
   - Added `previousSnapshot` variable (line ~93)
   - Added diff logging (lines ~107-135)
   - Store snapshot at end of iteration (line ~165)

2. **version.ts**
   - Updated BUILD_TIME to track this change

3. **Documentation**
   - Created `SNAPSHOT-DIFFING-FEATURE.md` - Full documentation
   - Created `SNAPSHOT-DIFF-UPDATE.md` - This file

## Performance Impact

### Minimal Overhead
- Set-based comparison is O(n) with n = number of lines
- Typical snapshot: 1000-5000 lines
- Comparison time: <5ms (negligible)
- Only compares when previousSnapshot exists (iteration 2+)

### Console Output
- Limited to first 20 added / 10 removed lines
- Prevents console spam
- Full arrays available in `diff` object if needed

## Configuration

### Show More Lines
Edit in AiBehaviorMonitor.tsx:
```typescript
diff.addedLines.slice(0, 20)    // Change to 50 for more
diff.removedLines.slice(0, 10)  // Change to 20 for more
```

### Disable Feature
Comment out the diff block:
```typescript
// if (previousSnapshot) { ... }
```

### Custom Metrics
Extend `compareSnapshots`:
```typescript
const addedButtons = (newSnapshot.match(/<button/g) || []).length -
                    (oldSnapshot.match(/<button/g) || []).length;
return { ...result, addedButtons };
```

## Expected Console Output

### Full Test Run Example
```
[Iteration 1/5] Starting...
[Snapshot] Annotated 15 interactive elements
(First iteration - no previous snapshot to compare)
[LLM Call] Sending snapshot...
[LLM Response] {commands: 1, isComplete: false}
[Iteration 1] Executing: click on agent_id="6"
[Iteration 1] Waiting 2000ms for UI to settle...

[Iteration 2/5] Starting...
[Snapshot] Annotated 22 interactive elements
[Iteration 2] 📊 SNAPSHOT DIFF: +1245 chars, +7 elements
[Iteration 2] ➕ ADDED (8 lines):
   1. * [ID: 16]  [Declarations](/declarations)
   2. * [ID: 17]  [Reports](/reports)
   3. * [ID: 18]  [Customs Entries](/entries)
   4. * [ID: 19]  [Settings](/settings)
   5. * [ID: 20]  [Export Data](/export)
   6. * [ID: 21]  [Import Data](/import)
   7. * [ID: 22]  [Close Menu] ✕
   8.   (dropdown container HTML)
[Iteration 2] ➖ REMOVED (1 lines):
   1. * [Customs ▼]
[LLM Call] Sending snapshot...
[LLM Response] {commands: 1, isComplete: true, firstCommand: {action: "click", agent_id: "16"}}
[Iteration 2] Executing: click on agent_id="16"
[Iteration 2] Task marked complete by LLM, stopping
✅ Successfully executed 2 actions
```

## Troubleshooting

### Not Seeing Diff Output
- Check browser console is open (F12)
- Look for `📊 SNAPSHOT DIFF:` messages
- Should appear starting from Iteration 2

### Diff Shows Wrong Changes
- Line-based comparison, so formatting changes show up
- Dynamic content (timestamps, random IDs) will differ
- This is expected, focus on meaningful content

### Too Much Output
- Reduce number of lines shown (edit slice parameters)
- Or temporarily disable by commenting out

## Next Steps

1. ✅ Feature implemented
2. ✅ Documentation created
3. ⏳ Test with real dropdown
4. ⏳ Analyze diff output
5. ⏳ Identify root cause of dropdown capture issue
6. ⏳ Apply appropriate fix

---

**Test it now to see exactly what's being captured after each action!**

The diff will immediately show if the dropdown content is making it into the snapshot. 🔍
