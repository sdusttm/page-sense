# Debugging Checklist: Why Checkboxes Still Not Appearing

## What We Know From the Screenshot

✅ The dropdown IS open
✅ All 5 checkbox options are visible on screen
✅ The HTML shows all checkboxes exist in the DOM
❌ But the snapshot only shows "Filed"

## Next Steps: Run with Debug Logging

### 1. Open the App and DevTools

```bash
cd /Users/mtian/page-sense
pnpm dev
```

Open browser → F12 → Console tab

### 2. Trigger a Snapshot

Click the dropdown to open it, then trigger the AI Monitor to capture a snapshot.

### 3. Check Debug Output

Look for these log messages:

```
[DEBUG] Found X checkboxes in DOM
  [0] ☐ Select all - visible: true/false, display: block/none
  [1] ☐ Preparing - visible: true/false, display: block/none
  [2] ✓ Filed - visible: true/false, display: block/none
  [3] ☐ Under Hold or Exam - visible: true/false, display: block/none
  [4] ☐ Released - visible: true/false, display: block/none

[Annotator] Temporarily revealed X hidden elements for snapshot
[Snapshot] Annotated Y interactive elements

[Snapshot] Contains "Preparing"? true/false
[Snapshot] Contains "Filed"? true/false
[Snapshot] Contains "Under Hold"? true/false
[Snapshot] Contains "Released"? true/false
[Snapshot] Checkbox-related lines (N): ...
```

## Diagnosis Tree

### Scenario A: `Found 0 checkboxes in DOM`
**Problem:** Checkboxes not in DOM when snapshot is taken

**Possible causes:**
- Snapshot captured before dropdown fully rendered
- Dropdown is in an iframe
- Dropdown is in shadow DOM

**Fix:**
- Increase wait time before snapshot
- Check `document.querySelectorAll('iframe')` and capture iframe contents
- Use `element.shadowRoot` to traverse shadow DOM

### Scenario B: `Found 5 checkboxes` but `visible: false`
**Problem:** Checkboxes exist but are hidden

**Possible causes:**
- Parent container still has `display: none`
- `temporarilyShowHiddenElements()` not working
- CSS specificity issues (our `!important` not strong enough)

**Fix:**
- Check which parent is still hidden
- Add more aggressive CSS overrides
- Use inline styles instead of CSS classes

### Scenario C: `Found 5 checkboxes`, `visible: true`, but `Contains "Preparing"? false`
**Problem:** Checkboxes are visible but not in markdown output

**Possible causes:**
- `dom-to-semantic-markdown` is filtering them out
- Checkbox labels are in a structure the library doesn't handle
- Text content is in a different location than expected

**Fix:**
- Manually inspect `document.body.outerHTML` to see if text is there
- Check if labels are using `aria-label` instead of text content
- Consider using custom `overrideElementProcessing` option for markdown conversion

### Scenario D: `Contains "Preparing"? true` but AI doesn't see it
**Problem:** Text is in snapshot but AI isn't recognizing it

**Possible causes:**
- Snapshot is too long and gets truncated
- Text is formatted in a way AI doesn't understand
- Agent IDs not associated with the text

**Fix:**
- Check snapshot length (should be under 100KB)
- Verify agent ID markers are next to checkbox labels
- Format snapshot differently for better AI parsing

## Manual Testing Commands

### In Browser Console (after opening dropdown):

```javascript
// 1. Check if checkboxes exist
const checkboxes = document.querySelectorAll('input[type="checkbox"]');
console.log('Found checkboxes:', checkboxes.length);

// 2. Check their visibility
checkboxes.forEach((cb, i) => {
  const style = window.getComputedStyle(cb);
  const label = cb.closest('label')?.textContent?.trim();
  console.log(`[${i}] ${label}: display=${style.display}, visibility=${style.visibility}, opacity=${style.opacity}`);
});

// 3. Check parent containers
checkboxes.forEach((cb, i) => {
  let parent = cb.parentElement;
  let level = 0;
  while (parent && level < 5) {
    const style = window.getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1) {
      console.log(`[${i}] Hidden parent at level ${level}:`, parent.className, style.display);
    }
    parent = parent.parentElement;
    level++;
  }
});

// 4. Check what's in the HTML
console.log('Body HTML length:', document.body.outerHTML.length);
console.log('Contains "Preparing"?', document.body.outerHTML.includes('Preparing'));
console.log('Contains "data-agent-id"?', document.body.outerHTML.includes('data-agent-id'));

// 5. Test markdown conversion (if you have access to the library)
// import { convertHtmlToMarkdown } from 'dom-to-semantic-markdown';
// const markdown = convertHtmlToMarkdown(document.body.outerHTML);
// console.log('Markdown contains "Preparing"?', markdown.includes('Preparing'));
```

## Expected vs Actual

### Expected Success Output:
```
[DEBUG] Found 5 checkboxes in DOM
  [0] ☐ Select all - visible: true, display: block
  [1] ☐ Preparing - visible: true, display: block
  [2] ✓ Filed - visible: true, display: block
  [3] ☐ Under Hold or Exam - visible: true, display: block
  [4] ☐ Released - visible: true, display: block

[Annotator] Temporarily revealed 15 hidden elements for snapshot
[Snapshot] Annotated 30 interactive elements

[Snapshot] Contains "Preparing"? true
[Snapshot] Contains "Filed"? true
[Snapshot] Contains "Under Hold"? true
[Snapshot] Contains "Released"? true

[Snapshot] Checkbox-related lines (10):
[ID: 25 ☐] Select all
[ID: 26 ☐] Preparing
[ID: 27 ✓] Filed
[ID: 28 ☐] Under Hold or Exam
[ID: 29 ☐] Released
```

### Current Issue Output (to diagnose):
```
[DEBUG] Found ??? checkboxes in DOM
  ...
[Snapshot] Contains "Preparing"? ???
```

## Next Actions Based on Results

1. **Run the app with new debug logging**
2. **Copy the console output**
3. **Share the debug output so we can see:**
   - How many checkboxes were found
   - If they're visible
   - If they're in the markdown
4. **Based on output, apply specific fix from Diagnosis Tree**

## Additional Debug: Capture Raw HTML

Add this temporarily to see the raw HTML being processed:

```javascript
// In AiBehaviorMonitor.tsx, before convertHtmlToMarkdown:
const rawHtml = document.body.outerHTML;
console.log('[DEBUG] Raw HTML length:', rawHtml.length);
console.log('[DEBUG] Contains multiselectOptions?', rawHtml.includes('multiselectOptions'));
console.log('[DEBUG] Contains Preparing checkbox:', rawHtml.match(/<input[^>]*checkbox[^>]*>[^<]*Preparing/gi));
```

This will show us if the checkbox+label structure is even in the HTML we're trying to convert.

---

**Once you run the app and share the debug output, we can pinpoint exactly where the problem is!** 🎯
