# JAN Live API and Audio Pipeline

This document provides a deep technical reference for JAN's integration with the **Gemini Multimodal Live API**, including the audio capture and playback pipeline.

For a high-level product overview, start with [context.md](./context.md). For the broader system architecture, see [architecture.md](./architecture.md).

## 1. LiveAPIContext Overview

File: `contexts/LiveAPIContext.tsx`

Responsibilities:
- Wraps GEMINI Live API access behind a React Context.
- Encapsulates connection lifecycle, model configuration, tools, and audio streaming.
- Exposes a simple hook: `useLiveAPI()` returning:
  - `client: GenAILiveClient | null`
  - `status: 'disconnected' | 'connecting' | 'connected' | 'error'`
  - `connect(): void`
  - `disconnect(): void`
  - `startRecording(): Promise<void>`
  - `stopRecording(): void`
  - `isRecording: boolean`
  - `streamingText: string` – live transcript from model (accumulated during turn)
  - `isStreaming: boolean` – true while model is generating
  - `lastCompletedTurn: CompletedTurn | null` – finalized turn with `id`, `text`, `timestamp`
  - `error: string | null` – user-facing error message
  - `clearError(): void`

## 2. Configuration and Tools

Configuration is rebuilt any time the active File Search Store or document set changes:

```ts
// IMPORTANT: Google Search and File Search are mutually exclusive
const hasRagDocs = activeStore && documents.some(d => d.status === 'ready');

const tools: LiveConfig['tools'] = hasRagDocs
  ? [{ fileSearch: { fileSearchStoreNames: [activeStore.name] } }]
  : [{ googleSearch: {} }];

const config: LiveConfig = {
  model: 'models/gemini-2.5-flash-native-audio-preview-09-2025',
  systemInstruction,
  generationConfig: {
    responseModalities: 'audio',
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: 'Aoede' },
      },
    },
  },
  tools,
};
```

**Key Points:**
- The Live model is configured for **audio-only** responses (JAN speaks back to the user).
- **Mutually exclusive tools**: File Search is used when RAG documents are ready; otherwise Google Search.
- Configuration is rebuilt whenever `activeStore` or `documents` changes.

## 3. GenAILiveClient Wrapper

File: `lib/genai-live-client.ts`

### 3.1 Connection

```ts
this.client = new GoogleGenAI({ apiKey });

this.session = await this.client.live.connect({
  model: this.config.model,
  config: {
    responseModalities: [this.config.generationConfig?.responseModalities?.toUpperCase() || 'AUDIO'],
    speechConfig: this.config.generationConfig?.speechConfig,
    systemInstruction: this.config.systemInstruction,
    tools: this.config.tools,
  },
  callbacks: { ... },
});
```

The wrapper re-emits lifecycle events (`open`, `close`, `error`, `content`, `toolCall`, `textDelta`, `turnComplete`) via a simple listener map.

### 3.2 Sending Data

- **Text:** `sendText(text)` sends a standard text turn.
- **Realtime Media:** `sendRealtimeInput([{ mimeType, data }])` streams binary content (e.g., audio PCM, screen images).

## 4. Audio Capture (Microphone)

File: `lib/audio-recorder.ts`

### 4.1 Flow

1. `LiveAPIContext.startRecording()` instantiates `AudioContext` (16 kHz) and `AudioRecorder` if needed.
2. `AudioRecorder.start()`
   - Calls `getUserMedia({ audio: true })`.
   - Wires a `ScriptProcessorNode` to process microphone audio frames.
3. Each audio frame is converted from float32 to 16-bit PCM and emitted via `on('data', ArrayBuffer)`.
4. LiveAPIContext listens for `data` and forwards base64-encoded PCM chunks to Gemini Live:

```ts
audioRecorderRef.current.on('data', (data: ArrayBuffer) => {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
  clientRef.current?.sendRealtimeInput([
    { mimeType: 'audio/pcm;rate=16000', data: base64 },
  ]);
});
```

### 4.2 Start / Stop Semantics

- `startRecording()` is automatically called when the Live connection opens:

```ts
clientRef.current.on('open', () => {
  setStatus('connected');
  startRecording();
});
```

- `stopRecording()` is called on close and explicit `disconnect()`; it stops the recorder and audio streamer.

## 5. Audio Playback (Model Responses)

File: `lib/audio-streamer.ts`

### 5.1 Flow

1. LiveAPIContext receives `content` events from the GenAILiveClient.
2. Filters `modelTurn.parts` for inlineData with `mimeType` starting with `audio`.
3. For each audio part:

```ts
const binaryString = atob(part.inlineData.data);
const bytes = new Uint8Array(binaryString.length);
for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

audioStreamerRef.current.addPCM16(bytes);
```

4. `AudioStreamer`:
   - Converts PCM16 into float32.
   - Pushes chunks into `audioQueue`.
   - Sequentially schedules `AudioBufferSourceNode` instances to avoid gaps.

### 5.2 Stop Semantics

`stop()` clears the queue, fades out the gain, and reconnects a fresh gain node to avoid stale connections.

## 6. UI Integration (ChatWidget)

File: `components/ChatWidget.tsx`

### 6.1 Go-Live Mic Button

```ts
const toggleMic = async () => {
  if (status === 'disconnected') {
    connect();
    return;
  }

  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
};
```

- When **disconnected**, clicking Mic triggers `connect()`.
- When **connected**, Mic toggles recording.
- The button is only disabled during `connecting` to avoid duplicate connection attempts.

### 6.2 Visual States

- Disconnected: Mic shows tooltip **"Go Live"**.
- Connected + recording: Mic turns red and pulses.
- Connecting: Mic has reduced opacity and `cursor-wait`.

## 7. Failure Modes & Considerations

- **Missing API Key:** `connect()` logs an error and sets status to `disconnected`.
- **Permission Denied (Mic):** `AudioRecorder.start()` will throw; LiveAPIContext logs the error and `isRecording` remains `false`.
- **WebSocket Errors:** Propagated via `GenAILiveClient`  currently logged; could be surfaced in the UI badge.

## 8. Streaming Transcript Display

LiveAPIContext now provides streaming transcript support:

```ts
// In LiveAPIContext
clientRef.current.on('textDelta', (delta: string) => {
  setIsStreaming(true);
  streamingTextRef.current += delta;
  setStreamingText(streamingTextRef.current);
});

clientRef.current.on('turnComplete', () => {
  const finalText = streamingTextRef.current;
  if (finalText) {
    setLastCompletedTurn({
      id: `live-turn-${turnIdRef.current++}`,
      text: finalText,
      timestamp: Date.now()
    });
  }
  streamingTextRef.current = '';
  setStreamingText('');
  setIsStreaming(false);
});
```

ChatWidget renders a "streaming bubble" with a pulsing cursor while `isStreaming` is true.

## 9. Extensibility Ideas

- Add automatic reconnect with exponential backoff.
- Persist connection preference (auto-connect on page load) in local storage for power users.
- Enhanced transcript UI with speaker attribution and timestamps.
