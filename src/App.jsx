import { useState, useMemo, useEffect, useCallback } from "react";

const MONTHS_JP = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const SCHED_DAYS = ["月","火","水","木","金","土","日"];
const DAY_COLORS = ["#60a5fa","#a78bfa","#34d399","#f59e0b","#f87171","#fb923c","#e879f9"];

const PAY_GROUPS = [
  { name:"菊陽体育館・さんふれあ", places:["菊陽体育館","さんふれあ"], payDay:10, color:"#60a5fa" },
  { name:"ホリデイ・熊本テルサ",   places:["ホリデイ","熊本テルサ"],   payDay:15, color:"#a78bfa" },
  { name:"B-fit・GGEast・ビックカメラ", places:["B-fit","GGEast","ビックカメラ"], payDay:20, color:"#34d399" },
  { name:"GG宇城",                 places:["GG宇城"],                  payDay:0,  color:"#f59e0b" },
  { name:"その他・変動",           places:["パーソナル","入門エアロ","コンディショニング","サークル有り週","サークル無し週","菊陽サークル"], payDay:25, color:"#f87171" },
];

function getActualPayDay(year, month, baseDay) {
  const lastDay = new Date(year, month, 0).getDate();
  const day = baseDay === 0 ? lastDay : Math.min(baseDay, lastDay);
  const dow = new Date(year, month-1, day).getDay();
  if (dow === 0) return day-2;
  if (dow === 6) return day-1;
  return day;
}

const DEFAULT_FIXED = [
  { id:1,  day:0, place:"菊陽体育館",    time:"11:10-12:00", fee:3200,  freq:"毎週" },
  { id:2,  day:0, place:"菊陽体育館",    time:"12:10-13:00", fee:3200,  freq:"毎週" },
  { id:3,  day:0, place:"熊本テルサ",    time:"14:30-15:10", fee:2500,  freq:"毎週" },
  { id:4,  day:0, place:"B-fit",         time:"19:15-20:00", fee:2895,  freq:"毎週" },
  { id:5,  day:1, place:"ビックカメラ",  time:"12:00-16:00", fee:5100,  freq:"毎週" },
  { id:7,  day:2, place:"ホリデイ",      time:"11:30-12:15", fee:3000,  freq:"毎週" },
  { id:8,  day:2, place:"ビックカメラ",  time:"13:30-16:00", fee:3525,  freq:"毎週" },
  { id:9,  day:2, place:"GG宇城",        time:"19:00-20:00", fee:4500,  freq:"毎週" },
  { id:11, day:3, place:"ビックカメラ",  time:"14:00-15:30", fee:2475,  freq:"毎週" },
  { id:12, day:3, place:"ビックカメラ",  time:"11:30-15:30", fee:5100,  freq:"毎週" },
  { id:14, day:3, place:"サークル有り週",time:"",            fee:10875, freq:"隔週", note:"サークルあり" },
  { id:15, day:3, place:"サークル無し週",time:"",            fee:5100,  freq:"隔週", note:"サークルなし" },
  { id:16, day:4, place:"GGEast",        time:"12:00-12:45", fee:3874,  freq:"毎週" },
  { id:17, day:4, place:"ビックカメラ",  time:"14:15-16:15", fee:3000,  freq:"毎週" },
  { id:18, day:4, place:"熊本テルサ",    time:"19:40-20:20", fee:2500,  freq:"毎週" },
  { id:19, day:4, place:"熊本テルサ",    time:"20:45-21:25", fee:2500,  freq:"毎週" },
  { id:20, day:5, place:"さんふれあ",    time:"10:00-10:50", fee:3200,  freq:"毎週" },
  { id:21, day:6, place:"ホリデイ",      time:"10:30-11:15", fee:3200,  freq:"毎週" },
  { id:22, day:6, place:"GGEast",        time:"12:30-13:15", fee:3874,  freq:"毎週" },
];

const DEFAULT_VAR = [
  { id:"v1", day:1, place:"入門エアロ",       time:"19:30-20:30", unitPrice:1500, freq:"隔週",  defaultPeople:10 },
  { id:"v2", day:3, place:"パーソナル",        time:"12:30-13:30", unitPrice:5000, freq:"隔週",  defaultPeople:1, unit:"人×1時間" },
  { id:"v3", day:3, place:"コンディショニング",time:"19:30-20:30", unitPrice:1500, freq:"隔週",  defaultPeople:10 },
  { id:"v4", day:6, place:"菊陽サークル",      time:"",            unitPrice:2000, freq:"月1回", defaultPeople:8 },
];

// ── storage helpers ──────────────────────────────────────────
function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function makeDefaultFixedLog(lessons) {
  const log = {};
  lessons.forEach(s => { log[s.id] = { count: s.freq==="毎週"?4:2, active:true }; });
  return log;
}
function makeDefaultVarLog(lessons) {
  const log = {};
  lessons.forEach(s => { log[s.id] = { sessions:[{ people: s.defaultPeople }], active:true }; });
  return log;
}

const TSHIRT_NORMAL = 5000;
const TSHIRT_MEMBER = 4500;

