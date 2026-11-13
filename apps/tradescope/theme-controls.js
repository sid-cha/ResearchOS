/* Accessibility-first terminal preferences, persisted on the same origin. */
(()=>{
'use strict';
const root=document.documentElement;
const KEY='tradescope.theme.v1',DENSE='tradescope.density.v1';
const themes=['dark','light'];
let stored;try{stored=localStorage.getItem(KEY)}catch{}
const theme=themes.includes(stored)?stored:(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');
function apply(t,persist=true){root.dataset.theme=t;root.style.colorScheme=t;const button=document.getElementById('themeToggle');if(button){button.setAttribute('aria-label',`Switch to ${t==='dark'?'light':'dark'} theme`);button.setAttribute('aria-pressed',String(t==='light'));button.textContent=t==='dark'?'☀  LIGHT':'◐  DARK';}const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=t==='dark'?'#0c121a':'#f3f6fa';if(persist)try{localStorage.setItem(KEY,t)}catch{}}
function density(value,persist=true){root.dataset.density=value;const b=document.getElementById('densityToggle');if(b){b.textContent=value==='compact'?'▤  COMPACT':'▦  COMFORT';b.setAttribute('aria-pressed',String(value==='compact'));}if(persist)try{localStorage.setItem(DENSE,value)}catch{}}
const initialDensity=(()=>{try{return localStorage.getItem(DENSE)==='comfortable'?'comfortable':'compact'}catch{return 'compact'}})();
apply(theme,false);density(initialDensity,false);
document.getElementById('themeToggle')?.addEventListener('click',()=>apply(root.dataset.theme==='dark'?'light':'dark'));
document.getElementById('densityToggle')?.addEventListener('click',()=>density(root.dataset.density==='compact'?'comfortable':'compact'));
window.TradeScopeTheme=Object.freeze({set:apply,get:()=>root.dataset.theme});
})();
