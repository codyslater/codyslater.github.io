"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  generateGraph,
  getOutNeighbors,
  findClosestNode,
  findClosestEdge,
  isInExclusionZone,
  lerpColor,
  CLUSTERS,
  type GraphNode,
  type GraphEdge,
  type Signal,
} from "@/lib/graph";

const GRAY = "#888888";
const SIGNAL_MATURITY_COUNT = 10;

const MAX_ACTIVE_SIGNALS = 40;
const SIGNAL_SPEED = 0.012;
const SIGNAL_COLOR = "#888888";

// Ambient: 1 random node fires every 3-5s
const AMBIENT_MIN = 3000;
const AMBIENT_MAX = 5000;

interface GraphCanvasProps {
  revealProgress: number; // 0-1, drives the radial sweep
  onRevealComplete?: () => void;
  opacity?: number;
}

export function GraphCanvas({ revealProgress, onRevealComplete, opacity = 1 }: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const signalsRef = useRef<Signal[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const dragRef = useRef<{
    isDragging: boolean;
    nodeIndex: number;
    startX: number;
    startY: number;
    hasMoved: boolean;
  }>({ isDragging: false, nodeIndex: -1, startX: 0, startY: 0, hasMoved: false });
  const animFrameRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });
  const revealCompleteCalledRef = useRef(false);
  const pulseMapRef = useRef(new Map<number, number>());
  const nodeCooldownRef = useRef(new Map<number, number>());
  const signalHistoryRef = useRef(new Map<number, { counts: Map<string, number>; total: number }>());
  const opacityRef = useRef(opacity);

  // Sweep state: tracks which nodes the radial sweep has already activated
  const sweptNodesRef = useRef(new Set<number>());
  const maxDistRef = useRef(0); // diagonal distance for normalizing sweep

  // Ambient fire timer
  const nextAmbientRef = useRef(0);

  // Hover-to-fire cooldown per node
  const hoverFireCooldownRef = useRef(new Map<number, number>());

  // Quiet mode: spacebar silences ambient + cascade for 30s (hover signals still propagate)
  const quietUntilRef = useRef(0);

  // Sync opacity prop
  useEffect(() => {
    opacityRef.current = opacity;
    const canvas = canvasRef.current;
    if (canvas) canvas.style.opacity = String(opacity);
  }, [opacity]);

  // Initialize graph
  const initGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    sizeRef.current = { w, h };

    const { nodes, edges } = generateGraph(w, h);
    nodesRef.current = nodes;
    edgesRef.current = edges;
    signalsRef.current = [];
    revealCompleteCalledRef.current = false;
    pulseMapRef.current.clear();
    nodeCooldownRef.current.clear();
    signalHistoryRef.current.clear();
    sweptNodesRef.current.clear();
    hoverFireCooldownRef.current.clear();

    // Compute max distance from center for sweep normalization
    maxDistRef.current = Math.sqrt((w / 2) ** 2 + (h / 2) ** 2);

    // Schedule first ambient fire
    nextAmbientRef.current = performance.now() + AMBIENT_MIN + Math.random() * (AMBIENT_MAX - AMBIENT_MIN);
  }, []);

  // Fire signals from a node along outgoing edges
  const fireSignals = useCallback((nodeIndex: number, guaranteed = false, userTriggered = false) => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const node = nodes[nodeIndex];
    if (!node) return;

    const outNeighbors = getOutNeighbors(nodeIndex, edges);
    for (const ni of outNeighbors) {
      if (guaranteed || Math.random() < node.cascadeProb) {
        const edgeIndex = edges.findIndex(
          (e) => e.opacity > 0 && e.from === nodeIndex && e.to === ni,
        );
        if (edgeIndex < 0) continue;
        if (signalsRef.current.length >= MAX_ACTIVE_SIGNALS) break;

        signalsRef.current.push({
          edgeIndex,
          from: nodeIndex,
          to: ni,
          progress: 0,
          speed: SIGNAL_SPEED,
          glowProgress: 0,
          userTriggered,
        });
      }
    }
  }, []);

  // Animation loop
  useEffect(() => {
    initGraph();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function animate() {
      if (!ctx || !canvas) return;

      const dpr = window.devicePixelRatio || 1;
      const { w, h } = sizeRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const signals = signalsRef.current;
      const mouse = mouseRef.current;
      const pulseMap = pulseMapRef.current;
      const now = performance.now();

      // All nodes always visible
      const visibleEdgeSet = new Set<number>();
      for (let i = 0; i < edges.length; i++) {
        if (edges[i].opacity > 0) visibleEdgeSet.add(i);
      }

      // Fade out dying edges
      for (const edge of edges) {
        if (edge.opacity > 0 && edge.opacity < 1) {
          edge.opacity = Math.max(0, edge.opacity - 0.02);
        }
      }

      // Build signal edge map for glow drawing
      const signalEdges = new Map<number, Signal>();
      for (const sig of signals) {
        signalEdges.set(sig.edgeIndex, sig);
      }

      // Draw edges
      for (let i = 0; i < edges.length; i++) {
        if (!visibleEdgeSet.has(i) && edges[i].opacity >= 1) continue;
        const e = edges[i];
        if (e.opacity <= 0) continue;
        const a = nodes[e.from];
        const b = nodes[e.to];

        const activeSig = signalEdges.get(i);
        if (activeSig) {
          const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          const front = activeSig.progress;

          // Fixed pixel wave size regardless of edge length
          const edgeDx = b.x - a.x;
          const edgeDy = b.y - a.y;
          const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
          const WAVE_PX = 30; // uniform wave size in pixels
          const spreadBefore = edgeLen > 0 ? WAVE_PX / edgeLen : 0.15;
          const spreadAfter = edgeLen > 0 ? (WAVE_PX * 0.6) / edgeLen : 0.1;

          const dim = `rgba(136, 136, 136, ${0.08 * e.opacity})`;
          grad.addColorStop(0, dim);
          if (front - spreadBefore > 0) {
            grad.addColorStop(Math.max(0, front - spreadBefore), dim);
          }
          grad.addColorStop(Math.min(1, Math.max(0, front)), SIGNAL_COLOR);
          if (front + spreadAfter < 1) {
            grad.addColorStop(Math.min(1, front + spreadAfter), dim);
          }
          grad.addColorStop(1, dim);

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.5;
          ctx.shadowColor = SIGNAL_COLOR;
          ctx.shadowBlur = 6;
          ctx.globalAlpha = 0.9 * e.opacity;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        } else {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(136, 136, 136, ${0.15 * e.opacity})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      // Draw nodes
      const PULSE_TOTAL = 25;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.x < -9000) continue;
        const dx = node.x - mouse.x;
        const dy = node.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const hoverBrightness = dist < 80 ? 1 - dist / 80 : 0;

        // Hover within grab range keeps pulse alive (identical to firing effect)
        if (dist < 20) {
          pulseMap.set(i, PULSE_TOTAL);
        }

        const pulseFrames = pulseMap.get(i) ?? 0;
        const isPulsing = pulseFrames > 0;
        const pulseT = isPulsing ? 1 - pulseFrames / PULSE_TOTAL : 0;

        const baseRadius = 6;
        const pulseGrow = isPulsing ? 3 * (1 - pulseT) : 0;
        const radius = baseRadius + hoverBrightness * 4 + pulseGrow;
        const alpha = 0.6 + hoverBrightness * 0.4 + (isPulsing ? 0.4 * (1 - pulseT) : 0);

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isPulsing ? "#ffffff" : node.color;
        ctx.globalAlpha = Math.min(1, alpha);

        ctx.shadowColor = isPulsing ? "#ffffff" : node.color;
        ctx.shadowBlur = 16 + hoverBrightness * 16 + (isPulsing ? 30 * (1 - pulseT) : 0);
        ctx.fill();

        // Expanding ripple ring on pulse
        if (isPulsing) {
          const ringRadius = baseRadius + 6 + pulseT * 20;
          const ringAlpha = 0.5 * (1 - pulseT);
          ctx.beginPath();
          ctx.arc(node.x, node.y, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 1.5 * (1 - pulseT);
          ctx.globalAlpha = ringAlpha;
          ctx.shadowColor = node.color;
          ctx.shadowBlur = 8 * (1 - pulseT);
          ctx.stroke();
        }

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        if (isPulsing) {
          pulseMap.set(i, pulseFrames - 1);
          if (pulseFrames - 1 <= 0) pulseMap.delete(i);
        }
      }

      // Update and draw signals
      const newSignals: Signal[] = [];
      for (const sig of signals) {
        sig.progress += sig.speed;
        sig.glowProgress = sig.progress;

        if (sig.progress >= 1) {
          // Signal arrived — pulse receiving node
          pulseMap.set(sig.to, 25);

          // Color evolution for user-added nodes
          const receivingNode = nodes[sig.to];
          if (receivingNode?.isUserAdded) {
            const sourceColor = nodes[sig.from]?.color ?? GRAY;
            let history = signalHistoryRef.current.get(sig.to);
            if (!history) {
              history = { counts: new Map(), total: 0 };
              signalHistoryRef.current.set(sig.to, history);
            }
            history.counts.set(sourceColor, (history.counts.get(sourceColor) ?? 0) + 1);
            history.total++;
            let dominantColor = GRAY;
            let maxCount = 0;
            for (const [color, count] of history.counts) {
              if (count > maxCount) { maxCount = count; dominantColor = color; }
            }
            const t = Math.min(history.total, SIGNAL_MATURITY_COUNT) / SIGNAL_MATURITY_COUNT;
            receivingNode.color = lerpColor(GRAY, dominantColor, t);
          }

          // Cascade to 1 random outgoing neighbor
          // In quiet mode, only user-triggered signals propagate
          const isQuiet = quietUntilRef.current > now;
          const canCascade = !isQuiet || sig.userTriggered;
          const targetNode = nodes[sig.to];
          if (canCascade && targetNode && newSignals.length < MAX_ACTIVE_SIGNALS) {
            const lastEmit = nodeCooldownRef.current.get(sig.to) ?? 0;
            if (now - lastEmit > 300) {
              const outNeighbors = getOutNeighbors(sig.to, edgesRef.current).filter((ni) => ni !== sig.from);
              if (outNeighbors.length > 0) {
                const ni = outNeighbors[Math.floor(Math.random() * outNeighbors.length)];
                const edgeIndex = edgesRef.current.findIndex(
                  (e) => e.opacity > 0 && e.from === sig.to && e.to === ni,
                );
                if (edgeIndex >= 0) {
                  newSignals.push({
                    edgeIndex,
                    from: sig.to,
                    to: ni,
                    progress: 0,
                    speed: SIGNAL_SPEED,
                    glowProgress: 0,
                    userTriggered: sig.userTriggered,
                  });
                  nodeCooldownRef.current.set(sig.to, now);
                }
              }
            }
          }
          continue;
        }

        newSignals.push(sig);
      }

      signalsRef.current = newSignals;

      // === RADIAL SWEEP: typing progress drives an expanding wave from center ===
      const reveal = revealRef.current;
      if (reveal > 0) {
        const sweepRadius = reveal * maxDistRef.current;
        const swept = sweptNodesRef.current;

        for (let i = 0; i < nodes.length; i++) {
          if (swept.has(i)) continue;
          if (nodes[i].distFromCenter <= sweepRadius) {
            swept.add(i);
            // Activate this node — pulse + fire
            pulseMap.set(i, 25);
            if (newSignals.length < MAX_ACTIVE_SIGNALS) {
              fireSignals(i, true);
            }
          }
        }

        if (reveal >= 1 && !revealCompleteCalledRef.current) {
          revealCompleteCalledRef.current = true;
          onRevealComplete?.();
        }
      }

      // === AMBIENT: 1 random node fires every 3-5s (after sweep, not in quiet mode) ===
      if (reveal >= 1 && now >= nextAmbientRef.current && quietUntilRef.current <= now) {
        const validNodes: number[] = [];
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].x > -9000) validNodes.push(i);
        }
        if (validNodes.length > 0) {
          const chosen = validNodes[Math.floor(Math.random() * validNodes.length)];
          fireSignals(chosen, true);
        }
        nextAmbientRef.current = now + AMBIENT_MIN + Math.random() * (AMBIENT_MAX - AMBIENT_MIN);
      }

      animFrameRef.current = requestAnimationFrame(animate);
    }

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [initGraph, fireSignals, onRevealComplete]);

  // Sync revealProgress prop to ref
  const revealRef = useRef(0);
  useEffect(() => {
    revealRef.current = revealProgress;
  }, [revealProgress]);

  // Handle resize
  useEffect(() => {
    function handleResize() {
      initGraph();
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [initGraph]);

  // Spacebar: toggle quiet mode (30s silence)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        const now = performance.now();
        if (quietUntilRef.current > now) {
          // Already quiet — cancel it
          quietUntilRef.current = 0;
        } else {
          // Clear all active signals and enter quiet mode
          signalsRef.current = [];
          quietUntilRef.current = now + 180000;
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Mouse interactions: hover-to-fire, drag, click
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleMouseMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY };

      if (dragRef.current.isDragging && dragRef.current.nodeIndex >= 0) {
        const ddx = e.clientX - dragRef.current.startX;
        const ddy = e.clientY - dragRef.current.startY;
        if (Math.abs(ddx) > 3 || Math.abs(ddy) > 3) {
          dragRef.current.hasMoved = true;
        }
        const node = nodesRef.current[dragRef.current.nodeIndex];
        if (node) {
          node.x = e.clientX;
          node.y = e.clientY;
        }
        // Create edge on contact: if dragged node bumps into another node
        for (let i = 0; i < nodesRef.current.length; i++) {
          if (i === dragRef.current.nodeIndex) continue;
          const n = nodesRef.current[i];
          if (n.x < -9000) continue;
          const cdx = n.x - e.clientX;
          const cdy = n.y - e.clientY;
          if (Math.sqrt(cdx * cdx + cdy * cdy) < 25) {
            const exists = edgesRef.current.some(
              (ed) => ed.opacity > 0 && ed.from === dragRef.current.nodeIndex && ed.to === i,
            );
            if (!exists) {
              edgesRef.current.push({ from: dragRef.current.nodeIndex, to: i, opacity: 1 });
              fireSignals(dragRef.current.nodeIndex, true, true);
            }
            break;
          }
        }
        canvas!.style.cursor = "grabbing";
        return;
      }

      // Hover-to-fire: if mouse is near a node, fire it (with cooldown)
      // Skip firing when any mouse button is held or in quiet mode
      const ni = findClosestNode(e.clientX, e.clientY, nodesRef.current, 20);
      if (ni >= 0) {
        canvas!.style.cursor = "grab";
        const isQuiet = quietUntilRef.current > performance.now();
        if (e.buttons === 0 && !isQuiet) {
          const now = performance.now();
          const lastHoverFire = hoverFireCooldownRef.current.get(ni) ?? 0;
          if (now - lastHoverFire > 800) {
            fireSignals(ni, true, true);
            hoverFireCooldownRef.current.set(ni, now);
          }
        }
      } else {
        canvas!.style.cursor = "crosshair";
      }
    }

    function handleMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      const ni = findClosestNode(e.clientX, e.clientY, nodesRef.current, 20);
      if (ni >= 0) {
        dragRef.current = {
          isDragging: true,
          nodeIndex: ni,
          startX: e.clientX,
          startY: e.clientY,
          hasMoved: false,
        };
        canvas!.style.cursor = "grabbing";
        e.preventDefault();
      }
    }

    function handleMouseUp(e: MouseEvent) {
      if (e.button !== 0) return;
      const drag = dragRef.current;

      if (drag.isDragging && drag.nodeIndex >= 0) {
        if (drag.hasMoved) {
          // Find closest node excluding the dragged one (it's at mouse pos)
          let dropTarget = -1;
          let dropDist = 30; // slightly larger detection radius for drop
          for (let i = 0; i < nodesRef.current.length; i++) {
            if (i === drag.nodeIndex) continue;
            const n = nodesRef.current[i];
            if (n.x < -9000) continue;
            const ddx = n.x - e.clientX;
            const ddy = n.y - e.clientY;
            const dd = Math.sqrt(ddx * ddx + ddy * ddy);
            if (dd < dropDist) { dropDist = dd; dropTarget = i; }
          }
          if (dropTarget >= 0) {
            const exists = edgesRef.current.some(
              (ed) => ed.opacity > 0 && ed.from === drag.nodeIndex && ed.to === dropTarget,
            );
            if (!exists) {
              edgesRef.current.push({ from: drag.nodeIndex, to: dropTarget, opacity: 1 });
              fireSignals(drag.nodeIndex, true, true);
            }
          }
        } else {
          fireSignals(drag.nodeIndex, true, true);
        }
      } else if (!drag.isDragging) {
        addNode(e.clientX, e.clientY);
      }

      dragRef.current = { isDragging: false, nodeIndex: -1, startX: 0, startY: 0, hasMoved: false };
    }

    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();
      const nodes = nodesRef.current;
      const edges = edgesRef.current;

      const ni = findClosestNode(e.clientX, e.clientY, nodes, 20);
      if (ni >= 0) {
        const outNeighbors = getOutNeighbors(ni, edges);
        for (const n of outNeighbors) fireSignals(n, true);
        for (const edge of edges) {
          if (edge.from === ni || edge.to === ni) edge.opacity = 0.99;
        }
        nodes[ni].x = -9999;
        nodes[ni].y = -9999;
        return;
      }

      const ei = findClosestEdge(e.clientX, e.clientY, nodes, edges, 8);
      if (ei >= 0) {
        fireSignals(edges[ei].from, true);
        edges[ei].opacity = 0.99;
      }
    }

    // Touch interactions: drag nodes, tap to fire/add
    const TOUCH_RADIUS = 40; // larger detection radius for fingers

    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const ni = findClosestNode(touch.clientX, touch.clientY, nodesRef.current, TOUCH_RADIUS);
      if (ni >= 0) {
        dragRef.current = {
          isDragging: true,
          nodeIndex: ni,
          startX: touch.clientX,
          startY: touch.clientY,
          hasMoved: false,
        };
        e.preventDefault(); // prevent scroll when grabbing a node
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (!dragRef.current.isDragging || e.touches.length !== 1) return;
      const touch = e.touches[0];
      mouseRef.current = { x: touch.clientX, y: touch.clientY };

      const ddx = touch.clientX - dragRef.current.startX;
      const ddy = touch.clientY - dragRef.current.startY;
      if (Math.abs(ddx) > 3 || Math.abs(ddy) > 3) {
        dragRef.current.hasMoved = true;
      }

      const node = nodesRef.current[dragRef.current.nodeIndex];
      if (node) {
        node.x = touch.clientX;
        node.y = touch.clientY;
      }

      // Create edge on contact while dragging
      for (let i = 0; i < nodesRef.current.length; i++) {
        if (i === dragRef.current.nodeIndex) continue;
        const n = nodesRef.current[i];
        if (n.x < -9000) continue;
        const cdx = n.x - touch.clientX;
        const cdy = n.y - touch.clientY;
        if (Math.sqrt(cdx * cdx + cdy * cdy) < 25) {
          const exists = edgesRef.current.some(
            (ed) => ed.opacity > 0 && ed.from === dragRef.current.nodeIndex && ed.to === i,
          );
          if (!exists) {
            edgesRef.current.push({ from: dragRef.current.nodeIndex, to: i, opacity: 1 });
            fireSignals(dragRef.current.nodeIndex, true, true);
          }
          break;
        }
      }

      e.preventDefault(); // prevent scroll while dragging
    }

    function handleTouchEnd(e: TouchEvent) {
      const drag = dragRef.current;
      if (!drag.isDragging) {
        // Tap on empty space — add node
        if (e.changedTouches.length === 1) {
          const touch = e.changedTouches[0];
          const ni = findClosestNode(touch.clientX, touch.clientY, nodesRef.current, TOUCH_RADIUS);
          if (ni < 0) {
            addNode(touch.clientX, touch.clientY);
          }
        }
        dragRef.current = { isDragging: false, nodeIndex: -1, startX: 0, startY: 0, hasMoved: false };
        return;
      }

      if (drag.nodeIndex >= 0) {
        if (drag.hasMoved && e.changedTouches.length === 1) {
          const touch = e.changedTouches[0];
          // Drop on another node — create edge
          let dropTarget = -1;
          let dropDist = 35;
          for (let i = 0; i < nodesRef.current.length; i++) {
            if (i === drag.nodeIndex) continue;
            const n = nodesRef.current[i];
            if (n.x < -9000) continue;
            const ddx = n.x - touch.clientX;
            const ddy = n.y - touch.clientY;
            const dd = Math.sqrt(ddx * ddx + ddy * ddy);
            if (dd < dropDist) { dropDist = dd; dropTarget = i; }
          }
          if (dropTarget >= 0) {
            const exists = edgesRef.current.some(
              (ed) => ed.opacity > 0 && ed.from === drag.nodeIndex && ed.to === dropTarget,
            );
            if (!exists) {
              edgesRef.current.push({ from: drag.nodeIndex, to: dropTarget, opacity: 1 });
              fireSignals(drag.nodeIndex, true, true);
            }
          }
        } else {
          // Tap on node — fire signals
          fireSignals(drag.nodeIndex, true, true);
        }
      }

      dragRef.current = { isDragging: false, nodeIndex: -1, startX: 0, startY: 0, hasMoved: false };
      mouseRef.current = { x: -1000, y: -1000 }; // reset so hover effects don't stick
    }

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("contextmenu", handleContextMenu);
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd);

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };
  }, [fireSignals]);

  function addNode(x: number, y: number) {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const { w, h } = sizeRef.current;
    const cx = w / 2;
    const cy = h / 2;

    if (isInExclusionZone(x, y, cx, cy)) {
      const dx = x - cx;
      const dy = y - cy;
      const ratioX = Math.abs(dx) / 150;
      const ratioY = Math.abs(dy) / 50;
      if (ratioX > ratioY) {
        x = cx + Math.sign(dx) * 150;
      } else {
        y = cy + Math.sign(dy) * 50;
      }
    }

    const cluster = CLUSTERS[Math.floor(Math.random() * 5)];
    const newIndex = nodes.length;
    nodes.push({
      x, y,
      cluster: cluster.name,
      color: GRAY,
      cascadeProb: cluster.cascadeProb,
      signalSpeed: cluster.signalSpeed,
      sparkRate: cluster.sparkRate,
      spontaneousInterval: cluster.spontaneousInterval,
      distFromCenter: 0,
      isUserAdded: true,
    });

    // 1 outgoing, 1 incoming
    const distances: { index: number; dist: number }[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      if (nodes[i].x < -9000) continue;
      const dx = nodes[i].x - x;
      const dy = nodes[i].y - y;
      distances.push({ index: i, dist: Math.sqrt(dx * dx + dy * dy) });
    }
    distances.sort((a, b) => a.dist - b.dist);

    if (distances.length >= 1) edges.push({ from: newIndex, to: distances[0].index, opacity: 1 });
    if (distances.length >= 2) edges.push({ from: distances[1].index, to: newIndex, opacity: 1 });

    fireSignals(newIndex, true, true);
  }

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0"
      style={{ transition: "opacity 800ms ease-out", touchAction: "none" }}
    />
  );
}
