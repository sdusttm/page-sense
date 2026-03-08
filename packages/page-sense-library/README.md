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

### 3. Build the Backend API Routes (Required!)
The `page-sense-library` is strictly a secure, frontend client library. It *cannot* hold your private AI API keys. To make the AI Monitor function, your host application must expose two backend API endpoints to securely bridge the browser to the LLM.

#### A. `/api/agent` (for executing clicks/typing)
This route receives `{ instruction, snapshot }` from the `AiBehaviorMonitor`. 
**Your backend must:**
1. Connect to an LLM securely using your API key.
2. Provide a system prompt telling the AI to read the snapshot and output a strict JSON array of commands.
3. Return: `{ "commands": [ { "action": "click", "agent_id": "5" } ] }`

#### B. `/api/visualize` (for the AI Imagination tab)
This route receives `{ snapshot }` from the `AiBehaviorMonitor`.
**Your backend must:**
1. Securely connect to an LLM.
2. Ask the LLM to write raw HTML/CSS visualizing the page based *only* on the DOM snapshot text.
3. Return: `{ "html": "<html><body>...</body></html>" }`

*(Tip: You can find fully working, copy-pasteable Next.js examples of both these routes inside the `apps/host/src/app/api/` folder in this GitHub repository!)*

### 4. Agent Execution Pipeline
The `<AiBehaviorMonitor />` has an instruction chat that allows you to type natural language commands. 

**How it works under the hood:**
1. The library temporarily injects `[ID: x]` physical text nodes and `data-agent-id="x"` attributes into all interactive HTML elements.
2. It takes an HTML snapshot and converts it to semantic markdown.
3. The visual markers are instantly stripped so the user doesn't see them.
4. The snapshot and your natural language instruction are POSTed to `/api/agent`.
5. Your API route runs the LLM, asking it to output a requested `action` ('click' or 'type') and the corresponding `agent_id`.
6. Our React context natively executes `element.scrollIntoView()` and `element.click()` with an aesthetic visual delay!
