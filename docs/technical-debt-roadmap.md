# JAN Technical Debt & Roadmap

This document catalogs known implementation gaps, edge cases, potential improvements, and proposed features for the JAN (Just Another Neuralnet) application.

For the primary documentation entrypoint, see [context.md](./context.md).

---

## 1. Implementation Gaps & Edge Cases

### 1.1 Error Handling

| Gap | Location | Impact | Priority |
|-----|----------|--------|----------|
| No retry logic for failed API calls | `geminiService.ts` | Users must manually retry | Medium |
| WebSocket reconnection not automatic | `LiveAPIContext.tsx` | Users must click reconnect | High |
| Veo polling has no progress feedback | `geminiService.ts:286` | User sees only "Loading..." for minutes | Medium |
| No graceful degradation for invalid API key | `DocumentContext.tsx`, `LiveAPIContext.tsx` | Silent failures | Medium |
| Mic permission error not always user-friendly | `LiveAPIContext.tsx:198-205` | Cryptic browser errors | Low |

**Recommended Fix (WebSocket Reconnect):**
```ts
// In LiveAPIContext.tsx
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;

clientRef.current.on('close', () => {
  if (autoReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    setTimeout(() => {
      reconnectAttempts++;
      connect();
    }, RECONNECT_DELAY_MS * reconnectAttempts);
  }
});
```

### 1.2 Memory Management

| Gap | Location | Impact | Priority |
|-----|----------|--------|----------|
| Screen capture canvas not explicitly disposed | `useScreenCapture.ts` | Minor memory leak on unmount | Low |
| AudioContext accumulates on reconnect | `LiveAPIContext.tsx:178-183` | Audio resource exhaustion | Medium |
| Base64 images in message state | `App.tsx` messages state | Memory bloat with many images | Medium |
| No message pagination/virtualization | `ChatWidget.tsx` | Slow rendering with 100+ messages | Medium |

**Recommended Fix (Image Memory):**
```ts
// Store image references instead of full base64
interface Message {
  attachments?: {
    type: 'image' | 'video';
    thumbnailData: string;  // Small preview
    fullDataRef: string;    // IndexedDB key or blob URL
  }[];
}
```

### 1.3 State Persistence

| Gap | Location | Impact | Priority |
|-----|----------|--------|----------|
| Documents list lost on refresh | `DocumentContext.tsx` | Must re-upload documents | High |
| Store selection lost on refresh | `DocumentContext.tsx` | User must re-select | Medium |
| Conversation history lost on refresh | `App.tsx` | No chat continuity | Medium |
| Live connection preference not saved | `LiveAPIContext.tsx` | Must reconnect manually | Low |

**Recommended Fix (Document Persistence):**
```ts
// Use localStorage for document metadata
const DOCS_STORAGE_KEY = 'jan-documents';
const STORE_STORAGE_KEY = 'jan-active-store';

useEffect(() => {
  // Load on mount
  const savedDocs = localStorage.getItem(DOCS_STORAGE_KEY);
  if (savedDocs) setDocuments(JSON.parse(savedDocs));
}, []);

useEffect(() => {
  // Save on change
  localStorage.setItem(DOCS_STORAGE_KEY, JSON.stringify(documents));
}, [documents]);
```

### 1.4 Type Safety

| Gap | Location | Impact | Priority |
|-----|----------|--------|----------|
| `as any` casts in SDK calls | `geminiService.ts:86,90`, `genai-live-client.ts:48` | Type errors hidden | Low |
| Upload response not fully typed | `DocumentContext.tsx:241` | Runtime errors possible | Low |
| GroundingMetadata extraction untyped | `geminiService.ts:95` | Missing citation data | Low |

### 1.5 Screen Capture Edge Cases

| Edge Case | Current Behavior | Recommended |
|-----------|------------------|-------------|
| Very high-res displays (4K+) | Full resolution capture | Add maxWidth/maxHeight scaling |
| Multi-monitor capture | May capture wrong monitor | Allow monitor selection |
| Browser tab capture only | Limited context | Detect and warn user |
| Rapid activity spikes | May miss frames | Adaptive burst mode |

### 1.6 RAG/Document Edge Cases

