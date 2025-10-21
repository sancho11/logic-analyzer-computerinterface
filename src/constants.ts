import {Config} from './types';
export const COLORS = { white: '#ffffff', black: '#000000', green: '#00FF00', red: '#FF0000', grey: '#969696', orange: '#EF7F1A' } as const;
export const CHANNEL_COUNT = 16;
export const ROW_H = 36;
export const SIGNAL_H = 30;
export const PIN_LABEL_W = 60;
export const SCROLLBAR_H = 15;
export const FONT = '12px ui-monospace, monospace';
export const GRID_DASH: [number, number] = [1, 50];
export const TIME_DASH: [number, number] = [5, 8];

export const DEFAULT_CONFIG: Config = {
	board: 'MEGA',
	pinAssignment: [10,11,12,13,14,15,16,17,20,21,22,23,24,25,26,27],
  };

export type Board = typeof DEFAULT_CONFIG['board'];

export const BOARD_PIN_MAP: Record<Board, (val: number)=>number> = {
  MEGA: (val: number) => ({10:22,11:23,12:24,13:25,14:26,15:27,16:28,17:29,20:49,21:48,22:47,23:46,24:45,25:44,26:43,27:42,30:37,31:36,32:35,33:34,34:33,35:32,36:31,37:30} as Record<number,number>)[val] ?? 0,
  UNO: (val: number) => ({10:8,11:9,12:10,13:11,14:12} as Record<number,number>)[val] ?? 0,
  STM32F1: (val: number) => ({10:100,11:1,12:2,13:3,14:4,15:5,16:6,17:7,20:8,21:9,22:10,23:11,24:12,25:13,26:14,27:15} as Record<number,number>)[val] ?? 0,
  ESP8266: (val: number) => ({10:1,11:2,12:5,13:6} as Record<number,number>)[val] ?? 0,
};

/*
    Operation of the pin assignment.
    The entries will be depleted in the order they appear in the whole PinAssignment that goes from 0 to 15 for a total of 16, the value of the integer in each position will 
    reference the pin to be used. Then the value that must be entered in the integer will be shown to observe the desired pin.

    In case you do not want to show anything on that channel, just assign 0 so that the channel will not be written.
    The pins that do not appear in the table can not be used to avoid overloading the arduino and obtain more satisfactory response times.

    
 	PinAssignment 			        UNO				            MEGA				       STM32F1	 	    ESP8266
 			10        -------> DigitalPIN 8  -------> DigitalPIN 22 -------> PB 0  -------> DigitalPIN1  
 			11        -------> DigitalPIN 9  -------> DigitalPIN 23	-------> PB 1  -------> DigitalPIN2  
 			12        -------> DigitalPIN 10 -------> DigitalPIN 24 -------> PB 2  -------> DigitalPIN5  
 			13        -------> DigitalPIN 11 -------> DigitalPIN 25 -------> PB 3  -------> DigitalPIN6  
 			14        -------> DigitalPIN 12 -------> DigitalPIN 26 -------> PB 4  -------> OFF   
 			15        -------> OFF           -------> DigitalPIN 27 -------> PB 5  -------> OFF   
 			16        -------> OFF           -------> DigitalPIN 28 -------> PB 6  -------> OFF   
 			17        -------> OFF           -------> DigitalPIN 29 -------> PB 7  -------> OFF   
 			20        -------> OFF           -------> DigitalPIN 49 -------> PB 8  -------> OFF   
 			21        -------> OFF           -------> DigitalPIN 48 -------> PB 9  -------> OFF   
 			22        -------> OFF           -------> DigitalPIN 47 -------> PB 10 -------> OFF   
 			23        -------> OFF           -------> DigitalPIN 46 -------> PB 11 -------> OFF   
 			24        -------> OFF           -------> DigitalPIN 45 -------> PB 12 -------> OFF   
 			25        -------> OFF           -------> DigitalPIN 44 -------> PB 13 -------> OFF   
 			26        -------> OFF           -------> DigitalPIN 43 -------> PB 14 -------> OFF   
 			27        -------> OFF           -------> DigitalPIN 42 -------> PB 15 -------> OFF  
 			30        -------> OFF           -------> DigitalPIN 37 -------> OFF   -------> OFF  
 			31        -------> OFF           -------> DigitalPIN 36 -------> OFF   -------> OFF  
 			32        -------> OFF           -------> DigitalPIN 35 -------> OFF   -------> OFF  
 			33        -------> OFF           -------> DigitalPIN 34 -------> OFF   -------> OFF  
 			34        -------> OFF           -------> DigitalPIN 33 -------> OFF   -------> OFF  
 			35        -------> OFF           -------> DigitalPIN 32 -------> OFF   -------> OFF  
 			36        -------> OFF           -------> DigitalPIN 31 -------> OFF   -------> OFF  
 			37        -------> OFF           -------> DigitalPIN 30 -------> OFF   -------> OFF  
 		  Any other   -------> OFF           -------> OFF           -------> OFF   -------> OFF
*/