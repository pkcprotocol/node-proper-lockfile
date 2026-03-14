import cluster from 'cluster';
import fs from 'fs';
import os from 'os';
import lockfile from '../../src/index';

const tmpDir = `${__dirname}/../tmp`;

const maxTryDelay = 50;
const maxLockTime = 200;
const totalTestTime = 60000;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

interface LogEntry {
    timestamp: number;
    message: string;
}

function printExcerpt(logs: LogEntry[], index: number): void {
    const startIndex = Math.max(0, index - 50);
    const endIndex = index + 50;

    logs
        .slice(startIndex, endIndex)
        .forEach((log, i) => process.stdout.write(`${startIndex + i + 1} ${log.timestamp} ${log.message}\n`));
}

async function master(): Promise<void> {
    const numCPUs = os.cpus().length;
    let logs: string[] = [];

    fs.writeFileSync(`${tmpDir}/foo`, '');

    for (let i = 0; i < numCPUs; i += 1) {
        cluster.fork();
    }

    cluster.on('online', (worker) =>
        worker.on('message', (data: any) =>
            logs.push(data.toString().trim())));

    cluster.on('exit', () => {
        throw new Error('Child died prematurely');
    });

    await delay(totalTestTime);

    cluster.removeAllListeners('exit');

    cluster.disconnect(() => {
        let acquired = false;

        // Parse & sort logs
        let parsedLogs: LogEntry[] = logs.map((log) => {
            const split = log.split(' ');

            return { timestamp: Number(split[0]), message: split[1] };
        });

        parsedLogs.sort((log1, log2) => {
            if (log1.timestamp > log2.timestamp) {
                return 1;
            }
            if (log1.timestamp < log2.timestamp) {
                return -1;
            }
            if (log1.message === 'LOCK_RELEASE_CALLED') {
                return -1;
            }
            if (log2.message === 'LOCK_RELEASE_CALLED') {
                return 1;
            }

            return 0;
        });

        // Validate logs
        parsedLogs.forEach((log, index) => {
            switch (log.message) {
            case 'LOCK_ACQUIRED':
                if (acquired) {
                    process.stdout.write(`\nInconsistent at line ${index + 1}\n`);
                    printExcerpt(parsedLogs, index);
                    process.exit(1);
                }

                acquired = true;
                break;
            case 'LOCK_RELEASE_CALLED':
                if (!acquired) {
                    process.stdout.write(`\nInconsistent at line ${index + 1}\n`);
                    printExcerpt(parsedLogs, index);
                    process.exit(1);
                }

                acquired = false;
                break;
            default:
                // Do nothing
            }
        });

        process.exit(0);
    });
}

function worker(): void {
    process.on('disconnect', () => process.exit(0));

    const tryLock = async () => {
        await delay(Math.max(Math.random(), 10) * maxTryDelay);

        process.send!(`${Date.now()} LOCK_TRY\n`);

        let release: () => Promise<void>;

        try {
            release = await lockfile.lock(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });
        } catch (err) {
            process.send!(`${Date.now()} LOCK_BUSY\n`);
            tryLock();

            return;
        }

        process.send!(`${Date.now()} LOCK_ACQUIRED\n`);

        await delay(Math.max(Math.random(), 10) * maxLockTime);

        process.send!(`${Date.now()} LOCK_RELEASE_CALLED\n`);

        await release();

        tryLock();
    };

    tryLock();
}

// Any unhandled promise should cause the process to exit
process.on('unhandledRejection', (err: any) => {
    console.error(err.stack);
    process.exit(1);
});

if (cluster.isPrimary) {
    master();
} else {
    worker();
}
