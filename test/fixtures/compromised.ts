import fs from 'fs';
import lockfile from '../../src/index';

const tmpDir = `${__dirname}/../tmp`;

fs.writeFileSync(`${tmpDir}/foo`, '');

lockfile.lockSync(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock`, update: 1000 });

fs.rmdirSync(`${tmpDir}/foo.lock`);

// Do not let the process exit
setInterval(() => {}, 1000);

process.on('uncaughtException', (err: any) => {
    err.code && process.stderr.write(`${err.code}\n\n`);
    throw err;
});
