"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Area
} from "recharts";

const C = {
  bg:"#f5f6fa",card:"#ffffff",bd:"rgba(0,0,0,.06)",
  tx:"#191f28",sub:"#4e5968",mt:"#8b95a1",lt:"#b0b8c1",
  blue:"#3182f6",blueL:"#e8f3ff",blueD:"#1b64da",
  green:"#00b386",greenL:"#e8faf5",
  red:"#f04452",redL:"#fff0f1",
  amber:"#ff8800",amberL:"#fff4e6",
  purple:"#7048e8",purpleL:"#f3f0ff",
  grey:"#f2f4f6",
};

function probColor(p){return p>=75?C.blue:p>=60?C.green:p>=45?C.amber:C.red}
function probBg(p){return p>=75?C.blueL:p>=60?C.greenL:p>=45?C.amberL:C.redL}
function probLabel(p){return p>=75?"강력":p>=60?"유망":p>=45?"보통":"약함"}
function probDesc(p){return p>=75?"상승 확률이 매우 높아요":p>=60?"긍정적 시그널이 감지됐어요":p>=45?"추가 확인이 필요해요":"리스크가 높아요"}
function Icon({name,size=20,color=C.mt,style:s={}}){return<span className="material-symbols-rounded" style={{fontSize:size,color,lineHeight:1,...s}}>{name}</span>}

const cs={background:C.card,borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,.04),0 1px 2px rgba(0,0,0,.02)"};
const tt={background:"#fff",border:"1px solid rgba(0,0,0,.08)",borderRadius:10,fontSize:11,padding:"8px 12px",boxShadow:"0 4px 12px rgba(0,0,0,.06)"};

const DEFAULT_SETTINGS={w_breakout:25,w_volumeZ:20,w_trend:25,w_volContraction:15,w_sectorRS:15,min_breakout:40,min_volumeZ:30,min_trend:40,min_volContraction:30,min_sectorRS:30,targetReturn:15,holdingDays:20,minProbability:40,stopLoss:5};
function loadSettings(){try{const s=localStorage.getItem("qs_settings");return s?{...DEFAULT_SETTINGS,...JSON.parse(s)}:{...DEFAULT_SETTINGS}}catch{return{...DEFAULT_SETTINGS}}}
function saveSettings(s){try{localStorage.setItem("qs_settings",JSON.stringify(s))}catch{}}

function recalcWithSettings(detail,settings){
  const f=detail.features;if(!f)return detail;
  const totalW=settings.w_breakout+settings.w_volumeZ+settings.w_trend+settings.w_volContraction+settings.w_sectorRS;
  if(totalW===0)return detail;
  const score=Math.round((f.breakout*settings.w_breakout+f.volumeZ*settings.w_volumeZ+f.trend*settings.w_trend+f.volContraction*settings.w_volContraction+f.sectorRS*settings.w_sectorRS)/totalW);
  const x=(score-50)/20;
  const probability=Math.round((1/(1+Math.exp(-x)))*100*0.9+5);
  return{...detail,score,probability};
}

const MA={sma5:{label:"5일",color:"#ff6b6b"},sma20:{label:"20일",color:"#ffa94d"},sma60:{label:"60일",color:"#51cf66"},sma120:{label:"120일",color:"#845ef7"}};

function addIndicators(chartData){
  const closes=chartData.map(d=>d.close);
  function sma(arr,per){return arr.map((_,i)=>{if(i<per-1)return null;let s=0;for(let j=i-per+1;j<=i;j++)s+=arr[j];return Math.round(s/per)})}
  const s5=sma(closes,5),s20=sma(closes,20),s60=sma(closes,60),s120=sma(closes,120);
  const rsiArr=new Array(closes.length).fill(null);
  if(closes.length>=15){let ag=0,al=0;for(let i=1;i<=14;i++){const d=closes[i]-closes[i-1];if(d>=0)ag+=d;else al-=d}ag/=14;al/=14;rsiArr[14]=al===0?100:100-100/(1+ag/al);for(let i=15;i<closes.length;i++){const d=closes[i]-closes[i-1];ag=(ag*13+(d>0?d:0))/14;al=(al*13+(d<0?-d:0))/14;rsiArr[i]=al===0?100:100-100/(1+ag/al)}}
  return chartData.map((d,i)=>({...d,sma5:s5[i],sma20:s20[i],sma60:s60[i],sma120:s120[i],rsi:rsiArr[i]!==null?Math.round(rsiArr[i]*10)/10:null}));
}

