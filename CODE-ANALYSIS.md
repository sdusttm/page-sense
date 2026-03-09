# page-sense-library Code Analysis

## Architecture Overview

The library consists of 3 main parts:
1. **Tracker System** - Captures user interactions and manages state
2. **Annotator Utility** - Injects agent IDs into interactive elements
3. **AI Monitor UI** - Visual interface for AI agent commands

## File Structure

```
src/
├── index.ts                              # Main entry point
├── tracker/
│   ├── index.ts                         # Re-exports tracker components
│   ├── TrackerProvider.tsx              # Context provider for event tracking
│   └── useTracker.ts                    # React hook to access tracker context
├── components/
│   └── AiBehaviorMonitor.tsx            # UI component with chat interface
└── utils/
    └── annotator.ts                     # DOM manipulation utilities
```

---

## Core Components

### 1. TrackerProvider.tsx (223 lines)

**Purpose**: Central state management for event tracking and agent execution.

#### Key Types:

```typescript
InteractionEvent = {
  id: string;                    // Random generated ID
  type: 'click' | 'scroll' | 'input';
  x?, y?: number;               // Mouse coordinates
  target?: string;              // Element tag name
  value?: string;               // Input value
  timestamp: number;            // Unix timestamp

  // Semantic Context
  path?: string;                // CSS selector path
  innerText?: string;           // Element text (max 100 chars)
  role?: string;                // ARIA role
  ariaLabel?: string;           // ARIA label or alt text

  // DOM Snapshot
  snapshot?: string;            // Markdown representation of DOM
}

TrackerContextType = {
  events: InteractionEvent[];
  isPaused: boolean;
  setIsPaused: Dispatch<SetStateAction<boolean>>;
  executeAgentCommand: (action, agentId, value?) => Promise<void>;
}
```

#### Key Functions:

**getElementPath(element)** (lines 33-61)
- Generates CSS selector path for an element
- Walks up the DOM tree from element to root
- Uses ID if available (stops walking)
- Uses nth-of-type for elements without IDs
- Returns string like: `div > main > section:nth-of-type(2) > button#submit`

**extractSemanticData(element)** (lines 63-72)
- Extracts ARIA and semantic information
- Gets first 100 chars of innerText
- Gets role attribute
- Gets aria-label or alt attribute

**executeAgentCommand(action, agentId, value?)** (lines 90-150)
- **Main agent execution function**
- Finds element by `data-agent-id` attribute
- Scrolls element into view (instant, centered)
- Creates visual highlight overlay:
  - Fixed position (bypasses scroll issues)
  - Green border + semi-transparent background
  - Pulsing box shadow
  - Max z-index (2147483647)
- Waits 500ms to show highlight to user
- Executes action:
  - `click`: Calls element.click()
  - `type`: Sets value + dispatches input/change events
- Fades out highlight (opacity 0, scale 1.1)
- Removes highlight after 300ms

#### Event Handlers:

**handleClick** (lines 155-180)
- Captures click coordinates and target
- Generates DOM snapshot using `convertHtmlToMarkdown()`
- Truncates snapshot to 5000 chars if needed
- Adds event with full semantic context

**handleScroll** (lines 182-192)
- Throttled to max 1 event per 500ms
- Only captures Y position (vertical scroll)

**handleInput** (lines 194-204)
- Captures input changes
- Masks password field values as '***'
- Captures element path and semantic data

#### Provider Setup:
- Manages events array (max 100 by default)
- Uses `useCallback` for performance
- Attaches global event listeners on mount
- Cleans up listeners on unmount
- Uses capture phase for input events (3rd param true)

---

### 2. annotator.ts (96 lines)

**Purpose**: Inject and remove `data-agent-id` attributes for AI interaction.

#### Key Functions:

**isInteractive(element)** (lines 4-28)
- Determines if element should get an agent ID
- Checks for interactive tags:
  - `button`, `a`, `input`, `select`, `textarea`
