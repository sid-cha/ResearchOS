import {createCaseStore} from './cases.mjs';
import {buildBrief,interpretQuestion,askModel} from './assistant.mjs';
const respond=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
async function readJSON(req){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>4096)throw Object.assign(Error('Question too long'),{status:413});chunks.push(c)}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(Error('Expected JSON body'),{status:400})}}
export function createAssistantApi({filename,store=createCaseStore(filename),env=process.env,fetchImpl=fetch}={}){
 return async function handle(req,res,u){
  const m=/^\/api\/assistant\/cases\/([a-zA-Z0-9-]{1,100})\/(brief|ask)$/.exec(u.pathname);if(!m)return false;
  try{
   const [,id,action]=m;
   if(action==='brief' && req.method==='GET'){
    const focus=u.searchParams.get('focus')||'overview';const result=buildBrief(await store.get(id),focus);respond(res,200,{...result,mode:'EVIDENCE_ENGINE'});
   }else if(action==='ask' && req.method==='POST'){
    const payload=await readJSON(req);const question=typeof payload?.question==='string'?payload.question.trim().slice(0,600):'';
    if(!question)throw Object.assign(Error('Question is required'),{status:400});
    const focus=interpretQuestion(question);const brief=buildBrief(await store.get(id),focus);
    let generative=null,error=null;
    if(env.OPENAI_API_KEY)try{generative=await askModel({brief,question,env,fetchImpl});}catch(e){error='Model unavailable. Showing the verified evidence brief instead.';}
    respond(res,200,{...brief,mode:generative?'MODEL_ASSISTED':'EVIDENCE_ENGINE',answer:generative?.text||null,model:generative?.model||null,warning:error});
   }else respond(res,405,{error:'Method not allowed'});
  }catch(e){respond(res,e.status||400,{error:e.status?e.message:'Evidence analysis unavailable'});}
  return true;
 };
}
