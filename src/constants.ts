export const COLORS = { white: '#ffffff', black: '#000000', green: '#00FF00', red: '#FF0000', grey: '#969696', orange: '#EF7F1A' } as const;
export const CHANNEL_COUNT = 16;
export const ROW_H = 36;
export const SIGNAL_H = 30;
export const PIN_LABEL_W = 60;
export const SCROLLBAR_H = 15;
export const FONT = '12px ui-monospace, monospace';
export const GRID_DASH: [number, number] = [1, 50];
export const TIME_DASH: [number, number] = [5, 8];

export const DEFAULT_CONFIG = {
  board: 'MEGA',
  pinAssignment: [10,11,12,13,14,15,16,17,20,21,22,23,24,25,26,27]
} as const;

export type Board = typeof DEFAULT_CONFIG['board'];

export const BOARD_PIN_MAP: Record<Board, (val: number)=>number> = {
  MEGA: (val: number) => ({10:22,11:23,12:24,13:25,14:26,15:27,16:28,17:29,20:49,21:48,22:47,23:46,24:45,25:44,26:43,27:42,30:37,31:36,32:35,33:34,34:33,35:32,36:31,37:30} as Record<number,number>)[val] ?? 0,
  UNO: (val: number) => ({10:8,11:9,12:10,13:11,14:12} as Record<number,number>)[val] ?? 0,
  STM32F1: (val: number) => ({10:100,11:1,12:2,13:3,14:4,15:5,16:6,17:7,20:8,21:9,22:10,23:11,24:12,25:13,26:14,27:15} as Record<number,number>)[val] ?? 0,
  ESP8266: (val: number) => ({10:1,11:2,12:5,13:6} as Record<number,number>)[val] ?? 0,
};