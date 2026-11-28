import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { BrochureSpec } from "./brochure-types";
import { foldPlan, hingeAngle, hingeProgress } from "@/lib/brochure/fold3d";

interface Props { spec: BrochureSpec; foldType: string; width: number; height: number }

const GAP = 0.012; // stacking gap between folded panels (scene units)
const SPEED = 0.9; // closure units per second for Fold/Open buttons

export default function FoldedLeaflet3D({ spec, foldType, width, height }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const target = useRef(0);
  const closure = useRef(0);
  const viewRef = useRef<(side: "front" | "back") => void>(() => {});
  const [ui, setUi] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current; if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); } catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8dde6, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(2, 3, 4); scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.7); rim.position.set(-2, 1, -4); scene.add(rim);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; controls.enableDamping = true; controls.minDistance = 1.5; controls.maxDistance = 9;

    const n = spec.panels.length;
    const H = 2;
    const sheetW = H * 1.5 * (n >= 4 ? 4 / 3 : 1);
    const widths = spec.panels.map((p) => p.widthFraction * sheetW);
    const loader = new THREE.TextureLoader();
    const disposables: { dispose: () => void }[] = [];
    const material = (url?: string, color?: string) => {
      const m = new THREE.MeshStandardMaterial({ color: color ?? "#ffffff", roughness: 0.85, side: THREE.FrontSide });
      if (url) loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; m.map = t; m.needsUpdate = true; disposables.push(t); });
      disposables.push(m); return m;
    };
    const plan = foldPlan(foldType, n);
    const maxSeq = Math.max(0, ...plan.hinges.map((h) => h.seq));
    const groups: THREE.Group[] = [];
    // Panel content: hinge sits at the group origin; content extends away from it.
    const buildPanel = (i: number, anchor: "left" | "right" | "center") => {
      const g = new THREE.Group();
      const w = widths[i];
      const geo = new THREE.PlaneGeometry(w, H); disposables.push(geo);
      const cx = anchor === "left" ? w / 2 : anchor === "right" ? -w / 2 : 0;
      const front = new THREE.Mesh(geo, material(spec.panels[i].front.imageUrl));
      front.position.x = cx; g.add(front);
      const back = new THREE.Mesh(geo, material(spec.panels[i].back.imageUrl, spec.panels[i].back.imageUrl ? undefined : "#f4f4f4"));
      back.rotation.y = Math.PI; back.position.x = cx; g.add(back);
      groups[i] = g; return g;
    };
    const root = buildPanel(plan.root, "center");
    const sheet = new THREE.Group(); sheet.add(root); scene.add(sheet);
    // Attach outward from the root so each flap carries its children.
    const ordered = [...plan.hinges].sort((a, b) => Math.abs(a.panel - plan.root) - Math.abs(b.panel - plan.root));
    for (const h of ordered) {
      const parent = groups[h.parent];
      const pw = widths[h.parent];
      const parentIsRoot = h.parent === plan.root;
      // hinge x in parent's local space
      const hx = h.edge === "right"
        ? (parentIsRoot ? -pw / 2 : -pw) // flap left of parent: parent's left edge
        : (parentIsRoot ? pw / 2 : pw);
      const g = buildPanel(h.panel, h.edge === "right" ? "right" : "left");
      g.position.x = hx; parent.add(g);
    }
    // Centre the sheet horizontally when flat.
    const leftW = widths.slice(0, plan.root).reduce((a, b) => a + b, 0) + widths[plan.root] / 2;
    const rightW = widths.slice(plan.root + 1).reduce((a, b) => a + b, 0) + widths[plan.root] / 2;
    const flatOffset = (leftW - rightW) / 2;

    const shadowGeo = new THREE.PlaneGeometry(1, 1); disposables.push(shadowGeo);
    const shadowTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d")!; const gr = x.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, "rgba(0,0,0,0.28)"); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); disposables.push(t); return t; })();
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }); disposables.push(shadowMat);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -H / 2 - 0.25; scene.add(shadow);

    const fitDistance = (w: number) => { const aspect = camera.aspect || 1; const vFov = (camera.fov * Math.PI) / 180; return Math.max(H / 0.9, w / aspect / 0.94) / (2 * Math.tan(vFov / 2)); };
    camera.position.set(0.6, 0.35, fitDistance(sheetW));
    viewRef.current = (side) => {
      const d = camera.position.length();
      camera.position.set(side === "front" ? 0.4 : -0.4, 0.3, side === "front" ? d : -d);
      controls.update();
    };

    const resize = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%"; camera.aspect = w / h; camera.updateProjectionMatrix(); camera.position.setLength(fitDistance(sheetW)); controls.update(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    camera.position.setLength(fitDistance(sheetW));

    let raf = 0, last = performance.now(), lastUi = -1;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      const c = closure.current, tg = target.current;
      if (c !== tg) closure.current = c < tg ? Math.min(tg, c + SPEED * dt) : Math.max(tg, c - SPEED * dt);
      const t = closure.current;
      for (const h of plan.hinges) {
        const g = groups[h.panel];
        if (!h.dir) { g.rotation.y = 0; g.position.z = 0; continue; }
        const p = hingeProgress(t, h.seq, maxSeq);
        g.rotation.y = hingeAngle(h.edge, h.dir, p);
        // Lift the hinge so stacked panels end up GAP apart instead of coplanar.
        g.position.z = (h.dir === "behind" ? -1 : 1) * h.seq * GAP * 0.5 * p;
      }
      // Recentre on the visible footprint as panels fold in.
      sheet.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      sheet.position.x = THREE.MathUtils.lerp(sheet.position.x, sheet.position.x - (box.min.x + box.max.x) / 2, 0.25);
      shadow.scale.set((box.max.x - box.min.x) * 1.15, Math.max(0.4, box.max.z - box.min.z + 0.6), 1);
      controls.update(); renderer.render(scene, camera);
      const r = Math.round(t * 100); if (r !== lastUi) { lastUi = r; setUi(r); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    el.dataset.sceneReady = "true";
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); disposables.forEach((d) => d.dispose()); renderer.dispose(); renderer.domElement.remove(); delete el.dataset.sceneReady; };
  }, [spec, foldType]);

  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground" style={{ width, height }}>
        <p>3D preview isn't supported on this device.</p>
      </div>
    );
  }

  const closed = ui >= 100;
  return (
    <div className="flex flex-col items-center gap-3" style={{ width, height }}>
      <div ref={host} data-testid="leaflet-3d" className="relative w-full flex-1 min-h-0 cursor-grab active:cursor-grabbing" aria-label="3D folded leaflet preview" role="img" />
      <div className="flex w-full max-w-md flex-col gap-2 px-2 pb-1">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-10">Open</span>
          <Slider aria-label="Fold amount" value={[ui]} min={0} max={100} step={1}
            onValueChange={([v]) => { target.current = v / 100; closure.current = v / 100; setUi(v); }} />
          <span className="text-xs text-muted-foreground w-10 text-right">Folded</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" onClick={() => { target.current = closed ? 0 : 1; }}>{closed ? "Unfold" : "Fold"}</Button>
          <Button size="sm" variant="outline" onClick={() => viewRef.current("front")}>Front</Button>
          <Button size="sm" variant="outline" onClick={() => viewRef.current("back")}>Back</Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">Drag to turn the leaflet · scroll to zoom</p>
      </div>
    </div>
  );
}
