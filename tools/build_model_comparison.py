#!/usr/bin/env python3
"""Rebuild public aggregates. Never copy private real CSVs into this repository.
Usage: python3 tools/build_model_comparison.py --data-folder '/path/to/data '
Requires numpy. XLSX metadata is read with the standard-library XML reader.
All selections and interval calibration stop at day 150; the final 30 days score only.
"""
import argparse, csv, gzip, json, math, subprocess, zipfile
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
import xml.etree.ElementTree as ET
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DELAYS = [0, 1, 3, 7, 14, 21, 30, 45]
SPEC = {'version': 2, 'kernel_days': 61, 'delta_clip': .8, 'supply_scale': .2,
        'ridge_strength': 18, 'lag_candidates_days': DELAYS,
        'features': ['intercept','previous_delta','centered_volume','delayed_raw_rain','supply_shortfall','demand_excess']}

def rows(path):
    with open(path, newline='') as f: return list(csv.DictReader(f))

def workbook_metadata(path):
    """Read every well's metadata from XLSX, including cached numeric cells."""
    ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(path) as z:
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        sheets = [s.attrib['name'] for s in wb.find('s:sheets', ns)]
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            strings = [''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si', ns)]
        tree = ET.fromstring(z.read(f'xl/worksheets/sheet{sheets.index("Well Metadata")+1}.xml'))
        values = []
        for r in tree.findall('s:sheetData/s:row', ns):
            line = []
            for c in r.findall('s:c', ns):
                if c.attrib.get('t') == 'inlineStr': v = ''.join(c.find('s:is', ns).itertext())
                else:
                    e = c.find('s:v', ns); v = e.text if e is not None else ''
                    if c.attrib.get('t') == 's': v = strings[int(v)]
                line.append(v)
            values.append(line)
        return [dict(zip(values[0], v)) for v in values[1:] if v and v[0]], sheets

def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(json.dumps(obj,separators=(',',':'),allow_nan=False).encode(),compresslevel=9,mtime=0))

def rounded(a): return np.round(a,3).tolist()

def kernel(delay):
    lag = np.arange(SPEC['kernel_days']); k = np.where(lag>=delay,np.exp(-np.maximum(lag-delay,0)/max(2,delay/2)),0.)
    return k/k.sum()

def rain_series(raw, impervious, delay):
    return np.convolve(raw*(1-impervious), kernel(delay))[:len(raw)]

def feature(m, prev, vol, rain, supply, demand):
    return np.array([1,prev,(vol-m['volume_center'])/m['volume_scale'],rain/m['rain_scale'],(1-supply)/SPEC['supply_scale'],demand-1])

def prepare(d, end, delay):
    eff = rain_series(d['rain'],d['impervious'],delay)
    m = {'delay_days':delay,'volume_center':float(np.median(d['vol'][:end])),
         'volume_scale':max(float(np.std(d['vol'][:end])),1.),'rain_scale':max(float(np.std(eff[:end])),1.)}
    x = np.array([feature(m,d['obs'][i-1]-d['obs'][i-2],d['vol'][i],eff[i],d['supply'][i],d['demand'][i]) for i in range(2,end)])
    return m,x,np.diff(d['obs'])[1:end-1],eff

def fit(x,y,prior=None,strength=18):
    p = np.zeros(6) if prior is None else prior
    penalty = np.diag(np.sqrt(np.array([.25,1,1,1,1,1])*strength))
    # AR >= 0 preserves scenario ordering. Supply/demand follow extraction direction.
    h=x.T@x+penalty.T@penalty; target=x.T@y+penalty.T@penalty@p
    lower=np.array([-np.inf,0,0,-np.inf,0,0]); upper=np.array([np.inf,.98,np.inf,0,np.inf,np.inf])
    b=np.clip(np.linalg.solve(h,target),lower,upper)
    for _ in range(500):
        old=b.copy()
        for j in range(6): b[j]=np.clip((target[j]-h[j]@b+h[j,j]*b[j])/h[j,j],lower[j],upper[j])
        if np.max(abs(b-old))<1e-10: break
    return b

