import { COLORS, CHANNEL_COUNT, ROW_H, SIGNAL_H, PIN_LABEL_W, SCROLLBAR_H, GRID_DASH, TIME_DASH } from './constants';
import type { Config, Cursor } from './types';
import type { LogicData } from './model';
import { clamp } from './utils';

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
    //this.installEvents();
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

  xToTime(mouseX: number){
   return 0;
  }

  get cssWidth()  { return this.canvas.clientWidth || window.innerWidth; }
  get cssHeight() { return this.canvas.clientHeight || (window.innerHeight - 130); }

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

  centerScrollOnIndex(i: number) {
    const d = this.data;
    if (!d?.scaledTime || d.samples <= 0) return;
  
    // Asegura índice válido
    const idx = Math.max(0, Math.min(i, d.samples - 1));
  
    // Tiempos (soporta que no empiece en 0)
    const t0 = d.scaledTime[0];
    const t1 = d.scaledTime[d.samples - 1];      // <- en vez de [-1]
    const ti = d.scaledTime[idx];
  
    // Pista del scrollbar (rango donde se mueve el handle)
    const trackMin = this.xEdge;
    const trackMax = this.canvas.width / this.pixelRatio - this.scrollBar.width
    const trackSpan = Math.max(0, trackMax - trackMin);
  
    // Casos borde: sin rango temporal o sin espacio para desplazar
    if (t1 <= t0 || trackSpan === 0) {
      this.scrollBar.left = trackMin;
      this.updatescaledShiftFromScroll();
      return;
    }
  
    // Ratio dentro del rango temporal total
    const r = Math.max(0, Math.min(1, (ti - t0) / (t1 - t0)));
  
    // Posición ideal del centro del viewport sobre 'ti'
    const leftWanted = trackMin + r * trackSpan;

    // Para centrar: mueve el BORDE IZQUIERDO medio "viewport" hacia la izquierda
    //const leftWanted = centerOnTi; //- (this.scrollBar.width / 2)*(1-r);
    
    // Aplica límites y actualiza el shift
    this.scrollBar.left = clamp(leftWanted, trackMin, trackMax);
    this.updatescaledShiftFromScroll();
  }


  updatescaledShiftFromScroll() {
    const xEnd = this.data?.scaledTime?.[this.data.samples - 1] ?? 0;
    const w = this.canvas.width / this.pixelRatio - this.scrollBar.width;
    const m = (this.scrollBar.left - this.xEdge) / (w - this.xEdge || 1);
    this.scaledShift = -m * xEnd + (w) / 2 - this.xEdge / 2;
  }

  requestDraw() { if (this.requested) return; this.requested = true; requestAnimationFrame(() => { this.requested = false; this.draw(); }); }

  pos(ev: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
  
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
  
    return { x: x * scaleX, y: y * scaleY };
  }

  overScroll(x: number, y: number) {
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

  resize() {
    const dpi = window.devicePixelRatio || 1;
    this.pixelRatio = dpi;
    const cssW = this.cssWidth, cssH = this.cssHeight;
    this.canvas.width = Math.floor(cssW * dpi);
    this.canvas.height = Math.floor(cssH * dpi);
    this.ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
    this.yBottom = cssH - SCROLLBAR_H;
    this.scrollBar.top = this.yBottom;
    //this.syncScrollFromViewport();
    this.requestDraw();
  }

  draw() {
    const ctx = this.ctx;
    const W = this.cssWidth, H = this.cssHeight;
    ctx.clearRect(0, 0, W, H);
    this.drawLabelsAndGrid(W,H);
    this.drawChannelHighlight(W,H);
    this.drawSignals(W,H);
    this.drawScrollBar();
  }

  private drawChannelHighlight(W: number, H: number) {
    if (!this.cursor) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(50,50,50,0.6)';
    ctx.strokeStyle = COLORS.green;

    const y = (this.cursor.channel === CHANNEL_COUNT)
      ? this.yBottom - ROW_H
      : this.yEdge + ROW_H * this.cursor.channel - 2;

    const width = W - this.xEdge;
    ctx.fillRect(this.xEdge, y, width, ROW_H - 2);
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

  private drawSignals(_W: number, _H: number) {
    const data = this.data;
    if (!data || !data.ready || !data.scaledTime || !data.usTime || !data.initial) return;
  
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.xEdge, 0);
  
    ctx.strokeStyle = COLORS.green;
    ctx.fillStyle = COLORS.green;
    ctx.lineWidth = 1;
  
    // --- NUEVO: precomputar límites de los NO cambios (primer y último evento)
    const xStartUnshifted = data.scaledTime[0];                         // primer NO cambio
    //const xStart = xStartUnshifted + this.scaledShift;
    const xEnd = data.scaledTime[data.samples - 1] + this.scaledShift;  // último NO cambio
  
    // --- Buffers por cuadro
    //     Empezamos cada canal en el primer NO cambio, para poder trazar hasta el primer cambio.
    this._xPos = new Array(CHANNEL_COUNT).fill(xStartUnshifted); // último x SIN shift por canal
    this._isLow = new Map<string, boolean>();                    // nivel "antes del cambio" (true=LOW)
  
    // --- NUEVO: metadatos por canal para evitar recomputar
    const chKey: (string | null)[] = new Array(CHANNEL_COUNT).fill(null);
    const chIdx1: number[] = new Array(CHANNEL_COUNT);
    const chIdx2: number[] = new Array(CHANNEL_COUNT);
    const chY: number[] = new Array(CHANNEL_COUNT);
    const hadChange: boolean[] = new Array(CHANNEL_COUNT).fill(false);
  
    for (let n = 0; n < CHANNEL_COUNT; n++) {
      chY[n] = this.yEdge + n * ROW_H;
      if (this.pinArduinoNames[n] !== 0) {
        const [i1, i2] = this.indexFromAssignment(n);
        chIdx1[n] = i1; chIdx2[n] = i2;
        const key = `${i1}-${i2}`;
        chKey[n] = key;
  
        // Inicializa UNA VEZ el nivel desde el bit inicial.
        // (Mantenemos tu convención actual: bit===0 => isLow=true)
        if (!this._isLow.has(key)) {
          const bit = (data.initial[i2] >> i1) & 1;
          this._isLow.set(key, bit === 0);
        }
      } else {
        chIdx1[n] = 0; chIdx2[n] = 0;
      }
    }
  
    let textCovered = false;
  
    for (let i = 0; i < data.samples; i++) {
      let cares = false;
      let firstchangeY = 0;
  
      for (let n = 0; n < CHANNEL_COUNT; n++) {
        if (this.pinArduinoNames[n] === 0) continue;
  
        const idx1 = chIdx1[n];
        const idx2 = chIdx2[n];
  
        // state[i][idx1][idx2] == true  => hay cambio en este sample para este canal
        if (data.state![i][idx1][idx2]) {
          cares = true;
          if (firstchangeY === 0) firstchangeY = chY[n];
  
          const key = chKey[n]!;
          const wasLow = this._isLow.get(key)!;
  
          // Rail previo y rail destino
          const yPrev = wasLow ? (chY[n] + SIGNAL_H) : chY[n];
          const yNext = wasLow ? chY[n] : (chY[n] + SIGNAL_H);
  
          // FIX existente: aplicar scaledShift a ambos extremos
          const x0 = (this._xPos[n] ?? xStartUnshifted) + this.scaledShift;
          const x1 = data.scaledTime[i] + this.scaledShift;
  
          // Horizontal al nivel previo
          ctx.beginPath();
          ctx.moveTo(x0, yPrev);
          ctx.lineTo(x1, yPrev);
          ctx.stroke();
  
          // Vertical de transición
          ctx.beginPath();
          ctx.moveTo(x1, yPrev);
          ctx.lineTo(x1, yNext);
          ctx.stroke();
  
          // Actualiza último x (sin shift) y alterna nivel para la próxima
          this._xPos[n] = data.scaledTime[i];
          this._isLow.set(key, !wasLow);
          hadChange[n] = true;
        }
      }
  
      // Marcadores de tiempo y etiquetas (igual que antes)
      if ((this.drawTimes && cares) || i === 0) {
        ctx.setLineDash(TIME_DASH);
  
        const active = (this.cursor?.enabled && this.cursor.sample === i);
        ctx.strokeStyle = active ? COLORS.red : COLORS.grey;
        ctx.fillStyle = active ? COLORS.red : COLORS.grey;
  
        const xTime = data.scaledTime[i] + this.scaledShift;
        ctx.beginPath();
        ctx.moveTo(xTime, firstchangeY || this.yEdge);
        ctx.lineTo(xTime, this.yBottom);
        ctx.stroke();
  
        ctx.setLineDash([]);
        ctx.font = '10px ui-monospace, monospace';
  
        const label = Math.round(data.usTime[i]).toString();
        ctx.fillText(label, xTime + 2, textCovered ? this.yBottom - 10 : this.yBottom);
        textCovered = !textCovered;
  
        // Volver al color de señal
        ctx.strokeStyle = COLORS.green;
        ctx.fillStyle = COLORS.green;
      }
    }
  
    // --- NUEVO: “colas” hasta el último NO cambio (xEnd)
    // Si nunca hubo cambios en el canal, este trazo cubrirá de primer NO cambio a último NO cambio.
    for (let n = 0; n < CHANNEL_COUNT; n++) {
      if (this.pinArduinoNames[n] === 0) continue;
  
      const key = chKey[n]!;
      const atLow = this._isLow.get(key)!;           // nivel actual (tras el último cambio, o inicial)
      const yRail = atLow ? (chY[n] + SIGNAL_H) : chY[n];
      const x0tail = (this._xPos[n] ?? xStartUnshifted) + this.scaledShift;
  
      if (xEnd > x0tail) {
        ctx.beginPath();
        ctx.moveTo(x0tail, yRail);
        ctx.lineTo(xEnd, yRail);
        ctx.stroke();
      }
  
      // (Opcional: si quieres dibujar explícitamente desde xStart al primer cambio
      // en canales SIN ningún cambio, ya está cubierto porque _xPos[n] = xStartUnshifted.)
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