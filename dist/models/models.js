const $=id=>document.getElementById(id), NS='http://www.w3.org/2000/svg';
const state={data:null,well:null,real:[],rain:null};
const colors={M1:'#d66635',M2:'#8a55b5',M3:'#087d76',persistence:'#999',linear60:'#ba9b22',M1_static:'#58768c',truth:'#3b78c8',observed:'#142521'};
const names={M1:'M1 · Real-data trend',M2:'M2 · Rainfall scenario',M3:'M3 · 450-well driver',persistence:'Persistence baseline',linear60:'60-day linear baseline',M1_static:'M1 on static readings'};
const fmt=(v,n=3)=>v==null?'—':Number(v).toFixed(n);
const title=s=>s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
async function gzipData(url) {
  const response=await fetch(url); if(!response.ok)throw Error('Could not load comparison data.');
  return JSON.parse(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text());
}
function el(n,a={},text='') { const e=document.createElementNS(NS,n);Object.entries(a).forEach(([k,v])=>e.setAttribute(k,v));if(text)e.textContent=text;return e; }
function chart(id,series,options={}) {
  const svg=$(id), W=1040,H=440,l=74,r=26,t=26,b=50;
  svg.replaceChildren(el('title',{id:id+'Title'},options.title||'Water-level comparison'),el('desc',{id:id+'Desc'},options.desc||'Depth in metres below ground. Larger depths plot lower.'));
  const points=series.flatMap(s=>s.values.map((v,i)=>({x:s.days?s.days[i]:i+1,y:v}))),xx=points.map(p=>p.x);
  const vals=points.map(p=>p.y).concat(series.flatMap(s=>s.low?s.low.concat(s.high):[]));
  let min=Math.min(...vals),max=Math.max(...vals);const pad=Math.max((max-min)*.1,options.error?.05:1);min=Math.max(0,min-pad);max+=pad;
  const minX=options.minX??Math.min(...xx),maxX=options.maxX??Math.max(...xx),x=v=>l+(v-minX)/(maxX-minX)*(W-l-r),y=v=>options.error?H-b-(v-min)/(max-min)*(H-t-b):t+(v-min)/(max-min)*(H-t-b);
  const path=(v,days)=>v.map((p,i)=>`${i?'L':'M'}${x(days?days[i]:i+1).toFixed(2)},${y(p).toFixed(2)}`).join(' ');
  for(let i=0;i<=4;i++) {const v=min+(max-min)*i/4,yy=y(v);svg.append(el('line',{x1:l,x2:W-r,y1:yy,y2:yy,class:'grid-line'}),el('text',{x:l-10,y:yy+4,'text-anchor':'end',class:'axis-label'},fmt(v,1)+' m'));}
  const ticks=options.ticks||[minX,minX+(maxX-minX)/2,maxX].map(v=>({v,label:Math.round(v)+'d'}));
  ticks.forEach(({v,label},i)=>svg.append(el('text',{x:x(v),y:H-17,'text-anchor':i===0?'start':i===ticks.length-1?'end':'middle',class:'axis-label'},label)));
  series.forEach(s=>{const color=colors[s.id]||'#142521';
    if(s.low) {const days=s.days||s.values.map((_,i)=>i+1);svg.append(el('path',{d:path(s.low,days)+' '+path([...s.high].reverse(),[...days].reverse()).replace(/^M/,'L')+' Z',fill:color,'fill-opacity':.12}));}
    svg.append(el('path',{d:path(s.values,s.days),fill:'none',stroke:color,'stroke-width':s.id==='truth'?3.5:2.5,'stroke-dasharray':s.id==='persistence'?'6 5':'','vector-effect':'non-scaling-stroke'}));
  });
  if(minX<0)svg.append(el('line',{x1:x(0),x2:x(0),y1:t,y2:H-b,class:'split-line'}));
}
function calculateMetrics(wells,key) {
  let sum=0,sq=0,bias=0,inside=0,width=0,n=0,hasBand=true;
  for(const w of wells){const m=w.models[key];if(!m.low80)hasBand=false;
    w.truth.forEach((truth,i)=>{const e=m.pred[i]-truth;sum+=Math.abs(e);sq+=e*e;bias+=e;n++;
      if(m.low80){inside+=truth>=m.low80[i]&&truth<=m.high80[i]?1:0;width+=(m.high80[i]-m.low80[i])/2;}
    });
  }
  const round=v=>Math.round(v*1000)/1000;
  return {mae_m:round(sum/n),rmse_m:round(Math.sqrt(sq/n)),bias_m:round(bias/n),coverage_80_pct:hasBand?round(inside/n*100):null,mean_halfwidth_m:hasBand?round(width/n):null,n};
}
window.calculateBorewellMetrics=calculateMetrics;
const FRIENDLY={
  M1:{name:'Trend from pump-start readings',rows:[['What it uses','The level recorded when each pump starts, as a daily median'],['What it predicts','Where the well\'s recent trend leads'],['How it was tested','On real wells for short-term changes (Stage 1), and here on the test system'],['Strength','Works today with the company\'s existing records, and is easy to explain'],['Weakness','Pump-start readings are affected by recent pumping, so they sit too deep'],['Best use','A quick fallback where little data exists']]},
  M2:{name:'Trend plus rainfall',rows:[['What it uses','The same as M1, plus public rainfall records'],['What it predicts','The trend, nudged by how wet the season is'],['How it was tested','The same tests as M1'],['Strength','Uses free public data and shows seasonal what-ifs'],['Weakness','Adds little when the underlying readings are off'],['Best use','Seasonal what-if planning']]},
  M3:{name:'Driver model',rows:[['What it uses','Resting-level readings, pumping volume, past rainfall, water supply and demand'],['What it predicts','Each day\'s change in the resting level'],['How it was tested','A 30-day hidden-truth test on the 450 simulated wells'],['Strength','Learns that rain arrives with a delay, and its pumping and rain settings behave sensibly'],['Weakness','Only tested on simulated data so far; cannot see a drifting sensor'],['Best use','The target system, once real long-term data is available']]}};
