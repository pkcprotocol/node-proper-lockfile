import fs from 'graceful-fs';
import execa from 'execa';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const clearTimeouts = require('@segment/clear-timeouts');
import lockfile from '../src/index';
import unlockAll from './util/unlockAll';
import { delay, pDefer, sleepSync } from './util/helpers';

const tmpDir = `${__dirname}/tmp`;

clearTimeouts.install();

beforeAll(() => fs.mkdirSync(tmpDir, { recursive: true }));

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

afterEach(async () => {
    jest.restoreAllMocks();
    clearTimeouts();

    await unlockAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
});

it('should be the default export', () => {
    expect(lockfile).toBe(lockfile.lock);
});

it('should fail if the file does not exist by default', async () => {
    expect.assertions(1);

    try {
        await lockfile.lock(`${tmpDir}/some-file-that-will-never-exist`, { lockfilePath: `${tmpDir}/some-file-that-will-never-exist.lock` });
    } catch (err: any) {
        expect(err.code).toBe('ENOENT');
    }
});

it('should not fail if the file does not exist and realpath is false', async () => {
    await lockfile.lock(`${tmpDir}/some-file-that-will-never-exist`, { realpath: false, lockfilePath: `${tmpDir}/some-file-that-will-never-exist.lock` });
});

it('should fail if impossible to create the lockfile because directory does not exist', async () => {
    expect.assertions(1);

    try {
        await lockfile.lock(`${tmpDir}/some-dir-that-will-never-exist/foo`, { realpath: false, lockfilePath: `${tmpDir}/some-dir-that-will-never-exist/foo.lock` });
    } catch (err: any) {
        expect(err.code).toBe('ENOENT');
    }
});

it('should return a promise for a release function', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const promise = lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    expect(typeof promise.then).toBe('function');

    const release = await promise;

    expect(typeof release).toBe('function');
});

it('should create the lockfile', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(true);
});

it('should create the lockfile inside a folder', async () => {
    fs.mkdirSync(`${tmpDir}/foo-dir`);

    await lockfile.lock(`${tmpDir}/foo-dir`, { lockfilePath: `${tmpDir}/foo-dir/dir.lock` });

    expect(fs.existsSync(`${tmpDir}/foo-dir/dir.lock`)).toBe(true);
});

it('should fail if already locked', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    expect.assertions(1);

    await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    try {
        await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });
    } catch (err: any) {
        expect(err.code).toBe('ELOCKED');
    }
});

it('should fail if mkdir fails for an unknown reason', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const customFs = {
        ...fs,
        mkdir: (path: any, callback: any) => callback(new Error('foo')),
    };

    expect.assertions(1);

    try {
        await lockfile.lock(`${tmpDir}/foo`, { fs: customFs as any, lockfilePath: `${tmpDir}/foo.lock` });
    } catch (err: any) {
        expect(err.message).toBe('foo');
    }
});

it('should retry several times if retries were specified', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const release = await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    setTimeout(release, 4000);

    await lockfile.lock(`${tmpDir}/foo`, { retries: { retries: 5, maxTimeout: 1000 }, lockfilePath: `${tmpDir}/foo.lock` });
});

it('should use a custom fs', async () => {
    const customFs = {
        ...fs,
        realpath: (path: any, callback: any) => callback(new Error('foo')),
    };

    expect.assertions(1);

    try {
        await lockfile.lock(`${tmpDir}/foo`, { fs: customFs as any, lockfilePath: `${tmpDir}/foo.lock` });
    } catch (err: any) {
        expect(err.message).toBe('foo');
    }
});

