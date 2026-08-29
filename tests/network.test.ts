import assert from 'node:assert/strict';
import {
    getDefaultAutoSelectFamilyAttemptTimeout,
    setDefaultAutoSelectFamilyAttemptTimeout
} from 'node:net';
import { configureNodeNetwork } from '../src/network';

const originalTimeoutMs = getDefaultAutoSelectFamilyAttemptTimeout();

try {
    setDefaultAutoSelectFamilyAttemptTimeout(250);
    assert.deepEqual(configureNodeNetwork(), { previousTimeoutMs: 250, timeoutMs: 2000 });
    assert.equal(getDefaultAutoSelectFamilyAttemptTimeout(), 2000);

    setDefaultAutoSelectFamilyAttemptTimeout(3000);
    assert.deepEqual(configureNodeNetwork(), { previousTimeoutMs: 3000, timeoutMs: 3000 });
    assert.equal(getDefaultAutoSelectFamilyAttemptTimeout(), 3000);
} finally {
    setDefaultAutoSelectFamilyAttemptTimeout(originalTimeoutMs);
}

console.log('Network configuration tests passed');
