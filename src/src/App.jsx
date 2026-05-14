import { useState, useEffect, useRef } from "react";

const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const DAY_COL = ["M","T","W","T","F","S","S"];
const DAY_ORDER = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
const TODAY = new Date();
const TODAY_KEY = TODAY.toISOString().split("T")[0];
const TODAY_DAY = DAYS[TODAY.getDay()];

const SECTIONS = [
  { id:"morning",   label:"Morning",   color:"#AED6F1", text:"#1A5276", from:4,  to:12 },
  { id:"afternoon", label:"Afternoon", color:"#F1948A", text:"#7B241C", from:12, to:17 },
  { id:"evening",   label:"Evening",   color:"#F8C8D4", text:"#922B21", from:17, to:24 },
  { id:"anytime",   label:"Tasks",     color:"#D5F5E3", text:"#1E8449", from:-1, to:-1 },
];

const API_URL = "https://api.anthropic.com/v1/messages";

function getHeaders() {
  const key = import.meta.env.VITE_ANTHROPIC_KEY;
  return {
    "Content-Type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true"
  };
}

function fmt(t) {
  if (!t) return "";
  const parts = t.split(":");
  const h = parseInt(parts[0]);
  const m = parts[1];
  return (h % 12 || 12) + ":" + m + " " + (h >= 12 ? "PM" : "AM");
}

function getEmoji(name, cat) {
  const t = ((name || "") + " " + (cat || "")).toLowerCase();
  if (/bus|trip|travel|tour|excursion|picnic/.test(t)) return "🚌";
  if (/school|study|class|college|education|exam/.test(t)) return "🎒";
  if (/tuition|coaching|tutoring/.test(t)) return "✏️";
  if (/prayer|namaz|salah|mosque|roza|dua|quran/.test(t)) return "🕌";
  if (/sleep|bed|rest|nap/.test(t)) return "🌙";
  if (/breakfast/.test(t)) return "🍳";
  if (/lunch|dinner|meal|eat|food|tiffin/.test(t)) return "🍽️";
  if (/gym|exercise|workout|run|fitness|yoga/.test(t)) return "💪";
  if (/cricket|football|sport/.test(t)) return "🏏";
  if (/friend|party|birthday|hang|gather|celebrat|outing/.test(t)) return "🎉";
  if (/home|house|family/.test(t)) return "🏠";
  if (/read|book|novel|library/.test(t)) return "📖";
  if (/work|office|meeting|job/.test(t)) return "💼";
  if (/shop|market|buy|store/.test(t)) return "🛍️";
  if (/doctor|hospital|clinic|medicine|health/.test(t)) return "🏥";
  if (/coffee|tea|break|relax|chill/.test(t)) return "☕";
  if (/wake|wakeup|alarm/.test(t)) return "⏰";
  if (/bath|shower|hygiene|skincare/.test(t)) return "🚿";
  if (/walk|stroll/.test(t)) return "🚶";
  if (/park|garden|nature/.test(t)) return "🌳";
  if (/phone|call/.test(t)) return "📱";
  return "📌";
}

function getWeekDays() {
  const dow = TODAY.getDay();
  const mon = new Date(TODAY);
  mon.setDate(TODAY.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, function(_, i) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    const key = d.toISOString().split("T")[0];
    return { key: key, day: DAYS[d.getDay()], isToday: key === TODAY_KEY };
  });
}

const WEEKDAYS = getWeekDays();

