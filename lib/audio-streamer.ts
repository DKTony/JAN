export class AudioStreamer {
    public audioQueue: Float32Array[] = [];
    public isPlaying: boolean = false;
    public sampleRate: number = 24000;
    public bufferSize: number = 7680;
    public processingAudio: boolean = false;
    public gainNode: GainNode;
    public audioContext: AudioContext;
    public isStreamComplete: boolean = false;
    public checkInterval: number | null = null;
    public initialBufferTime: number = 100; // ms
    public endOfQueueAudioSource: AudioBufferSourceNode | null = null;
    public onComplete: () => void = () => {};
  
    constructor(context: AudioContext) {
      this.audioContext = context;
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
    }
  
    addPCM16(chunk: Uint8Array) {
      const float32Array = new Float32Array(chunk.length / 2);
      const dataView = new DataView(chunk.buffer);
  
      for (let i = 0; i < chunk.length / 2; i++) {
        const int16 = dataView.getInt16(i * 2, true);
        float32Array[i] = int16 / 32768;
      }
  
      this.audioQueue.push(float32Array);
  
      if (!this.isPlaying) {
        this.isPlaying = true;
        // Buffer slightly before starting to prevent stutter
        setTimeout(() => {
          this.scheduleNextBuffer();
        }, this.initialBufferTime);
      }
    }
  
    private scheduleNextBuffer() {
        if (this.audioQueue.length === 0) {
            if (this.isStreamComplete) {
                this.isPlaying = false;
                this.onComplete();
            }
            return;
        }
  
        const audioData = this.audioQueue.shift();
        if (!audioData) return;
  
        const audioBuffer = this.audioContext.createBuffer(1, audioData.length, this.sampleRate);
        audioBuffer.getChannelData(0).set(audioData);
  
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.gainNode);
        
        source.onended = () => {
            this.scheduleNextBuffer();
        };
        
        source.start(0);
    }
  
    stop() {
      this.isPlaying = false;
      this.isStreamComplete = true;
      this.audioQueue = [];
      this.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
      
      setTimeout(() => {
        this.gainNode.disconnect();
        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);
      }, 200);
    }
  }