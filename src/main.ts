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



view.canvas.addEventListener('click', (e) => {
  const r = view.canvas.getBoundingClientRect();
  controller.onClick(e.clientX - r.left, e.clientY - r.top);
});

view.canvas.addEventListener('wheel', (ev:WheelEvent) => {
  controller.onWheel(ev);
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

window.addEventListener('keydown', (e) => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
    controller.handleKey(e.code as any);
    e.preventDefault();
  }
});

window.addEventListener('resize', () => view.resize());
view.resize();

// Estado inicial UI
$('btnFormat').textContent = controller.timeFormat;
$('reducerValue').textContent = fmt(controller.reducer) + '×';
setStatus('Ready. Connect your MCU or use the sim and press "Start".');