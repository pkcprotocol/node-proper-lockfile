import path from 'path';
import fs from 'graceful-fs';
import retry from 'retry';
import { onExit } from 'signal-exit';
import assert from 'assert';
import * as mtimePrecision from './mtime-precision';
import {
    LockFileFs,
    LockEntry,
    ResolvedLockOptions,
    LockOptions,
    UnlockOptions,
    CheckOptions,
    RetryOptions,
} from './types';

const locks: Record<string, LockEntry> = {};

function getLockFile(file: string, options: { lockfilePath: string }): string {
    assert(typeof options.lockfilePath === 'string');
    return options.lockfilePath;
}

function resolveCanonicalPath(
    file: string,
    options: { realpath: boolean; fs: LockFileFs },
    callback: (err: Error | null, resolvedPath?: string) => void,
): void {
    if (!options.realpath) {
        return callback(null, path.resolve(file));
    }

    // Use realpath to resolve symlinks
    // It also resolves relative paths
    options.fs.realpath(file, (err: any, resolvedPath: any) => {
        callback(err, resolvedPath);
    });
}

function acquireLock(
    file: string,
    options: ResolvedLockOptions,
    callback: (err: Error | null, mtime?: Date, mtimePrecision?: string) => void,
): void {
    const lockfilePath = getLockFile(file, options);

    // Use mkdir to create the lockfile (atomic operation)
    options.fs.mkdir(lockfilePath, (err: any) => {
        if (!err) {
            // At this point, we acquired the lock!
            // Probe the mtime precision
            return mtimePrecision.probe(
                lockfilePath,
                options.fs,
                (err, mtime, precision) => {
                    // If it failed, try to remove the lock..
                    /* istanbul ignore if */
                    if (err) {
                        options.fs.rmdir(lockfilePath, () => {});
                        return callback(err);
                    }

                    callback(null, mtime, precision);
                },
            );
        }

        // If error is not EEXIST then some other error occurred while locking
        if (err.code !== 'EEXIST') {
            return callback(err);
        }

        // Otherwise, check if lock is stale by analyzing the file mtime
        if (options.stale <= 0) {
            return callback(
                Object.assign(new Error('Lock file is already being held'), {
                    code: 'ELOCKED',
                    file,
                }),
            );
        }

        options.fs.stat(lockfilePath, (err: any, stat: any) => {
            if (err) {
                // Retry if the lockfile has been removed (meanwhile)
                // Skip stale check to avoid recursiveness
                if (err.code === 'ENOENT') {
                    return acquireLock(
                        file,
                        { ...options, stale: 0 },
                        callback,
                    );
                }

                return callback(err);
            }

            if (!isLockStale(stat, options)) {
                return callback(
                    Object.assign(
                        new Error('Lock file is already being held'),
                        { code: 'ELOCKED', file },
                    ),
                );
            }

            // If it's stale, remove it and try again!
            // Skip stale check to avoid recursiveness
            removeLock(file, options, (err) => {
                if (err) {
                    return callback(err);
                }

                acquireLock(file, { ...options, stale: 0 }, callback);
            });
        });
    });
}

function isLockStale(stat: { mtime: Date }, options: { stale: number }): boolean {
    return stat.mtime.getTime() < Date.now() - options.stale;
}

function removeLock(
    file: string,
    options: { fs: LockFileFs; lockfilePath: string },
    callback: (err?: Error | null) => void,
): void {
    // Remove lockfile, ignoring ENOENT errors
    options.fs.rmdir(getLockFile(file, options), (err: any) => {
        if (err && err.code !== 'ENOENT') {
            return callback(err);
        }

        callback();
    });
}

