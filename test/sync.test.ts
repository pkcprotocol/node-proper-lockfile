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

describe('.lockSync()', () => {
    it('should expose a working lockSync', () => {
        fs.writeFileSync(`${tmpDir}/foo`, '');

        const release = lockfile.lockSync(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

        expect(typeof release).toBe('function');
        expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(true);

        release();

        expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(false);
    });

    it('should fail if the lock is already acquired', () => {
        fs.writeFileSync(`${tmpDir}/foo`, '');

        lockfile.lockSync(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

        expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(true);
        expect(() => lockfile.lockSync(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` })).toThrow(/already being held/);
    });

    it('should pass options correctly', () => {
        expect(() => lockfile.lockSync(`${tmpDir}/foo`, { realpath: false, lockfilePath: `${tmpDir}/foo.lock` })).not.toThrow();
    });

    it('should not allow retries to be passed', () => {
        fs.writeFileSync(`${tmpDir}/foo`, '');

        expect(() => lockfile.lockSync(`${tmpDir}/foo`, { retries: 10, lockfilePath: `${tmpDir}/foo.lock` })).toThrow(/Cannot use retries/i);

        expect(() => lockfile.lockSync(`${tmpDir}/foo`, { retries: { retries: 10 }, lockfilePath: `${tmpDir}/foo.lock` })).toThrow(/Cannot use retries/i);

        expect(() => {
            const release = lockfile.lockSync(`${tmpDir}/foo`, { retries: 0, lockfilePath: `${tmpDir}/foo.lock` });

            release();
        }).not.toThrow();

        expect(() => {
            const release = lockfile.lockSync(`${tmpDir}/foo`, { retries: { retries: 0 }, lockfilePath: `${tmpDir}/foo.lock` });

            release();
        }).not.toThrow();
    });

    it('should fail syncronously if release throws', () => {
        fs.writeFileSync(`${tmpDir}/foo`, '');

        expect.assertions(1);

        const release = lockfile.lockSync(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

        release();

        expect(() => release()).toThrow('Lock is already released');
    });
});

describe('.unlockSync()', () => {
    it('should expose a working unlockSync', () => {
        fs.writeFileSync(`${tmpDir}/foo`, '');

        lockfile.lockSync(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

        expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(true);

        lockfile.unlockSync(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

        expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(false);
    });

    it('should fail is lock is not acquired', () => {
        fs.writeFileSync(`${tmpDir}/foo`, '');

        expect(() => lockfile.unlockSync(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` })).toThrow(/not acquired\/owned by you/);
    });

    it('should pass options correctly', () => {
        expect(() => lockfile.unlockSync(`${tmpDir}/foo`, { realpath: false, lockfilePath: `${tmpDir}/foo.lock` })).toThrow(/not acquired\/owned by you/);
    });
});

describe('.checkSync()', () => {
    it('should expose a working checkSync', () => {
        fs.writeFileSync(`${tmpDir}/foo`, '');

        expect(lockfile.checkSync(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` })).toBe(false);

        const release = lockfile.lockSync(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

        expect(lockfile.checkSync(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` })).toBe(true);

        release();

        expect(lockfile.checkSync(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` })).toBe(false);
    });

    it('should fail is file does not exist', () => {
        expect(() => lockfile.checkSync(`${tmpDir}/some-file-that-will-never-exist`, { lockfilePath: `${tmpDir}/some-file-that-will-never-exist.lock` })).toThrow(/ENOENT/);
    });

    it('should pass options correctly', () => {
        expect(() => lockfile.checkSync(`${tmpDir}/foo`, { realpath: false, lockfilePath: `${tmpDir}/foo.lock` })).not.toThrow();
    });
});
