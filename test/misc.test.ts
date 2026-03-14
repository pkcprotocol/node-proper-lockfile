import fs from 'fs';
import execa from 'execa';

const tmpDir = `${__dirname}/tmp`;

beforeAll(() => fs.mkdirSync(tmpDir, { recursive: true }));

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
});

it('should always use `options.fs` when calling `fs` methods', () => {
    const lockfileContents = fs.readFileSync(`${__dirname}/../src/lockfile.ts`, 'utf8');

    // Check that there are no bare fs.xxx calls (only options.fs.xxx)
    // Split by lines and check each line - ignore import/require lines and comments
    const lines = lockfileContents.split('\n');
    const badLines = lines.filter((line) => {
        const trimmed = line.trim();
        // Skip imports, comments, type annotations
        if (trimmed.startsWith('import ') || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
            return false;
        }
        // Match bare fs.method calls (not options.fs or entry.options.fs)
        return /(?<![.a-zA-Z_])fs\.[a-z]+\(/i.test(trimmed);
    });

    expect(badLines).toEqual([]);
});

it('should remove open locks if the process crashes', async () => {
    const { stderr } = await execa('node_modules/.bin/tsx', [`${__dirname}/fixtures/crash.ts`], { reject: false });

    expect(stderr).toMatch('intencional crash');
    expect(fs.existsSync(`${tmpDir}/foo.lock`)).toBe(false);
});

it('should not hold the process if it has no more work to do', async () => {
    await execa('node_modules/.bin/tsx', [`${__dirname}/fixtures/unref.ts`]);
});

it('should work on stress conditions', async () => {
    try {
        await execa('node_modules/.bin/tsx', [`${__dirname}/fixtures/stress.ts`]);
    } catch (err: any) {
        const stdout = err.stdout || '';

        if (process.env.CI) {
            process.stdout.write(stdout);
        } else {
            fs.writeFileSync(`${__dirname}/stress.log`, stdout);
        }

        throw err;
    }
}, 80000);
