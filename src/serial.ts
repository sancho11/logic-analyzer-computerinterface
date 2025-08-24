import type { Transport } from './types';

export class SerialTransport implements Transport {
  baud: number;
  port: SerialPort | null = null;
  reader: ReadableStreamDefaultReader<string> | null = null;
  writer: WritableStreamDefaultWriter<string> | null = null;
  closed = false;
  onLine: (line: string) => void = () => {};
  onStatus: (text: string) => void = () => {};

  constructor(baud = 115200) { this.baud = baud; }

  async connect(): Promise<void> {
    // @ts-expect-error web-serial types at runtime
    if (!('serial' in navigator)) { this.onStatus('Web Serial not available'); throw new Error('Web Serial not supported'); }
    // @ts-expect-error requestPort exists
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: this.baud });
    const textDecoder = new TextDecoderStream();
    const textEncoder = new TextEncoderStream();
    // @ts-expect-error pipeTo exists
    this.port.readable.pipeTo(textDecoder.writable);
    // @ts-expect-error writable exists
    textEncoder.readable.pipeTo(this.port.writable);
    const lineStream = textDecoder.readable.pipeThrough(new TransformStream<string, string>({
      start() { (this as any).buffer = ''; },
      transform(chunk, controller) {
        (this as any).buffer += chunk;
        const lines = (this as any).buffer.split(/\r?\n/);
        (this as any).buffer = lines.pop() ?? '';
        for (const l of lines) controller.enqueue(l);
      },
      flush(controller) { const b = (this as any).buffer; if (b) controller.enqueue(b); }
    }));
    this.reader = lineStream.getReader();
    this.writer = textEncoder.writable.getWriter();
    this.closed = false;
    this.onStatus('Connected');
    this.readLoop();
  }

  async readLoop() {
    try {
      while (!this.closed && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value != null) this.onLine(String(value).trim());
      }
    } catch (e) {
      this.onStatus('Read stopped: ' + e);
    }
  }

  async write(text: string): Promise<void> {
    if (!this.writer) throw new Error('Port not open (Check browser permissions for using tty)');
    await this.writer.write(text);
  }

  async close(): Promise<void> {
    try { this.closed = true; } catch {}
    try { await this.reader?.cancel(); } catch {}
    try { await this.writer?.close(); } catch {}
    try { await this.port?.close(); } catch {}
    this.onStatus('Disconnected');
  }
}

/** Simulación sin hardware: emite frames compatibles con el parser. */
export class SimulationTransport implements Transport {
  onLine: (line: string) => void = () => {};
  onStatus: (text: string) => void = () => {};
  private running = false;

  /**
   * @param basePeriodUs  Período (µs) del reloj más rápido (bit 0)
   * @param numClocks     Número de relojes a generar (máx. 24 -> 3 bytes)
   * @param samples       Número de muestras (eventos de “toggle”) a emitir
   */
  constructor(
    private basePeriodUs = 1000,
    private numClocks = 24,
    private samples = 120
  ) {}

  async connect(): Promise<void> {
    this.onStatus('Simulator Ready');
  }

  async write(text: string): Promise<void> {
    if (text !== 'G' || this.running) return;
    this.running = true;

    this.onLine('S');

    // Estados iniciales: todos bajos (0). Tres bytes -> hasta 24 canales.
    const init = [0,0,0];
    const samples = Math.max(1, this.samples);
    const N = Math.max(1, Math.min(this.numClocks, 24));
    this.onLine(init.join(',') + ':' + samples);

    // Tick de “medio período” del bit 0: cada tick hay un posible toggle.
    // Redondeo a entero para mantener µs enteros.
    const halfTickUs = Math.max(1, Math.floor(this.basePeriodUs / 2));

    let t = 0; // tiempo absoluto en microsegundos desde el inicio

    // i = 1..samples; en cada tick vemos qué bits deben conmutar.
    for (let i = 1; i <= samples; i++) {
      t += halfTickUs;

      // mask24 tiene 1s en los bits que conmutan en este instante.
      // El bit k conmuta cada 2^k ticks -> su período es basePeriodUs * 2^k.
      let mask24 = 0;
      for (let k = 0; k < N; k++) {
        const every = 1 << k;          // cada cuántos ticks conmuta el bit k
        if (i % every === 0) mask24 |= (1 << k);
      }

      // Dividir máscara en 3 bytes (a,b,c)
      const a =  mask24        & 0xFF;
      const b = (mask24 >> 8)  & 0xFF;
      const c = (mask24 >> 16) & 0xFF;

      this.onLine([a, b, c].join(',') + ':' + t);
    }

    this.running = false;
  }

  async close(): Promise<void> {
    this.onStatus('Simulator Stopped');
  }
}