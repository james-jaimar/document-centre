import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Button } from "@/components/ui/button";
import { resolveUrls } from "@/lib/thumbnailUtils";
import type { SpineResult } from "@/lib/perfectBinding/spine";
import { SPINE_FONTS, placementFrame, thumbnailCrop, containInFrame, type PdfBoxes, type CoverPlacement, type SpineFont } from "@/lib/perfectBinding/workflow";

interface Props {
  frontBoxes?: PdfBoxes; backBoxes?: PdfBoxes;
  frontPath?: string; backPath?: string; wrapPath?: string;
  spine: SpineResult; trimMm: { widthMm: number; heightMm: number };
  title?: string; spineColor?: string; textColor?: string; bleedMm?: number;
  mono?: boolean; maxHeightPx?: number;
  frontPlacement?: CoverPlacement; backPlacement?: CoverPlacement; backBlank?: "white" | "spine"; spineFont?: SpineFont;
}
export default function PerfectBoundBook3D({ frontPath, backPath, wrapPath, spine, trimMm, title, spineColor, textColor, bleedMm = 3, mono, frontPlacement, backPlacement, backBlank, spineFont = "sans", frontBoxes, backBoxes }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const changeView = useRef<(view: string) => void>(() => {});
  useEffect(() => {
    const el = host.current; if (!el) return;
    const css = getComputedStyle(el);
    const token = (name: string) => `hsl(${css.getPropertyValue(name).trim()})`;
    const paper = new THREE.Color(token("--background"));
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; controls.minDistance = 3; controls.maxDistance = 7;
    const w = 2 * trimMm.widthMm / trimMm.heightMm, h = 2, d = Math.max(.015, 2 * spine.spineMm / trimMm.heightMm);
    const materials = Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial({ color: paper }));
    materials[1].color.set(spineColor ?? token("--primary"));
    const geometry = new THREE.BoxGeometry(w, h, d);
    scene.add(new THREE.Mesh(geometry, materials));
    let alive = true;
    const textures: THREE.Texture[] = [];
    const texture = (canvas: HTMLCanvasElement, face: number) => {
      const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace;
      textures.push(t); materials[face].map = t; materials[face].color.set("white"); materials[face].needsUpdate = true;
    };
    const blank = (width: number, height: number) => { const c = document.createElement("canvas"); c.width = width; c.height = height; return c; };
    const spineCanvas = blank(128, 1600), ctx = spineCanvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = spineColor ?? token("--primary"); ctx.fillRect(0, 0, 128, 1600);
      if (spine.textAllowed && title) {
        ctx.translate(64, 800); ctx.rotate(Math.PI / 2); ctx.fillStyle = textColor ?? token("--primary-foreground");
        const f = SPINE_FONTS[spineFont] ?? SPINE_FONTS.sans; ctx.font = `${f.weight} 60px ${f.family}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(title, 0, 0, 1380);
      }
      texture(spineCanvas, 1);
    }
    if (backBlank) {
      const c = blank(16, 16), bctx = c.getContext("2d");
      if (bctx) { bctx.fillStyle = backBlank === "spine" ? spineColor ?? token("--primary") : "#FFFFFF"; bctx.fillRect(0, 0, 16, 16); texture(c, 5); }
    }
    void resolveUrls([frontPath ?? "", backBlank ? "" : backPath ?? "", wrapPath ?? ""]).then(async (urls) => {
      for (const [index, url] of urls.entries()) {
        if (!url) continue;
        const img = new Image(); img.crossOrigin = "anonymous";
        try { await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = url; }); } catch { continue; }
        if (!alive) return;
        const paint = (face: number, x: number, y: number, cw: number, ch: number) => {
          const canvas = blank(face === 1 ? 128 : 1000, 1600), c = canvas.getContext("2d");
          if (!c) return; c.filter = mono ? "grayscale(1)" : "none";
          c.drawImage(img, x, y, cw, ch, 0, 0, canvas.width, canvas.height); texture(canvas, face);
        };
        if (index === 2) {
          const totalW = 2 * trimMm.widthMm + spine.spineMm + 2 * bleedMm;
          const totalH = trimMm.heightMm + 2 * bleedMm;
          const sx = img.width / totalW, sy = img.height / totalH;
          paint(5, bleedMm * sx, bleedMm * sy, trimMm.widthMm * sx, trimMm.heightMm * sy);
          paint(1, (bleedMm + trimMm.widthMm) * sx, bleedMm * sy, spine.spineMm * sx, trimMm.heightMm * sy);
          paint(4, (bleedMm + trimMm.widthMm + spine.spineMm) * sx, bleedMm * sy, trimMm.widthMm * sx, trimMm.heightMm * sy);
        } else {
          // Same frame maths as the flat view and the print server: artwork fills trim + bleed, then moves/zooms.
          const canvas = blank(1000, 1600), c = canvas.getContext("2d");
          if (!c) continue;
          const crop = thumbnailCrop(img.width, img.height, index === 0 ? frontBoxes : backBoxes);
          const f = containInFrame(placementFrame(trimMm, bleedMm, index === 0 ? frontPlacement : backPlacement), (img.width * crop.w) / (img.height * crop.h));
          const px = canvas.width / trimMm.widthMm, py = canvas.height / trimMm.heightMm;
          c.fillStyle = "#FFFFFF"; c.fillRect(0, 0, canvas.width, canvas.height);
          c.filter = mono ? "grayscale(1)" : "none";
          c.drawImage(img, crop.x * img.width, crop.y * img.height, crop.w * img.width, crop.h * img.height, f.left * px, f.top * py, f.width * px, f.height * py);
          texture(canvas, index === 0 ? 4 : 5);
        }
      }
    }).catch(() => {});
    changeView.current = (v) => {
      const distance = camera.aspect < 1 ? 4.8 : 4;
      camera.position.set(v === "spine" ? -distance : v === "front" ? -.8 : .8, .15, v === "spine" ? .05 : v === "back" ? -distance : distance);
      controls.target.set(0, 0, 0); controls.update();
    };
    const resize = () => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); changeView.current("front"); };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    let frame = 0;
    const draw = () => { if (!alive) return; controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(draw); }; draw();
    return () => { alive = false; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); geometry.dispose(); materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose()); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, [frontPath, backPath, wrapPath, spine.spineMm, spine.textAllowed, trimMm.widthMm, trimMm.heightMm, title, spineColor, textColor, bleedMm, mono, backBlank, spineFont, frontPlacement?.x, frontPlacement?.y, frontPlacement?.scale, backPlacement?.x, backPlacement?.y, backPlacement?.scale, frontBoxes, backBoxes]);
  return <div className="flex h-full min-h-0 w-full flex-col gap-3">
    <div ref={host} className="min-h-[360px] w-full flex-1 touch-none" role="img" aria-label="Rotatable book cover preview" />
    <div className="flex justify-center gap-2">{["front", "spine", "back"].map((v) => <Button key={v} variant="outline" size="sm" className="capitalize" onClick={() => changeView.current(v)}>{v}</Button>)}</div>
    <p className="text-center text-xs text-muted-foreground">Spine {spine.spineMm} mm · {spine.sheets} sheets</p>
  </div>;
}