def rollout(m, obs, vol, eff, supply, demand, start, stop, bounded=False, depth=500):
    level = float(obs[start-1]); prev = float(obs[start-1]-obs[start-2]) if start>1 else 0.
    out=[]
    for i in range(start,stop):
        delta = float(np.clip(feature(m,prev,vol[i],eff[i],supply[i],demand[i]) @ m['beta'],-SPEC['delta_clip'],SPEC['delta_clip']))
        level = float(np.clip(level+delta,0,depth-1)) if bounded else level+delta
        out.append(level); prev=delta
    return np.array(out)

def base_width(m,h):
    h=np.asarray(h); q=np.minimum(h,30)
    return 1.282*np.maximum(m['residual_sigma']*np.sqrt(q)*1.35,.35+.035*q)*np.sqrt(np.maximum(h,30)/30)

def metric(p,t,lo=None,hi=None):
    e=np.asarray(p)-np.asarray(t)
    return {'mae_m':round(float(np.mean(abs(e))),3),'rmse_m':round(float(np.sqrt(np.mean(e*e))),3),
            'bias_m':round(float(np.mean(e)),3),'coverage_80_pct':round(float(np.mean((t>=lo)&(t<=hi))*100),3) if lo is not None else None,
            'mean_halfwidth_m':round(float(np.mean((hi-lo)/2)),3) if lo is not None else None,'n':int(e.size)}

def theil(v,x=None):
    v=np.asarray(v); x=np.arange(len(v)) if x is None else np.asarray(x)
    i,j=np.triu_indices(len(v),1)
    return float(np.median((v[j]-v[i])/(x[j]-x[i]))) if len(i) else 0.

def m1_summaries(by_session,datasets,end_day=150):
    preliminary={}
    for wid,d in datasets.items():
        ss=sorted([r for r in by_session[wid] if r['start_timestamp'][:10] <= (date(2026,1,1)+timedelta(days=end_day-1)).isoformat()],key=lambda r:r['start_timestamp'])
        usable=[]; daily=defaultdict(list); cycles=[]
        for s in ss:
            a,b,dur = [float(s[k]) for k in ['observed_start_level_m_bgs','observed_stop_level_m_bgs','duration_min']]
            ok=5<=dur<=1440 and abs(b-a)<=50 and abs(b-a)/dur<=.5 and float(s['mean_discharge_L_min'])>0
            s['ok']=ok
            if ok: usable.append(s); daily[s['start_timestamp'][:10]].append(a)
        for a,b in zip(ss,ss[1:]):
            gap=(__import__('datetime').datetime.fromisoformat(b['start_timestamp'])-__import__('datetime').datetime.fromisoformat(a['stop_timestamp'])).total_seconds()/60
            rec=float(b['observed_start_level_m_bgs'])-float(a['observed_stop_level_m_bgs'])
            if a['ok'] and b['ok'] and 0<=gap<=10080 and abs(rec)<=50: cycles.append(rec)
        days=sorted(daily); med=np.array([np.median(daily[day]) for day in days]); x=np.array([(date.fromisoformat(day)-date(2026,1,1)).days for day in days])
        slope=theil(med,x); n=len(days)
        c=np.clip(len(cycles)/max(n,1),0,4)
        sens=float(np.clip(abs(min(float(np.median(cycles)) if cycles else 0,0))*max(c,.5)*.02,.02,.5))
        evidence='higher' if len(cycles)>=20 and n>=10 else 'medium' if len(cycles)>=10 and n>=7 else 'low'
        preliminary[wid]={'slope':slope,'n':n,'latest':float(usable[-1]['observed_start_level_m_bgs']),
          'latest_day':int(x[-1]),'sensitivity':sens,'evidence':evidence}
    fleet=np.median([p['slope'] for p in preliminary.values()])
    for p in preliminary.values(): p['trend']=p['n']/(p['n']+5)*p['slope']+5/(p['n']+5)*fleet
    return preliminary

