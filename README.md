# Page Sense

A complete Monorepo showcasing **Agentic DOM Interaction** and **Semantic HTML Visualization**. 

This repository contains both a publishable library (`page-sense-library`) and a Next.js host application to demonstrate how an AI Agent can seamlessly monitor, understand, and natively interact with web applications.

## Architecture Structure

- `/packages/page-sense-library`: The core tracking, element annotation, and AI visualization React library.
- `/apps/host`: A dummy Next.js 15 Ecommerce website to test the library's tracking and LLM agent integration.

## Quick Start

### 1. Install Dependencies
This project uses `pnpm` workspaces.

```bash
pnpm install
```

### 2. Set API Keys
You will need an AI provider key to run the Agent commands.

```bash
cd apps/host
cp .env.example .env.local
```
Update `.env.local` to include your `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY` (depending on what you hook up in `/api/agent/route.ts`).

### 3. Start Development Mode

```bash
# Start both the library build watcher and the host application:
pnpm run dev
```

Navigate to `http://localhost:3000` to interact with the demo store and pop open the `👁️ AI Monitor` to test out natural language commands!
