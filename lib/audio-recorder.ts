export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private listeners: Map<string, Function[]> = new Map();

  constructor(private sampleRate = 16000) {}

  on(event: string, fn: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(fn);
  }

  off(event: string, fn: Function) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      this.listeners.set(event, callbacks.filter((c) => c !== fn));
    }
  }

  emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }

  async start() {
    try {
      // Check if mediaDevices API is available (requires HTTPS or localhost)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'Microphone access requires a secure context (HTTPS or localhost). ' +
          'Please access this app via https:// or http://localhost'
        );
      }
      
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      
      // Use ScriptProcessor for broad compatibility in this context
      // In production, AudioWorklet is preferred for performance
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = this.floatTo16BitPCM(inputData);
        this.emit('data', pcm16);
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    } catch (error) {
      console.error('Error starting audio recording:', error);
      throw error;
    }
  }

  stop() {
    if (this.processor && this.source) {
        this.source.disconnect();
        this.processor.disconnect();
    }
    if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
    }
    if (this.audioContext) {
        this.audioContext.close();
    }
    
    this.stream = null;
    this.audioContext = null;
    this.source = null;
    this.processor = null;
  }

  private floatTo16BitPCM(input: Float32Array): ArrayBuffer {
    const output = new DataView(new ArrayBuffer(input.length * 2));
    for (let i = 0; i < input.length; i++) {
      let s = Math.max(-1, Math.min(1, input[i]));
      s = s < 0 ? s * 0x8000 : s * 0x7FFF;
      output.setInt16(i * 2, s, true);
    }
    return output.buffer;
  }
}