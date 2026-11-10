import fs from 'graceful-fs';
import { LockFileFs } from './types';

function createSyncFs(inputFs: LockFileFs): LockFileFs {
    const methods = ['mkdir', 'realpath', 'stat', 'rmdir', 'utimes'] as const;
    const newFs: any = { ...inputFs };

    methods.forEach((method) => {
        newFs[method] = (...args: any[]) => {
            const callback = args.pop();
            let ret: any;

            try {
                ret = (inputFs as any)[`${method}Sync`](...args);
            } catch (err) {
                return callback(err);
            }

            callback(null, ret);
        };
    });

    return newFs as LockFileFs;
}

// ----------------------------------------------------------

export function toPromise<T extends (...args: any[]) => any>(method: T) {
    return (...args: any[]): Promise<any> => new Promise((resolve, reject) => {
        args.push((err: Error | null, result: any) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });

        method(...args);
    });
}

export function toSync<T extends (...args: any[]) => any>(method: T) {
    return (...args: any[]): any => {
        let called = false;
        let err: Error | undefined;
        let result: any;

        args.push((_err: Error | null, _result: any) => {
            called = true;
            err = _err ?? undefined;
            result = _result;
        });

        method(...args);

        // Returning here would hand out an undefined result for an operation still in progress
        if (!called) {
            throw Object.assign(new Error('Operation did not complete synchronously'), { code: 'ESYNC' });
        }

        if (err) {
            throw err;
        }

        return result;
    };
}

export function toSyncOptions<T extends { fs?: LockFileFs; retries?: any }>(options?: T): T {
    // Shallow clone options because we are going to mutate them
    const opts = { ...options } as T;

    // Transform fs to use the sync methods instead
    (opts as any).fs = createSyncFs((opts.fs || fs) as unknown as LockFileFs);

    // Retries are not allowed because it requires the flow to be sync
    if (
        (typeof opts.retries === 'number' && opts.retries > 0) ||
        (opts.retries && typeof opts.retries.retries === 'number' && opts.retries.retries > 0)
    ) {
        throw Object.assign(new Error('Cannot use retries with the sync api'), { code: 'ESYNC' });
    }

    // A retry options object without a positive `retries` count still gets the retry module's
    // default of 10 retries, which would run on timers after the sync call has returned
    (opts as any).retries = 0;

    return opts;
}
