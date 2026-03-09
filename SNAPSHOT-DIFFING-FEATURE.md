# Snapshot Diffing Feature

## Overview
Added snapshot comparison between iterations to identify what changed after each action. This helps diagnose issues where dropdown content isn't being captured.

## What It Does

After each action executes, the system compares the new snapshot with the previous one and logs:
- Number of added lines
- Number of removed lines
- Character count difference
- Interactive element count difference
- Actual added/removed content

## Example Output

```javascript
[Iteration 1/5] Starting...
[Snapshot] Annotated 15 interactive elements
(First iteration - no previous snapshot to compare)
[LLM Response] {commands: 1, isComplete: false}
[Iteration 1] Executing: click on agent_id="6"
[Iteration 1] Waiting 2000ms for UI to settle...

[Iteration 2/5] Starting...
[Snapshot] Annotated 22 interactive elements
[Iteration 2] 📊 SNAPSHOT DIFF: +1245 chars, +7 elements

[Iteration 2] ➕ ADDED (15 lines):
   1. * [ID: 16]  [Declarations](/declarations)
   2. * [ID: 17]  [Reports](/reports)
   3. * [ID: 18]  [Customs Entries](/entries)
   4. * [ID: 19]  [Settings](/settings)
   5. ...

[Iteration 2] ➖ REMOVED (2 lines):
   1. [Customs ▼]
   2. (closed state HTML)
```

## What to Look For

### ✅ Good - Dropdown Was Captured
```
📊 SNAPSHOT DIFF: +1245 chars, +7 elements
➕ ADDED (15 lines):
   - Shows dropdown menu items
   - Contains target keywords ("declarations")
   - Has new agent IDs for dropdown items
```

### ❌ Bad - Dropdown NOT Captured
```
📊 SNAPSHOT DIFF: +23 chars, +0 elements
⚠️ WARNING: No changes detected in snapshot after action!
```

This indicates:
- Dropdown opened but isn't in the snapshot
- Timing issue (need more delay)
- Dropdown is in a portal outside body
- Dropdown is not being converted to markdown

## Implementation Details

### compareSnapshots Function
Located at top of `AiBehaviorMonitor.tsx`:

```typescript
function compareSnapshots(oldSnapshot: string, newSnapshot: string) {
    const oldLines = oldSnapshot.split('\n');
    const newLines = newSnapshot.split('\n');

    // Create sets for faster lookup
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);

    // Find added and removed lines
    const addedLines = newLines.filter(line => !oldSet.has(line));
    const removedLines = oldLines.filter(line => !newSet.has(line));

    // Calculate stats
    const addedChars = newSnapshot.length - oldSnapshot.length;
    const addedElements = (newSnapshot.match(/\[ID: \d+\]/g) || []).length -
                         (oldSnapshot.match(/\[ID: \d+\]/g) || []).length;

    return {
        addedLines,
        removedLines,
        addedChars,
        addedElements,
        summary: `${addedChars > 0 ? '+' : ''}${addedChars} chars, ${addedElements > 0 ? '+' : ''}${addedElements} elements`
    };
}
```

### Tracking Logic
- `previousSnapshot` variable stores the snapshot from the previous iteration
- At start of each iteration (after first), compare current with previous
- At end of each iteration, store current as previous for next comparison

## Diagnostic Use Cases

### Case 1: Dropdown Opens But Not Captured
```
[Iteration 1] Executing: click on dropdown-button
[Iteration 2] 📊 SNAPSHOT DIFF: +5 chars, +0 elements
⚠️ WARNING: No changes detected
```

**Diagnosis**: Dropdown is opening but not being included in snapshot

**Possible causes**:
- Dropdown rendered outside `document.body` (portal)
- Dropdown has `display: none` or `visibility: hidden`
- Not enough wait time
- Shadow DOM

**Solutions**:
- Increase wait times further
- Capture from `document.documentElement` instead of `body`
- Wait for specific element to be visible before snapshot

