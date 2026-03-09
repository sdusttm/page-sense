# Changelog: Version 0.2.5

## Release Date
March 9, 2026

## Summary
Enhanced checkbox dropdown snapshot capture with aggressive parent container unhiding and comprehensive debug logging.

## Changes

### 🐛 Bug Fixes

#### Checkbox Dropdown Snapshot Issues
**Problem:** Dropdowns with checkboxes only captured checked values, not unchecked options.

**Root Cause:** Parent containers of checkbox elements were hidden via CSS (`display: none`, `height: 0`, `max-height: 0`), making their text content inaccessible to the markdown converter.

**Solution:** Three-phase fix:

1. **Dropdown Expansion** (`temporarilyExpandDropdowns()`)
   - Programmatically expands dropdowns via ARIA attributes
   - Waits 300ms for async rendering
   - Supports ARIA-based and styled-components dropdowns

2. **Aggressive Parent Unhiding** (`temporarilyShowHiddenElements()` - Enhanced)
   - Walks up from each checkbox to find ALL hidden parent containers
   - Checks multiple CSS hiding techniques:
     - `display: none`
     - `visibility: hidden`
     - `opacity < 0.1`
     - `height: 0px` ← New
     - `max-height: 0px` ← New
   - Temporarily shows parents while moving off-screen to prevent UI flicker
   - Uses `Set<HTMLElement>` to avoid duplicate processing

3. **Checkbox State Indicators** (Enhanced)
   - Adds visual state to markers:
     - Checked: `[ID: 5 ✓]`
     - Unchecked: `[ID: 6 ☐]`
   - Helps AI understand which options are selected

### 📊 Debug Logging

Added comprehensive debug output to diagnose snapshot issues:

```javascript
[DEBUG] Found X checkboxes in DOM
  [0] ☐ Select all - visible: true, display: block
  [1] ☐ Preparing - visible: true, display: block
  ...

[Annotator] Found X potential dropdown triggers
[Annotator] Expanding dropdown: ...
[Annotator] Temporarily revealed X hidden elements for snapshot
[Snapshot] Annotated X interactive elements

[Snapshot] Contains "Preparing"? true
[Snapshot] Contains "Filed"? true
[Snapshot] Checkbox-related lines (N): ...
```

### 🔧 Technical Improvements

**File: `src/utils/annotator.ts`**
- **NEW:** `temporarilyExpandDropdowns()` function
  - Finds dropdown triggers via ARIA and class selectors
  - Sets `aria-expanded="true"` and `aria-hidden="false"`
  - Returns restore function to collapse after snapshot

- **ENHANCED:** `temporarilyShowHiddenElements()`
  - Changed from element-first to **checkbox-first** approach
  - Walks up DOM tree from each checkbox
  - Checks `height` and `max-height` properties
  - Adds `z-index: -9999` for better hiding
  - Uses deduplication to avoid processing same element twice

- **ENHANCED:** Checkbox state indicators in markers
  - Detects checkbox state via `.checked` property
  - Detects ARIA checkbox state via `aria-checked`
  - Adds ✓ or ☐ symbols to markers

**File: `src/components/AiBehaviorMonitor.tsx`**
- **UPDATED:** All 3 snapshot capture locations:
  1. Main iteration loop (line ~240)
  2. Cross-page execution (line ~695)
  3. On-demand visualization (line ~950)

- **ADDED:** Debug logging before snapshot:
  - Lists all checkboxes found in DOM
  - Shows their visibility state and computed styles
  - Logs which checkbox labels are in the final snapshot

- **ADDED:** Debug logging after snapshot:
  - Checks if specific text strings are in snapshot
  - Filters and displays checkbox-related lines
  - Shows counts of found elements

### 📈 Performance Impact

- **Additional snapshot time:** +300-400ms (for dropdown expansion wait)
- **Memory overhead:** Minimal (temporary style modifications)
- **User experience:** No visible impact (elements moved off-screen)

## Breaking Changes

None. All changes are backward compatible.

## Migration Guide

No migration needed. Update package version and rebuild:

```bash
cd /Users/mtian/page-sense
pnpm install
pnpm build
```

## Known Issues

1. **Shadow DOM not supported** - Elements in shadow roots are not traversed
2. **iframes not captured** - Dropdown content in iframes won't be included
3. **Some custom dropdowns** - May require click events, not just ARIA changes
4. **Very large DOMs** - Performance may degrade with >10,000 elements

## Testing Recommendations

After updating, test with:

1. **Multi-select dropdowns** with checkboxes
2. **Styled-components** based dropdowns
3. **MUI/Material-UI** dropdowns
4. **Nested dropdowns** (dropdowns within dropdowns)
5. **Dynamic/async** loaded dropdown content

Check console logs for:
- `[DEBUG] Found X checkboxes`
- `[Snapshot] Contains "<your option text>"? true`
- `[Snapshot] Checkbox-related lines: [ID: X ✓] Your Option`

## Documentation

New documentation files:
- `CHECKBOX-DROPDOWN-FIX.md` - Original fix approach
- `CHECKBOX-DROPDOWN-FIX-V2.md` - Enhanced fix with dropdown expansion
- `ACTUAL-ISSUE-REVEALED.md` - Root cause analysis from actual HTML
- `ISSUE-ROOT-CAUSE.md` - Complete technical deep dive
- `DEBUGGING-CHECKLIST.md` - Step-by-step debugging guide

## Contributors

- Enhanced checkbox detection and parent container unhiding
- Added dropdown expansion via ARIA attributes
- Implemented comprehensive debug logging
- Improved snapshot capture reliability

## Next Steps

Based on testing results, future enhancements may include:
- Shadow DOM traversal support
- iframe content capture
- Click-based dropdown opening for non-ARIA dropdowns
- Configurable wait times for slow-rendering frameworks
- Machine learning-based dropdown detection

---

**Version 0.2.5 is now ready for testing!** 🚀

Please test with real dropdowns and share console output for any issues.
