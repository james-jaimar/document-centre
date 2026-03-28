import type { BindingType } from "./previewTypes";

interface BindingSpineProps {
  bindingType: BindingType;
  height: number;
}

export default function BindingSpine({ bindingType, height }: BindingSpineProps) {
  if (bindingType === "none") return null;

  const isSpiral = bindingType === "coil" || bindingType === "wire" || bindingType === "comb";

  if (isSpiral) {
    // Spiral/coil/comb binding — render individual rings down the spine
    const ringSpacing = bindingType === "comb" ? 24 : 18;
    const ringCount = Math.max(4, Math.floor((height - 40) / ringSpacing));
    const topPadding = 20;

    return (
      <div
        className="absolute top-0 left-1/2 z-30 pointer-events-none"
        style={{
          transform: "translateX(-50%)",
          width: 28,
          height,
        }}
      >
        {/* Shadow groove under the spine */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.12) 100%)",
          }}
        />

        {/* Individual rings */}
        {Array.from({ length: ringCount }).map((_, i) => {
          const y = topPadding + i * ringSpacing;

          if (bindingType === "comb") {
            // Comb binding: rectangular teeth
            return (
              <div
                key={i}
                className="absolute left-1/2"
                style={{
                  top: y,
                  transform: "translateX(-50%)",
                  width: 18,
                  height: 8,
                  borderRadius: 2,
                  background: "linear-gradient(180deg, hsl(0 0% 15%) 0%, hsl(0 0% 25%) 50%, hsl(0 0% 15%) 100%)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
                }}
              />
            );
          }

          // Wire/coil: circular rings with metallic gradient
          return (
            <div
              key={i}
              className="absolute left-1/2"
              style={{
                top: y,
                transform: "translateX(-50%)",
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "radial-gradient(circle at 35% 35%, hsl(0 0% 85%) 0%, hsl(0 0% 65%) 40%, hsl(0 0% 50%) 70%, hsl(0 0% 40%) 100%)",
                border: "1.5px solid hsl(0 0% 55%)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.3)",
              }}
            >
              {/* Inner hole */}
              <div
                className="absolute left-1/2 top-1/2"
                style={{
                  transform: "translate(-50%, -50%)",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, hsl(0 0% 20%) 0%, hsl(0 0% 30%) 100%)",
                }}
              />
            </div>
          );
        })}
      </div>
    );
  }

  // Saddle stitch or perfect bound — subtle crease/groove
  const spineWidth = bindingType === "perfect" ? 10 : 6;

  return (
    <div
      className="absolute top-0 left-1/2 z-20 pointer-events-none"
      style={{
        transform: "translateX(-50%)",
        width: spineWidth,
        height,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            bindingType === "saddle"
              ? "linear-gradient(90deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.06) 100%)"
              : "linear-gradient(90deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.08) 100%)",
        }}
      />

      {/* Saddle stitch marks */}
      {bindingType === "saddle" && (
        <div className="absolute inset-0 flex flex-col justify-evenly items-center py-8">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="bg-muted-foreground/40"
              style={{ width: 2, height: 12, borderRadius: 1 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
