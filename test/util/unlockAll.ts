import { getLocks } from '../../src/lockfile';
import lockfile from '../../src/index';

function unlockAll(): Promise<void[]> {
    const locks = getLocks();
    const promises = Object.values(locks).map((entry) =>
        lockfile.unlock(entry.file, { realpath: false, lockfilePath: entry.lockfilePath }),
    );

    return Promise.all(promises);
}

export default unlockAll;
