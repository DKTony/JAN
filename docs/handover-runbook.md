# JAN Handover Runbook

This runbook is intended for engineers taking ownership of the **JAN (Just Another Neuralnet)** project. It summarizes how to run, operate, and extend the system.

For architectural and implementation detail, start with [context.md](./context.md) and the linked documents in this folder.

## 1. Environment & Setup

### 1.1 Prerequisites

- Node.js 18+
- Modern Chromium-based browser with:
  - Screen capture support (`getDisplayMedia`).
  - Microphone access (`getUserMedia`).
- Access to the Gemini API with:
  - Multimodal Live API.
  - Standard text/image/video models.

### 1.2 Environment Variables

Create `.env.local` in the project root:

```bash
GEMINI_API_KEY=your_actual_api_key
```

The key is read via `process.env.API_KEY` at runtime (the build tooling ensures this is available to the browser environment).

### 1.3 Install & Run

```bash
npm install
npm run dev
```

The app will start on a Vite port (e.g. 5173 or 3000+ depending on your environment).

## 2. Operational Overview

### 2.1 Lifecycle

1. User opens JAN; LandingPage animation plays.
2. User clicks **Initialize Neural Link**.
3. Main overlay loads with:
   - ScreenShare prompt to start screen sharing.
   - ChatWidget launcher in widget mode.
4. When screen sharing is started:
   - `ScreenShare` renders the live monitor feed.
   - `App.tsx` uses `useScreenCapture` hook for optimized vision loop:
     - Frame diffing skips similar frames (>92% similarity).
     - Adaptive FPS: ~1.3 FPS active, ~0.5 FPS idle.
5. When the Mic is clicked:
   - `LiveAPIContext.connect()` is invoked.
   - On `open`, JAN automatically starts recording and streaming microphone audio.
6. Users can:
   - Chat via text.
   - Use the whiteboard.
   - Upload documents for RAG.
   - Generate images and videos using the generative tools.

### 2.2 Sessions & State

- File Search Stores are created **per session**.
- There is no backend persistence; all state lives in the browser.
- When the tab is closed or refreshed, a new store will be created upon the next session.

## 3. Troubleshooting

### 3.1 Live Connection Issues

Symptoms:
- Mic button stays in `connecting`.
- No audio responses from JAN.

Checks:
- Open dev tools console; look for errors from `GenAILiveClient` or `LiveAPIContext`.
- Confirm `GEMINI_API_KEY` is valid and has Live API access.
- Network tab: validate WebSocket connection to Gemini is established.

Recovery:
- Click the Power button (upper-right of the widget header) to disconnect and reconnect.
- Reload the page if configuration was changed.

### 3.2 Screen Share Problems

Symptoms:
- Browser denies permission.
- Black screen in background.

Checks:
- Ensure the browser tab has permission to capture the screen.
- On macOS, verify Screen Recording permission in System Settings.

Recovery:
- Stop share using the OS-level UI or the browser bar, then click **Start Screen Share** again.

### 3.3 Document Upload / RAG Issues

Symptoms:
- "RAG Init Failed" in Knowledge Base panel.
- Documents stuck in `failed` or not turning `ready`.

Checks:
- Console logs from `DocumentContext` for detailed error messages.
- Validity of file types (PDF/TXT/MD/CSV).

Recovery:
- Ensure API key is present and valid.
- Retry upload after a page refresh to get a fresh store.

### 3.4 Video Generation Failures

Symptoms:
- Veo animations never complete or throw errors.

Checks:
- Console output from `Veo Gen Error`.
- Network latency or rate-limiting from the Gemini backend.

Recovery:
- Retry with simpler prompts.
- Reduce concurrent Veo operations.

## 4. Extending JAN

### 4.1 Adding New Tools to Live API

- Update `LiveConfig.tools` in `LiveAPIContext`.
- Note: Google Search and File Search are **mutually exclusive** - only one can be active.
- Extend `GenAILiveClient` to emit `toolCall` events where necessary.
- Handle tool calls in a React component or dedicated handler.

### 4.2 HTTP Chat RAG Behavior

- HTTP chat (`generateChatResponse`) already uses File Search when a store and ready documents are available, via `services/contextService.ts`.
- The unified context builder decides whether to attach `fileSearch` or fall back to `googleSearch`.
- To customize behavior:
  - Adjust tool selection or system instructions in `buildContextualRequest`.
  - Pass a `metadataFilter` from the UI into `generateChatResponse` when you need to scope queries.

### 4.3 UI / UX Enhancements

- Respect existing Tailwind + CSS-variable theming.
- Coordinate with ChatWidget's drag and nav behaviours when adding new controls near the edges.
- Use `settings.displayCitations` toggle from DocumentContext for citation display.
- Leverage `streamingText` and `isStreaming` from LiveAPIContext for transcript UI.

### 4.4 Screen Capture Optimization

- Adjust `useScreenCapture` config in `App.tsx` for different performance profiles:
  - Lower `diffThreshold` = more frames sent (higher bandwidth, better context).
  - Higher `maxIntervalMs` = slower idle FPS (better battery, less bandwidth).
- Monitor capture stats via `frameCount` and `skippedCount` from the hook.

### 4.5 Document Upload Enhancements

- Use `UploadOptions` for custom chunking and metadata:
  - `chunkingConfig`: { maxTokensPerChunk, maxOverlapTokens }
  - `metadata`: array of { key, stringValue?, numericValue? }
- Pass `metadataFilter` to `generateChatResponse` for scoped queries.

## 5. Handover Checklist

Before handing the project to a new team, verify:

- [ ] `.env.local` is documented and stored securely (not committed).
- [ ] All key docs are up to date:
  - `README.md`
  - `docs/context.md`
  - `docs/architecture.md`
  - `docs/live-api-and-audio.md`
  - `docs/rag-knowledge-base.md`
  - `docs/ui-and-interaction.md`
  - `docs/technical-debt-roadmap.md`
- [ ] `npm test` / linters (if present) pass.
- [ ] Browser permissions have been tested on the target OS/browser.
- [ ] Known limitations and technical debt are captured in [technical-debt-roadmap.md](./technical-debt-roadmap.md).
- [ ] Priority items from roadmap have been triaged.

## 6. Contact & Ownership

- This project is currently designed for single-team ownership with no external API beyond Gemini.
- If integrating into a larger platform, consider:
  - Extracting the overlay into a reusable widget.
  - Wrapping Gemini calls in a backend proxy for centralized auth and logging.
