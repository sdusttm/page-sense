# Page Sense Library

A lightweight React library to track user interactions and empower AI agents to natively understand and navigate the DOM.

## Features
- **Semantic DOM Snapshotting**: Automatically converts the DOM into an LLM-friendly markdown snapshot.
- **Event Tracking**: Captures user interactions (`click`, `input`, `scroll`) and generates exact DOM paths, inner text, and ARIA labels.
- **Agent Instruction Mode**: Injects structural `data-agent-id` attributes to let an LLM natively `.click()` or `.type()` on elements via a reverse pipeline.
- **Agent Visualization**: Emits a pulsing aesthetic highlight box around elements right before an AI executes an action, providing visual feedback to the user.

## Installation

```bash
npm install page-sense-library dom-to-semantic-markdown
```

## Setup & Usage

### 1. Wrap your application with `TrackerProvider`

```tsx
// app/providers.tsx
"use client";
import { TrackerProvider } from 'page-sense-library';

export function Providers({ children }: { children: React.ReactNode }) {
    return <TrackerProvider>{children}</TrackerProvider>;
}
```

### 2. Render the AI Behavior Monitor

To monitor events or manually command the agent via chat, mount the `AiBehaviorMonitor` component anywhere in your app:

```tsx
import { AiBehaviorMonitor } from 'page-sense-library';

export default function MyPage() {
    return (
        <main>
            <h1>My Store</h1>
            <AiBehaviorMonitor />
        </main>
    )
}
```

### 3. Agent Execution Pipeline
The `<AiBehaviorMonitor />` has an instruction chat that allows you to type natural language commands. 

**How it works under the hood:**
1. The library temporarily injects `[ID: x]` physical text nodes and `data-agent-id="x"` attributes into all interactive HTML elements.
2. It takes an HTML snapshot and converts it to semantic markdown.
3. The visual markers are instantly stripped so the user doesn't see them.
4. The snapshot and your natural language instruction are POSTed to `/api/agent`.
5. Your API route runs the LLM, asking it to output a requested `action` ('click' or 'type') and the corresponding `agent_id`.
6. Our React context natively executes `element.scrollIntoView()` and `element.click()` with an aesthetic visual delay!
