/* One workspace at a time, for trader-grade screen efficiency. */
(()=>{
'use strict';
const html=document.documentElement;
function switchWorkspace(nav){const view=nav==='intel'?'intel':nav==='cases'?'cases':['research','signals','screener'].includes(nav)?'research':'monitor';const previous=html.dataset.workspace;html.dataset.workspace=view;document.querySelectorAll('[data-nav]').forEach(button=>{button.setAttribute('aria-current',button.dataset.nav===nav?'page':'false');button.classList.toggle('active',button.dataset.nav===nav);});
 if(view!==previous){window.scrollTo({top:0,behavior:'instant'});}document.dispatchEvent(new CustomEvent('tradescope:workspace',{detail:{nav,view}}));}
document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>switchWorkspace(b.dataset.nav)));
document.getElementById('assistOpen')?.addEventListener('click',()=>{
 document.querySelector('[data-nav="cases"]')?.click();
 requestAnimationFrame(()=>{document.getElementById('assistPanel')?.scrollIntoView({behavior:'smooth',block:'start'});document.getElementById('assistQuestion')?.focus({preventScroll:true});});
});
switchWorkspace('monitor');
})();
