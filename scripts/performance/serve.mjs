// Local-only observational benchmark server. Application source is never edited.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root=path.resolve(process.env.GAME_X_BENCH_PUBLIC || 'public');
const output=path.resolve(process.env.GAME_X_BENCH_OUTPUT || '.staging/performance-baseline');
const port=Number(process.env.GAME_X_BENCH_PORT || 5027);
await fs.mkdir(output,{recursive:true});
const manifest={};
async function scan(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){
  if(item.name==='local-review') continue;
  const file=path.join(dir,item.name);
  if(item.isDirectory()) await scan(file);
  else manifest[path.relative(root,file).replaceAll('\\','/')]=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}}
await scan(root);
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files:manifest},null,2));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png','.ico':'image/x-icon'};
http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,`http://127.0.0.1:${port}`);
  if(url.pathname==='/__benchmark/results'&&req.method==='POST'){
    let body=''; for await(const chunk of req){body+=chunk;if(body.length>300000)throw Error('Too large');}
    const value=JSON.parse(body);
    await fs.appendFile(path.join(output,'browser.jsonl'),JSON.stringify(value)+'\n');
    res.writeHead(204);res.end();return;
  }
  if(req.method!=='GET')throw Error('Method');
  const isProbe=url.pathname==='/__benchmark/probe.js';
  const file=isProbe?path.resolve('scripts/performance/browser-probe.js'):path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!isProbe&&(!file.startsWith(root+path.sep)||url.pathname.startsWith('/local-review/')))throw Error('Path');
  let bytes=await fs.readFile(file);
  const ext=path.extname(file);
  if(ext==='.html') bytes=Buffer.from(bytes.toString().replace('<head>','<head><script src="/__benchmark/probe.js"></script>'));
  const etag='"'+crypto.createHash('sha256').update(bytes).digest('hex')+'"';
  res.setHeader('Cache-Control',ext==='.js'||ext==='.html'?'no-cache':'public, max-age=3600');
  res.setHeader('ETag',etag);
  if(req.headers['if-none-match']===etag){res.writeHead(304);res.end();return;}
  res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream'});res.end(bytes);
}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`Benchmark only: http://127.0.0.1:${port}/login.html`));
