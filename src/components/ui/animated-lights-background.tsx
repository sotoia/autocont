"use client";
/**
 * Animated lights background — degradados radiales que se mueven como luces
 * de fondo con blur fuerte. Sin canvas 2D ni cortes — todo CSS keyframes.
 *
 * Reemplaza la versión vieja de canvas-shifted-stops que producía jank.
 * Soporta múltiples colores, velocidad ajustable, blend CSS.
 */
import * as React from "react";

export interface AnimatedLightsBackgroundProps {
  /** 2-6 hex colors */
  colors?: string[];
  /** velocidad relativa (segundos por ciclo aprox.) — más bajo = más rápido */
  speed?: number;
  /** opacidad del conjunto */
  opacity?: number;
  className?: string;
  style?: React.CSSProperties;
}

const DEFAULTS = ["#6ea8ff", "#ff6ea1", "#ffcf5c"];

export function AnimatedLightsBackground({
  colors = DEFAULTS,
  speed = 24,
  opacity = 1,
  className,
  style,
}: AnimatedLightsBackgroundProps) {
  // Genero entre 4 y 6 "luces" combinando los colores recibidos para que
  // cada una tenga trayectoria distinta. Reutilizo colores con módulo si son pocos.
  const list = React.useMemo(() => {
    const safe = (colors && colors.length > 0) ? colors : DEFAULTS;
    // Forzamos al menos 5 capas, repitiendo los colores
    const out: Array<{ color: string; dur: number; delay: number; startX: number; startY: number; size: number; path: number }> = [];
    const N = Math.max(5, safe.length);
    for (let i = 0; i < N; i++) {
      const color = safe[i % safe.length];
      out.push({
        color,
        // Duración de cada luz desincronizada (entre 1× y 1.8× del speed base)
        dur: speed * (1 + (i * 0.13) % 0.8),
        delay: -(i * speed * 0.21),
        startX: (17 + i * 23) % 100,
        startY: (29 + i * 37) % 100,
        size: 60 + ((i * 17) % 35),  // 60–95% del contenedor
        path: i % 4,                  // 4 trayectorias distintas
      });
    }
    return out;
  }, [colors, speed]);

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        opacity,
        // Color base sutil para que no se vea el fondo negro entre luces
        background: list[0]?.color ? `${list[0].color}08` : "transparent",
        ...style,
      }}
    >
      {list.map((light, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: `${light.startY}%`,
            left: `${light.startX}%`,
            width: `${light.size}%`,
            height: `${light.size}%`,
            transform: "translate(-50%, -50%)",
            background: `radial-gradient(circle, ${light.color} 0%, ${light.color}00 70%)`,
            filter: "blur(80px) saturate(140%)",
            mixBlendMode: "screen",
            opacity: 0.75,
            animation: `nd-light-${light.path} ${light.dur}s ease-in-out ${light.delay}s infinite`,
            willChange: "transform",
          }}
        />
      ))}

      <style>{`
        @keyframes nd-light-0 {
          0%, 100% { transform: translate(-50%, -50%) translate(0, 0); }
          25%      { transform: translate(-50%, -50%) translate(40vw, 10vh); }
          50%      { transform: translate(-50%, -50%) translate(30vw, 35vh); }
          75%      { transform: translate(-50%, -50%) translate(-10vw, 20vh); }
        }
        @keyframes nd-light-1 {
          0%, 100% { transform: translate(-50%, -50%) translate(0, 0); }
          33%      { transform: translate(-50%, -50%) translate(-35vw, 25vh); }
          66%      { transform: translate(-50%, -50%) translate(20vw, -25vh); }
        }
        @keyframes nd-light-2 {
          0%, 100% { transform: translate(-50%, -50%) translate(0, 0); }
          20%      { transform: translate(-50%, -50%) translate(20vw, -20vh); }
          50%      { transform: translate(-50%, -50%) translate(-25vw, -10vh); }
          80%      { transform: translate(-50%, -50%) translate(-15vw, 30vh); }
        }
        @keyframes nd-light-3 {
          0%, 100% { transform: translate(-50%, -50%) translate(0, 0); }
          50%      { transform: translate(-50%, -50%) translate(45vw, 30vh); }
        }
      `}</style>
    </div>
  );
}

export default AnimatedLightsBackground;
