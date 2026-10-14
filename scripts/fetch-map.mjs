import { spawnSync } from 'node:child_process';
// Optional, deliberate source refresh. The normal build uses the committed map.
const result = spawnSync('python3', ['scripts/acquire-osm.py'], { stdio: 'inherit' });
if (result.error) console.error(`Map refresh failed: ${result.error.message}`);
process.exitCode = result.status ?? 1;
