# Dropdown Snapshot Debugging Guide

## Issue
After the first action opens a dropdown, the second snapshot doesn't capture the dropdown content, so the LLM can't find the next element to click.

## Root Cause Analysis

The problem occurs in this sequence:
1. ✅ First snapshot: Captures closed dropdown
2. ✅ LLM: "Click dropdown" → executes successfully
3. ✅ Dropdown opens in the DOM
4. ❌ Second snapshot: Should capture dropdown content, but doesn't
5. ❌ LLM: Can't find the target element in empty snapshot

### Possible Causes
1. **Timing Issue**: Snapshot captured before dropdown fully renders
2. **DOM Position**: Dropdown is absolutely positioned outside normal flow
3. **Visibility Issue**: Elements not visible when snapshot is taken
4. **Annotation Issue**: Dropdown elements not being annotated

## Changes Made to Debug

### 1. Increased Wait Times

**After action execution** (line ~136):
```typescript
// Before: 1500ms
const delay = isUIChangingAction ? 2000 : 500; // Increased to 2000ms
```

**Before snapshot capture** (line ~45):
```typescript
// Before: 800ms
await new Promise(resolve => setTimeout(resolve, 1200)); // Increased to 1200ms
```

**Total wait time after click**: 2000ms + 1200ms = **3200ms**

### 2. Enhanced Logging

Added comprehensive debug logs to track what's being captured:

```typescript
console.log(`[Snapshot] Annotated ${annotatedCount} interactive elements`);
console.log(`[Snapshot] Size: ${snapshot.length} chars`);
console.log(`[Snapshot] Contains "declaration"?`, snapshot.toLowerCase().includes('declaration'));
console.log(`[Snapshot] Contains "customs"?`, snapshot.toLowerCase().includes('customs'));
console.log(`[Snapshot] First 50 lines:`, snapshotLines.join('\n'));
```

### 3. LLM Call Logging

Track what's being sent to the backend:

```typescript
console.log(`[LLM Call] Sending snapshot (${snapshot.length} chars) with previousActions:`, previousActions);
console.log(`[LLM Response]`, {
    commands: data.commands?.length || 0,
    isComplete: data.isComplete,
    firstCommand: data.commands?.[0]
});
```

## How to Debug

### Step 1: Open Browser DevTools
1. Navigate to http://localhost:3000
2. Press F12 to open DevTools
3. Go to Console tab
4. Clear console (Ctrl+L or Cmd+K)

### Step 2: Execute Test
1. Click "👁️ AI Monitor"
2. Type: `"Go to declarations page, under customs section"`
3. Press Enter

### Step 3: Analyze Console Output

Look for this sequence:

```
[Iteration 1/5] Starting...
[Snapshot] Annotated 15 interactive elements  ← How many elements found
[Snapshot] Size: 5234 chars                   ← Snapshot size
[Snapshot] Contains "declaration"? false      ← Is target in snapshot?
[Snapshot] Contains "customs"? true
[Snapshot] First 50 lines: ...                ← Preview of snapshot
[LLM Call] Sending snapshot (5234 chars)...
[LLM Response] {commands: 1, isComplete: false, firstCommand: {...}}
[Iteration 1] Executing: click on agent_id="6"
[Iteration 1] Waiting 2000ms for UI to settle...

[Iteration 2/5] Starting...
[Snapshot] Annotated 20 interactive elements  ← Should be MORE now!
[Snapshot] Size: 7891 chars                   ← Should be BIGGER!
[Snapshot] Contains "declaration"? true       ← Should be TRUE now!
[Snapshot] First 50 lines: ...                ← Should show dropdown content!
```

### Step 4: Diagnose

#### Problem: Annotated count doesn't increase
```
[Iteration 1] Annotated 15 elements
[Iteration 2] Annotated 15 elements  ← SAME! Dropdown not captured
```
**Diagnosis**: Dropdown elements not in DOM or not visible

**Solution**:
- Check if dropdown uses `display: none` → `display: block`
- Check if dropdown renders asynchronously after click
- Increase wait times further

