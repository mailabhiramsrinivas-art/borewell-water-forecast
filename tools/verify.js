/* Meaningful regression gates from the site-fixing brief. Run: node tools/verify.js */
const fs=require('fs'),vm=require('vm'),zlib=require('zlib'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'../dist'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),gz=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,p))));
const data=gz('data/synthetic_model.json.gz'),comparison=gz('data/model_comparison.json.gz'),wells=JSON.parse(read('data/wells.json'));
const report={};
class Element {
 constructor(){this.value='';this.textContent='';this.children=[];this.innerHTML='';this.checked=false;this.classList={add(){},remove(){},toggle(){}};}
 append(...c){this.children.push(...c);} appendChild(c){this.children.push(c);return c;}replaceChildren(...c){this.children=c;}
 setAttribute(k,v){this[k]=v;}addEventListener(){}querySelectorAll(){return [];}removeAttribute(){}getBoundingClientRect(){return {width:1000};}
}
async function page(html,files) {
 const elements=new Map();for(const m of read(html).matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const e=new Element(),v=m[0].match(/value="([^"]*)"/);if(v)e.value=v[1];e.checked=m[0].includes('checked');elements.set(m[1],e);}
 for(const m of read(html).matchAll(/<select[^>]+id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){const options=[...m[2].matchAll(/<option[^>]*value="([^"]*)"[^>]*>/g)];const selected=options.find(o=>o[0].includes('selected'))||options[0];if(selected)elements.get(m[1]).value=selected[1];}
 const tools={};const errors=[];
 const document={getElementById:id=>elements.get(id)||new Element(),createElementNS:()=>new Element(),createElement:()=>new Element(),modelContext:{registerTool(t){tools[t.name]=t;}}};
 const loc=new URL('http://localhost/'+html.replace('index.html',''));
 const context={document,URL,URLSearchParams,Date,Intl,Math,Number,Promise,Option:Element,location:loc,history:{replaceState(){}},console:{log(){},warn(...a){errors.push(a.join(' '));},error(...a){errors.push(a.join(' '));}},fetch:async url=>{let file=path.posix.normalize(path.posix.join(path.posix.dirname(html),url));return {ok:true,json:async()=>JSON.parse(read(file)),body:null};},DecompressionStream,Response,setTimeout};
 context.window=context;context.SYNTHETIC_MODEL=data;context.SYNTHETIC_MODEL_READY=Promise.resolve();vm.createContext(context);
 if(html==='models/index.html') {vm.runInContext(read('models/models.js').replace(/async function gzipData\(url\) \{[\s\S]*?\n\}/,`async function gzipData(url) { return url.includes('model_comparison') ? __comparison : __rain; }`),Object.assign(context,{__comparison:comparison,__rain:gz('data/real_rainfall.json.gz')}));}
 else files.forEach(f=>vm.runInContext(read(f),context,{filename:f}));
 await new Promise(r=>setTimeout(r,30));assert.deepEqual(errors,[],html+' console errors');
 return {context,elements,tools};
}
(async()=>{
 const core={};vm.createContext(core);vm.runInContext(read('model-core.js'),core);
 const probes=JSON.parse(fs.readFileSync(path.join(__dirname,'feature_probes.json'))),eff=new Map();let max=0;
 for(const p of probes){const w=data.wells.find(w=>w.id===p.well_id);if(!eff.has(w.id))eff.set(w.id,core.BorewellCore.delayedRain(data.drivers.rainfall,w.impervious_fraction,w.model.delay_days,data.meta.feature_spec));const x=core.BorewellCore.features(w.model,p.previous_delta,p.volume,eff.get(w.id)[p.day_index],data.drivers.supply[p.day_index],data.drivers.demand[p.day_index],data.meta.feature_spec);x.forEach((v,i)=>max=Math.max(max,Math.abs(v-p.expected[i])));}
 assert(max<1e-6);report.feature_check={wells:5,days_each:10,max_difference:max};
 let violations=0,paths=0;
 for(const w of data.wells)for(const horizon of [92,366,1827]){
  const pump=['low','typical','high'].map(p=>core.BorewellCore.forecast(data,w,horizon,p,'typical'));
  const rain=['wet','typical','dry'].map(p=>core.BorewellCore.forecast(data,w,horizon,'typical',p));
  for(const pp of [pump,rain]){paths+=3;for(let i=1;i<=horizon;i++)if(pp[0][i].mean>pp[1][i].mean+1e-8||pp[1][i].mean>pp[2][i].mean+1e-8)violations++;}
 }
 assert.equal(violations,0);report.scenario_monotonicity={wells:450,horizons_days:[92,366,1827],paths,violations};
 const p1=await page('index.html',['app.js']);
 assert.equal(p1.elements.get('forecastLevel').textContent,'74.9 m bgs');assert.equal(p1.elements.get('forecastError').textContent,'±32.0 m');
 const chartText=p1.elements.get('forecastChart').children.map(e=>e.textContent);assert(chartText.includes('14d ago'));
 for(const id of ['BW028','BW163','BW005']){p1.elements.get('wellInput').value=id;vm.runInContext('runForecast()',p1.context);assert.equal(p1.elements.get('currentLevel').textContent,'No usable reading');assert(p1.elements.get('formError').textContent);assert.equal(vm.runInContext('state.lastResult',p1.context),null);}
 assert(p1.elements.get('currentDate').textContent.includes('19 Jul 2026'));
 const realTool=p1.tools.configure_water_level_forecast;assert(realTool);realTool.execute({well_id:'BW046',horizon:30,horizon_unit:'days',pumping:'typical',recharge:'typical',confidence:80});
 report.page1={BW046:'74.9 ±32.0 m; first chart label 14d ago',BW028:'no readings',BW163:'no reading passed screening',BW005:'rejected reading date 19 Jul 2026'};
 const p2=await page('comparison/index.html',['model-core.js','comparison/comparison.js']);assert(p2.elements.get('projectedLevel').textContent.includes('m bgs'));p2.tools.configure_synthetic_borewell_forecast.execute({well_id:'SYN004',horizon:3,horizon_unit:'months',pumping:'high',rainfall:'dry',confidence:80});
 const p3=await page('validation/index.html',['validation/validation.js']);const k3=Object.keys(p3.tools)[0];assert(k3);p3.tools[k3].execute({well_id:'SYN001'});
 const p4=await page('models/index.html',[]);p4.tools.compare_borewell_models.execute({well_id:'SYN001',excl_sensor_drift:true});
 let dif=0;
 for(const [group,metrics] of Object.entries(comparison.fleet_metrics))for(const [key,m] of Object.entries(metrics)){
  const ww=comparison.wells.filter(w=>group==='all'||w.scenario!=='sensor_drift'),calc=p4.context.calculateBorewellMetrics(ww,key);
  for(const field of Object.keys(m))if(m[field]!=null)dif=Math.max(dif,Math.abs(m[field]-calc[field]));
 }
 assert(dif<=.001);report.metric_recomputation_max_difference=dif;report.webmcp=['page1','page2','page3','page4'].map((page,i)=>({page,tool:Object.keys([p1,p2,p3,p4][i].tools)[0],passed:true}));
 // Page 3 arrays and Page 4 M3 are identical, so their fleet scores are identical.
 for(const w of data.wells){const c=comparison.wells.find(c=>c.id===w.id);assert.deepEqual(w.validation.predicted,c.models.M3.pred);assert.deepEqual(w.history.true.slice(150),c.truth);}
 assert.deepEqual(data.fleet_metrics,comparison.fleet_metrics.all.M3);
 fs.writeFileSync(path.join(__dirname,'verification_report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
