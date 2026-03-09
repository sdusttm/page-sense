# Cross-Page Action Support - Analysis & Solution

## Current State

### ❌ Does NOT Work Across Pages

**Problem**: If an action navigates to a new page, the sequential execution stops.

**Example that FAILS**:
```
Instruction: "Go to products page, then add first item to cart"

Iteration 1:
- Click on "Products" link
- Page navigates to /products
- ❌ JavaScript context lost
- ❌ Loop terminates
- ❌ Never adds item to cart
```

**Why it fails**:
1. Page navigation unloads current JavaScript
2. Sequential loop state (`previousActions`, `iteration`) is lost
3. No mechanism to resume execution on new page

### ✅ Current Cross-Page Support

The library already has `enableCrossPageTracking`:
- Persists `threadId` in localStorage
- Maintains conversation continuity
- BUT: Only tracks events, doesn't resume execution

## Solution Architecture

### Option 1: localStorage State Persistence (Recommended)

**How it works**:
1. Before executing action, check if it's a navigation link
2. If yes, save execution state to localStorage
3. On new page load, check for pending execution state
4. Resume from where it left off

**Implementation**:

```typescript
interface ExecutionState {
    instruction: string;
    previousActions: string[];
    iterationCount: number;
    threadId: string;
    timestamp: number;
}

// Before executing action
const saveExecutionState = (state: ExecutionState) => {
    localStorage.setItem('page-sense-execution-state', JSON.stringify(state));
};

// On page load
const resumeExecutionState = (): ExecutionState | null => {
    const stored = localStorage.getItem('page-sense-execution-state');
    if (!stored) return null;

    const state = JSON.parse(stored);

    // Only resume if recent (within 10 seconds)
    if (Date.now() - state.timestamp > 10000) {
        localStorage.removeItem('page-sense-execution-state');
        return null;
    }

    return state;
};

// Clear after completion
const clearExecutionState = () => {
    localStorage.removeItem('page-sense-execution-state');
};
```

**Pros**:
- ✅ Works across any navigation
- ✅ Handles browser back/forward
- ✅ Simple implementation
- ✅ No server changes needed

**Cons**:
- ⚠️ localStorage size limits
- ⚠️ Doesn't work in incognito if blocked
- ⚠️ User could close tab mid-execution

---

### Option 2: URL Parameter State

**How it works**:
1. Encode execution state in URL parameter
2. Click link adds state to URL
3. New page reads state from URL
4. Resume execution

**Example**:
```
/products → /products?__ps_exec=eyJpbnN0cnVjdGlvbiI6...
```

**Pros**:
- ✅ Visible in URL (debuggable)
- ✅ Works in incognito
- ✅ Can bookmark mid-execution

**Cons**:
- ❌ URL length limits
- ❌ State visible to user
- ❌ Can't detect navigation without modifying links
- ❌ Doesn't work with form submissions

---

### Option 3: sessionStorage (Alternative to localStorage)

Same as Option 1 but uses `sessionStorage`:

**Pros**:
- ✅ Auto-clears when tab closes
- ✅ Tab-isolated execution
- ✅ Better privacy

**Cons**:
- ❌ Lost if user refreshes page
- ❌ Doesn't persist across tab duplication

---

## Recommended Solution: localStorage with Detection

### High-Level Flow

```
┌─────────────────────────────┐
│  User: "Go to products,     │
│         add first to cart"   │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ Iteration 1                 │
│ - Snapshot current page     │
│ - LLM: Click "Products"     │
│ - Detect: Is navigation?    │
│   → YES!                    │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ Save to localStorage:       │
│ {                           │
│   instruction: "...",       │
│   previousActions: [        │
│     "click on products"     │
│   ],                        │
│   iterationCount: 1         │
│ }                           │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ Execute click               │
│ → Page navigates to         │
│   /products                 │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ /products page loads        │
│ - Check localStorage        │
│ - Found pending execution!  │
│ - Wait 2 seconds for load   │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ Resume Iteration 2          │
│ - Snapshot NEW page         │
│ - LLM: "Add first to cart"  │
│ - Execute action            │
│ - isComplete: true          │
│ - Clear localStorage        │
└─────────────┬───────────────┘
              │
              ▼
         ✅ Done!
```

---

## Implementation Plan

### Step 1: Add Navigation Detection

```typescript
// Check if element is a navigation link
const isNavigationLink = (element: Element): boolean => {
    if (element.tagName === 'A') {
        const href = element.getAttribute('href');
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            return true;
        }
    }
    return false;
};
```