function modelCards() {
  $('modelCards').innerHTML=state.data.models.map(m=>{const f=FRIENDLY[m.id]||{name:m.name,rows:[]};return `<article class="model-card" style="--model-color:${colors[m.id]}"><p class="section-kicker">${m.id}</p><h2>${f.name}</h2><dl>${f.rows.map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl></article>`;}).join('');
  const m=state.data.fleet_metrics.excluding_sensor_drift;
  $('takeaway').textContent=`Most of the gain comes from better readings. Using resting levels instead of pump-start levels cut the average error from ${fmt(m.M1.mae_m,1)} m to ${fmt(m.M1_static.mae_m,1)} m. Adding pumping, rain and supply information cut it to ${fmt(m.M3.mae_m,1)} m. (These figures leave out the wells with deliberately faulty sensors.)`;
}
function populateWells() {
  const filter=$('scenarioSelect').value;
  const ww=state.data.wells.filter(w=>!filter||w.scenario===filter);
  $('wellOptions').innerHTML=ww.map(w=>`<option value="${w.id}">${title(w.scenario)}</option>`).join('');
  if(!ww.some(w=>w.id===$('wellInput').value))$('wellInput').value=ww[0].id;
}
function renderWell(event) {
  event?.preventDefault();const id=$('wellInput').value.trim().toUpperCase(),w=state.data.wells.find(w=>w.id===id);
  if(!w){$('formError').textContent='Choose a well from SYN001 to SYN450.';return;}
  state.well=w;$('formError').textContent='';$('wellTitle').textContent=`${w.id} · ${title(w.scenario)} · 30-day holdout`;
  const series=[{id:'observed',values:w.history,days:w.history.map((_,i)=>i-59)},{id:'truth',values:w.truth}];
  for(const key of ['M1','M2','M3','persistence']) {const m=w.models[key];series.push({id:key,values:m.pred,...(key!=='persistence'&&$('band'+key).checked?{low:m.low80,high:m.high80}:{})});}
  chart('holdoutChart',series,{title:w.id+' held-out predictions and hidden truth',minX:-59,maxX:30,ticks:[{v:-59,label:'60d training'},{v:0,label:'Test starts'},{v:15,label:'15d'},{v:30,label:'30d'}]});
  $('checkpointRows').innerHTML=[7,15,30].map(day=>`<tr><td>${day}</td><td>${fmt(w.truth[day-1],2)} m</td>${['M1','M2','M3'].map(k=>`<td>${fmt(w.models[k].pred[day-1],2)} / ${fmt(w.models[k].pred[day-1]-w.truth[day-1],2)} m</td>`).join('')}</tr>`).join('');
  chart('forwardChart',['M1','M2','M3'].map(k=>({id:k,values:w.forward[k]})),{title:w.id+' six-month forward scenarios',desc:'Three future scenarios. There is no future truth or validated long-term accuracy.',ticks:[{v:1,label:'30 Jun'},{v:92,label:'3 months'},{v:183,label:'6 months'}]});
  const url=new URL(location.href);url.searchParams.set('well',w.id);history.replaceState(null,'',url);
}
function renderErrors() {
  const group=$('excludeDrift').checked?'excluding_sensor_drift':'all',ww=state.data.wells.filter(w=>group==='all'||w.scenario!=='sensor_drift');
  const keys=['M1','M2','M3','M1_static','persistence','linear60'];
  $('fleetRows').innerHTML=keys.map(k=>{const m=calculateMetrics(ww,k);return `<tr><td>${names[k]}</td><td>${fmt(m.mae_m)} m</td><td>${fmt(m.rmse_m)} m</td><td>${fmt(m.bias_m)} m</td><td>${m.coverage_80_pct==null?'—':fmt(m.coverage_80_pct,1)+'%'}</td><td>${m.mean_halfwidth_m==null?'—':fmt(m.mean_halfwidth_m)+' m'}</td><td>${m.n.toLocaleString()}</td></tr>`;}).join('');
  const m=calculateMetrics(ww,'M3');$('bandNotice').textContent=`M3’s nominal 80% interval was calibrated to 80% on days 121–150. It covers ${fmt(m.coverage_80_pct,1)}% in the untouched final test, with ${fmt(m.mean_halfwidth_m,2)} m mean half-width. This undercoverage shows that calibration did not transfer fully to the later rainfall regime; do not interpret it as an achieved 80% guarantee.`;
  chart('leadChart',keys.map(k=>({id:k,values:state.data.horizon_mae[group][k]})),{title:'Mean absolute error by prediction lead day',desc:'Absolute errors in metres for each method, on days one to thirty.',error:true});
  const scenarios=Object.keys(state.data.scenario_metrics[group].M3);
  $('scenarioRows').innerHTML=scenarios.map(sc=>`<tr><td>${title(sc)}</td>${keys.map(k=>{const mae=state.data.scenario_metrics[group][k][sc].mae_m;return `<td style="background:rgba(255,128,104,${Math.min(.5,mae/12)})">${fmt(mae)} m</td>`;}).join('')}</tr>`).join('');
  $('winShares').innerHTML=['M1','M2','M3'].map(k=>`<span><strong>${k}</strong> ${fmt(state.data.win_share[group][k],1)}%</span>`).join('');
}
function matrix() {
 const rr=[['Data required','Pump-start sessions and cycle summaries','M1 + rainfall and location','Static levels + volume, raw rain, supply, demand'],['Available today?','Yes, after screening','Yes, city-centre proxy','Synthetic only; missing real contract'],['Horizon supported','Any input; long paths heuristic','Any input; seasonal what-if','30-day synthetic test; longer paths extrapolated'],['Validated on','Real transitions; synthetic static target here','Real rainfall transition test; synthetic target here','Synthetic daily static levels only'],['Pumping scenarios','Heuristic cycle sensitivity','Same M1 sensitivity','Nonnegative fitted volume coefficient'],['Rainfall delay','No explicit delay','Lagged real transition experiment; scenario has no fitted lag','Kernel delay learned on observed inner window'],['Dynamic vs static','Pump starts may retain drawdown','Cannot remove M1 target mismatch','Requires static input protocol'],['Sensor drift','Not resolved','Not resolved','Not resolved; sensor-drift group exposes failure'],['Uncertainty honesty','Broad uncalibrated heuristic','Broad uncalibrated heuristic','Inner calibrated; final undercoverage reported; >30d √h extrapolation'],['Interpretability','Theil–Sen + fleet shrinkage + log decay','Bounded rainfall adjustment','Sign-constrained daily-change ridge'],['Best use','Existing-data fallback and direction','Seasonal rainfall what-if','Candidate for real holdout validation'],['Main weakness','Only 15 real days; dynamic bias','Little real gain; shared rain proxy','Synthetic assumptions; unknown future drivers']];
 $('matrixRows').innerHTML=rr.map(r=>'<tr>'+r.map(t=>'<td>'+t+'</td>').join('')+'</tr>').join('');
}
function renderReal(event) {
 event?.preventDefault();$('realError').textContent='';
 const w=state.real.find(w=>w.well_id===$('realWell').value.trim().toUpperCase()),days=Number($('realDays').value);
 if(!w||!Number.isFinite(days)||days<1||days>36525){$('realError').textContent='Choose a real well and a horizon from 1 to 36,525 days.';return;}
 if(w.latest_start_level_m_bgs==null||Number(w.sessions_screened_usable)===0){$('realError').textContent=w.latest_start_level_m_bgs==null?'No readings for this well.':'No reading passed quality screening for this well.';$('realResult').textContent='';$('realChart').replaceChildren();return;}
 const cycles=clamp(w.usable_cycle_transitions/Math.max(w.active_days_usable,1),0,4),pumpSens=clamp(Math.max(w.median_pumping_change_m||0,0)*Math.max(cycles,.5)*.02,.02,.5),rainSens=clamp(Math.abs(Math.min(w.median_off_period_change_m||0,0))*Math.max(cycles,.5)*.02,.02,.5);
 const shift={low:-1,typical:0,high:1}[$('realPump').value]*pumpSens,trend=(w.shrunk_forecast_trend_m_per_day||0)+shift;
 const pbar=state.rain.monthly_climatology.reduce((s,m)=>s+m.median_monthly_mm,0)/365.25,scale=Math.max(pbar*1.6,2.25),z=Number($('realConfidence').value)===95?1.96:1.282;
 const vals1=[],vals2=[],low1=[],high1=[],low2=[],high2=[],allDays=[];let cum=0;
 const start=new Date(String(w.latest_start_time).slice(0,10)+'T00:00:00Z'),mae={higher:11.5,medium:18,low:28}[w.evidence_tier];
 for(let d=0;d<=Math.ceil(days);d++) {
  const date=new Date(start);date.setUTCDate(date.getUTCDate()+d);const month=state.rain.monthly_climatology[date.getUTCMonth()],field={dry:'dry_q25_monthly_mm',typical:'median_monthly_mm',wet:'wet_q75_monthly_mm'}[$('realRain').value];
  const rain=month[field]/new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  if(d)cum+=(trend-clamp((rain-pbar)/scale,-.9,1.25)*rainSens)/(1+d/30);
  if(d%Math.max(1,Math.floor(days/139))===0||d===Math.ceil(days)) {
    const p1=clamp(w.latest_start_level_m_bgs+30*trend*Math.log1p(d/30),0,500),p2=clamp(w.latest_start_level_m_bgs+cum,0,500);
    const wi=z*(mae*1.253*Math.sqrt(1+d/15)+Math.abs(shift)*4*Math.sqrt(d/15)),wi2=wi*(8.131628/8.134227)*($('realRain').value==='typical'?1:1.06);
    allDays.push(d);vals1.push(p1);vals2.push(p2);low1.push(clamp(p1-wi,0,500));high1.push(clamp(p1+wi,0,500));low2.push(clamp(p2-wi2,0,500));high2.push(clamp(p2+wi2,0,500));
  }
 }
 $('realResult').textContent=`${w.well_id} · latest usable reading ${start.toLocaleDateString('en-IN',{timeZone:'UTC'})} · ${days}-day scenario: M1 ${fmt(vals1.at(-1),1)} m; M2 ${fmt(vals2.at(-1),1)} m below ground. Both ranges are rules of thumb, not tested guarantees.`;
 chart('realChart',[{id:'M1',values:vals1,days:allDays,low:low1,high:high1},{id:'M2',values:vals2,days:allDays,low:low2,high:high2}],{title:w.well_id+' real-data seasonal scenario comparison'});
}
async function init() {
 try {
  const [data,real,rain]=await Promise.all([gzipData('../data/model_comparison.json.gz'),fetch('../data/wells.json').then(r=>r.json()),gzipData('../data/real_rainfall.json.gz')]);
  state.data=data;state.real=real.wells;state.rain=rain;window.MODEL_COMPARISON=data;
  const options=[...new Set(data.wells.map(w=>w.scenario))];$('scenarioSelect').innerHTML='<option value="">All scenarios</option>'+options.map(s=>`<option value="${s}">${title(s)}</option>`).join('');
  const requested=new URLSearchParams(location.search).get('well');if(data.wells.some(w=>w.id===requested))$('wellInput').value=requested;
  populateWells();modelCards();matrix();renderWell();renderErrors();
  $('realOptions').innerHTML=real.wells.map(w=>`<option value="${w.well_id}">${w.latest_start_level_m_bgs==null?'No readings':Number(w.sessions_screened_usable)===0?'No screened readings':w.evidence_tier+' evidence'}</option>`).join('');renderReal();
  $('scenarioSelect').addEventListener('change',()=>{populateWells();renderWell();});$('comparisonForm').addEventListener('submit',renderWell);
  ['bandM1','bandM2','bandM3'].forEach(id=>$(id).addEventListener('change',renderWell));$('excludeDrift').addEventListener('change',renderErrors);$('realForm').addEventListener('submit',renderReal);
  if(document.modelContext?.registerTool)await document.modelContext.registerTool({name:'compare_borewell_models',title:'Compare borewell models',description:'Compare M1, M2 and M3 on a synthetic well’s held-out static levels. Returns per-well metrics and the selected fleet context.',inputSchema:{type:'object',properties:{well_id:{type:'string'},excl_sensor_drift:{type:'boolean'}},required:['well_id','excl_sensor_drift'],additionalProperties:false},execute(input){const w=data.wells.find(w=>w.id===String(input.well_id).toUpperCase());if(!w)throw Error('Unknown synthetic well.');$('wellInput').value=w.id;$('excludeDrift').checked=input.excl_sensor_drift;renderWell();renderErrors();return {well_id:w.id,scenario:w.scenario,included_in_fleet:!input.excl_sensor_drift||w.scenario!=='sensor_drift',models:Object.fromEntries(['M1','M2','M3'].map(k=>[k,w.models[k].metrics])),fleet:data.fleet_metrics[input.excl_sensor_drift?'excluding_sensor_drift':'all']};}});
 }catch(e){$('formError').textContent=e.message;$('takeaway').textContent='The comparison could not be loaded.';console.error(e);}
}
init();
