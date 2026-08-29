import {
    getDefaultAutoSelectFamilyAttemptTimeout,
    setDefaultAutoSelectFamilyAttemptTimeout
} from 'node:net';

const MIN_AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS = 2000;

export const configureNodeNetwork = () => {
    const previousTimeoutMs = getDefaultAutoSelectFamilyAttemptTimeout();
    const timeoutMs = Math.max(previousTimeoutMs, MIN_AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS);
    if (timeoutMs !== previousTimeoutMs) {
        setDefaultAutoSelectFamilyAttemptTimeout(timeoutMs);
    }
    return { previousTimeoutMs, timeoutMs };
};
