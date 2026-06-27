declare module 'lunar-javascript' {
  export class Solar {
    toYmd(): string;
  }

  export class Lunar {
    static fromDate(date: Date): Lunar;
    getJieQi(): string;
    getJieQiTable(): Record<string, Solar>;
  }
}
