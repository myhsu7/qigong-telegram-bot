import assert from 'node:assert/strict';
import { serializeError } from '../src/errorDetails';

const ipv4Error = Object.assign(new Error('connect ETIMEDOUT 149.154.166.110:443'), {
    code: 'ETIMEDOUT',
    address: '149.154.166.110',
    port: 443
});
const ipv6Error = Object.assign(new Error('connect ENETUNREACH 2001:67c:4e8:f004::9:443'), {
    code: 'ENETUNREACH',
    address: '2001:67c:4e8:f004::9',
    port: 443
});
const fetchError = Object.assign(new TypeError('fetch failed'), {
    cause: new AggregateError([ipv4Error, ipv6Error])
});
const httpError = Object.assign(new Error("Network request for 'sendMessage' failed!"), {
    name: 'HttpError',
    error: fetchError
});

const details = serializeError(httpError) as {
    error: { cause: { errors: Array<{ code: string; address: string; port: number }> } };
};
assert.deepEqual(details.error.cause.errors.map(({ code, address, port }) => ({ code, address, port })), [
    { code: 'ETIMEDOUT', address: '149.154.166.110', port: 443 },
    { code: 'ENETUNREACH', address: '2001:67c:4e8:f004::9', port: 443 }
]);

const circularError = new Error('circular') as Error & { cause?: unknown };
circularError.cause = circularError;
assert.equal((serializeError(circularError) as { cause: string }).cause, '[Circular]');

console.log('Error serialization tests passed');