| Edge Case | Current Behavior | Recommended |
|-----------|------------------|-------------|
| Large files (>50MB) | May timeout | Add progress indicator, chunked upload |
| Unsupported file types | Silent failure | Pre-validation with user feedback |
| Corrupt/encrypted PDFs | API error | Pre-check and user warning |
| Empty documents | Indexes successfully | Warn user, skip indexing |
| Duplicate uploads | Creates duplicates | Detect and warn/skip |

---

## 2. Potential Improvements

### 2.1 Performance

| Improvement | Effort | Impact | Description |
|-------------|--------|--------|-------------|
| Virtual message list | Medium | High | Use `react-virtual` for 100+ messages |
| WebWorker frame diffing | Medium | Medium | Offload pixel comparison |
| AudioWorklet migration | High | Medium | Replace ScriptProcessor (deprecated) |
| Image compression | Low | Medium | Compress before storing in state |
| Lazy load messages | Low | Medium | Load older messages on scroll |

### 2.2 UX Enhancements

| Enhancement | Effort | Impact | Description |
|-------------|--------|--------|-------------|
| Keyboard shortcuts | Low | High | `Cmd+Enter` send, `Cmd+K` search, `Esc` minimize |
| Toast notifications | Low | Medium | Success/error feedback for operations |
| Drag-and-drop upload | Low | Medium | Drop files into Knowledge Base panel |
| Message copy/share | Low | Low | Copy message text, share conversation |
| Typing indicator | Low | Low | Show "AI is thinking..." |
| Dark/Light theme toggle | Medium | Low | System preference + manual toggle |
| Accessibility (ARIA) | Medium | Medium | Screen reader support |

### 2.3 RAG Enhancements

| Enhancement | Effort | Impact | Description |
|-------------|--------|--------|-------------|
| Document search/filter | Low | Medium | Filter documents in panel |
| Bulk operations | Low | Medium | Select all, delete selected |
| Document preview | Medium | Medium | Show first page thumbnail |
| Metadata editor UI | Medium | Low | Edit document metadata post-upload |
| Citation highlighting | Medium | Medium | Highlight cited text in response |
| Cross-store queries | High | Low | Query multiple stores at once |

### 2.4 Live API Enhancements

| Enhancement | Effort | Impact | Description |
|-------------|--------|--------|-------------|
| Auto-reconnect | Low | High | Exponential backoff reconnection |
| Push-to-talk mode | Low | Medium | Hold button to record |
| Audio level visualization | Medium | Low | Show mic input levels |
| Voice selection UI | Low | Low | Choose from available voices |
| Transcript export | Low | Low | Download conversation transcript |

### 2.5 Generation Enhancements

| Enhancement | Effort | Impact | Description |
|-------------|--------|--------|-------------|
| Generation history | Low | Medium | View past generations |
| Progress indicator (Veo) | Medium | High | Show polling status, ETA |
| Batch image generation | Medium | Medium | Generate multiple variants |
| Image editing | High | Medium | Inpainting, style transfer |
| Video preview frames | Medium | Low | Show keyframes during generation |

---

## 3. Proposed Features

### 3.1 Short-Term (1-2 Sprints)

#### 3.1.1 Conversation Persistence
- Store messages in IndexedDB
- Auto-save on message send
- Load history on app start
- Export/import conversations as JSON

#### 3.1.2 Enhanced Error States
- Detailed error messages with action suggestions
- Retry buttons for failed operations
- Connection status banner
- API quota/rate limit warnings

#### 3.1.3 Quick Actions
- Prompt templates library
- Recent prompts history
- One-click image variations
- Screen region presets

### 3.2 Medium-Term (1-2 Months)

#### 3.2.1 Advanced RAG Features
```
┌─────────────────────────────────────────┐
│ Knowledge Base Pro                       │
├─────────────────────────────────────────┤
│ [Search documents...]                    │
│                                          │
│ 📁 Project Alpha (3 docs, 2.4 MB)       │
│   ├── 📄 Requirements.pdf    ✓ Ready    │
│   ├── 📄 Architecture.md     ✓ Ready    │
│   └── 📄 Meeting Notes.txt   ✓ Ready    │
│                                          │
│ 📁 Research Papers (5 docs, 8.1 MB)     │
│   └── ...                                │
│                                          │
│ [+ New Folder] [⬆ Upload] [⚙ Settings]  │
└─────────────────────────────────────────┘
```