- Checks for interactive ARIA roles:
  - `button`, `link`, `checkbox`, `menuitem`, `option`, `radio`, `switch`, `tab`
- Checks for explicit tabindex >= 0
- Returns boolean

**annotateInteractiveElements(root)** (lines 34-77)
- **Main annotation function**
- Uses TreeWalker for efficient DOM traversal
- Skips AI Monitor itself (`#ai-page-sense-monitor-root`)
- For each interactive element:
  1. Assigns incrementing ID (1, 2, 3, ...)
  2. Sets `data-agent-id` attribute
  3. Injects hidden marker span:
     - Contains `[ID: N]` text
     - Invisible (opacity 0, width/height 0)
     - Inserted as first child
     - Used so markdown converter sees the ID
- Returns count of annotated elements

**clearAnnotations(root)** (lines 82-87)
- Removes all `data-agent-id` attributes
- Uses querySelectorAll for efficiency

**clearVisualAnnotations(root)** (lines 92-95)
- Removes only the marker spans
- Keeps `data-agent-id` attributes intact
- Used to clean UI while preserving IDs for execution

---

### 3. AiBehaviorMonitor.tsx (473 lines)

**Purpose**: UI component for AI agent interaction and event visualization.

#### Component Structure:

```
AiBehaviorMonitor
├── Collapsed Button (👁️ AI Monitor)
└── Expanded Panel
    ├── Header (pause/close controls)
    ├── AgentInstructionForm (command input)
    ├── Visualize Button
    ├── Visualization Modal (draggable)
    └── Event List (scrollable)
```

#### Sub-Component: AgentInstructionForm (lines 7-123)

**Purpose**: Command input and execution

**State:**
- `instruction`: User input text
- `isExecuting`: Loading state
- `executionError`: Error message
- `successMessage`: Success feedback

**Execution Flow** (lines 13-67):
1. **Annotate DOM**: Call `annotateInteractiveElements()`
2. **Capture Snapshot**: Convert DOM to markdown
3. **Clean Visual Markers**: Remove `[ID: N]` spans immediately
4. **Call API**: POST to `/api/agent` with:
   ```json
   { "instruction": "...", "snapshot": "..." }
   ```
5. **Parse Response**: Extract commands array:
   ```json
   {
     "commands": [
       { "action": "click", "agent_id": "5" },
       { "action": "type", "agent_id": "12", "value": "text" }
     ]
   }
   ```
6. **Execute Commands**: Call `executeAgentCommand()` for each
7. **Cleanup**: Remove all `data-agent-id` attributes
8. **Feedback**: Show success/error message

**Note**: Uses `React.memo()` to prevent re-renders when parent updates

#### Main Component: AiBehaviorMonitor (lines 125-472)

**Features:**

1. **Collapsed State** (lines 234-257)
   - Floating button in bottom-right
   - Black background, white text
   - Click to expand

2. **Expanded Panel** (lines 259-471)
   - Fixed position, 320x400px
   - Bottom-right corner
   - Contains all interactive features

3. **Draggable Modal** (lines 139-186)
   - Shows AI visualization
   - Drag by header to reposition
   - Uses refs for smooth dragging
   - No state updates during drag (performance)

4. **Visualization Feature** (lines 187-230)
   - Finds latest DOM snapshot from events
   - Calls `/api/visualize` endpoint
   - Displays HTML visualization in iframe
   - Shows error if no snapshot available

5. **Event Display** (lines 421-468)
   - Scrollable list of captured events
   - Color-coded by type
   - Shows timestamp, target, coordinates
   - Expandable DOM snapshot (details/summary)
   - Displays semantic context (role, aria-label, text)
   - Opacity reduced when paused

**Styling**: All inline styles, fixed z-index of 9999-10000

---

## Data Flow