function StockChart({chartData:raw}){
  const enriched=addIndicators(raw);
  const displayData=enriched.slice(-60);
  const[ma,setMa]=useState({sma5:true,sma20:true,sma60:true,sma120:false});
  const[showRsi,setShowRsi]=useState(true);
  const[showVol,setShowVol]=useState(true);
  const tog=(k)=>setMa({...ma,[k]:!ma[k]});

  return(<div>
    <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
      {Object.entries(MA).map(([k,v])=><button key={k} onClick={()=>tog(k)} style={{padding:"4px 10px",borderRadius:6,border:`1.5px solid ${ma[k]?v.color:C.bd}`,background:ma[k]?`${v.color}12`:"transparent",color:ma[k]?v.color:C.lt,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard'"}}>{v.label}</button>)}
      <div style={{width:1,background:C.bd,margin:"0 4px"}}/>
      <button onClick={()=>setShowRsi(!showRsi)} style={{padding:"4px 10px",borderRadius:6,border:`1.5px solid ${showRsi?C.blue:C.bd}`,background:showRsi?C.blueL:"transparent",color:showRsi?C.blue:C.lt,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard'"}}>RSI</button>
      <button onClick={()=>setShowVol(!showVol)} style={{padding:"4px 10px",borderRadius:6,border:`1.5px solid ${showVol?C.purple:C.bd}`,background:showVol?C.purpleL:"transparent",color:showVol?C.purple:C.lt,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard'"}}>거래량</button>
    </div>
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={displayData} margin={{left:-10,right:4}}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.05)"/>
        <XAxis dataKey="date" stroke={C.lt} fontSize={9} tick={{fill:C.mt}} interval={8}/>
        <YAxis stroke={C.lt} fontSize={9} tick={{fill:C.mt}} tickFormatter={v=>`${(v/1000).toFixed(0)}K`} domain={["auto","auto"]}/>
        <Tooltip contentStyle={tt} formatter={(v,n)=>[v?`₩${Math.round(v).toLocaleString()}`:"—",{close:"종가",sma5:"5일",sma20:"20일",sma60:"60일",sma120:"120일"}[n]||n]}/>
        <Line type="monotone" dataKey="close" stroke={C.blue} strokeWidth={2} dot={false}/>
        {ma.sma5&&<Line type="monotone" dataKey="sma5" stroke={MA.sma5.color} strokeWidth={1.2} dot={false}/>}
        {ma.sma20&&<Line type="monotone" dataKey="sma20" stroke={MA.sma20.color} strokeWidth={1.2} dot={false}/>}
        {ma.sma60&&<Line type="monotone" dataKey="sma60" stroke={MA.sma60.color} strokeWidth={1.2} dot={false} strokeDasharray="4 2"/>}
        {ma.sma120&&<Line type="monotone" dataKey="sma120" stroke={MA.sma120.color} strokeWidth={1.2} dot={false} strokeDasharray="4 2"/>}
      </ComposedChart>
    </ResponsiveContainer>
    <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:4,marginBottom:8,fontSize:10}}>
      <span style={{color:C.blue}}>● 종가</span>
      {ma.sma5&&<span style={{color:MA.sma5.color}}>● 5일</span>}
      {ma.sma20&&<span style={{color:MA.sma20.color}}>● 20일</span>}
      {ma.sma60&&<span style={{color:MA.sma60.color}}>┄ 60일</span>}
      {ma.sma120&&<span style={{color:MA.sma120.color}}>┄ 120일</span>}
    </div>
    {showRsi&&<div style={{paddingTop:8,borderTop:`1px solid ${C.grey}`}}>
      <div style={{fontSize:10,color:C.mt,fontWeight:600,marginBottom:4}}>RSI (14)</div>
      <ResponsiveContainer width="100%" height={100}>
        <ComposedChart data={displayData} margin={{left:-10,right:4}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.04)"/><XAxis dataKey="date" hide/>
          <YAxis stroke={C.lt} fontSize={8} tick={{fill:C.mt}} domain={[0,100]} ticks={[30,50,70]}/>
          <ReferenceLine y={70} stroke={C.red} strokeDasharray="3 3" strokeOpacity={.35}/>
          <ReferenceLine y={30} stroke={C.green} strokeDasharray="3 3" strokeOpacity={.35}/>
          <Tooltip contentStyle={tt} formatter={v=>[v?.toFixed(1),"RSI"]}/>
          <Area type="monotone" dataKey="rsi" stroke={C.blue} strokeWidth={1.5} fill={C.blueL} fillOpacity={.4} dot={false} connectNulls/>
        </ComposedChart>
      </ResponsiveContainer>
    </div>}
    {showVol&&<div style={{paddingTop:8,borderTop:`1px solid ${C.grey}`}}>
      <div style={{fontSize:10,color:C.mt,fontWeight:600,marginBottom:4}}>거래량</div>
      <ResponsiveContainer width="100%" height={80}>
        <ComposedChart data={displayData} margin={{left:-10,right:4}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.04)"/><XAxis dataKey="date" hide/>
          <YAxis stroke={C.lt} fontSize={8} tick={{fill:C.mt}} tickFormatter={v=>`${(v/10000).toFixed(0)}만`}/>
          <Tooltip contentStyle={tt} formatter={v=>[v?.toLocaleString(),"거래량"]}/>
          <Bar dataKey="volume" fill={C.purple} fillOpacity={.25} radius={[2,2,0,0]}/>
        </ComposedChart>
      </ResponsiveContainer>
    </div>}
  </div>);
}

// ─── 준비중 카드 컴포넌트 ────────────────────────────────────
function ComingSoon({icon,title}){
  return(<div style={{...cs,padding:24,marginBottom:12}}>
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:14}}>
      <Icon name={icon} size={20} color={C.mt}/>
      <span style={{fontSize:15,fontWeight:700,color:C.mt}}>{title}</span>
      <span style={{padding:"3px 8px",borderRadius:6,fontSize:10,fontWeight:600,background:C.amberL,color:C.amber,marginLeft:"auto"}}>준비중</span>
    </div>
    <div style={{textAlign:"center",padding:"16px 0"}}>
      <Icon name="construction" size={36} color={C.lt}/>
      <p style={{fontSize:13,color:C.sub,marginTop:8,fontWeight:500}}>이 기능을 준비하고 있어요</p>
      <p style={{fontSize:11,color:C.mt,marginTop:4}}>데이터 수집 인프라 구축 후 제공 예정</p>
    </div>
  </div>);
}

// ─── 이퀄라이저 ─────────────────────────────────────────────
function EqSlider({icon,label,desc,value,onChange,min=0,max=100,unit="",color=C.blue}){
  return(<div style={{marginBottom:20}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}><Icon name={icon} size={18} color={C.sub}/><div><div style={{fontSize:13,fontWeight:600}}>{label}</div><div style={{fontSize:11,color:C.mt}}>{desc}</div></div></div>
      <span className="mono" style={{fontSize:16,fontWeight:700,color}}>{value}{unit}</span>
    </div>
    <div style={{position:"relative",height:32,display:"flex",alignItems:"center"}}>
      <input type="range" min={min} max={max} value={value} onChange={e=>onChange(parseInt(e.target.value))} style={{width:"100%",height:6,appearance:"none",background:C.grey,borderRadius:3,outline:"none",cursor:"pointer"}}/>
      <style>{`input[type=range]::-webkit-slider-thumb{appearance:none;width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.15);cursor:pointer}`}</style>
    </div>
    <div style={{height:4,borderRadius:2,background:C.grey,marginTop:-14,pointerEvents:"none"}}><div style={{height:"100%",borderRadius:2,width:`${((value-min)/(max-min))*100}%`,background:`linear-gradient(90deg,${color}66,${color})`,transition:"width .15s"}}/></div>
  </div>);
}

function SettingsPage({settings,setSettings,onClose}){
  const[local,setLocal]=useState({...settings});
  const totalW=local.w_breakout+local.w_volumeZ+local.w_trend+local.w_volContraction+local.w_sectorRS;
  const u=(k,v)=>setLocal({...local,[k]:v});
  const apply=()=>{setSettings(local);saveSettings(local);onClose()};

  return(<div className="fade-up">
    <div style={{marginBottom:20}}><p style={{fontSize:13,color:C.blue,fontWeight:600,marginBottom:4,display:"flex",alignItems:"center",gap:4}}><Icon name="tune" size={16} color={C.blue}/>나만의 시그널 설정</p><h2 style={{fontSize:22,fontWeight:800,letterSpacing:-.5}}>투자 스타일에 맞게 조절하세요</h2></div>

    <div style={{...cs,padding:24,marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:18}}><Icon name="target" size={20} color={C.green}/><span style={{fontSize:15,fontWeight:700}}>전략 설정</span></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div><div style={{fontSize:12,color:C.mt,fontWeight:500,marginBottom:6}}>목표 수익률</div><div style={{display:"flex",gap:6}}>{[10,15,20,30].map(v=><button key={v} onClick={()=>u("targetReturn",v)} style={{flex:1,padding:"8px 0",borderRadius:10,border:"none",fontSize:13,fontWeight:600,background:local.targetReturn===v?C.blue:C.grey,color:local.targetReturn===v?"#fff":C.sub,cursor:"pointer",fontFamily:"'Pretendard'"}}>{`+${v}%`}</button>)}</div></div>
        <div><div style={{fontSize:12,color:C.mt,fontWeight:500,marginBottom:6}}>보유 기간</div><div style={{display:"flex",gap:6}}>{[10,20,40,60].map(v=><button key={v} onClick={()=>u("holdingDays",v)} style={{flex:1,padding:"8px 0",borderRadius:10,border:"none",fontSize:13,fontWeight:600,background:local.holdingDays===v?C.blue:C.grey,color:local.holdingDays===v?"#fff":C.sub,cursor:"pointer",fontFamily:"'Pretendard'"}}>{`${v}일`}</button>)}</div></div>
      </div>
      <div style={{marginTop:16}}><EqSlider icon="security" label="최소 확률 필터" desc="이 확률 이상만 표시" value={local.minProbability} onChange={v=>u("minProbability",v)} min={20} max={80} unit="%" color={C.green}/></div>
      <EqSlider icon="do_not_disturb_on" label="손절 라인" desc="목표 손절 비율" value={local.stopLoss} onChange={v=>u("stopLoss",v)} min={2} max={15} unit="%" color={C.red}/>
    </div>

    <div style={{...cs,padding:24,marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}><Icon name="equalizer" size={20} color={C.blue}/><span style={{fontSize:15,fontWeight:700}}>피처 가중치</span></div>
      <p style={{fontSize:12,color:C.mt,marginBottom:18}}>어떤 지표를 더 중요하게 볼 건지 조절하세요</p>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 0",marginBottom:16,background:totalW===100?C.greenL:C.amberL,borderRadius:10}}><Icon name={totalW===100?"check_circle":"warning"} size={16} color={totalW===100?C.green:C.amber}/><span style={{fontSize:12,fontWeight:600,color:totalW===100?C.green:C.amber}}>가중치 합계: {totalW}%{totalW!==100&&" (100%가 되어야 해요)"}</span></div>
      <EqSlider icon="trending_up" label="돌파 거리" desc="120일 고점 대비" value={local.w_breakout} onChange={v=>u("w_breakout",v)} max={50} unit="%" color={C.blue}/>
      <EqSlider icon="bar_chart" label="거래량 Z-score" desc="거래량 급증도" value={local.w_volumeZ} onChange={v=>u("w_volumeZ",v)} max={50} unit="%" color={C.green}/>
      <EqSlider icon="show_chart" label="추세 강도" desc="이동평균 정배열" value={local.w_trend} onChange={v=>u("w_trend",v)} max={50} unit="%" color={C.purple}/>
      <EqSlider icon="compress" label="변동성 수축" desc="볼린저밴드 수축도" value={local.w_volContraction} onChange={v=>u("w_volContraction",v)} max={50} unit="%" color={C.amber}/>
      <EqSlider icon="group_work" label="섹터 상대강도" desc="업종 내 위치" value={local.w_sectorRS} onChange={v=>u("w_sectorRS",v)} max={50} unit="%" color={C.red}/>
    </div>

    <div style={{...cs,padding:24,marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}><Icon name="filter_alt" size={20} color={C.purple}/><span style={{fontSize:15,fontWeight:700}}>최소 기준값</span></div>
      <p style={{fontSize:12,color:C.mt,marginBottom:18}}>각 지표가 이 값 이상이어야 포함</p>
      <EqSlider icon="trending_up" label="돌파 거리 최소" desc="이 점수 이상만" value={local.min_breakout} onChange={v=>u("min_breakout",v)} color={C.blue}/>
      <EqSlider icon="bar_chart" label="거래량 Z 최소" desc="이 점수 이상만" value={local.min_volumeZ} onChange={v=>u("min_volumeZ",v)} color={C.green}/>
      <EqSlider icon="show_chart" label="추세 강도 최소" desc="이 점수 이상만" value={local.min_trend} onChange={v=>u("min_trend",v)} color={C.purple}/>
      <EqSlider icon="compress" label="변동성 수축 최소" desc="이 점수 이상만" value={local.min_volContraction} onChange={v=>u("min_volContraction",v)} color={C.amber}/>
      <EqSlider icon="group_work" label="섹터 강도 최소" desc="이 점수 이상만" value={local.min_sectorRS} onChange={v=>u("min_sectorRS",v)} color={C.red}/>
    </div>

    <div style={{...cs,padding:20,marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:14}}><Icon name="bookmarks" size={20} color={C.amber}/><span style={{fontSize:15,fontWeight:700}}>프리셋</span></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        {[{label:"안전형",desc:"추세 중심",icon:"shield",color:C.green,p:{w_breakout:15,w_volumeZ:10,w_trend:35,w_volContraction:20,w_sectorRS:20,minProbability:60}},{label:"균형형",desc:"기본 설정",icon:"balance",color:C.blue,p:{...DEFAULT_SETTINGS}},{label:"공격형",desc:"돌파 중심",icon:"bolt",color:C.red,p:{w_breakout:35,w_volumeZ:25,w_trend:15,w_volContraction:15,w_sectorRS:10,minProbability:35}}].map((pr,i)=>
          <button key={i} onClick={()=>setLocal({...local,...pr.p})} style={{padding:14,borderRadius:14,border:`1px solid ${C.bd}`,background:C.card,cursor:"pointer",textAlign:"center",fontFamily:"'Pretendard'"}}><Icon name={pr.icon} size={24} color={pr.color}/><div style={{fontSize:13,fontWeight:700,marginTop:6}}>{pr.label}</div><div style={{fontSize:10,color:C.mt,marginTop:2}}>{pr.desc}</div></button>
        )}
      </div>
    </div>

    <div style={{display:"flex",gap:10,position:"sticky",bottom:16,zIndex:10}}>
      <button onClick={()=>setLocal({...DEFAULT_SETTINGS})} style={{flex:1,padding:"14px 0",borderRadius:14,border:`1px solid ${C.bd}`,background:C.card,color:C.sub,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard'"}}>초기화</button>
      <button onClick={apply} style={{flex:2,padding:"14px 0",borderRadius:14,border:"none",background:C.blue,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Pretendard'",boxShadow:"0 4px 16px rgba(49,130,246,.25)"}}>적용하기</button>
    </div>
  </div>);
}

// ─── 메인 앱 ────────────────────────────────────────────────
export default function Home(){
  const[signals,setSignals]=useState([]);
  const[loading,setLoading]=useState(true);
  const[mode,setMode]=useState("demo");
  const[sector,setSector]=useState("전체");
  const[page,setPage]=useState("main");
  const[detail,setDetail]=useState(null);
  const[detailLoading,setDetailLoading]=useState(false);
  const[analysis,setAnalysis]=useState(null);
  const[analyzing,setAnalyzing]=useState(false);
  const[showApi,setShowApi]=useState(false);
  const[config,setConfig]=useState({appKey:"",appSecret:""});
  const[settings,setSettings]=useState(DEFAULT_SETTINGS);

  useEffect(()=>{setSettings(loadSettings())},[]);

  const loadSignals=useCallback(async()=>{
    setLoading(true);
    try{const res=await fetch("/api/signals");const data=await res.json();if(data.signals){setSignals(data.signals);setMode(data.mode||"demo")}}catch(e){console.error(e)}
    setLoading(false);
  },[]);

  useEffect(()=>{loadSignals()},[loadSignals]);

  const handleSelectStock=async(stock)=>{
    setDetail(null);setAnalysis(null);setDetailLoading(true);setPage("detail");
    try{
      const res=await fetch("/api/detail",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:stock.code,name:stock.name})});
      const data=await res.json();
      if(data.detail){setDetail(recalcWithSettings(data.detail,settings))}
    }catch(e){console.error(e)}
    setDetailLoading(false);
  };

  const handleAnalyze=async()=>{
    if(!detail)return;
    setAnalyzing(true);setAnalysis(null);
    try{const res=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(detail)});const data=await res.json();setAnalysis(data.analysis||data.error||"분석 실패")}catch{setAnalysis("오류 발생")}
    setAnalyzing(false);
  };

  const filtered=sector==="전체"?signals:signals.filter(s=>s.sector===sector);

  return(<div style={{minHeight:"100vh",background:C.bg}}>
    {/* Header */}
    <header style={{padding:"12px 20px",background:"#fff",borderBottom:`1px solid ${C.bd}`,position:"sticky",top:0,zIndex:50,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        {(page!=="main")&&<button onClick={()=>{setPage("main");setDetail(null);setAnalysis(null)}} style={{padding:"6px 8px",borderRadius:8,border:"none",background:C.grey,cursor:"pointer",display:"flex"}}><Icon name="arrow_back" size={20} color={C.sub}/></button>}
        <div style={{width:28,height:28,borderRadius:8,background:`linear-gradient(135deg,${C.blue},#00b4d8)`,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="query_stats" size={18} color="#fff"/></div>
        <span style={{fontSize:16,fontWeight:800,letterSpacing:-.3}}>QuantSignal</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{padding:"3px 8px",borderRadius:6,background:mode==="live"?C.greenL:C.amberL,display:"flex",alignItems:"center",gap:4}}><span style={{width:5,height:5,borderRadius:"50%",background:mode==="live"?C.green:C.amber}}/><span style={{fontSize:11,color:mode==="live"?C.green:C.amber,fontWeight:600}}>{mode==="live"?"LIVE":"DEMO"}</span></div>
        {page==="main"&&<button onClick={()=>setPage("settings")} style={{padding:6,borderRadius:8,border:"none",background:C.grey,cursor:"pointer",display:"flex"}}><Icon name="tune" size={20} color={C.sub}/></button>}
        <button onClick={()=>setShowApi(!showApi)} style={{padding:6,borderRadius:8,border:"none",background:C.grey,cursor:"pointer",display:"flex"}}><Icon name="settings" size={20} color={C.sub}/></button>
      </div>
    </header>

    {showApi&&<div style={{padding:"16px 20px",background:"#fff",borderBottom:`1px solid ${C.bd}`}} className="fade-up"><div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}><div style={{flex:1,minWidth:140}}><label style={{fontSize:11,color:C.mt,display:"block",marginBottom:4}}>KIS APP KEY</label><input type="password" value={config.appKey} onChange={e=>setConfig({...config,appKey:e.target.value})} style={{width:"100%",padding:"8px 12px",border:`1px solid ${C.bd}`,borderRadius:10,fontSize:13,fontFamily:"'DM Mono'",outline:"none"}}/></div><div style={{flex:1,minWidth:140}}><label style={{fontSize:11,color:C.mt,display:"block",marginBottom:4}}>KIS APP SECRET</label><input type="password" value={config.appSecret} onChange={e=>setConfig({...config,appSecret:e.target.value})} style={{width:"100%",padding:"8px 12px",border:`1px solid ${C.bd}`,borderRadius:10,fontSize:13,fontFamily:"'DM Mono'",outline:"none"}}/></div></div></div>}

    <main style={{padding:"20px 20px 40px",maxWidth:640,margin:"0 auto"}}>

      {loading&&<div style={{textAlign:"center",padding:"80px 20px"}} className="fade-up"><span className="spinner" style={{width:32,height:32,borderWidth:3}}/><p style={{fontSize:14,color:C.sub,marginTop:16}}>시그널 후보를 스캔하고 있어요...</p><p style={{fontSize:12,color:C.mt,marginTop:4}}>거래량 상위 · 등락률 상위 종목 탐색 중</p></div>}

      {!loading&&page==="settings"&&<SettingsPage settings={settings} setSettings={setSettings} onClose={()=>setPage("main")}/>}

      {/* ═══ 시그널 후보 목록 ═══ */}
      {!loading&&page==="main"&&(<>
        <div className="fade-up" style={{marginBottom:20}}>
          <p style={{fontSize:13,color:C.blue,fontWeight:600,marginBottom:4,display:"flex",alignItems:"center",gap:4}}><Icon name="auto_awesome" size={16} color={C.blue}/>{mode==="live"?"실시간 시장 스캔 완료":"데모 데이터로 분석 중"}</p>
          <h2 style={{fontSize:22,fontWeight:800,letterSpacing:-.5,lineHeight:1.3}}>오늘의 시그널 후보에요</h2>
          <p style={{fontSize:12,color:C.mt,marginTop:4}}>종목을 탭하면 상세 분석을 시작해요</p>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
          {[{label:"스캔 종목",val:filtered.length,unit:"개",color:C.blue},{label:"상승 종목",val:filtered.filter(s=>s.chg>0).length,unit:"개",color:C.green},{label:"거래량↑",val:filtered.filter(s=>parseFloat(s.volRatio)>=2).length,unit:"개",color:C.purple}].map((d,i)=>
            <div key={i} className="fade-up" style={{...cs,padding:16,animationDelay:`${i*.05}s`}}><div style={{fontSize:11,color:C.mt,fontWeight:500,marginBottom:6}}>{d.label}</div><div style={{display:"flex",alignItems:"baseline",gap:2}}><span className="mono" style={{fontSize:28,fontWeight:700,color:d.color}}>{d.val}</span><span style={{fontSize:13,color:C.mt}}>{d.unit}</span></div></div>
          )}
        </div>

        <div className="fade-up" style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:C.blueL,borderRadius:12,marginBottom:14,cursor:"pointer"}} onClick={()=>setPage("settings")}>
          <Icon name="tune" size={18} color={C.blue}/>
          <span style={{fontSize:12,color:C.blueD,fontWeight:500}}>목표 <strong>+{settings.targetReturn}%</strong> · 보유 <strong>{settings.holdingDays}일</strong> · 손절 <strong>{settings.stopLoss}%</strong></span>
          <Icon name="chevron_right" size={16} color={C.blue} style={{marginLeft:"auto"}}/>
        </div>

        {filtered.length===0&&<div style={{textAlign:"center",padding:"40px 20px"}}><Icon name="search_off" size={48} color={C.lt}/><p style={{fontSize:14,color:C.sub,marginTop:12}}>현재 설정으로는 시그널이 없어요</p><button onClick={()=>setPage("settings")} style={{marginTop:12,padding:"10px 20px",borderRadius:12,border:"none",background:C.blue,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'Pretendard'"}}>설정 변경</button></div>}

        {filtered.map((s,i)=>(
          <div key={s.code} className="fade-up" style={{...cs,padding:20,marginBottom:10,cursor:"pointer",display:"flex",alignItems:"center",gap:16,animationDelay:`${i*.04}s`}} onClick={()=>handleSelectStock(s)}>
            <div style={{position:"relative",flexShrink:0}}><svg width="56" height="56" viewBox="0 0 56 56" style={{transform:"rotate(-90deg)"}}><circle cx="28" cy="28" r="23" fill="none" stroke={C.grey} strokeWidth="4"/><circle cx="28" cy="28" r="23" fill="none" stroke={probColor(s.probability)} strokeWidth="4" strokeDasharray={`${(s.probability/100)*144.5} 144.5`} strokeLinecap="round"/></svg><div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontFamily:"'DM Mono'",fontSize:15,fontWeight:700,color:probColor(s.probability)}}>{s.probability}</div></div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{fontSize:15,fontWeight:700}}>{s.name}</span><span style={{padding:"2px 6px",borderRadius:4,fontSize:10,fontWeight:600,background:probBg(s.probability),color:probColor(s.probability)}}>{probLabel(s.probability)}</span></div>
              <div style={{fontSize:12.5,color:C.sub}}>{s.reason}</div>
              <div style={{display:"flex",gap:8,marginTop:6,alignItems:"center"}}><span className="mono" style={{fontSize:12,fontWeight:500}}>₩{s.price?.toLocaleString()}</span><span className="mono" style={{fontSize:12,fontWeight:600,color:s.chg>=0?C.green:C.red}}>{s.chg>=0?"+":""}{s.chg}%</span><span style={{fontSize:11,color:C.lt}}>·</span><span style={{fontSize:11,color:C.mt}}>거래량 {s.volRatio}x</span></div>
            </div>
            <Icon name="chevron_right" size={22} color={C.lt} style={{flexShrink:0}}/>
          </div>
        ))}

        <div style={{padding:"16px 0",textAlign:"center"}}>
          <p style={{fontSize:11,color:C.lt,lineHeight:1.6}}>확률은 1차 스캔 기준 추정값이에요<br/>종목을 탭하면 정밀 분석을 시작해요</p>
          <button onClick={loadSignals} style={{marginTop:12,padding:"10px 20px",borderRadius:12,border:"none",background:C.grey,color:C.sub,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"'Pretendard'"}}><Icon name="refresh" size={16} color={C.sub} style={{verticalAlign:-3,marginRight:4}}/>새로고침</button>
        </div>
      </>)}

      {/* ═══ 종목 상세 (2단계) ═══ */}
      {page==="detail"&&(<div className="fade-up">
        {detailLoading&&<div style={{textAlign:"center",padding:"60px 20px"}}><span className="spinner" style={{width:32,height:32,borderWidth:3}}/><p style={{fontSize:14,color:C.sub,marginTop:16}}>종목 데이터를 수집하고 있어요...</p><p style={{fontSize:12,color:C.mt,marginTop:4}}>120일 일봉 + 스코어링 계산 중</p></div>}

        {!detailLoading&&detail&&(<>
          {/* 종목 헤더 */}
          <div style={{...cs,padding:24,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}><span style={{fontSize:20,fontWeight:800}}>{detail.name}</span>{detail.sector&&detail.sector!=="—"&&<span style={{padding:"2px 8px",borderRadius:6,fontSize:10,fontWeight:600,background:C.purpleL,color:C.purple}}>{detail.sector}</span>}</div><span className="mono" style={{fontSize:12,color:C.mt}}>{detail.code}</span></div>
              <div style={{position:"relative"}}><svg width="80" height="80" viewBox="0 0 80 80" style={{transform:"rotate(-90deg)"}}><circle cx="40" cy="40" r="33" fill="none" stroke={C.grey} strokeWidth="5"/><circle cx="40" cy="40" r="33" fill="none" stroke={probColor(detail.probability)} strokeWidth="5" strokeDasharray={`${(detail.probability/100)*207.3} 207.3`} strokeLinecap="round"/></svg><div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontFamily:"'DM Mono'",fontSize:22,fontWeight:700,color:probColor(detail.probability)}}>{detail.probability}%</div></div>
            </div>
            <div style={{marginTop:16}}><div className="mono" style={{fontSize:30,fontWeight:700,letterSpacing:-1}}>₩{detail.price?.toLocaleString()}</div><span className="mono" style={{fontSize:14,fontWeight:600,color:detail.chg>=0?C.green:C.red}}>{detail.chg>=0?"+":""}{detail.chg}%</span></div>
            <div style={{marginTop:14,padding:"12px 14px",background:probBg(detail.probability),borderRadius:12,display:"flex",alignItems:"center",gap:10}}><Icon name="auto_awesome" size={20} color={probColor(detail.probability)}/><div><div style={{fontSize:13,fontWeight:600,color:probColor(detail.probability)}}>{probDesc(detail.probability)}</div><div style={{fontSize:12,color:C.sub,marginTop:2}}>{detail.reason}</div></div></div>
          </div>

          {/* 차트 */}
          {detail.chartData&&<div style={{...cs,padding:20,marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:14}}><Icon name="candlestick_chart" size={20} color={C.blue}/><span style={{fontSize:15,fontWeight:700}}>차트</span><span style={{fontSize:11,color:C.mt,marginLeft:"auto"}}>{mode==="live"?"실제 데이터":"데모 데이터"} · 120일</span></div>
            <StockChart chartData={detail.chartData}/>
          </div>}

          {/* 스코어 분해 */}
          {detail.features&&<div style={{...cs,padding:24,marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:18}}><Icon name="analytics" size={20} color={C.blue}/><span style={{fontSize:15,fontWeight:700}}>정밀 스코어 분석</span><span className="mono" style={{fontSize:13,color:C.blue,fontWeight:600,marginLeft:"auto"}}>{detail.score}/100</span></div>
            {[
              {icon:"trending_up",label:"돌파 거리",desc:"120일 고점 대비",val:detail.features.breakout,w:settings.w_breakout},
              {icon:"bar_chart",label:"거래량 Z-score",desc:`평균 대비 ${detail.volZRaw||"1.0"}배`,val:detail.features.volumeZ,raw:`${detail.volZRaw||"1.0"}x`,w:settings.w_volumeZ},
              {icon:"show_chart",label:"추세 강도",desc:"MA20 vs MA60",val:detail.features.trend,w:settings.w_trend},
              {icon:"compress",label:"변동성 수축",desc:"볼린저밴드 수축도",val:detail.features.volContraction,w:settings.w_volContraction},
              {icon:"group_work",label:"섹터 상대강도",desc:"업종 내 위치",val:detail.features.sectorRS,w:settings.w_sectorRS},
            ].map((f,i)=><div key={i} style={{marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><Icon name={f.icon} size={18} color={C.sub}/><div><div style={{fontSize:13,fontWeight:600}}>{f.label} <span style={{fontSize:10,color:C.mt,fontWeight:400}}>가중치 {f.w}%</span></div><div style={{fontSize:11,color:C.mt}}>{f.desc}</div></div></div>
                <span className="mono" style={{fontSize:14,fontWeight:700,color:probColor(f.val)}}>{f.raw||f.val}</span>
              </div>
              <div style={{height:6,borderRadius:3,background:C.grey,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,width:`${f.val}%`,background:`linear-gradient(90deg,${probColor(f.val)}88,${probColor(f.val)})`,transition:"width .8s cubic-bezier(.22,1,.36,1)"}}/></div>
            </div>)}
          </div>}

          {/* 매매 참고 (하드코딩 제거, 설정값 기반만) */}
          <div style={{...cs,padding:24,marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16}}><Icon name="assistant_navigation" size={20} color={C.green}/><span style={{fontSize:15,fontWeight:700}}>매매 참고</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div style={{padding:16,background:C.greenL,borderRadius:14}}><div style={{display:"flex",alignItems:"center",gap:4,marginBottom:8}}><Icon name="flag" size={16} color={C.green}/><span style={{fontSize:11,color:C.green,fontWeight:600}}>목표가 (+{settings.targetReturn}%)</span></div><div className="mono" style={{fontSize:22,fontWeight:700,color:C.green}}>₩{Math.round(detail.price*(1+settings.targetReturn/100)).toLocaleString()}</div></div>
              <div style={{padding:16,background:C.redL,borderRadius:14}}><div style={{display:"flex",alignItems:"center",gap:4,marginBottom:8}}><Icon name="shield" size={16} color={C.red}/><span style={{fontSize:11,color:C.red,fontWeight:600}}>손절가 (-{settings.stopLoss}%)</span></div><div className="mono" style={{fontSize:22,fontWeight:700,color:C.red}}>₩{Math.round(detail.price*(1-settings.stopLoss/100)).toLocaleString()}</div></div>
            </div>
            <div style={{display:"flex",gap:16,padding:"12px 0"}}>
              <div style={{flex:1,textAlign:"center"}}><Icon name="schedule" size={20} color={C.mt}/><div style={{fontSize:10,color:C.mt,marginTop:4,marginBottom:2}}>보유기간</div><div className="mono" style={{fontSize:15,fontWeight:700}}>{settings.holdingDays}일</div></div>
              <div style={{flex:1,textAlign:"center"}}><Icon name="balance" size={20} color={C.mt}/><div style={{fontSize:10,color:C.mt,marginTop:4,marginBottom:2}}>손익비</div><div className="mono" style={{fontSize:15,fontWeight:700}}>{(settings.targetReturn/settings.stopLoss).toFixed(1)} : 1</div></div>
            </div>
            <div style={{fontSize:11,color:C.mt,marginTop:8,textAlign:"center"}}>목표가 · 손절가는 설정값 기준 계산이에요</div>
          </div>

          {/* 백테스트 → 준비중 */}
          <ComingSoon icon="history" title="백테스트 성과"/>

          {/* AI 분석 */}
          <div style={{...cs,padding:24,marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:14}}><Icon name="psychology" size={20} color={C.blue}/><span style={{fontSize:15,fontWeight:700}}>AI 분석</span><span style={{fontSize:11,color:C.mt,marginLeft:"auto"}}>뉴스 · 시황 반영</span></div>
            {!analysis&&!analyzing&&<button onClick={handleAnalyze} style={{width:"100%",padding:"14px 0",borderRadius:14,border:"none",background:`linear-gradient(135deg,${C.blue},#00b4d8)`,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Pretendard'",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 4px 16px rgba(49,130,246,.25)"}}><Icon name="auto_awesome" size={20} color="#fff"/>AI에게 분석 요청</button>}
            {analyzing&&<div style={{textAlign:"center",padding:"20px 0"}}><span className="spinner"/><p style={{fontSize:13,color:C.sub,marginTop:10}}>AI가 뉴스와 차트를 종합 분석 중...</p></div>}
            {analysis&&!analyzing&&<div className="fade-in" style={{fontSize:13,lineHeight:2,color:C.tx,whiteSpace:"pre-wrap",wordBreak:"keep-all"}}>{analysis}</div>}
          </div>

          <div style={{padding:"14px 16px",background:C.amberL,borderRadius:14,display:"flex",alignItems:"flex-start",gap:10}}><Icon name="info" size={20} color={C.amber} style={{flexShrink:0,marginTop:1}}/><div style={{fontSize:12,color:C.sub,lineHeight:1.7}}>확률은 규칙 기반 스코어링 추정값이며 미래 수익을 보장하지 않아요. 투자 판단은 본인의 책임이에요.</div></div>
        </>)}
      </div>)}
    </main>
  </div>);
}
