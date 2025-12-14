# JAN

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

JAN (Just Another Neuralnet) is an intelligent, multimodal AI screen overlay assistant that "sees" what you see. Built with React 19 and the Gemini Multimodal Live API, it provides real-time voice and text interaction, screen context awareness, and generative capabilities for images and video.

## Features
- **Real-time Screen Perception**: Captures your screen at 1 FPS and feeds it to Gemini Live for context-aware assistance.
- **Multimodal Chat**: Talk or type to your agent. It understands your screen, your voice, and your text.
- **Generative Tools**:
  - **Image Generation**: Create designs instantly with Nano Banana.
  - **Video Generation**: Visualize concepts with Veo.
- **Knowledge Base**: Upload documents for the agent to reference (RAG) using Google File Search Stores.
- **Whiteboard**: Collaborative space for sketching ideas.

## Documentation
For detailed technical documentation, architecture diagrams, and development guides, start with **[docs/context.md](./docs/context.md)** (primary entrypoint) and the documents it links to.

## Quick Start

### Prerequisites
- Node.js (v18+ recommended)
- Google Gemini API Key (with access to Multimodal Live API)

### Installation

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Configure Environment:**
    Create a `.env.local` file in the root directory:
    ```bash
    GEMINI_API_KEY=your_actual_api_key
    ```

3.  **Run the Application:**
    ```bash
    npm run dev
    ```
    The app will typically launch at `http://localhost:5173`.

## Technologies
- **React 19** + **Vite**
- **@google/genai** SDK
- **Tailwind CSS**
- **Lucide Icons**

## License
MIT License - see [LICENSE](./LICENSE) for details.