#### Problem: Snapshot size doesn't increase
```
[Iteration 1] Size: 5234 chars
[Iteration 2] Size: 5300 chars  ← Only slightly bigger!
```
**Diagnosis**: Dropdown content not being converted to markdown

**Solution**:
- Check if dropdown is in a portal (React Portal, outside body)
- Check if dropdown has `aria-hidden="true"`
- Verify `document.body.outerHTML` includes dropdown

#### Problem: Target keyword not found
```
[Snapshot] Contains "declaration"? false  ← Still false in iteration 2!
```
**Diagnosis**: Dropdown content definitely not in snapshot

**Solution**:
- Inspect DOM manually to see where dropdown is rendered
- Check if dropdown is in shadow DOM
- Try capturing entire `document.documentElement` instead of just `body`

## Manual Inspection

### 1. Check DOM After Click
After clicking dropdown, pause execution and inspect:

```javascript
// In browser console after dropdown opens:
const dropdown = document.querySelector('[role="menu"]'); // or appropriate selector
console.log('Dropdown element:', dropdown);
console.log('Dropdown visible?', dropdown && window.getComputedStyle(dropdown).display !== 'none');
console.log('Dropdown in body?', document.body.contains(dropdown));
```

### 2. Check Interactive Elements
```javascript
// Count interactive elements before and after dropdown opens
const interactiveElements = document.querySelectorAll('button, a, input, [role="button"], [role="menuitem"]');
console.log('Interactive elements:', interactiveElements.length);
```

### 3. Test Snapshot Manually
```javascript
import { convertHtmlToMarkdown } from 'dom-to-semantic-markdown';
const snapshot = convertHtmlToMarkdown(document.body.outerHTML);
console.log('Snapshot includes declaration?', snapshot.includes('declaration'));
```

## Potential Fixes

### Fix 1: Capture from documentElement instead of body
If dropdown is rendered outside body (e.g., in a portal):

```typescript
// Change line 54
const snapshot = convertHtmlToMarkdown(document.documentElement.outerHTML);
```

### Fix 2: Wait for specific element to be visible
Instead of fixed delays, wait for target:

```typescript
const waitForElement = (selector: string, timeout = 5000) => {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
};

// After click, wait for dropdown to appear
await waitForElement('[role="menu"]');
```

### Fix 3: Force re-annotation after state changes
Clear and re-annotate after waiting:

```typescript
clearAnnotations(document.body);
await new Promise(r => setTimeout(r, 2000));
annotateInteractiveElements(document.body);
```

### Fix 4: Include all interactive descendants
Make sure annotator captures nested interactive elements:

```typescript
// In annotator.ts, ensure TreeWalker traverses into all elements
// Current implementation should handle this, but verify FILTER_REJECT vs FILTER_SKIP
```

## Expected Output After Fix

```
[Iteration 1/5] Starting...
[Snapshot] Annotated 15 interactive elements
[Snapshot] Contains "declaration"? false
[Iteration 1] Executing: click on agent_id="6"
[Iteration 1] Waiting 2000ms for UI to settle...

[Iteration 2/5] Starting...
[Snapshot] Annotated 22 interactive elements  ← Increased!
[Snapshot] Contains "declaration"? true       ← Found!
[Snapshot] First 50 lines shows dropdown menu with declarations link
[LLM Response] firstCommand: {action: "click", agent_id: "declarations-link"}
[Iteration 2] Executing: click on agent_id="declarations-link"
[Iteration 2] Task marked complete by LLM, stopping
✅ Successfully executed 2 actions
```

## Next Steps

1. ✅ Enhanced logging implemented
2. ✅ Increased wait times
3. ⏳ Run test and check console logs
4. ⏳ If still not working, try Fix 1 (capture documentElement)
5. ⏳ If still not working, try Fix 2 (wait for specific element)
6. ⏳ If still not working, inspect DOM manually

---

**Test now with the enhanced logging to see exactly what's being captured!**
