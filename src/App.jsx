import { useState, useMemo, useEffect, useCallback, useRef } from "react";

const MONTHS_JP = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const WEEK_DAYS = ["日","月","火","水","木","金","土"];
const SCHED_DAYS = ["月","火","水","木","金","土","日"];

const CATEGORIES = {
  regular: { label:"レギュラー", icon:"🏃", color:"#3b82f6", desc:"1回いくら（固定）" },
  circle:  { label:"サークル",   icon:"👥", color:"#8b5cf6", desc:"人数 × 単価" },
  event:   { label:"イベント",   icon:"🎯", color:"#ef4444", desc:"スポット単発" },
  part:    { label:"アルバイト", icon:"💼", color:"#f97316", desc:"時給 × 時間数" },
  sub:     { label:"代行",       icon:"🔄", color:"#10b981", desc:"登録済みジムの代行" },
};

const EXPENSE_CATS = ["交通費","駐車場","スタジオ代","その他"];
const EXPENSE_COLORS = { "交通費":"#3b82f6","駐車場":"#f59e0b","スタジオ代":"#8b5cf6","その他":"#6b7280" };
const FREQS = ["毎週","隔週","月1回","月2回"];

const FIXED_HOLIDAYS = [
  "01-01","01-02","01-03",
  "02-11","02-23",
  "03-20",
  "04-29",
  "05-03","05-04","05-05",
  "07-20",
  "08-11",
  "09-21",
  "09-23",
  "10-14",
  "11-03","11-23",
];

function isHoliday(year, month, day) {
  const mm = String(month).padStart(2,"0");
  const dd = String(day).padStart(2,"0");
  return FIXED_HOLIDAYS.includes(`${mm}-${dd}`);
}

function has5(day) { return day % 10 === 5; }

function getActualPayDay(year, month, baseDay) {
  const lastDay = new Date(year, month, 0).getDate();
  const day = baseDay === 0 ? lastDay : Math.min(baseDay, lastDay);
  const dow = new Date(year, month-1, day).getDay();
  if (dow === 0) return day - 2;
  if (dow === 6) return day - 1;
  return day;
}

function defaultCount(freq) {
  if (freq === "毎週") return 4;
  if (freq === "隔週" || freq === "月2回") return 2;
  return 1;
}

function calcFeeFromTime(startTime, endTime, hourlyRate) {
  if (!startTime || !endTime || !hourlyRate) return 0;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes <= 0) return 0;
  return Math.round((Number(hourlyRate) / 60) * minutes);
}

function calcMins(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const m = (eh * 60 + em) - (sh * 60 + sm);
  return m > 0 ? m : 0;
}
function fmtMins(mins) {
  if (!mins) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}時間${m}分` : `${h}時間`) : `${m}分`;
}

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

const F = { fontFamily:"'Noto Sans JP',sans-serif" };
const cBtn = { width:52, height:52, borderRadius:12, border:"1.5px solid #e2e8f0", background:"#f8fafc", color:"#1e293b", fontSize:26, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" };
const delBtn = { background:"#fee2e2", border:"none", borderRadius:8, padding:"10px 16px", color:"#ef4444", fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"'Noto Sans JP',sans-serif" };

// 時間セレクトの選択肢（6:00〜22:00、15分刻み）
const TIME_OPTIONS = Array.from({length:(22-6)*4+1},(_,j)=>{
  const hh=6+Math.floor(j/4), mm=(j%4)*15;
  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
});

export default function App() {
  const today = new Date();
  const [tab, setTab]           = useState("calendar");
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);
  const [selDay,   setSelDay]   = useState(null);
  const [badge,    setBadge]    = useState(false);

  const [lessons,   setLessons]   = useState(() => load("en3_lessons",   []));
  const [payGroups, setPayGroups] = useState(() => load("en3_paygroups", []));

  const mk = `${calYear}-${String(calMonth).padStart(2,"0")}`;

  const [allLogs,     setAllLogs]     = useState(() => load("en3_logs",     {}));
  const [allExpenses, setAllExpenses] = useState(() => load("en3_expenses", {}));
  const [allSpots,    setAllSpots]    = useState(() => load("en3_spots",    {}));
  const [allSubs,     setAllSubs]     = useState(() => load("en3_subs",     {}));
  const [subSettings, setSubSettingsRaw] = useState(() => load("en3_sub_settings", { serviceName:"", normalPrice:1500, vipPrice:1000, normalCount:0, vipCount:0 }));

  const [merch,       setMerchRaw]    = useState(() => load("en3_merch",    []));
  const [allMerchLogs,setAllMerchLogs]= useState(() => load("en3_merch_logs", {}));

  const logs     = allLogs[mk]     ?? {};
  const expenses = allExpenses[mk] ?? [];
  const spots    = allSpots[mk]    ?? [];
  const subs     = allSubs[mk]     ?? [];
  const merchLogs= allMerchLogs[mk] ?? [];

  const flash = () => { setBadge(true); setTimeout(() => setBadge(false), 1500); };

  const setLogs      = useCallback(fn => setAllLogs(p      => { const n={...p,[mk]:typeof fn==="function"?fn(p[mk]??{}):fn}; save("en3_logs",n); return n; }), [mk]);
  const setExpenses  = useCallback(fn => setAllExpenses(p  => { const n={...p,[mk]:typeof fn==="function"?fn(p[mk]??[]):fn}; save("en3_expenses",n); return n; }), [mk]);
  const setSpots     = useCallback(fn => setAllSpots(p     => { const n={...p,[mk]:typeof fn==="function"?fn(p[mk]??[]):fn}; save("en3_spots",n); return n; }), [mk]);
  const setSubs      = useCallback(fn => setAllSubs(p      => { const n={...p,[mk]:typeof fn==="function"?fn(p[mk]??[]):fn}; save("en3_subs",n); return n; }), [mk]);
  const setMerchLogs = useCallback(fn => setAllMerchLogs(p => { const n={...p,[mk]:typeof fn==="function"?fn(p[mk]??[]):fn}; save("en3_merch_logs",n); return n; }), [mk]);
  const setMerch     = (v) => { setMerchRaw(v); save("en3_merch", v); };
  const setSubSettings = v => { const next = typeof v === "function" ? v(subSettings) : v; setSubSettingsRaw(next); save("en3_sub_settings", next); };

  useEffect(() => { save("en3_lessons",   lessons);   }, [lessons]);
  useEffect(() => { save("en3_paygroups", payGroups); }, [payGroups]);

  const getLessonFee = useCallback((l) => {
    if (l.category === "part") {
      const rate = Number(l.hourlyRate) || 0;
      const base = (l.startTime && l.endTime && rate)
        ? calcFeeFromTime(l.startTime, l.endTime, rate)
        : 0;
      const transport = l.transportPer === "shift" ? (Number(l.transport) || 0) : 0;
      return base + transport;
    }
    const rate = Number(l.hourlyRate) || 0;
    const base = l.feeMode === "calc" && l.startTime && l.endTime && rate
      ? calcFeeFromTime(l.startTime, l.endTime, rate)
      : (Number(l.fee) ?? 0);
    return base + (Number(l.transport) || 0);
  }, []);

  const getLog = useCallback((id) => {
    const l = lessons.find(x => x.id === id);
    return logs[id] ?? { count: defaultCount(l?.freq ?? "毎週"), active:true, skipDates:[], people: l?.defaultPeople ?? 10, hours:1 };
  }, [logs, lessons]);

  const lessonIncome = useCallback((l) => {
    const lg = getLog(l.id);
    if (!lg.active) return 0;
    const skips = lg.skipDates?.length ?? 0;
    const cnt = Math.max(0, lg.count - skips);
    const fee = getLessonFee(l);
    if (l.category === "circle") return cnt * (lg.peopleSessions ? lg.peopleSessions.reduce((a,p)=>a+p,0)/lg.peopleSessions.length : (l.defaultPeople??10)) * (l.unitPrice??0);
    if (l.category === "part") {
      const transport = Number(l.transport) || 0;
      const rate = Number(l.hourlyRate) || 0;
      const dayShifts = l.dayShifts ?? {};
      const lastDay = new Date(calYear, calMonth, 0).getDate();
      let total = 0;
      for (let d = 1; d <= lastDay; d++) {
        const dow = new Date(calYear, calMonth-1, d).getDay();
        const si = dow === 0 ? 6 : dow - 1;
        const ds = `${mk}-${String(d).padStart(2,"0")}`;
        const absent = (lg.absentDates ?? []).includes(ds);
        if (absent) continue;
        const shift = dayShifts[si];
        if (!shift || !shift.enabled || !shift.startTime || !shift.endTime) continue;
        // ★ その日だけのオーバーライドがあれば優先
        const ov = (lg.shiftOverrides ?? {})[ds];
        const useStart = ov?.startTime ?? shift.startTime;
        const useEnd   = ov?.endTime   ?? shift.endTime;
        const wage = calcFeeFromTime(useStart, useEnd, rate);
        const perShift = l.transportPer === "shift" ? transport : 0;
        total += wage + perShift;
      }
      const monthTransport = l.transportPer === "month" ? transport : 0;
      return total + monthTransport;
    }
    return cnt * fee;
  }, [getLog, getLessonFee, calYear, calMonth, mk]);

  const merchIncome = useMemo(() => {
    return merchLogs.reduce((s, log) => {
      const item = merch.find(m => m.id === log.merchId);
      if (!item) return s;
      const price = log.isMember ? (item.memberPrice ?? item.price) : item.price;
      return s + price * log.qty;
    }, 0);
  }, [merchLogs, merch]);

  const subsIncome   = subs.reduce((s,e) => s + (e.fee ?? 0), 0);
  const totalLessonIncome = useMemo(() => lessons.reduce((s,l) => s + lessonIncome(l), 0), [lessons, logs]);
  const subIncome    = (subSettings.normalCount ?? 0) * (subSettings.normalPrice ?? 1500) + (subSettings.vipCount ?? 0) * (subSettings.vipPrice ?? 1000);
  const spotIncome   = spots.reduce((s,e) => s + e.amount, 0);
  const totalIncome  = totalLessonIncome + subIncome + spotIncome + subsIncome + merchIncome;
  const totalExpenses= expenses.reduce((s,e) => s + Number(e.amount), 0);
  const netIncome    = totalIncome - totalExpenses;

  const isSkipped = useCallback((id, date) => {
    return getLog(id).skipDates?.includes(`${mk}-${String(date).padStart(2,"0")}`);
  }, [getLog, mk]);

  const isRestDay = useCallback((l, date) => {
    if (l.holiday5 && has5(date)) return "5のつく日休館";
    if (l.holidayOff && isHoliday(calYear, calMonth, date)) return "祝日休み";
    return null;
  }, [calYear, calMonth]);

  const toggleSkip = (id, date) => {
    const ds = `${mk}-${String(date).padStart(2,"0")}`;
    setLogs(p => {
      const cur = p[id] ?? getLog(id);
      const sk  = cur.skipDates ?? [];
      return {...p, [id]: {...cur, skipDates: sk.includes(ds) ? sk.filter(d=>d!==ds) : [...sk,ds]}};
    });
    flash();
  };

  const calDays = useMemo(() => {
    const first = new Date(calYear, calMonth-1, 1).getDay();
    const last  = new Date(calYear, calMonth, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({length:last}, (_,i) => i+1)];
  }, [calYear, calMonth]);

  const lessonsByDate = useMemo(() => {
    const map = {};
    const last = new Date(calYear, calMonth, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const dow = new Date(calYear, calMonth-1, d).getDay();
      const si  = dow === 0 ? 6 : dow - 1;
      const ls  = lessons.filter(l => l.day===si && getLog(l.id).active && !isRestDay(l,d) && !isSkipped(l.id,d));
      if (ls.length) map[d] = ls;
    }
    return map;
  }, [calYear, calMonth, lessons, logs]);

  const allLessonsByDate = useMemo(() => {
    if (!selDay) return [];
    const dow = new Date(calYear, calMonth-1, selDay).getDay();
    const si  = dow === 0 ? 6 : dow - 1;
    return lessons.filter(l => l.day===si && getLog(l.id).active);
  }, [selDay, calYear, calMonth, lessons, logs]);

  const paydayMap = useMemo(() => {
    const map = {};
    payGroups.forEach(g => {
      const actual = getActualPayDay(calYear, calMonth, g.payDay);
      const inc = lessons.filter(l => g.lessonIds?.includes(l.id)).reduce((s,l) => s+lessonIncome(l), 0);
      if (!map[actual]) map[actual] = [];
      map[actual].push({...g, actual, inc});
    });
    return map;
  }, [calYear, calMonth, payGroups, lessons, logs]);

  const spotsByDate = useMemo(() => {
    const map = {}; spots.forEach(e => { const d=parseInt(e.date.split("-")[2]); if(!map[d])map[d]=[]; map[d].push(e); }); return map;
  }, [spots]);

  const subsByDate = useMemo(() => {
    const map = {}; subs.forEach(e => { const d=parseInt(e.date.split("-")[2]); if(!map[d])map[d]=[]; map[d].push(e); }); return map;
  }, [subs]);

  const expensesByDate = useMemo(() => {
    const map = {}; expenses.forEach(e => { const d=parseInt(e.date.split("-")[2]); if(!map[d])map[d]=[]; map[d].push(e); }); return map;
  }, [expenses]);

  // forms
  const blankLesson = { category:"regular", lessonName:"", place:"", day:0, startTime:"", endTime:"", fee:"", freq:"毎週", holiday5:false, holidayOff:false, unitPrice:"", defaultPeople:10, hourlyRate:"", feeMode:"fixed", transport:"", shiftType:"fixed", transportPer:"shift", dayShifts:{} };
  const [lForm, setLForm] = useState(blankLesson);
  const [editLesson, setEditLesson] = useState(null);
  const [showAddLesson,  setShowAddLesson]  = useState(false);
  const [showAddSpot,    setShowAddSpot]    = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddPayGroup,setShowAddPayGroup]= useState(false);
  const [showAddSub,     setShowAddSub]     = useState(false);

  const blankMerch = { name:"", price:"", memberPrice:"", hasMemberPrice:false, note:"" };
  const [mForm, setMForm] = useState(blankMerch);
  const [editMerch, setEditMerch] = useState(null);
  const [showAddMerch, setShowAddMerch] = useState(false);
  const blankSale = { merchId:"", qty:1, isMember:false, date:`${mk}-01`, note:"" };
  const [saleForm, setSaleForm] = useState(blankSale);
  const [showAddSale, setShowAddSale] = useState(false);
  const [showAddPart, setShowAddPart] = useState(false);
  const [editPart, setEditPart] = useState(null);

  // ★ その日だけシフト時間変更用state
  const [editingShift, setEditingShift] = useState(null);

  // ★ AI登録
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPreview, setAiPreview] = useState(null); // 解析結果プレビュー
  const [aiError, setAiError] = useState("");
  // editingShift = { ds: "2026-06-05", startTime: "09:00", endTime: "13:00" } | null

  const [spotForm, setSpotForm] = useState({ name:"", date:`${mk}-01`, amount:"", note:"" });
  const [expForm,  setExpForm]  = useState({ category:"交通費", amount:"", date:`${mk}-01`, note:"" });
  const [pgForm,   setPgForm]   = useState({ name:"", payDay:"", lessonIds:[] });
  const [subForm,  setSubForm]  = useState({ lessonId:"", date:`${mk}-01`, note:"" });

  const previewFee = useMemo(() => {
    if (lForm.feeMode === "calc") return calcFeeFromTime(lForm.startTime, lForm.endTime, Number(lForm.hourlyRate));
    return Number(lForm.fee) || 0;
  }, [lForm]);

  const sortLessons = (arr) => [...arr].sort((a,b) => {
    if (a.day !== b.day) return a.day - b.day;
    const at = a.startTime || "00:00", bt = b.startTime || "00:00";
    return at.localeCompare(bt);
  });

  const callAI = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    setAiError("");
    setAiPreview(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `以下のレッスン情報をJSONに変換してください。JSONのみ返してください。マークダウンや説明文は不要です。

