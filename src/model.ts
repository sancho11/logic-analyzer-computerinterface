import type { TimeFormat } from './types';

export class LogicData {
  samples = 0;
  event = 0;
  initial: Uint8Array | null = null;
  pinChanged: Uint8Array[] | null = null;
  usTime: Float32Array | null = null;
  scaledTime: Float32Array | null = null;
  state: boolean[][][] | null = null;
  ready = false;

  reset() {
    this.initial?.fill(0);
    this.samples = 0;
    this.event = 0;
    this.pinChanged = null;
    this.usTime = null;
    this.scaledTime = null;
    this.state = null;
    this.ready = false;
  }

  beginFrame(initials: Uint8Array, samples: number) {
    // Store the provided Uint8Array (make a copy if you don’t want external mutation)
    this.initial = new Uint8Array(initials); 
  
    this.samples = samples >>> 0;
    this.event = 0;
    this.ready = false;
  
    // Allocate per-sample structures
    this.pinChanged = Array.from(
      { length: samples },
      () => new Uint8Array(initials.length)   // same length as initial
    );
  
    this.usTime = new Float32Array(samples);
    this.scaledTime = new Float32Array(samples);
  
    this.state = Array.from(
      { length: samples },
      () =>
        Array.from(
          { length: 8 },
          () => new Array(initials.length).fill(false)
        )
    );
  }

  setEvent(i: number, signal_events: Uint8Array, timeUs: number) {
    if (!this.pinChanged || !this.usTime) return;
    this.pinChanged[i] = new Uint8Array(signal_events);
    this.usTime[i] = +timeUs;
    this.event = i + 1;
    if (this.event === this.samples) this.finalize();
  }

  finalize() {
    if (!this.pinChanged || !this.usTime || !this.state) return;
    for (let i = 0; i < this.samples; i++) {
      for (let n = 0, mask = 1; n < 8; n++, mask <<= 1) {
        for (let b = 0; b < 3; b++) this.state[i][n][b] = !!(this.pinChanged[i][b] & mask);
      }
    }
    this.ready = true;
  }

  scaleTime(timeFormat: TimeFormat, reducer: number) {
    if (!this.usTime || !this.scaledTime) return;
    const scale = (timeFormat === 'ms') ? (1000 * reducer) : (1 * reducer);
    for (let i = 0; i < this.samples; i++) this.scaledTime[i] = this.usTime[i] / scale;
  }
}