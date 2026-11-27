import esbuild from 'esbuild';
import { readdirSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';

const outdir = '.test-build';
rmSync(outdir, { recursive: true, force: true });
const entryPoints = readdirSync('test').filter((f) => f.endsWith('.test.ts')).map((f) => `test/${f}`);
await esbuild.build({ entryPoints, outdir, bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, logLevel: 'warning' });
const files = readdirSync(outdir).map((f) => `${outdir}/${f}`);
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
