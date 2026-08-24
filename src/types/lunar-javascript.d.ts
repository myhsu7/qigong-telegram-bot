declare module 'lunar-javascript' {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    getLunar(): Lunar;
    toYmd(): string;
  }

  export class Lunar {
    static fromDate(date: Date): Lunar;
    getFu(): string;
    getJieQi(): string;
    getJieQiTable(): Record<string, Solar>;
  }
}
