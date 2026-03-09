# Sequential Action Implementation

## Problem
When sending a user instruction to the LLM (e.g., "go to declarations page, under customs section in header"), the system would:
1. Take ONE snapshot of the current page state
2. Ask LLM for ALL actions needed
3. Execute actions sequentially based on that single snapshot

**Issue**: The second action was planned based on the initial page state, but by the time it executes, the page has changed due to the first action. This caused actions to target incorrect or non-existent elements.

## Solution: Sequential Snapshot & Action Pattern

The new implementation follows this flow:

```
Loop (max 5 iterations):
  1. Take fresh snapshot of current page state
  2. Send snapshot to LLM asking for NEXT action
  3. LLM returns ONE command based on current state
  4. Execute that command
  5. Wait for UI to stabilize
  6. Repeat until task is complete or no more actions
```

## Key Changes to `AiBehaviorMonitor.tsx`

### Before (Lines 41-100)
```typescript
// Single snapshot
const snapshot = convertHtmlToMarkdown(document.body.outerHTML);

// Get ALL commands at once
const data = await fetch('/agent', { snapshot });

// Execute all commands based on stale snapshot
for (const cmd of data.commands) {
  await executeAgentCommand(cmd.action, cmd.agent_id, cmd.value);
}
```

### After (Lines 41-120)
```typescript
// Helper to capture fresh snapshot
const captureSnapshot = async () => { /* ... */ };

// Sequential loop
for (let iteration = 0; iteration < maxIterations; iteration++) {
  // 1. Fresh snapshot showing current state
  const snapshot = await captureSnapshot();

  // 2. Ask for NEXT action only
  const data = await callLLMAgent(snapshot, previousActions);

  // 3. Execute FIRST command only
  const cmd = data.commands[0];
  await executeAgentCommand(cmd.action, cmd.agent_id, cmd.value);

  // 4. Track action history
  previousActions.push(`${cmd.action} on ${cmd.agent_id}`);

  // 5. Break if complete
  if (data.isComplete || data.commands.length === 1) break;
}
```

## Backend API Requirements

The backend `/agent` endpoint should now expect and handle:

### Request Body
```typescript
{
  instruction: string;        // User's original goal
  snapshot: string;           // Current page state in markdown
  threadId: string;           // Conversation context
  url: string;               // Current URL
  previousActions?: string[]; // History of actions taken
}
```

### Response Format
```typescript
{
  commands: Array<{
    action: 'click' | 'type';
    agent_id: string;         // Element ID to target
    value?: string;           // For 'type' actions
  }>;
  isComplete?: boolean;       // True if task is done
}
```

### Backend Behavior

The LLM should:
1. **Use `previousActions` context** to understand what has already been done
2. **Return only the NEXT action** needed (single command in array)
3. **Set `isComplete: true`** when the goal is achieved
4. **Return empty `commands: []`** if no action is needed

Example prompt for LLM:
```
User Goal: {instruction}
Current Page State: {snapshot}
Previous Actions: {previousActions.join(', ')}

Based on the CURRENT page state, what is the NEXT single action to take?
If the goal is complete, return isComplete: true.
```

## Benefits

✅ **Accuracy**: Each action sees the actual current page state
✅ **Adaptability**: LLM can adjust plan based on real page changes
✅ **Error Recovery**: Can detect if action failed (element still visible)
✅ **Multi-step Tasks**: Handles complex workflows (open modal → fill form → submit)

## Trade-offs

⚠️ **Latency**: Multiple LLM calls instead of one (but more reliable)
⚠️ **API Costs**: More API requests per instruction
⚠️ **Max Iterations**: Limited to 5 iterations to prevent infinite loops

## Testing

To test the sequential behavior:

1. **Multi-step navigation**: "Go to products page, then add first item to cart"
   - Should navigate first, THEN interact with products page

2. **Modal workflows**: "Open the menu, click settings"
   - Should open menu first, THEN click settings in opened menu

3. **Dynamic content**: "Click 'Load More', then click the last item"
   - Should load content first, THEN see and click new items

## Configuration

Adjust `maxIterations` in code (default: 5) if you need longer task chains:

```typescript
const maxIterations = 5; // Line ~108 in AiBehaviorMonitor.tsx
```

## Monitoring

Each iteration logs to console:
- Snapshot capture timing
- LLM API calls
- Commands received
- Actions executed
- Previous actions context

Check browser DevTools console for debugging.
