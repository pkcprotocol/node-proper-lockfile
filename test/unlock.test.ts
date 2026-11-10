import fs from 'graceful-fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const clearTimeouts = require('@segment/clear-timeouts');
import lockfile from '../src/index';
import unlockAll from './util/unlockAll';
import { delay, pDefer } from './util/helpers';

const tmpDir = `${__dirname}/tmp`;

clearTimeouts.install();

beforeAll(() => fs.mkdirSync(tmpDir, { recursive: true }));

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

afterEach(async () => {
    clearTimeouts();

    await unlockAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
});

it('should fail if the lock is not acquired', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    expect.assertions(1);

    try {
        await lockfile.unlock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });
    } catch (err: any) {
        expect(err.code).toBe('ENOTACQUIRED');
    }
});

it('should return a promise', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const promise = lockfile.unlock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    expect(typeof promise.then).toBe('function');

    await promise.catch(() => {});
});

it('should release the lock', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    await lockfile.unlock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });
});

it('should remove the lockfile', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    await lockfile.unlock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(false);
});

it('should fail if removing the lockfile errors out', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const customFs = {
        ...fs,
        rmdir: (path: any, callback: any) => callback(new Error('foo')),
    };

    expect.assertions(1);

    await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    try {
        await lockfile.unlock(`${tmpDir}/foo`, { fs: customFs as any, lockfilePath: `${tmpDir}/foo.lock` });
    } catch (err: any) {
        expect(err.message).toBe('foo');
    }
});

it('should ignore ENOENT errors when removing the lockfile', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const customFs = {
        ...fs,
        rmdir: jest.fn((path: any, callback: any) => callback(Object.assign(new Error(), { code: 'ENOENT' }))),
    };

    await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    await lockfile.unlock(`${tmpDir}/foo`, { fs: customFs as any, lockfilePath: `${tmpDir}/foo.lock` });

    expect(customFs.rmdir).toHaveBeenCalledTimes(1);
});

it('should not fail if the lockfile was already removed', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    fs.rmdirSync(`${tmpDir}/foo.lock`);

    await lockfile.unlock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });
});

it('should stop updating the lockfile mtime', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const customFs: any = { ...fs };

    await lockfile.lock(`${tmpDir}/foo`, { update: 2000, fs: customFs, lockfilePath: `${tmpDir}/foo.lock` });

    customFs.utimes = jest.fn((path: any, atime: any, mtime: any, callback: any) => callback());

    await lockfile.unlock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    // First update occurs at 2000ms
    await delay(2500);

    expect(customFs.utimes).toHaveBeenCalledTimes(0);
}, 10000);

it('should stop updating the lockfile mtime (slow fs)', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const customFs: any = { ...fs };

    await lockfile.lock(`${tmpDir}/foo`, { fs: customFs, update: 2000, lockfilePath: `${tmpDir}/foo.lock` });

    customFs.utimes = jest.fn((...args: any[]) => setTimeout(() => (fs.utimes as any)(...args), 2000));

    await delay(3000);

    await lockfile.unlock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    await delay(3000);

    expect(customFs.utimes).toHaveBeenCalledTimes(1);
}, 10000);

it('should stop updating the lockfile mtime (slow fs + new lock)', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const customFs: any = { ...fs };

    await lockfile.lock(`${tmpDir}/foo`, { fs: customFs, update: 2000, lockfilePath: `${tmpDir}/foo.lock` });

    customFs.utimes = jest.fn((...args: any[]) => setTimeout(() => (fs.utimes as any)(...args), 2000));

    await delay(3000);

    await lockfile.unlock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    await delay(3000);

    expect(customFs.utimes).toHaveBeenCalledTimes(1);
}, 10000);

it('should let an update of the lockfile mtime in flight finish before removing it', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const customFs: any = { ...fs };

    await lockfile.lock(`${tmpDir}/foo`, { fs: customFs, update: 1000, lockfilePath: `${tmpDir}/foo.lock` });

    // Delay the next mtime update, so that it is still in flight when the lock is released
    const utimesCalled = pDefer();

    customFs.utimes = jest.fn((...args: any[]) => {
        utimesCalled.resolve();
        setTimeout(() => (fs.utimes as any)(...args), 500);
    });

    await utimesCalled.promise;

    await lockfile.unlock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(false);

    // The old update must not land on a new lock
    const handleCompromised = jest.fn();

    await lockfile.lock(`${tmpDir}/foo`, { update: 1000, onCompromised: handleCompromised, lockfilePath: `${tmpDir}/foo.lock` });

    await delay(2000);

    expect(customFs.utimes).toHaveBeenCalledTimes(1);
    expect(handleCompromised).not.toHaveBeenCalled();
}, 10000);

it('should not report the lock as compromised if it was released while checking its mtime', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const customFs: any = { ...fs };
    const handleCompromised = jest.fn();

    await lockfile.lock(`${tmpDir}/foo`, {
        fs: customFs,
        update: 1000,
        onCompromised: handleCompromised,
        lockfilePath: `${tmpDir}/foo.lock`,
    });

    // Delay the next stat issued by the update loop so that the release happens while it is in flight
    const statCalled = pDefer();

    customFs.stat = (path: any, callback: any) => {
        customFs.stat = fs.stat;
        statCalled.resolve();
        setTimeout(() => (fs.stat as any)(path, callback), 500);
    };

    await statCalled.promise;

    await lockfile.unlock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    await delay(1000);

    expect(handleCompromised).not.toHaveBeenCalled();
}, 10000);

it('should resolve symlinks by default', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.symlinkSync(`${tmpDir}/foo`, `${tmpDir}/bar`);

    await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    await lockfile.unlock(`${tmpDir}/bar`, { lockfilePath: `${tmpDir}/foo.lock` });

    expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(false);
});

it('should not resolve symlinks if realpath is false', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.symlinkSync(`${tmpDir}/foo`, `${tmpDir}/bar`);

    expect.assertions(1);

    await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    try {
        await lockfile.unlock(`${tmpDir}/bar`, { realpath: false, lockfilePath: `${tmpDir}/foo.lock` });
    } catch (err: any) {
        expect(err.code).toBe('ENOTACQUIRED');
    }
});

it('should use a custom fs', async () => {
    const customFs = {
        ...fs,
        realpath: (path: any, callback: any) => callback(new Error('foo')),
    };

    expect.assertions(1);

    try {
        await lockfile.unlock(`${tmpDir}/foo`, { fs: customFs as any, lockfilePath: `${tmpDir}/foo.lock` });
    } catch (err: any) {
        expect(err.message).toBe('foo');
    }
});
