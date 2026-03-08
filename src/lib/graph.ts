// Graph generation logic for the canvas network animation

export interface GraphNode {
  x: number;
  y: number;
  cluster: string;
  color: string;
  cascadeProb: number;
  signalSpeed: number;
  sparkRate: number;
  spontaneousInterval: number;
  distFromCenter: number;
  isUserAdded?: boolean;
}

export interface GraphEdge {
  from: number;
  to: number;
  opacity: number; // for fade-out animation
}

export interface Signal {
  edgeIndex: number;
  from: number;
  to: number;
  progress: number; // 0-1 along edge
  speed: number; // progress per frame
  glowProgress: number;
  userTriggered?: boolean; // true if originated from hover/click (propagates in quiet mode)
}

export interface ClusterConfig {
  name: string;
  color: string;
  cascadeProb: number;
  signalSpeed: number;
  sparkRate: number;
  spontaneousInterval: number;
}

export const CLUSTERS: ClusterConfig[] = [
  { name: "RNA", color: "#ff2d78", cascadeProb: 0.35, signalSpeed: 1.2, sparkRate: 1, spontaneousInterval: 3000 },
  { name: "Neural", color: "#39ff14", cascadeProb: 0.25, signalSpeed: 2.0, sparkRate: 2, spontaneousInterval: 5000 },
  { name: "Synth bio", color: "#bf5af2", cascadeProb: 0.4, signalSpeed: 1.0, sparkRate: 3, spontaneousInterval: 9000 },
  { name: "Organic-machine", color: "#00e5ff", cascadeProb: 0.2, signalSpeed: 2.0, sparkRate: 1, spontaneousInterval: 7000 },
  { name: "AI", color: "#ff6a00", cascadeProb: 0.3, signalSpeed: 2.5, sparkRate: 2, spontaneousInterval: 2000 },
];

// Seeded PRNG for consistent mosaic layout
function createRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Center exclusion zone — rectangle cx±150, cy±50
const EXCL_W = 150;
const EXCL_H = 50;

export function isInExclusionZone(x: number, y: number, cx: number, cy: number): boolean {
  return Math.abs(x - cx) < EXCL_W && Math.abs(y - cy) < EXCL_H;
}

function pushOutsideExclusionZone(x: number, y: number, cx: number, cy: number): { x: number; y: number } {
  if (!isInExclusionZone(x, y, cx, cy)) return { x, y };
  const dx = x - cx;
  const dy = y - cy;
  const ratioX = Math.abs(dx) / EXCL_W;
  const ratioY = Math.abs(dy) / EXCL_H;
  if (ratioX > ratioY) {
    return { x: cx + Math.sign(dx) * EXCL_W, y };
  } else {
    return { x, y: cy + Math.sign(dy) * EXCL_H };
  }
}