export default function App() {
  const [view, setView] = useState("today");
  const [schedule, setSchedule] = useState({});
  const [special, setSpecial] = useState({});
  const [comps, setComps] = useState({});
  const [msgs, setMsgs] = useState([{
    r: "ai",
    t: "Assalam o Alaikum! Tell me your daily routine and I will build your planner automatically.\n\nExample:\n\"I go to school every day from 8am to 1:45pm. Tuition from 3pm to 5pm every day.\"\n\nI will sort everything into Morning, Afternoon and Evening for you!"
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [notifOn, setNotifOn] = useState(false);
  const chatRef = useRef(null);

  useEffect(function() {
    (async function() {
      try {
        const s = await window.storage.get("dp_sched");
        const e = await window.storage.get("dp_events");
        const c = await window.storage.get("dp_comps");
        if (s) setSchedule(JSON.parse(s.value));
        if (e) setSpecial(JSON.parse(e.value));
        if (c) setComps(JSON.parse(c.value));
      } catch(err) {}
      setNotifOn("Notification" in window && Notification.permission === "granted");
    })();
  }, []);

  useEffect(function() {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [msgs, loading]);

  async function saveAll(s, e, c) {
    try {
      await window.storage.set("dp_sched", JSON.stringify(s !== null && s !== undefined ? s : schedule));
      await window.storage.set("dp_events", JSON.stringify(e !== null && e !== undefined ? e : special));
      await window.storage.set("dp_comps", JSON.stringify(c !== null && c !== undefined ? c : comps));
    } catch(err) {}
  }

  const todayTasks = [
    ...(schedule[TODAY_DAY] || []),
    ...(special[TODAY_KEY] || []).map(function(e) { return Object.assign({}, e, { isSpecial: true }); })
  ].sort(function(a, b) {
    return (a.start || "zz").localeCompare(b.start || "zz");
  });

  const todayComps = comps[TODAY_KEY] || {};
  const todayDone = todayTasks.filter(function(t) { return todayComps[t.name] === true; }).length;

  async function mark(name, val) {
    const prev = comps[TODAY_KEY] || {};
    const next = Object.assign({}, prev, { [name]: val });
    const nc = Object.assign({}, comps, { [TODAY_KEY]: next });
    setComps(nc);
    await saveAll(null, null, nc);
  }

  const allWeekTasks = [];
  const seen = new Set();
  DAY_ORDER.forEach(function(day) {
    (schedule[day] || []).forEach(function(t) {
      if (!seen.has(t.name)) { seen.add(t.name); allWeekTasks.push(t); }
    });
  });
  (special[TODAY_KEY] || []).forEach(function(t) {
    if (!seen.has(t.name)) { seen.add(t.name); allWeekTasks.push(Object.assign({}, t, { isSpecial: true })); }
  });

  const weekScore = (function() {
    let total = 0, done = 0;
    WEEKDAYS.forEach(function(wd) {
      (schedule[wd.day] || []).forEach(function(t) {
        total++;
        if (comps[wd.key] && comps[wd.key][t.name] === true) done++;
      });
    });
    return total ? Math.round((done / total) * 100) : 0;
  })();

  async function send() {
    if (!input.trim() || loading) return;
    const u = input.trim();
    setInput("");
    setMsgs(function(p) { return [...p, { r: "u", t: u }]; });
    setLoading(true);

    const tomorrow = new Date(TODAY.getTime() + 86400000).toISOString().split("T")[0];
    const nextSun = (function() {
      const d = new Date(TODAY);
      while (DAYS[d.getDay()] !== "sunday") d.setDate(d.getDate() + 1);
      return d.toISOString().split("T")[0];
    })();

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1200,
          system: "You are a smart daily planner AI. Parse natural language and return ONLY valid JSON with no markdown.\nCurrent schedule: " + JSON.stringify(schedule) + "\nToday: " + TODAY_KEY + " (" + TODAY_DAY + "). Tomorrow: " + tomorrow + ". Next Sunday: " + nextSun + ".\nRULES:\n- every day for school/tuition/work = monday-saturday ONLY never sunday\n- every day for habits/prayers = all 7 days\n- Times must be 24-hour HH:MM format\n- Merge tasks by name\n- Always pick best emoji\nReturn ONLY this JSON:\n{\"message\":\"short confirmation\",\"schedule\":{\"monday\":[{\"name\":\"School\",\"start\":\"08:00\",\"end\":\"13:45\",\"category\":\"education\",\"emoji\":\"packed\"}]},\"specialEvent\":{\"date\":\"YYYY-MM-DD\",\"event\":{\"name\":\"Trip\",\"start\":\"06:30\",\"end\":null,\"category\":\"other\",\"emoji\":\"bus\"}}}\nOnly include days or fields that are changing. Omit specialEvent if not needed.",
          messages: [{ role: "user", content: u }]
        })
      });
      const d = await res.json();
      const txt = (d.content || []).map(function(i) { return i.text || ""; }).join("");
      let p;
      try {
        p = JSON.parse(txt.replace(/```json|```/g, "").trim());
      } catch(err) {
        p = { message: "Try: School every day 8am to 1:45pm" };
      }

      let ns = Object.assign({}, schedule);
      let ne = Object.assign({}, special);

      if (p.schedule) {
        Object.keys(p.schedule).forEach(function(day) {
          const tasks = p.schedule[day];
          if (!Array.isArray(tasks) || !tasks.length) return;
          const ex = [...(ns[day] || [])];
          tasks.forEach(function(nt) {
            const i = ex.findIndex(function(t) { return t.name.toLowerCase() === nt.name.toLowerCase(); });
            if (i >= 0) ex[i] = nt; else ex.push(nt);
          });
          ns[day] = ex.sort(function(a, b) { return (a.start || "zz").localeCompare(b.start || "zz"); });
        });
        setSchedule(ns);
      }

      if (p.specialEvent && p.specialEvent.date && p.specialEvent.event) {
        const date = p.specialEvent.date;
        const event = p.specialEvent.event;
        const ex = [...(ne[date] || [])];
        const i = ex.findIndex(function(e) { return e.name.toLowerCase() === event.name.toLowerCase(); });
        if (i >= 0) ex[i] = event; else ex.push(event);
        ne[date] = ex;
        setSpecial(ne);
      }

      await saveAll(ns, ne, null);
      setMsgs(function(prev) { return [...prev, { r: "ai", t: p.message || "Done!" }]; });
    } catch(err) {
      setMsgs(function(prev) { return [...prev, { r: "ai", t: "Something went wrong. Please try again." }]; });
    }
    setLoading(false);
  }

  function voice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice not supported. Use Chrome."); return; }
    const r = new SR();
    r.onstart = function() { setListening(true); };
    r.onend = function() { setListening(false); };
    r.onresult = function(e) { setInput(e.results[0][0].transcript); };
    r.start();
  }

  async function enableNotifs() {
    if (!("Notification" in window)) { alert("Not supported."); return; }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setNotifOn(true);
      const now = new Date();
      todayTasks.forEach(async function(task) {
        if (!task.start) return;
        const parts = task.start.split(":");
        const h = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        const t = new Date(now);
        t.setHours(h, m - 10, 0, 0);
        const delay = t - now;
        if (delay <= 0 || delay > 86400000) return;
        try {
          const res = await fetch(API_URL, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              max_tokens: 60,
              system: "Write ONE short fun push notification reminder (max 65 chars) for a task. Make it personal and specific. Return ONLY the message text.",
              messages: [{ role: "user", content: "Task: " + task.name + " at " + fmt(task.start) }]
            })
          });
          const data = await res.json();
          const msg = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text : ("Time for " + task.name + "!");
          setTimeout(function() {
            try { new Notification(getEmoji(task.name, task.category) + " " + task.name, { body: msg }); } catch(e) {}
          }, delay);
        } catch(e) {
          setTimeout(function() {
            try { new Notification(getEmoji(task.name) + " " + task.name, { body: "Time for " + task.name + "!" }); } catch(err) {}
          }, delay);
        }
      });
    }
  }

  function TodayView() {
    const sections = SECTIONS.map(function(sec) {
      const tasks = sec.id === "anytime"
        ? todayTasks.filter(function(t) { return !t.start; })
        : todayTasks.filter(function(t) {
            const h = parseInt(t.start || "-1");
            return h >= sec.from && h < sec.to;
          });
      return Object.assign({}, sec, { tasks: tasks });
    }).filter(function(s) { return s.tasks.length > 0; });

    return (
      <div style={{ background:"#FFFDF7", minHeight:"100dvh", paddingBottom:90 }}>
        <div style={{ background:"#FFF8E7", padding:"52px 20px 18px", borderBottom:"2px solid #E8D8A0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
            <span style={{ fontSize:32 }}>☀️</span>
            <div>
              <div style={{ fontFamily:"Nunito,sans-serif", fontWeight:900, fontSize:26, color:"#2C2C2C" }}>Daily Routine</div>
              <div style={{ fontFamily:"Nunito,sans-serif", fontSize:13, color:"#999", fontWeight:600 }}>
                {TODAY.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}
              </div>
            </div>
            <div style={{ marginLeft:"auto", textAlign:"right" }}>
              <div style={{ fontFamily:"Nunito,sans-serif", fontWeight:900, fontSize:30, color:"#2C2C2C", lineHeight:1 }}>{todayDone}/{todayTasks.length}</div>
              <div style={{ fontFamily:"Nunito,sans-serif", fontSize:11, color:"#BBB", fontWeight:700 }}>DONE</div>
            </div>
          </div>
          {todayTasks.length > 0 && (
            <div style={{ marginTop:12, height:7, background:"#EEE5C0", borderRadius:10 }}>
              <div style={{ height:"100%", background:"linear-gradient(90deg,#F4A261,#E76F51)", borderRadius:10, width:(todayDone/todayTasks.length*100)+"%", transition:"width 0.5s ease" }} />
            </div>
          )}
        </div>

        {todayTasks.length === 0 ? (
          <div style={{ textAlign:"center", padding:"80px 24px" }}>
            <div style={{ fontSize:56, marginBottom:16 }}>📋</div>
            <div style={{ fontFamily:"Nunito,sans-serif", fontWeight:800, fontSize:20, color:"#2C2C2C", marginBottom:8 }}>Your planner is empty!</div>
            <div style={{ fontFamily:"Nunito,sans-serif", fontSize:14, color:"#AAA", marginBottom:28, lineHeight:1.7 }}>Go to Chat and tell me your daily routine in plain words</div>
            <button onClick={function() { setView("chat"); }} style={{ padding:"13px 32px", background:"#E76F51", color:"#fff", border:"none", borderRadius:14, cursor:"pointer", fontFamily:"Nunito,sans-serif", fontWeight:800, fontSize:15 }}>Open Chat</button>
          </div>
        ) : (
          <div style={{ padding:"16px 16px 0" }}>
            <div style={{ display:"grid", gridTemplateColumns:"36px 82px 1fr", gap:0, marginBottom:8, padding:"0 4px" }}>
              <div />
              <div style={{ fontFamily:"Nunito,sans-serif", fontWeight:800, fontSize:12, color:"#888", textAlign:"center", background:"#F0E6C0", borderRadius:8, padding:"5px 0", marginRight:6 }}>TIME</div>
              <div style={{ fontFamily:"Nunito,sans-serif", fontWeight:800, fontSize:12, color:"#888", textAlign:"center", background:"#F0E6C0", borderRadius:8, padding:"5px 0" }}>TO-DO</div>
            </div>
            {sections.map(function(sec) {
              return (
                <div key={sec.id} style={{ marginBottom:18 }}>
                  <div style={{ background:sec.color, borderRadius:10, padding:"7px 14px", marginBottom:8, textAlign:"center" }}>
                    <span style={{ fontFamily:"Nunito,sans-serif", fontWeight:900, fontSize:14, color:sec.text, letterSpacing:1 }}>{sec.label.toUpperCase()}</span>
                  </div>
                  {sec.tasks.map(function(task, i) {
                    const done = todayComps[task.name] === true;
                    const skipped = todayComps[task.name] === false;
                    const emoji = task.emoji || getEmoji(task.name, task.category || "");
                    return (
                      <div key={i} style={{ display:"grid", gridTemplateColumns:"36px 82px 1fr", gap:0, marginBottom:7, alignItems:"center" }}>
                        <div onClick={function() { mark(task.name, done ? undefined : true); }} style={{ width:28, height:28, borderRadius:7, border:"2.5px solid " + (done ? "#E76F51" : "#DDCFA0"), background:done ? "#E76F51" : "#FFF8E7", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.2s", margin:"0 auto" }}>
                          {done && <span style={{ color:"#fff", fontSize:16, fontWeight:900 }}>✓</span>}
                        </div>
                        <div style={{ background:"#FFF8E7", border:"1.5px solid #E8D8A0", borderRadius:9, padding:"8px 4px", marginRight:7, textAlign:"center", fontFamily:"Nunito,sans-serif", fontWeight:800, fontSize:11, color:done ? "#CCC" : "#555", textDecoration:done ? "line-through" : "none" }}>
                          {task.start ? fmt(task.start) : "Any"}
                        </div>
                        <div style={{ background:done ? "#F5F5F5" : "#fff", border:"1.5px solid " + (done ? "#EEE" : "#E8D8A0"), borderRadius:9, padding:"8px 10px", display:"flex", alignItems:"center", gap:7, transition:"all 0.2s" }}>
                          <span style={{ fontSize:18, flexShrink:0 }}>{emoji}</span>
                          <span style={{ fontFamily:"Nunito,sans-serif", fontWeight:700, fontSize:13, color:done ? "#BBB" : "#2C2C2C", textDecoration:done ? "line-through" : "none", flex:1 }}>
                            {task.name}
                            {task.isSpecial && <span style={{ marginLeft:5, fontSize:10, color:"#E76F51", fontWeight:800 }}>★</span>}
                          </span>
                          <div onClick={function() { mark(task.name, skipped ? undefined : false); }} style={{ cursor:"pointer", opacity:0.5, fontSize:13, color:skipped ? "#E76F51" : "#AAA" }}>✕</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function WeeklyView() {
    const sections = SECTIONS.map(function(sec) {
      const tasks = allWeekTasks.filter(function(t) {
        if (sec.id === "anytime") return !t.start;
        const h = parseInt(t.start || "-1");
        return h >= sec.from && h < sec.to;
      });
      return Object.assign({}, sec, { tasks: tasks });
    }).filter(function(s) { return s.tasks.length > 0; });

    return (
      <div style={{ background:"#FFFDF7", minHeight:"100dvh", paddingBottom:90 }}>
        <div style={{ background:"#FFF8E7", padding:"52px 20px 18px", borderBottom:"2px solid #E8D8A0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:28 }}>✨</span>
            <div style={{ fontFamily:"Nunito,sans-serif", fontWeight:900, fontSize:24, color:"#2C2C2C", fontStyle:"italic" }}>Daily Routine</div>
          </div>
          <div style={{ marginTop:10, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ fontFamily:"Nunito,sans-serif", fontSize:13, color:"#AAA", fontWeight:600 }}>Weekly Progress</div>
            <div style={{ fontFamily:"Nunito,sans-serif", fontWeight:900, fontSize:20, color:"#E76F51" }}>{weekScore}% done</div>
          </div>
        </div>

        {allWeekTasks.length === 0 ? (
          <div style={{ textAlign:"center", padding:"80px 24px" }}>
            <div style={{ fontFamily:"Nunito,sans-serif", fontWeight:800, fontSize:18, color:"#AAA" }}>No schedule yet! Go to Chat to add your routine.</div>
            <button onClick={function() { setView("chat"); }} style={{ marginTop:20, padding:"12px 28px", background:"#E76F51", color:"#fff", border:"none", borderRadius:12, cursor:"pointer", fontFamily:"Nunito,sans-serif", fontWeight:800, fontSize:14 }}>Open Chat</button>
          </div>
        ) : (
          <div style={{ overflowX:"auto", padding:"16px 12px 0" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed", minWidth:340 }}>
              {sections.map(function(sec) {
          
