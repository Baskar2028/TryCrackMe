import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useNavigate, useLocation } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { io } from "socket.io-client";
import {
  Shield,
  Timer,
  AlertTriangle,
  Play,
  Pause,
  Square,
  RotateCcw,
  LogOut,
  CheckCircle2,
  Code2,
  Users,
  Activity,
  Maximize,
  ChevronLeft,
  ChevronRight,
  TerminalSquare,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  XCircle,
  HelpCircle,
} from "lucide-react";
import "./styles.css";
const api = async (path, opts = {}) => {
  const r = await fetch("/api" + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  let d = {};
  try {
    d = await r.json();
  } catch {}
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
};
const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
function App() {
  const [me, setMe] = useState(null),
    [loading, setLoading] = useState(true);
  useEffect(
    () =>
      api("/auth/me")
        .then((d) => setMe(d))
        .catch(() => setMe(null))
        .finally(() => setLoading(false)),
    [],
  );
  if (loading)
    return (
      <div className="center">
        <Spinner />
      </div>
    );
  return me ? (
    <>
      {me.user.role === "admin" ? <Admin me={me} /> : <Participant me={me} />}
    </>
  ) : (
    <Login onLogin={setMe} />
  );
}
function Spinner() {
  return <div className="spinner" />;
}
function Login({ onLogin }) {
  const [tab, setTab] = useState("participant"),
    [id, setId] = useState("TC001"),
    [password, setPassword] = useState("participant@123"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await api(
        tab === "participant" ? "/auth/participant/login" : "/auth/admin/login",
        {
          method: "POST",
          body: JSON.stringify(
            tab === "participant"
              ? { participantId: id, password }
              : { username: id, password },
          ),
        },
      );
      onLogin(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-shell">
      <div className="login-card glass">
        <div className="brand-mark">
          <Code2 size={28} />
        </div>
        <div className="eyebrow">DEBUGGING COMPETITION</div>
        <h1>TRY CRACK ME</h1>
        <p>DEBUG. THINK. CRACK THE CODE.</p>
        <div className="tabs">
          <button
            className={tab === "participant" ? "active" : ""}
            onClick={() => {
              setTab("participant");
              setId("TC001");
              setPassword("participant@123");
            }}
          >
            Participant
          </button>
          <button
            className={tab === "admin" ? "active" : ""}
            onClick={() => {
              setTab("admin");
              setId("admin");
              setPassword("TryCrackMe@2026");
            }}
          >
            Admin
          </button>
        </div>
        <form onSubmit={submit}>
          <label>{tab === "participant" ? "Participant ID" : "Username"}</label>
          <input value={id} onChange={(e) => setId(e.target.value)} required />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="primary wide" disabled={busy}>
            {busy ? <Spinner /> : "ENTER CONSOLE"}
          </button>
          {error && (
            <div className="error-box">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}
        </form>
        <div className="login-note">
          Server-authoritative timer • 13 challenges • 10-warning limit
        </div>
      </div>
    </div>
  );
}
function EventBar({ event, admin = false, onAction }) {
  return (
    <div className="eventbar">
      <div>
        <span className={"dot " + event.status.toLowerCase()} />
        <b>{event.status}</b>
        <span className="muted">
          {event.status === "RUNNING"
            ? " competition live"
            : event.status === "PAUSED"
              ? " submissions frozen"
              : event.status === "ENDED"
                ? " final results locked"
                : " waiting for admin start"}
        </span>
      </div>
      {admin && (
        <div className="actions">
          {event.status === "NOT_STARTED" && (
            <button className="primary" onClick={() => onAction("start")}>
              <Play size={15} /> Start
            </button>
          )}
          {event.status === "RUNNING" && (
            <button onClick={() => onAction("pause")}>
              <Pause size={15} /> Pause
            </button>
          )}
          {event.status === "PAUSED" && (
            <button className="primary" onClick={() => onAction("resume")}>
              <Play size={15} /> Resume
            </button>
          )}
          {["RUNNING", "PAUSED"].includes(event.status) && (
            <button className="danger" onClick={() => onAction("end")}>
              <Square size={15} /> End
            </button>
          )}
          <button onClick={() => onAction("reset")}>
            <RotateCcw size={15} /> Reset
          </button>
        </div>
      )}
    </div>
  );
}
function useEventSocket(setEvent) {
  useEffect(() => {
    const s = io({ withCredentials: true });
    s.on("event:update", setEvent);
    return () => s.disconnect();
  }, [setEvent]);
}
function Participant({ me }) {
  const [event, setEvent] = useState(me.event),
    [session, setSession] = useState(me.session),
    [questions, setQuestions] = useState([]),
    [progress, setProgress] = useState([]),
    [selected, setSelected] = useState("C1"),
    [code, setCode] = useState(""),
    [term, setTerm] = useState(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    let mounted = true;
    const syncSession = async () => {
      try {
        const d = await api("/participant/session");
        if (!mounted) return;
        setEvent(d.event);
        setSession(d.session);
        setProgress(d.progress || []);
        if (d.session?.current_question) setSelected(d.session.current_question);
      } catch (e) {
        if (mounted) setMessage(e.message);
      }
    };
    api("/questions")
      .then((d) => mounted && setQuestions(d.questions))
      .catch((e) => mounted && setMessage(e.message));
    syncSession();
    const s = io({ withCredentials: true });
    const onEvent = (nextEvent) => {
      setEvent(nextEvent);
      syncSession();
    };
    const onTerminated = () => {
      setSession((current) =>
        current ? { ...current, status: "TERMINATED" } : current,
      );
    };
    s.on("event:update", onEvent);
    s.on("session:terminated", onTerminated);
    return () => {
      mounted = false;
      s.disconnect();
    };
  }, []);
  useEffect(() => {
    const p = progress.find((x) => x.question_id === selected);
    const q = questions.find((x) => x.id === selected);
    setCode(p?.code ?? q?.starterCode ?? "");
    setTerm(null);
  }, [selected, questions]);
  const q = questions.find((x) => x.id === selected);
  const enter = async () => {
    try {
      await document.documentElement.requestFullscreen();
      const d = await api("/participant/enter", { method: "POST" });
      setSession(d.session);
      setEvent(d.event);
    } catch (e) {
      setMessage(e.message);
    }
  };
  if (!session)
    return (
      <Waiting
        event={event}
        onEnter={event.status === "RUNNING" ? enter : null}
        message={message}
      />
    );
  if (session.status === "TERMINATED")
    return <Result event={event} session={session} terminated />;
  if (event.status === "ENDED" || session.status === "COMPLETED")
    return <Result event={event} session={session} />;
  if (!q) return <div className="center"><Spinner /></div>;
  return (
    <Competition
      event={event}
      setEvent={setEvent}
      session={session}
      setSession={setSession}
      questions={questions}
      progress={progress}
      setProgress={setProgress}
      selected={selected}
      setSelected={setSelected}
      q={q}
      code={code}
      setCode={setCode}
      term={term}
      setTerm={setTerm}
      message={message}
      setMessage={setMessage}
    />
  );
}
function Waiting({ event, onEnter, message }) {
  return (
    <div className="center-shell">
      <div className="wait-card glass">
        <Shield size={46} />
        <div className="eyebrow">TRY CRACK ME</div>
        <h2>
          {event.status === "RUNNING"
            ? "FULLSCREEN REQUIRED"
            : event.status === "ENDED"
              ? "EVENT ENDED"
              : "EVENT HAS NOT STARTED YET"}
        </h2>
        <p>
          {event.status === "RUNNING"
            ? "Enter fullscreen to unlock the coding console."
            : event.status === "ENDED"
              ? "The administrator has finalized the competition."
              : "Stay ready. The administrator will enable the 30-minute competition timer."}
        </p>
        {onEnter && (
          <button className="primary" onClick={onEnter}>
            <Maximize size={16} /> ENTER FULLSCREEN TO START
          </button>
        )}
        {message && <div className="error-box">{message}</div>}
      </div>
    </div>
  );
}
function useAntiCheat(active, setMessage) {
  useEffect(() => {
    if (!active) return;
    let last = {};
    const report = async (type, reason) => {
      const t = Date.now();
      if (t - (last[type] || 0) < 1200) return;
      last[type] = t;
      try {
        const d = await api("/participant/activity", {
          method: "POST",
          body: JSON.stringify({ type, reason }),
        });
        setMessage(`${reason} • warning ${d.count}/10`);
      } catch {}
    };
    const vis = () => {
      if (document.hidden)
        report("TAB_SWITCH", "TAB SWITCH / VISIBILITY CHANGE DETECTED");
    };
    const blur = () => report("WINDOW_BLUR", "WINDOW FOCUS LOST");
    const key = (e) => {
      const k = e.key.toLowerCase();
      if (
        e.key === "PrintScreen" ||
        (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(e.key))
      ) {
        e.preventDefault();
        report("SCREENSHOT", "SCREEN CAPTURE ATTEMPT DETECTED");
      }
      if ((e.ctrlKey || e.metaKey) && ["c", "v", "x"].includes(k)) {
        report(
          k === "c" ? "COPY" : k === "v" ? "PASTE" : "CUT",
          "CLIPBOARD ACTION DETECTED",
        );
      }
      if (
        e.key === "F12" ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(k))
      ) {
        e.preventDefault();
        report("DEVTOOLS", "DEVELOPER TOOLS SHORTCUT DETECTED");
      }
    };
    const ctx = (e) => {
      e.preventDefault();
      report("CONTEXT_MENU", "CONTEXT MENU DISABLED");
    };
    const fs = () => {
      if (!document.fullscreenElement)
        report("FULLSCREEN_EXIT", "FULLSCREEN EXIT DETECTED");
    };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("blur", blur);
    document.addEventListener("keydown", key, true);
    document.addEventListener("contextmenu", ctx);
    document.addEventListener("fullscreenchange", fs);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("blur", blur);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("contextmenu", ctx);
      document.removeEventListener("fullscreenchange", fs);
    };
  }, [active, setMessage]);
}
function Competition({
  event,
  setEvent,
  session,
  setSession,
  questions,
  progress,
  setProgress,
  selected,
  setSelected,
  q,
  code,
  setCode,
  term,
  setTerm,
  message,
  setMessage,
}) {
  const [remaining, setRemaining] = useState(event.remainingSeconds),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(null);
  useAntiCheat(true, setMessage);
  useEffect(() => {
    const i = setInterval(() => {
      setRemaining(
        event.remainingSeconds -
          Math.floor((Date.now() - event.serverNow) / 1000),
      );
    }, 500);
    return () => clearInterval(i);
  }, [event]);
  useEffect(() => {
    const i = setInterval(
      () =>
        api("/event")
          .then(setEvent)
          .catch(() => {}),
      3000,
    );
    return () => clearInterval(i);
  }, [setEvent]);
  useEffect(() => {
    if (remaining <= 0 || event.status !== "RUNNING") {
      if (remaining <= 0) setMessage("TIME UP — submissions are locked.");
      return;
    }
  }, [remaining, event.status, setMessage]);
  const groups = useMemo(
    () =>
      ["C", "Python", "Java"].map((lang) => ({
        lang,
        items: questions.filter((x) => x.language === lang),
      })),
    [questions],
  );
  const idx = questions.findIndex((x) => x.id === selected);
  const save = async (nextCode = code) => {
    try {
      await api("/participant/progress/" + q.id, {
        method: "PUT",
        body: JSON.stringify({ code: nextCode }),
      });
      setProgress((p) => {
        const rest = p.filter((x) => x.question_id !== q.id);
        return [
          ...rest,
          {
            question_id: q.id,
            code: nextCode,
            solved: p.find((x) => x.question_id === q.id)?.solved || 0,
            score: p.find((x) => x.question_id === q.id)?.score || 0,
            bonus: p.find((x) => x.question_id === q.id)?.bonus || 0,
          },
        ];
      });
    } catch (e) {
      setMessage(e.message);
    }
  };
  const run = async () => {
    setBusy(true);
    try {
      await save();
      const d = await api("/participant/run", {
        method: "POST",
        body: JSON.stringify({ questionId: q.id, code }),
      });
      setTerm(d.result);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    setConfirm(null);
    setBusy(true);
    try {
      await save();
      const d = await api("/participant/submit", {
        method: "POST",
        body: JSON.stringify({ questionId: q.id, code }),
      });
      setTerm(d.result);
      if (d.publicPassed) {
        setProgress((p) => [
          ...p.filter((x) => x.question_id !== q.id),
          {
            question_id: q.id,
            code,
            solved: 1,
            score: d.scoreAwarded,
            bonus: d.bonusAwarded,
          },
        ]);
        setMessage(
          `SOLVED • +${d.scoreAwarded}${d.bonusAwarded ? ` +${d.bonusAwarded} hidden bonus` : ""}`,
        );
      } else
        setMessage("Not solved yet — fix the failing behavior and resubmit.");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  const next = () => {
    if (idx < questions.length - 1) {
      save(code);
      setSelected(questions[idx + 1].id);
    }
  };
  const prev = () => {
    if (idx > 0) {
      save(code);
      setSelected(questions[idx - 1].id);
    }
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Code2 size={22} />
          <span>TRY CRACK ME</span>
        </div>
        <div className="topstats">
          <div>
            <Timer size={16} />
            <b className={remaining < 120 ? "urgent" : ""}>{fmt(remaining)}</b>
          </div>
          <div>
            <AlertTriangle size={16} />
            <b>{session.warnings_count}/10</b>
          </div>
          <div>
            <Activity size={16} />
            <b>
              {progress.reduce(
                (a, p) => a + (p.score || 0) + (p.bonus || 0),
                0,
              )}
            </b>
          </div>
          <button
            onClick={async () => {
              await api("/auth/logout", { method: "POST" });
              location.reload();
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <EventBar event={{ ...event, remainingSeconds: remaining }} />
      <div className="workspace">
        <main className="editor-pane">
          <div className="question-head">
            <div>
              <span className="chip">{q.language}</span>
              <h2>
                {q.id} · {q.title}
              </h2>
              <p>{q.description}</p>
              <small>Input: {q.inputFormat}</small>
            </div>
            <div className="marks">{q.maxMarks} pts</div>
          </div>
          <div className="editor-wrap">
            <Editor
              height="100%"
              language={
                q.language.toLowerCase() === "python"
                  ? "python"
                  : q.language.toLowerCase() === "java"
                    ? "java"
                    : "c"
              }
              value={code}
              onChange={(v) => setCode(v ?? "")}
              theme="vs-dark"
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                automaticLayout: true,
                scrollBeyondLastLine: false,
                wordWrap: "on",
                padding: { top: 14 },
              }}
            />
          </div>
          <div className="toolbar">
            <button onClick={() => setConfirm("reset")}>
              <RotateCcw size={15} /> Reset Code
            </button>
            <button onClick={run} disabled={busy || remaining <= 0}>
              <Play size={15} /> Run Code
            </button>
            <button
              className="primary"
              onClick={() => setConfirm("submit")}
              disabled={busy || remaining <= 0}
            >
              <CheckCircle2 size={15} /> Submit
            </button>
            <div className="navbuttons">
              <button onClick={prev} disabled={idx === 0}>
                <ChevronLeft size={15} />
              </button>
              <button onClick={next} disabled={idx === questions.length - 1}>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
          {message && (
            <div className="notice">
              <AlertTriangle size={15} />
              {message}
            </div>
          )}
          <Terminal result={term} onClear={() => setTerm(null)} q={q} />
        </main>
        <aside className="question-panel">
          <div className="panel-title">
            <span>CHALLENGES</span>
            <span>{progress.filter((p) => p.solved).length}/{questions.length} solved</span>
          </div>
          {groups.map((g) => (
            <div key={g.lang} className="qgroup">
              <h4>
                {g.lang}
                <span>{g.items.reduce((a, x) => a + x.maxMarks, 0)} pts</span>
              </h4>
              <div className="qgrid">
                {g.items.map((x) => {
                  const p = progress.find((z) => z.question_id === x.id);
                  return (
                    <button
                      key={x.id}
                      className={`${x.id === selected ? "current " : ""}${p?.solved ? "solved " : p?.code && p.code !== x.starterCode ? "attempted " : ""}`}
                      onClick={() => {
                        save(code);
                        setSelected(x.id);
                      }}
                    >
                      <span>{x.id}</span>
                      {p?.solved ? (
                        <CheckCircle2 size={13} />
                      ) : p?.code && p.code !== x.starterCode ? (
                        <Activity size={13} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>
      </div>
      {confirm && (
        <div className="modal-back">
          <div className="modal glass">
            <h3>{confirm === "reset" ? "Reset code?" : "Submit solution?"}</h3>
            <p>
              {confirm === "reset"
                ? "Restore the starter code. Your score is not reset."
                : "The server will compile and validate your code against official public and hidden tests."}
            </p>
            <div className="actions">
              <button onClick={() => setConfirm(null)}>Cancel</button>
              <button
                className={confirm === "submit" ? "primary" : "danger"}
                onClick={
                  confirm === "submit"
                    ? submit
                    : () => {
                        save(q.starterCode);
                        setCode(q.starterCode);
                        setConfirm(null);
                      }
                }
              >
                {confirm === "submit" ? "Submit" : "Reset Code"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function Terminal({ result, onClear, q }) {
  const [activeTab, setActiveTab] = useState("console");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (result) {
      if (!result.compile?.ok || (result.compile?.stderr && !result.tests?.length)) {
        setActiveTab("console");
      } else if (result.tests?.length) {
        setActiveTab("tests");
      }
    }
  }, [result]);

  const copyOutput = () => {
    if (!result) return;
    const text = [
      result.compile?.stdout ? `--- STDOUT ---\n${result.compile.stdout}` : "",
      result.compile?.stderr ? `--- STDERR ---\n${result.compile.stderr}` : "",
      ...(result.tests || []).map(
        (t, i) =>
          `--- TEST ${i + 1} (${t.passed ? "PASS" : "FAIL"}) ---\nExpected: ${t.expected}\nActual: ${t.stdout || "(no output)"}${t.stderr ? `\nError: ${t.stderr}` : ""}`
      ),
    ]
      .filter(Boolean)
      .join("\n\n");

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const passCount = result?.tests?.filter((t) => t.passed).length || 0;
  const totalTests = result?.tests?.length || 0;

  return (
    <div className="terminal-container">
      <div className="terminal-header">
        <div className="terminal-tabs">
          <button
            className={`term-tab ${activeTab === "console" ? "active" : ""}`}
            onClick={() => setActiveTab("console")}
          >
            <TerminalSquare size={14} /> Console Output
            {result?.compile?.stderr && <span className="tab-indicator err" />}
          </button>
          <button
            className={`term-tab ${activeTab === "tests" ? "active" : ""}`}
            onClick={() => setActiveTab("tests")}
          >
            <Activity size={14} /> Test Results
            {totalTests > 0 && (
              <span className={`tab-badge ${passCount === totalTests ? "pass" : "fail"}`}>
                {passCount}/{totalTests}
              </span>
            )}
          </button>
          <button
            className={`term-tab ${activeTab === "guidance" ? "active" : ""}`}
            onClick={() => setActiveTab("guidance")}
          >
            <HelpCircle size={14} /> Guide & Rules
          </button>
        </div>

        <div className="terminal-actions">
          {result && (
            <>
              <button className="term-icon-btn" onClick={copyOutput} title="Copy output to clipboard">
                {copied ? <Check size={13} className="text-green" /> : <Copy size={13} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
              {onClear && (
                <button className="term-icon-btn" onClick={onClear} title="Clear terminal output">
                  <Trash2 size={13} />
                  <span>Clear</span>
                </button>
              )}
            </>
          )}
          {result ? (
            <div className={`status-tag ${result.compile?.ok ? (passCount === totalTests && totalTests > 0 ? "pass" : "warn") : "fail"}`}>
              {result.compile?.ok ? (totalTests > 0 && passCount === totalTests ? "ALL PASSED" : "EXECUTION DONE") : "COMPILE ERROR"}
            </div>
          ) : (
            <div className="status-tag idle">CONSOLE READY</div>
          )}
        </div>
      </div>

      <div className="terminal-body">
        {activeTab === "console" && (
          <div className="tab-content console-view">
            {!result ? (
              <div className="terminal-empty-state">
                <TerminalSquare size={32} />
                <p>Run your code to inspect compiler diagnostics, standard output, and execution logs.</p>
              </div>
            ) : (
              <div className="console-grid">
                <OutputBlock
                  label="STDOUT (STANDARD OUTPUT)"
                  value={result.compile?.stdout}
                  placeholder="Program completed without stdout."
                />
                <OutputBlock
                  label="STDERR (DIAGNOSTICS & ERRORS)"
                  value={result.compile?.stderr}
                  error={Boolean(result.compile?.stderr)}
                  placeholder="Clean build — no errors or warnings reported."
                />
              </div>
            )}
          </div>
        )}

        {activeTab === "tests" && (
          <div className="tab-content tests-view">
            {!result || !result.tests?.length ? (
              <div className="terminal-empty-state">
                <Activity size={32} />
                <p>Click <b>Run Code</b> or <b>Submit</b> to execute public test cases.</p>
              </div>
            ) : (
              <div className="tests-wrapper">
                <div className="test-suite-header">
                  <span>PUBLIC TEST SUITE</span>
                  <span className={passCount === totalTests ? "test-summary-pass" : "test-summary-fail"}>
                    {passCount} of {totalTests} test cases passed
                  </span>
                </div>
                <div className="test-cards">
                  {result.tests.map((t, idx) => (
                    <div key={idx} className={`test-card ${t.passed ? "passed" : "failed"}`}>
                      <div className="test-card-head">
                        <div className="test-card-title">
                          {t.passed ? <CheckCircle2 size={16} className="pass-icon" /> : <XCircle size={16} className="fail-icon" />}
                          <b>Test #{idx + 1}</b>
                        </div>
                        <div className="test-card-status">
                          {t.timeout ? <span className="badge-timeout">TIMEOUT</span> : t.passed ? <span className="badge-pass">PASSED</span> : <span className="badge-fail">FAILED</span>}
                        </div>
                      </div>

                      <div className="test-card-body">
                        <div className="test-field">
                          <label>Expected Output</label>
                          <pre>{t.expected}</pre>
                        </div>
                        <div className="test-field">
                          <label>Your Program Output</label>
                          <pre className={t.passed ? "match" : "mismatch"}>{t.stdout || "(no output)"}</pre>
                        </div>
                        {t.stderr && (
                          <div className="test-field full-width error">
                            <label>Runtime Error</label>
                            <pre>{t.stderr}</pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "guidance" && (
          <div className="tab-content guidance-view">
            <div className="guidance-card">
              <h4><Shield size={16} /> Debugging & Competition Rules</h4>
              <ul>
                <li><b>Input format:</b> Read inputs using standard library methods (`scanf` in C, `input()` in Python, `Scanner` in Java).</li>
                <li><b>Output format:</b> Print exact matching outputs without extra prompt phrases unless required.</li>
                <li><b>Anti-Cheat Policy:</b> Tab switching, focus loss, screenshot attempts, or clipboard shortcuts increment your warning counter. Reaching 10 warnings terminates your session.</li>
                <li><b>Submission Scoring:</b> You can submit multiple times. Score updates when public tests pass.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function OutputBlock({ label, value, error = false, placeholder = "No output" }) {
  return (
    <div className={`output-block ${error ? "error-output" : ""}`}>
      <div className="output-block-label">{label}</div>
      <pre className="output-content">{value || placeholder}</pre>
    </div>
  );
}
function Result({ event, session, terminated }) {
  const [data, setData] = useState(null);
  useEffect(() => api("/participant/result").then(setData), []);
  return (
    <div className="center-shell">
      <div className="result-card glass">
        <CheckCircle2 size={50} />
        <div className="eyebrow">FINAL RESULT</div>
        <h2>
          {terminated ? "WARNING LIMIT EXCEEDED" : "COMPETITION COMPLETE"}
        </h2>
        <p>
          {terminated
            ? "Your session was terminated after 10 recorded violations."
            : "Your competition session has been finalized."}
        </p>
        {data && (
          <div className="score-big">
            {data.totals.total}
            <small>/295</small>
          </div>
        )}
        <div className="result-grid">
          {data?.rows?.map((r) => (
            <div key={r.question_id}>
              <span>{r.question_id}</span>
              <b>{r.score + r.bonus}</b>
            </div>
          ))}
        </div>
        <button
          onClick={async () => {
            await api("/auth/logout", { method: "POST" });
            location.reload();
          }}
        >
          <LogOut size={15} /> Exit
        </button>
      </div>
    </div>
  );
}
function Admin({ me }) {
  const [event, setEvent] = useState(me.event),
    [board, setBoard] = useState([]),
    [people, setPeople] = useState([]),
    [selected, setSelected] = useState(null),
    [detail, setDetail] = useState(null),
    [tab, setTab] = useState("leaderboard"),
    [msg, setMsg] = useState(""),
    [remaining, setRemaining] = useState(me.event.remainingSeconds);
  const load = async () => {
    try {
      const [b, p] = await Promise.all([
        api("/admin/leaderboard"),
        api("/admin/participants"),
      ]);
      setEvent(b.event);
      setBoard(b.leaderboard);
      setPeople(p.participants);
    } catch (e) {
      setMsg(e.message);
    }
  };
  useEffect(() => {
    load();
    const s = io({ withCredentials: true });
    s.on("leaderboard:update", (nextBoard) => {
      setBoard(nextBoard);
      load();
    });
    s.on("event:update", setEvent);
    const i = setInterval(load, 4000);
    return () => {
      clearInterval(i);
      s.disconnect();
    };
  }, []);
  useEffect(() => {
    const i = setInterval(() => {
      setRemaining(
        event.remainingSeconds -
          Math.floor((Date.now() - event.serverNow) / 1000),
      );
    }, 500);
    return () => clearInterval(i);
  }, [event]);
  const action = async (a) => {
    if (
      a === "reset" &&
      !confirm("Reset progress, warnings, submissions and event timer?")
    )
      return;
    try {
      const d = await api("/admin/event/" + a, { method: "POST" });
      setEvent(d);
      setRemaining(d.remainingSeconds);
      await load();
    } catch (e) {
      setMsg(e.message);
    }
  };
  const open = async (pid) => {
    setSelected(pid);
    setDetail(await api("/admin/participants/" + pid));
  };
  return (
    <div className="admin-shell">
      <header className="topbar">
        <div className="brand">
          <Shield size={22} />
          <span>
            TRY CRACK ME <small>ADMIN CONSOLE</small>
          </span>
        </div>
        <div className="topstats">
          <div>
            <Timer size={16} />
            <b>{fmt(remaining)}</b>
          </div>
          <button
            onClick={async () => {
              await api("/auth/logout", { method: "POST" });
              location.reload();
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <EventBar event={event} admin onAction={action} />
      {msg && <div className="notice adminnotice">{msg}</div>}
      <div className="admin-content">
        <div className="stat-grid">
          <Stat label="Participants" value={people.length} icon={<Users />} />
          <Stat
            label="Solved"
            value={board.reduce((a, b) => a + b.solved, 0)}
            icon={<CheckCircle2 />}
          />
          <Stat
            label="Top Score"
            value={board[0]?.total_score || 0}
            icon={<Activity />}
          />
          <Stat
            label="Warnings"
            value={people.reduce((a, b) => a + (b.warnings_count || 0), 0)}
            icon={<AlertTriangle />}
          />
        </div>
        <div className="admin-tabs">
          <button
            className={tab === "leaderboard" ? "active" : ""}
            onClick={() => setTab("leaderboard")}
          >
            Leaderboard
          </button>
          <button
            className={tab === "participants" ? "active" : ""}
            onClick={() => setTab("participants")}
          >
            Participants
          </button>
        </div>
        {tab === "leaderboard" ? (
          <div className="table-card glass">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Participant</th>
                  <th>ID</th>
                  <th>C</th>
                  <th>Python</th>
                  <th>Java</th>
                  <th>Bonus</th>
                  <th>Total</th>
                  <th>Solved</th>
                  <th>Warnings</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {board.map((r) => (
                  <tr key={r.participant_id}>
                    <td>#{r.rank}</td>
                    <td>{r.name}</td>
                    <td>{r.participant_id}</td>
                    <td>{r.c_score}</td>
                    <td>{r.python_score}</td>
                    <td>{r.java_score}</td>
                    <td>+{r.bonus}</td>
                    <td>
                      <b>{r.total_score}</b>
                    </td>
                    <td>{r.solved}/13</td>
                    <td>{r.warnings_count || 0}/10</td>
                    <td>
                      <span className="status-pill">
                        {r.status || "NOT ENTERED"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-card glass">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Current</th>
                  <th>Solved</th>
                  <th>Score</th>
                  <th>Warnings</th>
                  <th>Activity</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.participant_id}>
                    <td>{p.name}</td>
                    <td>{p.participant_id}</td>
                    <td>{p.status || "NOT ENTERED"}</td>
                    <td>{p.current_question || "—"}</td>
                    <td>{p.solved}/13</td>
                    <td>{p.score}</td>
                    <td>{p.warnings_count || 0}/10</td>
                    <td>
                      <button
                        className="linkbtn"
                        onClick={() => open(p.participant_id)}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {detail && (
        <div className="modal-back">
          <div className="detail glass">
            <div className="detail-head">
              <div>
                <div className="eyebrow">PARTICIPANT MONITOR</div>
                <h2>
                  {detail.participant.name}{" "}
                  <span>{detail.participant.participant_id}</span>
                </h2>
              </div>
              <button onClick={() => setDetail(null)}>Close</button>
            </div>
            <div className="detail-grid">
              <div>
                <h4>Session</h4>
                <pre>{JSON.stringify(detail.session, null, 2)}</pre>
              </div>
              <div>
                <h4>Warnings ({detail.warnings.length})</h4>
                <pre>
                  {detail.warnings
                    .map((w) => `${w.created_at}  ${w.type}  ${w.reason}`)
                    .join("\n") || "None"}
                </pre>
              </div>
              <div>
                <h4>Submission History</h4>
                <pre>
                  {detail.submissions
                    .map(
                      (s) =>
                        `${s.created_at}  ${s.question_id}  ${s.passed_public ? "PASS" : "FAIL"}  +${s.score_awarded}+${s.bonus_awarded}`,
                    )
                    .join("\n") || "None"}
                </pre>
              </div>
              <div>
                <h4>Activity</h4>
                <pre>
                  {detail.activity
                    .map((a) => `${a.created_at}  ${a.type}  ${a.metadata}`)
                    .join("\n") || "None"}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function Stat({ label, value, icon }) {
  return (
    <div className="stat glass">
      <div>{icon}</div>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
