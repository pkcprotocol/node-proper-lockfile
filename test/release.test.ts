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
