(()=>{'use strict';
const $=id=>document.getElementById(id);
let selected=null,offset=0,hasMore=false,busy=false,limits=null;
const text=(id,value)=>{$(id).textContent=String(value??'—');};
async function call(op,{method='GET',body=null}={}){
 const response=await fetch('/api/market-capture/'+op,{method,cache:'no-store',
  headers:body?{'Content-Type':'application/json','X-TradeScope-Local-Capture':'1'}:{},
  body:body?JSON.stringify(body):undefined});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'Local capture request failed');
 return data;
}
function element(tag,content){const el=document.createElement(tag);if(content!==undefined)el.textContent=String(content);return el;}
function status(message){text('status',message);}
async function refresh(){
 if(busy)return;
 try{
  const x=await call('catalog');limits=x.limits;
  text('configuration',x.enabled?'Local capture available':'Capture disabled');
  text('connector',(x.configured?'Configured':'No credentials')+' · Alpaca IEX');
  text('recording',x.active?'Recording '+x.active.id:'Not recording');
  text('count',x.active?x.active.observations:'0');
  text('capacity','Max '+x.limits.maxSessions+' sessions / '+x.limits.maxRows+' records each');
  $('start').disabled=!x.enabled||!x.configured||Boolean(x.active);
  $('stop').disabled=!x.enabled||!x.active;
  status(x.enabled?'Local capture explicitly enabled; retention terms remain your responsibility.':
   'Disabled. Review your market-data provider retention rights before enabling local recording.');
  await sessions(x.enabled);
 }catch(e){status(e.message);$('start').disabled=true;$('stop').disabled=true;}
}
async function sessions(enabled){
 const box=$('sessions');box.replaceChildren();
 if(!enabled){box.append(element('p','Recording is not enabled in this local process.'));return;}
 const list=(await call('sessions')).sessions||[];
 if(!list.length){box.append(element('p','No recorded sessions. Start a capture to create one.'));return;}
 for(const s of list){
  const row=element('div');row.className='session';
  const meta=element('div');meta.append(element('strong',s.id),element('small',
   s.status+' · '+(s.observations??'?')+' observations · '+(s.interruptions??'?')+' observed interruptions'));
  const button=element('button','Verify & replay');button.className='secondary';button.disabled=!s.verified;
  button.addEventListener('click',()=>{selected=s.id;offset=0;void replay();});
  row.append(meta,button);box.append(row);
 }
}
async function replay(){
 if(!selected)return;
 try{
  const data=await call('replay?id='+encodeURIComponent(selected)+'&offset='+offset+'&limit=100');
  const rows=$('replayRows');rows.replaceChildren();
  for(const e of data.observations||[]){
   const o=e.observation||{},r=element('tr'),p=o.trade?.price??o.quote?.bidPrice??o.bar?.close??'—';
   const values=[e.sourceSequence,o.exchangeEventTime||'Unavailable',o.symbol,o.eventType,p,
    e.evaluation?.status==='evaluated'?(e.evaluation.severity+' · '+e.evaluation.ratio+'×'):
     (e.evaluation?.status||'unavailable')];
   for(const v of values)r.append(element('td',v));
   const last=r.lastElementChild;if(last)last.className='tag-'+(e.evaluation?.severity||'none');
   rows.append(r);
  }
  hasMore=data.nextOffset!==null;const total=data.total||0;
  text('replayStatus','Session '+data.id+' · '+data.status+' · '+total+' observations · hash verified: '+data.verified+
   ' · interruptions: '+data.interruptions+' · source: '+data.coverage);
  text('page',total?Math.min(total,offset+1)+'–'+Math.min(total,offset+data.observations.length)+' / '+total:'0 observations');
  $('prev').disabled=offset===0;$('next').disabled=!hasMore;
 }catch(e){text('replayStatus',e.message);}
}
async function control(op){
 if(busy)return;busy=true;$('start').disabled=$('stop').disabled=true;
 try{await call(op,{method:'POST',body:{}});await refresh();}catch(e){status(e.message);}finally{busy=false;await refresh();}
}
$('refresh').addEventListener('click',()=>void refresh());
$('start').addEventListener('click',()=>void control('start'));
$('stop').addEventListener('click',()=>void control('stop'));
$('prev').addEventListener('click',()=>{offset=Math.max(0,offset-100);void replay();});
$('next').addEventListener('click',()=>{if(hasMore){offset+=100;void replay();}});
void refresh();
})();