function updateLock(file: string, options: ResolvedLockOptions): void {
    if (typeof options.lockfilePath !== 'string') {
        throw Error('Options is not defined ');
    }
    const lockKey = file + options.lockfilePath;
    const lock = locks[lockKey];

    // Just for safety, should never happen
    /* istanbul ignore if */
    if (lock.updateTimeout) {
        return;
    }

    lock.updateDelay = lock.updateDelay || options.update;
    lock.updateTimeout = setTimeout(() => {
        lock.updateTimeout = null;

        // Stat the file to check if mtime is still ours
        // If it is, we can still recover from a system sleep or a busy event loop
        options.fs.stat(lock.lockfilePath, (err: any, stat: any) => {
            const isOverThreshold =
                lock.lastUpdate + options.stale < Date.now();

            // If it failed to update the lockfile, keep trying unless
            // the lockfile was deleted or we are over the threshold
            if (err) {
                if (err.code === 'ENOENT' || isOverThreshold) {
                    return setLockAsCompromised(
                        file,
                        lock,
                        Object.assign(err, { code: 'ECOMPROMISED' }),
                    );
                }

                lock.updateDelay = 1000;

                return updateLock(file, options);
            }

            const isMtimeOurs = lock.mtime.getTime() === stat.mtime.getTime();

            if (!isMtimeOurs) {
                return setLockAsCompromised(
                    file,
                    lock,
                    Object.assign(
                        new Error(
                            'Unable to update lock within the stale threshold',
                        ),
                        { code: 'ECOMPROMISED' },
                    ),
                );
            }

            const mtime = mtimePrecision.getMtime(lock.mtimePrecision);

            options.fs.utimes(lock.lockfilePath, mtime, mtime, (err: any) => {
                const isOverThreshold =
                    lock.lastUpdate + options.stale < Date.now();

                // Ignore if the lock was released
                if (lock.released) {
                    return;
                }

                // If it failed to update the lockfile, keep trying unless
                // the lockfile was deleted or we are over the threshold
                if (err) {
                    if (err.code === 'ENOENT' || isOverThreshold) {
                        return setLockAsCompromised(
                            file,
                            lock,
                            Object.assign(err, { code: 'ECOMPROMISED' }),
                        );
                    }

                    lock.updateDelay = 1000;

                    return updateLock(file, options);
                }

                // All ok, keep updating..
                lock.mtime = mtime;
                lock.lastUpdate = Date.now();
                lock.updateDelay = null;
                updateLock(file, options);
            });
        });
    }, lock.updateDelay!);

    // Unref the timer so that the nodejs process can exit freely
    // This is safe because all acquired locks will be automatically released
    // on process exit

    // We first check that `lock.updateTimeout.unref` exists because some users
    // may be using this module outside of NodeJS (e.g., in an electron app),
    // and in those cases `setTimeout` return an integer.
    /* istanbul ignore else */
    if (lock.updateTimeout && lock.updateTimeout.unref) {
        lock.updateTimeout.unref();
    }
}

function setLockAsCompromised(file: string, lock: LockEntry, err: Error): void {
    // Signal the lock has been released
    lock.released = true;

    // Cancel lock mtime update
    // Just for safety, at this point updateTimeout should be null
    /* istanbul ignore if */
    if (lock.updateTimeout) {
        clearTimeout(lock.updateTimeout);
    }

    const lockKey = file + lock.lockfilePath;

    if (locks[lockKey] === lock) {
        delete locks[lockKey];
    }

    lock.options.onCompromised(err);
}

// ----------------------------------------------------------