### Case 2: Wrong Content Added
```
[Iteration 2] ➕ ADDED (5 lines):
   1. Loading...
   2. (spinner content)
```

**Diagnosis**: Captured too early while loading

**Solution**: Increase delays or wait for loading state to complete

### Case 3: Content Flickers
```
[Iteration 2] ➕ ADDED (10 lines):
   (dropdown items)
[Iteration 2] ➖ REMOVED (10 lines):
   (same dropdown items)
```

**Diagnosis**: Dropdown closes/reopens between snapshots

**Solution**: Check for hover states, ensure element stays open

### Case 4: Massive Changes
```
[Iteration 2] 📊 SNAPSHOT DIFF: +50000 chars, +200 elements
```

**Diagnosis**: Page navigation or full content replacement

**Explanation**: This is expected for page changes, just verify target is in added content

## Limitations

### Line-based Comparison
- Compares line by line, so formatting changes show as add+remove
- Minor whitespace changes may show up as differences
- Not a true semantic diff

### Performance
- Set-based comparison is O(n) which is acceptable for typical snapshots
- Shows only first 20 added / 10 removed lines to avoid console spam

### False Positives
- Dynamic IDs or timestamps will show as changes
- Reordered elements show as removed+added

## Advanced Usage

### Filtering Added Lines
To see only lines with specific keywords:

```javascript
// In browser console after test:
const addedWithKeyword = diff.addedLines.filter(line =>
    line.toLowerCase().includes('declaration')
);
console.log('Lines with "declaration":', addedWithKeyword);
```

### Searching for Agent IDs
```javascript
const newAgentIds = diff.addedLines
    .map(line => line.match(/\[ID: (\d+)\]/))
    .filter(Boolean)
    .map(match => match[1]);
console.log('New agent IDs:', newAgentIds);
```

### Manual Diff
If you want to see the full diff:

```javascript
// Copy both snapshots from console
const oldSnap = "...";
const newSnap = "...";

// Simple line-by-line diff
const oldLines = new Set(oldSnap.split('\n'));
const newLines = newSnap.split('\n');
newLines.filter(line => !oldLines.has(line)).forEach(line => {
    console.log('+', line);
});
```

## Testing

### Test Case 1: Simple Dropdown
```
Instruction: "Open menu and click settings"

Expected diff after iteration 1:
- Added: Menu items (Settings, Profile, Logout)
- Removed: "Menu ▼" closed state
```

### Test Case 2: Multi-Level Menu
```
Instruction: "Go to Products > Electronics > Phones"

Expected diffs:
- Iteration 1: Products submenu appears
- Iteration 2: Electronics submenu appears
- Iteration 3: Phones category appears
```

### Test Case 3: Modal
```
Instruction: "Open contact form"

Expected diff:
- Added: Modal overlay, form fields, close button
- Significant character increase (modal HTML)
```

## Configuration

### Show More/Fewer Lines
Edit in AiBehaviorMonitor.tsx:

```typescript
// Show first 20 added lines
diff.addedLines.slice(0, 20)  // Change 20 to desired number

// Show first 10 removed lines
diff.removedLines.slice(0, 10)  // Change 10 to desired number
```

### Disable Diff Logging
Comment out the diff section:

```typescript
// if (previousSnapshot) {
//     const diff = compareSnapshots(previousSnapshot, snapshot);
//     console.log(...);
// }
```

### Add Custom Metrics
Extend compareSnapshots:

```typescript
// Count specific elements
const addedButtons = (newSnapshot.match(/<button/g) || []).length -
                    (oldSnapshot.match(/<button/g) || []).length;
return { ...diff, addedButtons };
```

## Summary

Snapshot diffing provides critical visibility into what's happening between iterations:

✅ **See exactly what content appears** after each action
✅ **Identify timing issues** (no changes = captured too early)
✅ **Verify dropdown content** is being included
✅ **Debug element annotation** (count of [ID: X] markers)

This feature is essential for diagnosing sequential action issues!
