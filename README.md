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

### 2. Configure API Keys
The `page-sense-library` requires an API Key to execute LLM Actions.
This repository uses the production **Central API Gateway**:

1. Open `https://www.pagesense.tech/login` and sign up for an account.
2. Go to the API Keys Dashboard and generate a new key (`sk-ps-...`).
3. Open `apps/host/src/app/providers.tsx` and paste the generated key into the `<TrackerProvider>`'s `apiKey` prop!

### 3. Start Development Mode

```bash
# Start both the library build watcher and the host application:
pnpm run dev
```

Navigate to `http://localhost:3000` to interact with the demo store and pop open the `👁️ AI Monitor` to test out natural language commands!
