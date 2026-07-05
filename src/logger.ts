import fs from 'fs';
import path from 'path';
import moment from 'moment-timezone';

const TIMEZONE = 'Asia/Taipei';

const getErrorLogPath = () => {
    const dateStr = moment().tz(TIMEZONE).format('YYYY-MM-DD');
    return path.join(process.cwd(), 'logs', `error-${dateStr}.log`);
};

const ensureLogDir = () => {
    fs.mkdirSync(path.join(process.cwd(), 'logs'), { recursive: true });
};

const formatErrorLine = (serviceName: string, args: unknown[]) => {
    const timestamp = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ssZ');
    const message = args.map((arg) => {
        if (arg instanceof Error) {
            return arg.stack || `${arg.name}: ${arg.message}`;
        }
        if (typeof arg === 'string') return arg;
        try {
            return JSON.stringify(arg);
        } catch {
            return String(arg);
        }
    }).join(' ');

    return `[${timestamp}] [${serviceName}] ${message}\n`;
};

export const setupErrorLogging = (serviceName: string) => {
    ensureLogDir();

    const originalError = console.error.bind(console);

    console.error = (...args: unknown[]) => {
        originalError(...args);
        try {
            fs.appendFileSync(getErrorLogPath(), formatErrorLine(serviceName, args), 'utf8');
        } catch (writeError) {
            originalError('[logger] failed to write error log', writeError);
        }
    };

    process.on('uncaughtException', (error) => {
        console.error('[uncaughtException]', error);
    });

    process.on('unhandledRejection', (reason) => {
        console.error('[unhandledRejection]', reason);
    });
};
