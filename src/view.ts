import { COLORS, CHANNEL_COUNT, ROW_H, SIGNAL_H, PIN_LABEL_W, SCROLLBAR_H, GRID_DASH, TIME_DASH } from './constants';
import type { Config, Cursor } from './types';
import type { LogicData } from './model';
import { clamp } from './utils';
import { Viewport } from './viewport';

export class View {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  config: Config;
  xEdge = PIN_LABEL_W;
  yEdge = 10;
  yBottom = 0;
  scrollBar = { left: PIN_LABEL_W, width: 20, height: SCROLLBAR_H, top: 0, dragging: false };
  drawTimes = true;
  scaledShift = 0;
  data: LogicData | null = null;
  timeFormat: 'ms' | 'μs' = 'ms';
  reducer = 1.0;
  requested = false;
  //cursor: Cursor = { sample: 0, channel: CHANNEL_COUNT, enabled: false };
  cursor: Cursor | null = null; // { sample: number; channel: 0..15 or CHANNEL_COUNT (ALL) }
  viewport = new Viewport();
  pixelRatio = 1;
  pinArduinoNames: number[] = new Array(CHANNEL_COUNT).fill(0);

  private _xPos: number[] = new Array(CHANNEL_COUNT).fill(0);
  private _isLow = new Map<string, boolean>();