export function lerpColor(a: string, b: string, t: number): string {
  const parseHex = (hex: string) => {
    const h = hex.replace("#", "");
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  };
  const ca = parseHex(a);
  const cb = parseHex(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

export function generateGraph(
  width: number,
  height: number,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const rng = createRng(42); // seeded — same mosaic every load
  const cx = width / 2;
  const cy = height / 2;
  const margin = -10; // negative so nodes can sit at/beyond screen edges

  // Cluster centers — pushed further toward corners
  const clusterCenters = [
    { x: cx * 0.35, y: cy * 0.35 },   // RNA - upper left
    { x: cx * 1.65, y: cy * 0.35 },   // Neural - upper right
    { x: cx * 0.35, y: cy * 1.65 },   // Synth bio - lower left
    { x: cx * 1.65, y: cy * 1.65 },   // Organic-machine - lower right
  ];

  const nodes: GraphNode[] = [];
  const nodesPerCluster = [11, 11, 11, 11, 18]; // fewer per cluster, more dispersed
  const clusterIndices: number[][] = [[], [], [], [], []];

  for (let ci = 0; ci < CLUSTERS.length; ci++) {
    const cluster = CLUSTERS[ci];
    const isAI = ci === 4;
    const count = nodesPerCluster[ci];

    for (let i = 0; i < count; i++) {
      let x: number, y: number;
      let attempts = 0;

      if (isAI) {
        do {
          x = margin + rng() * (width - 2 * margin);
          y = margin + rng() * (height - 2 * margin);
          attempts++;
        } while (isInExclusionZone(x, y, cx, cy) && attempts < 10);
      } else {
        const center = clusterCenters[ci];
        const spread = Math.min(width, height) * 0.7;
        do {
          const angle = rng() * Math.PI * 2;
          const dist = rng() * spread * (0.2 + rng() * 0.8);
          x = center.x + Math.cos(angle) * dist;
          y = center.y + Math.sin(angle) * dist;
          // Allow nodes right up to (and slightly beyond) screen edges
          x = Math.max(margin, Math.min(width - margin, x));
          y = Math.max(margin, Math.min(height - margin, y));
          attempts++;
        } while (isInExclusionZone(x, y, cx, cy) && attempts < 10);
      }

      if (isInExclusionZone(x, y, cx, cy)) {
        const pushed = pushOutsideExclusionZone(x, y, cx, cy);
        x = pushed.x;
        y = pushed.y;
      }

      const distFromCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const nodeIndex = nodes.length;
      clusterIndices[ci].push(nodeIndex);

      nodes.push({
        x, y,
        cluster: cluster.name,
        color: cluster.color,
        cascadeProb: cluster.cascadeProb,
        signalSpeed: cluster.signalSpeed,
        sparkRate: cluster.sparkRate,
        spontaneousInterval: cluster.spontaneousInterval,
        distFromCenter,
      });
    }
  }

  // Generate edges
  const edges: GraphEdge[] = [];
  const maxEdgeDist = Math.min(width, height) * 0.2;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < maxEdgeDist) {
        const sameCluster = nodes[i].cluster === nodes[j].cluster;
        const threshold = sameCluster ? 0.3 : 0.6;
        if (rng() > threshold) {
          if (rng() < 0.5) {
            edges.push({ from: i, to: j, opacity: 1 });
          } else {
            edges.push({ from: j, to: i, opacity: 1 });
          }
          if (rng() < 0.15) {
            edges.push({ from: j, to: i, opacity: 1 });
          }
        }
      }
    }
  }

  // Cross-cluster bridges
  for (let ci = 0; ci < CLUSTERS.length; ci++) {
    const members = clusterIndices[ci];
    const bridgeCount = 1 + (rng() < 0.5 ? 1 : 0);
    for (let b = 0; b < bridgeCount; b++) {
      const srcIdx = members[Math.floor(rng() * members.length)];
      let otherCi = Math.floor(rng() * (CLUSTERS.length - 1));
      if (otherCi >= ci) otherCi++;
      const otherMembers = clusterIndices[otherCi];
      const dstIdx = otherMembers[Math.floor(rng() * otherMembers.length)];
      const exists = edges.some(
        (e) => e.opacity > 0 && e.from === srcIdx && e.to === dstIdx,
      );
      if (!exists) {
        edges.push({ from: srcIdx, to: dstIdx, opacity: 1 });
      }
    }
  }

  // Ensure every node has: 1) at least one outgoing edge, 2) at least one
  // incoming edge, and 3) at least 2 distinct neighbors (visible connections)
  for (let i = 0; i < nodes.length; i++) {
    const hasOutgoing = edges.some((e) => e.from === i && e.opacity > 0);
    const hasIncoming = edges.some((e) => e.to === i && e.opacity > 0);

    // Collect existing distinct neighbors
    const neighbors = new Set<number>();
    for (const e of edges) {
      if (e.opacity <= 0) continue;
      if (e.from === i) neighbors.add(e.to);
      if (e.to === i) neighbors.add(e.from);
    }

    // Sort all other nodes by distance
    const nearest: { index: number; dist: number }[] = [];
    for (let j = 0; j < nodes.length; j++) {
      if (j === i) continue;
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      nearest.push({ index: j, dist: Math.sqrt(dx * dx + dy * dy) });
    }
    nearest.sort((a, b) => a.dist - b.dist);

    // Add missing outgoing edge (to a node not already a neighbor if possible)
    if (!hasOutgoing) {
      const target = nearest.find((n) => !neighbors.has(n.index)) ?? nearest[0];
      if (target) {
        edges.push({ from: i, to: target.index, opacity: 1 });
        neighbors.add(target.index);
      }
    }

    // Add missing incoming edge (from a node not already a neighbor if possible)
    if (!hasIncoming) {
      const source = nearest.find((n) => !neighbors.has(n.index)) ?? nearest[0];
      if (source) {
        edges.push({ from: source.index, to: i, opacity: 1 });
        neighbors.add(source.index);
      }
    }

    // Ensure at least 2 distinct neighbors
    if (neighbors.size < 2) {
      const newNeighbor = nearest.find((n) => !neighbors.has(n.index));
      if (newNeighbor) {
        edges.push({ from: i, to: newNeighbor.index, opacity: 1 });
        neighbors.add(newNeighbor.index);
      }
    }
  }

  // Ensure every node has incoming >= outgoing edges
  for (let i = 0; i < nodes.length; i++) {
    let outCount = 0;
    let inCount = 0;
    const inNeighbors = new Set<number>();
    for (const e of edges) {
      if (e.opacity <= 0) continue;
      if (e.from === i) outCount++;
      if (e.to === i) { inCount++; inNeighbors.add(e.from); }
    }
    while (inCount < outCount) {
      // Find nearest node not already an incoming source
      let bestJ = -1;
      let bestDist = Infinity;
      for (let j = 0; j < nodes.length; j++) {
        if (j === i || inNeighbors.has(j)) continue;
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) { bestDist = dist; bestJ = j; }
      }
      if (bestJ < 0) break;
      edges.push({ from: bestJ, to: i, opacity: 1 });
      inNeighbors.add(bestJ);
      inCount++;
    }
  }

  // Ensure full graph connectivity — BFS treating edges as undirected,
  // then bridge disconnected components to the main component
  const visited = new Set<number>();
  const queue: number[] = [0];
  visited.add(0);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const edge of edges) {
      if (edge.opacity <= 0) continue;
      let neighbor = -1;
      if (edge.from === cur) neighbor = edge.to;
      else if (edge.to === cur) neighbor = edge.from;
      if (neighbor >= 0 && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  if (visited.size < nodes.length) {
    for (let i = 0; i < nodes.length; i++) {
      if (visited.has(i)) continue;
      // Find closest node already in the main component
      let bestJ = -1;
      let bestDist = Infinity;
      for (const j of visited) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          bestJ = j;
        }
      }
      if (bestJ >= 0) {
        edges.push({ from: i, to: bestJ, opacity: 1 });
        edges.push({ from: bestJ, to: i, opacity: 1 });
      }
      visited.add(i);
    }
  }

  return { nodes, edges };
}

export function getOutNeighbors(nodeIndex: number, edges: GraphEdge[]): number[] {
  const neighbors: number[] = [];
  for (const edge of edges) {
    if (edge.opacity <= 0) continue;
    if (edge.from === nodeIndex) neighbors.push(edge.to);
  }
  return neighbors;
}

export function findClosestNode(
  mx: number,
  my: number,
  nodes: GraphNode[],
  maxDist: number,
): number {
  let best = -1;
  let bestDist = maxDist;
  for (let i = 0; i < nodes.length; i++) {
    const dx = nodes[i].x - mx;
    const dy = nodes[i].y - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export function findClosestEdge(
  mx: number,
  my: number,
  nodes: GraphNode[],
  edges: GraphEdge[],
  maxDist: number,
): number {
  let best = -1;
  let bestDist = maxDist;

  for (let i = 0; i < edges.length; i++) {
    if (edges[i].opacity <= 0) continue;
    const a = nodes[edges[i].from];
    const b = nodes[edges[i].to];

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;

    let t = ((mx - a.x) * dx + (my - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);

    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}
