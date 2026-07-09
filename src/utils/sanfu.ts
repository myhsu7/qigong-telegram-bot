import { Lunar } from 'lunar-javascript';
import moment from 'moment-timezone';

const TIMEZONE = 'Asia/Taipei';

export interface SanFuPeriod {
    start: moment.Moment;
    end: moment.Moment;
    totalDays: number;
}

export const getSanFuPeriod = (year: number): SanFuPeriod | null => {
    const scanStart = moment.tz({ year, month: 5, day: 20 }, TIMEZONE).startOf('day');
    const scanEnd = moment.tz({ year, month: 8, day: 31 }, TIMEZONE).startOf('day');

    let current = scanStart.clone();
    let start: moment.Moment | null = null;
    let end: moment.Moment | null = null;

    while (current.isSameOrBefore(scanEnd, 'day')) {
        const fu = (Lunar.fromDate(current.toDate()) as unknown as { getFu: () => unknown }).getFu();
        if (fu) {
            if (!start) start = current.clone();
            end = current.clone();
        } else if (start && end) {
            break;
        }

        current.add(1, 'day');
    }

    if (!start || !end) return null;

    return {
        start,
        end,
        totalDays: end.diff(start, 'days') + 1
    };
};
