// A single source of truth for pan/zoom, expressed in DATA TIME units.
export class Viewport {
    tMin = 0;       // earliest data time
    tMax = 1;       // latest  data time
    t0 = 0;         // visible start (data time)
    t1 = 1;         // visible end   (data time)
    widthPx = 1;    // canvas CSS pixels (not device pixels)
  
    get span()   { return Math.max(1e-12, this.t1 - this.t0); }
    get center() { return (this.t0 + this.t1) / 2; }
  
    setCanvasWidth(widthPx: number) { this.widthPx = Math.max(1, widthPx); }
    setDataExtents(tMin: number, tMax: number) {
      this.tMin = tMin; this.tMax = Math.max(tMin, tMax);
      if (this.t0 < tMin || this.t1 > tMax) {
        const keep = Math.min(this.span, this.tMax - this.tMin);
        this.t0 = this.tMax - keep;
        this.t1 = this.tMax;
      }
    }
  
    timeToPx(t: number) { return (t - this.t0) * this.widthPx / this.span; }
    pxToTime(px: number) { return this.t0 + px * this.span / this.widthPx; }
  
    panPx(dxPx: number) {
      const dt = dxPx * this.span / this.widthPx;
      this.t0 += dt; this.t1 += dt; this.clamp();
    }
  
    zoom(factor: number, anchorPx: number) {
      // factor > 1 => zoom in, factor < 1 => zoom out
      const aT = this.pxToTime(anchorPx);
      const newSpan = this.span / Math.max(1e-6, factor);
      this.t0 = aT - (aT - this.t0) / factor;
      this.t1 = this.t0 + newSpan;
      this.clamp();
    }
  
    clamp() {
      const maxSpan = this.tMax - this.tMin;
      if (this.span >= maxSpan) { this.t0 = this.tMin; this.t1 = this.tMax; return; }
      if (this.t0 < this.tMin) { const d = this.tMin - this.t0; this.t0 += d; this.t1 += d; }
      if (this.t1 > this.tMax) { const d = this.t1 - this.tMax; this.t0 -= d; this.t1 -= d; }
    }
  }