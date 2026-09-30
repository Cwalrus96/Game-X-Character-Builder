// Wait for the observer's local artifact when a long handler exceeds UI-tool deadlines.
import fs from 'node:fs/promises';
import path from 'node:path';
const output=process.env.GAME_X_BENCH_OUTPUT || '.staging/performance-baseline';
const [id,page,countText]=process.argv.slice(2),count=Number(countText);
if(!id||!page||!Number.isInteger(count)||count<1)throw Error('Usage: wait-sample.mjs <id> <page-fragment> <count>');
const deadline=Date.now()+55000;
while(Date.now()<deadline){
  const rows=(await fs.readFile(path.join(output,'browser.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse).filter(x=>x.id===id&&x.page.includes(page));
  if(rows.length>=count){console.log(JSON.stringify(rows.at(-1)));process.exit(0);}
  await new Promise(resolve=>setTimeout(resolve,500));
}
throw Error('No completed sample within 55 seconds; inspect the UI before retrying any action.');
