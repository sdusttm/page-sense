# Sequential Action Flow Diagram

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INSTRUCTION                         │
│           "Go to declarations page, under customs section"       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (AiBehaviorMonitor)                  │
│                                                                   │
│  ┌──────────────── Sequential Loop (max 5 iterations) ────────┐ │
│  │                                                              │ │
│  │  ITERATION 1:                                               │ │
│  │  ┌────────────────────────────────────────────────────┐    │ │
│  │  │ 1. Wait 800ms for page to settle                   │    │ │
│  │  │ 2. Remove library UI                                │    │ │
│  │  │ 3. Annotate interactive elements                    │    │ │
│  │  │ 4. Capture snapshot → Markdown                      │    │ │
│  │  │ 5. Restore library UI                               │    │ │
│  │  └────────────────────────────────────────────────────┘    │ │
│  │                          │                                   │ │
│  │                          ▼                                   │ │
│  │  ┌────────────────────────────────────────────────────┐    │ │
│  │  │ 6. Call API with:                                   │    │ │
│  │  │    - instruction: "Go to declarations..."           │    │ │
│  │  │    - snapshot: "Header: [Customs ▼] ..."           │    │ │
│  │  │    - previousActions: []                            │    │ │
│  │  └────────────────────────────────────────────────────┘    │ │
│  │                          │                                   │ │
│  └──────────────────────────┼───────────────────────────────────┘ │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (/api/agent)                        │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ 7. Receive request                                      │     │
│  │ 8. Build action context (empty for first call)         │     │
│  │ 9. Call LLM with:                                       │     │
│  │    System: "You are sequential agent..."               │     │
│  │    Prompt: "Goal: {instruction}                         │     │
│  │             Previous: {none}                            │     │
│  │             Current state: {snapshot}"                  │     │
│  └────────────────────────────────────────────────────────┘     │
│                          │                                       │
│                          ▼                                       │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ 10. LLM analyzes:                                       │     │
│  │     - Goal: Go to declarations                          │     │
│  │     - Current: Customs menu closed                      │     │
│  │     - Decision: First need to open Customs menu         │     │
│  │                                                          │     │
│  │ 11. Returns:                                            │     │
│  │     {                                                    │     │
│  │       commands: [{                                      │     │
│  │         action: "click",                                │     │
│  │         agent_id: "customs-menu-button"                 │     │
│  │       }],                                               │     │
│  │       isComplete: false                                 │     │
│  │     }                                                    │     │
│  └────────────────────────────────────────────────────────┘     │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (AiBehaviorMonitor)                  │
│                                                                   │
│  ┌──────────────── Sequential Loop (iteration 1) ────────────┐  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │ 12. Execute: click customs-menu-button             │   │  │
│  │  │ 13. Track: previousActions.push("click on ...")    │   │  │
│  │  │ 14. Wait 1500ms (UI changing action)               │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │                                                             │  │
│  │  ITERATION 2:                                              │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │ 15. Wait 800ms for page to settle                  │   │  │
│  │  │ 16. Capture NEW snapshot (menu now open!)          │   │  │
│  │  │     → "Header: [Customs ▼]                          │   │  │
│  │  │         └─ [Declarations]                           │   │  │
│  │  │         └─ [Reports]"                               │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │                          │                                  │  │
│  │                          ▼                                  │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │ 17. Call API with:                                  │   │  │
│  │  │     - instruction: "Go to declarations..."          │   │  │
│  │  │     - snapshot: "Header: [Declarations] ..."        │   │  │
│  │  │     - previousActions: ["click on customs-menu"]    │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────┼──────────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (/api/agent)                        │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ 18. Receive request                                     │     │
│  │ 19. Build action context:                               │     │
│  │     "Actions already completed:                         │     │
│  │      1. click on customs-menu-button"                   │     │
│  │ 20. Call LLM with full context                          │     │
│  └────────────────────────────────────────────────────────┘     │
│                          │                                       │
│                          ▼                                       │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ 21. LLM analyzes:                                       │     │
│  │     - Goal: Go to declarations                          │     │
│  │     - Previous: Opened customs menu                     │     │
│  │     - Current: Declarations link NOW VISIBLE            │     │
│  │     - Decision: Click declarations, task complete!      │     │
│  │                                                          │     │
│  │ 22. Returns:                                            │     │
│  │     {                                                    │     │
│  │       commands: [{                                      │     │
│  │         action: "click",                                │     │
│  │         agent_id: "declarations-link"                   │     │
│  │       }],                                               │     │
│  │       isComplete: true  ← DONE!                         │     │
│  │     }                                                    │     │
│  └────────────────────────────────────────────────────────┘     │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (AiBehaviorMonitor)                  │
│                                                                   │
│  ┌──────────────── Sequential Loop (iteration 2) ────────────┐  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │ 23. Execute: click declarations-link                │   │  │
│  │  │ 24. Detect: isComplete === true                     │   │  │
│  │  │ 25. BREAK from loop                                 │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │                                                             │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │ 26. Show success: "✅ Successfully executed          │   │  │
│  │  │                    2 actions"                        │   │  │
│  │  │ 27. Clear instruction input                         │   │  │
│  │  │ 28. Add to conversation history                     │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                         ✅ TASK COMPLETE
```

## Key Differences: Before vs After

### ❌ BEFORE (Single Snapshot)
```
1. Capture snapshot (menu closed)
2. Ask LLM for ALL actions
3. LLM returns: [click menu, click declarations]  ← Plans based on closed menu!
4. Execute: click menu (menu opens)
5. Execute: click declarations  ← FAILS! Link wasn't visible in original snapshot
```

### ✅ AFTER (Sequential Snapshots)
```
ITERATION 1:
1. Capture snapshot (menu closed)
2. Ask LLM for NEXT action
3. LLM returns: [click menu]  ← Only next action
4. Execute: click menu (menu opens)

