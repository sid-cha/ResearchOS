import {createCaseStore} from './cases.mjs';

function respond(res,status,data,extra={}){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});
 res.end(JSON.stringify(data));
}
async function body(req){
 const parts=[];let length=0;
 for await(const chunk of req){length+=chunk.length;if(length>64*1024)throw Object.assign(new Error('Request exceeds 64KB'),{status:413});parts.push(chunk);}
 try {const data=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!data||Array.isArray(data)||typeof data!=='object')throw Error('not an object');return data;}
 catch {throw Object.assign(new Error('Request must contain a JSON object'),{status:400});}
}
export function createCaseApi({filename,store=createCaseStore(filename)}={}){
 return async function handle(req,res,u){
  if(u.pathname!=='/api/cases'&&!u.pathname.startsWith('/api/cases/'))return false;
  try {
   const parts=u.pathname.split('/').filter(Boolean);const id=parts[2],action=parts[3];
   if(!id && req.method==='GET'){
    const status=u.searchParams.get('status')||'ALL';if(!['ALL','OPEN','IN_REVIEW','NEEDS_EVIDENCE','CLOSED'].includes(status))return respond(res,400,{error:'Unsupported status'}),true;
    respond(res,200,{cases:await store.list({status,search:(u.searchParams.get('search')||'').slice(0,100)})});
   }else if(!id && req.method==='POST')respond(res,201,await store.create(await body(req)));
   else if(id && !action && req.method==='GET')respond(res,200,await store.get(id));
   else if(id && !action && req.method==='PATCH')respond(res,200,await store.update(id,await body(req)));
   else if(id && action==='notes' && req.method==='POST')respond(res,201,await store.addNote(id,await body(req)));
   else if(id && action==='evidence' && req.method==='POST')respond(res,201,await store.addEvidence(id,await body(req)));
   else if(id && action==='export' && req.method==='GET')respond(res,200,await store.get(id),{'Content-Disposition':`attachment; filename="investigation-${id}.json"`});
   else respond(res,405,{error:'Method not allowed for case resource'});
  }catch(e){respond(res,e.status||500,{error:e.status?e.message:'Investigation storage error; inspect server logs.'});if(!e.status)console.error('[cases]',e);}
  return true;
 };
}
