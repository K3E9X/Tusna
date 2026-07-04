"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SIGNALS, SEED, BANDS, BAND_ORDER, type Signal, type Status } from "@/lib/signals";
import { listCases, saveCase, removeCase, caseToJSON, parseCase, backendMode, type Case } from "@/lib/cases";
import { BUILTIN_APPS, MANUAL_APPS, type AppDef } from "@/lib/registry";
import { loadEnabled, saveEnabled } from "@/lib/apps";
import { normId } from "@/lib/extract";

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
  const addNodeRef = useRef<(s: Signal) => void>(() => {});
  const mergeRef = useRef<(sigs: Signal[], originId: string, qkey: string) => number>(() => 0);
  const removeNodeRef = useRef<(id: string) => void>(() => {});
  const focusRef = useRef<string | null>(null);

  const [seed, setSeed] = useState(SEED);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [casesOpen, setCasesOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [addForm, setAddForm] = useState<{ platform: string; handle: string; url: string; via: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => { focusRef.current = focusId; }, [focusId]);
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(BUILTIN_APPS.map((a) => a.id)));
  const enabledRef = useRef(enabled);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { listCases().then(setCases).catch(() => {}); setEnabled(loadEnabled()); }, []);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  function toggleApp(id: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      saveEnabled(next);
      return next;
    });
  }

  function openTool(app: AppDef) {
    const s = encodeURIComponent(seedRef.current.trim());
    const url = app.url ? app.url.replace(/\{seed\}/g, s) : "#";
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openAddForm(via?: string, platform?: string) {
    setAddForm({ platform: platform || "", handle: "", url: "", via: via || "" });
    setAppsOpen(false);
  }

  function submitAdd() {
    if (!addForm) return;
    const platform = addForm.platform.trim();
    const handle = addForm.handle.trim();
    if (!platform || !handle) { flashMsg("platform & handle required"); return; }
    const key = (handle.replace(/^u\//, "") + platform).toLowerCase().replace(/[^a-z0-9]/g, "");
    const via = addForm.via.trim() || "manual pivot";
    const evidence = [{ name: "Added manually", detail: `Found via ${via} and added by the analyst — to confirm.`, source: addForm.url.trim() || "manual entry", weight: 60 }];
    const seedN = seedRef.current.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seedN && seedN === handle.replace(/^u\//, "").toLowerCase().replace(/[^a-z0-9]/g, "")) {
      evidence.push({ name: "Matches the seed", detail: "Handle equals the seed.", source: "correlation", weight: 78 });
    }
    addNodeRef.current({
      id: "manual:" + key, platform: platform.toUpperCase(), handle,
      disc: (platform.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "MN").toUpperCase(),
      confidence: 55, status: "review", evidence,
    });
    setAddForm(null);
    flashMsg("presence added");
  }

  function flashMsg(m: string) { setScanMsg(m); setTimeout(() => setScanMsg(null), 3000); }

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

    function makeEl(d: WorkNode) {
      const el = document.createElement("div");
      el.className = "body";
      el.dataset.kind = d.kind || "platform";
      const discContent = d.kind === "email" ? "✉" : d.kind === "alias" ? "~" : d.disc;
      el.innerHTML = `<div class="disc">${discContent}</div><div class="tag">${escapeHtml(d.handle)}</div><div class="conf">${d.confidence}%</div>`;
      bodiesEl.appendChild(el);
      elsRef.current[d.id] = el;
      attachDrag(el, d);
      el.addEventListener("contextmenu", (e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: d.id }); });
      return el;
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
        makeEl(d);
        if (spawn) setTimeout(() => { const a = Math.random() * Math.PI * 2; const edge = Math.max(W, H) * 0.7; d.x = cx + Math.cos(a) * edge; d.y = cy + Math.sin(a) * edge; d.op = 0; }, i * 110);
      });
      setSelectedId(null);
      setDataVersion((v) => v + 1);
    }
    rebuildRef.current = rebuild;

    // append a single node into the live sim (used by "add presence")
    function addNode(s: Signal) {
      if (nodesRef.current.some((n) => n.id === s.id)) return; // no dup
      const a = Math.random() * Math.PI * 2;
      const edge = Math.max(W, H) * 0.7;
      const d: WorkNode = { ...s, a, x: cx + Math.cos(a) * edge, y: cy + Math.sin(a) * edge, vx: 0, vy: 0, op: 0 };
      nodesRef.current.push(d);
      makeEl(d);
      setDataVersion((v) => v + 1);
      setSelectedId(s.id);
    }
    addNodeRef.current = addNode;

    // merge a rescan's results into the live board, linked to the pivoted node
    function mergeNodes(sigs: Signal[], originId: string, qkey: string) {
      const nk = (s: { platform: string; handle: string }) =>
        s.platform.toLowerCase().replace(/[^a-z0-9]/g, "") + "|" + s.handle.replace(/^u\//, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
      const byKey = new Map(nodesRef.current.map((n) => [nk(n), n]));
      const remap: Record<string, string> = {};
      for (const s of sigs) {
        const k = nk(s);
        remap[s.id] = byKey.has(k) ? byKey.get(k)!.id : "pv:" + qkey + ":" + s.id;
      }
      const link = (aId: string, bId: string) => {
        const A = byId.get(aId), B = byId.get(bId);
        if (!A || !B || aId === bId) return;
        A.linkedIds = A.linkedIds || []; B.linkedIds = B.linkedIds || [];
        if (!A.linkedIds.includes(bId)) A.linkedIds.push(bId);
        if (!B.linkedIds.includes(aId)) B.linkedIds.push(aId);
      };
      const origin = byId.get(originId);
      const ox = origin ? origin.x : cx, oy = origin ? origin.y : cy;
      let added = 0;
      for (const s of sigs) {
        const fid = remap[s.id];
        if (!byId.has(fid)) {
          const ang = Math.random() * Math.PI * 2, r = 55 + Math.random() * 45;
          const d: WorkNode = {
            ...s, id: fid, linkedIds: (s.linkedIds || []).map((x) => remap[x] || x),
            a: ang, x: ox + Math.cos(ang) * r, y: oy + Math.sin(ang) * r, vx: 0, vy: 0, op: 0,
          };
          nodesRef.current.push(d); byId.set(fid, d); makeEl(d); added++;
        }
        link(originId, fid);
        for (const lid of s.linkedIds || []) link(fid, remap[lid] || lid);
      }
      setDataVersion((v) => v + 1);
      return added;
    }
    mergeRef.current = mergeNodes;

    function removeNode(id: string) {
      const i = nodesRef.current.findIndex((n) => n.id === id);
      if (i < 0) return;
      nodesRef.current.splice(i, 1);
      const el = elsRef.current[id];
      if (el) { el.remove(); delete elsRef.current[id]; }
      setSelectedId((cur) => (cur === id ? null : cur));
      setDataVersion((v) => v + 1);
    }
    removeNodeRef.current = removeNode;

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
      // focus mode: dim everything not linked to the focused node
      let keep: Set<string> | null = null;
      if (focusRef.current) {
        const fn = nodes.find((n) => n.id === focusRef.current);
        keep = new Set([focusRef.current, ...(fn?.linkedIds || [])]);
      }
      const dim = (id: string) => (keep && !keep.has(id) ? 0.1 : 1);
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
        ctx.globalAlpha = alpha * d.op * dim(d.id);
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
          ctx.globalAlpha = 0.5 * Math.min(d.op, e.op) * Math.min(dim(d.id), dim(e.id));
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
        el.style.left = d.x + "px"; el.style.top = d.y + "px"; el.style.opacity = String(d.op * dim(d.id));
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
    setScanning(true); setScanMsg("scanning…");
    try {
      const cids = [...enabledRef.current].join(",");
      const res = await fetch(`/api/scan?username=${encodeURIComponent(u)}&connectors=${encodeURIComponent(cids)}`);
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

  async function pivotOn(node: Signal) {
    // pivot query: the email value, or the handle stripped of @ / u/
    const q = node.handle.replace(/^@/, "").replace(/^u\//, "").trim();
    if (!q || scanning) return;
    setScanning(true); setScanMsg(`pivoting on ${q}…`);
    try {
      const cids = [...enabledRef.current].join(",");
      const res = await fetch(`/api/scan?username=${encodeURIComponent(q)}&connectors=${encodeURIComponent(cids)}`);
      const data = await res.json();
      if (!res.ok || !data.signals?.length) { setScanMsg("nothing new to pivot"); return; }
      mergeRef.current(data.signals, node.id, normId(q));
      setScanMsg(`+ hop from ${q} (${data.signals.length})`);
    } catch {
      setScanMsg("network unavailable");
    } finally {
      setScanning(false);
      setTimeout(() => setScanMsg(null), 4000);
    }
  }

  async function autoExpand(startNode: Signal) {
    if (scanning) return;
    const MAX_HOPS = 2, CAP = 40, BREADTH = 5;
    const visited = new Set<string>();
    const scanOne = async (q: string, originId: string): Promise<number> => {
      const cids = [...enabledRef.current].join(",");
      const res = await fetch(`/api/scan?username=${encodeURIComponent(q)}&connectors=${encodeURIComponent(cids)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.signals?.length) return 0;
      return mergeRef.current(data.signals, originId, normId(q));
    };
    setScanning(true);
    try {
      let frontier = [{ id: startNode.id, q: startNode.handle.replace(/^@/, "").replace(/^u\//, "").trim() }];
      let total = 0;
      for (let hop = 1; hop <= MAX_HOPS && total < CAP; hop++) {
        setScanMsg(`auto-expand · hop ${hop}…`);
        for (const f of frontier) {
          if (total >= CAP) break;
          const qk = normId(f.q);
          if (!f.q || visited.has(qk)) continue;
          visited.add(qk);
          total += await scanOne(f.q, f.id);
        }
        // next hop: newly discovered email/alias identifiers not yet pivoted
        frontier = nodesRef.current
          .filter((n) => n.kind === "email" || n.kind === "alias")
          .map((n) => ({ id: n.id, q: n.handle.replace(/^@/, "").trim() }))
          .filter((f) => f.q && !visited.has(normId(f.q)))
          .slice(0, BREADTH);
        if (!frontier.length) break;
      }
      setScanMsg(`auto-expand done · +${total}`);
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

  async function saveCurrent() {
    const sigs = currentSignals();
    if (!sigs.length) return;
    const s = seedRef.current.trim() || "case";
    await saveCase(s, s, s.includes("@") ? "email" : "username", sigs);
    setCases(await listCases());
    flashMsg(backendMode() === "server" ? "case saved (server)" : "case saved (local)");
  }

  function openCase(c: Case) {
    setSeed(c.seed);
    rebuildRef.current(c.signals, true);
    setCasesOpen(false);
    flashMsg(`loaded "${c.name}"`);
  }

  async function deleteCase(id: string) {
    await removeCase(id);
    setCases(await listCases());
  }

  function exportCurrent() {
    const sigs = currentSignals();
    if (!sigs.length) return;
    const s = seedRef.current.trim() || "case";
    const c: Case = { id: "export", name: s, seed: s, mode: s.includes("@") ? "email" : "username", savedAt: Date.now(), signals: sigs };
    const blob = new Blob([caseToJSON(c)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tusna-case-${s.replace(/[^\w.@-]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flashMsg("case exported");
  }

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const text = await f.text();
    const c = parseCase(text);
    if (!c) { flashMsg("invalid case file"); return; }
    setSeed(c.seed);
    rebuildRef.current(c.signals, true);
    setCasesOpen(false);
    flashMsg(`imported "${c.name}"`);
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
          <button className="btn" onClick={exportCurrent}>EXPORT</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>IMPORT</button>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={importFile} style={{ display: "none" }} />
          <button className="btn" onClick={() => openAddForm()}>+ NODE</button>
          <div className="cases-wrap">
            <button className="btn" onClick={() => setAppsOpen((o) => !o)}>
              APPS ({[...enabled].filter((id) => BUILTIN_APPS.some((a) => a.id === id)).length}/{BUILTIN_APPS.length})
            </button>
            {appsOpen && (
              <div className="apps-pop">
                <div className="cases-head">connectors — toggle to include in the scan</div>
                {BUILTIN_APPS.map((a) => (
                  <div className="app-row" key={a.id}>
                    <button className={"app-toggle" + (enabled.has(a.id) ? " on" : "")} onClick={() => toggleApp(a.id)} aria-label="toggle">
                      <span className="app-sw" />
                    </button>
                    <div className="app-info">
                      <span className="app-name">{a.name} <em>{a.category}</em></span>
                      <span className="app-desc">{a.desc}</span>
                    </div>
                  </div>
                ))}
                <div className="cases-head">manual pivots (cipher387) — add &amp; open with the seed</div>
                {MANUAL_APPS.map((a) => (
                  <div className="app-row" key={a.id}>
                    <button className={"app-add" + (enabled.has(a.id) ? " added" : "")} onClick={() => toggleApp(a.id)}>
                      {enabled.has(a.id) ? "✓" : "+"}
                    </button>
                    <div className="app-info">
                      <span className="app-name">{a.name} <em>{a.category}</em> <b className={"app-badge " + a.status}>{a.status}</b></span>
                      <span className="app-desc">{a.desc}</span>
                    </div>
                    {enabled.has(a.id) && <button className="app-open" onClick={() => openTool(a)} aria-label="open">↗</button>}
                    {enabled.has(a.id) && <button className="app-open" onClick={() => openAddForm(a.name)} aria-label="add result" title="add a result to the board">＋</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="cases-wrap">
            <button className="btn" onClick={async () => { setCases(await listCases()); setCasesOpen((o) => !o); }}>
              CASES{cases.length ? ` (${cases.length})` : ""}
            </button>
            {casesOpen && (
              <div className="cases-pop">
                <div className="cases-head">stored: {backendMode() || "…"}</div>
                {cases.length === 0 && <div className="cases-empty">no saved case</div>}
                {cases.map((c) => (
                  <div className="case-row" key={c.id}>
                    <button className="case-open" onClick={() => openCase(c)}>
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

      {addForm && (
        <div className="add-overlay" onClick={() => setAddForm(null)}>
          <div className="add-card" onClick={(e) => e.stopPropagation()}>
            <div className="add-title">ADD PRESENCE{addForm.via ? <em> · via {addForm.via}</em> : null}</div>
            <label className="add-field"><span>platform</span>
              <input autoFocus value={addForm.platform} placeholder="e.g. INSTAGRAM" onChange={(e) => setAddForm({ ...addForm, platform: e.target.value })} />
            </label>
            <label className="add-field"><span>handle</span>
              <input value={addForm.handle} placeholder="e.g. john.doe" onChange={(e) => setAddForm({ ...addForm, handle: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); }} />
            </label>
            <label className="add-field"><span>url (optional)</span>
              <input value={addForm.url} placeholder="https://…" onChange={(e) => setAddForm({ ...addForm, url: e.target.value })} />
            </label>
            <div className="add-actions">
              <button className="btn" onClick={() => setAddForm(null)}>CANCEL</button>
              <button className="btn add-primary" onClick={submitAdd}>ADD TO BOARD</button>
            </div>
          </div>
        </div>
      )}

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
            <div className="pivot-row">
              <button className="pivot-btn" onClick={() => pivotOn(selected)} disabled={scanning}>⌖ PIVOT</button>
              <button className="pivot-btn" onClick={() => autoExpand(selected)} disabled={scanning}>⇲ AUTO-EXPAND · 2 hops</button>
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

      {menu && (() => {
        const n = nodesRef.current.find((x) => x.id === menu.id);
        if (!n) return null;
        const q = n.handle.replace(/^@/, "").replace(/^u\//, "");
        return (
          <>
            <div className="ctx-backdrop" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
            <div className="ctx-menu" style={{ left: Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 200), top: menu.y }}>
              <div className="ctx-head">{n.platform}</div>
              <button onClick={() => { setSelectedId(n.id); setMenu(null); }}>Inspect evidence</button>
              <button onClick={() => { setMenu(null); pivotOn(n); }}>⌖ Pivot</button>
              <button onClick={() => { setMenu(null); autoExpand(n); }}>⇲ Auto-expand · 2 hops</button>
              {n.url && <button onClick={() => { window.open(n.url, "_blank", "noopener,noreferrer"); setMenu(null); }}>↗ Open profile</button>}
              <button onClick={() => { seedRef.current = q; setSeed(q); setMenu(null); runScan(); }}>◎ Set as seed &amp; rescan</button>
              <button onClick={() => { setFocusId((f) => (f === n.id ? null : n.id)); setMenu(null); }}>◍ Focus sub-graph</button>
              <button className="ctx-danger" onClick={() => { removeNodeRef.current(n.id); setMenu(null); }}>✕ Remove</button>
            </div>
          </>
        );
      })()}

      {focusId && (
        <button className="focus-chip" onClick={() => setFocusId(null)}>◍ focus active · clear</button>
      )}
    </>
  );
}
