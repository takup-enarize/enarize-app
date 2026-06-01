import { useState, useMemo, useEffect, useCallback } from "react";

const MONTHS_JP = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const SCHED_DAYS = ["月","火","水","木","金","土","日"];
const DAY_COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#f97316","#ec4899"];

const PAY_GROUPS = [
  { name:"菊陽体育館・さんふれあ", places:["菊陽体育館","さんふれあ"], payDay:10, color:"#3b82f6" },
  { name:"ホリデイ・熊本テルサ",   places:["ホリデイ","熊本テルサ"],   payDay:15, color:"#8b5cf6" },
  { name:"B-fit・GGEast・ビックカメラ", places:["B-fit","GGEast","ビックカメラ"], payDay:20, color:"#10b981" },
  { name:"GG宇城",                 places:["GG宇城"],                  payDay:0,  color:"#f59e0b" },
  { name:"その他・変動",           places:["パーソナル","入門エアロ","コンディショニング","サークル有り週","サークル無し週","菊陽サークル"], payDay:25, color:"#ef4444" },
];

function getActualPayDay(year, month, baseDay) {
  const lastDay = new Date(year, month, 0).getDate();
  const day = baseDay === 0 ? lastDay : Math.min(baseDay, lastDay);
  const dow = new Date(year, month-1, day).getDay();
  if (dow === 0) return day-2;
  if (dow === 6) return day-1;
  return day;
}

// 5のつく日チェック
function has5(day) { return day % 10 === 5; }

const DEFAULT_FIXED = [
  { id:1,  day:0, place:"菊陽体育館",    time:"11:10-12:00", fee:3200,  freq:"毎週", holiday5:true },
  { id:2,  day:0, place:"菊陽体育館",    time:"12:10-13:00", fee:3200,  freq:"毎週", holiday5:true },
  { id:3,  day:0, place:"熊本テルサ",    time:"14:30-15:10", fee:2500,  freq:"毎週" },
  { id:4,  day:0, place:"B-fit",         time:"19:15-20:00", fee:2895,  freq:"毎週" },
  { id:5,  day:1, place:"ビックカメラ",  time:"12:00-16:00", fee:5100,  freq:"毎週" },
  { id:7,  day:2, place:"ホリデイ",      time:"11:30-12:15", fee:3000,  freq:"毎週" },
  { id:8,  day:2, place:"ビックカメラ",  time:"13:30-16:00", fee:3525,  freq:"毎週" },
  { id:9,  day:2, place:"GG宇城",        time:"19:00-20:00", fee:4500,  freq:"毎週" },
  { id:11, day:3, place:"ビックカメラ",  time:"14:00-15:30", fee:2475,  freq:"毎週" },
  { id:12, day:3, place:"ビックカメラ",  time:"11:30-15:30", fee:5100,  freq:"毎週" },
  { id:14, day:3, place:"サークル有り週",time:"",            fee:10875, freq:"隔週" },
  { id:15, day:3, place:"サークル無し週",time:"",            fee:5100,  freq:"隔週" },
  { id:16, day:4, place:"GGEast",        time:"12:00-12:45", fee:3874,  freq:"毎週" },
  { id:17, day:4, place:"ビックカメラ",  time:"14:15-16:15", fee:3000,  freq:"毎週" },
  { id:18, day:4, place:"熊本テルサ",    time:"19:40-20:20", fee:2500,  freq:"毎週" },
  { id:19, day:4, place:"熊本テルサ",    time:"20:45-21:25", fee:2500,  freq:"毎週" },
  { id:20, day:5, place:"さんふれあ",    time:"10:00-10:50", fee:3200,  freq:"毎週", holiday5:true },
  { id:21, day:6, place:"ホリデイ",      time:"10:30-11:15", fee:3200,  freq:"毎週" },
  { id:22, day:6, place:"GGEast",        time:"12:30-13:15", fee:3874,  freq:"毎週" },
];

const DEFAULT_VAR = [
  { id:"v1", day:1, place:"入門エアロ",       time:"19:30-20:30", unitPrice:1500, freq:"隔週",  defaultPeople:10 },
  { id:"v2", day:3, place:"パーソナル",        time:"12:30-13:30", unitPrice:5000, freq:"隔週",  defaultPeople:1 },
  { id:"v3", day:3, place:"コンディショニング",time:"19:30-20:30", unitPrice:1500, freq:"隔週",  defaultPeople:10 },
  { id:"v4", day:6, place:"菊陽サークル",      time:"",            unitPrice:2000, freq:"月1回", defaultPeople:8 },
];

const EXPENSE_CATS = ["交通費","駐車場","スタジオ代","その他"];
const EXPENSE_COLORS = { "交通費":"#3b82f6", "駐車場":"#f59e0b", "スタジオ代":"#8b5cf6", "その他":"#6b7280" };

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

function makeDefaultFixedLog(lessons) {
  const log = {};
  lessons.forEach(s => { log[s.id] = { count: s.freq==="毎週"?4:2, active:true, skipDates:[] }; });
  return log;
}
function makeDefaultVarLog(lessons) {
  const log = {};
  lessons.forEach(s => { log[s.id] = { sessions:[{ people: s.defaultPeople }], active:true }; });
  return log;
}

const TSHIRT_NORMAL = 5000;
const TSHIRT_MEMBER = 4500;
const F = { fontFamily:"'Noto Sans JP',sans-serif" };