  constructor(canvas: HTMLCanvasElement, config: Config) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not available');
    this.ctx = ctx;
    this.config = config;
    this.recomputePinLabels();
    this.installEvents();
    this.resize();
  }

  recomputePinLabels() {
    // Mapear nombres visibles: mantenemos simple (PIN n) salvo STM32F1 (PB n)
    this.pinArduinoNames = this.config.pinAssignment.map((v) => {
      const [pinA, pinB] = String(v).padStart(2,'0').split('').map(Number);
      // No convertimos aquí a nombres exactos; solo marcamos activos (no cero)
      return v === 0 ? 0 : (v >= 10 ? v : 0);
    });
  }

  get cssWidth()  { return this.canvas.clientWidth || window.innerWidth; }
  get cssHeight() { return this.canvas.clientHeight || (window.innerHeight - 130); }

  attachData(data: LogicData) {
    this.data = data;
    const tMin = 0;
    const tMax = data.scaledTime?.length ? data.scaledTime[data.scaledTime.length - 1] : 1;
    this.viewport.setDataExtents(tMin, tMax);
    this.requestDraw();
  }

  setData(data: LogicData, timeFormat: 'ms' | 'μs', reducer: number, drawTimes: boolean) {
    this.data = data; this.timeFormat = timeFormat; this.reducer = reducer; this.drawTimes = drawTimes;
  }
  setDrawTimes(v: boolean) { this.drawTimes = v; }

  setCursor(c: Cursor) { this.cursor = c }
  clearCursor() { this.cursor = null; }

  indexFromAssignment(ch: number): [number, number] {
    const s = String(this.config.pinAssignment[ch]).padStart(2,'0');
    const index1 = s.charCodeAt(1) - '0'.charCodeAt(0);
    const index2 = s.charCodeAt(0) - '1'.charCodeAt(0);
    return [index1, index2];
  }

  setScroll(px: number) {
    const max = this.canvas.width / this.pixelRatio - this.scrollBar.width;
    this.scrollBar.left = clamp(px, this.xEdge, max);
    this.updatescaledShiftFromScroll();
  }
  nudgeScroll(dx: number) { this.setScroll(this.scrollBar.left + dx); this.requestDraw(); }
  setscaledShift(v: number) { this.scaledShift = v; }

  updatescaledShiftFromScroll() {
    const xEnd = this.data?.scaledTime?.[this.data.samples - 1] ?? 0;
    const w = this.canvas.width / this.pixelRatio - this.scrollBar.width;
    const m = (this.scrollBar.left - this.xEdge) / (w - this.xEdge || 1);
    this.scaledShift = -m * xEnd + (w) / 2 - this.xEdge / 2;
  }

  requestDraw() { if (this.requested) return; this.requested = true; requestAnimationFrame(() => { this.requested = false; this.draw(); }); }

  private installEvents() {
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('wheel', (ev) => {
      const delta = (ev.shiftKey ? 10 : 50) * (this.timeFormat === 'ms' ? this.reducer : this.reducer * 0.001);
      this.setScroll(this.scrollBar.left - Math.sign(ev.deltaY) * delta);
      this.requestDraw();
      ev.preventDefault();
    }, { passive: false });
    this.canvas.addEventListener('mousemove', (ev) => {
      const p = this.pos(ev);
      if (this.overScroll(p.x, p.y)) this.canvas.style.cursor = 'pointer';
      else if (this.channelAt(p.x, p.y) !== -1) this.canvas.style.cursor = 'pointer';
      else this.canvas.style.cursor = 'default';
      if (this.scrollBar.dragging) {
        this.setScroll(p.x - this.scrollBar.width / 2);
        this.requestDraw();
      }
    });
    this.canvas.addEventListener('mousedown', (ev) => {
      const p = this.pos(ev);
      if (this.overScroll(p.x, p.y)) this.scrollBar.dragging = true;
    });
    window.addEventListener('mouseup', () => { this.scrollBar.dragging = false; });
  }

  private pos(ev: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }
  private overScroll(x: number, y: number) {
    return x >= this.scrollBar.left && x <= this.scrollBar.left + this.scrollBar.width && y >= this.scrollBar.top && y <= this.scrollBar.top + this.scrollBar.height;
  }
  channelAt(x: number, y: number): number | null {
    if (x < this.xEdge || x > this.cssWidth) return null;
    // channels 0..15 stacked from yEdge, each ROW_H tall; "ALL" row sits above the scrollbar
    const idx = Math.floor((y - this.yEdge) / ROW_H);
    if (idx >= 0 && idx < 16) return idx;
    // ALL row
    if (y >= this.yBottom - ROW_H && y < this.yBottom) return CHANNEL_COUNT;
    return null;
  }

  timeToX(t: number) { return this.viewport.timeToPx(t); }
  xToTime(x: number) { return this.viewport.pxToTime(x); }

  panPx(dx: number)  { this.viewport.panPx(dx); this.syncScrollFromViewport(); this.requestDraw(); }
  zoomAround(px: number, factor: number) { this.viewport.zoom(factor, px); this.syncScrollFromViewport(); this.requestDraw(); }

  // keep scroll bar and viewport center in sync
  syncScrollFromViewport() {
    const center = this.viewport.center;
    const left = this._map(center, this.viewport.tMin, this.viewport.tMax, this.xEdge, this.cssWidth - this.scrollBar.width);
    this.scrollBar.left = Math.max(this.xEdge, Math.min(this.cssWidth - this.scrollBar.width, left));
  }
  syncViewportFromScroll() {
    const center = this._map(this.scrollBar.left, this.xEdge, this.cssWidth - this.scrollBar.width, this.viewport.tMin, this.viewport.tMax);
    const span = this.viewport.span;
    this.viewport.t0 = center - span / 2;
    this.viewport.t1 = center + span / 2;
    this.viewport.clamp();
  }

  resize() {
    const dpi = window.devicePixelRatio || 1;
    this.pixelRatio = dpi;
    const cssW = this.cssWidth, cssH = this.cssHeight;
    this.canvas.width = Math.floor(cssW * dpi);
    this.canvas.height = Math.floor(cssH * dpi);
    this.ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
    this.yBottom = cssH - SCROLLBAR_H;
    this.scrollBar.top = this.yBottom;
    this.viewport.setCanvasWidth(cssW);
    this.syncScrollFromViewport();
    this.requestDraw();
  }

  draw() {
    const ctx = this.ctx;
    const W = this.cssWidth, H = this.cssHeight;
    ctx.clearRect(0, 0, W, H);
    this.drawLabelsAndGrid(W,H);
    this.drawCursor(W,H);
    this.drawSignals(W,H);
    this.drawCursorHighlight();
    this.drawScrollBar();
  }

  private drawCursorHighlight() {
    if (!this.cursor) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(50,50,50,0.6)';
    ctx.strokeStyle = COLORS.green;

    const y = (this.cursor.channel === CHANNEL_COUNT)
      ? this.yBottom - ROW_H
      : this.yEdge + ROW_H * this.cursor.channel - 2;

    const width = this.cssWidth - this.xEdge;
    ctx.fillRect(0, y, width, ROW_H - 2);
    ctx.restore();
  }

  private drawLabelsAndGrid(W: number, H: number) {
    const ctx = this.ctx;
    ctx.strokeStyle = COLORS.white; ctx.fillStyle = COLORS.white; ctx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    let y = 30; const x = 5;
    for (let i = 0; i < CHANNEL_COUNT; i++) {
      ctx.strokeStyle = COLORS.white; ctx.beginPath(); ctx.moveTo(0, y-20); ctx.lineTo(this.xEdge, y-20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y+10); ctx.lineTo(this.xEdge, y+10); ctx.stroke();
      ctx.strokeStyle = COLORS.orange; ctx.setLineDash(GRID_DASH);
      ctx.beginPath(); ctx.moveTo(this.xEdge, y-23); ctx.lineTo(W, y-23); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(this.xEdge, y+13); ctx.lineTo(W, y+13); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.white;
      const label = (this.pinArduinoNames[i] === 0) ? 'PIN OFF' : `PIN ${this.pinArduinoNames[i]}`;
      ctx.fillText(label, x, y);
      y += ROW_H;
    }
    ctx.fillText(' ALL ', x, H - SCROLLBAR_H - ROW_H + 20);
    ctx.fillText('EVENTS', x, H - SCROLLBAR_H - ROW_H + 35);
  }

  private drawCursor(W: number, H: number) {
    const ctx = this.ctx; if (!this.cursor?.enabled || !this.cursor) return;
    ctx.fillStyle = '#323232'; ctx.strokeStyle = '#4b4b4b';
    if (this.cursor.channel === CHANNEL_COUNT) ctx.fillRect(0, this.yBottom - ROW_H, W - this.xEdge, ROW_H - 2);
    else {
      const y = this.yEdge + ROW_H * this.cursor.channel - 2;
      ctx.fillRect(0, y, W - this.xEdge, ROW_H - 2);
    }
  }

  private drawSignals(_W: number, _H: number) {
    const data = this.data;
    if (!data || !data.ready || !data.scaledTime || !data.usTime || !data.initial) return;
  
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.xEdge, 0);
  
    ctx.strokeStyle = COLORS.green;
    ctx.fillStyle = COLORS.green;
    ctx.lineWidth = 1;
  
    let yPos = this.yEdge;
    let textCovered = false;
  
    // Per-frame buffers (like original)
    this._xPos = new Array(CHANNEL_COUNT).fill(0);      // last x (unshifted) per channel
    this._isLow = new Map<string, boolean>();           // current level BEFORE change (true = low)
  
    for (let i = 0; i < data.samples; i++) {
      let cares = false;
      let firstchange = 0;
      yPos = this.yEdge;
  
      for (let n = 0; n < CHANNEL_COUNT; n++) {
        if (this.pinArduinoNames[n] !== 0) {
          const [idx1, idx2] = this.indexFromAssignment(n);
  
          // state[i][idx1][idx2] is interpreted as "there is a change at this sample"
          if (data.state![i][idx1][idx2]) {
            cares = true;
            if (firstchange === 0) firstchange = yPos;
  
            const ySave = yPos;
            const key = `${idx1}-${idx2}`;
  
            // Initialize level ONCE from initial bit: 0 = HIGH, 1 = LOW  → store isLow = (bit === 1)
            if (!this._isLow.has(key)) {
              const bit = (data.initial[idx2] >> idx1) & 1;
              this._isLow.set(key, bit === 1);
            }
  
            const wasLow = this._isLow.get(key)!;
  
            // Horizontal line at previous level (rail), then vertical transition to the other rail
            const yLine = wasLow ? (yPos + SIGNAL_H) : yPos;   // previous rail
            const yDiff = wasLow ? yPos : (yPos + SIGNAL_H);   // other rail
  
            // FIX: apply scaledShift to BOTH endpoints (start and end)
            const x0 = (this._xPos[n] ?? 0) + this.scaledShift;
            const x1 = data.scaledTime[i] + this.scaledShift;
  
            // Draw horizontal (previous level) and then vertical (transition)
            ctx.beginPath();
            ctx.moveTo(x0, yLine);
            ctx.lineTo(x1, yLine);
            ctx.stroke();
  
            ctx.beginPath();
            ctx.moveTo(x1, yLine);
            ctx.lineTo(x1, yDiff);
            ctx.stroke();
  
            // Update last x (unshifted, like original) and toggle level for next time
            this._xPos[n] = data.scaledTime[i];
            this._isLow.set(key, !wasLow);
  
            // Restore y for next channel row
            yPos = ySave;
          }
        }
        yPos += ROW_H; // next channel row
      }
  
      // Time markers & labels
      if ((this.drawTimes && cares) || i === 0) {
        ctx.setLineDash(TIME_DASH);
  
        const active = (this.cursor?.enabled && this.cursor.sample === i);
        ctx.strokeStyle = active ? COLORS.red : COLORS.grey;
        ctx.fillStyle = active ? COLORS.red : COLORS.grey;
  
        const xTime = data.scaledTime[i] + this.scaledShift;
        ctx.beginPath();
        ctx.moveTo(xTime, firstchange);
        ctx.lineTo(xTime, this.yBottom);
        ctx.stroke();
  
        ctx.setLineDash([]);
        ctx.font = '10px ui-monospace, monospace';
  
        const label = Math.round(data.usTime[i]).toString();
        ctx.fillText(label, xTime + 2, textCovered ? this.yBottom - 10 : this.yBottom);
        textCovered = !textCovered;
  
        // Back to signal color
        ctx.strokeStyle = COLORS.green;
        ctx.fillStyle = COLORS.green;
      }
    }
  
    ctx.restore();
  }
  

  private drawScrollBar() {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.grey;
    ctx.fillRect(this.scrollBar.left, this.scrollBar.top, this.scrollBar.width, this.scrollBar.height);
  }

  private _map(x: number, a: number, b: number, c: number, d: number) { return c + (d - c) * ((x - a) / (b - a || 1)); }
}