export function lock(
    file: string,
    options: Partial<LockOptions>,
    callback: (err: Error | null, release?: (releasedCallback?: (err?: Error | null) => void) => void) => void,
): void {
    /* istanbul ignore next */
    const merged = {
        stale: 10000 as any,
        update: null as any,
        realpath: true,
        retries: { retries: 0 } as any,
        fs: fs as unknown as LockFileFs,
        onCompromised: (err: Error) => {
            throw err;
        },
        lockfilePath: '',
        ...options,
    };

    let retries = merged.retries || { retries: 0 };
    retries = typeof retries === 'number' ? { retries } : retries;

    const stale = Math.max(merged.stale || 0, 2000);
    let update: number = merged.update == null ? stale / 2 : (merged.update || 0);
    update = Math.max(Math.min(update, stale / 2), 1000);

    const opts: ResolvedLockOptions = {
        stale,
        update,
        realpath: merged.realpath,
        retries,
        fs: merged.fs,
        onCompromised: merged.onCompromised,
        lockfilePath: merged.lockfilePath,
    };

    // Resolve to a canonical file path
    resolveCanonicalPath(file, opts, (err, resolvedFile) => {
        if (err) {
            return callback(err);
        }

        file = resolvedFile!;

        // Attempt to acquire the lock
        const operation = retry.operation(opts.retries as RetryOptions);

        operation.attempt(() => {
            acquireLock(file, opts, (err, mtime, precision) => {
                if (operation.retry(err!)) {
                    return;
                }

                if (err) {
                    return callback(operation.mainError());
                }

                const lockKey = file + opts.lockfilePath;
                // We now own the lock
                const lockEntry: LockEntry = (locks[lockKey] = {
                    lockfilePath: getLockFile(file, opts),
                    file,
                    mtime: mtime!,
                    mtimePrecision: precision!,
                    options: opts,
                    lastUpdate: Date.now(),
                    released: false,
                    updateTimeout: null,
                    updateDelay: null,
                });

                // We must keep the lock fresh to avoid staleness
                updateLock(file, opts);

                callback(null, (releasedCallback?: (err?: Error | null) => void) => {
                    if (lockEntry.released) {
                        return (
                            releasedCallback &&
                            releasedCallback(
                                Object.assign(
                                    new Error('Lock is already released'),
                                    { code: 'ERELEASED' },
                                ),
                            )
                        );
                    }

                    // Not necessary to use realpath twice when unlocking
                    unlock(
                        file,
                        { ...opts, realpath: false },
                        releasedCallback,
                    );
                });
            });
        });
    });
}

export function unlock(
    file: string,
    options: Partial<UnlockOptions>,
    callback?: (err?: Error | null) => void,
): void {
    const opts = {
        fs: fs as unknown as LockFileFs,
        realpath: true,
        lockfilePath: '',
        ...options,
    };

    // Resolve to a canonical file path
    resolveCanonicalPath(file, opts, (err, resolvedFile) => {
        if (err) {
            return callback!(err);
        }

        file = resolvedFile!;

        const lockKey = file + opts.lockfilePath;
        // Skip if the lock is not acquired
        const lockEntry = locks[lockKey];

        if (!lockEntry) {
            return callback!(
                Object.assign(new Error('Lock is not acquired/owned by you'), {
                    code: 'ENOTACQUIRED',
                }),
            );
        }

        lockEntry.updateTimeout && clearTimeout(lockEntry.updateTimeout); // Cancel lock mtime update
        lockEntry.released = true; // Signal the lock has been released
        delete locks[lockKey]; // Delete from locks

        removeLock(file, opts, callback!);
    });
}

export function check(
    file: string,
    options: Partial<CheckOptions>,
    callback: (err: Error | null, isLocked?: boolean) => void,
): void {
    const merged = {
        stale: 10000 as any,
        realpath: true,
        fs: fs as unknown as LockFileFs,
        lockfilePath: '',
        ...options,
    };

    const opts = {
        ...merged,
        stale: Math.max(merged.stale || 0, 2000) as number,
    };

    // Resolve to a canonical file path
    resolveCanonicalPath(file, opts, (err, resolvedFile) => {
        if (err) {
            return callback(err);
        }

        file = resolvedFile!;

        // Check if lockfile exists
        opts.fs.stat(getLockFile(file, opts), (err: any, stat: any) => {
            if (err) {
                // If does not exist, file is not locked. Otherwise, callback with error
                return err.code === 'ENOENT'
                    ? callback(null, false)
                    : callback(err);
            }

            // Otherwise, check if lock is stale by analyzing the file mtime
            return callback(null, !isLockStale(stat, opts));
        });
    });
}

export function getLocks(): Record<string, LockEntry> {
    return locks;
}

// Remove acquired locks on exit
/* istanbul ignore next */
onExit(() => {
    for (const entry of Object.values(locks)) {
        try {
            entry.options.fs.rmdirSync!(entry.lockfilePath);
        } catch (e) {
            /* Empty */
        }
    }
});