入力: "${aiText}"

JSONの形式:
{
  "category": "regular" | "circle" | "event",
  "lessonName": "レッスン名（なければ空文字）",
  "place": "施設名・場所名",
  "day": 0〜6の数字（月=0,火=1,水=2,木=3,金=4,土=5,日=6）,
  "startTime": "HH:MM",
  "endTime": "HH:MM",
  "fee": 数字（円）,
  "freq": "毎週" | "隔週" | "月1回" | "月2回",
  "transport": 数字（交通費円、なければ0）,
  "feeMode": "fixed",
  "holiday5": false,
  "holidayOff": false,
  "unitPrice": 0,
  "defaultPeople": 10,
  "hourlyRate": 0,
  "transportPer": "shift"
}

注意:
- categoryはcircleは「人数×単価」形式のみ。通常は"regular"
- dayは必ず0〜6の数字
- 時間は24時間形式のHH:MM
- 金額は数字のみ（¥や円は除く）
- 不明な項目はデフォルト値を使用`
          }]
        })
      });
      const data = await res.json();
      const text = data.content?.map(i => i.text || "").join("") || "";
      const clean = text.replace(/\`\`\`json|\`\`\`/g, "").trim();
      const parsed = JSON.parse(clean);
      setAiPreview(parsed);
    } catch(e) {
      setAiError("うまく読み取れませんでした。もう少し詳しく入力してみてください。");
    }
    setAiLoading(false);
  };

  const confirmAiLesson = () => {
    if (!aiPreview) return;
    const l = {
      ...blankLesson,
      ...aiPreview,
      id: Date.now(),
      day: Number(aiPreview.day ?? 0),
      fee: Number(aiPreview.fee ?? 0),
      unitPrice: Number(aiPreview.unitPrice ?? 0),
      hourlyRate: Number(aiPreview.hourlyRate ?? 0),
      defaultPeople: Number(aiPreview.defaultPeople ?? 10),
      transport: Number(aiPreview.transport ?? 0),
    };
    setLessons(p => sortLessons([...p, l]));
    setLogs(p => ({...p, [l.id]:{ count:defaultCount(l.freq), active:true, skipDates:[], people:l.defaultPeople, hours:1 }}));
    setAiPreview(null);
    setAiText("");
    setShowAiInput(false);
    flash();
  };

  const saveLesson = () => {
    if (!lForm.place) return;
    const fee = lForm.feeMode === "calc" ? calcFeeFromTime(lForm.startTime, lForm.endTime, Number(lForm.hourlyRate)) : Number(lForm.fee)||0;
    const l = { ...lForm, id: editLesson ?? Date.now(), fee, unitPrice:Number(lForm.unitPrice)||0, hourlyRate:Number(lForm.hourlyRate)||0, defaultPeople:Number(lForm.defaultPeople)||10, day:Number(lForm.day) };
    setLessons(p => sortLessons(editLesson ? p.map(x => x.id===editLesson?l:x) : [...p,l]));
    if (!editLesson) setLogs(p => ({...p, [l.id]:{ count:defaultCount(l.freq), active:true, skipDates:[], people:l.defaultPeople, hours:1 }}));
    setEditLesson(null); setShowAddLesson(false); setLForm(blankLesson); flash();
  };
  const savePart = () => {
    if (!lForm.place) return;
    const l = { ...lForm, id: editPart ?? Date.now(), category:"part", hourlyRate:Number(lForm.hourlyRate)||0 };
    setLessons(p => editPart ? p.map(x=>x.id===editPart?l:x) : [...p,l]);
    if (!editPart) setLogs(p => ({...p, [l.id]:{ active:true, skipDates:[], absentDates:[] }}));
    setEditPart(null); setShowAddPart(false); setLForm(blankLesson); flash();
  };
  const deletePart = id => { if(window.confirm("このアルバイトを削除しますか？")) { setLessons(p=>p.filter(x=>x.id!==id)); flash(); }};
  const deleteLesson = id => { if(window.confirm("このレッスンを削除しますか？")) { setLessons(p=>p.filter(x=>x.id!==id)); flash(); }};
  const saveSpot    = () => { if(!spotForm.name||!spotForm.amount) return; setSpots(p=>[...p,{id:Date.now(),...spotForm,amount:Number(spotForm.amount)}]); setShowAddSpot(false); flash(); };
  const saveExpense = () => { if(!expForm.amount) return; setExpenses(p=>[...p,{id:Date.now(),...expForm}]); setShowAddExpense(false); flash(); };
  const savePayGroup= () => { if(!pgForm.name) return; setPayGroups(p=>[...p,{id:Date.now(),...pgForm,payDay:Number(pgForm.payDay)}]); setShowAddPayGroup(false); setPgForm({name:"",payDay:"",lessonIds:[]}); flash(); };
  const saveSub     = () => {
    if(!subForm.lessonId||!subForm.date) return;
    const l = lessons.find(x=>x.id===Number(subForm.lessonId)||x.id===subForm.lessonId);
    const fee = l ? getLessonFee(l) : 0;
    setSubs(p=>[...p,{id:Date.now(),...subForm,place:l?.place??"",fee}]);
    setShowAddSub(false); flash();
  };

  const saveMerch = () => {
    if (!mForm.name || !mForm.price) return;
    const item = { ...mForm, id: editMerch ?? Date.now(), price: Number(mForm.price)||0, memberPrice: mForm.hasMemberPrice ? Number(mForm.memberPrice)||0 : null };
    setMerch(editMerch ? merch.map(x=>x.id===editMerch?item:x) : [...merch, item]);
    setEditMerch(null); setShowAddMerch(false); setMForm(blankMerch); flash();
  };
  const deleteMerch = id => { if(window.confirm("この商品を削除しますか？")) { setMerch(merch.filter(x=>x.id!==id)); flash(); }};
  const saveSale = () => {
    if (!saleForm.merchId) return;
    setMerchLogs(p => [...p, { id:Date.now(), ...saleForm, qty:Number(saleForm.qty)||1, merchId:Number(saleForm.merchId) }]);
    setShowAddSale(false); setSaleForm(blankSale); flash();
  };

  const merchStats = useMemo(() => {
    return merch.map(item => {
      const logs = merchLogs.filter(l => l.merchId === item.id);
      const normalQty  = logs.filter(l=>!l.isMember).reduce((s,l)=>s+l.qty,0);
      const memberQty  = logs.filter(l=> l.isMember).reduce((s,l)=>s+l.qty,0);
      const normalSales= normalQty * item.price;
      const memberSales= memberQty * (item.memberPrice ?? item.price);
      return { ...item, normalQty, memberQty, normalSales, memberSales, totalSales: normalSales+memberSales };
    });
  }, [merch, merchLogs]);

  const prevMonth = () => { if(calMonth===1){setCalYear(y=>y-1);setCalMonth(12);}else setCalMonth(m=>m-1); setSelDay(null); };
  const nextMonth = () => { if(calMonth===12){setCalYear(y=>y+1);setCalMonth(1);}else setCalMonth(m=>m+1); setSelDay(null); };

  return (
    <div style={{...F,background:"#f0f4f8",minHeight:"100vh",color:"#1e293b",maxWidth:480,margin:"0 auto"}}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=DM+Mono:wght@500&display=swap" rel="stylesheet"/>

      {/* header */}
      <div style={{background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",padding:"16px 18px 0",position:"sticky",top:0,zIndex:50,boxShadow:"0 2px 12px #3b82f640"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <button onClick={prevMonth} style={{background:"none",border:"none",color:"white",fontSize:32,cursor:"pointer",padding:"0 4px",lineHeight:1}}>‹</button>
          <span style={{fontSize:22,fontWeight:700,color:"white",letterSpacing:1}}>{calYear}年 {MONTHS_JP[calMonth-1]}</span>
          <button onClick={nextMonth} style={{background:"none",border:"none",color:"white",fontSize:32,cursor:"pointer",padding:"0 4px",lineHeight:1}}>›</button>
          {badge&&<div style={{fontSize:10,color:"white",background:"#ffffff30",padding:"3px 10px",borderRadius:20}}>✓ 保存済み</div>}
        </div>
        <div style={{display:"flex",overflowX:"auto"}}>
          {[["calendar","📅"],["input","📝"],["parttime","💼"],["expenses","💸"],["lessons","🏃"],["merch","🛍️"],["analysis","📊"]].map(([key,icon])=>(
            <button key={key} onClick={()=>setTab(key)}
              style={{flexShrink:0,flex:1,padding:"9px 8px",background:"none",border:"none",borderBottom:tab===key?"2px solid white":"2px solid transparent",color:tab===key?"white":"#ffffff80",fontWeight:700,fontSize:22,cursor:"pointer"}}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:14}}>
        {/* summary */}
        <div style={{background:"white",borderRadius:16,padding:16,marginBottom:14,boxShadow:"0 2px 12px #00000012"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            <div>
              <div style={{fontSize:10,color:"#94a3b8",letterSpacing:1,marginBottom:4}}>今月の収入見込み</div>
              <div style={{fontSize:36,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>¥{totalIncome.toLocaleString()}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>手残り</div>
              <div style={{fontSize:28,fontWeight:700,fontFamily:"'DM Mono',monospace",color:netIncome>=0?"#10b981":"#ef4444"}}>¥{netIncome.toLocaleString()}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {Object.entries(CATEGORIES).map(([key,cat])=>{
              const inc = key==="sub" ? subsIncome : lessons.filter(l=>l.category===key).reduce((s,l)=>s+lessonIncome(l),0);
              if(!inc) return null;
              return <div key={key} style={{background:cat.color+"12",borderRadius:8,padding:"5px 10px",border:`1px solid ${cat.color}25`}}><span style={{fontSize:13,color:cat.color,fontWeight:700}}>{cat.icon} {cat.label}</span><span style={{fontSize:13,fontFamily:"'DM Mono',monospace",color:cat.color,marginLeft:6}}>¥{inc.toLocaleString()}</span></div>;
            })}
            {subIncome>0&&<div style={{background:"#10b98112",borderRadius:8,padding:"5px 10px",border:"1px solid #10b98125"}}><span style={{fontSize:10,color:"#10b981",fontWeight:700}}>📱 {subSettings.serviceName||"サブスク"}</span><span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:"#10b981",marginLeft:6}}>¥{subIncome.toLocaleString()}</span></div>}
            {merchIncome>0&&<div style={{background:"#ec489912",borderRadius:8,padding:"5px 10px",border:"1px solid #ec489925"}}><span style={{fontSize:13,color:"#ec4899",fontWeight:700}}>🛍️ 物販</span><span style={{fontSize:13,fontFamily:"'DM Mono',monospace",color:"#ec4899",marginLeft:6}}>¥{merchIncome.toLocaleString()}</span></div>}
          </div>
        </div>

        {/* ══ CALENDAR ══ */}
        {tab==="calendar"&&(
          <div>
            <div style={{background:"white",borderRadius:16,padding:14,marginBottom:14,boxShadow:"0 2px 12px #00000012"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:6}}>
                {WEEK_DAYS.map((d,i)=><div key={d} style={{textAlign:"center",fontSize:14,fontWeight:700,color:i===0?"#ef4444":i===6?"#3b82f6":"#94a3b8",padding:"6px 0"}}>{d}</div>)}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
                {calDays.map((d,i)=>{
                  if(!d) return <div key={`e${i}`}/>;
                  const isToday=d===today.getDate()&&calMonth===today.getMonth()+1&&calYear===today.getFullYear();
                  const isSel=selDay===d;
                  const dow=new Date(calYear,calMonth-1,d).getDay();
                  const isHol=isHoliday(calYear,calMonth,d);
                  return (
                    <button key={d} onClick={()=>setSelDay(isSel?null:d)}
                      style={{aspectRatio:"1",borderRadius:10,border:"none",background:isSel?"#3b82f6":isToday?"#eff6ff":isHol?"#fce7f3":has5(d)?"#fef9c3":"#f8fafc",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,padding:2,boxShadow:isSel?"0 2px 8px #3b82f660":"none"}}>
                      <span style={{fontSize:17,fontWeight:isToday?700:500,color:isSel?"white":dow===0?"#ef4444":isHol?"#db2777":dow===6?"#3b82f6":"#1e293b"}}>{d}</span>
                      <div style={{display:"flex",gap:2}}>
                        {lessonsByDate[d]&&<div style={{width:4,height:4,borderRadius:"50%",background:isSel?"white":"#8b5cf6"}}/>}
                        {paydayMap[d]&&<div style={{width:4,height:4,borderRadius:"50%",background:isSel?"white":"#f59e0b"}}/>}
                        {(spotsByDate[d]||subsByDate[d])&&<div style={{width:4,height:4,borderRadius:"50%",background:isSel?"white":"#ef4444"}}/>}
                        {expensesByDate[d]&&<div style={{width:4,height:4,borderRadius:"50%",background:isSel?"white":"#10b981"}}/>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div style={{display:"flex",gap:8,marginTop:10,paddingTop:10,borderTop:"1px solid #f1f5f9",justifyContent:"center",flexWrap:"wrap"}}>
                {[["#8b5cf6","レッスン"],["#f59e0b","給料日"],["#ef4444","スポット"],["#10b981","支出"],["#fce7f3","祝日"],["#fef9c3","5の日"]].map(([c,l])=>(
                  <div key={l} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#64748b"}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:c,border:"1px solid #e2e8f0"}}/>{l}
                  </div>
                ))}
              </div>
            </div>

            {selDay&&(
              <div style={{background:"white",borderRadius:16,padding:16,marginBottom:14,boxShadow:"0 2px 12px #00000012"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:18,fontWeight:700,color:"#3b82f6"}}>
                    {calMonth}月{selDay}日
                    {isHoliday(calYear,calMonth,selDay)&&<span style={{fontSize:10,color:"#db2777",background:"#fce7f3",padding:"2px 6px",borderRadius:8,marginLeft:6}}>祝日</span>}
                    {has5(selDay)&&<span style={{fontSize:10,color:"#f59e0b",background:"#fef9c3",padding:"2px 6px",borderRadius:8,marginLeft:4}}>5のつく日</span>}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{setSubForm(f=>({...f,date:`${mk}-${String(selDay).padStart(2,"0")}`}));setShowAddSub(true);}}
                      style={{fontSize:11,color:"#10b981",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"4px 8px",cursor:"pointer",...F}}>🔄 代行</button>
                    <button onClick={()=>{setSpotForm(f=>({...f,date:`${mk}-${String(selDay).padStart(2,"0")}`}));setShowAddSpot(true);}}
                      style={{fontSize:11,color:"#3b82f6",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:"4px 8px",cursor:"pointer",...F}}>＋ 追加</button>
                  </div>
                </div>

                {paydayMap[selDay]?.map(g=>(
                  <div key={g.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:"#fffbeb",borderRadius:10,marginBottom:8,border:"1px solid #fde68a"}}>
                    <div><div style={{fontSize:13,fontWeight:700}}>💴 {g.name}</div><div style={{fontSize:11,color:"#94a3b8"}}>給料日</div></div>
                    <div style={{fontSize:19,fontWeight:700,color:"#f59e0b",fontFamily:"'DM Mono',monospace"}}>¥{g.inc.toLocaleString()}</div>
                  </div>
                ))}

                {allLessonsByDate.map(l=>{
                  const skipped = isSkipped(l.id,selDay);
                  const rest    = isRestDay(l,selDay);
                  const cat     = CATEGORIES[l.category];
                  const fee     = getLessonFee(l);
                  return (
                    <div key={l.id} onClick={()=>!rest&&toggleSkip(l.id,selDay)}
                      style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:skipped||rest?"#f8fafc":cat.color+"10",borderRadius:10,marginBottom:8,border:`1px solid ${skipped||rest?"#e2e8f0":cat.color+"30"}`,cursor:rest?"default":"pointer",opacity:skipped||rest?0.5:1}}>
                      <div>
                        <div style={{fontSize:16,fontWeight:700}}>{cat.icon} {l.lessonName&&<span style={{marginRight:4}}>{l.lessonName}</span>}{l.place}</div>
                        <div style={{fontSize:11,color:"#94a3b8"}}>{l.startTime&&l.endTime?`${l.startTime}〜${l.endTime}`:""} {l.freq}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:13,fontWeight:700,color:skipped||rest?"#94a3b8":cat.color,fontFamily:"'DM Mono',monospace"}}>¥{fee.toLocaleString()}</div>
                        <div style={{fontSize:10,color:skipped?"#ef4444":rest?"#f59e0b":"#94a3b8"}}>{rest?`🏢${rest}`:skipped?"✕ 休み":"タップで休み"}</div>
                      </div>
                    </div>
                  );
                })}

                {subsByDate[selDay]?.map(e=>(
                  <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:"#f0fdf4",borderRadius:10,marginBottom:8,border:"1px solid #bbf7d0"}}>
                    <div><div style={{fontSize:13,fontWeight:600}}>🔄 代行：{e.place}</div>{e.note&&<div style={{fontSize:11,color:"#94a3b8"}}>{e.note}</div>}</div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:13,fontWeight:700,color:"#10b981",fontFamily:"'DM Mono',monospace"}}>¥{(e.fee??0).toLocaleString()}</span>
                      <button onClick={()=>{setSubs(p=>p.filter(x=>x.id!==e.id));flash();}} style={delBtn}>削除</button>
                    </div>
                  </div>
                ))}

                {spotsByDate[selDay]?.map(e=>(
                  <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:"#fef2f2",borderRadius:10,marginBottom:8,border:"1px solid #fecaca"}}>
                    <div><div style={{fontSize:13,fontWeight:600}}>🎯 {e.name}</div>{e.note&&<div style={{fontSize:11,color:"#94a3b8"}}>{e.note}</div>}</div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:13,fontWeight:700,color:"#ef4444",fontFamily:"'DM Mono',monospace"}}>¥{Number(e.amount).toLocaleString()}</span>
                      <button onClick={()=>{setSpots(p=>p.filter(x=>x.id!==e.id));flash();}} style={delBtn}>削除</button>
                    </div>
                  </div>
                ))}

                {expensesByDate[selDay]?.map(e=>(
                  <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:"#fef2f2",borderRadius:10,marginBottom:8,border:"1px solid #fecaca"}}>
                    <div><div style={{fontSize:13,fontWeight:600}}>💸 {e.category}</div>{e.note&&<div style={{fontSize:11,color:"#94a3b8"}}>{e.note}</div>}</div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:13,fontWeight:700,color:"#ef4444",fontFamily:"'DM Mono',monospace"}}>-¥{Number(e.amount).toLocaleString()}</span>
                      <button onClick={()=>{setExpenses(p=>p.filter(x=>x.id!==e.id));flash();}} style={delBtn}>削除</button>
                    </div>
                  </div>
                ))}

                {allLessonsByDate.length===0&&!paydayMap[selDay]&&!spotsByDate[selDay]&&!subsByDate[selDay]&&!expensesByDate[selDay]&&(
                  <div style={{textAlign:"center",color:"#94a3b8",fontSize:13,padding:"10px 0"}}>この日は予定なし</div>
                )}

                <button onClick={()=>{setExpForm(f=>({...f,date:`${mk}-${String(selDay).padStart(2,"0")}`}));setShowAddExpense(true);}}
                  style={{width:"100%",marginTop:8,padding:"9px",borderRadius:10,border:"1px dashed #86efac",background:"#f0fdf4",color:"#10b981",fontSize:12,cursor:"pointer",...F}}>
                  ＋ 支出を追加
                </button>
              </div>
            )}

            {payGroups.length>0&&(
              <div style={{background:"white",borderRadius:16,padding:16,boxShadow:"0 2px 12px #00000012"}}>
                <div style={{fontSize:12,fontWeight:700,color:"#64748b",marginBottom:12}}>📅 今月の給料日スケジュール</div>
                {Object.entries(paydayMap).sort((a,b)=>Number(a[0])-Number(b[0])).map(([day,gs])=>
                  gs.map(g=>{
                    const isPast=Number(day)<today.getDate()&&calMonth===today.getMonth()+1&&calYear===today.getFullYear();
                    return (
                      <div key={g.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #f1f5f9",opacity:isPast?0.5:1}}>
                        <div style={{width:36,height:36,borderRadius:10,background:"#fffbeb",border:"1.5px solid #f59e0b",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <span style={{fontSize:12,fontWeight:700,color:"#f59e0b",fontFamily:"'DM Mono',monospace"}}>{day}</span>
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,fontWeight:700}}>{g.name}</div>
                          <div style={{fontSize:13,color:"#94a3b8"}}>{calMonth}月{day}日{isPast?"（支払済）":"（予定）"}</div>
                        </div>
                        <div style={{fontSize:19,fontWeight:700,color:"#f59e0b",fontFamily:"'DM Mono',monospace"}}>¥{g.inc.toLocaleString()}</div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ INPUT（サークル・メンバー） ══ */}
        {tab==="input"&&(
          <div>
            {/* ✨ AI登録ボタン */}
            <button onClick={()=>{setShowAiInput(v=>!v);setAiPreview(null);setAiError("");}}
              style={{width:"100%",padding:16,borderRadius:14,border:"none",background:showAiInput?"#6366f1":"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"white",fontWeight:700,fontSize:17,cursor:"pointer",marginBottom:14,...F,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <span style={{fontSize:22}}>✨</span> AIでレッスンを登録する
            </button>

            {/* AI入力パネル */}
            {showAiInput&&(
              <div style={{background:"white",borderRadius:16,padding:16,marginBottom:14,boxShadow:"0 2px 12px #6366f120",border:"1px solid #e0e7ff"}}>
                <div style={{fontSize:13,color:"#6366f1",fontWeight:700,marginBottom:10}}>✨ レッスン情報を自然な文章で入力してください</div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:10,lineHeight:1.6}}>
                  例：「毎週月曜10時から11時、○○体育館でエアロビ、報酬3500円」<br/>
                  例：「火曜と木曜の14時〜15時、△△スポーツクラブ、交通費500円込みで4000円」
                </div>
                <textarea
                  value={aiText}
                  onChange={e=>setAiText(e.target.value)}
                  placeholder="ここにレッスン情報を入力..."
                  rows={3}
                  style={{width:"100%",padding:"12px 14px",borderRadius:12,border:"1.5px solid #e0e7ff",background:"#f8fafc",color:"#1e293b",fontSize:16,marginBottom:10,boxSizing:"border-box",resize:"none",...F,outline:"none"}}
                />
                {aiError&&<div style={{fontSize:12,color:"#ef4444",marginBottom:10}}>{aiError}</div>}

                {/* 解析結果プレビュー */}
                {aiPreview&&(
                  <div style={{background:"#f0f9ff",borderRadius:12,padding:"12px 14px",marginBottom:12,border:"1px solid #bae6fd"}}>
                    <div style={{fontSize:12,color:"#0284c7",fontWeight:700,marginBottom:8}}>📋 こんな内容で登録しますか？</div>
                    {[
                      ["カテゴリ", CATEGORIES[aiPreview.category]?.label ?? aiPreview.category],
                      ["場所", aiPreview.place],
                      ["レッスン名", aiPreview.lessonName || "（なし）"],
                      ["曜日", SCHED_DAYS[Number(aiPreview.day)] + "曜"],
                      ["時間", `${aiPreview.startTime}〜${aiPreview.endTime}`],
                      ["報酬", `¥${Number(aiPreview.fee).toLocaleString()}`],
                      ["頻度", aiPreview.freq],
                      ["交通費", aiPreview.transport > 0 ? `¥${Number(aiPreview.transport).toLocaleString()}` : "なし"],
                    ].map(([k,v])=>(
                      <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #e0f2fe"}}>
                        <span style={{fontSize:12,color:"#64748b"}}>{k}</span>
                        <span style={{fontSize:13,fontWeight:700,color:"#0284c7"}}>{v}</span>
                      </div>
                    ))}
                    <div style={{display:"flex",gap:8,marginTop:12}}>
                      <button onClick={confirmAiLesson}
                        style={{flex:2,padding:"12px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"white",fontWeight:700,fontSize:15,cursor:"pointer",...F}}>
                        ✅ この内容で登録する
                      </button>
                      <button onClick={()=>setAiPreview(null)}
                        style={{flex:1,padding:"12px",borderRadius:10,border:"1px solid #e0e7ff",background:"white",color:"#6366f1",fontWeight:700,fontSize:13,cursor:"pointer",...F}}>
                        やり直す
                      </button>
                    </div>
                  </div>
                )}

                {!aiPreview&&(
                  <button onClick={callAI} disabled={aiLoading||!aiText.trim()}
                    style={{width:"100%",padding:"13px",borderRadius:12,border:"none",background:aiLoading||!aiText.trim()?"#e2e8f0":"linear-gradient(135deg,#6366f1,#8b5cf6)",color:aiLoading||!aiText.trim()?"#94a3b8":"white",fontWeight:700,fontSize:16,cursor:aiLoading||!aiText.trim()?"not-allowed":"pointer",...F}}>
                    {aiLoading ? "🤖 解析中..." : "🔍 AIで解析する"}
                  </button>
                )}
              </div>
            )}

            <div style={{fontSize:15,color:"#64748b",marginBottom:14,fontWeight:600}}>🏃 サークル・人数入力</div>
            {lessons.filter(l=>l.category==="circle").map(l=>{
              const cat=CATEGORIES[l.category];
              const lg=getLog(l.id);
              const inc=lessonIncome(l);
              return (
                <div key={l.id} style={{background:"white",borderRadius:16,padding:16,marginBottom:12,boxShadow:"0 2px 12px #00000012"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
                    <div><div style={{fontSize:14,fontWeight:700}}>{cat.icon} {l.lessonName||l.place}</div><div style={{fontSize:11,color:"#94a3b8"}}>{l.place} {l.startTime&&l.endTime?`${l.startTime}〜${l.endTime} · `:""}<span style={{color:"#f59e0b"}}>{l.freq}</span></div></div>
                    <div style={{fontSize:18,fontWeight:700,color:cat.color,fontFamily:"'DM Mono',monospace"}}>¥{inc.toLocaleString()}</div>
                  </div>
                  {Array.from({length:lg.count??1}).map((_,si)=>(
                    <div key={si} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,background:"#f8fafc",borderRadius:10,padding:"10px 12px"}}>
                      <div style={{fontSize:14,color:"#94a3b8",minWidth:50}}>{si+1}回目</div>
                      <button onClick={()=>{setLogs(p=>{const cur={...getLog(l.id)};const s=[...(cur.peopleSessions??Array(cur.count??1).fill(l.defaultPeople))];s[si]=Math.max(1,(s[si]??l.defaultPeople)-1);return{...p,[l.id]:{...cur,peopleSessions:s}};});flash();}} style={cBtn}>－</button>
                      <span style={{fontSize:20,fontWeight:700,minWidth:40,textAlign:"center",fontFamily:"'DM Mono',monospace"}}>{(getLog(l.id).peopleSessions?.[si]??l.defaultPeople)}</span>
                      <button onClick={()=>{setLogs(p=>{const cur={...getLog(l.id)};const s=[...(cur.peopleSessions??Array(cur.count??1).fill(l.defaultPeople))];s[si]=(s[si]??l.defaultPeople)+1;return{...p,[l.id]:{...cur,peopleSessions:s}};});flash();}} style={cBtn}>＋</button>
                      <span style={{fontSize:13,color:"#94a3b8"}}>人</span>
                      <span style={{fontSize:14,fontWeight:700,color:cat.color,marginLeft:"auto",fontFamily:"'DM Mono',monospace"}}>¥{((getLog(l.id).peopleSessions?.[si]??l.defaultPeople)*l.unitPrice).toLocaleString()}</span>
                    </div>
                  ))}
                  <div style={{display:"flex",gap:8,marginTop:4}}>
                    <button onClick={()=>{setLogs(p=>{const cur={...getLog(l.id)};return{...p,[l.id]:{...cur,count:Math.max(1,(cur.count??1)-1)}};});flash();}} style={{flex:1,padding:"10px",borderRadius:8,border:`1px dashed ${cat.color}60`,background:`${cat.color}08`,color:cat.color,fontSize:14,cursor:"pointer",...F}}>回数 －</button>
                    <button onClick={()=>{setLogs(p=>{const cur={...getLog(l.id)};return{...p,[l.id]:{...cur,count:(cur.count??1)+1}};});flash();}} style={{flex:1,padding:"10px",borderRadius:8,border:`1px dashed ${cat.color}60`,background:`${cat.color}08`,color:cat.color,fontSize:14,cursor:"pointer",...F}}>回数 ＋</button>
                  </div>
                </div>
              );
            })}
            {lessons.filter(l=>l.category==="circle").length===0&&<div style={{textAlign:"center",color:"#94a3b8",padding:"30px 0",fontSize:15}}><div style={{fontSize:36,marginBottom:8}}>👥</div>⚙️ レッスン管理からサークルを追加してね</div>}

            {/* サービス名未設定時は設定促すボタンのみ表示 */}
            {!subSettings.serviceName ? (
              <div style={{background:"white",borderRadius:16,padding:16,marginTop:12,boxShadow:"0 2px 12px #00000012",border:"1px dashed #10b98140",textAlign:"center"}}>
                <div style={{fontSize:28,marginBottom:8}}>📱</div>
                <div style={{fontSize:14,color:"#94a3b8",marginBottom:12}}>サブスクサービスを使っていますか？</div>
                <button onClick={()=>document.getElementById("sub-service-name")?.focus()}
                  style={{padding:"10px 20px",borderRadius:10,border:"none",background:"#10b981",color:"white",fontWeight:700,fontSize:14,cursor:"pointer",...F}}>
                  ＋ サブスクを設定する
                </button>
              </div>
            ) : (
            <div style={{background:"white",borderRadius:16,padding:16,marginTop:12,boxShadow:"0 2px 12px #00000012",border:"1px solid #10b98120"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div><div style={{fontSize:14,fontWeight:700}}>📱 {subSettings.serviceName||"ENARIZE MEMBERS"}</div><div style={{fontSize:11,color:"#94a3b8"}}>通常¥{(subSettings.normalPrice??1500).toLocaleString()} / 👑¥{(subSettings.vipPrice??1000).toLocaleString()}</div></div>
                <div style={{fontSize:18,fontWeight:700,color:"#10b981",fontFamily:"'DM Mono',monospace"}}>¥{subIncome.toLocaleString()}</div>
              </div>
              {/* サービス名 */}
              <div style={{marginBottom:12}}>
                <div style={{fontSize:12,color:"#10b981",fontWeight:700,marginBottom:6}}>サービス名</div>
                <input
                  type="text"
                  value={subSettings.serviceName||""}
                  onChange={e=>setSubSettings(s=>({...s,serviceName:e.target.value}))}
                  placeholder="例：ENARIZE MEMBERS"
                  id="sub-service-name" style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #bbf7d0",background:"#f0fdf4",fontSize:15,fontWeight:700,color:"#1e293b",boxSizing:"border-box",...F,outline:"none"}}
                />
              </div>
              {/* 単価設定 */}
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                <div style={{flex:1,background:"#f0fdf4",borderRadius:10,padding:"10px 12px",border:"1px solid #bbf7d0"}}>
                  <div style={{fontSize:11,color:"#10b981",fontWeight:700,marginBottom:6}}>通常単価</div>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{fontSize:12,color:"#64748b"}}>¥</span>
                    <input type="number" value={subSettings.normalPrice??1500} onChange={e=>setSubSettings(s=>({...s,normalPrice:Number(e.target.value)||0}))}
                      style={{width:"100%",padding:"6px 8px",borderRadius:8,border:"1px solid #bbf7d0",fontSize:16,fontWeight:700,color:"#10b981",fontFamily:"'DM Mono',monospace",textAlign:"right",...F}}/>
                  </div>
                </div>
                <div style={{flex:1,background:"#fdf4ff",borderRadius:10,padding:"10px 12px",border:"1px solid #e9d5ff"}}>
                  <div style={{fontSize:11,color:"#a855f7",fontWeight:700,marginBottom:6}}>👑 お得意様単価</div>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{fontSize:12,color:"#64748b"}}>¥</span>
                    <input type="number" value={subSettings.vipPrice??1000} onChange={e=>setSubSettings(s=>({...s,vipPrice:Number(e.target.value)||0}))}
                      style={{width:"100%",padding:"6px 8px",borderRadius:8,border:"1px solid #e9d5ff",fontSize:16,fontWeight:700,color:"#a855f7",fontFamily:"'DM Mono',monospace",textAlign:"right",...F}}/>
                  </div>
                </div>
              </div>
              {/* 通常人数 */}
              <div style={{display:"flex",alignItems:"center",gap:12,background:"#f0fdf4",borderRadius:10,padding:"10px 12px",marginBottom:8,border:"1px solid #bbf7d0"}}>
                <span style={{fontSize:12,color:"#10b981",fontWeight:700,minWidth:60}}>通常</span>
                <button onClick={()=>setSubSettings(s=>({...s,normalCount:Math.max(0,(s.normalCount??0)-1)}))} style={cBtn}>－</button>
                <span style={{fontSize:22,fontWeight:700,minWidth:40,textAlign:"center",fontFamily:"'DM Mono',monospace",color:"#10b981"}}>{subSettings.normalCount??0}</span>
                <button onClick={()=>setSubSettings(s=>({...s,normalCount:(s.normalCount??0)+1}))} style={cBtn}>＋</button>
                <span style={{fontSize:12,color:"#94a3b8"}}>人</span>
                <span style={{marginLeft:"auto",fontSize:14,fontWeight:700,color:"#10b981",fontFamily:"'DM Mono',monospace"}}>¥{((subSettings.normalCount??0)*(subSettings.normalPrice??1500)).toLocaleString()}</span>
              </div>
              {/* お得意様人数 */}
              <div style={{display:"flex",alignItems:"center",gap:12,background:"#fdf4ff",borderRadius:10,padding:"10px 12px",border:"1px solid #e9d5ff"}}>
                <span style={{fontSize:12,color:"#a855f7",fontWeight:700,minWidth:60}}>👑 お得意様</span>
                <button onClick={()=>setSubSettings(s=>({...s,vipCount:Math.max(0,(s.vipCount??0)-1)}))} style={cBtn}>－</button>
                <span style={{fontSize:22,fontWeight:700,minWidth:40,textAlign:"center",fontFamily:"'DM Mono',monospace",color:"#a855f7"}}>{subSettings.vipCount??0}</span>
                <button onClick={()=>setSubSettings(s=>({...s,vipCount:(s.vipCount??0)+1}))} style={cBtn}>＋</button>
                <span style={{fontSize:12,color:"#94a3b8"}}>人</span>
                <span style={{marginLeft:"auto",fontSize:14,fontWeight:700,color:"#a855f7",fontFamily:"'DM Mono',monospace"}}>¥{((subSettings.vipCount??0)*(subSettings.vipPrice??1000)).toLocaleString()}</span>
              </div>
            </div>
            )}
          </div>
        )}

        {/* ══ PART TIME ══ */}
        {tab==="parttime"&&(
          <div>
            <button onClick={()=>{setEditPart(null);setLForm({category:"part",lessonName:"",place:"",hourlyRate:"",transport:"",transportPer:"shift",dayShifts:{}});setShowAddPart(true);}}
              style={{width:"100%",padding:16,borderRadius:14,border:"none",background:"linear-gradient(135deg,#f97316,#f59e0b)",color:"white",fontWeight:700,fontSize:17,cursor:"pointer",marginBottom:16,...F}}>
              ＋ アルバイトを追加する
            </button>
            {lessons.filter(l=>l.category==="part").length===0&&(
              <div style={{textAlign:"center",color:"#94a3b8",padding:"30px 0",fontSize:15}}>
                <div style={{fontSize:40,marginBottom:8}}>💼</div>
                まだアルバイトが登録されていないよ！
              </div>
            )}
            {lessons.filter(l=>l.category==="part").map(l=>{
              const cat=CATEGORIES[l.category];
              const lg=getLog(l.id);
              const inc=lessonIncome(l);
              const rate=Number(l.hourlyRate)||0;
              const dayShifts=l.dayShifts??{};
              const transport=Number(l.transport)||0;

              const lastDay=new Date(calYear,calMonth,0).getDate();
              const workDays=[];
              for(let d=1;d<=lastDay;d++){
                const dow=new Date(calYear,calMonth-1,d).getDay();
                const si=dow===0?6:dow-1;
                const sh=dayShifts[si];
                if(!sh||!sh.enabled||!sh.startTime||!sh.endTime) continue;
                const ds=`${mk}-${String(d).padStart(2,"0")}`;
                const absent=(lg.absentDates??[]).includes(ds);
                const ov=(lg.shiftOverrides??{})[ds];
                const useStart=ov?.startTime??sh.startTime;
                const useEnd=ov?.endTime??sh.endTime;
                const mins=calcMins(useStart,useEnd);
                const wage=calcFeeFromTime(useStart,useEnd,rate);
                workDays.push({d,dow,si,sh,ds,absent,mins,wage,useStart,useEnd,ov});
              }

              // ★ オーバーライド対応の合計計算
              const totalMins=workDays.filter(x=>!x.absent).reduce((s,x)=>s+x.mins,0);
              const totalWage=workDays.filter(x=>!x.absent).reduce((s,x)=>s+x.wage+(l.transportPer==="shift"?transport:0),0)
                +(l.transportPer==="month"?transport:0);

              const toggleAbsent=(ds)=>{
                setEditingShift(null);
                setLogs(p=>{
                  const cur={...getLog(l.id)};
                  const ab=cur.absentDates??[];
                  return{...p,[l.id]:{...cur,absentDates:ab.includes(ds)?ab.filter(x=>x!==ds):[...ab,ds]}};
                });
                flash();
              };

              return (
                <div key={l.id} style={{background:"white",borderRadius:16,padding:16,marginBottom:14,boxShadow:"0 2px 12px #00000012"}}>
                  {/* ヘッダー */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                    <div>
                      <div style={{fontSize:18,fontWeight:700}}>{cat.icon} {l.lessonName||l.place}</div>
                      <div style={{fontSize:13,color:"#94a3b8"}}>{l.place} · 時給¥{rate.toLocaleString()}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>今月収入見込み</div>
                      <div style={{fontSize:18,fontWeight:700,color:cat.color,fontFamily:"'DM Mono',monospace",marginBottom:6}}>¥{inc.toLocaleString()}</div>
                      <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                        <button onClick={()=>{setEditPart(l.id);setLForm({...l});setShowAddPart(true);}} style={{background:"#fff7ed",border:"none",borderRadius:6,padding:"4px 10px",color:"#f97316",fontSize:12,cursor:"pointer",...F}}>編集</button>
                        <button onClick={()=>deletePart(l.id)} style={delBtn}>削除</button>
                      </div>
                    </div>
                  </div>

                  {/* 曜日別シフト一覧 */}
                  <div style={{background:"#fff7ed",borderRadius:10,padding:"10px 12px",marginBottom:12,border:"1px solid #fed7aa"}}>
                    <div style={{fontSize:12,color:"#f97316",fontWeight:700,marginBottom:6}}>登録シフト</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {["月","火","水","木","金","土","日"].map((d,i)=>{
                        const sh=dayShifts[i];
                        if(!sh||!sh.enabled) return null;
                        const mins=calcMins(sh.startTime,sh.endTime);
                        return (
                          <div key={i} style={{background:"white",borderRadius:8,padding:"4px 10px",border:"1px solid #fed7aa",fontSize:12}}>
                            <span style={{fontWeight:700,color:"#f97316"}}>{d}</span>
                            <span style={{color:"#64748b",marginLeft:4}}>{sh.startTime}〜{sh.endTime}</span>
                            <span style={{color:"#f97316",marginLeft:4,fontWeight:600}}>{fmtMins(mins)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 今月の日付リスト */}
                  {workDays.length===0?(
                    <div style={{textAlign:"center",color:"#94a3b8",fontSize:13,padding:"16px 0"}}>シフトが登録されていません</div>
                  ):(
                    <>
                      <div style={{fontSize:13,color:"#64748b",fontWeight:700,marginBottom:8}}>
                        今月の出勤日
                        <span style={{fontSize:11,fontWeight:400,marginLeft:6}}>タップ：欠勤 ✏️：時間変更</span>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:0,marginBottom:12}}>
                        {workDays.map(({d,dow,ds,sh,absent,mins,wage,useStart,useEnd,ov})=>{
                          const dayLabel=["日","月","火","水","木","金","土"][dow];
                          const isEditing=editingShift?.ds===ds;

                          return (
                            <div key={ds} style={{marginBottom:6}}>
                              {/* 出勤日カード */}
                              <div onClick={()=>!isEditing&&toggleAbsent(ds)}
                                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:isEditing?"10px 10px 0 0":"10px",background:absent?"#f8fafc":"#fff7ed",border:absent?"1px solid #e2e8f0":"1px solid #fed7aa",cursor:isEditing?"default":"pointer",opacity:absent?0.5:1}}>
                                <div style={{width:40,height:40,borderRadius:10,background:absent?"#e2e8f0":cat.color,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                                  <span style={{fontSize:13,fontWeight:700,color:"white"}}>{d}</span>
                                  <span style={{fontSize:10,color:"white",opacity:0.8}}>{dayLabel}</span>
                                </div>
                                <div style={{flex:1}}>
                                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                                    <span style={{fontSize:13,color:absent?"#94a3b8":"#1e293b"}}>{useStart}〜{useEnd}</span>
                                    {ov&&<span style={{fontSize:10,color:"#f97316",background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:4,padding:"1px 5px",fontWeight:700}}>変更済</span>}
                                  </div>
                                  <div style={{fontSize:11,color:"#94a3b8"}}>{fmtMins(mins)}</div>
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  {absent?(
                                    <span style={{fontSize:12,color:"#ef4444",fontWeight:700}}>欠勤</span>
                                  ):(
                                    <span style={{fontSize:14,fontWeight:700,color:cat.color,fontFamily:"'DM Mono',monospace"}}>
                                      ¥{(wage+(l.transportPer==="shift"?transport:0)).toLocaleString()}
                                    </span>
                                  )}
                                  {!absent&&(
                                    <button
                                      onClick={e=>{
                                        e.stopPropagation();
                                        setEditingShift(isEditing ? null : {ds, startTime:useStart, endTime:useEnd});
                                      }}
                                      style={{background:isEditing?"#f97316":"#fff7ed",border:"1px solid #fed7aa",borderRadius:6,padding:"5px 8px",fontSize:13,cursor:"pointer",color:isEditing?"white":"#f97316",fontWeight:700,...F}}>
                                      {isEditing?"✕":"✏️"}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* ★ インライン時間編集パネル */}
                              {isEditing&&(
                                <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderTop:"none",borderRadius:"0 0 10px 10px",padding:"12px 14px"}}>
                                  <div style={{fontSize:12,color:"#f97316",fontWeight:700,marginBottom:10}}>
                                    {calMonth}月{d}日の時間を変更
                                  </div>
                                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                                    <span style={{fontSize:12,color:"#64748b",minWidth:28}}>開始</span>
                                    <select value={editingShift.startTime} onChange={e=>setEditingShift(s=>({...s,startTime:e.target.value}))}
                                      style={{flex:1,padding:"8px 10px",borderRadius:8,border:"1px solid #fed7aa",background:"white",fontSize:15,...F}}>
                                      {TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
                                    </select>
                                    <span style={{color:"#94a3b8",fontSize:14}}>〜</span>
                                    <select value={editingShift.endTime} onChange={e=>setEditingShift(s=>({...s,endTime:e.target.value}))}
                                      style={{flex:1,padding:"8px 10px",borderRadius:8,border:"1px solid #fed7aa",background:"white",fontSize:15,...F}}>
                                      {TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
                                    </select>
                                  </div>
                                  {/* プレビュー */}
                                  <div style={{background:"white",borderRadius:8,padding:"8px 12px",marginBottom:10,border:"1px solid #fed7aa",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                    <span style={{fontSize:12,color:"#64748b"}}>{fmtMins(calcMins(editingShift.startTime,editingShift.endTime))}</span>
                                    <span style={{fontSize:15,fontWeight:700,color:cat.color,fontFamily:"'DM Mono',monospace"}}>
                                      ¥{(calcFeeFromTime(editingShift.startTime,editingShift.endTime,rate)+(l.transportPer==="shift"?transport:0)).toLocaleString()}
                                    </span>
                                  </div>
                                  <div style={{display:"flex",gap:8}}>
                                    <button onClick={()=>{
                                      setLogs(p=>{
                                        const cur={...getLog(l.id)};
                                        const ov={...(cur.shiftOverrides??{}),[ds]:{startTime:editingShift.startTime,endTime:editingShift.endTime}};
                                        return{...p,[l.id]:{...cur,shiftOverrides:ov}};
                                      });
                                      setEditingShift(null);flash();
                                    }} style={{flex:2,padding:"10px",borderRadius:8,border:"none",background:"#f97316",color:"white",fontWeight:700,fontSize:14,cursor:"pointer",...F}}>
                                      保存する
                                    </button>
                                    {ov&&(
                                      <button onClick={()=>{
                                        setLogs(p=>{
                                          const cur={...getLog(l.id)};
                                          const ovNew={...(cur.shiftOverrides??{})};
                                          delete ovNew[ds];
                                          return{...p,[l.id]:{...cur,shiftOverrides:ovNew}};
                                        });
                                        setEditingShift(null);flash();
                                      }} style={{flex:1,padding:"10px",borderRadius:8,border:"1px solid #fed7aa",background:"white",color:"#f97316",fontWeight:700,fontSize:13,cursor:"pointer",...F}}>
                                        リセット
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* 合計 */}
                      <div style={{background:"#fff7ed",borderRadius:10,padding:"12px 14px",border:"1px solid #fed7aa"}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                          <span style={{fontSize:13,color:"#64748b"}}>出勤日数</span>
                          <span style={{fontSize:14,fontWeight:700,color:"#f97316"}}>{workDays.filter(x=>!x.absent).length}日 / {workDays.length}日</span>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                          <span style={{fontSize:13,color:"#64748b"}}>合計勤務時間</span>
                          <span style={{fontSize:14,fontWeight:700,color:"#f97316"}}>{fmtMins(totalMins)}</span>
                        </div>
                        {l.transportPer==="month"&&transport>0&&(
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                            <span style={{fontSize:13,color:"#10b981"}}>🚗 交通費（月まとめ）</span>
                            <span style={{fontSize:14,fontWeight:700,color:"#10b981"}}>+¥{transport.toLocaleString()}</span>
                          </div>
                        )}
                        <div style={{display:"flex",justifyContent:"space-between",paddingTop:8,borderTop:"1px solid #fed7aa"}}>
                          <span style={{fontSize:14,fontWeight:700,color:"#64748b"}}>今月合計</span>
                          <span style={{fontSize:18,fontWeight:700,color:cat.color,fontFamily:"'DM Mono',monospace"}}>¥{totalWage.toLocaleString()}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ══ EXPENSES ══ */}
        {tab==="expenses"&&(
          <div>
            <div style={{background:"white",borderRadius:16,padding:16,marginBottom:14,boxShadow:"0 2px 12px #00000012"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div><div style={{fontSize:13,fontWeight:700,color:"#64748b"}}>今月の支出合計</div><div style={{fontSize:26,fontWeight:700,color:"#ef4444",fontFamily:"'DM Mono',monospace"}}>¥{totalExpenses.toLocaleString()}</div></div>
                <button onClick={()=>setShowAddExpense(true)} style={{padding:"8px 14px",borderRadius:10,border:"none",background:"#3b82f6",color:"white",fontWeight:700,fontSize:13,cursor:"pointer",...F}}>＋ 追加</button>
              </div>
              {EXPENSE_CATS.map(cat=>{
                const total=expenses.filter(e=>e.category===cat).reduce((s,e)=>s+Number(e.amount),0);
                if(!total) return null;
                return <div key={cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:8,height:8,borderRadius:"50%",background:EXPENSE_COLORS[cat]}}/><span style={{fontSize:13}}>{cat}</span></div><span style={{fontSize:13,fontWeight:700,color:"#ef4444",fontFamily:"'DM Mono',monospace"}}>¥{total.toLocaleString()}</span></div>;
              })}
            </div>
            {expenses.length===0&&<div style={{textAlign:"center",color:"#94a3b8",padding:"30px 0",fontSize:14}}><div style={{fontSize:36,marginBottom:8}}>💸</div>支出がまだないよ！</div>}
            {[...expenses].sort((a,b)=>a.date.localeCompare(b.date)).map(e=>(
              <div key={e.id} style={{background:"white",borderRadius:12,padding:"12px 16px",marginBottom:8,boxShadow:"0 1px 6px #00000010",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}><div style={{width:8,height:8,borderRadius:"50%",background:EXPENSE_COLORS[e.category]}}/><span style={{fontSize:13,fontWeight:700}}>{e.category}</span></div><div style={{fontSize:11,color:"#94a3b8"}}>{e.date.split("-").slice(1).join("/")} {e.note&&`· ${e.note}`}</div></div>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:15,fontWeight:700,color:"#ef4444",fontFamily:"'DM Mono',monospace"}}>¥{Number(e.amount).toLocaleString()}</span><button onClick={()=>{setExpenses(p=>p.filter(x=>x.id!==e.id));flash();}} style={delBtn}>削除</button></div>
              </div>
            ))}
          </div>
        )}

        {/* ══ LESSONS ══ */}
        {tab==="lessons"&&(
          <div>
            <button onClick={()=>{setEditLesson(null);setLForm(blankLesson);setShowAddLesson(true);}}
              style={{width:"100%",padding:18,borderRadius:14,border:"none",background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",color:"white",fontWeight:700,fontSize:18,cursor:"pointer",marginBottom:16,...F}}>
              ＋ レッスンを追加する
            </button>
            {Object.entries(CATEGORIES).filter(([k])=>k!=="sub"&&k!=="part").map(([key,cat])=>{
              const ls=lessons.filter(l=>l.category===key);
              if(!ls.length) return null;
              return (
                <div key={key} style={{marginBottom:20}}>
                  <div style={{fontSize:13,fontWeight:700,color:cat.color,marginBottom:8}}>{cat.icon} {cat.label}</div>
                  {ls.map(l=>(
                    <div key={l.id} style={{background:"white",borderRadius:12,padding:"12px 14px",marginBottom:8,boxShadow:"0 1px 6px #00000010",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:18,fontWeight:700,marginBottom:6}}>{l.lessonName&&<span style={{marginRight:6,color:"#1e293b"}}>{l.lessonName}</span>}<span style={{color:"#64748b"}}>{l.place}</span></div>
                        <div style={{fontSize:11,color:"#94a3b8"}}>
                          {SCHED_DAYS[l.day]}曜{l.startTime&&l.endTime?` ${l.startTime}〜${l.endTime}`:""} · <span style={{color:"#f59e0b"}}>{l.freq}</span>
                          {l.holiday5&&<span style={{marginLeft:4,color:"#f59e0b",fontSize:10}}>🏢5の日休</span>}
                          {l.holidayOff&&<span style={{marginLeft:4,color:"#db2777",fontSize:10}}>🎌祝日休</span>}
                        </div>
                        <div style={{fontSize:12,fontWeight:700,color:cat.color,marginTop:2,fontFamily:"'DM Mono',monospace"}}>
                          {key==="regular"&&`¥${getLessonFee(l).toLocaleString()}/回`}
                          {key==="circle"&&`¥${(l.unitPrice??0).toLocaleString()}/人`}
                          {key==="event"&&`¥${getLessonFee(l).toLocaleString()}`}
                          {l.feeMode==="calc"&&<span style={{fontSize:10,color:"#94a3b8",marginLeft:4}}>（時給計算）</span>}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>{setEditLesson(l.id);setLForm({...l});setShowAddLesson(true);}} style={{background:"#eff6ff",border:"none",borderRadius:6,padding:"4px 10px",color:"#3b82f6",fontSize:12,cursor:"pointer",...F}}>編集</button>
                        <button onClick={()=>deleteLesson(l.id)} style={delBtn}>削除</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
            {lessons.filter(l=>l.category!=="part").length===0&&<div style={{textAlign:"center",color:"#94a3b8",padding:"40px 0",fontSize:13}}><div style={{fontSize:40,marginBottom:8}}>📋</div>まだレッスンが登録されていないよ！<br/>上のボタンから追加してね</div>}

            <div style={{height:1,background:"#e2e8f0",margin:"20px 0"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:700,color:"#f59e0b"}}>💴 給料グループ</div>
              <button onClick={()=>setShowAddPayGroup(true)} style={{fontSize:12,color:"#f59e0b",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"4px 12px",cursor:"pointer",...F}}>＋ 追加</button>
            </div>
            {payGroups.length===0&&<div style={{fontSize:12,color:"#94a3b8",textAlign:"center",padding:"16px 0"}}>給料グループを追加すると<br/>カレンダーに給料日が表示されるよ！</div>}
            {payGroups.map(g=>(
              <div key={g.id} style={{background:"white",borderRadius:12,padding:"12px 14px",marginBottom:8,boxShadow:"0 1px 6px #00000010",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontSize:13,fontWeight:600}}>{g.name}</div><div style={{fontSize:11,color:"#94a3b8"}}>毎月{g.payDay===0?"末日":`${g.payDay}日`}払い · {g.lessonIds?.length??0}件</div></div>
                <button onClick={()=>{if(window.confirm("削除しますか？"))setPayGroups(p=>p.filter(x=>x.id!==g.id));}} style={delBtn}>削除</button>
              </div>
            ))}
          </div>
        )}

        {/* ══ MERCH 物販 ══ */}
        {tab==="merch"&&(
          <div>
            <div style={{background:"white",borderRadius:16,padding:16,marginBottom:14,boxShadow:"0 2px 12px #00000012"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div>
                  <div style={{fontSize:11,color:"#94a3b8",letterSpacing:1,marginBottom:4}}>今月の物販売上</div>
                  <div style={{fontSize:32,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"#ec4899"}}>¥{merchIncome.toLocaleString()}</div>
                </div>
                <button onClick={()=>{setSaleForm({...blankSale, date:`${mk}-01`});setShowAddSale(true);}}
                  style={{padding:"10px 16px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#ec4899,#f97316)",color:"white",fontWeight:700,fontSize:14,cursor:"pointer",...F}}>
                  ＋ 売上入力
                </button>
              </div>
              {merchStats.filter(m=>m.totalSales>0).map(m=>{
                const pct = merchIncome > 0 ? m.totalSales/merchIncome*100 : 0;
                return (
                  <div key={m.id} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:13,fontWeight:600}}>{m.name}</span>
                      <span style={{fontSize:13,fontFamily:"'DM Mono',monospace",color:"#ec4899"}}>
                        ¥{m.totalSales.toLocaleString()}
                        <span style={{fontSize:10,color:"#94a3b8",marginLeft:4}}>({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div style={{height:8,background:"#f1f5f9",borderRadius:4}}>
                      <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#ec4899,#f97316)",borderRadius:4}}/>
                    </div>
                    <div style={{display:"flex",gap:12,marginTop:4}}>
                      {m.normalQty>0&&<span style={{fontSize:11,color:"#64748b"}}>通常 {m.normalQty}枚 · ¥{m.normalSales.toLocaleString()}</span>}
                      {m.memberQty>0&&<span style={{fontSize:11,color:"#ec4899"}}>👑 メンバー {m.memberQty}枚 · ¥{m.memberSales.toLocaleString()}</span>}
                    </div>
                  </div>
                );
              })}
              {merchIncome===0&&<div style={{textAlign:"center",color:"#94a3b8",fontSize:13,padding:"8px 0"}}>まだ今月の売上なし</div>}
            </div>

            {merchLogs.length>0&&(
              <div style={{background:"white",borderRadius:16,padding:16,marginBottom:14,boxShadow:"0 2px 12px #00000012"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#64748b",marginBottom:12}}>📋 今月の売上履歴</div>
                {[...merchLogs].reverse().map(log=>{
                  const item = merch.find(m=>m.id===log.merchId);
                  if(!item) return null;
                  const price = log.isMember ? (item.memberPrice??item.price) : item.price;
                  const total = price * log.qty;
                  return (
                    <div key={log.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                          {log.isMember&&<span style={{fontSize:10,background:"#fdf4ff",color:"#a855f7",border:"1px solid #e9d5ff",borderRadius:6,padding:"1px 6px",fontWeight:700}}>👑 メンバー</span>}
                          <span style={{fontSize:14,fontWeight:700}}>{item.name}</span>
                        </div>
                        <div style={{fontSize:11,color:"#94a3b8"}}>{log.date.split("-").slice(1).join("/")} · {log.qty}枚 × ¥{price.toLocaleString()} {log.note&&`· ${log.note}`}</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:15,fontWeight:700,color:"#ec4899",fontFamily:"'DM Mono',monospace"}}>¥{total.toLocaleString()}</span>
                        <button onClick={()=>{setMerchLogs(p=>p.filter(x=>x.id!==log.id));flash();}} style={delBtn}>削除</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{background:"white",borderRadius:16,padding:16,boxShadow:"0 2px 12px #00000012"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontSize:14,fontWeight:700,color:"#64748b"}}>🏷️ 商品マスタ</div>
                <button onClick={()=>{setEditMerch(null);setMForm(blankMerch);setShowAddMerch(true);}}
                  style={{fontSize:12,color:"#ec4899",background:"#fdf2f8",border:"1px solid #fbcfe8",borderRadius:8,padding:"5px 12px",cursor:"pointer",...F}}>＋ 商品追加</button>
              </div>
              {merch.length===0&&(
                <div style={{textAlign:"center",color:"#94a3b8",padding:"24px 0",fontSize:13}}>
                  <div style={{fontSize:36,marginBottom:8}}>🛍️</div>
                  商品を登録してから売上を入力してね
                </div>
              )}
              {merch.map(item=>(
                <div key={item.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>{item.name}</div>
                    <div style={{display:"flex",gap:10,alignItems:"center"}}>
                      <span style={{fontSize:13,color:"#64748b",fontFamily:"'DM Mono',monospace"}}>¥{item.price.toLocaleString()}</span>
                      {item.memberPrice&&<span style={{fontSize:12,color:"#a855f7",background:"#fdf4ff",border:"1px solid #e9d5ff",borderRadius:6,padding:"1px 8px",fontFamily:"'DM Mono',monospace"}}>👑 ¥{item.memberPrice.toLocaleString()}</span>}
                    </div>
                    {item.note&&<div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{item.note}</div>}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{setEditMerch(item.id);setMForm({...item,price:String(item.price),memberPrice:String(item.memberPrice||""),hasMemberPrice:!!item.memberPrice});setShowAddMerch(true);}}
                      style={{background:"#eff6ff",border:"none",borderRadius:6,padding:"4px 10px",color:"#3b82f6",fontSize:12,cursor:"pointer",...F}}>編集</button>
                    <button onClick={()=>deleteMerch(item.id)} style={delBtn}>削除</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ ANALYSIS ══ */}
        {tab==="analysis"&&(
          <div>
            <div style={{background:"white",borderRadius:16,padding:16,marginBottom:12,boxShadow:"0 2px 12px #00000012"}}>
              <div style={{fontSize:16,fontWeight:700,color:"#64748b",marginBottom:16}}>📊 収入内訳</div>
              {[...Object.entries(CATEGORIES).map(([key,cat])=>[cat.label,key==="sub"?subsIncome:lessons.filter(l=>l.category===key).reduce((s,l)=>s+lessonIncome(l),0),cat.color]),["サブスク",subIncome,"#10b981"],["物販",merchIncome,"#ec4899"],["スポット",spotIncome,"#64748b"]].filter(([,v])=>v>0).map(([l,v,c])=>{
                const pct=totalIncome>0?v/totalIncome*100:0;
                return <div key={l} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12}}>{l}</span><span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:c}}>¥{v.toLocaleString()} <span style={{color:"#94a3b8",fontSize:10}}>({pct.toFixed(0)}%)</span></span></div><div style={{height:8,background:"#f1f5f9",borderRadius:4}}><div style={{height:"100%",width:`${pct}%`,background:c,borderRadius:4}}/></div></div>;
              })}
            </div>
            <div style={{background:"white",borderRadius:16,padding:16,boxShadow:"0 2px 12px #00000012"}}>
              <div style={{fontSize:16,fontWeight:700,color:"#64748b",marginBottom:14}}>💰 収支サマリー</div>
              {[["総収入",totalIncome,"#10b981"],["総支出",totalExpenses,"#ef4444"],["手残り",netIncome,netIncome>=0?"#3b82f6":"#ef4444"]].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <span style={{fontSize:13,fontWeight:600}}>{l}</span>
                  <span style={{fontSize:16,fontWeight:700,color:c,fontFamily:"'DM Mono',monospace"}}>¥{Math.abs(v).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ══ MODALS ══ */}

      {showAddLesson&&(
        <Modal onClose={()=>{setShowAddLesson(false);setEditLesson(null);setLForm(blankLesson);}} title={editLesson?"✏️ レッスンを編集":"➕ レッスンを追加"} color="#3b82f6">
          <Label>カテゴリ</Label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            {Object.entries(CATEGORIES).filter(([k])=>k!=="sub"&&k!=="part").map(([key,cat])=>(
              <button key={key} onClick={()=>setLForm(f=>({...f,category:key}))}
                style={{padding:"10px 8px",borderRadius:10,border:lForm.category===key?`2px solid ${cat.color}`:"2px solid #e2e8f0",background:lForm.category===key?cat.color+"15":"white",color:lForm.category===key?cat.color:"#64748b",fontSize:14,cursor:"pointer",textAlign:"left",...F}}>
                <div style={{fontWeight:700}}>{cat.icon} {cat.label}</div>
                <div style={{fontSize:10,marginTop:2,color:"#94a3b8"}}>{cat.desc}</div>
              </button>
            ))}
          </div>

          <Label>場所名（ジム・施設名）</Label><LInput value={lForm.place} onChange={v=>setLForm(f=>({...f,place:v}))} placeholder="例：○○体育館"/>
          <Label>レッスン名</Label><LInput value={lForm.lessonName||""} onChange={v=>setLForm(f=>({...f,lessonName:v}))} placeholder="例：エアロビクス・ヨガ・コンディショニング"/>

          <Label>曜日</Label>
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
            {SCHED_DAYS.map((d,i)=>(
              <button key={i} onClick={()=>setLForm(f=>({...f,day:i}))}
                style={{padding:"8px 14px",borderRadius:8,border:Number(lForm.day)===i?"2px solid #3b82f6":"2px solid #e2e8f0",background:Number(lForm.day)===i?"#eff6ff":"white",color:Number(lForm.day)===i?"#3b82f6":"#64748b",fontSize:15,cursor:"pointer",...F}}>{d}</button>
            ))}
          </div>

          <TimePicker label="開始時間" value={lForm.startTime} onChange={v=>setLForm(f=>({...f,startTime:v}))}/>
          <TimePicker label="終了時間" value={lForm.endTime} onChange={v=>setLForm(f=>({...f,endTime:v}))}/>

          {(lForm.category==="regular"||lForm.category==="event")&&(
            <>
              <Label>報酬の計算方法</Label>
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                {[["fixed","金額を直接入力"],["calc","時給×実分数で計算"]].map(([mode,label])=>(
                  <button key={mode} onClick={()=>setLForm(f=>({...f,feeMode:mode}))}
                    style={{flex:1,padding:"8px",borderRadius:8,border:lForm.feeMode===mode?"2px solid #3b82f6":"2px solid #e2e8f0",background:lForm.feeMode===mode?"#eff6ff":"white",color:lForm.feeMode===mode?"#3b82f6":"#64748b",fontSize:11,cursor:"pointer",...F}}>{label}</button>
                ))}
              </div>
              {lForm.feeMode==="fixed"
                ? <><Label>1回の報酬（円）</Label><LInput type="number" value={lForm.fee} onChange={v=>setLForm(f=>({...f,fee:v}))} placeholder="例：3000"/></>
                : <><Label>時給（円）</Label><LInput type="number" value={lForm.hourlyRate} onChange={v=>setLForm(f=>({...f,hourlyRate:v}))} placeholder="例：4000"/>
                    {lForm.startTime&&lForm.endTime&&Number(lForm.hourlyRate)>0&&(
                      <div style={{background:"#eff6ff",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#3b82f6",fontWeight:700}}>
                        計算結果：¥{calcFeeFromTime(lForm.startTime,lForm.endTime,Number(lForm.hourlyRate)).toLocaleString()}
                        <span style={{fontSize:10,color:"#94a3b8",marginLeft:6}}>（{lForm.startTime}〜{lForm.endTime}）</span>
                      </div>
                    )}
                  </>
              }
            </>
          )}
          {lForm.category==="circle"&&<><Label>1人あたりの単価（円）</Label><LInput type="number" value={lForm.unitPrice} onChange={v=>setLForm(f=>({...f,unitPrice:v}))} placeholder="例：1500"/><Label>デフォルト人数</Label><LInput type="number" value={lForm.defaultPeople} onChange={v=>setLForm(f=>({...f,defaultPeople:v}))} placeholder="例：10"/></>}

          <Label>交通費支給</Label>
          <LInput type="number" value={lForm.transport||""} onChange={v=>setLForm(f=>({...f,transport:v}))} placeholder="例：500"/>

          <Label>頻度</Label>
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            {FREQS.map(fr=>(
              <button key={fr} onClick={()=>setLForm(f=>({...f,freq:fr}))}
                style={{padding:"6px 14px",borderRadius:8,border:lForm.freq===fr?"2px solid #3b82f6":"2px solid #e2e8f0",background:lForm.freq===fr?"#eff6ff":"white",color:lForm.freq===fr?"#3b82f6":"#64748b",fontSize:15,cursor:"pointer",...F}}>{fr}</button>
            ))}
          </div>

          <div style={{borderTop:"1px solid #f1f5f9",paddingTop:12,marginBottom:14}}>
            <Label>休館日設定</Label>
            {[["holiday5","🏢 5のつく日は休館日"],["holidayOff","🎌 祝日は休み"]].map(([key,label])=>(
              <div key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <span style={{fontSize:13,color:"#64748b"}}>{label}</span>
                <button onClick={()=>setLForm(f=>({...f,[key]:!f[key]}))}
                  style={{width:48,height:26,borderRadius:13,background:lForm[key]?"#3b82f6":"#e2e8f0",border:"none",cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
                  <div style={{width:20,height:20,borderRadius:"50%",background:"white",position:"absolute",top:3,left:lForm[key]?25:3,transition:"left 0.2s"}}/>
                </button>
              </div>
            ))}
          </div>

          <button onClick={saveLesson} style={{width:"100%",padding:16,borderRadius:12,border:"none",background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",color:"white",fontWeight:700,fontSize:17,cursor:"pointer",...F}}>
            {editLesson?"更新する":"追加する"}
          </button>
        </Modal>
      )}

      {showAddSub&&(
        <Modal onClose={()=>setShowAddSub(false)} title="🔄 代行を追加" color="#10b981">
          <Label>ジムを選ぶ（登録済みから）</Label>
          <select value={subForm.lessonId} onChange={e=>setSubForm(f=>({...f,lessonId:e.target.value}))}
            style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#1e293b",fontSize:14,marginBottom:14,boxSizing:"border-box",...F}}>
            <option value="">選んでください</option>
            {lessons.map(l=>(
              <option key={l.id} value={l.id}>{CATEGORIES[l.category].icon} {l.place}（¥{getLessonFee(l).toLocaleString()}）</option>
            ))}
          </select>
          {subForm.lessonId&&(
            <div style={{background:"#f0fdf4",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#10b981",fontWeight:700}}>
              報酬：¥{getLessonFee(lessons.find(l=>l.id===Number(subForm.lessonId)||l.id===subForm.lessonId)||{}).toLocaleString()}
            </div>
          )}
          <Label>日付</Label><LInput type="date" value={subForm.date} onChange={v=>setSubForm(f=>({...f,date:v}))}/>
          <Label>メモ（任意）</Label><LInput value={subForm.note} onChange={v=>setSubForm(f=>({...f,note:v}))} placeholder="例：急遽依頼"/>
          <button onClick={saveSub} style={{width:"100%",padding:13,borderRadius:12,border:"none",background:"#10b981",color:"white",fontWeight:700,fontSize:14,cursor:"pointer",...F}}>追加する</button>
        </Modal>
      )}

      {showAddSpot&&(
        <Modal onClose={()=>setShowAddSpot(false)} title="🎯 スポット収入を追加" color="#ef4444">
          <Label>名前</Label><LInput value={spotForm.name} onChange={v=>setSpotForm(f=>({...f,name:v}))} placeholder="例：特別イベント"/>
          <Label>金額（円）</Label><LInput type="number" value={spotForm.amount} onChange={v=>setSpotForm(f=>({...f,amount:v}))} placeholder="例：10000"/>
          <Label>日付</Label><LInput type="date" value={spotForm.date} onChange={v=>setSpotForm(f=>({...f,date:v}))}/>
          <Label>メモ（任意）</Label><LInput value={spotForm.note} onChange={v=>setSpotForm(f=>({...f,note:v}))} placeholder="任意"/>
          <button onClick={saveSpot} style={{width:"100%",padding:13,borderRadius:12,border:"none",background:"#ef4444",color:"white",fontWeight:700,fontSize:14,cursor:"pointer",...F}}>追加する</button>
        </Modal>
      )}

      {showAddExpense&&(
        <Modal onClose={()=>setShowAddExpense(false)} title="💸 支出を追加" color="#10b981">
          <Label>カテゴリ</Label>
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            {EXPENSE_CATS.map(cat=>(
              <button key={cat} onClick={()=>setExpForm(f=>({...f,category:cat}))}
                style={{padding:"6px 14px",borderRadius:8,border:expForm.category===cat?`2px solid ${EXPENSE_COLORS[cat]}`:"2px solid #e2e8f0",background:expForm.category===cat?EXPENSE_COLORS[cat]+"15":"white",color:expForm.category===cat?EXPENSE_COLORS[cat]:"#64748b",fontSize:12,cursor:"pointer",...F}}>{cat}</button>
            ))}
          </div>
          <Label>金額（円）</Label><LInput type="number" value={expForm.amount} onChange={v=>setExpForm(f=>({...f,amount:v}))} placeholder="例：500"/>
          <Label>日付</Label><LInput type="date" value={expForm.date} onChange={v=>setExpForm(f=>({...f,date:v}))}/>
          <Label>メモ（任意）</Label><LInput value={expForm.note} onChange={v=>setExpForm(f=>({...f,note:v}))} placeholder="例：○○体育館まで"/>
          <button onClick={saveExpense} style={{width:"100%",padding:13,borderRadius:12,border:"none",background:"#10b981",color:"white",fontWeight:700,fontSize:14,cursor:"pointer",...F}}>追加する</button>
        </Modal>
      )}

      {showAddPayGroup&&(
        <Modal onClose={()=>setShowAddPayGroup(false)} title="💴 給料グループを追加" color="#f59e0b">
          <Label>グループ名</Label><LInput value={pgForm.name} onChange={v=>setPgForm(f=>({...f,name:v}))} placeholder="例：スポーツクラブA・市民体育館"/>
          <Label>給料日（0=月末）</Label><LInput type="number" value={pgForm.payDay} onChange={v=>setPgForm(f=>({...f,payDay:v}))} placeholder="例：25"/>
          <Label>対象レッスン（複数選択可）</Label>
          <div style={{maxHeight:200,overflowY:"auto",marginBottom:14}}>
            {lessons.map(l=>(
              <div key={l.id} onClick={()=>setPgForm(f=>({...f,lessonIds:f.lessonIds?.includes(l.id)?f.lessonIds.filter(x=>x!==l.id):[...(f.lessonIds??[]),l.id]}))}
                style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:8,marginBottom:6,background:pgForm.lessonIds?.includes(l.id)?"#fffbeb":"#f8fafc",border:pgForm.lessonIds?.includes(l.id)?"1px solid #fde68a":"1px solid #e2e8f0",cursor:"pointer"}}>
                <div style={{width:18,height:18,borderRadius:4,background:pgForm.lessonIds?.includes(l.id)?"#f59e0b":"white",border:"2px solid",borderColor:pgForm.lessonIds?.includes(l.id)?"#f59e0b":"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {pgForm.lessonIds?.includes(l.id)&&<span style={{color:"white",fontSize:12,fontWeight:700}}>✓</span>}
                </div>
                <span style={{fontSize:13}}>{CATEGORIES[l.category].icon} {l.place}</span>
              </div>
            ))}
          </div>
          <button onClick={savePayGroup} style={{width:"100%",padding:13,borderRadius:12,border:"none",background:"#f59e0b",color:"white",fontWeight:700,fontSize:14,cursor:"pointer",...F}}>追加する</button>
        </Modal>
      )}

      {/* アルバイト登録モーダル */}
      {showAddPart&&(
        <Modal onClose={()=>{setShowAddPart(false);setEditPart(null);setLForm({category:"part",lessonName:"",place:"",hourlyRate:"",transport:"",transportPer:"shift",dayShifts:{}});}} title={editPart?"✏️ アルバイトを編集":"💼 アルバイトを追加"} color="#f97316">
          <Label>職場名</Label>
          <LInput value={lForm.place} onChange={v=>setLForm(f=>({...f,place:v}))} placeholder="例：○○スポーツクラブ"/>
          <Label>メモ（任意）</Label>
          <LInput value={lForm.lessonName||""} onChange={v=>setLForm(f=>({...f,lessonName:v}))} placeholder="例：フロント業務"/>
          <Label>時給（円）</Label>
          <LInput type="number" value={lForm.hourlyRate} onChange={v=>setLForm(f=>({...f,hourlyRate:v}))} placeholder="例：1050"/>
          <Label>曜日別シフト時間</Label>
          <div style={{marginBottom:14}}>
            {["月","火","水","木","金","土","日"].map((d,i)=>{
              const sh=lForm.dayShifts?.[i]??{enabled:false,startTime:"09:00",endTime:"13:00"};
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"10px 12px",borderRadius:10,background:sh.enabled?"#fff7ed":"#f8fafc",border:sh.enabled?"1px solid #fed7aa":"1px solid #e2e8f0"}}>
                  <button onClick={()=>setLForm(f=>({...f,dayShifts:{...(f.dayShifts??{}),[i]:{...(f.dayShifts?.[i]??{startTime:"09:00",endTime:"13:00"}),enabled:!sh.enabled}}}))}
                    style={{width:36,height:36,borderRadius:8,border:"none",background:sh.enabled?"#f97316":"#e2e8f0",color:"white",fontWeight:700,fontSize:13,cursor:"pointer",...F}}>{d}</button>
                  {sh.enabled&&(
                    <>
                      <select value={sh.startTime||"09:00"} onChange={e=>setLForm(f=>({...f,dayShifts:{...(f.dayShifts??{}),[i]:{...sh,startTime:e.target.value}}}))}
                        style={{flex:1,padding:"6px 8px",borderRadius:8,border:"1px solid #fed7aa",background:"white",fontSize:14,...F}}>
                        {TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                      <span style={{color:"#94a3b8",fontSize:13}}>〜</span>
                      <select value={sh.endTime||"13:00"} onChange={e=>setLForm(f=>({...f,dayShifts:{...(f.dayShifts??{}),[i]:{...sh,endTime:e.target.value}}}))}
                        style={{flex:1,padding:"6px 8px",borderRadius:8,border:"1px solid #fed7aa",background:"white",fontSize:14,...F}}>
                        {TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                      <span style={{fontSize:12,color:"#f97316",fontWeight:700,minWidth:36,textAlign:"right"}}>
                        {fmtMins(calcMins(sh.startTime,sh.endTime))}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <Label>交通費</Label>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {[["shift","出勤ごと"],["month","月まとめ"],["none","なし"]].map(([val,label])=>(
              <button key={val} onClick={()=>setLForm(f=>({...f,transportPer:val}))}
                style={{flex:1,padding:"8px 4px",borderRadius:8,border:(lForm.transportPer??"shift")===val?"2px solid #10b981":"2px solid #e2e8f0",background:(lForm.transportPer??"shift")===val?"#f0fdf4":"white",color:(lForm.transportPer??"shift")===val?"#10b981":"#64748b",fontSize:12,cursor:"pointer",...F}}>
                {label}
              </button>
            ))}
          </div>
          {(lForm.transportPer!=="none")&&<LInput type="number" value={lForm.transport||""} onChange={v=>setLForm(f=>({...f,transport:v}))} placeholder="例：500"/>}
          <button onClick={savePart} style={{width:"100%",padding:16,borderRadius:12,border:"none",background:"linear-gradient(135deg,#f97316,#f59e0b)",color:"white",fontWeight:700,fontSize:17,cursor:"pointer",...F}}>
            {editPart?"更新する":"追加する"}
          </button>
        </Modal>
      )}

      {/* 物販：商品追加モーダル */}
      {showAddMerch&&(
        <Modal onClose={()=>{setShowAddMerch(false);setEditMerch(null);setMForm(blankMerch);}} title={editMerch?"✏️ 商品を編集":"🛍️ 商品を追加"} color="#ec4899">
          <Label>商品名</Label>
          <LInput value={mForm.name} onChange={v=>setMForm(f=>({...f,name:v}))} placeholder="例：オリジナルTシャツ（黒）"/>
          <Label>通常価格（円）</Label>
          <LInput type="number" value={mForm.price} onChange={v=>setMForm(f=>({...f,price:v}))} placeholder="例：4500"/>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <span style={{fontSize:14,color:"#64748b",fontWeight:600}}>👑 メンバー価格あり</span>
            <button onClick={()=>setMForm(f=>({...f,hasMemberPrice:!f.hasMemberPrice,memberPrice:""}))}
              style={{width:48,height:26,borderRadius:13,background:mForm.hasMemberPrice?"#a855f7":"#e2e8f0",border:"none",cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:"white",position:"absolute",top:3,left:mForm.hasMemberPrice?25:3,transition:"left 0.2s"}}/>
            </button>
          </div>
          {mForm.hasMemberPrice&&(
            <>
              <Label>メンバー価格（円）</Label>
              <LInput type="number" value={mForm.memberPrice} onChange={v=>setMForm(f=>({...f,memberPrice:v}))} placeholder="例：4000"/>
              {mForm.price&&mForm.memberPrice&&(
                <div style={{background:"#fdf4ff",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#a855f7",fontWeight:700}}>
                  割引率：{Math.round((1-Number(mForm.memberPrice)/Number(mForm.price))*100)}% OFF
                </div>
              )}
            </>
          )}
          <Label>メモ（任意）</Label>
          <LInput value={mForm.note} onChange={v=>setMForm(f=>({...f,note:v}))} placeholder="例：カラー・サイズ展開など"/>
          <button onClick={saveMerch} style={{width:"100%",padding:16,borderRadius:12,border:"none",background:"linear-gradient(135deg,#ec4899,#f97316)",color:"white",fontWeight:700,fontSize:17,cursor:"pointer",...F}}>
            {editMerch?"更新する":"追加する"}
          </button>
        </Modal>
      )}

      {/* 物販：売上入力モーダル */}
      {showAddSale&&(
        <Modal onClose={()=>setShowAddSale(false)} title="💰 売上を入力" color="#ec4899">
          <Label>商品</Label>
          <div style={{marginBottom:14}}>
            {merch.length===0&&<div style={{fontSize:13,color:"#94a3b8",padding:"8px 0"}}>先に商品マスタから商品を登録してください</div>}
            {merch.map(item=>(
              <div key={item.id} onClick={()=>setSaleForm(f=>({...f,merchId:String(item.id)}))}
                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,marginBottom:6,background:saleForm.merchId===String(item.id)?"#fdf2f8":"#f8fafc",border:saleForm.merchId===String(item.id)?"2px solid #ec4899":"2px solid #e2e8f0",cursor:"pointer"}}>
                <div style={{width:18,height:18,borderRadius:"50%",background:saleForm.merchId===String(item.id)?"#ec4899":"white",border:"2px solid",borderColor:saleForm.merchId===String(item.id)?"#ec4899":"#e2e8f0"}}/>
                <div style={{flex:1}}>
                  <span style={{fontSize:14,fontWeight:700}}>{item.name}</span>
                  {item.memberPrice&&<span style={{fontSize:11,color:"#a855f7",marginLeft:6}}>/ メンバー ¥{item.memberPrice.toLocaleString()}</span>}
                </div>
                <span style={{fontSize:14,color:"#ec4899",fontWeight:700,fontFamily:"'DM Mono',monospace"}}>¥{item.price.toLocaleString()}</span>
              </div>
            ))}
          </div>

          {saleForm.merchId&&(()=>{
            const item = merch.find(m=>String(m.id)===saleForm.merchId);
            return item?.memberPrice ? (
              <>
                <Label>価格区分</Label>
                <div style={{display:"flex",gap:8,marginBottom:14}}>
                  {[["false","通常価格"],["true","👑 メンバー価格"]].map(([val,label])=>(
                    <button key={val} onClick={()=>setSaleForm(f=>({...f,isMember:val==="true"}))}
                      style={{flex:1,padding:"10px",borderRadius:10,border:String(saleForm.isMember)===val?"2px solid #a855f7":"2px solid #e2e8f0",background:String(saleForm.isMember)===val?"#fdf4ff":"white",color:String(saleForm.isMember)===val?"#a855f7":"#64748b",fontSize:13,cursor:"pointer",fontWeight:String(saleForm.isMember)===val?700:400,...F}}>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            ) : null;
          })()}

          <Label>枚数</Label>
          <div style={{display:"flex",alignItems:"center",gap:12,background:"#f8fafc",borderRadius:10,padding:"10px 14px",marginBottom:18}}>
            <button onClick={()=>setSaleForm(f=>({...f,qty:Math.max(1,f.qty-1)}))} style={cBtn}>－</button>
            <span style={{fontSize:28,fontWeight:700,minWidth:50,textAlign:"center",fontFamily:"'DM Mono',monospace",color:"#ec4899"}}>{saleForm.qty}</span>
            <button onClick={()=>setSaleForm(f=>({...f,qty:f.qty+1}))} style={cBtn}>＋</button>
            <span style={{fontSize:13,color:"#64748b"}}>枚</span>
            {saleForm.merchId&&(()=>{
              const item=merch.find(m=>String(m.id)===saleForm.merchId);
              const price=saleForm.isMember?(item?.memberPrice??item?.price??0):item?.price??0;
              return <span style={{marginLeft:"auto",fontSize:16,fontWeight:700,color:"#ec4899",fontFamily:"'DM Mono',monospace"}}>¥{(price*saleForm.qty).toLocaleString()}</span>;
            })()}
          </div>

          <Label>日付</Label><LInput type="date" value={saleForm.date} onChange={v=>setSaleForm(f=>({...f,date:v}))}/>
          <Label>メモ（任意）</Label><LInput value={saleForm.note} onChange={v=>setSaleForm(f=>({...f,note:v}))} placeholder="例：レッスン後に販売"/>
          <button onClick={saveSale} disabled={!saleForm.merchId}
            style={{width:"100%",padding:16,borderRadius:12,border:"none",background:saleForm.merchId?"linear-gradient(135deg,#ec4899,#f97316)":"#e2e8f0",color:saleForm.merchId?"white":"#94a3b8",fontWeight:700,fontSize:17,cursor:saleForm.merchId?"pointer":"not-allowed",...F}}>
            売上を記録する
          </button>
        </Modal>
      )}
    </div>
  );
}

function Modal({onClose,title,color,children}){
  return (
    <div style={{position:"fixed",inset:0,background:"#00000066",display:"flex",alignItems:"flex-end",zIndex:200}} onClick={onClose}>
      <div style={{background:"white",width:"100%",maxWidth:480,margin:"0 auto",borderRadius:"20px 20px 0 0",padding:24,paddingBottom:40,maxHeight:"88vh",overflowY:"auto",boxShadow:"0 -4px 24px #00000020"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:"#e2e8f0",borderRadius:2,margin:"0 auto 18px"}}/>
        <div style={{fontSize:20,fontWeight:700,marginBottom:20,color}}>{title}</div>
        {children}
      </div>
    </div>
  );
}
function Label({children}){ return <div style={{fontSize:18,color:"#64748b",marginBottom:10,fontWeight:700,...F}}>{children}</div>; }
function LInput({value,onChange,placeholder,type="text"}){
  return <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={{width:"100%",padding:"15px 16px",borderRadius:12,border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#1e293b",fontSize:18,marginBottom:18,boxSizing:"border-box",...F,outline:"none"}}/>;
}
function TimePicker({value, onChange, label, compact=false}) {
  const [h, setH] = useState(() => value ? parseInt(value.split(":")[0]) : 10);
  const [m, setM] = useState(() => value ? parseInt(value.split(":")[1]) : 0);
  const [enabled, setEnabled] = useState(!!value);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value !== prevValue.current) {
      prevValue.current = value;
      if (value) {
        setH(parseInt(value.split(":")[0]));
        setM(parseInt(value.split(":")[1]));
        setEnabled(true);
      } else {
        setEnabled(false);
      }
    }
  }, [value]);

  useEffect(() => {
    if (enabled) {
      onChange(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
    } else {
      onChange("");
    }
  }, [h, m, enabled]);

  const btnSize = compact ? 36 : 48;
  const fontSize = compact ? 22 : 32;
  const padding = compact ? "10px 12px" : "14px 16px";

  return (
    <div style={{marginBottom:compact?8:16}}>
      {!compact&&label&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <span style={{fontSize:14,color:"#64748b",fontWeight:600,...F}}>{label}</span>
          <button onClick={()=>setEnabled(e=>!e)}
            style={{width:52,height:28,borderRadius:14,background:enabled?"#3b82f6":"#e2e8f0",border:"none",cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
            <div style={{width:22,height:22,borderRadius:"50%",background:"white",position:"absolute",top:3,left:enabled?27:3,transition:"left 0.2s"}}/>
          </button>
        </div>
      )}
      {(enabled||compact) && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:compact?8:12,background:"#f8fafc",borderRadius:12,padding,border:"1.5px solid #e2e8f0"}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:compact?4:8}}>
            <button onClick={()=>setH(v=>Math.min(22,v+1))} style={{...tBtn,width:btnSize,height:btnSize,fontSize:compact?14:18}}>▲</button>
            <span style={{fontSize,fontWeight:700,minWidth:compact?36:56,textAlign:"center",fontFamily:"'DM Mono',monospace",color:"#1e293b"}}>{String(h).padStart(2,"0")}</span>
            <button onClick={()=>setH(v=>Math.max(8,v-1))} style={{...tBtn,width:btnSize,height:btnSize,fontSize:compact?14:18}}>▼</button>
          </div>
          <span style={{fontSize:compact?20:28,fontWeight:700,color:"#94a3b8"}}>:</span>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:compact?4:8}}>
            <button onClick={()=>setM(v=>v>=55?0:v+5)} style={{...tBtn,width:btnSize,height:btnSize,fontSize:compact?14:18}}>▲</button>
            <span style={{fontSize,fontWeight:700,minWidth:compact?36:56,textAlign:"center",fontFamily:"'DM Mono',monospace",color:"#1e293b"}}>{String(m).padStart(2,"0")}</span>
            <button onClick={()=>setM(v=>v<=0?55:v-5)} style={{...tBtn,width:btnSize,height:btnSize,fontSize:compact?14:18}}>▼</button>
          </div>
          <div style={{marginLeft:4,fontSize:compact?14:16,fontWeight:700,color:"#3b82f6",fontFamily:"'DM Mono',monospace",minWidth:compact?40:50}}>
            {String(h).padStart(2,"0")}:{String(m).padStart(2,"0")}
          </div>
        </div>
      )}
    </div>
  );
}
const tBtn = {width:48,height:48,borderRadius:12,border:"1.5px solid #e2e8f0",background:"white",color:"#3b82f6",fontSize:22,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700};