it('should resolve symlinks by default', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.symlinkSync(`${tmpDir}/foo`, `${tmpDir}/bar`);

    expect.assertions(2);

    await lockfile.lock(`${tmpDir}/bar`, { lockfilePath: `${tmpDir}/bar.lock` });

    try {
        await lockfile.lock(`${tmpDir}/bar`, { lockfilePath: `${tmpDir}/bar.lock` });
    } catch (err: any) {
        expect(err.code).toBe('ELOCKED');
    }

    try {
        await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/bar.lock` });
    } catch (err: any) {
        expect(err.code).toBe('ELOCKED');
    }
});

it('should not resolve symlinks if realpath is false', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.symlinkSync(`${tmpDir}/foo`, `${tmpDir}/bar`);

    await lockfile.lock(`${tmpDir}/bar`, { realpath: false, lockfilePath: `${tmpDir}/bar.lock` });
    await lockfile.lock(`${tmpDir}/foo`, { realpath: false, lockfilePath: `${tmpDir}/foo.lock` });

    expect(fs.existsSync(`${tmpDir}/bar.lock`)).toBe(true);
    expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(true);
});

it('should remove and acquire over stale locks', async () => {
    const mtime = new Date(Date.now() - 60000);

    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.mkdirSync(`${tmpDir}/foo.lock`);
    fs.utimesSync(`${tmpDir}/foo.lock`, mtime, mtime);

    await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    expect(fs.statSync(`${tmpDir}/foo.lock`).mtime.getTime()).toBeGreaterThan(Date.now() - 3000);
});

it('should let only one of two concurrent acquirers take over a stale lock', async () => {
    const mtime = new Date(Date.now() - 60000);

    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.mkdirSync(`${tmpDir}/foo.lock`);
    fs.utimesSync(`${tmpDir}/foo.lock`, mtime, mtime);

    // Both acquirers find the same stale lock. The first removes it only after the second has
    // judged it stale too, and the second removes it only after the first has finished.
    const secondStatted = pDefer();
    const firstSettled = pDefer();

    const firstFs: any = {
        ...fs,
        rmdir: (path: any, callback: any) => {
            if (path !== `${tmpDir}/foo.lock`) {
                return (fs.rmdir as any)(path, callback);
            }

            secondStatted.promise.then(() => (fs.rmdir as any)(path, callback));
        },
    };
    const secondFs: any = {
        ...fs,
        stat: (path: any, callback: any) => (fs.stat as any)(path, (err: any, stat: any) => {
            callback(err, stat);

            if (path === `${tmpDir}/foo.lock`) {
                secondStatted.resolve();
            }
        }),
        rmdir: (path: any, callback: any) => {
            if (path !== `${tmpDir}/foo.lock`) {
                return (fs.rmdir as any)(path, callback);
            }

            firstSettled.promise.then(() => (fs.rmdir as any)(path, callback));
        },
    };

    const first = lockfile.lock(`${tmpDir}/foo`, { fs: firstFs, lockfilePath: `${tmpDir}/foo.lock` });

    first.then(() => firstSettled.resolve(), () => firstSettled.resolve());

    const second = lockfile.lock(`${tmpDir}/foo`, { fs: secondFs, lockfilePath: `${tmpDir}/foo.lock` });

    const results = await Promise.allSettled([first, second]);
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');

    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.code).toBe('ELOCKED');
});

it('should fail if someone else is taking over a stale lock', async () => {
    const mtime = new Date(Date.now() - 60000);

    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.mkdirSync(`${tmpDir}/foo.lock`);
    fs.utimesSync(`${tmpDir}/foo.lock`, mtime, mtime);
    fs.mkdirSync(`${tmpDir}/foo.lock.takeover`);

    expect.assertions(2);

    try {
        await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });
    } catch (err: any) {
        expect(err.code).toBe('ELOCKED');
        expect(fs.existsSync(`${tmpDir}/foo.lock.takeover`)).toBe(true);
    }
});

it('should take over a stale lock if a crashed process left the takeover guard behind', async () => {
    const mtime = new Date(Date.now() - 60000);

    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.mkdirSync(`${tmpDir}/foo.lock`);
    fs.utimesSync(`${tmpDir}/foo.lock`, mtime, mtime);
    fs.mkdirSync(`${tmpDir}/foo.lock.takeover`);
    fs.utimesSync(`${tmpDir}/foo.lock.takeover`, mtime, mtime);

    await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    expect(fs.statSync(`${tmpDir}/foo.lock`).mtime.getTime()).toBeGreaterThan(Date.now() - 3000);
    expect(fs.existsSync(`${tmpDir}/foo.lock.takeover`)).toBe(false);
});

it('should acquire the lock if the stale lockfile was removed while taking it over', async () => {
    const mtime = new Date(Date.now() - 60000);
    let count = 0;
    const customFs = {
        ...fs,
        stat: jest.fn((path: any, callback: any) => {
            // Remove it right before the check made while holding the takeover guard
            if (count === 1) {
                fs.rmSync(`${tmpDir}/foo.lock`, { recursive: true, force: true });
            }
            count += 1;
            (fs.stat as any)(path, callback);
        }),
    };

    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.mkdirSync(`${tmpDir}/foo.lock`);
    fs.utimesSync(`${tmpDir}/foo.lock`, mtime, mtime);

    await lockfile.lock(`${tmpDir}/foo`, { fs: customFs as any, lockfilePath: `${tmpDir}/foo.lock` });

    expect(fs.statSync(`${tmpDir}/foo.lock`).mtime.getTime()).toBeGreaterThan(Date.now() - 3000);
    expect(fs.existsSync(`${tmpDir}/foo.lock.takeover`)).toBe(false);
});

it('should retry if the lockfile was removed when verifying staleness', async () => {
    const mtime = new Date(Date.now() - 60000);
    let count = 0;
    const customFs = {
        ...fs,
        mkdir: jest.fn((...args: any[]) => (fs.mkdir as any)(...args)),
        stat: jest.fn((...args: any[]) => {
            if (count % 2 === 0) {
                fs.rmSync(`${tmpDir}/foo.lock`, { recursive: true, force: true });
            }
            (fs.stat as any)(...args);
            count += 1;
        }),
    };

    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.mkdirSync(`${tmpDir}/foo.lock`);
    fs.utimesSync(`${tmpDir}/foo.lock`, mtime, mtime);

    await lockfile.lock(`${tmpDir}/foo`, { fs: customFs as any, lockfilePath: `${tmpDir}/foo.lock` });

    expect(customFs.mkdir).toHaveBeenCalledTimes(2);
    expect(customFs.stat).toHaveBeenCalledTimes(2);
    expect(fs.statSync(`${tmpDir}/foo.lock`).mtime.getTime()).toBeGreaterThan(Date.now() - 3000);
});

it('should retry if the lockfile was removed when verifying staleness (not recursively)', async () => {
    const mtime = new Date(Date.now() - 60000);
    const customFs = {
        ...fs,
        mkdir: jest.fn((...args: any[]) => (fs.mkdir as any)(...args)),
        stat: jest.fn((path: any, callback: any) => callback(Object.assign(new Error(), { code: 'ENOENT' }))),
    };

    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.mkdirSync(`${tmpDir}/foo.lock`);
    fs.utimesSync(`${tmpDir}/foo.lock`, mtime, mtime);

    expect.assertions(3);

    try {
        await lockfile.lock(`${tmpDir}/foo`, { fs: customFs as any, lockfilePath: `${tmpDir}/foo.lock` });
    } catch (err: any) {
        expect(err.code).toBe('ELOCKED');
        expect(customFs.mkdir).toHaveBeenCalledTimes(2);
        expect(customFs.stat).toHaveBeenCalledTimes(1);
    }
});

it('should fail if stating the lockfile errors out when verifying staleness', async () => {
    const mtime = new Date(Date.now() - 60000);
    const customFs = {
        ...fs,
        stat: (path: any, callback: any) => callback(new Error('foo')),
    };

    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.mkdirSync(`${tmpDir}/foo.lock`);
    fs.utimesSync(`${tmpDir}/foo.lock`, mtime, mtime);

    expect.assertions(1);

    try {
        await lockfile.lock(`${tmpDir}/foo`, { fs: customFs as any, lockfilePath: `${tmpDir}/foo.lock` });
    } catch (err: any) {
        expect(err.message).toBe('foo');
    }
});

it('should fail if removing a stale lockfile errors out', async () => {
    const mtime = new Date(Date.now() - 60000);
    const customFs = {
        ...fs,
        rmdir: (path: any, callback: any) => callback(new Error('foo')),
    };

    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.mkdirSync(`${tmpDir}/foo.lock`);
    fs.utimesSync(`${tmpDir}/foo.lock`, mtime, mtime);

    expect.assertions(1);

    try {
        await lockfile.lock(`${tmpDir}/foo`, { fs: customFs as any, lockfilePath: `${tmpDir}/foo.lock` });
    } catch (err: any) {
        expect(err.message).toBe('foo');
    }
});

it('should update the lockfile mtime automatically', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    await lockfile.lock(`${tmpDir}/foo`, { update: 1500, lockfilePath: `${tmpDir}/foo.lock` });

    expect.assertions(2);

    let mtime = fs.statSync(`${tmpDir}/foo.lock`).mtime;

    // First update occurs at 1500ms
    await delay(2000);

    let stat = fs.statSync(`${tmpDir}/foo.lock`);

    expect(stat.mtime.getTime()).toBeGreaterThan(mtime.getTime());
    mtime = stat.mtime;

    // Second update occurs at 3000ms
    await delay(2000);

    stat = fs.statSync(`${tmpDir}/foo.lock`);

    expect(stat.mtime.getTime()).toBeGreaterThan(mtime.getTime());
});

it('should set stale to a minimum of 2000', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.mkdirSync(`${tmpDir}/foo.lock`);

    expect.assertions(1);

    await delay(200);

    try {
        await lockfile.lock(`${tmpDir}/foo`, { stale: 100, lockfilePath: `${tmpDir}/foo.lock` });
    } catch (err: any) {
        expect(err.code).toBe('ELOCKED');
    }

    await delay(2000);

    await lockfile.lock(`${tmpDir}/foo`, { stale: 100, lockfilePath: `${tmpDir}/foo.lock` });
});

it('should set stale to a minimum of 2000 (falsy)', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.mkdirSync(`${tmpDir}/foo.lock`);

    expect.assertions(1);

    await delay(200);

    try {
        await lockfile.lock(`${tmpDir}/foo`, { stale: false, lockfilePath: `${tmpDir}/foo.lock` });
    } catch (err: any) {
        expect(err.code).toBe('ELOCKED');
    }

    await delay(2000);

    await lockfile.lock(`${tmpDir}/foo`, { stale: false, lockfilePath: `${tmpDir}/foo.lock` });
});

it('should call the compromised function if ENOENT was detected when updating the lockfile mtime', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const deferred = pDefer();

    const handleCompromised = async (err: any) => {
        expect(err.code).toBe('ECOMPROMISED');
        expect(err.message).toMatch('ENOENT');

        await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

        deferred.resolve();
    };

    await lockfile.lock(`${tmpDir}/foo`, { update: 1000, onCompromised: handleCompromised, lockfilePath: `${tmpDir}/foo.lock` });

    // Remove the file to trigger onCompromised
    fs.rmSync(`${tmpDir}/foo.lock`, { recursive: true, force: true });

    await deferred.promise;
});

it('should call the compromised function if failed to update the lockfile mtime too many times (stat)', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const customFs: any = { ...fs };

    const deferred = pDefer();

    const handleCompromised = (err: any) => {
        expect(err.code).toBe('ECOMPROMISED');
        expect(err.message).toMatch('foo');

        deferred.resolve();
    };

    await lockfile.lock(`${tmpDir}/foo`, {
        fs: customFs,
        update: 1000,
        stale: 5000,
        onCompromised: handleCompromised,
        lockfilePath: `${tmpDir}/foo.lock`,
    });

    customFs.stat = (path: any, callback: any) => callback(new Error('foo'));

    await deferred.promise;
}, 10000);

it('should call the compromised function if failed to update the lockfile mtime too many times (utimes)', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const customFs: any = { ...fs };

    const deferred = pDefer();

    const handleCompromised = (err: any) => {
        expect(err.code).toBe('ECOMPROMISED');
        expect(err.message).toMatch('foo');

        deferred.resolve();
    };

    await lockfile.lock(`${tmpDir}/foo`, {
        fs: customFs,
        update: 1000,
        stale: 5000,
        onCompromised: handleCompromised,
        lockfilePath: `${tmpDir}/foo.lock`,
    });

    customFs.utimes = (path: any, atime: any, mtime: any, callback: any) => callback(new Error('foo'));

    await deferred.promise;
}, 10000);

it('should call the compromised function if updating the lockfile took too much time', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const customFs: any = { ...fs };

    const deferred = pDefer();

    const handleCompromised = (err: any) => {
        expect(err.code).toBe('ECOMPROMISED');
        expect(err.message).toMatch('foo');

        deferred.resolve();
    };

    await lockfile.lock(`${tmpDir}/foo`, {
        fs: customFs,
        update: 1000,
        stale: 5000,
        onCompromised: handleCompromised,
        lockfilePath: `${tmpDir}/foo.lock`,
    });

    customFs.utimes = (path: any, atime: any, mtime: any, callback: any) => setTimeout(() => callback(new Error('foo')), 6000);

    await deferred.promise;
}, 10000);

it('should call the compromised function if lock was acquired by someone else due to staleness', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const customFs: any = { ...fs };

    const deferred = pDefer();

    const handleCompromised = (err: any) => {
        expect(err.code).toBe('ECOMPROMISED');
        expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(true);

        deferred.resolve();
    };

    await lockfile.lock(`${tmpDir}/foo`, {
        fs: customFs,
        update: 1000,
        stale: 3000,
        onCompromised: handleCompromised,
        lockfilePath: `${tmpDir}/foo.lock`,
    });

    customFs.utimes = (path: any, atime: any, mtime: any, callback: any) => setTimeout(() => callback(new Error('foo')), 6000);

    await delay(4500);

    await lockfile.lock(`${tmpDir}/foo`, { stale: 3000, lockfilePath: `${tmpDir}/foo.lock` });

    await deferred.promise;
}, 10000);

it('should keep checking its own lock after a newer lock on the same file replaced it', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const customFs: any = { ...fs };
    const deferred = pDefer();

    const handleCompromised = (err: any) => {
        expect(err.code).toBe('ECOMPROMISED');

        deferred.resolve();
    };

    await lockfile.lock(`${tmpDir}/foo`, {
        fs: customFs,
        update: 1000,
        stale: 3000,
        onCompromised: handleCompromised,
        lockfilePath: `${tmpDir}/foo.lock`,
    });

    // Simulate the first lock going stale, so that a new lock in this process takes it over
    const mtime = new Date(Date.now() - 60000);

    fs.utimesSync(`${tmpDir}/foo.lock`, mtime, mtime);

    await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    // Make the first lock's next check fail with a transient error, so that it schedules a retry
    customFs.stat = (path: any, callback: any) => {
        customFs.stat = fs.stat;
        callback(Object.assign(new Error('foo'), { code: 'EIO' }));
    };

    await deferred.promise;

    expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(true);
}, 10000);

it('should throw an error by default when the lock is compromised', async () => {
    const { stderr } = await execa('node_modules/.bin/tsx', [`${__dirname}/fixtures/compromised.ts`], { reject: false });

    expect(stderr).toMatch('ECOMPROMISED');
});

it('should set update to a minimum of 1000', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    expect.assertions(2);

    await lockfile.lock(`${tmpDir}/foo`, { update: 100, lockfilePath: `${tmpDir}/foo.lock` });

    const mtime = fs.statSync(`${tmpDir}/foo.lock`).mtime.getTime();

    await delay(200);

    expect(mtime).toBe(fs.statSync(`${tmpDir}/foo.lock`).mtime.getTime());

    await delay(1000);

    expect(fs.statSync(`${tmpDir}/foo.lock`).mtime.getTime()).toBeGreaterThan(mtime);
}, 10000);

it('should set update to a minimum of 1000 (falsy)', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    expect.assertions(2);

    await lockfile.lock(`${tmpDir}/foo`, { update: false, lockfilePath: `${tmpDir}/foo.lock` });

    const mtime = fs.statSync(`${tmpDir}/foo.lock`).mtime.getTime();

    await delay(200);

    expect(mtime).toBe(fs.statSync(`${tmpDir}/foo.lock`).mtime.getTime());

    await delay(1000);

    expect(fs.statSync(`${tmpDir}/foo.lock`).mtime.getTime()).toBeGreaterThan(mtime);
}, 10000);

it('should set update to a maximum of stale / 2', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    expect.assertions(2);

    await lockfile.lock(`${tmpDir}/foo`, { update: 6000, stale: 5000, lockfilePath: `${tmpDir}/foo.lock` });

    const mtime = fs.statSync(`${tmpDir}/foo.lock`).mtime.getTime();

    await delay(2000);

    expect(mtime).toBe(fs.statSync(`${tmpDir}/foo.lock`).mtime.getTime());

    await delay(1000);

    expect(fs.statSync(`${tmpDir}/foo.lock`).mtime.getTime()).toBeGreaterThan(mtime);
}, 10000);

it('should not fail to update mtime when we are over the threshold but mtime is ours', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');
    await lockfile.lock(`${tmpDir}/foo`, { update: 1000, stale: 2000, lockfilePath: `${tmpDir}/foo.lock` });
    sleepSync(3000);
    await delay(5000);
}, 16000);

it('should call the compromised function when we are over the threshold and mtime is not ours', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const deferred = pDefer();

    const handleCompromised = (err: any) => {
        expect(err.code).toBe('ECOMPROMISED');
        expect(err.message).toMatch('Unable to update lock within the stale threshold');

        deferred.resolve();
    };

    await lockfile.lock(`${tmpDir}/foo`, {
        update: 1000,
        stale: 2000,
        onCompromised: handleCompromised,
        lockfilePath: `${tmpDir}/foo.lock`,
    });

    const mtime = new Date(Date.now() - 60000);

    fs.utimesSync(`${tmpDir}/foo.lock`, mtime, mtime);

    sleepSync(3000);

    await deferred.promise;
}, 16000);

it('should allow millisecond precision mtime', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const customFs = {
        ...fs,
        stat(path: any, cb: any) {
            fs.stat(path, (err, stat) => {
                if (err) {
                    return cb(err);
                }

                stat.mtime = new Date((Math.floor(stat.mtime.getTime() / 1000) * 1000) + 123);
                cb(null, stat);
            });
        },
    };

    const dateNow = Date.now;

    jest.spyOn(Date, 'now').mockImplementation(() => (Math.floor(dateNow() / 1000) * 1000) + 123);

    await lockfile.lock(`${tmpDir}/foo`, {
        fs: customFs as any,
        update: 1000,
        lockfilePath: `${tmpDir}/foo.lock`,
    });

    await delay(3000);
});

it('should allow floor\'ed second precision mtime', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const customFs = {
        ...fs,
        stat(path: any, cb: any) {
            fs.stat(path, (err, stat) => {
                if (err) {
                    return cb(err);
                }

                // Make second precision if not already
                stat.mtime = new Date(Math.floor(stat.mtime.getTime() / 1000) * 1000);
                cb(null, stat);
            });
        },
    };

    await lockfile.lock(`${tmpDir}/foo`, {
        fs: customFs as any,
        update: 1000,
        lockfilePath: `${tmpDir}/foo.lock`,
    });

    await delay(3000);
});

it('should probe the mtime precision of each volume', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.writeFileSync(`${tmpDir}/bar`, '');

    // Emulate `bar.lock` living on another volume whose mtime only has second precision
    const customFs = {
        ...fs,
        stat(path: any, cb: any) {
            fs.stat(path, (err, stat) => {
                if (err) {
                    return cb(err);
                }

                if (String(path).endsWith('bar.lock')) {
                    stat.dev += 1;
                    stat.mtime = new Date(Math.floor(stat.mtime.getTime() / 1000) * 1000);
                }

                cb(null, stat);
            });
        },
    };

    const handleCompromised = jest.fn();

    await lockfile.lock(`${tmpDir}/foo`, { fs: customFs as any, lockfilePath: `${tmpDir}/foo.lock` });
    await lockfile.lock(`${tmpDir}/bar`, {
        fs: customFs as any,
        update: 1000,
        onCompromised: handleCompromised,
        lockfilePath: `${tmpDir}/bar.lock`,
    });

    await delay(3000);

    expect(handleCompromised).not.toHaveBeenCalled();
});

it('should allow ceil\'ed second precision mtime', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const customFs = {
        ...fs,
        stat(path: any, cb: any) {
            fs.stat(path, (err, stat) => {
                if (err) {
                    return cb(err);
                }

                // Make second precision if not already
                stat.mtime = new Date(Math.ceil(stat.mtime.getTime() / 1000) * 1000);
                cb(null, stat);
            });
        },
    };

    await lockfile.lock(`${tmpDir}/foo`, {
        fs: customFs as any,
        update: 1000,
        lockfilePath: `${tmpDir}/foo.lock`,
    });

    await delay(3000);
});
