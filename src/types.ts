export type TimeFormat = 'ms' | 'μs';

export interface Config {
  board: 'MEGA' | 'UNO' | 'STM32F1' | 'ESP8266';
  pinAssignment: number[];
}

export interface Transport {
  onLine: (line: string) => void;
  onStatus: (text: string) => void;
  connect(): Promise<void>;
  write(text: string): Promise<void>;
  close(): Promise<void>;
}

export interface Cursor {
  sample: number;
  channel: number; // 0..15, 16=ALL
  enabled: boolean;
}