### Event Capture Flow:
```
User clicks button
  ↓
TrackerProvider.handleClick()
  ↓
getElementPath() → "div > main > button#submit"
extractSemanticData() → { innerText, role, ariaLabel }
convertHtmlToMarkdown() → markdown snapshot
  ↓
addEvent() → Create InteractionEvent
  ↓
setEvents() → Add to state array (max 100)
  ↓
AiBehaviorMonitor displays event in UI
```

### Agent Command Flow:
```
User types "Click the submit button"
  ↓
AgentInstructionForm.handleExecuteInstruction()
  ↓
annotateInteractiveElements()
  → Inject data-agent-id="1", "2", "3"...
  → Inject [ID: 1], [ID: 2] marker spans
  ↓
convertHtmlToMarkdown()
  → "- [Button][ID: 5] Submit"
  ↓
clearVisualAnnotations()
  → Remove [ID: N] spans (keep attributes)
  ↓
POST /api/agent
  { instruction: "...", snapshot: "..." }
  ↓
LLM returns:
  { commands: [{ action: "click", agent_id: "5" }] }
  ↓
executeAgentCommand("click", "5")
  → Find element with data-agent-id="5"
  → Scroll into view
  → Show green highlight for 500ms
  → element.click()
  → Fade out highlight
  ↓
clearAnnotations()
  → Remove all data-agent-id attributes
```

---

## API Contracts

### Expected Backend Endpoints

#### POST /api/agent
**Request:**
```json
{
  "instruction": "Click the submit button",
  "snapshot": "# Page Title\n\n- [Button][ID: 5] Submit\n- [Link][ID: 6] Cancel"
}
```

**Response:**
```json
{
  "commands": [
    {
      "action": "click",
      "agent_id": "5"
    }
  ]
}
```

Or for typing:
```json
{
  "commands": [
    {
      "action": "type",
      "agent_id": "12",
      "value": "test@example.com"
    }
  ]
}
```

#### POST /api/visualize (Optional)
**Request:**
```json
{
  "snapshot": "# Page\n\n- Button: Submit"
}
```

**Response:**
```json
{
  "html": "<html>...</html>"
}
```

---

## Key Design Patterns

### 1. Context + Provider Pattern
- `TrackerContext` provides global state
- `TrackerProvider` wraps app at root
- `useTracker` hook accesses context
- Ensures single source of truth

### 2. Event Delegation
- Global listeners on `window`
- Single handler for all clicks/inputs
- Better performance than per-element listeners

### 3. Temporary DOM Manipulation
- Annotate → Capture → Clean
- Minimizes DOM pollution
- IDs only exist during snapshot
- Visual markers removed before API call

### 4. Visual Feedback Pattern
- Highlight before action (500ms wait)
- User sees what AI is doing
- Prevents confusion about agent actions
- Fade out animation (300ms)

### 5. Semantic Context Capture
- Not just "click at (x, y)"
- Captures element path, role, text
- Enables richer LLM understanding
- More reliable than coordinates

---

## Performance Considerations

### Optimizations:
1. **Event Throttling**: Scroll events limited to 500ms
2. **Array Slicing**: Events capped at maxEvents (default 100)
3. **TreeWalker**: Efficient DOM traversal for annotation
4. **React.memo**: Prevents form re-renders
5. **useCallback**: Memoizes event handlers
6. **Snapshot Truncation**: Limited to 5000 chars

### Potential Issues:
1. **DOM Snapshot Size**: Large pages create big snapshots
2. **Event Array Growth**: Unbounded without maxEvents
3. **Global Listeners**: Always active (even when paused)
4. **Synchronous Markdown**: Blocks main thread
5. **No Virtualization**: Event list renders all items

---

## Security Considerations

### Safe:
- Read-only DOM inspection
- No external requests (only /api/agent, /api/visualize)
- Password masking in input events
- Limited snapshot size

### Risks:
- Captures all page content (sensitive data)
- Executes arbitrary click/type commands
- No authentication on executeAgentCommand
- XSS risk if LLM returns malicious HTML (visualization)
- Could interact with sensitive buttons (delete, submit)