def m1_path(s,h): return np.clip(s['latest']+30*s['trend']*np.log1p(h/30),0,500)
def m1_width(s,h): return 1.282*1.253*{'higher':11.5,'medium':18,'low':28}[s['evidence']]*np.sqrt(1+h/15)
def m2_path(s,rain,pbar,offset=0):
    h=np.arange(1,len(rain)+1)+offset
    g=np.clip((rain-pbar)/max(pbar*1.6,2.25),-.9,1.25)
    initial=s['latest']+30*s['trend']*np.log1p(offset/30)
    return np.clip(initial+np.cumsum((s['trend']-g*s['sensitivity'])/(1+h/30)),0,500)

def calendar(drivers):
    rng=np.random.default_rng(20260926); rain=list(drivers['rainfall']); supply=list(drivers['supply']); demand=list(drivers['demand'])
    for day in range(180,365):
        month=(date(2026,1,1)+timedelta(days=day)).month
        prob={6:.55,7:.6,8:.65,9:.70,10:.60,11:.30,12:.10}[month]
        scale={6:11,7:12,8:13,9:14,10:13,11:7,12:4}[month]
        r=min(65,float(rng.gamma(1.7,scale))) if rng.random()<prob else 0.
        t=25.5+4.2*math.sin(2*math.pi*(day-30)/365)+rng.normal(0,1.1)
        s=float(np.clip(.82+.1*math.sin(2*math.pi*(day+10)/45)+rng.normal(0,.05),.35,1))
        if rng.random()<.045: s*=rng.uniform(.35,.65)
        rain.append(round(r,3)); supply.append(round(s,4)); demand.append(round(float(np.clip(1+.055*(t-25)+.75*(1-s),.72,1.85)),4))
    return {'rainfall':rain,'supply':supply,'demand':demand,'month_day':[(date(2026,1,1)+timedelta(days=i)).strftime('%m-%d') for i in range(365)],
            'note':'Synthetic typical calendar year; Jan–Jun retained exactly, Jul–Dec seeded monsoon assumptions. Repeated by month/day; leap day uses 28 February. Not a weather forecast.'}

