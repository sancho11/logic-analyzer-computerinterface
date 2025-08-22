import type { Transport } from './types';
import type { LogicData } from './model';
import type { View } from './view';
import { CHANNEL_COUNT } from './constants';
import { clamp } from './utils';

export class Controller {
  constructor(private view: View, private data: LogicData, private transport: Transport, private setStatus: (s: string) => void) {
    this.transport.onStatus = (t) => this.setStatus(t);
    this.transport.onLine = (line) => this.parseLine(line);
  }
  timeFormat: 'ms' | 'μs' = 'ms';
  reducer = 1.0;
  drawTimes = true;
  isAnyChannelMarked = false;
  channelCursor = { sample: 0, channel: CHANNEL_COUNT };

  parseLine(line: string) {
    if (!line) return;
    if (line === 'S') {
      this.data.reset();
      this.view.requestDraw();
      return;
    }
    const parts = line.split(':');
    if (parts.length !== 2) return;
    const [left, right] = parts;
    const abc = left.split(',').map(x => parseInt(x, 10));
    if (abc.some(Number.isNaN)) return;
    if (!this.data.pinChanged) {
      const samples = parseInt(right, 10) >>> 0;
      this.data.beginFrame(abc[0], abc[1], abc[2], samples);
    } else {
      const i = this.data.event;
      const timeUs = parseFloat(right);
      this.data.setEvent(i, abc[0], abc[1], abc[2], timeUs);
      if (this.data.ready) {
        this.data.scaleTime(this.timeFormat, this.reducer);
        this.view.setData(this.data, this.timeFormat, this.reducer, this.drawTimes);
        this.view.requestDraw();
      }
    }
  }

  async startCapture() {
    await this.transport.write('G');
    this.setStatus('Solicitando datos (G)...');
    this.view.setScroll(0);
    this.view.requestDraw();
  }
  toggleTimes() { this.drawTimes = !this.drawTimes; this.view.setDrawTimes(this.drawTimes); this.view.requestDraw(); }
  toggleFormat() { this.timeFormat = (this.timeFormat === 'ms') ? 'μs' : 'ms'; this.data.scaleTime(this.timeFormat, this.reducer); this.view.setData(this.data, this.timeFormat, this.reducer, this.drawTimes); this.view.requestDraw(); }
  changeReducer(delta: number) {
    let r = this.reducer;
    if (delta > 0) r += (r <= 1 ? 0.1 : (r <= 10 ? 1 : 10));
    else r -= (r <= 1 ? 0.1 : (r <= 10 ? 1 : 10));
    if (r > 90 && this.timeFormat === 'μs') { r = 0.1; this.timeFormat = 'ms'; }
    if (r < 0.1 && this.timeFormat === 'ms') { r = 100; this.timeFormat = 'μs'; }
    r = clamp(r, 0.1, (this.timeFormat === 'ms') ? 100 : 90);
    this.reducer = +r.toFixed(2);
    this.data.scaleTime(this.timeFormat, this.reducer);
    this.view.setData(this.data, this.timeFormat, this.reducer, this.drawTimes);
    this.view.requestDraw();
  }

  handleKey(code: string) {
    if (!this.data.ready) return;
    const marked = this.isAnyChannelMarked;
    if (code === 'ArrowUp' && marked) {
      const prev = this.channelCursor.channel;
      let ch = prev - 1;
      while (ch >= 0 && this.view.pinArduinoNames[ch] === 0) ch--;
      if (ch >= 0) this.channelCursor.channel = ch; else this.channelCursor.channel = prev;
      this.view.setCursor(this.channelCursor); this.view.requestDraw();
    } else if (code === 'ArrowDown' && marked) {
      const prev = this.channelCursor.channel;
      let ch = prev + 1;
      while (ch < CHANNEL_COUNT && this.view.pinArduinoNames[ch] === 0) ch++;
      if (ch < CHANNEL_COUNT) this.channelCursor.channel = ch; else this.channelCursor.channel = prev;
      this.view.setCursor(this.channelCursor); this.view.requestDraw();
    } else if (code === 'ArrowRight' && marked) {
      if (this.channelCursor.channel === CHANNEL_COUNT) {
        if (this.channelCursor.sample < this.data.samples - 1) this.channelCursor.sample++;
      } else {
        const [i1, i2] = this.view.indexFromAssignment(this.channelCursor.channel);
        for (let i = this.channelCursor.sample + 1; i < this.data.samples; i++) {
          this.channelCursor.sample = i;
          if (this.data.state![i][i1][i2]) break;
        }
      }
      this.view.setCursor(this.channelCursor, true); this.view.requestDraw();
    } else if (code === 'ArrowLeft' && marked) {
      if (this.channelCursor.channel === CHANNEL_COUNT) {
        if (this.channelCursor.sample > 0) this.channelCursor.sample--;
      } else {
        const [i1, i2] = this.view.indexFromAssignment(this.channelCursor.channel);
        for (let i = this.channelCursor.sample - 1; i >= 0; i--) {
          this.channelCursor.sample = i;
          if (this.data.state![i][i1][i2]) break;
        }
      }
      this.view.setCursor(this.channelCursor, true); this.view.requestDraw();
    } else if (code === 'ArrowLeft' && !marked) this.view.nudgeScroll(-1);
    else if (code === 'ArrowRight' && !marked) this.view.nudgeScroll(+1);
  }

  markChannelByClick(channel: number, mouseX: number) {
    this.isAnyChannelMarked = true;
    this.channelCursor.channel = channel;
    if (channel !== CHANNEL_COUNT && this.data.samples > 0 && this.data.xTime) {
      const target = -(this.view.xShift - mouseX + this.view.xEdge);
      let idx = 0;
      const last = this.data.xTime[this.data.samples - 1];
      if (target <= 0) idx = 0;
      else if (target >= last) idx = this.data.samples - 1;
      else {
        for (let i = 1; i < this.data.samples - 1; i++) {
          const compare = (this.data.xTime[i] + this.data.xTime[i + 1]) - (2 * target);
          if (compare < 0) {
            const [i1, i2] = this.view.indexFromAssignment(channel);
            if (this.data.state![i][i1][i2]) idx = i;
          } else break;
        }
      }
      this.channelCursor.sample = idx;
    }
    this.view.setCursor(this.channelCursor, true);
    this.view.requestDraw();
  }

  unmarkChannel() { this.isAnyChannelMarked = false; this.view.clearCursor(); this.view.requestDraw(); }
}