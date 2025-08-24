import type { Transport, Cursor } from './types';
import type { LogicData } from './model';
import type { View } from './view';
import { CHANNEL_COUNT, DEFAULT_CONFIG } from './constants';
//import { clamp } from './utils';

export class Controller {
  timeFormat: 'ms' | 'μs' = 'ms';
  reducer = 1.0;
  drawTimes = true;
  isAnyChannelMarked = false;
  channelCursor: Cursor = { sample: 0, channel: CHANNEL_COUNT as number, enabled: false }; // 0..15 or 16(ALL)

  constructor(private view: View, private data: LogicData, private transport: Transport, private setStatus: (s: string) => void) {
    this.transport.onStatus = (t) => this.setStatus(t);
    this.transport.onLine = (line) => this.parseLine(line);
  }

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
    const signals_data = new Uint8Array(left.split(",").map(x => parseInt(x, 10)));
    if (signals_data.some(Number.isNaN)) return;
    if (!this.data.pinChanged) {
      const samples = parseInt(right, 10) >>> 0;
      this.data.beginFrame(signals_data, samples);
    } else {
      const i = this.data.event;
      const timeUs = parseFloat(right);
      this.data.setEvent(i, signals_data, timeUs);
      if (this.data.ready) {
        this.data.scaleTime(this.timeFormat, this.reducer);
        this.view.setData(this.data, this.timeFormat, this.reducer, this.drawTimes);
        this.view.requestDraw();
      }
    }
  }

  resetData() {this.data.reset(); this.view.setData(this.data, this.timeFormat, this.reducer, this.drawTimes); this.view.requestDraw();}

  async startCapture() {
    await this.transport.write('G');
    this.setStatus('Retrieving Data');
    this.view.setScroll(0);
    this.view.requestDraw();
  }


// === Selection / hit testing ===
onClick(x: number, y: number) {
  const ch = this.view.channelAt(x, y);
  if (ch == null) { this.unmarkChannel(); return; }
  this.getChannelCursorCurrentEvent(ch, x);  // Processing parity
  this.isAnyChannelMarked = true;
}

// Closely follows Processing getChannelCursorCurrentEvent()
private getChannelCursorCurrentEvent(channel: number, mouseX: number) {
  const t = this.view.xToTime(mouseX); // data time under mouse
  this.channelCursor.channel = channel;

  if (!this.data.scaledTime?.length) return;

  let idx = 0;
  const times = this.data.scaledTime;
  const samples = times.length;

  if (channel !== CHANNEL_COUNT) {
    const [i1, i2] = this.view.indexFromAssignment(channel); // you already have this helper
    if (t <= 0) idx = 0;
    else if (t >= times[samples - 1]) idx = samples - 1;
    else {
      // find last transition strictly before anchor t, honoring state[i][i1][i2]
      for (let i = 1; i < samples - 1; i++) {
        const compare = (times[i] + times[i + 1]) - (2 * t);
        if (compare < 0) {
          if (this.data.state![i][i1][i2]) idx = i;
        } else break;
      }
    }
  } else {
    // "ALL" row uses index only
    idx = this.channelCursor.sample;
  }

  this.channelCursor.sample = idx;
  this.view.setCursor(this.channelCursor);
  this.view.requestDraw();
  this.centerViewportOnIndex(idx); // like movepos()
}

private centerViewportOnIndex(i: number) {
  const t = this.data.scaledTime?.[i] ?? 0;
  const span = this.view.viewport.span;
  this.view.viewport.t0 = t - span / 2;
  this.view.viewport.t1 = t + span / 2;
  this.view.viewport.clamp();
  this.view.syncScrollFromViewport();
  this.view.requestDraw();
}

unmarkChannel() { this.isAnyChannelMarked = false; this.view.clearCursor(); this.view.requestDraw(); }