### Step 2: Save State Before Navigation

```typescript
// Before executing action
if (cmd.action === 'click') {
    const targetElement = document.querySelector(`[data-agent-id="${cmd.agent_id}"]`);

    if (targetElement && isNavigationLink(targetElement)) {
        console.log('[Cross-Page] Detected navigation, saving state...');

        const executionState = {
            instruction,
            previousActions: [...previousActions, actionDescription],
            iterationCount: iteration + 1,
            threadId,
            timestamp: Date.now()
        };

        localStorage.setItem('page-sense-execution-state', JSON.stringify(executionState));
    }
}

await executeAgentCommand(cmd.action, cmd.agent_id, cmd.value);
```

### Step 3: Resume on Page Load

```typescript
// In AgentInstructionForm, add useEffect
useEffect(() => {
    const resumeExecution = async () => {
        const stored = localStorage.getItem('page-sense-execution-state');
        if (!stored) return;

        const state = JSON.parse(stored);

        // Check if recent (within 10 seconds)
        if (Date.now() - state.timestamp > 10000) {
            localStorage.removeItem('page-sense-execution-state');
            return;
        }

        console.log('[Cross-Page] Resuming execution:', state);

        // Wait for page to fully load
        await new Promise(r => setTimeout(r, 2000));

        // Resume execution
        // TODO: Call handleExecuteInstruction with state

        // Clear state after resuming
        localStorage.removeItem('page-sense-execution-state');
    };

    resumeExecution();
}, []);
```

### Step 4: Refactor to Support Resume

```typescript
const handleExecuteInstruction = async (
    instructionOverride?: string,
    resumeState?: {
        previousActions: string[];
        iterationCount: number;
    }
) => {
    const currentInstruction = instructionOverride || instruction;
    const startIteration = resumeState?.iterationCount || 0;
    const initialActions = resumeState?.previousActions || [];

    // ... rest of execution logic
};
```

---

## Alternative: Client-Side Navigation Only

**Simpler approach**: Only support client-side navigation (SPA)

For SPA apps (React Router, Next.js client navigation):
- No page reload
- JavaScript context preserved
- Sequential loop continues normally
- ✅ Works out of the box!

**Detection**:
```typescript
// Check if using SPA navigation
const isSPANavigation = () => {
    return window.history && 'pushState' in window.history;
};
```

---

## Challenges & Edge Cases

### Challenge 1: Timing
- New page needs time to fully render
- How long to wait? 2s? 5s? Variable?
- Solution: Wait for page idle + additional buffer

### Challenge 2: Authentication
- Navigation might trigger login redirect
- Execution can't resume if not logged in
- Solution: Detect auth redirects, clear state

### Challenge 3: Error Pages
- Navigation might lead to 404
- Can't continue if page doesn't exist
- Solution: Detect error pages, mark as failed

### Challenge 4: Infinite Loops
- What if LLM keeps navigating forever?
- Solution: Max iterations still applies (5)

### Challenge 5: Multiple Tabs
- User opens link in new tab
- Original tab still has execution state
- Solution: Use tab-specific sessionStorage key

---

## Testing Strategy

### Test Case 1: Simple Navigation
```
Instruction: "Go to about page, scroll to team section"

Expected:
1. Click "About" link → navigate to /about
2. Resume on /about page
3. Scroll to team section
4. Complete
```

### Test Case 2: Multi-Page Workflow
```
Instruction: "Go to products, add first item, go to cart, checkout"

Expected:
1. Navigate to /products
2. Add item to cart
3. Navigate to /cart
4. Click checkout
5. Complete
```

### Test Case 3: Form Submission
```
Instruction: "Fill contact form, submit, verify success message"

Expected:
1. Fill form fields
2. Submit (might navigate)
3. Check for success message
4. Complete
```

---

## Recommendation

**For v0.2.2**: Implement **Option 1 (localStorage) with navigation detection**

**Rationale**:
- Most flexible solution
- Works across all navigation types
- Relatively simple to implement
- Backward compatible

**Implementation effort**: Medium (2-3 hours)
**Risk**: Low (can be feature-flagged)
**User value**: High (enables real multi-page workflows)

---

## Current Status

**v0.2.1**: ❌ Cross-page actions NOT supported
**v0.2.2**: ⏳ Can be added with localStorage approach
**Workaround**: Use SPA-only navigation (client-side routing)

---

**Want me to implement this feature?** 🚀
