import fs from 'graceful-fs';
import lockfile from '../src/index';
import unlockAll from './util/unlockAll';

const tmpDir = `${__dirname}/tmp`;

beforeAll(() => fs.mkdirSync(tmpDir, { recursive: true }));

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

afterEach(async () => {
    await unlockAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
});

it('should release the lock', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const release = await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    await release();

    await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });
});

it('should remove the lockfile', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const release = await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    await release();

    expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(false);
});

it('should not remove the lockfile if someone else acquired it', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const release = await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    // Simulate another process taking over the lock after it went stale
    const mtime = new Date(fs.statSync(`${tmpDir}/foo.lock`).mtime.getTime() + 1500);

    fs.rmdirSync(`${tmpDir}/foo.lock`);
    fs.mkdirSync(`${tmpDir}/foo.lock`);
    fs.utimesSync(`${tmpDir}/foo.lock`, mtime, mtime);

    await expect(release()).rejects.toMatchObject({ code: 'ECOMPROMISED' });
    expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(true);
});

it('should not release a newer lock on the same file', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    const release1 = await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    // Simulate the first lock going stale, so that a new lock in this process takes it over
    const mtime = new Date(Date.now() - 60000);

    fs.utimesSync(`${tmpDir}/foo.lock`, mtime, mtime);

    const release2 = await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    await expect(release1()).rejects.toMatchObject({ code: 'ECOMPROMISED' });
    expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(true);

    await release2();

    expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(false);
});

it('should fail when releasing twice', async () => {
    fs.writeFileSync(`${tmpDir}/foo`, '');

    expect.assertions(1);

    const release = await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

    await release();

    try {
        await release();
    } catch (err: any) {
        expect(err.code).toBe('ERELEASED');
    }
});