export default function App() {
  const today = new Date();
  const [activeTab, setActiveTab]     = useState("calendar");
  const [calYear,  setCalYear]        = useState(today.getFullYear());
  const [calMonth, setCalMonth]       = useState(today.getMonth()+1);
  const [selectedDay, setSelectedDay] = useState(null);
  const [savedBadge, setSavedBadge]   = useState(false);

  const [fixedLessons, setFixedLessons] = useState(() => load("enarize_fixed", DEFAULT_FIXED));
  const [varLessons,   setVarLessons]   = useState(() => load("enarize_var",   DEFAULT_VAR));

  const monthKey = `${calYear}-${String(calMonth).padStart(2,"0")}`;

  const [allFixedLogs, setAllFixedLogs] = useState(() => load("enarize_fixedLogs", {}));
  const [allVarLogs,   setAllVarLogs]   = useState(() => load("enarize_varLogs",   {}));
  const [allSubData,   setAllSubData]   = useState(() => load("enarize_sub",       {}));
  const [allMerch,     setAllMerch]     = useState(() => load("enarize_merch",     {}));
  const [allSpots,     setAllSpots]     = useState(() => load("enarize_spots",     {}));
  const [allExpenses,  setAllExpenses]  = useState(() => load("enarize_expenses",  {}));

  const fixedLog   = allFixedLogs[monthKey] ?? makeDefaultFixedLog(fixedLessons);
  const varLog     = allVarLogs[monthKey]   ?? makeDefaultVarLog(varLessons);
  const subData    = allSubData[monthKey]   ?? { members: 6 };
  const merchSales = allMerch[monthKey]     ?? [];
  const spotEvents = allSpots[monthKey]     ?? [];
  const expenses   = allExpenses[monthKey]  ?? [];

  const flashSaved = () => { setSavedBadge(true); setTimeout(()=>setSavedBadge(false),1500); };

  const setFixedLog   = useCallback(fn => setAllFixedLogs(prev => { const next={...prev,[monthKey]:typeof fn==="function"?fn(prev[monthKey]??makeDefaultFixedLog(fixedLessons)):fn}; save("enarize_fixedLogs",next); return next; }),[monthKey,fixedLessons]);
  const setVarLog     = useCallback(fn => setAllVarLogs(prev   => { const next={...prev,[monthKey]:typeof fn==="function"?fn(prev[monthKey]??makeDefaultVarLog(varLessons)):fn};   save("enarize_varLogs",next);   return next; }),[monthKey,varLessons]);
  const setSubData    = useCallback(fn => setAllSubData(prev   => { const next={...prev,[monthKey]:typeof fn==="function"?fn(prev[monthKey]??{members:6}):fn};                      save("enarize_sub",next);       return next; }),[monthKey]);
  const setMerchSales = useCallback(fn => setAllMerch(prev     => { const next={...prev,[monthKey]:typeof fn==="function"?fn(prev[monthKey]??[]):fn};                               save("enarize_merch",next);     return next; }),[monthKey]);
  const setSpotEvents = useCallback(fn => setAllSpots(prev     => { const next={...prev,[monthKey]:typeof fn==="function"?fn(prev[monthKey]??[]):fn};                               save("enarize_spots",next);     return next; }),[monthKey]);
  const setExpenses   = useCallback(fn => setAllExpenses(prev  => { const next={...prev,[monthKey]:typeof fn==="function"?fn(prev[monthKey]??[]):fn};                               save("enarize_expenses",next);  return next; }),[monthKey]);

  useEffect(()=>{ save("enarize_fixed", fixedLessons); },[fixedLessons]);
  useEffect(()=>{ save("enarize_var",   varLessons);   },[varLessons]);

  const prevMonth = () => { if(calMonth===1){setCalYear(y=>y-1);setCalMonth(12);}else setCalMonth(m=>m-1); setSelectedDay(null); };
  const nextMonth = () => { if(calMonth===12){setCalYear(y=>y+1);setCalMonth(1);}else setCalMonth(m=>m+1); setSelectedDay(null); };
  const monthLabel = `${calYear}年 ${MONTHS_JP[calMonth-1]}`;

  // 5のつく日に休館かどうか
  function isHoliday5(lesson, date) {
    return lesson.holiday5 && has5(date);
  }
  // その日スキップされてるか
  function isSkipped(lessonId, date) {
    const log = fixedLog[lessonId];
    return log?.skipDates?.includes(`${calYear}-${String(calMonth).padStart(2,"0")}-${String(date).padStart(2,"0")}`);
  }
  function toggleSkip(lessonId, date) {
    const dateStr = `${calYear}-${String(calMonth).padStart(2,"0")}-${String(date).padStart(2,"0")}`;
    setFixedLog(prev => {
      const cur = prev?.[lessonId] ?? { count:4, active:true, skipDates:[] };
      const skips = cur.skipDates ?? [];
      const newSkips = skips.includes(dateStr) ? skips.filter(d=>d!==dateStr) : [...skips, dateStr];
      return { ...prev, [lessonId]: { ...cur, skipDates: newSkips } };
    });
    flashSaved();
  }

  // Income calcs
  const getFixed = (s) => {
    const l = fixedLog[s.id];
    if (!l?.active) return 0;
    const skips = l.skipDates?.length ?? 0;
    const feePerSession = s.fee;
    const count = Math.max(0, (l.count ?? 0) - skips);
    return count * feePerSession;
  };
  const getVar = (s) => {
    const l = varLog[s.id];
    if (!l?.active) return 0;
    return l.sessions.reduce((a,x)=>a+x.people*s.unitPrice,0);
  };

  const fixedIncome = fixedLessons.reduce((s,l)=>s+getFixed(l),0);
  const varIncome   = varLessons.reduce((s,l)=>s+getVar(l),0);
  const subIncome   = subData.members * 1000;
  const merchIncome = merchSales.reduce((s,m)=>s+m.qty*(m.isMember?TSHIRT_MEMBER:TSHIRT_NORMAL),0);
  const spotIncome  = spotEvents.reduce((s,e)=>s+(e.people*e.unitPrice),0);
  const totalIncome = fixedIncome+varIncome+subIncome+merchIncome+spotIncome;

  const totalExpenses = expenses.reduce((s,e)=>s+Number(e.amount),0);
  const netIncome = totalIncome - totalExpenses;

  // Weekly income
  const weeklyIncome = useMemo(() => {
    const weeks = [0,0,0,0,0];
    const lastDate = new Date(calYear, calMonth, 0).getDate();
    for (let d = 1; d <= lastDate; d++) {
      const weekIdx = Math.min(Math.floor((d-1)/7), 4);
      const dow = new Date(calYear, calMonth-1, d).getDay();
      const si = dow===0?6:dow-1;
      fixedLessons.filter(s=>s.day===si).forEach(s=>{
        const l = fixedLog[s.id];
        if (!l?.active) return;
        if (isHoliday5(s, d)) return;
        if (isSkipped(s.id, d)) return;
        weeks[weekIdx] += s.fee;
      });
      varLessons.filter(s=>s.day===si).forEach(s=>{
        const l = varLog[s.id];
        if (!l?.active) return;
        weeks[weekIdx] += l.sessions.reduce((a,x)=>a+x.people*s.unitPrice,0) / (s.freq==="月1回"?1:2);
      });
    }
    return weeks.filter((_,i)=>{
      const startDay = i*7+1;
      return startDay <= lastDate;
    });
  }, [calYear, calMonth, fixedLog, varLog, fixedLessons, varLessons]);

  const byFixedDay = Array.from({length:7},(_,di)=>fixedLessons.filter(s=>s.day===di));
  const byVarDay   = Array.from({length:7},(_,di)=>varLessons.filter(s=>s.day===di));

  // Paydays
  const paydays = useMemo(()=>PAY_GROUPS.map(g=>{
    const actual=getActualPayDay(calYear,calMonth,g.payDay);
    const inc=[...fixedLessons,...varLessons]
      .filter(s=>g.places.some(p=>s.place.includes(p)))
      .reduce((sum,s)=>"unitPrice" in s?sum+getVar(s):sum+getFixed(s),0);
    return {...g,actualDay:actual,income:inc};
  }).filter(g=>g.income>0),[calYear,calMonth,fixedLog,varLog,fixedLessons,varLessons]);

  // Calendar
  const calDays = useMemo(()=>{
    const first=new Date(calYear,calMonth-1,1).getDay();
    const last=new Date(calYear,calMonth,0).getDate();
    return [...Array(first).fill(null),...Array.from({length:last},(_,i)=>i+1)];
  },[calYear,calMonth]);

  const lessonDates = useMemo(()=>{
    const map={};
    const lastDate=new Date(calYear,calMonth,0).getDate();
    for(let d=1;d<=lastDate;d++){
      const dow=new Date(calYear,calMonth-1,d).getDay(), si=dow===0?6:dow-1;
      const fl=byFixedDay[si].filter(s=>fixedLog[s.id]?.active && !isHoliday5(s,d) && !isSkipped(s.id,d));
      const vl=byVarDay[si].filter(s=>varLog[s.id]?.active);
      if(fl.length+vl.length>0) map[d]={fixed:fl,variable:vl};
    }
    return map;
  },[calYear,calMonth,fixedLog,varLog,fixedLessons,varLessons]);

  const paydayMap = useMemo(()=>{
    const m={}; paydays.forEach(g=>{if(!m[g.actualDay])m[g.actualDay]=[];m[g.actualDay].push(g);}); return m;
  },[paydays]);

  const spotMap = useMemo(()=>{
    const m={}; spotEvents.forEach(e=>{const d=parseInt(e.date.split("-")[2]);if(!m[d])m[d]=[];m[d].push(e);}); return m;
  },[spotEvents]);

  const expenseMap = useMemo(()=>{
    const m={}; expenses.forEach(e=>{const d=parseInt(e.date.split("-")[2]);if(!m[d])m[d]=[];m[d].push(e);}); return m;
  },[expenses]);

  const selLessons = selectedDay?(lessonDates[selectedDay]||{fixed:[],variable:[]}):null;
  const selPay     = selectedDay?(paydayMap[selectedDay]||[]):[];
  const selSpots   = selectedDay?(spotMap[selectedDay]||[]):[];
  const selExpenses= selectedDay?(expenseMap[selectedDay]||[]):[];

  // All lessons for selected day (including skipped/holiday for toggle)
  const selAllFixed = useMemo(()=>{
    if(!selectedDay) return [];
    const dow=new Date(calYear,calMonth-1,selectedDay).getDay(), si=dow===0?6:dow-1;
    return byFixedDay[si].filter(s=>fixedLog[s.id]?.active);
  },[selectedDay,calYear,calMonth,fixedLog,fixedLessons]);

  // Lesson management
  const [showAddFixed, setShowAddFixed] = useState(false);
  const [newFixed, setNewFixed] = useState({place:"",day:0,time:"",fee:"",freq:"毎週",holiday5:false,note:""});
  const [showAddVar, setShowAddVar] = useState(false);
  const [newVar, setNewVar] = useState({place:"",day:0,time:"",unitPrice:"",freq:"隔週",defaultPeople:10,unit:"人"});

  // Spot/expense forms
  const [showSpotForm, setShowSpotForm] = useState(false);
  const [spotForm, setSpotForm] = useState({ name:"", date:"", people:1, unitPrice:3000 });
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ category:"交通費", amount:"", note:"", date:"" });

  const addSpot = () => {
    if(!spotForm.name||!spotForm.date) return;
    setSpotEvents(prev=>[...prev,{id:Date.now(),...spotForm,people:Number(spotForm.people),unitPrice:Number(spotForm.unitPrice)}]);
    setShowSpotForm(false); flashSaved();
  };
  const addExpense = () => {
    if(!expenseForm.amount||!expenseForm.date) return;
    setExpenses(prev=>[...prev,{id:Date.now(),...expenseForm}]);
    setShowExpenseForm(false); flashSaved();
  };

  // Add lesson from calendar
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [newSpotLesson, setNewSpotLesson] = useState({ place:"", time:"", fee:"", note:"" });
  const addSpotLesson = () => {
    if(!newSpotLesson.place||!selectedDay) return;
    const dateStr = `${calYear}-${String(calMonth).padStart(2,"0")}-${String(selectedDay).padStart(2,"0")}`;
    setSpotEvents(prev=>[...prev,{ id:Date.now(), name:newSpotLesson.place, date:dateStr, people:1, unitPrice:Number(newSpotLesson.fee)||0, note:newSpotLesson.note }]);
    setNewSpotLesson({place:"",time:"",fee:"",note:""});
    setShowAddLesson(false); flashSaved();
  };

  return (
    <div style={{...F, background:"#f0f4f8", minHeight:"100vh", color:"#1e293b", maxWidth:480, margin:"0 auto"}}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=DM+Mono:wght@500&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#3b82f6,#8b5cf6)", padding:"16px 18px 0", boxShadow:"0 2px 12px #3b82f630", position:"sticky", top:0, zIndex:50}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8}}>
          <div>
            <div style={{fontSize:10, color:"#ffffff99", letterSpacing:3, fontWeight:700}}>たくぴー / ENARIZE</div>
            <div style={{fontSize:20, fontWeight:700, fontFamily:"'DM Mono',monospace", color:"white"}}>Lesson Income</div>
          </div>
          {savedBadge&&<div style={{fontSize:10, color:"white", background:"#ffffff30", padding:"3px 10px", borderRadius:20}}>✓ 保存済み</div>}
        </div>
        <div style={{display:"flex", alignItems:"center", justifyContent:"center", gap:20, marginBottom:10}}>
          <button onClick={prevMonth} style={{background:"none", border:"none", color:"white", fontSize:22, cursor:"pointer"}}>‹</button>
          <span style={{fontSize:15, fontWeight:700, minWidth:130, textAlign:"center", color:"white"}}>{monthLabel}</span>
          <button onClick={nextMonth} style={{background:"none", border:"none", color:"white", fontSize:22, cursor:"pointer"}}>›</button>
        </div>
        <div style={{display:"flex", overflowX:"auto"}}>
          {[["calendar","📅 カレンダー"],["variable","📝 変動入力"],["expenses","💸 支出"],["lessons","⚙️ レッスン管理"],["analysis","📊 分析"]].map(([key,label])=>(
            <button key={key} onClick={()=>setActiveTab(key)}
              style={{flexShrink:0, padding:"9px 12px", background:"none", border:"none", borderBottom:activeTab===key?"2px solid white":"2px solid transparent", color:activeTab===key?"white":"#ffffff99", fontWeight:700, fontSize:11, cursor:"pointer",...F}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:14}}>
        {/* Total card */}
        <div style={{background:"white", borderRadius:16, padding:"16px", marginBottom:14, boxShadow:"0 2px 12px #00000012"}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12}}>
            <div>
              <div style={{fontSize:10, color:"#94a3b8", letterSpacing:2, marginBottom:4}}>今月の収入見込み</div>
              <div style={{fontSize:28, fontWeight:700, fontFamily:"'DM Mono',monospace", color:"#1e293b"}}>¥{totalIncome.toLocaleString()}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10, color:"#94a3b8", marginBottom:4}}>手残り（支出後）</div>
              <div style={{fontSize:22, fontWeight:700, fontFamily:"'DM Mono',monospace", color: netIncome>=0?"#10b981":"#ef4444"}}>¥{netIncome.toLocaleString()}</div>
            </div>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6}}>
            {[["固定",fixedIncome,"#3b82f6"],["変動",varIncome,"#8b5cf6"],["サブスク",subIncome,"#10b981"],["物販",merchIncome,"#f97316"],["支出",-totalExpenses,"#ef4444"]].map(([l,v,c])=>(
              <div key={l} style={{textAlign:"center", background:c+"12", borderRadius:8, padding:"6px 4px", border:`1px solid ${c}25`}}>
                <div style={{fontSize:9, color:"#64748b", marginBottom:3}}>{l}</div>
                <div style={{fontSize:11, fontWeight:700, color:c, fontFamily:"'DM Mono',monospace"}}>¥{Math.abs(v).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly income */}
        <div style={{background:"white", borderRadius:16, padding:"14px 16px", marginBottom:14, boxShadow:"0 2px 12px #00000012"}}>
          <div style={{fontSize:12, fontWeight:700, color:"#64748b", marginBottom:10}}>📅 週別収入</div>
          <div style={{display:"flex", gap:6}}>
            {weeklyIncome.map((w,i)=>{
              const max = Math.max(...weeklyIncome, 1);
              const pct = w/max*100;
              return (
                <div key={i} style={{flex:1, textAlign:"center"}}>
                  <div style={{height:50, display:"flex", alignItems:"flex-end", justifyContent:"center", marginBottom:4}}>
                    <div style={{width:"80%", background:`linear-gradient(180deg,#3b82f6,#8b5cf6)`, borderRadius:"4px 4px 0 0", height:`${pct}%`, minHeight:4}}/>
                  </div>
                  <div style={{fontSize:9, color:"#94a3b8", marginBottom:2}}>{i+1}週</div>
                  <div style={{fontSize:10, fontWeight:700, color:"#3b82f6", fontFamily:"'DM Mono',monospace"}}>¥{Math.round(w/1000)}k</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CALENDAR */}
        {activeTab==="calendar"&&(
          <div>
            <div style={{background:"white", borderRadius:16, padding:14, marginBottom:14, boxShadow:"0 2px 12px #00000012"}}>
              <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:6}}>
                {["日","月","火","水","木","金","土"].map((d,i)=>(
                  <div key={d} style={{textAlign:"center", fontSize:11, fontWeight:700, color:i===0?"#ef4444":i===6?"#3b82f6":"#94a3b8", padding:"4px 0"}}>{d}</div>
                ))}
              </div>
              <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3}}>
                {calDays.map((d,i)=>{
                  if(!d) return <div key={`e-${i}`}/>;
                  const isToday=d===today.getDate()&&calMonth===today.getMonth()+1&&calYear===today.getFullYear();
                  const isSel=selectedDay===d;
                  const dow=new Date(calYear,calMonth-1,d).getDay();
                  const hasLesson=!!lessonDates[d];
                  const hasPay=!!paydayMap[d];
                  const hasSpot=!!(spotMap[d]?.length);
                  const hasExp=!!(expenseMap[d]?.length);
                  const isH5=has5(d);
                  return (
                    <button key={d} onClick={()=>setSelectedDay(isSel?null:d)}
                      style={{aspectRatio:"1", borderRadius:10, border:"none", background:isSel?"#3b82f6":isToday?"#eff6ff":isH5?"#fef9c3":"#f8fafc", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:1, padding:2, boxShadow:isSel?"0 2px 8px #3b82f660":"none"}}>
                      <span style={{fontSize:13, fontWeight:isToday?700:400, color:isSel?"white":dow===0?"#ef4444":dow===6?"#3b82f6":"#1e293b"}}>{d}</span>
                      <div style={{display:"flex", gap:2}}>
                        {hasLesson&&<div style={{width:4, height:4, borderRadius:"50%", background:isSel?"white":"#8b5cf6"}}/>}
                        {hasPay&&<div style={{width:4, height:4, borderRadius:"50%", background:isSel?"white":"#f59e0b"}}/>}
                        {hasSpot&&<div style={{width:4, height:4, borderRadius:"50%", background:isSel?"white":"#ef4444"}}/>}
                        {hasExp&&<div style={{width:4, height:4, borderRadius:"50%", background:isSel?"white":"#10b981"}}/>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div style={{display:"flex", gap:10, marginTop:10, paddingTop:10, borderTop:"1px solid #f1f5f9", justifyContent:"center", flexWrap:"wrap"}}>
                {[["#8b5cf6","レッスン"],["#f59e0b","給料日"],["#ef4444","スポット"],["#10b981","支出"],["#fef9c3","5のつく日"]].map(([c,l])=>(
                  <div key={l} style={{display:"flex", alignItems:"center", gap:4, fontSize:10, color:"#64748b"}}>
                    <div style={{width:8, height:8, borderRadius:"50%", background:c, border:"1px solid #e2e8f0"}}/>{l}
                  </div>
                ))}
              </div>
            </div>

            {/* Selected day */}
            {selectedDay&&(
              <div style={{background:"white", borderRadius:16, padding:16, marginBottom:14, boxShadow:"0 2px 12px #00000012"}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
                  <div style={{fontSize:15, fontWeight:700, color:"#3b82f6"}}>{calMonth}月{selectedDay}日 {has5(selectedDay)&&<span style={{fontSize:11, color:"#f59e0b", background:"#fef9c3", padding:"2px 6px", borderRadius:10}}>5のつく日</span>}</div>
                  <button onClick={()=>setShowAddLesson(true)} style={{fontSize:12, color:"#3b82f6", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, padding:"4px 10px", cursor:"pointer",...F}}>＋ レッスン追加</button>
                </div>

                {/* Payday */}
                {selPay.length>0&&<div style={{marginBottom:10}}>
                  <div style={{fontSize:11, color:"#f59e0b", fontWeight:700, marginBottom:8}}>💴 給料日</div>
                  {selPay.map(g=>(
                    <div key={g.name} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:"#fffbeb", borderRadius:10, marginBottom:6, border:"1px solid #fde68a"}}>
                      <div style={{fontSize:13, fontWeight:700}}>{g.name}</div>
                      <div style={{fontSize:15, fontWeight:700, color:"#f59e0b", fontFamily:"'DM Mono',monospace"}}>¥{g.income.toLocaleString()}</div>
                    </div>
                  ))}
                </div>}

                {/* Lessons with skip toggle */}
                {selAllFixed.length>0&&(
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11, color:"#8b5cf6", fontWeight:700, marginBottom:8}}>🏃 レッスン（タップで休みにできる）</div>
                    {selAllFixed.map(s=>{
                      const skipped = isSkipped(s.id, selectedDay);
                      const holiday = isHoliday5(s, selectedDay);
                      return (
                        <div key={s.id} onClick={()=>!holiday&&toggleSkip(s.id, selectedDay)}
                          style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:skipped||holiday?"#f1f5f9":"#f5f3ff", borderRadius:10, marginBottom:6, border:`1px solid ${skipped||holiday?"#e2e8f0":"#ddd6fe"}`, cursor:holiday?"default":"pointer", opacity:skipped||holiday?0.5:1}}>
                          <div>
                            <div style={{fontSize:13, fontWeight:600, color:"#1e293b"}}>{s.place}</div>
                            <div style={{fontSize:11, color:"#94a3b8"}}>{s.time}</div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontSize:13, fontWeight:700, color:skipped||holiday?"#94a3b8":"#8b5cf6", fontFamily:"'DM Mono',monospace"}}>¥{s.fee.toLocaleString()}</div>
                            <div style={{fontSize:10, color:skipped?"#ef4444":holiday?"#f59e0b":"#94a3b8"}}>{holiday?"🏢休館日":skipped?"✕ 休み":"タップで休み"}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Spot lessons */}
                {selSpots.map(e=>(
                  <div key={e.id} style={{display:"flex", justifyContent:"space-between", padding:"8px 12px", background:"#fef2f2", borderRadius:10, marginBottom:6, border:"1px solid #fecaca"}}>
                    <div><div style={{fontSize:13, fontWeight:600}}>🎯 {e.name}</div><div style={{fontSize:11, color:"#94a3b8"}}>{e.people}人 × ¥{Number(e.unitPrice).toLocaleString()}</div></div>
                    <div style={{display:"flex", alignItems:"center", gap:8}}>
                      <span style={{fontSize:13, fontWeight:700, color:"#ef4444", fontFamily:"'DM Mono',monospace"}}>¥{(e.people*e.unitPrice).toLocaleString()}</span>
                      <button onClick={()=>{setSpotEvents(prev=>prev.filter(x=>x.id!==e.id));flashSaved();}} style={{background:"#fee2e2", border:"none", borderRadius:6, padding:"3px 8px", color:"#ef4444", fontSize:11, cursor:"pointer"}}>削除</button>
                    </div>
                  </div>
                ))}

                {/* Expenses */}
                {selExpenses.map(e=>(
                  <div key={e.id} style={{display:"flex", justifyContent:"space-between", padding:"8px 12px", background:"#f0fdf4", borderRadius:10, marginBottom:6, border:"1px solid #bbf7d0"}}>
                    <div><div style={{fontSize:13, fontWeight:600}}>💸 {e.category}</div>{e.note&&<div style={{fontSize:11, color:"#94a3b8"}}>{e.note}</div>}</div>
                    <div style={{display:"flex", alignItems:"center", gap:8}}>
                      <span style={{fontSize:13, fontWeight:700, color:"#ef4444", fontFamily:"'DM Mono',monospace"}}>-¥{Number(e.amount).toLocaleString()}</span>
                      <button onClick={()=>{setExpenses(prev=>prev.filter(x=>x.id!==e.id));flashSaved();}} style={{background:"#dcfce7", border:"none", borderRadius:6, padding:"3px 8px", color:"#10b981", fontSize:11, cursor:"pointer"}}>削除</button>
                    </div>
                  </div>
                ))}

                <div style={{display:"flex", gap:8, marginTop:8}}>
                  <button onClick={()=>{setSpotForm(f=>({...f,date:`${calYear}-${String(calMonth).padStart(2,"0")}-${String(selectedDay).padStart(2,"0")}`}));setShowSpotForm(true);}}
                    style={{flex:1, padding:"9px", borderRadius:10, border:"1px dashed #fca5a5", background:"#fef2f2", color:"#ef4444", fontSize:12, cursor:"pointer",...F}}>＋ スポット</button>
                  <button onClick={()=>{setExpenseForm(f=>({...f,date:`${calYear}-${String(calMonth).padStart(2,"0")}-${String(selectedDay).padStart(2,"0")}`}));setShowExpenseForm(true);}}
                    style={{flex:1, padding:"9px", borderRadius:10, border:"1px dashed #86efac", background:"#f0fdf4", color:"#10b981", fontSize:12, cursor:"pointer",...F}}>＋ 支出</button>
                </div>
              </div>
            )}

            {/* Payday schedule */}
            <div style={{background:"white", borderRadius:16, padding:16, boxShadow:"0 2px 12px #00000012"}}>
              <div style={{fontSize:12, fontWeight:700, color:"#64748b", marginBottom:12}}>📅 今月の給料日スケジュール</div>
              {paydays.sort((a,b)=>a.actualDay-b.actualDay).map(g=>{
                const isPast=g.actualDay<today.getDate()&&calMonth===today.getMonth()+1&&calYear===today.getFullYear();
                return (
                  <div key={g.name} style={{display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:"1px solid #f1f5f9", opacity:isPast?0.5:1}}>
                    <div style={{width:36, height:36, borderRadius:10, background:g.color+"20", border:`1.5px solid ${g.color}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
                      <span style={{fontSize:12, fontWeight:700, color:g.color, fontFamily:"'DM Mono',monospace"}}>{g.actualDay}</span>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12, fontWeight:700, marginBottom:1}}>{g.name}</div>
                      <div style={{fontSize:10, color:"#94a3b8"}}>{calMonth}月{g.actualDay}日{isPast?"（支払済）":"（予定）"}</div>
                    </div>
                    <div style={{fontSize:15, fontWeight:700, color:g.color, fontFamily:"'DM Mono',monospace"}}>¥{g.income.toLocaleString()}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VARIABLE */}
        {activeTab==="variable"&&(
          <div>
            {varLessons.map(s=>{
              const l=varLog[s.id]??{sessions:[{people:s.defaultPeople}],active:true};
              const inc=l.active?l.sessions.reduce((a,x)=>a+x.people*s.unitPrice,0):0;
              return (
                <div key={s.id} style={{background:"white", borderRadius:16, padding:16, marginBottom:12, boxShadow:"0 2px 12px #00000012"}}>
                  <div style={{display:"flex", justifyContent:"space-between", marginBottom:12}}>
                    <div>
                      <div style={{fontSize:14, fontWeight:700}}>{s.place}</div>
                      <div style={{fontSize:11, color:"#94a3b8"}}>{s.time&&<span style={{marginRight:6}}>{s.time}</span>}<span style={{color:s.freq==="隔週"?"#f59e0b":"#ec4899"}}>{s.freq}</span> · ¥{s.unitPrice.toLocaleString()}/人</div>
                    </div>
                    <div style={{fontSize:18, fontWeight:700, color:"#8b5cf6", fontFamily:"'DM Mono',monospace"}}>¥{inc.toLocaleString()}</div>
                  </div>
                  {l.sessions.map((sess,si)=>(
                    <div key={si} style={{display:"flex", alignItems:"center", gap:10, marginBottom:8, background:"#f8fafc", borderRadius:10, padding:"10px 12px"}}>
                      <div style={{fontSize:12, color:"#94a3b8", minWidth:50}}>{si+1}回目</div>
                      <button onClick={()=>{setVarLog(p=>{const cur=p[s.id]??{...l};const ns=[...cur.sessions];ns[si]={people:Math.max(1,ns[si].people-1)};return{...p,[s.id]:{...cur,sessions:ns}};});flashSaved();}} style={cBtn}>－</button>
                      <span style={{fontSize:20, fontWeight:700, minWidth:40, textAlign:"center", fontFamily:"'DM Mono',monospace"}}>{sess.people}</span>
                      <button onClick={()=>{setVarLog(p=>{const cur=p[s.id]??{...l};const ns=[...cur.sessions];ns[si]={people:ns[si].people+1};return{...p,[s.id]:{...cur,sessions:ns}};});flashSaved();}} style={cBtn}>＋</button>
                      <span style={{fontSize:12, color:"#94a3b8"}}>人</span>
                      <span style={{fontSize:13, fontWeight:700, color:"#8b5cf6", marginLeft:"auto", fontFamily:"'DM Mono',monospace"}}>¥{(sess.people*s.unitPrice).toLocaleString()}</span>
                      {l.sessions.length>1&&<button onClick={()=>{setVarLog(p=>{const cur=p[s.id]??{...l};return{...p,[s.id]:{...cur,sessions:cur.sessions.filter((_,i)=>i!==si)}};});flashSaved();}} style={{background:"#fee2e2", border:"none", borderRadius:6, padding:"3px 7px", color:"#ef4444", fontSize:11, cursor:"pointer"}}>削除</button>}
                    </div>
                  ))}
                  <button onClick={()=>{setVarLog(p=>{const cur=p[s.id]??{...l};return{...p,[s.id]:{...cur,sessions:[...cur.sessions,{people:s.defaultPeople}]}};});flashSaved();}}
                    style={{width:"100%", padding:"8px", borderRadius:8, border:"1px dashed #c4b5fd", background:"#f5f3ff", color:"#8b5cf6", fontSize:12, cursor:"pointer",...F}}>＋ 回数を追加</button>
                </div>
              );
            })}
            {/* Subscription */}
            <div style={{background:"white", borderRadius:16, padding:16, boxShadow:"0 2px 12px #00000012"}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
                <div><div style={{fontSize:14, fontWeight:700}}>ENARIZE MEMBERS</div><div style={{fontSize:11, color:"#94a3b8"}}>サブスク · ¥1,000/月</div></div>
                <div style={{fontSize:18, fontWeight:700, color:"#10b981", fontFamily:"'DM Mono',monospace"}}>¥{subIncome.toLocaleString()}</div>
              </div>
              <div style={{display:"flex", alignItems:"center", gap:12, background:"#f8fafc", borderRadius:10, padding:"10px 12px"}}>
                <span style={{fontSize:12, color:"#94a3b8"}}>今月の請求人数</span>
                <button onClick={()=>{setSubData(p=>({...p,members:Math.max(0,(p?.members??6)-1)}));flashSaved();}} style={cBtn}>－</button>
                <span style={{fontSize:22, fontWeight:700, minWidth:40, textAlign:"center", fontFamily:"'DM Mono',monospace", color:"#10b981"}}>{subData.members}</span>
                <button onClick={()=>{setSubData(p=>({...p,members:(p?.members??6)+1}));flashSaved();}} style={cBtn}>＋</button>
                <span style={{fontSize:12, color:"#94a3b8"}}>人</span>
              </div>
            </div>
          </div>
        )}

        {/* EXPENSES */}
        {activeTab==="expenses"&&(
          <div>
            <div style={{background:"white", borderRadius:16, padding:16, marginBottom:14, boxShadow:"0 2px 12px #00000012"}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14}}>
                <div>
                  <div style={{fontSize:14, fontWeight:700}}>今月の支出</div>
                  <div style={{fontSize:22, fontWeight:700, color:"#ef4444", fontFamily:"'DM Mono',monospace"}}>¥{totalExpenses.toLocaleString()}</div>
                </div>
                <button onClick={()=>setShowExpenseForm(true)} style={{padding:"8px 14px", borderRadius:10, border:"none", background:"#3b82f6", color:"white", fontWeight:700, fontSize:13, cursor:"pointer",...F}}>＋ 追加</button>
              </div>
              {/* By category */}
              {EXPENSE_CATS.map(cat=>{
                const total=expenses.filter(e=>e.category===cat).reduce((s,e)=>s+Number(e.amount),0);
                if(!total) return null;
                return (
                  <div key={cat} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #f1f5f9"}}>
                    <div style={{display:"flex", alignItems:"center", gap:8}}>
                      <div style={{width:8, height:8, borderRadius:"50%", background:EXPENSE_COLORS[cat]}}/>
                      <span style={{fontSize:13}}>{cat}</span>
                    </div>
                    <span style={{fontSize:13, fontWeight:700, color:"#ef4444", fontFamily:"'DM Mono',monospace"}}>¥{total.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
            {expenses.length===0&&(
              <div style={{textAlign:"center", color:"#94a3b8", padding:"30px 0", fontSize:14}}>
                <div style={{fontSize:36, marginBottom:8}}>💸</div>支出がまだ登録されていないよ！
              </div>
            )}
            {expenses.sort((a,b)=>a.date.localeCompare(b.date)).map(e=>(
              <div key={e.id} style={{background:"white", borderRadius:12, padding:"12px 16px", marginBottom:8, boxShadow:"0 1px 6px #00000010", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                <div>
                  <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:2}}>
                    <div style={{width:8, height:8, borderRadius:"50%", background:EXPENSE_COLORS[e.category]}}/>
                    <span style={{fontSize:13, fontWeight:700}}>{e.category}</span>
                  </div>
                  <div style={{fontSize:11, color:"#94a3b8"}}>{e.date.split("-").slice(1).join("/")} {e.note&&`· ${e.note}`}</div>
                </div>
                <div style={{display:"flex", alignItems:"center", gap:8}}>
                  <span style={{fontSize:15, fontWeight:700, color:"#ef4444", fontFamily:"'DM Mono',monospace"}}>¥{Number(e.amount).toLocaleString()}</span>
                  <button onClick={()=>{setExpenses(prev=>prev.filter(x=>x.id!==e.id));flashSaved();}} style={{background:"#fee2e2", border:"none", borderRadius:6, padding:"3px 8px", color:"#ef4444", fontSize:11, cursor:"pointer"}}>削除</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ANALYSIS */}
        {activeTab==="analysis"&&(
          <div>
            <div style={{background:"white", borderRadius:16, padding:16, marginBottom:12, boxShadow:"0 2px 12px #00000012"}}>
              <div style={{fontSize:12, fontWeight:700, color:"#64748b", marginBottom:14}}>📊 収入内訳</div>
              {[["固定レッスン",fixedIncome,"#3b82f6"],["変動レッスン",varIncome,"#8b5cf6"],["サブスク",subIncome,"#10b981"],["物販",merchIncome,"#f97316"],["スポット",spotIncome,"#ef4444"]].map(([l,v,c])=>{
                const pct=totalIncome>0?v/totalIncome*100:0;
                return (
                  <div key={l} style={{marginBottom:12}}>
                    <div style={{display:"flex", justifyContent:"space-between", marginBottom:4}}>
                      <span style={{fontSize:12, color:"#1e293b"}}>{l}</span>
                      <span style={{fontSize:12, fontFamily:"'DM Mono',monospace", color:c}}>¥{v.toLocaleString()} <span style={{color:"#94a3b8", fontSize:10}}>({pct.toFixed(0)}%)</span></span>
                    </div>
                    <div style={{height:8, background:"#f1f5f9", borderRadius:4}}>
                      <div style={{height:"100%", width:`${pct}%`, background:c, borderRadius:4}}/>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{background:"white", borderRadius:16, padding:16, marginBottom:12, boxShadow:"0 2px 12px #00000012"}}>
              <div style={{fontSize:12, fontWeight:700, color:"#64748b", marginBottom:12}}>💰 収支サマリー</div>
              {[["総収入",totalIncome,"#10b981"],["総支出",totalExpenses,"#ef4444"],["手残り",netIncome,netIncome>=0?"#3b82f6":"#ef4444"]].map(([l,v,c])=>(
                <div key={l} style={{display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid #f1f5f9"}}>
                  <span style={{fontSize:13, fontWeight:600}}>{l}</span>
                  <span style={{fontSize:16, fontWeight:700, color:c, fontFamily:"'DM Mono',monospace"}}>{l==="手残り"&&netIncome<0?"-":""}¥{Math.abs(v).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LESSONS MANAGEMENT */}
        {activeTab==="lessons"&&(
          <div>
            {/* Fixed lessons */}
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
              <div style={{fontSize:13, fontWeight:700, color:"#3b82f6"}}>固定レッスン</div>
              <button onClick={()=>setShowAddFixed(true)} style={{fontSize:12, color:"#3b82f6", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, padding:"4px 12px", cursor:"pointer",...F}}>＋ 追加</button>
            </div>
            {SCHED_DAYS.map((day,di)=>{
              const lessons=fixedLessons.filter(s=>s.day===di);
              if(!lessons.length) return null;
              return (
                <div key={di} style={{marginBottom:14}}>
                  <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:6}}>
                    <div style={{width:24, height:24, borderRadius:"50%", background:DAY_COLORS[di]+"20", border:`1.5px solid ${DAY_COLORS[di]}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:DAY_COLORS[di]}}>{day}</div>
                  </div>
                  {lessons.map(s=>(
                    <div key={s.id} style={{background:"white", borderRadius:10, padding:"10px 14px", marginBottom:6, marginLeft:30, boxShadow:"0 1px 6px #00000010", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:13, fontWeight:600}}>{s.place}</div>
                        <div style={{fontSize:11, color:"#94a3b8"}}>{s.time&&<span style={{marginRight:6}}>{s.time}</span>}<span style={{color:s.freq==="隔週"?"#f59e0b":"#3b82f6"}}>{s.freq}</span>{s.holiday5&&<span style={{marginLeft:6, color:"#f59e0b", fontSize:10}}>🏢5の日休館</span>}</div>
                      </div>
                      <div style={{display:"flex", alignItems:"center", gap:8}}>
                        <span style={{fontSize:13, fontWeight:700, color:"#3b82f6", fontFamily:"'DM Mono',monospace"}}>¥{s.fee.toLocaleString()}</span>
                        <button onClick={()=>{if(window.confirm(`「${s.place}」を削除しますか？`)){setFixedLessons(prev=>prev.filter(x=>x.id!==s.id));flashSaved();}}}
                          style={{background:"#fee2e2", border:"none", borderRadius:6, padding:"4px 10px", color:"#ef4444", fontSize:12, cursor:"pointer",...F}}>削除</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}

            <div style={{height:1, background:"#e2e8f0", margin:"16px 0"}}/>

            {/* Variable lessons */}
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
              <div style={{fontSize:13, fontWeight:700, color:"#8b5cf6"}}>変動レッスン</div>
              <button onClick={()=>setShowAddVar(true)} style={{fontSize:12, color:"#8b5cf6", background:"#f5f3ff", border:"1px solid #ddd6fe", borderRadius:8, padding:"4px 12px", cursor:"pointer",...F}}>＋ 追加</button>
            </div>
            {varLessons.map(s=>(
              <div key={s.id} style={{background:"white", borderRadius:10, padding:"10px 14px", marginBottom:8, boxShadow:"0 1px 6px #00000010", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                <div>
                  <div style={{fontSize:13, fontWeight:600}}>{s.place} <span style={{fontSize:10, color:"#8b5cf6", background:"#f5f3ff", padding:"1px 5px", borderRadius:4}}>変動</span></div>
                  <div style={{fontSize:11, color:"#94a3b8"}}>{SCHED_DAYS[s.day]}曜 {s.time&&<span style={{marginRight:6}}>{s.time}</span>}<span style={{color:s.freq==="隔週"?"#f59e0b":"#ec4899"}}>{s.freq}</span></div>
                </div>
                <div style={{display:"flex", alignItems:"center", gap:8}}>
                  <span style={{fontSize:13, fontWeight:700, color:"#8b5cf6", fontFamily:"'DM Mono',monospace"}}>¥{s.unitPrice.toLocaleString()}/人</span>
                  <button onClick={()=>{if(window.confirm(`「${s.place}」を削除しますか？`)){setVarLessons(prev=>prev.filter(x=>x.id!==s.id));flashSaved();}}}
                    style={{background:"#fee2e2", border:"none", borderRadius:6, padding:"4px 10px", color:"#ef4444", fontSize:12, cursor:"pointer",...F}}>削除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add fixed lesson modal */}
      {showAddFixed&&(
        <Modal onClose={()=>setShowAddFixed(false)} title="➕ 固定レッスン追加" color="#3b82f6" light>
          <Label>場所名</Label><LInput value={newFixed.place} onChange={v=>setNewFixed(f=>({...f,place:v}))} placeholder="例：○○体育館"/>
          <Label>曜日</Label>
          <div style={{display:"flex", gap:6, marginBottom:14, flexWrap:"wrap"}}>
            {SCHED_DAYS.map((d,i)=>(
              <button key={i} onClick={()=>setNewFixed(f=>({...f,day:i}))}
                style={{padding:"5px 12px", borderRadius:8, border:newFixed.day===i?`2px solid ${DAY_COLORS[i]}`:"2px solid #e2e8f0", background:newFixed.day===i?DAY_COLORS[i]+"20":"white", color:newFixed.day===i?DAY_COLORS[i]:"#64748b", fontSize:12, cursor:"pointer",...F}}>{d}</button>
            ))}
          </div>
          <Label>時間</Label><LInput value={newFixed.time} onChange={v=>setNewFixed(f=>({...f,time:v}))} placeholder="例：10:00-11:00"/>
          <Label>1回の報酬（円）</Label><LInput type="number" value={newFixed.fee} onChange={v=>setNewFixed(f=>({...f,fee:v}))} placeholder="例：3000"/>
          <Label>頻度</Label>
          <div style={{display:"flex", gap:8, marginBottom:14}}>
            {["毎週","隔週","月1回"].map(fr=>(
              <button key={fr} onClick={()=>setNewFixed(f=>({...f,freq:fr}))}
                style={{flex:1, padding:"7px", borderRadius:8, border:newFixed.freq===fr?"2px solid #3b82f6":"2px solid #e2e8f0", background:newFixed.freq===fr?"#eff6ff":"white", color:newFixed.freq===fr?"#3b82f6":"#64748b", fontSize:12, cursor:"pointer",...F}}>{fr}</button>
            ))}
          </div>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, padding:"10px 12px", background:"#fffbeb", borderRadius:10, border:"1px solid #fde68a"}}>
            <span style={{fontSize:13, color:"#64748b"}}>5・15・25日は休館日</span>
            <button onClick={()=>setNewFixed(f=>({...f,holiday5:!f.holiday5}))}
              style={{width:44, height:24, borderRadius:12, background:newFixed.holiday5?"#f59e0b":"#e2e8f0", border:"none", cursor:"pointer", position:"relative", transition:"background 0.2s"}}>
              <div style={{width:18, height:18, borderRadius:"50%", background:"white", position:"absolute", top:3, left:newFixed.holiday5?23:3, transition:"left 0.2s"}}/>
            </button>
          </div>
          <button onClick={()=>{
            if(!newFixed.place||!newFixed.fee) return;
            const lesson={...newFixed, id:Date.now(), fee:Number(newFixed.fee)};
            setFixedLessons(prev=>[...prev,lesson]);
            setFixedLog(prev=>({...prev,[lesson.id]:{count:lesson.freq==="毎週"?4:2,active:true,skipDates:[]}}));
            setNewFixed({place:"",day:0,time:"",fee:"",freq:"毎週",holiday5:false,note:""});
            setShowAddFixed(false); flashSaved();
          }} style={{width:"100%", padding:13, borderRadius:12, border:"none", background:"#3b82f6", color:"white", fontWeight:700, fontSize:14, cursor:"pointer",...F}}>追加する</button>
        </Modal>
      )}

      {/* Add var lesson modal */}
      {showAddVar&&(
        <Modal onClose={()=>setShowAddVar(false)} title="➕ 変動レッスン追加" color="#8b5cf6" light>
          <Label>場所名</Label><LInput value={newVar.place} onChange={v=>setNewVar(f=>({...f,place:v}))} placeholder="例：○○サークル"/>
          <Label>曜日</Label>
          <div style={{display:"flex", gap:6, marginBottom:14, flexWrap:"wrap"}}>
            {SCHED_DAYS.map((d,i)=>(
              <button key={i} onClick={()=>setNewVar(f=>({...f,day:i}))}
                style={{padding:"5px 12px", borderRadius:8, border:newVar.day===i?`2px solid ${DAY_COLORS[i]}`:"2px solid #e2e8f0", background:newVar.day===i?DAY_COLORS[i]+"20":"white", color:newVar.day===i?DAY_COLORS[i]:"#64748b", fontSize:12, cursor:"pointer",...F}}>{d}</button>
            ))}
          </div>
          <Label>時間</Label><LInput value={newVar.time} onChange={v=>setNewVar(f=>({...f,time:v}))} placeholder="例：19:00-20:00"/>
          <Label>1人あたりの単価（円）</Label><LInput type="number" value={newVar.unitPrice} onChange={v=>setNewVar(f=>({...f,unitPrice:v}))} placeholder="例：1500"/>
          <Label>デフォルト人数</Label><LInput type="number" value={newVar.defaultPeople} onChange={v=>setNewVar(f=>({...f,defaultPeople:Number(v)}))} placeholder="例：10"/>
          <Label>頻度</Label>
          <div style={{display:"flex", gap:8, marginBottom:14}}>
            {["毎週","隔週","月1回"].map(fr=>(
              <button key={fr} onClick={()=>setNewVar(f=>({...f,freq:fr}))}
                style={{flex:1, padding:"7px", borderRadius:8, border:newVar.freq===fr?"2px solid #8b5cf6":"2px solid #e2e8f0", background:newVar.freq===fr?"#f5f3ff":"white", color:newVar.freq===fr?"#8b5cf6":"#64748b", fontSize:12, cursor:"pointer",...F}}>{fr}</button>
            ))}
          </div>
          <button onClick={()=>{
            if(!newVar.place||!newVar.unitPrice) return;
            const lesson={...newVar, id:`v${Date.now()}`, unitPrice:Number(newVar.unitPrice), defaultPeople:Number(newVar.defaultPeople)};
            setVarLessons(prev=>[...prev,lesson]);
            setVarLog(prev=>({...prev,[lesson.id]:{sessions:[{people:lesson.defaultPeople}],active:true}}));
            setNewVar({place:"",day:0,time:"",unitPrice:"",freq:"隔週",defaultPeople:10,unit:"人"});
            setShowAddVar(false); flashSaved();
          }} style={{width:"100%", padding:13, borderRadius:12, border:"none", background:"#8b5cf6", color:"white", fontWeight:700, fontSize:14, cursor:"pointer",...F}}>追加する</button>
        </Modal>
      )}

      {/* Add lesson from calendar modal */}
      {showAddLesson&&(
        <Modal onClose={()=>setShowAddLesson(false)} title={`➕ ${calMonth}月${selectedDay}日にレッスン追加`} color="#3b82f6" light>
          <Label>レッスン名・場所</Label><LInput value={newSpotLesson.place} onChange={v=>setNewSpotLesson(f=>({...f,place:v}))} placeholder="例：特別レッスン"/>
          <Label>金額（円）</Label><LInput type="number" value={newSpotLesson.fee} onChange={v=>setNewSpotLesson(f=>({...f,fee:v}))} placeholder="例：3000"/>
          <Label>メモ（任意）</Label><LInput value={newSpotLesson.note} onChange={v=>setNewSpotLesson(f=>({...f,note:v}))} placeholder="任意"/>
          <button onClick={addSpotLesson} style={{width:"100%", padding:13, borderRadius:12, border:"none", background:"#3b82f6", color:"white", fontWeight:700, fontSize:14, cursor:"pointer",...F}}>追加する</button>
        </Modal>
      )}

      {/* Spot form */}
      {showSpotForm&&(
        <Modal onClose={()=>setShowSpotForm(false)} title="🎯 スポットイベント追加" color="#ef4444" light>
          <Label>イベント名</Label><LInput value={spotForm.name} onChange={v=>setSpotForm(f=>({...f,name:v}))} placeholder="例：特別エアロイベント"/>
          <Label>日付</Label><LInput type="date" value={spotForm.date} onChange={v=>setSpotForm(f=>({...f,date:v}))}/>
          <Label>単価（円/人）</Label><LInput type="number" value={spotForm.unitPrice} onChange={v=>setSpotForm(f=>({...f,unitPrice:v}))}/>
          <Label>参加人数</Label>
          <div style={{display:"flex", gap:12, alignItems:"center", marginBottom:16}}>
            <button onClick={()=>setSpotForm(f=>({...f,people:Math.max(1,f.people-1)}))} style={cBtn}>－</button>
            <span style={{fontSize:24, fontWeight:700, minWidth:50, textAlign:"center", fontFamily:"'DM Mono',monospace"}}>{spotForm.people}</span>
            <button onClick={()=>setSpotForm(f=>({...f,people:f.people+1}))} style={cBtn}>＋</button>
            <span style={{color:"#ef4444", fontFamily:"'DM Mono',monospace", fontSize:13}}>→ ¥{(spotForm.people*spotForm.unitPrice).toLocaleString()}</span>
          </div>
          <button onClick={addSpot} style={{width:"100%", padding:13, borderRadius:12, border:"none", background:"#ef4444", color:"white", fontWeight:700, fontSize:14, cursor:"pointer",...F}}>追加する</button>
        </Modal>
      )}

      {/* Expense form */}
      {showExpenseForm&&(
        <Modal onClose={()=>setShowExpenseForm(false)} title="💸 支出を追加" color="#10b981" light>
          <Label>カテゴリ</Label>
          <div style={{display:"flex", gap:8, marginBottom:14, flexWrap:"wrap"}}>
            {EXPENSE_CATS.map(cat=>(
              <button key={cat} onClick={()=>setExpenseForm(f=>({...f,category:cat}))}
                style={{padding:"6px 14px", borderRadius:8, border:expenseForm.category===cat?`2px solid ${EXPENSE_COLORS[cat]}`:"2px solid #e2e8f0", background:expenseForm.category===cat?EXPENSE_COLORS[cat]+"20":"white", color:expenseForm.category===cat?EXPENSE_COLORS[cat]:"#64748b", fontSize:12, cursor:"pointer",...F}}>{cat}</button>
            ))}
          </div>
          <Label>金額（円）</Label><LInput type="number" value={expenseForm.amount} onChange={v=>setExpenseForm(f=>({...f,amount:v}))} placeholder="例：500"/>
          <Label>日付</Label><LInput type="date" value={expenseForm.date} onChange={v=>setExpenseForm(f=>({...f,date:v}))}/>
          <Label>メモ（任意）</Label><LInput value={expenseForm.note} onChange={v=>setExpenseForm(f=>({...f,note:v}))} placeholder="例：菊陽体育館まで"/>
          <button onClick={addExpense} style={{width:"100%", padding:13, borderRadius:12, border:"none", background:"#10b981", color:"white", fontWeight:700, fontSize:14, cursor:"pointer",...F}}>追加する</button>
        </Modal>
      )}
    </div>
  );
}

function Modal({onClose,title,color,light,children}){
  return (
    <div style={{position:"fixed",inset:0,background:"#00000066",display:"flex",alignItems:"flex-end",zIndex:200}} onClick={onClose}>
      <div style={{background:"white",width:"100%",maxWidth:480,margin:"0 auto",borderRadius:"20px 20px 0 0",padding:24,paddingBottom:36,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 -4px 24px #00000020"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:"#e2e8f0",borderRadius:2,margin:"0 auto 18px"}}/>
        <div style={{fontSize:16,fontWeight:700,marginBottom:18,color}}>{title}</div>
        {children}
      </div>
    </div>
  );
}
function Label({children}){ return <div style={{fontSize:12,color:"#64748b",marginBottom:6,fontFamily:"'Noto Sans JP',sans-serif"}}>{children}</div>; }
function LInput({value,onChange,placeholder,type="text"}){
  return <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#1e293b",fontSize:14,marginBottom:14,boxSizing:"border-box",fontFamily:"'Noto Sans JP',sans-serif",outline:"none"}}/>;
}
const cBtn = {width:36,height:36,borderRadius:8,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#1e293b",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"};
