"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

// A terminal with a live retro-hud at the bottom. The bar rows are real
// statusline.py output, pre-rendered (raw SGR + OSC 8) per mood, model,
// effort, width and clock tick; the retro-hud:// links in them become the
// clickable segments, and each click does what retro-hud-handler.sh does in
// a real tmux session: the same menus, keys, popups and slash commands.

type Frames = Record<string, Record<string, Record<string, number[][]>>>; // model → effort → cols → ticks
type Data = {
  widths: number[];
  models: string[];
  levels: string[];
  moods: { id: string; label: string; frames: Frames }[];
  review: Frames;
  rows: string[];
  diffstat: string;
  shortstat: string;
  diff: string;
};
type Run = { text: string; fg?: string; bg?: string; bold?: boolean; url?: string };
type Sid = "main" | "review";

// ── ANSI → runs ──
const BASE16 = [
  "#000000", "#cd0000", "#00cd00", "#cdcd00", "#0000ee", "#cd00cd", "#00cdcd", "#e5e5e5",
  "#7f7f7f", "#ff0000", "#00ff00", "#ffff00", "#5c5cff", "#ff00ff", "#00ffff", "#ffffff",
];
function xterm(n: number): string {
  if (n < 16) return BASE16[n];
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return `rgb(${v},${v},${v})`;
  }
  const i = n - 16;
  const c = (k: number) => (k === 0 ? 0 : 55 + k * 40);
  return `rgb(${c(Math.floor(i / 36))},${c(Math.floor(i / 6) % 6)},${c(i % 6)})`;
}

export function parse(row: string): Run[] {
  const runs: Run[] = [];
  let st: Omit<Run, "text"> = {};
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf) runs.push({ text: buf, ...st });
    buf = "";
  };
  while (i < row.length) {
    if (row[i] === "\x1b" && row[i + 1] === "[") {
      const end = row.indexOf("m", i);
      flush();
      const codes = row.slice(i + 2, end).split(";").map(Number);
      for (let k = 0; k < codes.length; k++) {
        const c = codes[k];
        if (c === 0) st = { url: st.url };
        else if (c === 1) st = { ...st, bold: true };
        else if ((c === 38 || c === 48) && codes[k + 1] === 5) {
          st = { ...st, [c === 38 ? "fg" : "bg"]: xterm(codes[k + 2]) };
          k += 2;
        }
        else if (c >= 30 && c <= 37) st = { ...st, fg: BASE16[c - 30] };
        else if (c >= 90 && c <= 97) st = { ...st, fg: BASE16[c - 82] };
      }
      i = end + 1;
    } else if (row[i] === "\x1b" && row[i + 1] === "]") {
      const end = row.indexOf("\x07", i);
      flush();
      const url = row.slice(i + 5, end); // ESC ] 8 ; ; url BEL
      st = { ...st, url: url || undefined };
      i = end + 1;
    } else {
      buf += row[i];
      i += 1;
    }
  }
  flush();
  return runs;
}

// Wide glyphs (emoji) take two cells; everything else one.
const isWide = (ch: string) => /\p{Extended_Pictographic}/u.test(ch);
export function Cells({ text }: { text: string }) {
  return (
    <>
      {Array.from(text).map((ch, k) =>
        ch.charCodeAt(0) < 128 ? (
          ch
        ) : (
          <span key={k} className={isWide(ch) ? "hud-c2" : "hud-c1"}>
            {ch}
          </span>
        ),
      )}
    </>
  );
}

const ACTION_NAMES: Record<string, string> = {
  model: "model",
  effort: "effort level",
  ctx: "context gauge",
  cost: "time and cost",
  diff: "lines changed",
  usage: "rate limits, 5 h | 7 d",
  agent: "agent menu",
  card: "agent presence",
  sessions: "other sessions",
  home: "jump home",
  back: "back to where you came from",
};

