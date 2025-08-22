import type { TimeFormat } from './types';

export class LogicData {
  initial = new Uint32Array(3);
  samples = 0;
  event = 0;
  pinChanged: Uint32Array[] | null = null; // [samples][3]
  usTime: Float32Array | null = null;
  xTime: Float32Array | null = null;
  state: boolean[][][] | null = null; // [samples][8][3]
  ready = false;

  reset() {
    this.initial.fill(0);
    this.samples = 0;
    this.event = 0;
    this.pinChanged = null;
    this.usTime = null;
    this.xTime = null;
    this.state = null;
    this.ready = false;
  }

  beginFrame(init0: number, init1: number, init2: number, samples: number) {
    this.initial[0] = init0 >>> 0;
    this.initial[1] = init1 >>> 0;
    this.initial[2] = init2 >>> 0;
    this.samples = samples >>> 0;
    this.event = 0;
    this.ready = false;
    this.pinChanged = Array.from({ length: samples }, () => new Uint32Array(3));
    this.usTime = new Float32Array(samples);
    this.xTime = new Float32Array(samples);
    this.state = Array.from({ length: samples }, () => Array.from({ length: 8 }, () => new Array(3).fill(false)));
  }

  setEvent(i: number, a: number, b: number, c: number, timeUs: number) {
    if (!this.pinChanged || !this.usTime) return;
    this.pinChanged[i][0] = a >>> 0;
    this.pinChanged[i][1] = b >>> 0;
    this.pinChanged[i][2] = c >>> 0;
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
    if (!this.usTime || !this.xTime) return;
    const scale = (timeFormat === 'ms') ? (1000 * reducer) : (1 * reducer);
    for (let i = 0; i < this.samples; i++) this.xTime[i] = this.usTime[i] / scale;
  }
}