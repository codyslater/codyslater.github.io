"use client";

import { useEffect, useRef } from "react";

const NODES = [
  { x: 8, y: 8, color: "#ff2d78" },
  { x: 22, y: 6, color: "#39ff14" },
  { x: 14, y: 20, color: "#ff6a00" },
  { x: 26, y: 18, color: "#bf5af2" },
  { x: 6, y: 26, color: "#00e5ff" },
];

const EDGES = [
  [0, 1], [0, 2], [1, 3], [1, 2], [2, 3], [2, 4],
];

export function AnimatedFavicon() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeNodeRef = useRef(0);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    canvasRef.current = canvas;

    // Remove static favicon
    const existingIcon = document.querySelector("link[rel='icon']");
    if (existingIcon) existingIcon.remove();

    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    document.head.appendChild(link);

    function draw() {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, 32, 32);

      // Background
      ctx.fillStyle = "#0a0a0a";
      ctx.beginPath();
      ctx.roundRect(0, 0, 32, 32, 6);
      ctx.fill();

      // Edges
      for (const [a, b] of EDGES) {
        ctx.beginPath();
        ctx.moveTo(NODES[a].x, NODES[a].y);
        ctx.lineTo(NODES[b].x, NODES[b].y);
        ctx.strokeStyle = "rgba(136,136,136,0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Nodes
      const active = activeNodeRef.current;
      for (let i = 0; i < NODES.length; i++) {
        const n = NODES[i];
        const isActive = i === active;
        ctx.beginPath();
        ctx.arc(n.x, n.y, isActive ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.globalAlpha = isActive ? 1 : 0.6;
        if (isActive) {
          ctx.shadowColor = n.color;
          ctx.shadowBlur = 6;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      link.href = canvas.toDataURL("image/png");
    }

    draw();
    const interval = setInterval(() => {
      activeNodeRef.current = (activeNodeRef.current + 1) % NODES.length;
      draw();
    }, 1200);

    return () => {
      clearInterval(interval);
      link.remove();
    };
  }, []);

  return null;
}
