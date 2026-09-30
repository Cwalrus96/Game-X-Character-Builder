// Injected only by serve.mjs. Observes real UI events; does not invoke app actions.
(() => {
  const page=location.pathname, tasks=[], rows=[];
  let sequence=0, pendingSave=null, readyRecorded=false;
  try{new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});}catch{}
  const round=n=>Math.round(n*10)/10;
  const status=()=>document.querySelector('#status')?.textContent?.trim()||document.querySelector('#sheetSaveStatus')?.textContent?.trim()||'';
  function emit(id,start,end,extra={}){
    const overlaps=tasks.filter(t=>t.start<end&&t.start+t.duration>start);
    const row={id,page,sequence:++sequence,at:new Date().toISOString(),durationMs:round(end-start),status:status(),longTaskCount:overlaps.length,longTaskMs:round(overlaps.reduce((n,t)=>n+t.duration,0)),...extra};
    rows.push(row);
    const out=document.querySelector('#benchmarkResults'); if(out)out.textContent=JSON.stringify(rows.slice(-5),null,2);
    fetch('/__benchmark/results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row),keepalive:true});
  }
  const twoFrames=fn=>requestAnimationFrame(()=>requestAnimationFrame(fn));
  function eventId(target){
    return target.id||target.getAttribute('data-technique-key')||target.getAttribute('data-field')||target.closest('[data-attr]')?.getAttribute('data-attr')||target.getAttribute('aria-label')||target.name||target.tagName;
  }
  function trackInteraction(e){
    if(!e.isTrusted||e.target.closest('#benchmarkPanel'))return;
    const target=e.target, start=performance.now();
    twoFrames(()=>emit(`${e.type}:${eventId(target)}`,start,performance.now(),{
      completion:'two animation frames after event capture; includes synchronous handlers and next-frame work',
      dialogOpen:!!document.querySelector('dialog[open]'),
    }));
  }
  document.addEventListener('change',trackInteraction,true);
  document.addEventListener('click',e=>{
    const button=e.target.closest('button');
    if(button?.id==='saveBtn'){
      pendingSave={id:'builder-save',start:performance.now(),sawPending:false};
    }
    const link=e.target.closest('a[href]');
    if(link&&link.origin===location.origin&&!link.hash){
      sessionStorage.setItem('benchmarkNavigation',JSON.stringify({start:performance.timeOrigin+performance.now(),from:page,to:link.pathname}));
    }
    if(button&&!button.closest('#benchmarkPanel'))trackInteraction(e);
  },true);
  document.addEventListener('keydown',e=>{
    if(e.isTrusted&&e.target.id==='hpcur'&&e.key==='Enter'){
      pendingSave={id:'hp-enter-to-saved',start:performance.now(),sawPending:false};trackInteraction(e);
    }
  },true);
  function check(){
    const text=status();
    if(pendingSave){
      const sheet=document.querySelector('#sheetSaveStatus');
      if(text.startsWith('Saving')||text.includes('Unsaved')||sheet?.dataset.state==='dirty')pendingSave.sawPending=true;
      if(pendingSave.sawPending&&/^Saved\.?$/.test(text)){
        const completed=pendingSave;pendingSave=null;
        twoFrames(()=>emit(completed.id,completed.start,performance.now(),{completion:'Saved status plus two animation frames'}));
      }
    }
    if(readyRecorded)return;
    const isBuilder=page.includes('/builder/');
    const isSheet=page==='/character-sheet.html';
    const ready=isBuilder?!!document.querySelector('#saveBtn')&&/^(Ready\.|Review needed\.)$/.test(text):
      isSheet?!!document.querySelector('#hpcur:not([disabled])')&&/^Saved\.?$/.test(text)&&document.querySelector('#selectedTechniquesFromBuilder')?.children.length>0:false;
    if(!ready)return;
    readyRecorded=true;
    twoFrames(()=>{
      const end=performance.now(), nav=performance.getEntriesByType('navigation')[0];
      emit('page-ready',0,end,{completion:'ready UI plus two animation frames',navigationType:nav?.type,domContentLoadedMs:round(nav?.domContentLoadedEventEnd||0),loadMs:round(nav?.loadEventEnd||0),userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},resources:performance.getEntriesByType('resource').filter(r=>r.name.includes('/data/game-x/')||r.name.includes('local-review')).map(r=>({path:new URL(r.name).pathname,durationMs:round(r.duration),transferBytes:r.transferSize,decodedBytes:r.decodedBodySize}))});
      const previous=JSON.parse(sessionStorage.getItem('benchmarkNavigation')||'null');
      sessionStorage.removeItem('benchmarkNavigation');
      if(previous?.to===page)emit('page-switch',previous.start-performance.timeOrigin,end,{from:previous.from,completion:'link click through destination ready; includes source save if invoked'});
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const panel=document.createElement('details');panel.id='benchmarkPanel';
    panel.innerHTML='<summary>Local benchmark measurements</summary><pre id="benchmarkResults"></pre>';
    panel.style.cssText='margin:24px;padding:12px;background:white;color:black;border:1px solid #999;font:12px monospace;';
    document.body.append(panel);
    new MutationObserver(check).observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});
    check();
  });
})();
