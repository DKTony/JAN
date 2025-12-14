# JAN UI and Interaction Guide

This document focuses on the user-facing behavior of JAN's overlay UI.

For overall product context and architecture, see [context.md](./context.md) and [architecture.md](./architecture.md).

## 1. Main Layers

### 1.1 Landing Page

- Cinematic intro with galaxy-to-brain particle animation.
- Displays the JAN brand:
  - Title: **JAN**
  - Tagline: **Just Another Neuralnet**
- Primary call-to-action: **Initialize Neural Link** button.
- On click, fades out the landing page and transitions to the main app (`AppContent`).

### 1.2 ScreenShare Layer

- Occupies the full screen behind the widget.
- Renders the shared screen stream on a `<video>` element.
- Provides a transparent overlay for the snipping interaction when active.

### 1.3 ChatWidget Layer

- Floating window anchored to bottom-right in **expanded** mode.
- Appears as a circular launcher button in **widget** mode.

## 2. Widget View Modes

Enum: `ViewMode` (in `types.ts`)

- `WIDGET` - small circular launcher button.
- `EXPANDED` - full overlay chat/whiteboard/knowledge base.
- `HIDDEN` - currently unused but reserved.

### 2.1 Widget Mode (Launcher)

- Fixed at `bottom-6 right-6`.
- Styled as a glowing gradient pill with the JAN icon.
- If Live is connected, shows a small green status dot in the corner.
- Clicking it sets `viewMode = EXPANDED`.

### 2.2 Expanded Mode

- Draggable and resizable panel with:
  - **Header**: JAN branding, Live status, Power (connect), Minimize.
  - **Content**: paginated area (Chat / Whiteboard / Knowledge Base).
  - **Footer**: Mic, Snip, mode toggles (text/image/video), input, send, page dots.

#### Dragging

- Users can drag horizontally in the content area to swipe between pages.
- Dragging is disabled when interacting with inner controls (`button`, `input`, `canvas`).

#### Resizing

- Small handle in top-left corner.
- On mousedown, global mousemove/mouseup listeners resize the panel within min/max constraints.

#### Click-Outside to Minimize

- Global `pointerdown` listener on `document`.
- If the pointer target is outside `widgetRef` and not snipping, JAN sets `viewMode = WIDGET`.

## 3. Page Navigation

### 3.1 Pages

- Page 0: **Chat** (messages, attachments, loading bubble, streaming transcript, citations).
- Page 1: **Whiteboard** (tools and canvas).
- Page 2: **Knowledge Base** (DocumentPanel).

### 3.2 Edge Navigation Bars

- Positioned inside the content container, around the vertical middle (`top-1/4 bottom-1/4`).
- Width is modest (`w-8`) to reduce interference with other controls.
- Appear only when hovering near the left/right edges:
  - Default: thin vertical bar (`w-1`, `h-16`, low-opacity white).
  - Hover: expands to pill (`h-24`, `w-8`), darkens background, shows arrow icon.
- Behaviour:
  - Left bar: visible when `page > 0`; clicking decrements page.
  - Right bar: visible when `page < 2`; clicking increments page.
- All pointer events on the bars call `stopPropagation()` so they do not trigger the swipe drag logic.

### 3.3 Page Dots

- Three dots at the bottom of the widget in the footer.
- Reflect current page and allow direct navigation on click.

## 4. Footer Controls

### 4.1 Mic (Go Live)

- Primary entry point for Live sessions.
- States:
  - **Disconnected**: label tooltip "Go Live"; button is interactive.
  - **Connecting**: disabled, `cursor-wait`, reduced opacity.
  - **Connected + Recording**: red background, pulsing animation.
- Behaviour:

```ts
if (status === 'disconnected') connect();
else if (isRecording) stopRecording();
else startRecording();
```

### 4.2 Snipping Tool

- Toggles snipping mode on the ScreenShare layer.
- Disabled if screen sharing is not active.

### 4.3 Mode Toggles (Text / Image / Video)

- Two small icon toggles:
  - Image (Nano Banana).
  - Video (Veo).
- Change the border color of the input container to indicate active mode.

### 4.4 Input and Send

- Single-line text input.
- `Enter` submits (form onSubmit).
- Disables while `isLoading` is true.

## 5. Chat Message Features

### 5.1 Streaming Transcript (Live API)

- When `isStreaming` is true (model generating), ChatWidget renders a "streaming bubble":
  - Pulsing `Radio` icon avatar.
  - Accumulated `streamingText` rendered via ReactMarkdown.
  - Blinking cursor indicator.
- When `turnComplete` fires, the completed turn is added to messages.

### 5.2 Citations Display

- Messages with `citations` (from File Search or Google Search) show a "Sources" panel:
  - Blue-tinted card with `FileText` icon.
  - Each `groundingChunk` displayed as a pill with the source title.
- Controlled by `settings.displayCitations` (persisted to localStorage).

### 5.3 Attachments

- Images: rendered inline with optional "Animate with Veo" overlay button on hover.
- Videos: rendered with native `<video>` controls.

## 6. Whiteboard Tools

- Tool palette at the top of the whiteboard page includes:
  - Pen, Brush, Eraser.
  - Rectangle, Circle, Line.
  - Undo, Clear, Send to AI.
- Send-to-AI captures the canvas as `data:image/png;base64` and passes it through `onCaptureImage`, which ends up as a sketch context in ChatWidget.

## 7. Knowledge Base Panel

- Right-most page within the widget.
- Header shows vector store status (`Initializing`, `Vector Store Active`).
- Each document row shows name, size, status, and a delete icon.
- Bottom action allows uploads when the store is ready.

## 8. Handover Notes

- Any new UI elements should respect existing CSS variables and Tailwind patterns.
- Avoid attaching new global listeners where possible; if needed, clean them up in `useEffect` cleanups.
- Keep hit areas (like edge nav bars) constrained to avoid interfering with toolbars near the edges.