def future(m,d,cal,days,pump=1,rainfactor=1):
    indices=[cal['month_day'].index((date(2026,6,29)+timedelta(days=i)).strftime('%m-%d').replace('02-29','02-28')) for i in range(1,days+1)]
    raw=np.r_[d['rain'],np.array(cal['rainfall'])[indices]*rainfactor]
    eff=rain_series(raw,d['impervious'],m['delay_days'])
    vol=np.r_[d['vol'],[m['average_volume_m3']*pump*(1+.08*math.sin(i*2*math.pi/7)) for i in range(1,days+1)]]
    sup=np.r_[d['supply'],np.array(cal['supply'])[indices]]; dem=np.r_[d['demand'],np.array(cal['demand'])[indices]]
    return rollout(m,d['obs'],vol,eff,sup,dem,180,180+days,True,d['depth'])

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--data-folder',type=Path,required=True); args=parser.parse_args(); src=args.data_folder
    metadata,sheets=workbook_metadata(src/'Bengaluru_Borewell_Synthetic_Test_Data_450_Wells.xlsx')
    meta={r['well_id']:r for r in metadata}; daily=rows(src/'Bengaluru_Borewell_Full_Daily_Truth_Companion.csv')
    by=defaultdict(list)
    for r in daily: by[r['well_id']].append(r)
    ss=defaultdict(list)
    for r in rows(src/'Bengaluru_Borewell_Sessions_180d_Companion.csv'): ss[r['well_id']].append(r)
    assert set(meta)==set(by) and len(meta)==450
    datasets={}
    names={'obs':'observed_static_m_bgs','true':'true_static_m_bgs','rain':'rainfall_mm','vol':'daily_pumped_volume_m3','supply':'municipal_supply_index','demand':'demand_index'}
    for wid,rr in sorted(by.items()):
        rr.sort(key=lambda r:r['date']); assert len(rr)==180
        d={k:np.array([float(r[v]) for r in rr]) for k,v in names.items()}
        d.update(impervious=float(meta[wid]['impervious_fraction']),depth=float(meta[wid]['construction_depth_m']),scenario=rr[0]['scenario'])
        # Independently verify hidden generator identity; its components are never predictors.
        component=np.array([sum(float(r[k]) for k in ['base_trend_effect_m','pumping_storage_effect_m','neighbor_effect_m','structural_change_effect_m','process_noise_m'])-float(r['recharge_effect_m']) for r in rr])
        assert np.max(abs(np.diff(d['true'])-component[1:]))<.00011
        datasets[wid]=d
    old=json.loads(gzip.decompress((ROOT/'dist/data/synthetic_model.json.gz').read_bytes()))
    drivers=old['drivers']; cal=calendar(drivers); copy=old['scenario_copy']
    # Candidate kernels are selected using OBSERVED inner levels, without hidden delay metadata.
    candidates={}; priors={}
    for delay in DELAYS:
        data={wid:prepare(d,120,delay) for wid,d in datasets.items()}
        prior=fit(np.vstack([v[1] for v in data.values()]),np.concatenate([v[2] for v in data.values()]),strength=1)
        priors[delay]=prior
        for wid,(m,x,y,eff) in data.items():
            m['beta']=fit(x,y,prior); m['residual_sigma']=max(float(np.sqrt(np.mean((y-x@m['beta'])**2))),.08)
            d=datasets[wid]; pred=rollout(m,d['obs'],d['vol'],eff,d['supply'],d['demand'],120,150)
            score=float(np.mean(abs(pred-d['obs'][120:150])))
            if wid not in candidates or score<candidates[wid]['score']:
                candidates[wid]={'score':score,'m':m,'pred':pred}
    ratios=[]
    for wid,c in candidates.items(): ratios.extend(abs(c['pred']-datasets[wid]['true'][120:150])/base_width(c['m'],np.arange(1,31)))
    multiplier=float(np.quantile(ratios,.8))
    # Refit pooled prior on the selected kernels using days 1–150 only.
    prepared={wid:prepare(d,150,candidates[wid]['m']['delay_days']) for wid,d in datasets.items()}
    prior=fit(np.vstack([v[1] for v in prepared.values()]),np.concatenate([v[2] for v in prepared.values()]),strength=1)
    summaries=m1_summaries(ss,datasets); forward_summaries=m1_summaries(ss,datasets,180); static_fleet=np.median([theil(d['obs'][:150]) for d in datasets.values()])
    wells=[]; comparison=[]; replay=defaultdict(list); probes=[]
    for index,(wid,d) in enumerate(datasets.items()):
        m,x,y,eff=prepared[wid]; m['beta']=fit(x,y,prior); m['residual_sigma']=max(float(np.sqrt(np.mean((y-x@m['beta'])**2))),.08)
        m.update(average_volume_m3=float(np.mean(d['vol'][:150])),latest_observed_m_bgs=float(d['obs'][-1]),latest_true_m_bgs=float(d['true'][-1]),training_days=150,interval_multiplier=multiplier)
        pred=rollout(m,d['obs'],d['vol'],eff,d['supply'],d['demand'],150,180); width=base_width(m,np.arange(1,31))*multiplier
        # Store rounded arrays FIRST so all published metrics reproduce from the delivered values.
        pred=np.round(pred,3); low=np.round(pred-width,3); high=np.round(pred+width,3); truth=np.round(d['true'][150:],3)
        met=metric(pred,truth,low,high); md=meta[wid]
        public_m={k:(np.round(v,9).tolist() if isinstance(v,np.ndarray) else v) for k,v in m.items()}
        w={'id':wid,'scenario':d['scenario'],'cluster':md['cluster_id'],'geology':md['geology_group'],'land_use':md['land_use'],
           'impervious_fraction':d['impervious'],'construction_depth_m':d['depth'],'pump_intake_depth_m':float(md['pump_intake_depth_m']),
           'specific_capacity':float(md['specific_capacity_L_min_per_m']),'history':{'observed':rounded(d['obs']),'true':rounded(d['true'])},
           'model':public_m,'validation':dict(met,predicted=pred.tolist(),low80=low.tolist(),high80=high.tolist())}
        wells.append(w)
        s=summaries[wid]; h=np.arange(1,31)+(149-s['latest_day']); p1=m1_path(s,h); w1=m1_width(s,h)
        p2=m2_path(s,d['rain'][150:],float(np.mean(d['rain'][:150])),149-s['latest_day']); w2=w1*(8.131628/8.134227)
        static={'latest':float(d['obs'][149]),'trend':150/155*theil(d['obs'][:150])+5/155*static_fleet,'evidence':'higher'}
        plinear=np.polyval(np.polyfit(np.arange(90,150),d['obs'][90:150],1),np.arange(150,180))
        paths={'M1':(p1,w1),'M2':(p2,w2),'M3':(pred,width),'persistence':(np.full(30,d['obs'][149]),None),'linear60':(plinear,None),'M1_static':(m1_path(static,np.arange(1,31)),m1_width(static,np.arange(1,31)))}
        mods={}
        for key,(p,wi) in paths.items():
            pp=np.round(p,3); lo=np.round(p-wi,3) if wi is not None else None; hi=np.round(p+wi,3) if wi is not None else None
            if key in ['M1','M2','M1_static']: lo=np.clip(lo,0,500); hi=np.clip(hi,0,500)
            if key=='M3': lo=low;hi=high
            mods[key]={'pred':pp.tolist(),'low80':lo.tolist() if lo is not None else None,'high80':hi.tolist() if hi is not None else None,'metrics':metric(pp,truth,lo,hi)}
        future_indices=[cal['month_day'].index((date(2026,6,29)+timedelta(days=i)).strftime('%m-%d')) for i in range(1,184)]
        fs=forward_summaries[wid]
        f1=m1_path(fs,np.arange(1,184)+(179-fs['latest_day']))
        f2=m2_path(fs,np.array(cal['rainfall'])[future_indices],float(np.mean(d['rain'][:150])),179-fs['latest_day'])
        f3=future(m,d,cal,183)
        comparison.append({'id':wid,'scenario':d['scenario'],'history':rounded(d['obs'][90:150]),'truth':truth.tolist(),'models':mods,
           'forward':{'M1':rounded(f1),'M2':rounded(f2),'M3':rounded(f3)},'dynamic_static_offset_m':round(s['latest']-d['obs'][149],3)})
        rp=rollout(m,d['obs'],d['vol'],eff,d['supply'],d['demand'],1,180)
        replay[d['scenario']].append([d['true'][-1]-d['true'][0],rp[-1]-d['obs'][0]])
        if index<5:
            for day in range(140,150): probes.append({'well_id':wid,'day_index':day,'previous_delta':float(d['obs'][day-1]-d['obs'][day-2]),'volume':float(d['vol'][day]),'expected':feature(m,d['obs'][day-1]-d['obs'][day-2],d['vol'][day],eff[day],d['supply'][day],d['demand'][day]).tolist()})
    keys=list(comparison[0]['models']); groups={'all':comparison,'excluding_sensor_drift':[w for w in comparison if w['scenario']!='sensor_drift']}
    fleets={}; scenarios={}; horizons={}; wins={}
    for group,ww in groups.items():
        fleets[group]={};scenarios[group]={};horizons[group]={};wins[group]={}
        for key in keys:
            p=np.array([w['models'][key]['pred'] for w in ww]); t=np.array([w['truth'] for w in ww]);lo=np.array([w['models'][key]['low80'] for w in ww]) if ww[0]['models'][key]['low80'] is not None else None;hi=np.array([w['models'][key]['high80'] for w in ww]) if lo is not None else None
            fleets[group][key]=metric(p,t,lo,hi);horizons[group][key]=rounded(np.mean(abs(p-t),axis=0));scenarios[group][key]={}
            for sc in sorted({w['scenario'] for w in ww}):
                ii=[i for i,w in enumerate(ww) if w['scenario']==sc];scenarios[group][key][sc]=metric(p[ii],t[ii],lo[ii] if lo is not None else None,hi[ii] if hi is not None else None)
        winner=[min(['M1','M2','M3'],key=lambda k:w['models'][k]['metrics']['mae_m']) for w in ww]
        wins[group]={k:round(winner.count(k)/len(ww)*100,3) for k in ['M1','M2','M3']}
    replay_table={sc:{'true_change_m':round(float(np.median(np.array(v)[:,0])),3),'replay_change_m':round(float(np.median(np.array(v)[:,1])),3)} for sc,v in replay.items()}
    for sc,v in replay_table.items():
        if sc!='sensor_drift': assert abs(v['true_change_m']-v['replay_change_m'])<=1.5 and np.sign(v['true_change_m'])==np.sign(v['replay_change_m']), (sc,v)
    rainfall=json.loads(subprocess.check_output(['git','show','eb6021e:dist/comparison/data/rainfall_comparison.json'],cwd=ROOT))
    dump(ROOT/'dist/data/real_rainfall.json.gz',rainfall)
    sharedmeta=dict(old['meta'],method='Sign-constrained ridge daily-change model; rainfall delay selected from observed inner validation',features=SPEC['features'],calibration_window='days 121–150; no final holdout tuning',interval_multiplier=round(multiplier,9),calendar_note=cal['note'],feature_spec=SPEC)
    scenario_m3={sc:dict(v,well_count=sum(w['scenario']==sc for w in wells)) for sc,v in scenarios['all']['M3'].items()}
    dump(ROOT/'dist/data/synthetic_model.json.gz',{'meta':sharedmeta,'dates':old['dates'],'drivers':drivers,'calendar':cal,'scenario_copy':copy,'fleet_metrics':fleets['all']['M3'],'scenario_metrics':scenario_m3,'wells':wells})
    modelinfo=[{'id':'M1','name':'Real-data trend model','inputs':'Quality-screened pump-start sessions; daily medians','predicts':'Dynamic level scenario; separate session transition models were tested on real wells','specialty':'Transparent fallback using the company’s existing data','limitation':'Residual drawdown and only 15 real days; long horizons are heuristic','best_use':'Short-term direction and scenario exploration'},
      {'id':'M2','name':'Rainfall-scenario model','inputs':'M1 + NASA POWER rainfall / monthly climatology','predicts':'M1 path adjusted by a bounded rainfall signal','specialty':'Free public seasonal what-if inputs','limitation':'Real transition gain was 0.03%; dynamic-level bias remains','best_use':'Dry / typical / wet seasonal scenarios'},
      {'id':'M3','name':'450-well driver model','inputs':'Daily static level, volume, raw lagged rain, supply, demand','predicts':'Daily static-level change, rolled forward','specialty':'Learns rain delay; physically ordered pump/rain levers','limitation':'Synthetic validation only; sensor drift remains unresolved','best_use':'Candidate for real validation after the data contract'}]
    payload={'meta':dict(sharedmeta,information_rule='All models receive actual holdout drivers they use. M1 uses none, M2 rain, M3 volume/rain/supply/demand. Conditional-input test, not weather or demand forecasting.',workbook_sheets=sheets,rounding_digits=3,forward_note='M1/M2 updated from all 180 pump-session days; M3 retains days 1–150 coefficients, anchored to latest observed static. Calendar drivers are synthetic assumptions; no future truth exists.'),
      'models':modelinfo,'fleet_metrics':fleets,'scenario_metrics':scenarios,'horizon_mae':horizons,'win_share':wins,'wells':comparison,
      'real':{'screened_pump_mae_m':8.953,'screened_recovery_mae_m':7.088,'all_record_pump_mae_m':33.997,'all_record_recovery_mae_m':29.691,'rain_baseline_mae_m':8.134227,'rain_enhanced_mae_m':8.131628,'improvement_pct':.031955},'replay':replay_table}
    dump(ROOT/'dist/data/model_comparison.json.gz',payload)
    assert (ROOT/'dist/data/model_comparison.json.gz').stat().st_size<1_500_000
    (ROOT/'tools/feature_probes.json').write_text(json.dumps(probes,separators=(',',':')))
    report={'replay':replay_table,'interval_multiplier':multiplier,'inner_coverage_pct':float(np.mean(np.array(ratios)<=multiplier)*100),'fleet_metrics':fleets,'scenario_metrics':scenario_m3,'lag_distribution':{str(k):sum(w['model']['delay_days']==k for w in wells) for k in DELAYS},'gzip_bytes':(ROOT/'dist/data/model_comparison.json.gz').stat().st_size}
    (ROOT/'tools/build_report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
