import { DEFAULT_CONFIG } from './constants';
import { View } from './view';
import { LogicData } from './model';
import { SerialTransport, SimulationTransport } from './serial';
import { Controller } from './controller';
import { fmt } from './utils';

const canvas = document.getElementById('scope') as HTMLCanvasElement;
const view = new View(canvas, DEFAULT_CONFIG);
const data = new LogicData();
let transport: SerialTransport | SimulationTransport = new SerialTransport(115200);
let controller = new Controller(view, data, transport, setStatus);

const $ = (id: string) => document.getElementById(id)!;
const statusEl = $('status');

function setStatus(text: string) { statusEl.textContent = text; }

$('btnConnect').addEventListener('click', async () => {
  // @ts-expect-error serial may not exist
  if (!('serial' in navigator)) { setStatus('Este navegador no soporta Web Serial'); return; }
  try { await transport.close().catch(()=>{}); } catch {}
  transport = new SerialTransport(115200);
  controller = new Controller(view, data, transport, setStatus);
  try { await transport.connect(); } catch {}
});

$('btnSim').addEventListener('click', async () => {
  try { await transport.close().catch(()=>{}); } catch {}
  transport = new SimulationTransport();
  controller = new Controller(view, data, transport, setStatus);
  await transport.connect();
  setStatus('Simulador conectado. Pulsa Start.');
});

$('btnStart').addEventListener('click', async () => { try { await controller.startCapture(); } catch (e) { setStatus('No se pudo iniciar: ' + e); } });
$('btnTimes').addEventListener('click', () => { controller.toggleTimes(); $('btnTimes').textContent = controller.drawTimes ? 'Tiempos: ON' : 'Tiempos: OFF'; });
$('btnFormat').addEventListener('click', () => { controller.toggleFormat(); $('btnFormat').textContent = controller.timeFormat; $('reducerValue').textContent = fmt(controller.reducer) + '×'; view.requestDraw(); });
$('btnReducerInc').addEventListener('click', () => { controller.changeReducer(+1); $('btnFormat').textContent = controller.timeFormat; $('reducerValue').textContent = fmt(controller.reducer) + '×'; });
$('btnReducerDec').addEventListener('click', () => { controller.changeReducer(-1); $('btnFormat').textContent = controller.timeFormat; $('reducerValue').textContent = fmt(controller.reducer) + '×'; });
$('btnSave').addEventListener('click', () => {
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a'); a.href = url; a.download = `la_capture_${Date.now()}.png`; a.click(); a.remove();
});

window.addEventListener('keydown', (ev) => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(ev.code)) { controller.handleKey(ev.code); ev.preventDefault(); }
});

// Estado inicial UI
$('btnFormat').textContent = controller.timeFormat;
$('reducerValue').textContent = fmt(controller.reducer) + '×';
setStatus('Listo. Conecta tu MCU o usa el simulador y pulsa "Start".');