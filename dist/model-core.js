/* Feature specification is exported by the offline builder in meta.feature_spec.
   All M3 paths use this implementation, checked against 50 Python feature probes. */
(function (global) {
  const clamp = (v,a,b) => Math.min(b,Math.max(a,v));
  function kernel(delay,spec) {
    const k=Array.from({length:spec.kernel_days},(_,lag)=>lag>=delay?Math.exp(-(lag-delay)/Math.max(2,delay/2)):0);
    const sum=k.reduce((a,b)=>a+b,0); return k.map(v=>v/sum);
  }
  function delayedRain(raw,impervious,delay,spec) {
    const k=kernel(delay,spec);
    return raw.map((_,i)=>k.reduce((sum,v,lag)=>sum+(i>=lag?raw[i-lag]*(1-impervious)*v:0),0));
  }
  function features(m,prev,volume,rain,supply,demand,spec) {
    return [1,prev,(volume-m.volume_center)/m.volume_scale,rain/m.rain_scale,(1-supply)/spec.supply_scale,demand-1];
  }
  function width(m,day,confidence=80) {
    const q=Math.min(day,30);
    return (confidence===95?1.96:1.282)*Math.max(m.residual_sigma*Math.sqrt(q)*1.35,.35+.035*q)*m.interval_multiplier*Math.sqrt(Math.max(day,30)/30);
  }
  function calendarIndex(cal,date) {
    let md=date.toISOString().slice(5,10); if(md==='02-29')md='02-28'; return cal.month_day.indexOf(md);
  }
  function futureDrivers(data,well,days,pumping='typical',rainfall='typical') {
    const raw=[...data.drivers.rainfall], inputs=[];
    for(let day=1;day<=days;day++) {
      const date=new Date(data.meta.end_date+'T00:00:00Z'); date.setUTCDate(date.getUTCDate()+day);
      const i=calendarIndex(data.calendar,date);
      raw.push(data.calendar.rainfall[i]*{dry:.6,typical:1,wet:1.4}[rainfall]);
      inputs.push({volume:well.model.average_volume_m3*{low:.75,typical:1,high:1.25}[pumping]*(1+.08*Math.sin(day*2*Math.PI/7)),supply:data.calendar.supply[i],demand:data.calendar.demand[i]});
    }
    const rain=delayedRain(raw,well.impervious_fraction,well.model.delay_days,data.meta.feature_spec);
    return inputs.map((v,i)=>({...v,effectiveRain:rain[data.drivers.rainfall.length+i]}));
  }
  function forecast(data,well,days,pumping='typical',rainfall='typical',confidence=80) {
    const spec=data.meta.feature_spec, m=well.model, drivers=futureDrivers(data,well,days,pumping,rainfall);
    let level=m.latest_observed_m_bgs,prev=well.history.observed.at(-1)-well.history.observed.at(-2);
    const points=[{day:0,mean:level,low:level,high:level}];
    drivers.forEach((d,i)=>{
      const x=features(m,prev,d.volume,d.effectiveRain,d.supply,d.demand,spec);
      const delta=clamp(x.reduce((a,v,j)=>a+v*m.beta[j],0),-spec.delta_clip,spec.delta_clip);
      level=clamp(level+delta,0,well.construction_depth_m-1);prev=delta;
      const w=width(m,i+1,confidence);points.push({day:i+1,mean:level,low:Math.max(0,level-w),high:Math.min(well.construction_depth_m,level+w)});
    });return points;
  }
  global.BorewellCore={features,delayedRain,width,futureDrivers,forecast,calendarIndex};
})(globalThis);
