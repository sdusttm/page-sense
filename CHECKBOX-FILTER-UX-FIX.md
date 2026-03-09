# Checkbox Filter UX Pattern - Backend Fix

## Problem

The AI was successfully checking checkboxes in dropdown filters but didn't understand the common UX pattern:
1. Open dropdown
2. Check the desired checkbox → ✓ appears
3. **Click outside the dropdown to apply the filter**

Instead, it kept clicking the same checkbox repeatedly, toggling it on/off in an infinite loop:
- Iteration 2: Check "Preparing" → `[ID: 26 ✓]`
- Iteration 3: Uncheck "Preparing" → `[ID: 26 ☐]`
- Iteration 4: Check "Preparing" → `[ID: 26 ✓]`
- Iteration 5: Uncheck "Preparing" → `[ID: 26 ☐]`

## Solution

**Updated the backend system prompt** in `/Users/mtian/page-sense-api/src/app/api/agent/route.ts`

Added a new section explaining common UI patterns:

```markdown
## Common UI Patterns

### Dropdown Filters with Checkboxes
When working with checkbox filters inside dropdown menus:
1. First click opens the dropdown → checkbox options become visible
2. Click the desired checkbox → checkbox shows as checked [ID: X ✓] in next snapshot
3. To APPLY the filter, you must click OUTSIDE the dropdown menu or on a different element
4. DO NOT click the same checkbox repeatedly - that just toggles it on/off

How to know you're done with a checkbox filter:
- You see [ID: X ✓] for the desired option in the current snapshot
- The dropdown menu is still open (you can see the checkboxes)
- Next action: Click on ANY element OUTSIDE the dropdown to close it and apply the filter
- Look for: page background, other filters, navigation buttons, or the dropdown toggle itself

Example:
- Instruction: "Select Preparing in Customs Declaration Status filter"
  Call 1: Click "Customs Declaration Status" dropdown → isComplete: false
  Call 2: Click "Preparing" checkbox → sees [ID: 26 ✓] Preparing → isComplete: false
  Call 3: Click outside dropdown (e.g., click page background or another filter) → dropdown closes, filter applied → isComplete: true
```

## Changes Made

### Backend: `/Users/mtian/page-sense-api/src/app/api/agent/route.ts`
- ✅ Added "Common UI Patterns" section to system prompt
- ✅ Explained 3-step checkbox filter pattern
- ✅ Provided clear example with "Preparing" checkbox scenario

### Frontend: `/Users/mtian/page-sense/packages/page-sense-library`
- ✅ Reverted temporary v0.2.10 workaround (context hint injection)
- ✅ Kept clean v0.2.9 (checkbox markers working correctly)

## Testing

**Before the fix:**
```
[Iteration 2] Click checkbox 26 → checked ✓
[Iteration 3] Click checkbox 26 → unchecked ☐
[Iteration 4] Click checkbox 26 → checked ✓
[Iteration 5] Click checkbox 26 → unchecked ☐
```

**After the fix (expected):**
```
[Iteration 1] Click dropdown 14 → dropdown opens
[Iteration 2] Click checkbox 26 → checked ✓
[Iteration 3] Click outside dropdown → filter applies, task complete ✅
```

## Next Steps

1. **Restart the backend API** (if running locally):
   ```bash
   cd /Users/mtian/page-sense-api
   pnpm dev
   ```

2. **Or redeploy to production** if using hosted API

3. **Reload frontend** in browser to pick up v0.2.9

4. **Test with**: "Select Preparing in Customs Declaration Status filter"

## Why Backend > Frontend

✅ **Backend approach (what we did):**
- Proper place for agent behavior instructions (system prompt)
- Easy to iterate and improve prompts
- Can see full conversation context
- No need to rebuild/reload frontend for prompt changes

❌ **Frontend approach (v0.2.10 - reverted):**
- Awkward workaround tacked onto user instruction
- Requires rebuild + reload for changes
- Can't leverage full LLM context

## Related Files

- Backend API: `/Users/mtian/page-sense-api/src/app/api/agent/route.ts`
- Frontend library: `/Users/mtian/page-sense/packages/page-sense-library/src/components/AiBehaviorMonitor.tsx`
- Frontend version: v0.2.9 (clean, no workarounds)
