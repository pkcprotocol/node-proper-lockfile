import fs from 'fs';
import lockfile from '../../src/index';

const tmpDir = `${__dirname}/../tmp`;

fs.writeFileSync(`${tmpDir}/foo`, '');

lockfile.lockSync(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

// Simulate another process taking over the lock after it went stale
const mtime = new Date(fs.statSync(`${tmpDir}/foo.lock`).mtime.getTime() + 1500);

fs.rmdirSync(`${tmpDir}/foo.lock`);
fs.mkdirSync(`${tmpDir}/foo.lock`);
fs.utimesSync(`${tmpDir}/foo.lock`, mtime, mtime);
