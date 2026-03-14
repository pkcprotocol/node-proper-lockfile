import fs from 'fs';
import lockfile from '../../src/index';

const tmpDir = `${__dirname}/../tmp`;

fs.writeFileSync(`${tmpDir}/foo`, '');

lockfile.lockSync(`${tmpDir}/foo`, { lockfilePath: `${tmpDir}/foo.lock` });

throw new Error('intencional crash');
