import { LockFileFs } from './types';

const cacheSymbol = Symbol();

export function probe(
    file: string,
    fs: LockFileFs,
    callback: (err: Error | null, mtime?: Date, precision?: string) => void,
): void {
    const cache: Map<number, string> | undefined = (fs as any)[cacheSymbol];

    if (cache) {
        return fs.stat(file, (err: NodeJS.ErrnoException | null, stat?: any) => {
            /* istanbul ignore if */
            if (err) {
                return callback(err);
            }

            // The precision is a property of the volume, so only reuse it for the same device
            const cachedPrecision = cache.get(stat.dev);

            if (!cachedPrecision) {
                return measure(file, fs, callback);
            }

            callback(null, stat.mtime, cachedPrecision);
        });
    }

    measure(file, fs, callback);
}

function measure(
    file: string,
    fs: LockFileFs,
    callback: (err: Error | null, mtime?: Date, precision?: string) => void,
): void {
    // Set mtime by ceiling Date.now() to seconds + 5ms so that it's "not on the second"
    const mtime = new Date((Math.ceil(Date.now() / 1000) * 1000) + 5);

    fs.utimes(file, mtime, mtime, (err: NodeJS.ErrnoException | null) => {
        /* istanbul ignore if */
        if (err) {
            return callback(err);
        }

        fs.stat(file, (err: NodeJS.ErrnoException | null, stat?: any) => {
            /* istanbul ignore if */
            if (err) {
                return callback(err);
            }

            const precision = stat.mtime.getTime() % 1000 === 0 ? 's' : 'ms';

            // Cache the precision per device in a non-enumerable way
            let cache: Map<number, string> | undefined = (fs as any)[cacheSymbol];

            if (!cache) {
                cache = new Map();
                Object.defineProperty(fs, cacheSymbol, { value: cache });
            }

            cache.set(stat.dev, precision);

            callback(null, stat.mtime, precision);
        });
    });
}

export function getMtime(precision: string): Date {
    let now = Date.now();

    if (precision === 's') {
        now = Math.ceil(now / 1000) * 1000;
    }

    return new Date(now);
}
