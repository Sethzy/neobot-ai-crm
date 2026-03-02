/** Animated beam canvas background — green/sage theme, perf-optimised. */
"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface BeamsBackgroundProps {
  className?: string;
}

interface Beam {
  x: number;
  y: number;
  width: number;
  length: number;
  angle: number;
  speed: number;
  opacity: number;
  hue: number;
  pulse: number;
  pulseSpeed: number;
}

function createBeam(width: number, height: number): Beam {
  return {
    x: Math.random() * width * 1.5 - width * 0.25,
    y: Math.random() * height * 1.5 - height * 0.25,
    width: 60 + Math.random() * 100,
    length: height * 2.5,
    angle: -35 + Math.random() * 10,
    speed: 0.4 + Math.random() * 0.6,
    opacity: 0.2 + Math.random() * 0.15,
    hue: 165 + Math.random() * 15,
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: 0.015 + Math.random() * 0.025,
  };
}

/** Total beams — kept low for weak hardware. */
const BEAM_COUNT = 12;
/** Cap DPR to avoid oversized canvases on retina displays. */
const MAX_DPR = 1.5;

export function BeamsBackground({ className }: BeamsBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beamsRef = useRef<Beam[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    // Respect reduced-motion preference — skip animation entirely.
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReduced) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const updateSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      beamsRef.current = Array.from({ length: BEAM_COUNT }, () =>
        createBeam(w, h)
      );
    };

    updateSize();
    window.addEventListener("resize", updateSize);

    const w = () => canvas.width / Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const h = () => canvas.height / Math.min(window.devicePixelRatio || 1, MAX_DPR);

    function resetBeam(beam: Beam, index: number) {
      const spacing = w() / 3;
      const column = index % 3;

      beam.y = h() + 100;
      beam.x =
        column * spacing +
        spacing / 2 +
        (Math.random() - 0.5) * spacing * 0.5;
      beam.width = 60 + Math.random() * 100;
      beam.speed = 0.4 + Math.random() * 0.6;
      beam.hue = 165 + (index * 15) / BEAM_COUNT;
      beam.opacity = 0.2 + Math.random() * 0.15;
    }

    function drawBeam(beam: Beam) {
      ctx!.save();
      ctx!.translate(beam.x, beam.y);
      ctx!.rotate((beam.angle * Math.PI) / 180);

      const o = beam.opacity * (0.8 + Math.sin(beam.pulse) * 0.2);
      const gradient = ctx!.createLinearGradient(0, 0, 0, beam.length);
      gradient.addColorStop(0, `hsla(${beam.hue}, 50%, 55%, 0)`);
      gradient.addColorStop(0.1, `hsla(${beam.hue}, 50%, 55%, ${o * 0.5})`);
      gradient.addColorStop(0.4, `hsla(${beam.hue}, 50%, 55%, ${o})`);
      gradient.addColorStop(0.6, `hsla(${beam.hue}, 50%, 55%, ${o})`);
      gradient.addColorStop(0.9, `hsla(${beam.hue}, 50%, 55%, ${o * 0.5})`);
      gradient.addColorStop(1, `hsla(${beam.hue}, 50%, 55%, 0)`);

      ctx!.fillStyle = gradient;
      ctx!.fillRect(-beam.width / 2, 0, beam.width, beam.length);
      ctx!.restore();
    }

    function animate() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      // No ctx.filter blur — that reprocesses the full bitmap every frame on CPU.
      // CSS filter: blur() on the <canvas> is GPU-composited and essentially free.

      beamsRef.current.forEach((beam, i) => {
        beam.y -= beam.speed;
        beam.pulse += beam.pulseSpeed;

        if (beam.y + beam.length < -100) {
          resetBeam(beam, i);
        }

        drawBeam(beam);
      });

      rafRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      window.removeEventListener("resize", updateSize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ filter: "blur(40px)" }}
      />
    </div>
  );
}
