// Serial, read-only requests to public Hosting assets; not a concurrent load test.
import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
const origin='https://game-x-character-builder.web.app';
const paths=['/character-sheet.html','/data/game-x/game-x-data.json'];
const rows=[];
for(const path of paths){
  let etag;
  for(let i=0;i<6;i++){
    const start=performance.now();
    const response=await fetch(origin+path,{headers:etag?{'If-None-Match':etag}:{}});
    const headersMs=performance.now()-start;
    const body=await response.arrayBuffer();
    if(!response.ok&&response.status!==304)throw Error(`HTTP ${response.status}`);
    rows.push({path,request:i,mode:i===0?'first-request':'conditional-repeat',status:response.status,headersMs:+headersMs.toFixed(1),totalMs:+(performance.now()-start).toFixed(1),decodedBytes:body.byteLength,contentEncoding:response.headers.get('content-encoding'),cacheControl:response.headers.get('cache-control')});
    etag=response.headers.get('etag')||etag;
  }
}
await fs.mkdir('.staging/performance-baseline',{recursive:true});
await fs.writeFile('.staging/performance-baseline/static-network.json',JSON.stringify({at:new Date().toISOString(),origin,method:'Node fetch, serial requests, first GET then five conditional GETs. Shared connection pool; no browser parsing, authentication, character database calls, or concurrency.',rows},null,2));
console.log(JSON.stringify(rows));