ITERATION 2:
5. Capture NEW snapshot (menu open!)  ← Fresh state!
6. Ask LLM for NEXT action
7. LLM sees declarations link in snapshot
8. LLM returns: [click declarations]
9. Execute: click declarations  ← SUCCESS!
```

## Timing Breakdown

```
┌─────────────┬──────────────────┬────────────────┐
│  Action     │  Duration        │  Why           │
├─────────────┼──────────────────┼────────────────┤
│ Page settle │  800ms           │ Wait for React │
│ Snapshot    │  100ms           │ DOM → Markdown │
│ LLM call    │  1000-2000ms     │ API latency    │
│ Execute     │  50ms            │ DOM interaction│
│ UI settle   │  500-1500ms      │ Animations     │
├─────────────┼──────────────────┼────────────────┤
│ PER ACTION  │  ~2.5-4.5 sec    │ Total time     │
└─────────────┴──────────────────┴────────────────┘

For 2-action task: ~5-9 seconds total
For 5-action task: ~12-22 seconds (max)
```

## Error Handling & Edge Cases

### Case 1: Element Not Found
```
Frontend: Execute click on "non-existent-id"
         ↓
         Throws: "Failed to execute command"
         ↓
         Frontend: Catch error, show to user
         ↓
         Stop loop (don't retry same action)
```

### Case 2: Max Iterations Reached
```
Iteration 1: Click menu → isComplete: false
Iteration 2: Fill form field → isComplete: false
Iteration 3: Click submit → isComplete: false
Iteration 4: Confirm dialog → isComplete: false
Iteration 5: Final action → isComplete: false
         ↓
Loop exits (max 5 reached)
         ↓
Show success: "✅ Executed 5 actions"
```

### Case 3: LLM Returns Empty Commands
```
Backend: No valid action found in snapshot
        ↓
        Returns: { commands: [], isComplete: true }
        ↓
        Frontend: Break loop immediately
        ↓
        Show: "✅ Task complete" or "⚠️ No action possible"
```

### Case 4: Task Complete Early
```
Iteration 1: LLM detects goal already achieved
           ↓
           Returns: { commands: [], isComplete: true }
           ↓
           Frontend: Break (no actions executed)
           ↓
           Show: "Already complete!"
```

## Monitoring & Debugging

### Console Logs to Watch

**Backend:**
```
AGENT API HAS RECEIVED INSTRUCTION: Go to declarations page...
PREVIOUS ACTIONS: []
LLM RESPONSE - isComplete: false commands: 1

AGENT API HAS RECEIVED INSTRUCTION: Go to declarations page...
PREVIOUS ACTIONS: [ 'click on customs-menu-button' ]
LLM RESPONSE - isComplete: true commands: 1
```

**Frontend:**
```
[Iteration 1] Capturing snapshot...
[Iteration 1] Calling LLM API...
[Iteration 1] Executing: click on customs-menu-button
[Iteration 1] isComplete: false, continuing...

[Iteration 2] Capturing snapshot...
[Iteration 2] Calling LLM API...
[Iteration 2] Executing: click on declarations-link
[Iteration 2] isComplete: true, stopping!

✅ Successfully executed 2 actions
```

## Performance Optimization Tips

1. **Reduce Snapshot Size**: Only include visible viewport in markdown
2. **Shorter Delays**: Tune wait times based on your app's speed
3. **Better Model**: Use gpt-4o for complex tasks (slower but smarter)
4. **Parallel Processing**: Not applicable here (must be sequential)
5. **Caching**: Consider caching snapshots if page doesn't change