#### 3.2.2 Collaboration Features
- Share conversation via link (read-only)
- Collaborative whiteboard with cursors
- Team knowledge bases

#### 3.2.3 Integrations
- Export to Notion
- Import from Google Drive
- Webhook notifications

### 3.3 Long-Term (3-6 Months)

#### 3.3.1 Platform Expansion
- Electron desktop app
- Browser extension (Chrome/Firefox)
- Mobile companion (React Native)

#### 3.3.2 Advanced AI Features
- Custom personas/system prompts
- Auto-summarization
- Suggested follow-up questions
- Screen annotation suggestions

#### 3.3.3 Enterprise Features
- Multi-tenant architecture
- SSO integration
- Audit logging
- Admin dashboard

---

## 4. Architecture Recommendations

### 4.1 State Management Evolution

Current: React Context
Recommended for scale: Zustand or Jotai

```ts
// Example with Zustand
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface JanStore {
  messages: Message[];
  documents: UploadedDocument[];
  settings: Settings;
  
  addMessage: (msg: Message) => void;
  // ...
}

export const useJanStore = create<JanStore>()(
  persist(
    (set) => ({
      messages: [],
      documents: [],
      settings: DEFAULT_SETTINGS,
      
      addMessage: (msg) => set((state) => ({ 
        messages: [...state.messages, msg] 
      })),
    }),
    { name: 'jan-storage' }
  )
);
```

### 4.2 Service Layer Refactoring

Current: Direct API calls in services
Recommended: API abstraction layer

```ts
// api/client.ts
class GeminiClient {
  private retryConfig = { maxRetries: 3, backoffMs: 1000 };
  
  async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let i = 0; i < this.retryConfig.maxRetries; i++) {
      try {
        return await fn();
      } catch (e) {
        if (i === this.retryConfig.maxRetries - 1) throw e;
        await this.delay(this.retryConfig.backoffMs * (i + 1));
      }
    }
    throw new Error('Max retries exceeded');
  }
}
```

### 4.3 Testing Strategy

| Layer | Tool | Coverage Target |
|-------|------|-----------------|
| Unit (services) | Vitest | 80% |
| Component | React Testing Library | 60% |
| Integration | Playwright | Critical paths |
| E2E | Playwright | Happy paths |

---

## 5. Security Considerations

### 5.1 Current State

- API key exposed in browser environment (acceptable for POC)
- Base64 data stored in component state
- No input sanitization for prompts

### 5.2 Production Recommendations

| Issue | Recommendation |
|-------|----------------|
| API key exposure | Backend proxy with auth |
| XSS in markdown | Sanitize with DOMPurify |
| Rate limiting | Client-side throttle + server limits |
| Data storage | Encrypt sensitive data in IndexedDB |

---

## 6. Monitoring & Observability

### 6.1 Recommended Metrics

- API call latency (p50, p95, p99)
- Error rates by operation type
- Screen capture frame rate
- Audio latency
- Memory usage over time
- User engagement (session duration, features used)

### 6.2 Logging Strategy

```ts
// Structured logging
const logger = {
  info: (event: string, data: object) => 
    console.log(JSON.stringify({ level: 'info', event, ...data, ts: Date.now() })),
  error: (event: string, error: Error, data?: object) =>
    console.error(JSON.stringify({ level: 'error', event, error: error.message, ...data, ts: Date.now() }))
};

// Usage
logger.info('chat_response', { model: 'gemini-2.5-flash', latencyMs: 1234, hasRag: true });
```

---

## 7. Migration Path

### Phase 1: Stability (Current → +2 weeks)
- [ ] Add auto-reconnect for Live API
- [ ] Implement document persistence
- [ ] Add retry logic to API calls
- [ ] Fix memory leaks

### Phase 2: Polish (+2 → +6 weeks)
- [ ] Add keyboard shortcuts
- [ ] Implement toast notifications
- [ ] Add Veo progress indicator
- [ ] Virtual message list

### Phase 3: Features (+6 → +12 weeks)
- [ ] Conversation persistence
- [ ] Advanced RAG UI
- [ ] Export/import functionality
- [ ] Collaboration features

---

*Last updated: December 2024*
*Maintainer: JAN Team*
