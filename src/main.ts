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
  if (!('serial' in navigator)) { setStatus('This browser does not support Web Serial'); return; }
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
  setStatus('Simulator Connected. Press Start.');
});

$('btnStart').addEventListener('click', async () => { try { await controller.startCapture(); } catch (e) { setStatus('Couldnt start: ' + e); } });
$('btnTimes').addEventListener('click', () => { controller.toggleTimes(); $('btnTimes').textContent = controller.drawTimes ? 'Time: ON' : 'Time: OFF'; });
$('btnFormat').addEventListener('click', () => { controller.toggleFormat(); $('btnFormat').textContent = controller.timeFormat; $('reducerValue').textContent = fmt(controller.reducer) + '×'; view.requestDraw(); });
$('btnReducerDec').addEventListener('click', () => { controller.changeReducer(true); $('btnFormat').textContent = controller.timeFormat; $('reducerValue').textContent = fmt(1/controller.reducer) + '×'; });
$('btnReducerInc').addEventListener('click', () => { controller.changeReducer(false); $('btnFormat').textContent = controller.timeFormat; $('reducerValue').textContent = fmt(1/controller.reducer) + '×'; });


$('btnSave').addEventListener('click', () => {
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a'); a.href = url; a.download = `la_capture_${Date.now()}.png`; a.click(); a.remove();
});
$('btnReset').addEventListener('click', () => { controller.resetData(); });

window.addEventListener('resize', () => view.resize());


view.canvas.addEventListener('click', (e: MouseEvent) => {
  const { x, y } = view.pos(e);
  controller.onClick(x, y);
});

view.canvas.addEventListener('wheel', (ev:WheelEvent) => {controller.onWheel(ev);}, { passive: false });

//ScrollBar Control Logic Using Cursor
view.canvas.addEventListener('mousemove', (ev: MouseEvent)    => {controller.onmouseMove(ev);}, { passive: false });
view.canvas.addEventListener('mousedown', (ev: MouseEvent)    => {controller.onmouseDown(ev);}, { passive: false });
view.canvas.addEventListener('mouseup',   (ev: MouseEvent)    => {controller.onmouseUp(ev);},   { passive: false });

//Keyboard Interactions: Needs to be attached to window and not the canvas, since directionals do not interact with the canvas.
window.addEventListener('keydown',   (ev: KeyboardEvent) => {controller.onkeyDown(ev);},   { passive: false });



// Estado inicial UI
$('btnFormat').textContent = controller.timeFormat;
$('reducerValue').textContent = fmt(controller.reducer) + '×';
setStatus('Ready. Connect your MCU or use the sim and press "Start".');
view.setScroll(0);//Set initial scrollbar position