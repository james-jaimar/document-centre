import type { BindingType } from "./previewTypes";

interface BindingSpineProps {
  bindingType: BindingType;
  height: number;
}

export default function BindingSpine({ bindingType, height }: BindingSpineProps) {
  if (bindingType === "none") return null;

  // Base spine styles — a subtle vertical groove at the center seam
  const spineWidth = bindingType === "coil" || bindingType === "comb" ? 20 : 8;

  return (
    <div
      className="absolute top-0 left-1/2 z-20 pointer-events-none"
      style={{
        transform: "translateX(-50%)",
        width: spineWidth,
        height,
      }}
    >
      {/* Shadow groove */}
      <div
        className="absolute inset-0"
        style={{
          background:
            bindingType === "coil" || bindingType === "comb"
              ? "linear-gradient(90deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.3) 70%, rgba(0,0,0,0.15) 100%)"
              : bindingType === "saddle"
              ? "linear-gradient(90deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.08) 100%)"
              : "linear-gradient(90deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.1) 100%)",
        }}
      />

      {/* Coil / comb rings */}
      {(bindingType === "coil" || bindingType === "comb") && (
        <div className="absolute inset-0 flex flex-col justify-evenly items-center py-4">
          {Array.from({ length: Math.max(3, Math.floor(height / 30)) }).map((_, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: bindingType === "coil" ? 10 : 12,
                height: bindingType === "coil" ? 10 : 6,
                background:
                  bindingType === "coil"
                    ? "radial-gradient(circle, hsl(0 0% 70%) 40%, hsl(0 0% 50%) 100%)"
                    : "hsl(0 0% 20%)",
                border: bindingType === "coil" ? "1px solid hsl(0 0% 60%)" : "none",
                borderRadius: bindingType === "comb" ? 2 : "50%",
              }}
            />
          ))}
        </div>
      )}

      {/* Saddle stitch marks */}
      {bindingType === "saddle" && (
        <div className="absolute inset-0 flex flex-col justify-evenly items-center py-8">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="w-[2px] bg-muted-foreground/40"
              style={{ height: 12, borderRadius: 1 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
