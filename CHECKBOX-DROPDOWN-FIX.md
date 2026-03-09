# Checkbox Dropdown Snapshot Fix

## Problem

When a dropdown contains checkboxes, only the **checked** values were being captured in the snapshot. This gave the AI agent the wrong impression that there were no other options available to interact with.

### Root Cause

The `dom-to-semantic-markdown` library filters elements based on CSS visibility properties. When dropdown menus contain unchecked checkboxes:
- They might be hidden with `display: none`, `visibility: hidden`, or `opacity: 0`
- They might be inside parent containers that are hidden
- The markdown converter skips these hidden elements entirely

This meant the AI could see:
```
[ID: 5 ✓] Option A (checked)
```

But couldn't see:
```
[ID: 6 ☐] Option B (unchecked)
[ID: 7 ☐] Option C (unchecked)
```

## Solution

Implemented a **two-part fix**:

### 1. Enhanced Checkbox State Annotations (`annotator.ts`)

Added visual indicators to show checkbox state in the snapshot:
- **Checked items**: `[ID: 5 ✓]`
- **Unchecked items**: `[ID: 6 ☐]`

This helps the AI understand which items are already selected vs available to select.

```typescript
// Detects checkboxes and adds state indicator
if (role === 'checkbox' || role === 'radio' || role === 'switch' ||
    (tagName === 'input' && (element as HTMLInputElement).type === 'checkbox')) {

    let isChecked = false;
    if (tagName === 'input') {
        isChecked = (element as HTMLInputElement).checked;
    } else if (ariaChecked !== null) {
        isChecked = ariaChecked === 'true';
    }

    markerText = `[ID: ${id}${isChecked ? ' ✓' : ' ☐'}] `;
}
```

### 2. Temporary Visibility Enhancement (`temporarilyShowHiddenElements()`)

Created a new function that:
1. **Finds all potentially hidden interactive elements**:
   - Elements with `role="checkbox"`, `role="option"`, `role="menuitem"`, etc.
   - Elements inside dropdowns, menus, listboxes
   - Elements with `aria-hidden="true"`
   - Parent containers that are hidden

2. **Temporarily makes them visible**:
   - Sets `display: block`, `visibility: visible`, `opacity: 1`
   - Moves elements off-screen (`left: -9999px`) to avoid UI flicker
   - Tracks all modifications for restoration

3. **Restores original state after snapshot**:
   - Returns a cleanup function
   - Reverts all CSS changes
   - Ensures no permanent UI changes

```typescript
export function temporarilyShowHiddenElements(): () => void {
    const modifiedElements: Array<{...}> = [];

    // Find and temporarily show hidden elements
    const potentiallyHidden = document.querySelectorAll([
        '[role="checkbox"]',
        '[role="option"]',
        '[aria-hidden="true"]',
        'input[type="checkbox"]',
        // ... more selectors
    ].join(','));

    // Make visible (off-screen to avoid flicker)
    element.style.setProperty('display', 'block', 'important');
    element.style.setProperty('visibility', 'visible', 'important');
    element.style.setProperty('position', 'absolute', 'important');
    element.style.setProperty('left', '-9999px', 'important');

    // Return cleanup function
    return () => { /* restore original styles */ };
}
```

### 3. Updated Snapshot Capture Flow (`AiBehaviorMonitor.tsx`)

Modified all three snapshot capture locations to use the new function:

**Before:**
```typescript
// 1. Remove library UI
removeLibraryElements();

// 2. Annotate elements
annotateInteractiveElements(document.body);

// 3. Capture snapshot (missing hidden elements!)
const snapshot = convertHtmlToMarkdown(document.body.outerHTML);

// 4. Restore library UI
restoreLibraryElements();
```

**After:**
```typescript
// 1. Remove library UI
removeLibraryElements();

// 2. Temporarily show hidden elements 🆕
const restoreHiddenElements = temporarilyShowHiddenElements();

// 3. Annotate ALL elements (including now-visible hidden ones) 🆕
annotateInteractiveElements(document.body);

// 4. Capture snapshot (now includes ALL options!) 🆕
const snapshot = convertHtmlToMarkdown(document.body.outerHTML);

// 5. Restore hidden elements 🆕
restoreHiddenElements();

// 6. Restore library UI
restoreLibraryElements();
```

## Benefits

1. **Complete Visibility**: AI now sees ALL available options in dropdowns, not just checked ones
2. **Better Understanding**: Checkbox state indicators (`✓` vs `☐`) help AI understand context
3. **No UI Flicker**: Elements are moved off-screen during snapshot, invisible to users
4. **Clean Restoration**: All changes are reverted after snapshot capture
5. **Works with Multiple UI Patterns**: Handles various dropdown/menu implementations

## Testing

### Before Fix
```
[Snapshot] Annotated 15 interactive elements
[Snapshot] Contains "unchecked option"? false
AI: "I don't see any other options available"
```

### After Fix
```
[Snapshot] Annotated 25 interactive elements
[Annotator] Temporarily revealed 10 hidden elements for snapshot
[Snapshot] Contains "unchecked option"? true
AI: "I can see Option A ✓ (checked), Option B ☐, and Option C ☐. Clicking Option B now..."
```

## Files Modified

1. **`packages/page-sense-library/src/utils/annotator.ts`**
   - Added checkbox state indicators to markers
   - Added `temporarilyShowHiddenElements()` function

2. **`packages/page-sense-library/src/components/AiBehaviorMonitor.tsx`**
   - Imported `temporarilyShowHiddenElements`
   - Updated 3 snapshot capture locations to use the new function
   - Updated comments to reflect new flow

## Future Improvements

Potential enhancements:
- Add support for shadow DOM elements
- Handle dynamically loaded dropdown content (async)
- Optimize selector performance for large DOMs
- Add configuration to control which elements to reveal
