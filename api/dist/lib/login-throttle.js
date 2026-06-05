/**
 * Login brute-force protection — per-account + per-IP failed-login tracking
 * with progressive lockout.
 *
 * v1 implementation is an in-process Map. This is sufficient for a single API
 * instance (the current deploy target). It does NOT survive a process restart
 * and is NOT shared across multiple instances.
 *
 * TODO (multi-instance / horizontal scale): back this with Redis (or the DB)
 * so lockout state is shared and durable. The public API (recordFailure /
 * recordSuccess / checkLock) is intentionally small so it can be swapped for a
 * Redis-backed implementation without touching the auth route.
 */
const MINUTE_MS = 60 * 1000;
/** Failures (per key) needed to trigger the next lockout. */
const ACCOUNT_MAX_FAILURES = 5;
/** IP threshold is more lenient — many users can share one NAT/proxy IP. */
const IP_MAX_FAILURES = 20;
/** Consecutive-failure counter resets if no new failure occurs within this window. */
const FAILURE_WINDOW_MS = 15 * MINUTE_MS;
/** Stale buckets are swept this long after their last activity. */
const SWEEP_AFTER_MS = 60 * MINUTE_MS;
/** Progressive lock durations (minutes) by lock tier; capped at the last entry. */
const LOCK_DURATIONS_MIN = [5, 15, 30, 60];
const accountBuckets = new Map();
const ipBuckets = new Map();
let lastSweepAt = 0;
function newBucket() {
    return { failures: 0, lockTier: 0, lockedUntil: 0, lastFailureAt: 0, lastSeenAt: 0 };
}
function lockDurationMs(tier) {
    const idx = Math.min(tier - 1, LOCK_DURATIONS_MIN.length - 1);
    return LOCK_DURATIONS_MIN[Math.max(0, idx)] * MINUTE_MS;
}
function sweep(now) {
    if (now - lastSweepAt < MINUTE_MS)
        return;
    lastSweepAt = now;
    for (const map of [accountBuckets, ipBuckets]) {
        for (const [key, b] of map) {
            if (b.lockedUntil <= now && now - b.lastSeenAt > SWEEP_AFTER_MS) {
                map.delete(key);
            }
        }
    }
}
function normAccount(email) {
    return String(email ?? "").trim().toLowerCase();
}
function evaluate(map, key, now) {
    if (!key)
        return { locked: false, retryAfterSeconds: 0 };
    const b = map.get(key);
    if (!b)
        return { locked: false, retryAfterSeconds: 0 };
    if (b.lockedUntil > now) {
        return { locked: true, retryAfterSeconds: Math.ceil((b.lockedUntil - now) / 1000) };
    }
    return { locked: false, retryAfterSeconds: 0 };
}
/**
 * Returns whether the account or IP is currently locked. Call BEFORE verifying
 * the password so a locked caller never hits the credential check.
 */
export function checkLock(email, ip) {
    const now = Date.now();
    sweep(now);
    const acc = evaluate(accountBuckets, normAccount(email), now);
    const ipKey = String(ip ?? "");
    const ipStatus = evaluate(ipBuckets, ipKey, now);
    const retryAfterSeconds = Math.max(acc.retryAfterSeconds, ipStatus.retryAfterSeconds);
    return { locked: acc.locked || ipStatus.locked, retryAfterSeconds };
}
function bump(map, key, maxFailures, now) {
    if (!key)
        return;
    let b = map.get(key);
    if (!b) {
        b = newBucket();
        map.set(key, b);
    }
    // Reset the consecutive-failure counter if the window elapsed since the last fail.
    if (b.lastFailureAt && now - b.lastFailureAt > FAILURE_WINDOW_MS) {
        b.failures = 0;
    }
    b.failures += 1;
    b.lastFailureAt = now;
    b.lastSeenAt = now;
    if (b.failures >= maxFailures) {
        b.lockTier += 1;
        b.lockedUntil = now + lockDurationMs(b.lockTier);
        b.failures = 0; // start a fresh count after the lock window
    }
}
/** Record a failed login for both the account and the source IP. */
export function recordFailure(email, ip) {
    const now = Date.now();
    bump(accountBuckets, normAccount(email), ACCOUNT_MAX_FAILURES, now);
    bump(ipBuckets, String(ip ?? ""), IP_MAX_FAILURES, now);
}
/** Clear failure/lock state after a successful login. */
export function recordSuccess(email, ip) {
    accountBuckets.delete(normAccount(email));
    const ipKey = String(ip ?? "");
    if (ipKey)
        ipBuckets.delete(ipKey);
}
export const _config = {
    ACCOUNT_MAX_FAILURES,
    IP_MAX_FAILURES,
    FAILURE_WINDOW_MS,
    LOCK_DURATIONS_MIN,
};
