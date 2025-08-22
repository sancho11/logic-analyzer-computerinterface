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
    if (!('serial' in navigator)) { this.onStatus('Web Serial no disponible'); throw new Error('Web Serial no soportado'); }
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
    this.onStatus('Conectado');
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
      this.onStatus('Lectura detenida: ' + e);
    }
  }

  async write(text: string): Promise<void> {
    if (!this.writer) throw new Error('Puerto no abierto');
    await this.writer.write(text);
  }

  async close(): Promise<void> {
    try { this.closed = true; } catch {}
    try { await this.reader?.cancel(); } catch {}
    try { await this.writer?.close(); } catch {}
    try { await this.port?.close(); } catch {}
    this.onStatus('Desconectado');
  }
}

/** Simulación sin hardware: emite frames compatibles con el parser. */
export class SimulationTransport implements Transport {
  onLine: (line: string) => void = () => {};
  onStatus: (text: string) => void = () => {};
  private timer: any = null;
  private running = false;

  async connect(): Promise<void> {
    this.onStatus('Simulador listo'); 
  }
  async write(text: string): Promise<void> {
    if (text !== 'G') return;
    if (this.running) return;
    this.running = true;
    this.onLine('S');
    // Estado inicial + muestras
    const samples = 120;
    const init = [0b00001111, 0b10101010, 0b01010101];
    this.onLine(init.join(',') + ':' + samples);
    let t = 0;
    // Crear toggles pseudo-aleatorios pero repetibles
    for (let i = 0; i < samples; i++) {
      const a = (i % 7 === 0) ? 1<< (i%8) : 0;
      const b = (i % 5 === 0) ? 1<< ((i+2)%8) : 0;
      const c = (i % 3 === 0) ? 1<< ((i+4)%8) : 0;
      t += 250 + ((i*17)%50); // microsegundos
      this.onLine([a,b,c].join(',') + ':' + t);
    }
    // detener simulación después de enviar todo
    setTimeout(() => { this.running = false; }, 0);
  }
  async close(): Promise<void> { clearInterval(this.timer); this.onStatus('Simulador detenido'); }
}