export default function App() {
  const today = new Date();
  const [activeTab, setActiveTab]     = useState("calendar");
  const [calYear,  setCalYear]        = useState(today.getFullYear());
  const [calMonth, setCalMonth]       = useState(today.getMonth()+1);
  const [selectedDay, setSelectedDay] = useState(null);
  const [savedBadge, setSavedBadge]   = useState(false);

  // ── persistent state ─────────────────────────────────────
  const [fixedLessons, setFixedLessons] = useState(() => load("enarize_fixed", DEFAULT_FIXED));
  const [varLessons,   setVarLessons]   = useState(() => load("enarize_var",   DEFAULT_VAR));

  const monthKey = `${calYear}-${String(calMonth).padStart(2,"0")}`;

  const [allFixedLogs, setAllFixedLogs] = useState(() => load("enarize_fixedLogs", {}));
  const [allVarLogs,   setAllVarLogs]   = useState(() => load("enarize_varLogs",   {}));
  const [allSubData,   setAllSubData]   = useState(() => load("enarize_sub",       {}));
  const [allMerch,     setAllMerch]     = useState(() => load("enarize_merch",     {}));
  const [allSpots,     setAllSpots]     = useState(() => load("enarize_spots",     {}));

  // current month slices
  const fixedLog  = allFixedLogs[monthKey] ?? makeDefaultFixedLog(fixedLessons);
  const varLog    = allVarLogs[monthKey]   ?? makeDefaultVarLog(varLessons);
  const subData   = allSubData[monthKey]   ?? { members: 6 };
  const merchSales= allMerch[monthKey]     ?? [];
  const spotEvents= allSpots[monthKey]     ?? [];

  // setters that auto-persist
  const setFixedLog   = useCallback(fn => setAllFixedLogs(prev => { const next={...prev,[monthKey]:typeof fn==="function"?fn(prev[monthKey]??makeDefaultFixedLog(fixedLessons)):fn}; save("enarize_fixedLogs",next); return next; }),[monthKey,fixedLessons]);
  const setVarLog     = useCallback(fn => setAllVarLogs(prev   => { const next={...prev,[monthKey]:typeof fn==="function"?fn(prev[monthKey]??makeDefaultVarLog(varLessons)):fn};   save("enarize_varLogs",next);   return next; }),[monthKey,varLessons]);
  const setSubData    = useCallback(fn => setAllSubData(prev   => { const next={...prev,[monthKey]:typeof fn==="function"?fn(prev[monthKey]??{members:6}):fn};                      save("enarize_sub",next);       return next; }),[monthKey]);
  const setMerchSales = useCallback(fn => setAllMerch(prev     => { const next={...prev,[monthKey]:typeof fn==="function"?fn(prev[monthKey]??[]):fn};                               save("enarize_merch",next);     return next; }),[monthKey]);
  const setSpotEvents = useCallback(fn => setAllSpots(prev     => { const next={...prev,[monthKey]:typeof fn==="function"?fn(prev[monthKey]??[]):fn};                               save("enarize_spots",next);     return next; }),[monthKey]);

  // persist lesson master on change
  useEffect(()=>{ save("enarize_fixed", fixedLessons); },[fixedLessons]);
  useEffect(()=>{ save("enarize_var",   varLessons);   },[varLessons]);

  // flash saved badge
  const flashSaved = () => { setSavedBadge(true); setTimeout(()=>setSavedBadge(false),1500); };

  // ── lesson editing ────────────────────────────────────────
  const [editingFixed, setEditingFixed] = useState(null);
  const [editFixedVal, setEditFixedVal] = useState({});
  const [showAddFixed, setShowAddFixed] = useState(false);
  const [newFixed, setNewFixed] = useState({ place:"", day:0, time:"", fee:"", freq:"毎週", note:"" });

  const [showAddVar, setShowAddVar] = useState(false);
  const [newVar, setNewVar] = useState({ place:"", day:0, time:"", unitPrice:"", freq:"隔週", defaultPeople:10, unit:"人" });

  const [showSpotForm, setShowSpotForm] = useState(false);
  const [spotForm, setSpotForm] = useState({ name:"", date:`${calYear}-${String(calMonth).padStart(2,"0")}-01`, people:1, unitPrice:3000, note:"" });

  const prevMonth = () => { if(calMonth===1){setCalYear(y=>y-1);setCalMonth(12);}else setCalMonth(m=>m-1); setSelectedDay(null); };
  const nextMonth = () => { if(calMonth===12){setCalYear(y=>y+1);setCalMonth(1);}else setCalMonth(m=>m+1); setSelectedDay(null); };
  const monthLabel = `${calYear}年 ${MONTHS_JP[calMonth-1]}`;

  // ── income ────────────────────────────────────────────────
  const getFixed  = s => { const l=fixedLog[s.id];  return l?.active?(l.count*s.fee):0; };
  const getVar    = s => { const l=varLog[s.id];     if(!l?.active)return 0; return l.sessions.reduce((a,x)=>a+x.people*s.unitPrice,0); };

  const fixedIncome = fixedLessons.reduce((s,l)=>s+getFixed(l),0);
  const varIncome   = varLessons.reduce((s,l)=>s+getVar(l),0);
  const subIncome   = subData.members * 1000;
  const merchIncome = merchSales.reduce((s,m)=>s+m.qty*(m.isMember?TSHIRT_MEMBER:TSHIRT_NORMAL),0);
  const spotIncome  = spotEvents.reduce((s,e)=>s+(e.people*e.unitPrice),0);
  const totalIncome = fixedIncome+varIncome+subIncome+merchIncome+spotIncome;

  const byFixedDay = Array.from({length:7},(_,di)=>fixedLessons.filter(s=>s.day===di));
  const byVarDay   = Array.from({length:7},(_,di)=>varLessons.filter(s=>s.day===di));
  const incomeBySchedDay = Array.from({length:7},(_,di)=>
    byFixedDay[di].reduce((s,l)=>s+getFixed(l),0)+byVarDay[di].reduce((s,l)=>s+getVar(l),0)
  );

  // ── paydays ───────────────────────────────────────────────
  const paydays = useMemo(()=>PAY_GROUPS.map(g=>{
    const actual=getActualPayDay(calYear,calMonth,g.payDay);
    const inc=[...fixedLessons,...varLessons]
      .filter(s=>g.places.some(p=>s.place.includes(p)))
      .reduce((sum,s)=>"unitPrice" in s?sum+getVar(s):sum+getFixed(s),0);
    return {...g,actualDay:actual,income:inc};
  }).filter(g=>g.income>0),[calYear,calMonth,fixedLog,varLog,fixedLessons,varLessons]);

  // ── calendar ──────────────────────────────────────────────
  const calDays = useMemo(()=>{
    const first=new Date(calYear,calMonth-1,1).getDay();
    const last=new Date(calYear,calMonth,0).getDate();
    return [...Array(first).fill(null),...Array.from({length:last},(_,i)=>i+1)];
  },[calYear,calMonth]);

  const lessonDates = useMemo(()=>{
    const map={};
    new Array(new Date(calYear,calMonth,0).getDate()).fill(0).forEach((_,i)=>{
      const d=i+1, dow=new Date(calYear,calMonth-1,d).getDay(), si=dow===0?6:dow-1;
      const fl=byFixedDay[si].filter(s=>fixedLog[s.id]?.active);
      const vl=byVarDay[si].filter(s=>varLog[s.id]?.active);
      if(fl.length+vl.length>0) map[d]={fixed:fl,variable:vl};
    });
    return map;
  },[calYear,calMonth,fixedLog,varLog,fixedLessons,varLessons]);

  const paydayMap = useMemo(()=>{
    const m={}; paydays.forEach(g=>{if(!m[g.actualDay])m[g.actualDay]=[];m[g.actualDay].push(g);}); return m;
  },[paydays]);

  const spotMap = useMemo(()=>{
    const m={}; spotEvents.forEach(e=>{const d=parseInt(e.date.split("-")[2]);if(!m[d])m[d]=[];m[d].push(e);}); return m;
  },[spotEvents]);

  const selLessons = selectedDay?(lessonDates[selectedDay]||{fixed:[],variable:[]}):null;
  const selPay     = selectedDay?(paydayMap[selectedDay]||[]):[];
  const selSpots   = selectedDay?(spotMap[selectedDay]||[]):[];

  // ── add/edit helpers ──────────────────────────────────────
  const addFixedLesson = () => {
    if(!newFixed.place||!newFixed.fee) return;
    const lesson={ ...newFixed, id: Date.now(), fee: Number(newFixed.fee) };
    setFixedLessons(prev=>[...prev, lesson]);
    setFixedLog(prev=>({...prev,[lesson.id]:{count:lesson.freq==="毎週"?4:2,active:true}}));
    setNewFixed({place:"",day:0,time:"",fee:"",freq:"毎週",note:""});
    setShowAddFixed(false); flashSaved();
  };
  const addVarLesson = () => {
    if(!newVar.place||!newVar.unitPrice) return;
    const lesson={ ...newVar, id:`v${Date.now()}`, unitPrice:Number(newVar.unitPrice), defaultPeople:Number(newVar.defaultPeople) };
    setVarLessons(prev=>[...prev, lesson]);
    setVarLog(prev=>({...prev,[lesson.id]:{sessions:[{people:lesson.defaultPeople}],active:true}}));
    setNewVar({place:"",day:0,time:"",unitPrice:"",freq:"隔週",defaultPeople:10,unit:"人"});
    setShowAddVar(false); flashSaved();
  };
  const deleteFixed = id => { setFixedLessons(prev=>prev.filter(s=>s.id!==id)); flashSaved(); };
  const deleteVar   = id => { setVarLessons(prev=>prev.filter(s=>s.id!==id)); flashSaved(); };

  const addSpot = () => {
    if(!spotForm.name||!spotForm.date) return;
    setSpotEvents(prev=>[...prev,{id:Date.now(),...spotForm,people:Number(spotForm.people),unitPrice:Number(spotForm.unitPrice)}]);
    setSpotForm({name:"",date:`${calYear}-${String(calMonth).padStart(2,"0")}-01`,people:1,unitPrice:3000,note:""});
    setShowSpotForm(false); flashSaved();
  };

  const F = { fontFamily:"'Noto Sans JP',sans-serif" };

  return (
    <div style={{...F,background:"#0a0a10",minHeight:"100vh",color:"#f0f0f0",maxWidth:480,margin:"0 auto"}}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=DM+Mono:wght@500&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#111128,#0d1b2a)",padding:"16px 18px 0",borderBottom:"1px solid #ffffff10",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
          <div>
            <div style={{fontSize:10,color:"#60a5fa",letterSpacing:3,fontWeight:700}}>たくぴー / ENARIZE</div>
            <div style={{fontSize:20,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>Lesson Income</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {savedBadge&&<div style={{fontSize:10,color:"#34d399",background:"#34d39920",padding:"3px 10px",borderRadius:20,border:"1px solid #34d39940"}}>✓ 保存済み</div>}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:20,marginBottom:10}}>
          <button onClick={prevMonth} style={{background:"none",border:"none",color:"#60a5fa",fontSize:22,cursor:"pointer"}}>‹</button>
          <span style={{fontSize:15,fontWeight:700,minWidth:130,textAlign:"center"}}>{monthLabel}</span>
          <button onClick={nextMonth} style={{background:"none",border:"none",color:"#60a5fa",fontSize:22,cursor:"pointer"}}>›</button>
        </div>
        <div style={{display:"flex",overflowX:"auto"}}>
          {[["calendar","📅 カレンダー"],["variable","📝 変動入力"],["lessons","⚙️ レッスン管理"],["merch","👕 物販"],["analysis","📊 分析"]].map(([key,label])=>(
            <button key={key} onClick={()=>setActiveTab(key)}
              style={{flexShrink:0,padding:"9px 12px",background:"none",border:"none",borderBottom:activeTab===key?"2px solid #60a5fa":"2px solid transparent",color:activeTab===key?"#60a5fa":"#555",fontWeight:700,fontSize:11,cursor:"pointer",...F}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:14}}>
        {/* Total card */}
        <div style={{background:"linear-gradient(135deg,#1a2744,#111128)",borderRadius:14,padding:"14px 16px",marginBottom:14,border:"1px solid #60a5fa25"}}>
          <div style={{fontSize:10,color:"#60a5fa80",letterSpacing:2,marginBottom:6}}>今月の収入見込み</div>
          <div style={{fontSize:34,fontWeight:700,fontFamily:"'DM Mono',monospace",marginBottom:10}}>¥{totalIncome.toLocaleString()}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
            {[["固定",fixedIncome,"#60a5fa"],["変動",varIncome,"#a78bfa"],["サブスク",subIncome,"#34d399"],["物販",merchIncome,"#fb923c"],["スポット",spotIncome,"#f87171"]].map(([l,v,c])=>(
              <div key={l} style={{textAlign:"center",background:"#ffffff06",borderRadius:8,padding:"6px 4px"}}>
                <div style={{fontSize:9,color:"#555",marginBottom:3}}>{l}</div>
                <div style={{fontSize:11,fontWeight:700,color:c,fontFamily:"'DM Mono',monospace"}}>¥{v.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── CALENDAR ── */}
        {activeTab==="calendar"&&(
          <div>
            <div style={{background:"#141420",borderRadius:14,padding:12,marginBottom:14,border:"1px solid #ffffff08"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:6}}>
                {["日","月","火","水","木","金","土"].map((d,i)=>(
                  <div key={d} style={{textAlign:"center",fontSize:11,fontWeight:700,color:i===0?"#f87171":i===6?"#60a5fa":"#555",padding:"4px 0"}}>{d}</div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
                {calDays.map((d,i)=>{
                  if(!d) return <div key={`e-${i}`}/>;
                  const isToday=d===today.getDate()&&calMonth===today.getMonth()+1&&calYear===today.getFullYear();
                  const isSel=selectedDay===d;
                  const dow=new Date(calYear,calMonth-1,d).getDay();
                  return (
                    <button key={d} onClick={()=>setSelectedDay(isSel?null:d)}
                      style={{aspectRatio:"1",borderRadius:8,border:isSel?"2px solid #60a5fa":isToday?"2px solid #60a5fa40":"2px solid transparent",background:isSel?"#1e3a5f":isToday?"#1a1a2e":"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,padding:2}}>
                      <span style={{fontSize:13,fontWeight:isToday?700:400,color:isSel?"#60a5fa":dow===0?"#f87171":dow===6?"#93c5fd":"#f0f0f0"}}>{d}</span>
                      <div style={{display:"flex",gap:2}}>
                        {lessonDates[d]&&<div style={{width:4,height:4,borderRadius:"50%",background:"#a78bfa"}}/>}
                        {paydayMap[d]&&<div style={{width:4,height:4,borderRadius:"50%",background:"#f59e0b"}}/>}
                        {spotMap[d]?.length>0&&<div style={{width:4,height:4,borderRadius:"50%",background:"#f87171"}}/>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div style={{display:"flex",gap:12,marginTop:10,paddingTop:10,borderTop:"1px solid #ffffff08",justifyContent:"center"}}>
                {[["#a78bfa","レッスン"],["#f59e0b","給料日"],["#f87171","スポット"]].map(([c,l])=>(
                  <div key={l} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#666"}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:c}}/>{l}
                  </div>
                ))}
              </div>
            </div>

            {selectedDay&&(
              <div style={{background:"#141420",borderRadius:14,padding:16,marginBottom:14,border:"1px solid #60a5fa20"}}>
                <div style={{fontSize:14,fontWeight:700,marginBottom:12,color:"#60a5fa"}}>{calMonth}月{selectedDay}日</div>
                {selPay.length>0&&<div style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:"#f59e0b",marginBottom:8}}>💴 給料日</div>
                  {selPay.map(g=>(
                    <div key={g.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:"#f59e0b12",borderRadius:8,marginBottom:6,border:"1px solid #f59e0b20"}}>
                      <div style={{fontSize:13,fontWeight:700}}>{g.name}</div>
                      <div style={{fontSize:15,fontWeight:700,color:"#f59e0b",fontFamily:"'DM Mono',monospace"}}>¥{g.income.toLocaleString()}</div>
                    </div>
                  ))}
                </div>}
                {selLessons&&(selLessons.fixed.length+selLessons.variable.length)>0&&(
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,color:"#a78bfa",marginBottom:8}}>🏃 レッスン</div>
                    {selLessons.fixed.map(s=>(
                      <div key={s.id} style={{display:"flex",justifyContent:"space-between",padding:"7px 12px",background:"#a78bfa10",borderRadius:8,marginBottom:5}}>
                        <div><div style={{fontSize:13,fontWeight:600}}>{s.place}</div>{s.time&&<div style={{fontSize:11,color:"#555"}}>{s.time}</div>}</div>
                        <div style={{fontSize:13,color:"#a78bfa",fontFamily:"'DM Mono',monospace"}}>¥{s.fee.toLocaleString()}</div>
                      </div>
                    ))}
                    {selLessons.variable.map(s=>(
                      <div key={s.id} style={{display:"flex",justifyContent:"space-between",padding:"7px 12px",background:"#a78bfa10",borderRadius:8,marginBottom:5}}>
                        <div><div style={{fontSize:13,fontWeight:600}}>{s.place} <span style={{fontSize:10,color:"#f59e0b"}}>変動</span></div>{s.time&&<div style={{fontSize:11,color:"#555"}}>{s.time}</div>}</div>
                        <div style={{fontSize:13,color:"#f59e0b",fontFamily:"'DM Mono',monospace"}}>¥{getVar(s).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
                {selSpots.map(e=>(
                  <div key={e.id} style={{display:"flex",justifyContent:"space-between",padding:"7px 12px",background:"#f8717110",borderRadius:8,marginBottom:5}}>
                    <div><div style={{fontSize:13,fontWeight:600}}>🎯 {e.name}</div><div style={{fontSize:11,color:"#555"}}>{e.people}人 × ¥{Number(e.unitPrice).toLocaleString()}</div></div>
                    <div style={{fontSize:13,color:"#f87171",fontFamily:"'DM Mono',monospace"}}>¥{(e.people*e.unitPrice).toLocaleString()}</div>
                  </div>
                ))}
                {selPay.length===0&&(!selLessons||(selLessons.fixed.length+selLessons.variable.length)===0)&&selSpots.length===0&&(
                  <div style={{textAlign:"center",color:"#333",fontSize:13}}>この日は予定なし</div>
                )}
              </div>
            )}

            {/* Payday list */}
            <div style={{background:"#141420",borderRadius:14,padding:16,marginBottom:14,border:"1px solid #ffffff08"}}>
              <div style={{fontSize:11,color:"#555",marginBottom:12}}>📅 今月の給料日スケジュール</div>
              {paydays.sort((a,b)=>a.actualDay-b.actualDay).map(g=>{
                const isPast=g.actualDay<today.getDate()&&calMonth===today.getMonth()+1&&calYear===today.getFullYear();
                return (
                  <div key={g.name} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #ffffff06",opacity:isPast?0.5:1}}>
                    <div style={{width:36,height:36,borderRadius:10,background:g.color+"22",border:`1.5px solid ${g.color}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{fontSize:12,fontWeight:700,color:g.color,fontFamily:"'DM Mono',monospace"}}>{g.actualDay}</span>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:700,marginBottom:1}}>{g.name}</div>
                      <div style={{fontSize:10,color:"#555"}}>{calMonth}月{g.actualDay}日{isPast?"（支払済）":"（予定）"}</div>
                    </div>
                    <div style={{fontSize:15,fontWeight:700,color:g.color,fontFamily:"'DM Mono',monospace"}}>¥{g.income.toLocaleString()}</div>
                  </div>
                );
              })}
            </div>

            <button onClick={()=>setShowSpotForm(true)} style={{width:"100%",padding:14,borderRadius:12,border:"1px dashed #f8717140",background:"#f8717108",color:"#f87171",fontWeight:700,fontSize:14,cursor:"pointer",...F}}>
              ＋ スポットイベントを追加
            </button>
            {spotEvents.map(e=>(
              <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#141420",borderRadius:10,padding:"10px 14px",marginTop:8,border:"1px solid #f8717120"}}>
                <div><div style={{fontSize:13,fontWeight:700}}>🎯 {e.name}</div><div style={{fontSize:11,color:"#555"}}>{e.date} · {e.people}人 × ¥{Number(e.unitPrice).toLocaleString()}</div></div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14,fontWeight:700,color:"#f87171",fontFamily:"'DM Mono',monospace"}}>¥{(e.people*e.unitPrice).toLocaleString()}</span>
                  <button onClick={()=>{setSpotEvents(prev=>prev.filter(x=>x.id!==e.id));flashSaved();}} style={{background:"#ff444420",border:"none",borderRadius:6,padding:"3px 8px",color:"#f87171",fontSize:11,cursor:"pointer"}}>削除</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── VARIABLE ── */}
        {activeTab==="variable"&&(
          <div>
            <div style={{fontSize:12,color:"#555",marginBottom:14}}>人数によって変わるレッスンを入力 👇</div>
            {varLessons.map(s=>{
              const l=varLog[s.id]??{sessions:[{people:s.defaultPeople}],active:true};
              const inc=l.active?l.sessions.reduce((a,x)=>a+x.people*s.unitPrice,0):0;
              return (
                <div key={s.id} style={{background:"#141420",borderRadius:14,padding:16,marginBottom:12,border:"1px solid #ffffff08"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                    <div>
                      <div style={{fontSize:14,fontWeight:700}}>{s.place}</div>
                      <div style={{fontSize:11,color:"#555"}}>{s.time&&<span style={{marginRight:6}}>{s.time}</span>}<span style={{color:s.freq==="隔週"?"#f59e0b":"#e879f9"}}>{s.freq}</span> · ¥{s.unitPrice.toLocaleString()}/{s.unit||"人"}</div>
                    </div>
                    <div style={{fontSize:16,fontWeight:700,color:"#a78bfa",fontFamily:"'DM Mono',monospace"}}>¥{inc.toLocaleString()}</div>
                  </div>
                  {l.sessions.map((sess,si)=>(
                    <div key={si} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,background:"#0f0f1a",borderRadius:10,padding:"10px 12px"}}>
                      <div style={{fontSize:12,color:"#555",minWidth:50}}>{si+1}回目</div>
                      <button onClick={()=>{setVarLog(p=>{const n={...p,[s.id]:{...l,sessions:l.sessions.map((x,i)=>i===si?{people:Math.max(1,x.people-1)}:x)}};return n;});flashSaved();}} style={cBtn}>－</button>
                      <span style={{fontSize:20,fontWeight:700,minWidth:40,textAlign:"center",fontFamily:"'DM Mono',monospace"}}>{sess.people}</span>
                      <button onClick={()=>{setVarLog(p=>{const n={...p,[s.id]:{...l,sessions:l.sessions.map((x,i)=>i===si?{people:x.people+1}:x)}};return n;});flashSaved();}} style={cBtn}>＋</button>
                      <span style={{fontSize:12,color:"#555"}}>人</span>
                      <span style={{fontSize:12,color:"#a78bfa",marginLeft:"auto",fontFamily:"'DM Mono',monospace"}}>¥{(sess.people*s.unitPrice).toLocaleString()}</span>
                      {l.sessions.length>1&&<button onClick={()=>{setVarLog(p=>({...p,[s.id]:{...l,sessions:l.sessions.filter((_,i)=>i!==si)}}));flashSaved();}} style={{background:"#ff444420",border:"none",borderRadius:6,padding:"3px 7px",color:"#f87171",fontSize:11,cursor:"pointer"}}>削除</button>}
                    </div>
                  ))}
                  <button onClick={()=>{setVarLog(p=>({...p,[s.id]:{...l,sessions:[...l.sessions,{people:s.defaultPeople}]}}));flashSaved();}} style={{width:"100%",padding:"8px",borderRadius:8,border:"1px dashed #a78bfa40",background:"#a78bfa08",color:"#a78bfa",fontSize:12,cursor:"pointer",...F}}>＋ 回数を追加</button>
                </div>
              );
            })}

            {/* Subscription */}
            <div style={{background:"#141420",borderRadius:14,padding:16,marginBottom:12,border:"1px solid #34d39920"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div><div style={{fontSize:14,fontWeight:700}}>ENARIZE MEMBERS</div><div style={{fontSize:11,color:"#555"}}>サブスク · ¥1,000/月</div></div>
                <div style={{fontSize:16,fontWeight:700,color:"#34d399",fontFamily:"'DM Mono',monospace"}}>¥{subIncome.toLocaleString()}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12,background:"#0f0f1a",borderRadius:10,padding:"10px 12px"}}>
                <span style={{fontSize:12,color:"#555"}}>今月の請求人数</span>
                <button onClick={()=>{setSubData(p=>({...p,members:Math.max(0,(p?.members??6)-1)}));flashSaved();}} style={cBtn}>－</button>
                <span style={{fontSize:22,fontWeight:700,minWidth:40,textAlign:"center",fontFamily:"'DM Mono',monospace",color:"#34d399"}}>{subData.members}</span>
                <button onClick={()=>{setSubData(p=>({...p,members:(p?.members??6)+1}));flashSaved();}} style={cBtn}>＋</button>
                <span style={{fontSize:12,color:"#555"}}>人</span>
              </div>
              <div style={{fontSize:11,color:"#555",marginTop:8}}>※ 1年分一括払いの方は除外済み</div>
            </div>
          </div>
        )}

        {/* ── LESSON MANAGEMENT ── */}
        {activeTab==="lessons"&&(
          <div>
            <div style={{fontSize:12,color:"#555",marginBottom:14}}>レッスンの追加・削除・単価変更ができるよ 👇</div>

            {/* Fixed lessons */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700,color:"#60a5fa"}}>固定レッスン</div>
              <button onClick={()=>setShowAddFixed(true)} style={{fontSize:12,color:"#60a5fa",background:"#60a5fa15",border:"1px solid #60a5fa30",borderRadius:8,padding:"4px 12px",cursor:"pointer",...F}}>＋ 追加</button>
            </div>
            {SCHED_DAYS.map((day,di)=>{
              const lessons=byFixedDay[di];
              if(!lessons.length) return null;
              return (
                <div key={di} style={{marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:DAY_COLORS[di]+"22",border:`1.5px solid ${DAY_COLORS[di]}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:DAY_COLORS[di]}}>{day}</div>
                    <span style={{fontSize:11,color:"#555"}}>曜日</span>
                  </div>
                  {lessons.map(s=>(
                    <div key={s.id} style={{background:"#141420",borderRadius:10,padding:"10px 14px",marginBottom:6,marginLeft:28,border:"1px solid #ffffff08",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600}}>{s.place}</div>
                        <div style={{fontSize:11,color:"#555"}}>{s.time&&<span style={{marginRight:6}}>{s.time}</span>}<span style={{color:s.freq==="隔週"?"#f59e0b":"#60a5fa"}}>{s.freq}</span></div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:14,fontWeight:700,color:"#60a5fa",fontFamily:"'DM Mono',monospace"}}>¥{s.fee.toLocaleString()}</span>
                        <button onClick={()=>{deleteFixed(s.id);}} style={{background:"#ff444420",border:"none",borderRadius:6,padding:"3px 8px",color:"#f87171",fontSize:11,cursor:"pointer"}}>削除</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}

            <div style={{height:1,background:"#ffffff08",margin:"16px 0"}}/>

            {/* Variable lessons */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700,color:"#a78bfa"}}>変動レッスン</div>
              <button onClick={()=>setShowAddVar(true)} style={{fontSize:12,color:"#a78bfa",background:"#a78bfa15",border:"1px solid #a78bfa30",borderRadius:8,padding:"4px 12px",cursor:"pointer",...F}}>＋ 追加</button>
            </div>
            {varLessons.map(s=>(
              <div key={s.id} style={{background:"#141420",borderRadius:10,padding:"10px 14px",marginBottom:8,border:"1px solid #ffffff08",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600}}>{s.place} <span style={{fontSize:10,color:"#a78bfa",background:"#a78bfa15",padding:"1px 5px",borderRadius:4}}>変動</span></div>
                  <div style={{fontSize:11,color:"#555"}}>{SCHED_DAYS[s.day]}曜 {s.time&&<span style={{marginRight:6}}>{s.time}</span>}<span style={{color:s.freq==="隔週"?"#f59e0b":"#e879f9"}}>{s.freq}</span></div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14,fontWeight:700,color:"#a78bfa",fontFamily:"'DM Mono',monospace"}}>¥{s.unitPrice.toLocaleString()}/{s.unit||"人"}</span>
                  <button onClick={()=>deleteVar(s.id)} style={{background:"#ff444420",border:"none",borderRadius:6,padding:"3px 8px",color:"#f87171",fontSize:11,cursor:"pointer"}}>削除</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── MERCH ── */}
        {activeTab==="merch"&&(
          <div>
            <div style={{background:"#141420",borderRadius:14,padding:16,marginBottom:12,border:"1px solid #fb923c20"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{fontSize:14,fontWeight:700}}>👕 Tシャツ物販</div>
                <div style={{fontSize:18,fontWeight:700,color:"#fb923c",fontFamily:"'DM Mono',monospace"}}>¥{merchIncome.toLocaleString()}</div>
              </div>
              <div style={{fontSize:11,color:"#555",marginBottom:14}}>通常¥5,000 / メンバー¥4,500（10%OFF）</div>
              {merchSales.map(m=>(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,background:"#0f0f1a",borderRadius:10,padding:"10px 12px",marginBottom:8}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                      {[false,true].map(isMem=>(
                        <button key={String(isMem)} onClick={()=>{setMerchSales(p=>p.map(x=>x.id===m.id?{...x,isMember:isMem}:x));flashSaved();}}
                          style={{padding:"3px 10px",borderRadius:6,border:m.isMember===isMem?`2px solid ${isMem?"#34d399":"#fb923c"}`:"2px solid #ffffff15",background:m.isMember===isMem?`${isMem?"#34d399":"#fb923c"}20`:"transparent",color:m.isMember===isMem?isMem?"#34d399":"#fb923c":"#555",fontSize:11,cursor:"pointer",...F}}>
                          {isMem?"メンバー":"通常"}
                        </button>
                      ))}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <button onClick={()=>{setMerchSales(p=>p.map(x=>x.id===m.id?{...x,qty:Math.max(1,x.qty-1)}:x));flashSaved();}} style={{...cBtn,width:28,height:28}}>－</button>
                      <span style={{fontSize:16,fontWeight:700,minWidth:30,textAlign:"center",fontFamily:"'DM Mono',monospace"}}>{m.qty}</span>
                      <button onClick={()=>{setMerchSales(p=>p.map(x=>x.id===m.id?{...x,qty:x.qty+1}:x));flashSaved();}} style={{...cBtn,width:28,height:28}}>＋</button>
                      <span style={{fontSize:12,color:"#555"}}>枚</span>
                      <span style={{fontSize:13,fontWeight:700,color:"#fb923c",marginLeft:"auto",fontFamily:"'DM Mono',monospace"}}>¥{(m.qty*(m.isMember?TSHIRT_MEMBER:TSHIRT_NORMAL)).toLocaleString()}</span>
                    </div>
                  </div>
                  <button onClick={()=>{setMerchSales(p=>p.filter(x=>x.id!==m.id));flashSaved();}} style={{background:"#ff444420",border:"none",borderRadius:6,padding:"4px 8px",color:"#f87171",fontSize:11,cursor:"pointer"}}>削除</button>
                </div>
              ))}
              <button onClick={()=>{setMerchSales(p=>[...p,{id:Date.now(),qty:1,isMember:false}]);flashSaved();}} style={{width:"100%",padding:12,borderRadius:10,border:"1px dashed #fb923c40",background:"#fb923c08",color:"#fb923c",fontWeight:700,fontSize:13,cursor:"pointer",...F}}>＋ 販売を追加</button>
            </div>
          </div>
        )}

        {/* ── ANALYSIS ── */}
        {activeTab==="analysis"&&(
          <div>
            <div style={{background:"#141420",borderRadius:14,padding:16,marginBottom:12,border:"1px solid #ffffff08"}}>
              <div style={{fontSize:11,color:"#555",marginBottom:14}}>📊 収入内訳</div>
              {[["固定レッスン",fixedIncome,"#60a5fa"],["変動レッスン",varIncome,"#a78bfa"],["サブスク",subIncome,"#34d399"],["物販",merchIncome,"#fb923c"],["スポット",spotIncome,"#f87171"]].map(([l,v,c])=>{
                const pct=totalIncome>0?v/totalIncome*100:0;
                return (
                  <div key={l} style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:12}}>{l}</span>
                      <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:c}}>¥{v.toLocaleString()} <span style={{color:"#444",fontSize:10}}>({pct.toFixed(0)}%)</span></span>
                    </div>
                    <div style={{height:6,background:"#ffffff08",borderRadius:3}}>
                      <div style={{height:"100%",width:`${pct}%`,background:c,borderRadius:3}}/>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{background:"#141420",borderRadius:14,padding:16,border:"1px solid #ffffff08"}}>
              <div style={{fontSize:11,color:"#555",marginBottom:14}}>📅 曜日別収入</div>
              {SCHED_DAYS.map((day,di)=>{
                const pct=totalIncome>0?incomeBySchedDay[di]/totalIncome*100:0;
                return (
                  <div key={di} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:DAY_COLORS[di]+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:DAY_COLORS[di]}}>{day}</div>
                    <div style={{flex:1}}><div style={{height:6,background:"#ffffff08",borderRadius:3}}><div style={{height:"100%",width:`${pct}%`,background:DAY_COLORS[di],borderRadius:3}}/></div></div>
                    <div style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:DAY_COLORS[di],minWidth:80,textAlign:"right"}}>¥{incomeBySchedDay[di].toLocaleString()}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── MODALS ── */}

      {/* Add fixed lesson */}
      {showAddFixed&&(
        <Modal onClose={()=>setShowAddFixed(false)} title="➕ 固定レッスン追加" color="#60a5fa">
          <Label>場所名</Label><Input value={newFixed.place} onChange={v=>setNewFixed(f=>({...f,place:v}))} placeholder="例：○○体育館"/>
          <Label>曜日</Label>
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
            {SCHED_DAYS.map((d,i)=>(
              <button key={i} onClick={()=>setNewFixed(f=>({...f,day:i}))}
                style={{padding:"5px 12px",borderRadius:8,border:newFixed.day===i?`2px solid ${DAY_COLORS[i]}`:"2px solid #ffffff15",background:newFixed.day===i?DAY_COLORS[i]+"22":"transparent",color:newFixed.day===i?DAY_COLORS[i]:"#888",fontSize:12,cursor:"pointer",...F}}>{d}</button>
            ))}
          </div>
          <Label>時間</Label><Input value={newFixed.time} onChange={v=>setNewFixed(f=>({...f,time:v}))} placeholder="例：10:00-11:00"/>
          <Label>1回の報酬（円）</Label><Input type="number" value={newFixed.fee} onChange={v=>setNewFixed(f=>({...f,fee:v}))} placeholder="例：3000"/>
          <Label>頻度</Label>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {["毎週","隔週","月1回"].map(fr=>(
              <button key={fr} onClick={()=>setNewFixed(f=>({...f,freq:fr}))}
                style={{flex:1,padding:"7px",borderRadius:8,border:newFixed.freq===fr?"2px solid #60a5fa":"2px solid #ffffff15",background:newFixed.freq===fr?"#60a5fa20":"transparent",color:newFixed.freq===fr?"#60a5fa":"#888",fontSize:12,cursor:"pointer",...F}}>{fr}</button>
            ))}
          </div>
          <button onClick={addFixedLesson} style={{width:"100%",padding:13,borderRadius:12,border:"none",background:"#60a5fa",color:"#0a0a10",fontWeight:700,fontSize:14,cursor:"pointer",...F}}>追加する</button>
        </Modal>
      )}

      {/* Add var lesson */}
      {showAddVar&&(
        <Modal onClose={()=>setShowAddVar(false)} title="➕ 変動レッスン追加" color="#a78bfa">
          <Label>場所名</Label><Input value={newVar.place} onChange={v=>setNewVar(f=>({...f,place:v}))} placeholder="例：○○サークル"/>
          <Label>曜日</Label>
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
            {SCHED_DAYS.map((d,i)=>(
              <button key={i} onClick={()=>setNewVar(f=>({...f,day:i}))}
                style={{padding:"5px 12px",borderRadius:8,border:newVar.day===i?`2px solid ${DAY_COLORS[i]}`:"2px solid #ffffff15",background:newVar.day===i?DAY_COLORS[i]+"22":"transparent",color:newVar.day===i?DAY_COLORS[i]:"#888",fontSize:12,cursor:"pointer",...F}}>{d}</button>
            ))}
          </div>
          <Label>時間</Label><Input value={newVar.time} onChange={v=>setNewVar(f=>({...f,time:v}))} placeholder="例：19:00-20:00"/>
          <Label>1人あたりの単価（円）</Label><Input type="number" value={newVar.unitPrice} onChange={v=>setNewVar(f=>({...f,unitPrice:v}))} placeholder="例：1500"/>
          <Label>デフォルト人数</Label><Input type="number" value={newVar.defaultPeople} onChange={v=>setNewVar(f=>({...f,defaultPeople:Number(v)}))} placeholder="例：10"/>
          <Label>頻度</Label>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {["毎週","隔週","月1回"].map(fr=>(
              <button key={fr} onClick={()=>setNewVar(f=>({...f,freq:fr}))}
                style={{flex:1,padding:"7px",borderRadius:8,border:newVar.freq===fr?"2px solid #a78bfa":"2px solid #ffffff15",background:newVar.freq===fr?"#a78bfa20":"transparent",color:newVar.freq===fr?"#a78bfa":"#888",fontSize:12,cursor:"pointer",...F}}>{fr}</button>
            ))}
          </div>
          <button onClick={addVarLesson} style={{width:"100%",padding:13,borderRadius:12,border:"none",background:"#a78bfa",color:"#0a0a10",fontWeight:700,fontSize:14,cursor:"pointer",...F}}>追加する</button>
        </Modal>
      )}

      {/* Spot form */}
      {showSpotForm&&(
        <Modal onClose={()=>setShowSpotForm(false)} title="🎯 スポットイベント追加" color="#f87171">
          <Label>イベント名</Label><Input value={spotForm.name} onChange={v=>setSpotForm(f=>({...f,name:v}))} placeholder="例：特別エアロイベント"/>
          <Label>日付</Label><Input type="date" value={spotForm.date} onChange={v=>setSpotForm(f=>({...f,date:v}))}/>
          <Label>単価（円/人）</Label><Input type="number" value={spotForm.unitPrice} onChange={v=>setSpotForm(f=>({...f,unitPrice:v}))}/>
          <Label>参加人数</Label>
          <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:14}}>
            <button onClick={()=>setSpotForm(f=>({...f,people:Math.max(1,f.people-1)}))} style={cBtn}>－</button>
            <span style={{fontSize:24,fontWeight:700,minWidth:50,textAlign:"center",fontFamily:"'DM Mono',monospace"}}>{spotForm.people}</span>
            <button onClick={()=>setSpotForm(f=>({...f,people:f.people+1}))} style={cBtn}>＋</button>
            <span style={{fontSize:13,color:"#f87171",fontFamily:"'DM Mono',monospace",marginLeft:8}}>→ ¥{(spotForm.people*spotForm.unitPrice).toLocaleString()}</span>
          </div>
          <button onClick={addSpot} style={{width:"100%",padding:13,borderRadius:12,border:"none",background:"#f87171",color:"#0a0a10",fontWeight:700,fontSize:14,cursor:"pointer",...F}}>追加する</button>
        </Modal>
      )}
    </div>
  );
}

// ── small components ──────────────────────────────────────────
function Modal({onClose,title,color,children}){
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",display:"flex",alignItems:"flex-end",zIndex:200}} onClick={onClose}>
      <div style={{background:"#1a1a2e",width:"100%",maxWidth:480,margin:"0 auto",borderRadius:"20px 20px 0 0",padding:24,paddingBottom:36,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:"#333",borderRadius:2,margin:"0 auto 18px"}}/>
        <div style={{fontSize:16,fontWeight:700,marginBottom:18,color}}>{title}</div>
        {children}
      </div>
    </div>
  );
}
function Label({children}){ return <div style={{fontSize:12,color:"#888",marginBottom:6}}>{children}</div>; }
function Input({value,onChange,placeholder,type="text"}){
  return <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #ffffff20",background:"#0f0f1a",color:"#f0f0f0",fontSize:14,marginBottom:14,boxSizing:"border-box",fontFamily:"'Noto Sans JP',sans-serif",outline:"none"}}/>;
}
const cBtn = {width:36,height:36,borderRadius:8,border:"1px solid #ffffff15",background:"#0f0f1a",color:"#f0f0f0",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"};
