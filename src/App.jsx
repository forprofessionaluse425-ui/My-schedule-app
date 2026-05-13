  import { useState, useEffect, useRef } from "react";

const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const DAY_COL = ['M','T','W','T','F','S','S'];
const DAY_ORDER = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const TODAY = new Date();
const TODAY_KEY = TODAY.toISOString().split('T')[0];
const TODAY_DAY = DAYS[TODAY.getDay()];
const TODAY_DOW = TODAY.getDay(); // 0=sun

const SECTIONS = [
  { id:'morning',   label:'Morning',   color:'#AED6F1', textColor:'#1A5276', range:[4,12]  },
  { id:'afternoon', label:'Afternoon', color:'#F1948A', textColor:'#7B241C', range:[12,17] },
  { id:'evening',   label:'Evening',   color:'#F8C8D4', textColor:'#7B241C', range:[17,24] },
  { id:'anytime',   label:'Tasks',     color:'#D5F5E3', textColor:'#1E8449', range:[-1,-1] },
];

const fmt = t => { if(!t) return ''; const [h,m]=t.split(':').map(Number); return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`; };

const getSectionFor = start => {
  if(!start) return 'anytime';
  const h = parseInt(start);
  if(h>=4&&h<12) return 'morning';
  if(h>=12&&h<17) return 'afternoon';
  return 'evening';
};

const getWeekDays = () => {
  const dow = TODAY.getDay();
  const mon = new Date(TODAY); mon.setDate(TODAY.getDate()-(dow===0?6:dow-1));
  return Array.from({length:7},(_,i)=>{
    const d=new Date(mon); d.setDate(mon.getDate()+i);
    return { key:d.toISOString().split('T')[0], day:DAYS[d.getDay()], isToday:d.toISOString().split('T')[0]===TODAY_KEY };
  });
};
const WEEKDAYS = getWeekDays();

// ── TASK EMOJI
const getEmoji = (name='',cat='') => {
  const t=`${name} ${cat}`.toLowerCase();
  if(/bus|trip|travel|tour|excursion|picnic/.test(t)) return '🚌';
  if(/school|study|class|college|education|exam/.test(t)) return '🎒';
  if(/tuition|coaching|tutoring/.test(t)) return '✏️';
  if(/prayer|namaz|salah|mosque|roza|dua|quran/.test(t)) return '🕌';
  if(/sleep|bed|rest|nap/.test(t)) return '🌙';
  if(/breakfast|morning.*eat/.test(t)) return '🍳';
  if(/lunch|dinner|meal|eat|food|tiffin/.test(t)) return '🍽️';
  if(/gym|exercise|workout|run|fitness|yoga/.test(t)) return '💪';
  if(/cricket|football|sport/.test(t)) return '🏏';
  if(/friend|party|birthday|hang|gather|celebrat|outing/.test(t)) return '🎉';
  if(/home|house|family/.test(t)) return '🏠';
  if(/read|book|novel|library/.test(t)) return '📖';
  if(/work|office|meeting|job/.test(t)) return '💼';
  if(/shop|market|buy|store/.test(t)) return '🛍️';
  if(/doctor|hospital|clinic|medicine|health/.test(t)) return '🏥';
  if(/coffee|tea|break|relax|chill/.test(t)) return '☕';
  if(/wake|wakeup|alarm/.test(t)) return '⏰';
  if(/bath|shower|hygiene|skincare/.test(t)) return '🚿';
  if(/walk|stroll/.test(t)) return '🚶';
  if(/phone|call/.test(t)) return '📱';
  return '📌';
};

export default function App() {
  const [view, setView] = useState('today');
  const [schedule, setSchedule] = useState({});
  const [special, setSpecial] = useState({});
  const [comps, setComps] = useState({});
  const [msgs, setMsgs] = useState([{r:'ai', t:"Assalam o Alaikum! 👋\n\nTell me your daily routine and I'll build your planner automatically.\n\nExample:\n\"I go to school every day from 8am to 1:45pm. Tuition from 3pm to 5pm every day. I sleep at 10pm.\"\n\nI'll sort everything into Morning, Afternoon & Evening for you! ✨"}]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [notifOn, setNotifOn] = useState(false);
  const chatRef = useRef(null);
  const taRef = useRef(null);

  useEffect(()=>{
    (async()=>{
      try {
        const s=await window.storage.get('dp_sched');
        const e=await window.storage.get('dp_events');
        const c=await window.storage.get('dp_comps');
        if(s) setSchedule(JSON.parse(s.value));
        if(e) setSpecial(JSON.parse(e.value));
        if(c) setComps(JSON.parse(c.value));
      }catch(_){}
      setNotifOn('Notification' in window && Notification.permission==='granted');
    })();
  },[]);

  useEffect(()=>{ if(chatRef.current) chatRef.current.scrollTop=chatRef.current.scrollHeight; },[msgs,loading]);

  const saveAll = async(s,e,c)=>{
    try{
      await window.storage.set('dp_sched',JSON.stringify(s??schedule));
      await window.storage.set('dp_events',JSON.stringify(e??special));
      await window.storage.set('dp_comps',JSON.stringify(c??comps));
    }catch(_){}
  };

  const todayTasks = [
    ...(schedule[TODAY_DAY]||[]),
    ...(special[TODAY_KEY]||[]).map(e=>({...e,isSpecial:true}))
  ].sort((a,b)=>(a.start||'zz').localeCompare(b.start||'zz'));

  const todayComps = comps[TODAY_KEY]||{};
  const todayDone = todayTasks.filter(t=>todayComps[t.name]===true).length;

  const mark = async(name,val)=>{
    const nc={...comps,[TODAY_KEY]:{...(comps[TODAY_KEY]||{}),[name]:val}};
    setComps(nc); await saveAll(null,null,nc);
  };

  // Week grid: all unique tasks across all days
  const allWeekTasks = [];
  const seen = new Set();
  DAY_ORDER.forEach(day=>{
    (schedule[day]||[]).forEach(t=>{
      if(!seen.has(t.name)){ seen.add(t.name); allWeekTasks.push(t); }
    });
  });
  // also add today's special events
  (special[TODAY_KEY]||[]).forEach(t=>{ if(!seen.has(t.name)){ seen.add(t.name); allWeekTasks.push({...t,isSpecial:true}); }});

  const weekScore = (()=>{
    let total=0,done=0;
    WEEKDAYS.forEach(({key,day})=>{
      (schedule[day]||[]).forEach(t=>{ total++; if(comps[key]?.[t.name]===true) done++; });
    });
    return total?Math.round((done/total)*100):0;
  })();

  const send = async()=>{
    if(!input.trim()||loading) return;
    const u=input.trim(); setInput('');
    if(taRef.current){ taRef.current.style.height='auto'; }
    setMsgs(p=>[...p,{r:'u',t:u}]); setLoading(true);
    const tomorrow=new Date(TODAY.getTime()+86400000).toISOString().split('T')[0];
    const nextSun=(()=>{ const d=new Date(TODAY); while(DAYS[d.getDay()]!=='sunday') d.setDate(d.getDate()+1); return d.toISOString().split('T')[0]; })();
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",max_tokens:1200,
          system:`You are a smart daily planner AI. Parse natural language and return ONLY valid JSON, no markdown.
Current schedule: ${JSON.stringify(schedule)}
Today: ${TODAY_KEY} (${TODAY_DAY}). Tomorrow: ${tomorrow}. Next Sunday: ${nextSun}.
STRICT RULES:
- "every day"/"everyday" for school/tuition/work = monday-saturday ONLY (never sunday)
- "every day" for personal habits/prayers = all 7 days including sunday
- Times must be 24-hour HH:MM format
- Merge tasks by name (update existing, add new)
- Always pick the best emoji for each task
Return ONLY:
{"message":"friendly 1-line confirmation","schedule":{"monday":[{"name":"School","start":"08:00","end":"13:45","category":"education","emoji":"🎒"}],...},"specialEvent":{"date":"YYYY-MM-DD","event":{"name":"Trip","start":"06:30","end":null,"category":"other","emoji":"🚌"}}}
Only include days/fields that are changing. Omit specialEvent if not needed.`,
          messages:[{role:"user",content:u}]
        })
      });
      const d=await res.json();
      const txt=d.content?.map(i=>i.text||'').join('')||'';
      let p; try{p=JSON.parse(txt.replace(/```json|```/g,'').trim());}catch{p={message:"Try: 'School every day 8am to 1:45pm'"};} 
      let ns={...schedule},ne={...special};
      if(p.schedule){
        Object.entries(p.schedule).forEach(([day,tasks])=>{
          if(!Array.isArray(tasks)||!tasks.length) return;
          const ex=[...(ns[day]||[])];
          tasks.forEach(nt=>{ const i=ex.findIndex(t=>t.name.toLowerCase()===nt.name.toLowerCase()); i>=0?(ex[i]=nt):ex.push(nt); });
          ns[day]=ex.sort((a,b)=>(a.start||'zz').localeCompare(b.start||'zz'));
        });
        setSchedule(ns);
      }
      if(p.specialEvent?.date&&p.specialEvent?.event){
        const{date,event}=p.specialEvent;
        const ex=[...(ne[date]||[])];
        const i=ex.findIndex(e=>e.name.toLowerCase()===event.name.toLowerCase());
        i>=0?(ex[i]=event):ex.push(event); ne[date]=ex; setSpecial(ne);
      }
      await saveAll(ns,ne,null);
      setMsgs(prev=>[...prev,{r:'ai',t:p.message||"Done! ✅"}]);
    }catch{ setMsgs(prev=>[...prev,{r:'ai',t:"Something went wrong, try again."}]); }
    setLoading(false);
  };

  const voice=()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){alert("Voice not supported. Use Chrome.");return;}
    const r=new SR(); r.onstart=()=>setListening(true); r.onend=()=>setListening(false);
    r.onresult=e=>setInput(e.results[0][0].transcript); r.start();
  };

  const enableNotifs=async()=>{
    if(!('Notification' in window)){alert('Notifications not supported.');return;}
    const perm=await Notification.requestPermission();
    if(perm==='granted'){
      setNotifOn(true);
      const now=new Date();
      for(const task of todayTasks){
        if(!task.start) continue;
        const [h,m]=task.start.split(':').map(Number);
        const t=new Date(now); t.setHours(h,m-10,0,0);
        const delay=t-now;
        if(delay<=0||delay>86400000) continue;
        fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:60,
            system:"Write ONE short punchy push notification (max 65 chars) for a task reminder. Make it personal and fun, specific to the task. Return ONLY the message text, nothing else.",
            messages:[{role:"user",content:`Task: "${task.name}" at ${fmt(task.start)}`}]})
        }).then(r=>r.json()).then(d=>{
          const msg=d.content?.[0]?.text||`Time for ${task.name}!`;
          setTimeout(()=>{try{new Notification(`${getEmoji(task.name,task.category)} ${task.name}`,{body:msg});}catch(_){}},delay);
        }).catch(()=>{ setTimeout(()=>{try{new Notification(`${getEmoji(task.name)} ${task.name}`,{body:`Time for ${task.name}!`});}catch(_){}},delay); });
      }
    }
  };

  // 
  //  TODAY VIEW  (Image 2 style — time + todo checklist)
  // 
  const TodayView = ()=>{
    const sections = SECTIONS.map(sec=>{
      const tasks = sec.id==='anytime'
        ? todayTasks.filter(t=>!t.start)
        : todayTasks.filter(t=>{ const h=parseInt(t.start||'-1'); return h>=sec.range[0]&&h<sec.range[1]; });
      return {...sec, tasks};
    }).filter(s=>s.tasks.length);

    return (
      <div style={{background:'#FFFDF7',minHeight:'100dvh',paddingBottom:90}}>
        {/* Header */}
        <div style={{background:'#FFF8E7',padding:'52px 20px 18px',borderBottom:'2px solid #E8D8A0'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
            <span style={{fontSize:32}}>☀️</span>
            <div>
              <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:26,color:'#2C2C2C',letterSpacing:-0.5}}>Daily Routine</div>
              <div style={{fontFamily:"'Nunito',sans-serif",fontSize:13,color:'#999',fontWeight:600}}>
                {TODAY.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
              </div>
            </div>
            <div style={{marginLeft:'auto',textAlign:'right'}}>
              <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:30,color:'#2C2C2C',lineHeight:1}}>{todayDone}/{todayTasks.length}</div>
              <div style={{fontFamily:"'Nunito',sans-serif",fontSize:11,color:'#BBB',fontWeight:700}}>DONE</div>
            </div>
          </div>
          {/* Progress bar */}
          {todayTasks.length>0&&(
            <div style={{marginTop:12,height:7,background:'#EEE5C0',borderRadius:10}}>
              <div style={{height:'100%',background:'linear-gradient(90deg,#F4A261,#E76F51)',borderRadius:10,width:`${(todayDone/todayTasks.length)*100}%`,transition:'width 0.5s ease'}}/>
            </div>
          )}
        </div>

        {todayTasks.length===0?(
          <div style={{textAlign:'center',padding:'80px 24px'}}>
            <div style={{fontSize:56,marginBottom:16}}>📋</div>
            <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:20,color:'#2C2C2C',marginBottom:8}}>Your planner is empty!</div>
            <div style={{fontFamily:"'Nunito',sans-serif",fontSize:14,color:'#AAA',marginBottom:28,lineHeight:1.7}}>Go to Chat and tell me your daily routine in plain words</div>
            <button onClick={()=>setView('chat')} style={{padding:'13px 32px',background:'#E76F51',color:'#fff',border:'none',borderRadius:14,cursor:'pointer',fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:15}}>Open Chat →</button>
          </div>
        ):(
          <div style={{padding:'16px 16px 0'}}>
            {/* Column header */}
            <div style={{display:'grid',gridTemplateColumns:'36px 82px 1fr',gap:0,marginBottom:8,padding:'0 6px'}}>
              <div/>
              <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:12,color:'#888',textAlign:'center',background:'#F0E6C0',borderRadius:8,padding:'5px 0',marginRight:6}}>TIME</div>
              <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:12,color:'#888',textAlign:'center',background:'#F0E6C0',borderRadius:8,padding:'5px 0'}}>TO-DO</div>
            </div>

            {sections.map(sec=>(
              <div key={sec.id} style={{marginBottom:18}}>
                {/* Section header */}
                <div style={{background:sec.color,borderRadius:10,padding:'7px 14px',marginBottom:8,textAlign:'center'}}>
                  <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:14,color:sec.textColor,letterSpacing:1}}>{sec.label.toUpperCase()}</span>
                </div>
                {/* Tasks */}
                {sec.tasks.map((task,i)=>{
                  const done=todayComps[task.name]===true;
                  const emoji=task.emoji||getEmoji(task.name,task.category||'');
                  return (
                    <div key={i} style={{display:'grid',gridTemplateColumns:'36px 82px 1fr',gap:0,marginBottom:7,alignItems:'center'}}>
                      {/* Checkbox */}
                      <div onClick={()=>mark(task.name,done?undefined:true)} style={{
                        width:28,height:28,borderRadius:7,border:`2.5px solid ${done?'#E76F51':'#DDCFA0'}`,
                        background:done?'#E76F51':'#FFF8E7',cursor:'pointer',
                        display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s',margin:'0 auto'
                      }}>
                        {done&&<span style={{color:'#fff',fontSize:16,fontWeight:900,lineHeight:1}}>✓</span>}
                      </div>
                      {/* Time */}
                      <div style={{
                        background:'#FFF8E7',border:'1.5px solid #E8D8A0',borderRadius:9,padding:'8px 6px',
                        marginRight:7,textAlign:'center',
                        fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:12,color:done?'#CCC':'#555',
                        textDecoration:done?'line-through':'none'
                      }}>{task.start?fmt(task.start):'Any'}</div>
                      {/* Task name */}
                      <div style={{
                        background:done?'#F5F5F5':'#fff',border:`1.5px solid ${done?'#EEE':'#E8D8A0'}`,
                        borderRadius:9,padding:'8px 12px',
                        display:'flex',alignItems:'center',gap:8,transition:'all 0.2s'
                      }}>
                        <span style={{fontSize:18,flexShrink:0}}>{emoji}</span>
                        <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:700,fontSize:13,color:done?'#BBBBBB':'#2C2C2C',textDecoration:done?'line-through':'none',flex:1}}>
                          {task.name}
                          {task.isSpecial&&<span style={{marginLeft:6,fontSize:10,color:'#E76F51',fontWeight:800}}>★</span>}
                        </span>
                        {/* Skip X */}
                        <div onClick={()=>mark(task.name,todayComps[task.name]===false?undefined:false)} style={{cursor:'pointer',opacity:0.4,fontSize:14,lineHeight:1,color:todayComps[task.name]===false?'#E76F51':'#AAA'}}>✕</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };
  //  WEEKLY VIEW  (Image 1 style — table with M T W T F S S
  const WeeklyView = ()=>{
    const sections = SECTIONS.map(sec=>{
      const tasks = allWeekTasks.filter(t=>{
        if(sec.id==='anytime') return !t.start;
        const h=parseInt(t.start||'-1');
        return h>=sec.range[0]&&h<sec.range[1];
      });
      return {...sec,tasks};
    }).filter(s=>s.tasks.length);

    // today column index (0=mon … 6=sun)
    const todayCol = WEEKDAYS.findIndex(w=>w.isToday);

    return (
      <div style={{background:'#FFFDF7',minHeight:'100dvh',paddingBottom:90}}>
        {/* Header */}
        <div style={{background:'#FFF8E7',padding:'52px 20px 18px',borderBottom:'2px solid #E8D8A0'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:28}}>✨</span>
            <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:24,color:'#2C2C2C',fontStyle:'italic'}}>Daily Routine</div>
          </div>
          <div style={{marginTop:10,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontFamily:"'Nunito',sans-serif",fontSize:13,color:'#AAA',fontWeight:600}}>Weekly Progress</div>
            <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:20,color:'#E76F51'}}>{weekScore}% done</div>
          </div>
        </div>

        {allWeekTasks.length===0?(
          <div style={{textAlign:'center',padding:'80px 24px'}}>
            <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:18,color:'#AAA'}}>No schedule yet — chat to add your routine!</div>
            <button onClick={()=>setView('chat')} style={{marginTop:20,padding:'12px 28px',background:'#E76F51',color:'#fff',border:'none',borderRadius:12,cursor:'pointer',fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:14}}>Open Chat →</button>
          </div>
        ):(
          <div style={{overflowX:'auto',padding:'16px 12px 0'}}>
            <table style={{width:'100%',borderCollapse:'collapse',tableLayout:'fixed',minWidth:340}}>
              {sections.map(sec=>(
                <>
                  {/* Section header row */}
                  <thead key={`head-${sec.id}`}>
                    <tr>
                      <th style={{background:sec.color,padding:'9px 10px',textAlign:'left',borderRadius:'10px 0 0 0',width:'45%'}}>
                        <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:13,color:sec.textColor}}>{sec.label}</span>
                      </th>
                      {DAY_COL.map((d,i)=>(
                        <th key={i} style={{
                          background:sec.color,padding:'9px 0',textAlign:'center',
                          borderRadius:i===6?'0 10px 0 0':0,
                          fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:12,
                          color:WEEKDAYS[i]?.isToday?'#E76F51':sec.textColor,
                          borderBottom:`2px solid ${sec.textColor}22`
                        }}>{d}</th>
 
