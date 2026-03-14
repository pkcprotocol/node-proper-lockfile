import fs from 'graceful-fs';

export interface LockFileFs {
    mkdir: typeof fs.mkdir;
    realpath: typeof fs.realpath;
    stat: typeof fs.stat;
    rmdir: typeof fs.rmdir;
    utimes: typeof fs.utimes;
    mkdirSync?: typeof fs.mkdirSync;
    realpathSync?: typeof fs.realpathSync;
    statSync?: typeof fs.statSync;
    rmdirSync?: typeof fs.rmdirSync;
    utimesSync?: typeof fs.utimesSync;
    [key: string]: any;
}

export interface RetryOptions {
    retries?: number;
    factor?: number;
    minTimeout?: number;
    maxTimeout?: number;
    randomize?: boolean;
}

export interface LockOptions {
    stale?: number | false;
    update?: number | null | false;
    realpath?: boolean;
    retries?: number | RetryOptions;
    fs?: LockFileFs;
    onCompromised?: (err: Error) => void;
    lockfilePath: string;
}

export interface CheckOptions {
    stale?: number | false;
    realpath?: boolean;
    fs?: LockFileFs;
    lockfilePath: string;
}

export interface UnlockOptions {
    realpath?: boolean;
    fs?: LockFileFs;
    lockfilePath: string;
}

export interface LockEntry {
    lockfilePath: string;
    file: string;
    mtime: Date;
    mtimePrecision: string;
    options: ResolvedLockOptions;
    lastUpdate: number;
    released: boolean;
    updateTimeout: ReturnType<typeof setTimeout> | null;
    updateDelay: number | null;
}

export interface ResolvedLockOptions {
    stale: number;
    update: number;
    realpath: boolean;
    retries: RetryOptions;
    fs: LockFileFs;
    onCompromised: (err: Error) => void;
    lockfilePath: string;
}

export type ReleaseFunction = () => Promise<void>;
export type ReleaseFunctionSync = () => void;

export type LockCallback = (err: Error | null, mtime?: Date, mtimePrecision?: string) => void;
export type UnlockCallback = (err?: Error | null) => void;
export type CheckCallback = (err: Error | null, isLocked?: boolean) => void;