const MODEL_NAMES: Record<string, string> = { opus: "Opus 5.5", sonnet: "Sonnet 5.5", haiku: "Haiku 5.5" };
const NAME: Record<Sid, string> = { main: "lunar-colony", review: "review" };
const NOTE = "(types into the composer)";
const BODY_ROWS = 8;
const TIP = "context gauge red near 80%? /compact before it fills";
// the session list's state words, styled as the handler styles them
const WORDS: Record<string, [string, string, string]> = {
  working: ["working", "#00ff00", "1m"],
  yours: ["your turn", "#00ffff", "0s"],
  hot: ["working", "#00ff00", "1m"],
  alert: ["working", "#00ff00", "1m"],
  idle: ["idle", "#7a7f7a", "11m"],
  asleep: ["asleep", "#7a7f7a", "1h"],
};

type Item = { label: ReactNode; key?: string; run?: () => void; off?: boolean };
type Shown =
  | { kind: "menu"; title: string; items: Item[]; x?: number; y?: number }
  | { kind: "cloud"; x: number; y: number }
  | { kind: "card" }
  | { kind: "pager" };
type Line = ReactNode;

export function HudTerminal({ src }: { src: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [mood, setMood] = useState(0);
  const [tick, setTick] = useState(0);
  const [cols, setCols] = useState(84);
  const [font, setFont] = useState(12);
  const [session, setSession] = useState<Sid>("main");
  const [conf, setConf] = useState<Record<Sid, { model: string; effort: string }>>({
    main: { model: "sonnet", effort: "medium" },
    review: { model: "opus", effort: "high" },
  });
  const [log, setLog] = useState<Record<Sid, Line[] | null>>({ main: [], review: [] }); // null: cleared
  const [shown, setShown] = useState<Shown | null>(null);
  const [picker, setPicker] = useState(false);
  const [msg, setMsg] = useState("");
  const [waveUntil, setWaveUntil] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(src)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [src]);

  // the creature row below the terminal can switch the main session's mood
  useEffect(() => {
    const onMood = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const k = data?.moods.findIndex((x) => x.id === id) ?? -1;
      if (k < 0) return;
      setMood(k);
      setWaveUntil(0);
      setShown(null);
      setPicker(false);
      setSession("main");
    };
    window.addEventListener("hud:mood", onMood);
    return () => window.removeEventListener("hud:mood", onMood);
  }, [data]);

  // the bar animates once a second, like a short refreshInterval
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // fit the terminal to the column: the widest pre-rendered width that keeps text legible
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth - 26;
      const m = w / (84 * 0.6) >= 10.5 ? 84 : 60; // JetBrains Mono advances 0.6em
      setCols(m);
      setFont(Math.min(14, w / (m * 0.6)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const c = conf[session];
  const waving = session === "main" && tick < waveUntil;
  const rows = useMemo(() => {
    if (!data) return null;
    const frames =
      session === "review"
        ? data.review
        : data.moods[waving ? data.moods.findIndex((x) => x.id === "yours") : mood].frames;
    const set = frames[c.model][c.effort][cols];
    return set[tick % set.length].map((r) => data.rows[r]);
  }, [data, session, mood, waving, c, cols, tick]);
  const parsed = useMemo(() => rows?.map(parse) ?? [], [rows]);

  // tmux's display-message: it takes over the status line for a moment
  const say = (text: string, ms = 2500) => {
    setMsg(text);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(""), ms);
  };

  const close = () => setShown(null);
  const out = (s: Sid, ...lines: Line[]) =>
    setLog((l) => ({ ...l, [s]: [...(l[s] ?? []), ...lines] }));

  // what the handler's send-keys does: type the command into Claude, press Enter
  const send = (cmd: string) => {
    close();
    const s = session;
    const typed = (
      <>
        <span className="hud-dim">❯</span> {cmd}
      </>
    );
    const res = (t: ReactNode) => <span className="hud-dim">&nbsp; ⎿ &nbsp;{t}</span>;
    const [verb, arg] = cmd.slice(1).split(" ");
    if (verb === "model" && !arg) {
      setPicker(true);
      return;
    }
    if (verb === "model") {
      setConf((x) => ({ ...x, [s]: { ...x[s], model: arg } }));
      out(s, typed, res(<>Set model to <b>{MODEL_NAMES[arg]}</b></>));
    } else if (verb === "effort") {
      setConf((x) => ({ ...x, [s]: { ...x[s], effort: arg } }));
      out(s, typed, res(<>Set effort level to <b>{arg}</b></>));
    } else if (verb === "clear") {
      setLog((l) => ({ ...l, [s]: null }));
    } else if (verb === "compact") {
      out(s, typed, res("Compacted (ctrl+o to see full summary)"));
    } else if (verb === "context") {
      out(s, typed, res(s === "main" ? "Context usage: 76k / 200k tokens (38%)" : "Context usage: 24k / 200k tokens (12%)"));
    } else if (verb === "cost") {
      out(s, typed, res(s === "main" ? "Total cost: $1.84 · Total duration: 47m" : "Total cost: $0.42 · Total duration: 9m"));
    }
  };

  const switchTo = (s: Sid) => {
    close();
    setPicker(false);
    setSession(s);
  };

  const sessionsMenu = (): Shown => {
    const st = (s: Sid): [string, string, string] =>
      s === "review" ? ["your turn", WORDS.yours[1], "2m"] : WORDS[data?.moods[mood].id ?? "working"];
    const row = (s: Sid): Item => {
      const [word, color, age] = st(s);
      const here = s === session;
      return {
        label: (
          <>
            {NAME[s].padEnd(14)}
            <span style={{ color }}>{word}</span> {age}
            {here ? " · here" : ""}
          </>
        ),
        key: here ? undefined : "a",
        off: here,
        run: here ? undefined : () => switchTo(s),
      };
    };
    const others: Sid[] = session === "main" ? ["review"] : ["main"];
    return {
      kind: "menu",
      title: " sessions (2) ",
      items: [{ label: "⇢  nobody needs you", off: true }, ...others.map(row), row(session)],
    };
  };

  const agentMenu = (): Shown => ({
    kind: "menu",
    title: "agent",
    items: [
      { label: "status card", key: "c", run: () => setShown({ kind: "card" }) },
      {
        label: "wave",
        key: "w",
        run: () => {
          close();
          const id = data?.moods[mood].id;
          if (session === "main" && id !== "alert") setWaveUntil(tick + 10);
        },
      },
      { label: "quiet 1h", key: "h", run: close },
      {
        label: "sprite ▸",
        key: "s",
        run: () =>
          setShown({
            kind: "menu",
            title: "agent: sprite",
            items: ["blob", "beast", "alien", "bot", "robot", "default"].map((n, k) => ({
              label: n,
              key: String(k + 1),
              run: () => say("retro-hud demo: the page keeps this session's robot", 3000),
            })),
          }),
      },
      {
        label: "size ▸",
        key: "z",
        run: () =>
          setShown({
            kind: "menu",
            title: "agent: size",
            items: ["tiny", "big", "tall", "default"].map((n, k) => ({
              label: n,
              key: String(k + 1),
              run: () => say("retro-hud demo: the page keeps this session's robot", 3000),
            })),
          }),
      },
      { label: "reroll", key: "r", run: () => say("retro-hud demo: the page keeps this session's robot", 3000) },
      {
        label: "status",
        key: "i",
        run: () => {
          close();
          say(
            session === "main"
              ? `agent: ${WORDS[data?.moods[mood].id ?? "working"][0]} for ${WORDS[data?.moods[mood].id ?? "working"][2]} · ctx ${data?.moods[mood].id === "hot" ? 75 : data?.moods[mood].id === "alert" ? 92 : 38}% · limit 22% · $1.84`
              : "agent: your turn for 2m · ctx 12% · limit 22% · $0.42",
          );
        },
      },
    ],
  });

  const open = (url: string, e: React.MouseEvent) => {
    const action = url.replace("retro-hud://", "").split("?")[0];
    const s = screen.current?.getBoundingClientRect();
    const t = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!s) return;
    // the handler stands a menu above the pointer, centred on it
    const x = e.clientX - s.left;
    const y = t.top - s.top;
    const cur = conf[session];
    if (action === "usage") {
      say("retro-hud: opens your usage page in a real session", 4000);
    } else if (action === "cost") {
      send("/cost");
    } else if (action === "diff") {
      setShown({ kind: "pager" });
    } else if (action === "home") {
      switchTo("review");
    } else if (action === "back") {
      switchTo("main");
    } else if (action === "card") {
      setShown({ kind: "cloud", x, y });
    } else if (action === "agent") {
      setShown({ ...agentMenu(), x, y } as Shown);
    } else if (action === "sessions") {
      setShown({ ...sessionsMenu(), x, y } as Shown);
    } else if (action === "model") {
      setShown({
        kind: "menu",
        title: `/model ${NOTE}`,
        x,
        y,
        items: [
          ...(data?.models ?? []).map((m, k) => ({ label: m, key: String(k + 1), run: () => send(`/model ${m}`) })),
          { label: "pick… (Claude's own picker)", key: "p", run: () => send("/model") },
        ],
      });
    } else if (action === "effort") {
      setShown({
        kind: "menu",
        title: `/effort ${NOTE}`,
        x,
        y,
        items: (data?.levels ?? []).map((l, k) => ({
          label: l === cur.effort ? `${l}  (current)` : l,
          key: String(k + 1),
          run: () => send(`/effort ${l}`),
        })),
      });
    } else if (action === "ctx") {
      setShown({
        kind: "menu",
        title: `context ${NOTE}`,
        x,
        y,
        items: [
          { label: "/compact", key: "c", run: () => send("/compact") },
          { label: "/context", key: "x", run: () => send("/context") },
          {
            label: "/clear…",
            key: "l",
            run: () =>
              setShown({
                kind: "menu",
                title: `really /clear this session? ${NOTE}`,
                items: [
                  { label: "no, keep it", key: "n", run: close },
                  { label: "yes, /clear", key: "y", run: () => send("/clear") },
                ],
              }),
          },
        ],
      });
    }
  };

  // keys while something is up: a menu's own keys, Esc and q close; popups close on any key
  useEffect(() => {
    if (!shown && !picker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (picker && !shown) {
        const n = Number(k);
        if (n >= 1 && n <= 3) {
          setPicker(false);
          send(`/model ${data?.models[n - 1]}`);
        } else if (k === "Escape") setPicker(false);
        else return;
      } else if (shown?.kind === "menu") {
        const it = shown.items.find((i) => i.key === k && !i.off);
        if (it?.run) it.run();
        else if (k === "Escape" || k === "q") close();
        else return;
      } else if (shown?.kind === "pager") {
        if (k === "q" || k === "Escape") close();
        else return;
      } else if (shown?.kind === "cloud") {
        if (k === "m") setShown(agentMenu());
        else if (k === "c") setShown({ kind: "card" });
        else close();
      } else if (shown?.kind === "card") {
        if (k === "m") setShown(agentMenu());
        else close();
      }
      e.preventDefault();
    };
    // a press anywhere outside the pane closes it too (inside, the catcher takes it)
    const onDown = (e: MouseEvent) => {
      if (!screen.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  });

  const m = data?.moods[mood];
  const moodId = m?.id ?? "working";
  const lines = log[session];
  const body = [...(lines === null ? [] : [...transcript(session), ...lines])].slice(-BODY_ROWS);
  while (body.length < BODY_ROWS) body.unshift(<>&nbsp;</>);

  return (
    <div className="hud-term-wrap" ref={box}>
      <div className="hud-term" style={{ fontSize: `${font}px` }}>
        <div className="hud-titlebar">
          <span className="hud-dot" />
          <span className="hud-dot" />
          <span className="hud-dot" />
          <span className="hud-title">{NAME[session]} — claude</span>
        </div>
        <div className="hud-screen" ref={screen} style={{ width: `${cols}ch` }}>
          <div className="hud-body">
            {body.map((l, k) => (
              <div className="hud-line" key={k}>
                {l}
              </div>
            ))}
          </div>
          {picker ? (
            <ModelPicker
              current={c.model}
              models={data?.models ?? []}
              onPick={(mk) => {
                setPicker(false);
                send(`/model ${mk}`);
              }}
              onClose={() => setPicker(false)}
              cols={cols}
            />
          ) : (
            <>
              <div className="hud-rule">{"─".repeat(cols)}</div>
              <div className="hud-line">
                <span className="hud-dim">❯ </span>
                <span className="hud-cursor"> </span>
              </div>
              <div className="hud-rule">{"─".repeat(cols)}</div>
            </>
          )}
          {parsed.map((runs, r) => (
            <div className="hud-line" key={r}>
              {runs.map((run, k) => {
                const style = {
                  color: run.fg,
                  background: run.bg,
                  fontWeight: run.bold ? 700 : 400,
                };
                if (run.url?.startsWith("retro-hud://")) {
                  const a = run.url.replace("retro-hud://", "").split("?")[0];
                  return (
                    <button
                      key={k}
                      type="button"
                      className="hud-seg"
                      style={style}
                      title={ACTION_NAMES[a] ?? a}
                      onClick={(e) => open(run.url!, e)}
                    >
                      <Cells text={run.text} />
                    </button>
                  );
                }
                return (
                  <span key={k} style={style}>
                    <Cells text={run.text} />
                  </span>
                );
              })}
            </div>
          ))}
          <div className="hud-line hud-dim">
            <span style={{ color: "#af87ff" }}>⏵⏵ accept edits on</span> (shift+tab to cycle)
          </div>
          {shown && <div className="hud-catch" onClick={close} />}
          {shown?.kind === "menu" && <Menu shown={shown} screen={screen} />}
          {shown?.kind === "cloud" && (
            <Placed x={shown.x} y={shown.y} screen={screen} className="hud-cloud" onClick={close}>
              <div>
                <b>agent · {session === "review" ? "your turn for 2m" : `${WORDS[moodId][0]} for ${WORDS[moodId][2]}`}</b>
              </div>
              <div>{cardLines(session, moodId, c)[1]}</div>
              <div className="hud-dim">m menu · c card · click or key closes</div>
            </Placed>
          )}
          {shown?.kind === "card" && (
            <Placed screen={screen} className="hud-popup" title=" agent " onClick={close}>
              {cardLines(session, moodId, c).map((l, k) => (
                <div key={k}>{k === 0 ? <b>{l}</b> : l}</div>
              ))}
              <div>&nbsp;</div>
              <div className="hud-dim">tip: {TIP}</div>
              <div className="hud-dim">any key closes · m: menu</div>
            </Placed>
          )}
          {shown?.kind === "pager" && data && <Pager data={data} />}
        </div>
        <div className={msg ? "hud-tmux hud-tmux-msg" : "hud-tmux"}>
          {msg ? (
            <span>{msg}</span>
          ) : (
            <>
              <span>[{NAME[session]}] 0:claude*</span>
              <span>&quot;lab&quot; 14:32</span>
            </>
          )}
        </div>
      </div>
      <div className="hud-controls">
        <p className="hud-hint">
          Use the interactive terminal emulator above to play around with how it works.
        </p>
      </div>
    </div>
  );
}

function cardLines(s: Sid, mood: string, c: { model: string; effort: string }) {
  if (s === "review")
    return [
      "agent · your turn for 2m",
      `${MODEL_NAMES[c.model]} · effort ${c.effort}`,
      "context 12% · limit 22% · $0.42 · 9m",
      "+0/-0 · dir lunar-colony",
    ];
  const ctx = mood === "hot" ? 75 : mood === "alert" ? 92 : 38;
  return [
    `agent · ${WORDS[mood][0]} for ${WORDS[mood][2]}`,
    `${MODEL_NAMES[c.model]} · effort ${c.effort}`,
    `context ${ctx}% · limit 22% · $1.84 · 47m`,
    "+44/-12 · dir lunar-colony",
  ];
}

function transcript(s: Sid): Line[] {
  if (s === "review")
    return [
      <>
        <span className="hud-dim">❯</span> Review the min-throttle branch against TODO #2.
      </>,
      <>&nbsp;</>,
      <>
        <span className="hud-ok">●</span> The floor is in and tested to 0.3. Two notes: the cutoff
      </>,
      <>&nbsp; altitude is untested above 0.4, and k_hvel changed silently.</>,
    ];
  return [
    <>
      <span className="hud-dim">❯</span> Add a minimum throttle limit to descent guidance (TODO #2).
    </>,
    <>
      <span className="hud-ok">●</span> <b>Update</b>(lunar/control.py)
    </>,
    <><span className="hud-dim">&nbsp; ⎿ &nbsp;Added 22 lines, removed 2 lines</span></>,
    <>
      <span className="hud-ok">●</span> <b>Bash</b>(.venv/bin/python -m pytest -q)
    </>,
    <><span className="hud-dim">&nbsp; ⎿ &nbsp;31 passed in 0.84s</span></>,
    <>
      <span className="hud-ok">●</span> Throttle floor is in. Above 0.27 the lander can&apos;t hover,
    </>,
    <>&nbsp; so the terminal phase cuts the engine below 0.5 m.</>,
  ];
}

// A box placed like tmux places it: centred on the pointer and standing just
// above it (x, y given), or centred in the pane; kept inside the pane either way.
function Placed({
  x,
  y,
  screen,
  className,
  title,
  onClick,
  children,
}: {
  x?: number;
  y?: number;
  screen: React.RefObject<HTMLDivElement | null>;
  className: string;
  title?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const s = screen.current;
    if (!el || !s) return;
    const W = s.clientWidth;
    const H = s.clientHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = x === undefined ? (W - w) / 2 : x - w / 2;
    let top = y === undefined ? (H - h) / 2 : y - h;
    left = Math.max(0, Math.min(left, W - w));
    top = Math.max(0, Math.min(top, H - h));
    setPos({ left, top });
  }, [x, y, screen, children]);
  return (
    <div
      ref={ref}
      className={className}
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
      onClick={onClick}
    >
      {title && (
        <>
          <span className="hud-box-title">{title}</span>
          <div className="hud-title-w" aria-hidden style={{ height: 0, overflow: "hidden", visibility: "hidden", padding: "0 2ch" }}>
            {title}
          </div>
        </>
      )}
      {children}
    </div>
  );
}

function Menu({ shown, screen }: { shown: Extract<Shown, { kind: "menu" }>; screen: React.RefObject<HTMLDivElement | null> }) {
  return (
    <Placed x={shown.x} y={shown.y} screen={screen} className="hud-menu" title={shown.title}>
      {shown.items.map((it, k) => (
        <button
          type="button"
          className="hud-menu-item"
          disabled={it.off}
          onClick={it.run}
          key={k}
        >
          <span>{it.label}</span>
          <span>{it.key ? `(${it.key})` : ""}</span>
        </button>
      ))}
    </Placed>
  );
}

function ModelPicker({
  current,
  models,
  onPick,
  onClose,
  cols,
}: {
  current: string;
  models: string[];
  onPick: (m: string) => void;
  onClose: () => void;
  cols: number;
}) {
  return (
    <div className="hud-picker">
      <div className="hud-rule">{"─".repeat(cols)}</div>
      <div className="hud-line">
        <b>Select model</b>
      </div>
      {models.map((mk, k) => (
        <button type="button" key={mk} className="hud-picker-item" onClick={() => onPick(mk)}>
          {mk === current ? "❯" : " "} {k + 1}. {MODEL_NAMES[mk]}
          {mk === current ? " ✔" : ""}
        </button>
      ))}
      <button type="button" className="hud-picker-item hud-dim" onClick={onClose}>
        &nbsp; Esc to exit
      </button>
    </div>
  );
}

// git diff in less, as the handler's popup shows it: summary, file list, hunks
function Pager({ data }: { data: Data }) {
  const stat = data.diffstat.trimEnd().split("\n").slice(0, -1);
  const diff = data.diff.split("\n").filter((l) => !l.startsWith("diff --git") && !l.startsWith("index "));
  return (
    <div className="hud-pager">
      <span className="hud-box-title"> git diff (read-only) · q closes </span>
      <pre>
        <b>uncommitted changes</b> · {data.shortstat}
        {"\n\n"}
        {stat.join("\n")}
        {"\n\n"}
        {diff.map((l, k) => (
          <span
            key={k}
            className={
              l.startsWith("+++") || l.startsWith("---")
                ? "hud-fhead"
                : l.startsWith("+")
                  ? "hud-add"
                  : l.startsWith("-")
                    ? "hud-del"
                    : l.startsWith("@@")
                      ? "hud-hunk"
                      : undefined
            }
          >
            {l + "\n"}
          </span>
        ))}
      </pre>
      <div className="hud-less"> q closes · wheel scrolls </div>
    </div>
  );
}
