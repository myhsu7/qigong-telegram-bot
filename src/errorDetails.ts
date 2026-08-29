const serializeErrorValue = (error: unknown, seen: WeakSet<object>): unknown => {
    if (error instanceof AggregateError) {
        if (seen.has(error)) return '[Circular]';
        seen.add(error);
        return {
            name: error.name,
            message: error.message,
            errors: error.errors.map((nestedError) => serializeErrorValue(nestedError, seen))
        };
    }
    if (error instanceof Error) {
        if (seen.has(error)) return '[Circular]';
        seen.add(error);
        const details = error as Error & {
            cause?: unknown;
            error?: unknown;
            code?: unknown;
            address?: unknown;
            port?: unknown;
        };
        return {
            name: error.name,
            message: error.message,
            code: details.code,
            address: details.address,
            port: details.port,
            cause: details.cause === undefined ? undefined : serializeErrorValue(details.cause, seen),
            error: details.error === undefined ? undefined : serializeErrorValue(details.error, seen)
        };
    }
    return error;
};

export const serializeError = (error: unknown): unknown => serializeErrorValue(error, new WeakSet());
