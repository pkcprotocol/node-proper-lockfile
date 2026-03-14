import fs from 'graceful-fs';
import lockfile from '../src/index';
import unlockAll from './util/unlockAll';
import { delay } from './util/helpers';

const tmpDir = `${__dirname}/tmp`;

beforeAll(() => fs.mkdirSync(tmpDir, { recursive: true }));

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

afterEach(async () => {
    await unlockAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
});

it('should fail if the file does not exist by default', async () => {
    expect.assertions(1);

    try {
        await lockfile.check(`${tmpDir}/some-file-that-will-never-exist`, { lockfilePath: `${tmpDir}/some-file-that-will-never-exist.lock` });
    } catch (err: any) {
        expect(err.code).toBe('ENOENT');
    }
});

it('should not fail if the file does not exist and realpath is false', async () => {
    await lockfile.check(`${tmpDir}/some-file-that-will-never-exist`, { realpath: false, lockfilePath: `${tmpDir}/some-file-that-will-never-exist.lock` });
});

it('should return a promise', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const promise = lockfile.check(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    expect(typeof promise.then).toBe('function');

    await promise;
});

it('should resolve with true if file is locked', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    const isLocked = await lockfile.check(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    expect(isLocked).toBe(true);
});

it('should resolve with false if file is not locked', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const isLocked = await lockfile.check(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    expect(isLocked).toBe(false);
});

it('should use the custom fs', async () => {
    const customFs = {
        ...fs,
        realpath: (path: any, callback: any) => callback(new Error('foo')),
    };

    expect.assertions(1);

    try {
        await lockfile.check(`${tmpDir}/foo`, { fs: customFs as any, lockfilePath: `${tmpDir}/foo.lock` });
    } catch (err: any) {
        expect(err.message).toBe('foo');
    }
});

it('should resolve symlinks by default', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.symlinkSync(`${tmpDir}/foo`, `${tmpDir}/bar`);

    await lockfile.lock(`${tmpDir}/bar`, { lockfilePath: `${tmpDir}/bar.lock` });

    let isLocked = await lockfile.check(`${tmpDir}/bar`, { lockfilePath: `${tmpDir}/bar.lock` });

    expect(isLocked).toBe(true);

    isLocked = await lockfile.check(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/bar.lock` });

    expect(isLocked).toBe(true);
});

it('should not resolve symlinks if realpath is false', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.symlinkSync(`${tmpDir}/foo`, `${tmpDir}/bar`);

    await lockfile.lock(`${tmpDir}/bar`, { realpath: false, lockfilePath: `${tmpDir}/bar.lock` });

    let isLocked = await lockfile.check(`${tmpDir}/bar`, { realpath: false, lockfilePath: `${tmpDir}/bar.lock` });

    expect(isLocked).toBe(true);

    isLocked = await lockfile.check(`${tmpDir}/foo`, { realpath: false, lockfilePath: `${tmpDir}/foo.lock` });

    expect(isLocked).toBe(false);
});

it('should fail if stating the lockfile errors out when verifying staleness', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const mtime = new Date(Date.now() - 60000);
    const customFs = {
        ...fs,
        stat: (path: any, callback: any) => callback(new Error('foo')),
    };

    fs.mkdirSync(`${tmpDir}/foo.lock`);
    fs.utimesSync(`${tmpDir}/foo.lock`, mtime, mtime);

    expect.assertions(1);

    try {
        await lockfile.check(`${tmpDir}/foo`, { fs: customFs as any, lockfilePath: `${tmpDir}/foo.lock` });
    } catch (err: any) {
        expect(err.message).toBe('foo');
    }
});

it('should set stale to a minimum of 2000', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.mkdirSync(`${tmpDir}/foo.lock`);

    expect.assertions(2);

    await delay(200);

    let isLocked = await lockfile.check(`${tmpDir}/foo`, { stale: 100, lockfilePath: `${tmpDir}/foo.lock` });

    expect(isLocked).toBe(true);

    await delay(2000);

    isLocked = await lockfile.check(`${tmpDir}/foo`, { stale: 100, lockfilePath: `${tmpDir}/foo.lock` });

    expect(isLocked).toBe(false);
});

it('should set stale to a minimum of 2000 (falsy)', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');
    fs.mkdirSync(`${tmpDir}/foo.lock`);

    expect.assertions(2);

    await delay(200);

    let isLocked = await lockfile.check(`${tmpDir}/foo`, { stale: false, lockfilePath: `${tmpDir}/foo.lock` });

    expect(isLocked).toBe(true);

    await delay(2000);

    isLocked = await lockfile.check(`${tmpDir}/foo`, { stale: false, lockfilePath: `${tmpDir}/foo.lock` });

    expect(isLocked).toBe(false);
});
