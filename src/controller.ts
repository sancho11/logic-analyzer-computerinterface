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
    //this.view.setScroll(0);
    this.view.requestDraw();
  }


// === Selection / hit testing ===
onClick(x: number, y: number) {
  const ch = this.view.channelAt(x, y);
  if (ch == null) { this.unmarkChannel(); return; }
  this.getChannelCursorCurrentEvent(ch, x);  // Processing parity
  this.isAnyChannelMarked = true;
}

private xToTimeFromScroll(): number {
  const times = this.data!.scaledTime!;
  const t0 = times[0];
  const tN = times[times.length - 1];
  const dt = tN - t0;

  const trackMin = this.view.xEdge;
  const trackMax = (this.view.canvas.width / this.view.pixelRatio) - this.view.scrollBar.width;
  const left     = this.view.scrollBar.left;
  const handleSpan = Math.max(1, trackMax - trackMin); // evita /0

  const tStart = t0 + ((left - trackMin) / handleSpan)*(dt);// - visibleSpan);
  return tStart; //tStart + visibleSpan;
}

// upper_bound: primer índice con times[i] > t
private upperBound(times: Float32Array<ArrayBufferLike>, t: number): number {
  let lo = 0, hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid + 1; else hi = mid;
  }
  return lo; // puede devolver 0..n
}

// -----------------------------------------

private getChannelCursorCurrentEvent(channel: number, mouseX: number) {
  const times = this.data?.scaledTime;
  if (!times || times.length === 0) return;

  const n = times.length;

  const t = this.xToTimeFromScroll();

  let idx = Math.max(0, Math.min(n - 1, this.upperBound(times, t) - 1));
  console.log({
    "mouseX":mouseX,
    "t":t,
    "idx":idx
  });

  // 3) (Opcional) Validar por state y elegir el válido más cercano
  if (channel < CHANNEL_COUNT && this.data.state) {
    const [i1, i2] = this.view.indexFromAssignment(channel);

    if (!this.data.state[idx][i1][i2]) {
      // Busca el válido más cercano alrededor de idx (rompe temprano si mejora no es posible)
      let best = -1, bestDist = Infinity;
      let L = idx - 1, R = idx + 1;

      const consider = (k: number) => {
        const dist = Math.abs(times[k] - t);
        if (dist < bestDist) { bestDist = dist; best = k; }
      };

      if (this.data.state[idx][i1][i2]) best = idx, bestDist = 0; // por si acaso

      while (L >= 0 || R < n) {
        if (R < n && this.data.state[R][i1][i2]) consider(R);
        if (L >= 0 && this.data.state[L][i1][i2]) consider(L);

        // Heurística de corte: si el siguiente candidato posible ya está más lejos que best, terminamos
        const nextGap = Math.min(
          L >= 0 ? Math.abs(times[L] - t) : Infinity,
          R < n ? Math.abs(times[R] - t) : Infinity
        );
        if (best >= 0 && nextGap > bestDist) break;

        R++; L--;
      }
      if (best >= 0) idx = best;
    }
  }

  // 4) Actualiza cursor
  this.channelCursor.channel = channel;
  this.channelCursor.enabled = true;
  this.channelCursor.sample  = idx;

  this.view.setCursor(this.channelCursor);
  this.view.requestDraw();
}

unmarkChannel() { this.isAnyChannelMarked = false; this.view.clearCursor(); this.view.requestDraw(); }

// === Keyboard nav — mirrors Processing keyPressed() ===
handleDirectionals(ev: KeyboardEvent) {
  ev.preventDefault();
  const code: string =ev.code //'ArrowUp'|'ArrowDown'|'ArrowLeft'|'ArrowRight'
  if (!this.isAnyChannelMarked) {
    // left/right pans when no channel is marked
    const delta = (600) * (this.timeFormat === 'ms' ? this.reducer : this.reducer * 0.001);
    if (code === 'ArrowLeft'){
      this.view.nudgeScroll(-delta);
      this.view.requestDraw();
    }
    else if (code === 'ArrowRight'){
      this.view.nudgeScroll(+delta);
      this.view.requestDraw();
    }
    return;
  }
  const cur = this.channelCursor;

  if (code === 'ArrowUp') {
    const prev = cur.channel;
    cur.channel = this.prevEnabledChannel(prev);
    if (cur.channel === -1){cur.channel = prev; return;} // no change if none
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
    this.view.setCursor(cur); 
    this.view.centerScrollOnIndex(cur.sample);
    this.view.requestDraw();
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
    this.view.setCursor(cur);
    this.view.centerScrollOnIndex(cur.sample);
    this.view.requestDraw();
    return;
  }
  this.view.requestDraw();
}

onmouseMove(ev:MouseEvent){
    ev.preventDefault();
    //ScrollBar Control Logic
    const p = this.view.pos(ev);
    if (this.view.overScroll(p.x, p.y)) this.view.canvas.style.cursor = 'pointer';
    else if (this.view.channelAt(p.x, p.y) !== -1) this.view.canvas.style.cursor = 'pointer';
    else this.view.canvas.style.cursor = 'default';
    if (this.view.scrollBar.dragging) {
      this.view.setScroll(p.x - this.view.scrollBar.width / 2);
      this.view.requestDraw();
    }
}

onmouseDown(ev:MouseEvent){
  ev.preventDefault();
  //ScrollBar Control Logic
  const p = this.view.pos(ev);
  if (this.view.overScroll(p.x, p.y)){
    this.view.scrollBar.dragging=true
  }
}

onmouseUp(ev:MouseEvent){
  ev.preventDefault();
  //ScrollBar Control Logic
  this.view.scrollBar.dragging=false
}

onkeyDown(ev:KeyboardEvent){
  //Directional handle logic
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(ev.code)){
    this.handleDirectionals(ev);
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
  ev.preventDefault();
  const delta = (ev.shiftKey ? 200 : 800) * (this.timeFormat === 'ms' ? this.reducer : this.reducer * 0.001);
  this.view.setScroll(this.view.scrollBar.left - Math.sign(ev.deltaY) * delta);
  this.view.requestDraw();
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
  //this.view.zoomAround(anchorPx, factor);
  this.reducer = +r.toFixed(2);
  this.data.scaleTime(this.timeFormat, this.reducer);
  this.view.setData(this.data, this.timeFormat, this.reducer, this.drawTimes);
  //this.view.setScroll(0)
  //Keep zoom over cursor
  this.view.updatescaledShiftFromScroll();

  this.view.requestDraw();
}

toggleTimes() { this.drawTimes = !this.drawTimes; this.view.setDrawTimes(this.drawTimes); this.view.requestDraw(); }
toggleFormat() {
  this.timeFormat = (this.timeFormat === 'ms') ? 'μs' : 'ms';
  this.data.scaleTime(this.timeFormat, this.reducer);
  this.view.setData(this.data, this.timeFormat, this.reducer, this.drawTimes);
  this.view.updatescaledShiftFromScroll(); this.view.requestDraw();
}
}