// === Keyboard nav — mirrors Processing keyPressed() ===
handleKey(code: 'ArrowUp'|'ArrowDown'|'ArrowLeft'|'ArrowRight') {
  if (!this.isAnyChannelMarked) {
    // left/right pans when no channel is marked
    if (code === 'ArrowLeft')  this.view.panPx(-1);
    if (code === 'ArrowRight') this.view.panPx(+1);
    return;
  }
  const cur = this.channelCursor;

  if (code === 'ArrowUp') {
    const prev = cur.channel;
    cur.channel = this.prevEnabledChannel(prev);
    if (cur.channel === -1) cur.channel = prev; // no change if none
    this.view.setCursor(cur); this.view.requestDraw();
    return;
  }

  if (code === 'ArrowDown') {
    const next = this.nextEnabledChannel(cur.channel);
    if (next !== null) { cur.channel = next; this.view.setCursor(cur); this.view.requestDraw(); }
    return;
  }

  if (code === 'ArrowRight') {
    if (cur.channel === CHANNEL_COUNT) {
      // "ALL" → move index one step if possible
      if (cur.sample < (this.data.samples - 1)) cur.sample += 1;
    } else {
      const [i1, i2] = this.view.indexFromAssignment(cur.channel);
      for (let i = cur.sample + 1; i < this.data.samples; i++) {
        cur.sample = i;
        if (this.data.state![i][i1][i2]) break;
      }
    }
    this.view.setCursor(cur); this.centerViewportOnIndex(cur.sample);
    return;
  }

  if (code === 'ArrowLeft') {
    if (cur.channel === CHANNEL_COUNT) {
      if (cur.sample > 0) cur.sample -= 1;
    } else {
      const [i1, i2] = this.view.indexFromAssignment(cur.channel);
      for (let i = cur.sample - 1; i >= 0; i--) {
        cur.sample = i;
        if (this.data.state![i][i1][i2]) break;
      }
    }
    this.view.setCursor(cur); this.centerViewportOnIndex(cur.sample);
    return;
  }
}

private prevEnabledChannel(start: number) {
  // Skip channels where PinAssignment is 0, like Processing
  for (let c = start - 1; c >= 0; c--) if (DEFAULT_CONFIG.pinAssignment[c] !== 0) return c;
  return -1;
}
private nextEnabledChannel(start: number) {
  for (let c = Math.min(16, start + 1); c < 16; c++) if (DEFAULT_CONFIG.pinAssignment[c] !== 0) return c;
  return CHANNEL_COUNT; // allow landing on "ALL"
}

// === Wheel (PAN only, like the original) ===
onWheel(ev: WheelEvent) {
  const delta = (ev.shiftKey ? 10 : 50) * (this.timeFormat === 'ms' ? this.reducer : this.reducer * 0.001);
  this.view.setScroll(this.view.scrollBar.left - Math.sign(ev.deltaY) * delta);
  this.view.requestDraw();
  ev.preventDefault();
}

// === Reducer / scale — zoom without moving the center ===
changeReducer(increase: boolean) {
  let r = this.reducer;
  if (increase) {
    if (r <= 1) r += 0.1;
    else if (r <= 10) r += 1;
    else r += 10;
    if (r > 90 && this.timeFormat === 'μs') { r = 0.1; this.timeFormat = 'ms'; }
    r = Math.min(r, 100);
  } else {
    if (r <= 1) r -= 0.1;
    else if (r <= 10) r -= 1;
    else r -= 10;
    if (r < 0.1 && this.timeFormat === 'ms') { r = 100; this.timeFormat = 'μs'; }
    r = Math.max(r, 0.1);
  }
  const anchorPx = this.view.cssWidth / 2; // keep center fixed
  const factor = increase ? 1.1 : 1 / 1.1;
  this.view.zoomAround(anchorPx, factor);
  this.reducer = +r.toFixed(2);
  this.data.scaleTime(this.timeFormat, this.reducer);
  this.view.setData(this.data, this.timeFormat, this.reducer, this.drawTimes);
  this.view.requestDraw();
}

toggleTimes() { this.drawTimes = !this.drawTimes; this.view.setDrawTimes(this.drawTimes); this.view.requestDraw(); }
toggleFormat() { this.timeFormat = (this.timeFormat === 'ms') ? 'μs' : 'ms'; this.data.scaleTime(this.timeFormat, this.reducer); this.view.setData(this.data, this.timeFormat, this.reducer, this.drawTimes); this.view.requestDraw(); }
}