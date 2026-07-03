"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SIGNALS, SEED, BANDS, BAND_ORDER, type Signal, type Status } from "@/lib/signals";
import { listCases, saveCase, removeCase, loadCase, type Case } from "@/lib/cases";

interface WorkNode extends Signal {
  x: number; y: number; vx: number; vy: number; op: number; a: number;
}

export default function OrbitBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bodiesRef = useRef<HTMLDivElement>(null);
  const seedRef = useRef<string>(SEED);
  const selectedRef = useRef<string | null>(null);
  const nodesRef = useRef<WorkNode[]>([]);
  const elsRef = useRef<Record<string, HTMLDivElement>>({});
  const draggingRef = useRef<WorkNode | null>(null);
  const metaRef = useRef({ cx: 0, cy: 0 });
  const rebuildRef = useRef<(sigs: Signal[], spawn?: boolean) => void>(() => {});

  const [seed, setSeed] = useState(SEED);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [casesOpen, setCasesOpen] = useState(false);

  useEffect(() => { setCases(listCases()); }, []);

  useEffect(() => { seedRef.current = seed; }, [seed]);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);

  const selected = useMemo(
    () => (selectedId ? nodesRef.current.find((n) => n.id === selectedId) ?? null : null),
    [selectedId, dataVersion],
  );
  const total = nodesRef.current.length;
  const confirmedCount = nodesRef.current.filter((n) => n.status === "confirmed").length;

  useEffect(() => {
    const cv = canvasRef.current!;
    const ctx = cv.getContext("2d")!;
    const bodiesEl = bodiesRef.current!;
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0, cx = 0, cy = 0, baseR = 1, raf = 0;

    let root = getComputedStyle(document.documentElement);
    let cache: Record<string, string> = {};
    const cssv = (n: string) => (cache[n] ??= root.getPropertyValue(n).trim());
    const refreshCss = () => { cache = {}; root = getComputedStyle(document.documentElement); };
    const themeObs = new MutationObserver(refreshCss);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + "px"; cv.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      cx = W / 2; cy = H / 2 + 10; baseR = Math.min(W, H);
      metaRef.current = { cx, cy };
    }

    function targetRadius(d: WorkNode) {
      const b = BANDS[d.status];
      const lo = b.r0 * baseR * 0.5, hi = b.r1 * baseR * 0.5;
      const t = 1 - Math.max(0, Math.min(1, d.confidence / 100));
      return lo + (hi - lo) * t;
    }

    function attachDrag(el: HTMLDivElement, d: WorkNode) {
      let ox = 0, oy = 0, px = 0, py = 0, active = false, pid = 0, moved = false;
      el.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        active = true; draggingRef.current = d; moved = false;
        el.classList.add("drag"); pid = e.pointerId; el.setPointerCapture(pid);
        ox = e.clientX; oy = e.clientY; px = d.x; py = d.y; d.vx = 0; d.vy = 0; e.preventDefault();
      });
      el.addEventListener("pointermove", (e) => {
        if (!active) return;
        const mx = e.clientX - ox, my = e.clientY - oy;
        if (Math.abs(mx) + Math.abs(my) > 3) moved = true;
        d.x = px + mx; d.y = py + my;
      });
      const end = () => { if (!active) return; active = false; el.classList.remove("drag"); draggingRef.current = null; setTimeout(() => { moved = false; }, 40); };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
      el.addEventListener("click", () => { if (!moved) setSelectedId(d.id); });
    }

    function rebuild(sigs: Signal[], spawn = false) {
      const nodes: WorkNode[] = sigs.map((s, i) => {
        const a = -Math.PI / 2 + i * ((2 * Math.PI) / Math.max(1, sigs.length));
        const edge = spawn ? Math.max(W, H) * 0.7 : 300;
        return { ...s, a, x: cx + Math.cos(a) * edge, y: cy + Math.sin(a) * edge, vx: 0, vy: 0, op: spawn ? 0 : 1 };
      });
      nodesRef.current = nodes;
      elsRef.current = {};
      bodiesEl.innerHTML = "";
      nodes.forEach((d, i) => {
        const el = document.createElement("div");
        el.className = "body";
        el.innerHTML = `<div class="disc">${d.disc}</div><div class="tag">${escapeHtml(d.handle)}</div><div class="conf">${d.confidence}%</div>`;
        bodiesEl.appendChild(el);
        elsRef.current[d.id] = el;
        attachDrag(el, d);
        if (spawn) setTimeout(() => { const a = Math.random() * Math.PI * 2; const edge = Math.max(W, H) * 0.7; d.x = cx + Math.cos(a) * edge; d.y = cy + Math.sin(a) * edge; d.op = 0; }, i * 110);
      });
      setSelectedId(null);
      setDataVersion((v) => v + 1);
    }
    rebuildRef.current = rebuild;

    function step() {
      const nodes = nodesRef.current;
      const K_RAD = 0.02, K_REP = 1400, DAMP = 0.86;
      for (let i = 0; i < nodes.length; i++) {
        const d = nodes[i];
        if (d === draggingRef.current) continue;
        const dx = d.x - cx, dy = d.y - cy, dist = Math.hypot(dx, dy) || 0.001;
        const f = (targetRadius(d) - dist) * K_RAD;
        let fx = (dx / dist) * f, fy = (dy / dist) * f;
        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const o = nodes[j];
          const rx = d.x - o.x, ry = d.y - o.y, r2 = rx * rx + ry * ry + 40;
          const rf = K_REP / r2, rd = Math.sqrt(r2);
          fx += (rx / rd) * rf; fy += (ry / rd) * rf;
        }
        d.vx = (d.vx + fx) * DAMP; d.vy = (d.vy + fy) * DAMP;
        const sp = Math.hypot(d.vx, d.vy); if (sp > 7) { d.vx *= 7 / sp; d.vy *= 7 / sp; }
        d.x += d.vx; d.y += d.vy;
        if (d.op < 1) d.op = Math.min(1, d.op + 0.02);
      }
      draw();
      raf = requestAnimationFrame(step);
    }

    function draw() {
      const nodes = nodesRef.current;
      ctx.clearRect(0, 0, W, H);
      const selId = selectedRef.current;
      BAND_ORDER.forEach((k) => {
        const b = BANDS[k];
        const rMid = ((b.r0 + b.r1) / 2) * baseR * 0.5;
        ctx.beginPath(); ctx.arc(cx, cy, rMid, 0, Math.PI * 2);
        ctx.strokeStyle = cssv("--line-soft"); ctx.lineWidth = 1; ctx.setLineDash([2, 7]); ctx.stroke(); ctx.setLineDash([]);
      });
      nodes.forEach((d) => {
        let col: string, w: number, alpha: number;
        if (d.status === "confirmed") { col = cssv("--confirm"); w = 1.2; alpha = 0.55; }
        else if (d.status === "rejected") { col = cssv("--reject"); w = 1; alpha = 0.14; }
        else if (d.id === selId) { col = cssv("--accent"); w = 1.2; alpha = 0.6; }
        else { col = cssv("--ink-3"); w = 1; alpha = 0.3; }
        ctx.globalAlpha = alpha * d.op;
        const mx = (cx + d.x) / 2, my = (cy + d.y) / 2;
        const nx = d.y - cy, ny = cx - d.x, nl = Math.hypot(nx, ny) || 1, bend = 14;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(mx + (nx / nl) * bend, my + (ny / nl) * bend, d.x, d.y);
        ctx.strokeStyle = col; ctx.lineWidth = w;
        ctx.setLineDash(d.status === "candidate" ? [1, 5] : []);
        ctx.stroke(); ctx.setLineDash([]);
      });
      // inter-node edges: declared / verified cross-links between accounts
      const byId: Record<string, WorkNode> = {};
      nodes.forEach((n) => (byId[n.id] = n));
      nodes.forEach((d) => {
        if (!d.linkedIds) return;
        d.linkedIds.forEach((lid) => {
          if (d.id >= lid) return; // draw each pair once
          const e = byId[lid];
          if (!e) return;
          ctx.globalAlpha = 0.5 * Math.min(d.op, e.op);
          const mx = (d.x + e.x) / 2, my = (d.y + e.y) / 2;
          const nx = e.y - d.y, ny = d.x - e.x, nl = Math.hypot(nx, ny) || 1, bend = 18;
          ctx.beginPath(); ctx.moveTo(d.x, d.y);
          ctx.quadraticCurveTo(mx + (nx / nl) * bend, my + (ny / nl) * bend, e.x, e.y);
          ctx.strokeStyle = cssv("--accent"); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
          ctx.stroke(); ctx.setLineDash([]);
        });
      });
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fillStyle = cssv("--accent"); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.strokeStyle = cssv("--accent"); ctx.lineWidth = 1; ctx.stroke();
      ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = cssv("--ink-2"); ctx.font = "9px ui-monospace, monospace"; ctx.textAlign = "center";
      ctx.fillText("SEED", cx, cy + 44);
      ctx.fillStyle = cssv("--accent"); ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(seedRef.current || "—", cx, cy - 38);
      nodes.forEach((d) => {
        const el = elsRef.current[d.id];
        if (!el) return;
        el.style.left = d.x + "px"; el.style.top = d.y + "px"; el.style.opacity = String(d.op);
        el.classList.toggle("confirmed", d.status === "confirmed");
        el.classList.toggle("rejected", d.status === "rejected");
        el.classList.toggle("sel", d.id === selId);
      });
    }

    resize();
    rebuild(SIGNALS, false);
    step();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      themeObs.disconnect();
      bodiesEl.innerHTML = "";
    };
  }, []);

  function escapeHtml(s: string) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  }

  function setStatus(id: string, status: Status) {
    const n = nodesRef.current.find((x) => x.id === id);
    if (!n) return;
    n.status = status;
    setDataVersion((v) => v + 1);
  }

  async function runScan() {
    const u = seedRef.current.trim();
    if (!u || scanning) return;
    setScanning(true); setScanMsg("scan en cours…");
    try {
      const res = await fetch(`/api/scan?username=${encodeURIComponent(u)}`);
      const data = await res.json();
      if (!res.ok) { setScanMsg(data?.error || "scan failed"); return; }
      if (!data.signals?.length) { setScanMsg("no public presence found"); return; }
      rebuildRef.current(data.signals, true);
      setScanMsg(`${data.signals.length} real presence(s)`);
    } catch {
      setScanMsg("network unavailable");
    } finally {
      setScanning(false);
      setTimeout(() => setScanMsg(null), 4000);
    }
  }

  function currentSignals(): Signal[] {
    return nodesRef.current.map((n) => {
      const { x, y, vx, vy, op, a, ...s } = n; // strip physics fields
      return s;
    });
  }

  function saveCurrent() {
    const sigs = currentSignals();
    if (!sigs.length) return;
    const s = seedRef.current.trim() || "case";
    saveCase(s, s, s.includes("@") ? "email" : "username", sigs);
    setCases(listCases());
    setScanMsg("case saved");
    setTimeout(() => setScanMsg(null), 3000);
  }

  function openCase(id: string) {
    const c = loadCase(id);
    if (!c) return;
    setSeed(c.seed);
    rebuildRef.current(c.signals, true);
    setCasesOpen(false);
    setScanMsg(`loaded "${c.name}"`);
    setTimeout(() => setScanMsg(null), 3000);
  }

  function deleteCase(id: string) {
    removeCase(id);
    setCases(listCases());
  }

  return (
    <>
      <div id="stage">
        <canvas ref={canvasRef} />
        <div className="bodies" ref={bodiesRef} />
      </div>

      <div className="chrome">
        <div className="wordmark">TUSNA <small>ORBIT</small></div>
        <label className="seed-in">
          <span>seed</span>
          <input
            value={seed} spellCheck={false}
            onChange={(e) => setSeed(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runScan(); }}
            aria-label="seed"
          />
        </label>
        <div className="flex" />
        <div className="readout">
          {scanMsg && <span style={{ color: "var(--accent)" }}>{scanMsg}</span>}
          <span className="hide-sm"><span className="dotpulse" /><b>{total}</b> signals</span>
          <span><b style={{ color: "var(--confirm)" }}>{confirmedCount}</b> confirmed</span>
          <button className="btn" onClick={runScan} disabled={scanning}>{scanning ? "…" : "↻ SCAN"}</button>
          <button className="btn" onClick={saveCurrent}>SAVE</button>
          <div className="cases-wrap">
            <button className="btn" onClick={() => { setCases(listCases()); setCasesOpen((o) => !o); }}>
              CASES{cases.length ? ` (${cases.length})` : ""}
            </button>
            {casesOpen && (
              <div className="cases-pop">
                {cases.length === 0 && <div className="cases-empty">no saved case</div>}
                {cases.map((c) => (
                  <div className="case-row" key={c.id}>
                    <button className="case-open" onClick={() => openCase(c.id)}>
                      <span className="case-name">{c.name}</span>
                      <span className="case-meta">{c.signals.length} signals · {new Date(c.savedAt).toLocaleDateString()}</span>
                    </button>
                    <button className="case-del" onClick={() => deleteCase(c.id)} aria-label="delete">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="legend">
        {BAND_ORDER.map((k) => (
          <div className="l" key={k}><span className="tick" />{BANDS[k].label}</div>
        ))}
      </div>
      <div className="hint">seed&nbsp;· username <b>or email</b>&nbsp;&nbsp;/&nbsp;&nbsp;SCAN&nbsp;· 13 APIs + WhatsMyName + avatar pHash&nbsp;&nbsp;/&nbsp;&nbsp;click&nbsp;· evidence&nbsp;&nbsp;/&nbsp;&nbsp;drag&nbsp;· pull a body</div>

      <aside className={"inspector" + (selected ? " open" : "")} aria-hidden={!selected}>
        {selected && (
          <>
            <button className="insp-close" onClick={() => setSelectedId(null)} aria-label="close">✕</button>
            <div className="insp-plat">{selected.platform}</div>
            <div className="insp-handle">{selected.handle}</div>
            <div className="insp-score">
              <b style={{ color: selected.status === "rejected" ? "var(--reject)" : "var(--accent)" }}>{selected.confidence}</b>
              <span>CORRELATION<br />SCORE</span>
            </div>
            <div className="track">
              <i style={{ width: selected.confidence + "%", background: selected.status === "rejected" ? "var(--reject)" : "var(--accent)" }} />
            </div>
            <div className="sect">VERIFIED EVIDENCE</div>
            <div className="evs">
              {selected.evidence.map((e, idx) => (
                <div className="ev" key={idx}>
                  <div>
                    <div className="en">{e.name}</div>
                    <div className="ed">{e.detail}</div>
                    <div className="es">{e.source}</div>
                  </div>
                  <div className="ew">{e.weight}%</div>
                </div>
              ))}
            </div>
            <div className="grounded">
              <b>{selected.evidence.length} evidence items</b> tied to a verifiable source. The score aggregates only these
              signals — <b>no unsourced inference</b> is produced by the LLM.
            </div>
            <div className="verbs">
              <button className={"verb on-confirm" + (selected.status === "confirmed" ? " is-confirm" : "")} onClick={() => setStatus(selected.id, "confirmed")}>CONFIRM</button>
              <button className={"verb on-review" + (selected.status === "review" ? " is-review" : "")} onClick={() => setStatus(selected.id, "review")}>REVIEW</button>
              <button className={"verb on-reject" + (selected.status === "rejected" ? " is-reject" : "")} onClick={() => setStatus(selected.id, "rejected")}>REJECT</button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
