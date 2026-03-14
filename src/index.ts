import * as lockfileModule from './lockfile';
import { toPromise, toSync, toSyncOptions } from './adapter';
import { LockOptions, UnlockOptions, CheckOptions, ReleaseFunction, ReleaseFunctionSync } from './types';

async function lock(file: string, options: Partial<LockOptions> & { lockfilePath: string }): Promise<ReleaseFunction> {
    const release = await toPromise(lockfileModule.lock)(file, options);

    return toPromise(release) as unknown as ReleaseFunction;
}

function lockSync(file: string, options: Partial<LockOptions> & { lockfilePath: string }): ReleaseFunctionSync {
    const release = toSync(lockfileModule.lock)(file, toSyncOptions(options));

    return toSync(release);
}

function unlock(file: string, options: Partial<UnlockOptions> & { lockfilePath: string }): Promise<void> {
    return toPromise(lockfileModule.unlock)(file, options);
}

function unlockSync(file: string, options: Partial<UnlockOptions> & { lockfilePath: string }): void {
    return toSync(lockfileModule.unlock)(file, toSyncOptions(options));
}

function check(file: string, options: Partial<CheckOptions> & { lockfilePath: string }): Promise<boolean> {
    return toPromise(lockfileModule.check)(file, options);
}

function checkSync(file: string, options: Partial<CheckOptions> & { lockfilePath: string }): boolean {
    return toSync(lockfileModule.check)(file, toSyncOptions(options));
}

export = Object.assign(lock, {
    lock,
    unlock,
    lockSync,
    unlockSync,
    check,
    checkSync,
});
