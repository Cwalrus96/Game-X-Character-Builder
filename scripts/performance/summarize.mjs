// Summarize the recorded September 29 baseline without discarding raw evidence.
import fs from 'node:fs/promises';
const dir='.staging/performance-baseline';
const read=async name=>JSON.parse(await fs.readFile(`${dir}/${name}`,'utf8'));
const browser=(await fs.readFile(`${dir}/browser.jsonl`,'utf8')).trim().split('\n').map(JSON.parse);
const recoveryCutoff='2026-09-30T01:11:00.000Z';
const exclusions=[
  {at:'2026-09-30T00:59:55.350Z',reason:'Calibration: no-op attribute restoration after fill did not emit a native change.'},
  {at:'2026-09-30T01:00:38.450Z',reason:'Overlapping input: the next action started before the second animation frame.'},
  {at:'2026-09-30T01:00:38.453Z',reason:'Partner of the overlapping input; excluded from isolated-action summaries.'},
];
const groups=new Map();
for(const row of browser){
  if(exclusions.some(x=>x.at===row.at)||row.id.startsWith('click:'))continue;
  const phase=row.at<recoveryCutoff?'earlier-session':'fresh-session';
  const key=[phase,row.page,row.id,row.from||'',row.id==='page-ready'?row.navigationType:''].join('|');
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(row);
}
const summarize=rows=>{
  const values=rows.map(r=>r.durationMs).sort((a,b)=>a-b), n=values.length;
  return {n,medianMs:+(n%2?values[(n-1)/2]:(values[n/2-1]+values[n/2])/2).toFixed(2),minMs:values[0],maxMs:values.at(-1),samplesMs:rows.map(r=>r.durationMs)};
};
const report={
  schemaVersion:1,title:'Game X benchmark baseline — September 29, 2026 (America/New_York)',
  scope:'Observational baseline only. Application files unchanged. Browser writes only to one disposable emulator document. Production requests only to public Hosting assets.',
  manifest:await read('manifest.json'),core:await read('core.json'),staticNetwork:await read('static-network.json'),
  verification:await read('verification.json'),
  browser:{
    recoveryCutoff,exclusions,
    phaseNote:'The first benchmark tab crashed during the first Techniques save. Fresh tabs in the same in-app browser then ran faster. The reason for the difference is unconfirmed; phases must not be pooled or treated as an optimization.',
    failures:[{action:'Save on Techniques',phase:'earlier-session',attempts:1,outcome:'Tab crash; no Saved completion sample. A 55-second result wait expired. Emulator revision remained 28 with five techniques and 76 HP. No reliable crash duration or cause established.'}],
    summaries:[...groups].map(([key,rows])=>({key,...summarize(rows)})),raw:browser,
  },
};
await fs.mkdir('docs/benchmarks',{recursive:true});
await fs.writeFile('docs/benchmarks/2026-09-29-baseline.json',JSON.stringify(report,null,2)+'\n');
for(const row of report.browser.summaries)console.log(JSON.stringify(row));
