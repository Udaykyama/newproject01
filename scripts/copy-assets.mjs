// tsc only emits JavaScript, so the SQL schema that db/index.ts reads at
// runtime has to be copied into dist alongside it.
import { copyFileSync, mkdirSync } from 'node:fs';

const assets = [['src/db/schema.sql', 'dist/src/db/schema.sql']];

for (const [from, to] of assets) {
  mkdirSync(to.slice(0, to.lastIndexOf('/')), { recursive: true });
  copyFileSync(from, to);
  console.log(`copied ${from} -> ${to}`);
}