### Recommendations:
1. Add permission system before executing commands
2. Sanitize HTML from visualization endpoint
3. Add rate limiting on API calls
4. Exclude sensitive elements from annotation
5. Add user confirmation for destructive actions

---

## Limitations

1. **Interactive Detection**:
   - Only checks standard tags + ARIA roles
   - Misses custom click handlers (e.g., `onClick` on `<div>`)
   - Relies on semantic HTML

2. **Snapshot Accuracy**:
   - Markdown conversion lossy
   - Complex layouts may confuse LLM
   - Dynamic content might change between snapshot and execution

3. **Element Targeting**:
   - IDs only valid for ~1 second (annotation → execution)
   - Page updates can invalidate IDs
   - No retry mechanism

4. **React Compatibility**:
   - Dispatches synthetic events
   - May not trigger all React listeners
   - Bypasses controlled component validation

5. **No Multi-step Planning**:
   - Each command is atomic
   - No concept of "workflow"
   - LLM must return all steps at once

---

## Extension Points

### Easy Additions:
1. **Custom Event Types**: Add hover, focus, blur
2. **More Actions**: Right-click, drag, keyboard
3. **Element Filtering**: Skip specific classes/IDs
4. **Custom Styling**: Props for colors, positioning
5. **Event Export**: Download events as JSON

### Medium Complexity:
1. **Session Recording**: Replay captured events
2. **Multi-step Workflows**: Chain commands
3. **Conditional Logic**: If/else in commands
4. **Variable Storage**: Remember values between steps
5. **Page State Validation**: Check if command succeeded

### Advanced Features:
1. **Visual Programming**: Drag-drop workflow builder
2. **Smart Retry**: Re-annotate and retry failed commands
3. **OCR Integration**: Handle non-semantic elements
4. **Cross-page Navigation**: Follow links, handle redirects
5. **Accessibility Testing**: Flag ARIA issues

---

## Dependencies

### Runtime:
- **react** ^18.0.0 || ^19.0.0
- **react-dom** ^18.0.0 || ^19.0.0
- **dom-to-semantic-markdown** ^1.5.0

### Build:
- **typescript** ^5.0.0
- **tsup** ^8.0.0 (bundler)
- **@types/react** ^18.2.0
- **@types/react-dom** ^18.2.0

### Build Output:
- CommonJS: `dist/index.js` (30KB)
- ES Module: `dist/index.mjs` (26KB)
- Type Definitions: `dist/index.d.ts`

---

## Testing Recommendations

### Unit Tests:
- `getElementPath()` - Various DOM structures
- `isInteractive()` - Edge cases (custom components)
- `extractSemanticData()` - ARIA attributes
- `annotateInteractiveElements()` - Count verification

### Integration Tests:
- Event capture flow (click → event added)
- Agent execution (annotate → execute → cleanup)
- Error handling (element not found, API failure)
- Snapshot generation (large DOMs)

### E2E Tests:
- Full command flow (user input → AI action)
- Multi-step commands
- Error recovery
- UI interactions (pause, close, expand)

---

## Maintenance Notes

### Common Issues:
1. **Elements not clickable**: Check if element has `data-agent-id` during execution
2. **Snapshot too large**: Adjust truncation limit (line 164)
3. **IDs don't match**: Page changed between annotation and execution
4. **React events not firing**: Add more event types in line 137-138

### Debug Tips:
1. Add console.logs in `executeAgentCommand` to trace execution
2. Check Network tab for `/api/agent` request/response
3. Inspect DOM for `data-agent-id` attributes
4. Use "View DOM Snapshot" in event list to see captured markdown

### Future Refactoring:
1. Extract styles to CSS file or styled-components
2. Split AiBehaviorMonitor into smaller components
3. Add TypeScript strict mode
4. Use Zustand or Redux for state management
5. Add Jest tests
