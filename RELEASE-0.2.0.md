# Release Notes - v0.2.0

## 🚀 Sequential Action Execution

**Release Date**: March 8, 2026

This is a **major feature release** that fundamentally improves how AI agents interact with web applications by implementing sequential action execution with fresh DOM snapshots.

---

## 🎯 What's New

### Sequential Action Execution
Previously, the library would:
1. Take ONE snapshot of the page
2. Ask LLM for ALL actions needed
3. Execute actions based on that single snapshot

**Problem**: Actions based on stale snapshots would fail when the page changed.

**Now**, the library:
1. Takes a snapshot
2. Asks LLM for the NEXT action
3. Executes ONE action
4. **Takes a fresh snapshot** (showing updated page state)
5. Repeats until task is complete

This allows complex multi-step workflows like:
- ✅ "Open menu, then click settings"
- ✅ "Go to products page, add first item to cart"
- ✅ "Click load more, then select the last item"

---

## ✨ Key Features

### 1. Fresh Snapshots Per Action
Each action is planned based on the **current** page state, not a stale snapshot from before previous actions executed.

### 2. Action History Context
The LLM receives context about what actions have already been completed:
```json
{
  "previousActions": [
    "click on menu-button",
    "click on products-link"
  ]
}
```

### 3. Smart Completion Detection
Backend signals when task is complete via `isComplete: boolean`:
```json
{
  "commands": [...],
  "isComplete": true  // Task done!
}
```

### 4. Iteration Limit
Maximum 5 iterations per instruction to prevent infinite loops.

### 5. Comprehensive Logging
Debug logs show exact execution flow:
```
[Iteration 1/5] Starting...
[Iteration 1] Executing: click on agent_id="6"
[Iteration 1] Continuing to next iteration...
[Iteration 2/5] Starting...
...
```

---

## 🔧 Breaking Changes

### Backend API Contract Updated

Your backend `/agent` endpoint **must** now support:

#### Request Body - Added Field
```typescript
{
  instruction: string;
  snapshot: string;
  previousActions?: string[];  // 🆕 NEW - array of completed actions
}
```

#### Response Body - Added Field
```typescript
{
  commands: Array<{
    action: 'click' | 'type';
    agent_id: string;
    value?: string;
    reasoning: string;
  }>;
  isComplete: boolean;  // 🆕 NEW - true when task complete
}
```

#### Expected Backend Behavior
- Return **ONE command per call** (not all commands)
- Set `isComplete: true` when goal is achieved
- Return empty `commands: []` if no action possible
- Use `previousActions` to avoid repeating actions

---

## 📦 Installation

### From npm (after publishing)
```bash
npm install page-sense-library@0.2.0
# or
pnpm add page-sense-library@0.2.0
# or
yarn add page-sense-library@0.2.0
```

### Local Development
```bash
cd packages/page-sense-library
pnpm build
```

---

## 🧪 Testing

### Basic Multi-Step Test
```typescript
// In your app with TrackerProvider
<TrackerProvider apiUrl="http://localhost:3001/api">
  <YourApp />
</TrackerProvider>

// Then in browser:
// 1. Click "👁️ AI Monitor"
// 2. Type: "Open menu and click settings"
// 3. Press Enter
// 4. Watch it execute 2 actions sequentially
```

### Expected Console Output
```
[Iteration 1/5] Starting...
[Iteration 1] Snapshot captured
[Iteration 1] LLM response: {commands: 1, isComplete: false}
[Iteration 1] Executing: click on agent_id="menu-button"
[Iteration 1] Continuing to next iteration...

[Iteration 2/5] Starting...
[Iteration 2] Snapshot captured
[Iteration 2] LLM response: {commands: 1, isComplete: true}
[Iteration 2] Executing: click on agent_id="settings-link"
[Iteration 2] Task marked complete by LLM, stopping

✅ Successfully executed 2 actions
```

---

## 🐛 Bug Fixes

### Critical: Loop Breaking After First Action
**Fixed** a critical bug where the loop would break after the first action due to incorrect condition:

```typescript
// Before (❌ WRONG)
if (data.isComplete || data.commands.length === 1) {
    break;  // Always broke because backend returns 1 command!
}

// After (✅ CORRECT)
if (data.isComplete) {
    break;  // Only breaks when LLM signals complete
}
```

This bug prevented multi-step tasks from working entirely.

---

## 📊 Performance Impact

### Latency
- **Single action**: ~2-4 seconds (unchanged)
- **Two-step task**: ~5-9 seconds (new capability)
- **Complex task (3-5 steps)**: ~12-22 seconds

### API Costs
- More LLM calls per instruction (1 per action vs 1 total)
- Using `gpt-4o-mini`: ~$0.0001 per action
- Average 2-action task: ~$0.0002

### Accuracy
- 📈 **Much higher** for multi-step tasks
- 📈 Adapts to dynamic UI changes
- 📈 Handles workflows that were previously impossible

---

## 🔄 Migration Guide

### If You Control the Backend

Update your `/agent` endpoint to:

1. **Accept** `previousActions?: string[]`
2. **Return** `isComplete: boolean`
3. **Return only ONE command** per call
4. **Use action history** to inform decisions

Example backend update:
```typescript
export async function POST(req: Request) {
  const { instruction, snapshot, previousActions = [] } = await req.json();

  // Build context
  const context = previousActions.length > 0
    ? `Actions completed: ${previousActions.join(', ')}`
    : 'No actions yet';

  // Call LLM with context
  const result = await llm.generateObject({
    prompt: `Goal: ${instruction}\n${context}\nCurrent state: ${snapshot}\n\nWhat is the NEXT action?`,
    schema: {
      commands: [...],
      isComplete: z.boolean()
    }
  });

  return Response.json(result);
}
```

### If Using External API

Contact your API provider to implement the new contract. The library is backward compatible but won't get sequential benefits until backend is updated.

---

## 📚 Documentation

New documentation files:
- `CHANGELOG.md` - Version history
- `RELEASE-0.2.0.md` - This file
- `SEQUENTIAL-ACTION-IMPLEMENTATION.md` - Technical details
- `SEQUENTIAL-FLOW-DIAGRAM.md` - Visual flow
- `BUG-FIX-LOOP-BREAKING.md` - Bug fix details
- `COMPLETE-IMPLEMENTATION-SUMMARY.md` - Complete overview

---

## 🎉 Try It Now!

```bash
# Start demo app
cd /Users/mtian/page-sense
pnpm run dev

# Open browser
open http://localhost:3000

# Test multi-step instructions in AI Monitor!
```

---

## 🤝 Contributing

Found a bug or have a feature request?
- GitHub: https://github.com/sdusttm/page-sense
- Issues: https://github.com/sdusttm/page-sense/issues

---

## 📝 License

MIT License - see LICENSE file for details

---

## 🙏 Credits

Built with:
- React 18/19
- TypeScript
- dom-to-semantic-markdown
- OpenAI GPT-4o-mini (backend)

---

**Enjoy building AI agents that truly understand and interact with your web applications!** 🚀
