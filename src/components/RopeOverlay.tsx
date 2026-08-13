import React, { useRef, useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Editor } from "@tldraw/tldraw";

// ─── Types ────────────────────────────────────────────────────────────────────

type Side = "top" | "bottom" | "left" | "right";

interface RopeConnection {
  id: string;
  fromShapeId: string;
  fromSide: Side;
  toShapeId: string;
  toSide: Side;
  amplitude: number;
  phase: number;
  settled: boolean;
}

interface DragState {
  fromShapeId: string;
  fromSide: Side;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface Port {
  shapeId: string;
  side: Side;
  x: number;
  y: number;
}

export interface RopeOverlayProps {
  editorRef: React.MutableRefObject<Editor | null>;
}

// ─── Physics ──────────────────────────────────────────────────────────────────

const PORT_RADIUS = 5;
const INITIAL_AMPLITUDE = 55;
const DAMPING = 0.963;
const FREQUENCY = 0.09;
const MIN_AMPLITUDE = 0.8;
/** Minimum movement (px in page space) to count as "the terminal moved" */
const MOVE_THRESHOLD = 0.5;

// ─── Coordinate helper ────────────────────────────────────────────────────────

function pageToSVG(editor: Editor, pageX: number, pageY: number): { x: number; y: number } {
  const cam = editor.getCamera();
  return { x: (pageX + cam.x) * cam.z, y: (pageY + cam.y) * cam.z };
}

// ─── Component ────────────────────────────────────────────────────────────────

export const RopeOverlay: React.FC<RopeOverlayProps> = ({ editorRef }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  const [connections, setConnections] = useState<RopeConnection[]>([]);
  const connectionsRef = useRef<RopeConnection[]>([]);
  connectionsRef.current = connections;

  // Sync visual connections to Rust backend whenever rope connections change topology
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const pairs: [string, string][] = [];
    for (const c of connections) {
      const fromShape = editor.getShape(c.fromShapeId as any) as any;
      const toShape = editor.getShape(c.toShapeId as any) as any;
      const fromTermId = fromShape?.props?.terminalId;
      const toTermId = toShape?.props?.terminalId;
      if (fromTermId && toTermId) {
        pairs.push([fromTermId, toTermId]);
      }
    }

    invoke("update_connections", { connections: pairs }).catch(err => {
      console.error("[Mandante Rope] Failed to update backend connections:", err);
    });
  }, [connections, editorRef]);

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const [, setTick] = useState(0);

  // Track previous page positions to detect movement
  const prevPositions = useRef<Map<string, { x: number; y: number }>>(new Map());

  // ── Port helpers ────────────────────────────────────────────────────────────

  const getShapePorts = useCallback(
    (shapeId: string): Record<Side, { x: number; y: number }> | null => {
      const editor = editorRef.current;
      if (!editor) return null;
      const shape = editor.getShape(shapeId as any) as any;
      if (!shape) return null;
      const w: number = shape.props?.w ?? 640;
      const h: number = shape.props?.h ?? 400;
      const cx = shape.x + w / 2;
      const cy = shape.y + h / 2;
      return {
        top:    pageToSVG(editor, cx,          shape.y),
        bottom: pageToSVG(editor, cx,          shape.y + h),
        left:   pageToSVG(editor, shape.x,     cy),
        right:  pageToSVG(editor, shape.x + w, cy),
      };
    },
    [editorRef]
  );

  const getPortPos = useCallback(
    (shapeId: string, side: Side): { x: number; y: number } | null => {
      const ports = getShapePorts(shapeId);
      return ports ? ports[side] : null;
    },
    [getShapePorts]
  );

  const getAllPorts = useCallback((): Port[] => {
    const editor = editorRef.current;
    if (!editor) return [];
    const result: Port[] = [];
    const sides: Side[] = ["top", "bottom", "left", "right"];
    for (const s of editor.getCurrentPageShapes()) {
      if (s.type !== "terminal") continue;
      const ports = getShapePorts(s.id);
      if (!ports) continue;
      for (const side of sides) {
        result.push({ shapeId: s.id, side, x: ports[side].x, y: ports[side].y });
      }
    }
    return result;
  }, [editorRef, getShapePorts]);

  // ── Animation loop ──────────────────────────────────────────────────────────

  useEffect(() => {
    let raf: number;

    const tick = () => {
      const editor = editorRef.current;

      // ── 1. Detect terminal movement (outside setConnections to avoid side-effects in updater) ──
      const movedIds = new Set<string>();
      if (editor) {
        for (const s of editor.getCurrentPageShapes()) {
          if (s.type !== "terminal") continue;
          const shape = s as any;
          const prev = prevPositions.current.get(s.id);
          if (prev && Math.hypot(shape.x - prev.x, shape.y - prev.y) > MOVE_THRESHOLD) {
            movedIds.add(s.id);
          }
          prevPositions.current.set(s.id, { x: shape.x, y: shape.y });
        }
      }

      // ── 2. Update connections (physics decay + retrigger on move + orphan cleanup) ──
      setConnections(prev => {
        let next = prev;

        // Orphan cleanup
        if (editor) {
          const alive = new Set(editor.getCurrentPageShapes().map(s => s.id));
          const cleaned = next.filter(
            c => alive.has(c.fromShapeId as any) && alive.has(c.toShapeId as any)
          );
          if (cleaned.length !== next.length) next = cleaned;
        }

        const needsUpdate = next.some(c => !c.settled) || movedIds.size > 0;
        if (!needsUpdate) return next;

        const updated = next.map(c => {
          const terminalMoved = movedIds.has(c.fromShapeId) || movedIds.has(c.toShapeId);

          if (terminalMoved) {
            // Retrigger full swing when an attached terminal moves
            return {
              ...c,
              amplitude: INITIAL_AMPLITUDE,
              phase: c.phase + FREQUENCY,
              settled: false,
            };
          }

          if (c.settled) return c;

          // Normal physics decay
          const amplitude = c.amplitude * DAMPING;
          const phase = c.phase + FREQUENCY;
          return { ...c, amplitude, phase, settled: amplitude < MIN_AMPLITUDE };
        });

        return updated;
      });

      // ── 3. Force re-render for smooth position tracking ──
      setTick(t => t + 1);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [editorRef]);

  // ── Window drag handlers ────────────────────────────────────────────────────

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: MouseEvent) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDrag(d => d ? { ...d, currentX: e.clientX - rect.left, currentY: e.clientY - rect.top } : null);
    };

    const onUp = (e: MouseEvent) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || !dragRef.current) { setDrag(null); return; }

      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { fromShapeId, fromSide } = dragRef.current;

      let bestPort: Port | null = null;
      let bestDist = PORT_RADIUS + 18;

      for (const port of getAllPorts()) {
        if (port.shapeId === fromShapeId) continue;
        const d = Math.hypot(mx - port.x, my - port.y);
        if (d < bestDist) { bestDist = d; bestPort = port; }
      }

      if (bestPort) {
        const { shapeId: toShapeId, side: toSide } = bestPort;
        const duplicate = connectionsRef.current.some(
          c =>
            (c.fromShapeId === fromShapeId && c.fromSide === fromSide && c.toShapeId === toShapeId && c.toSide === toSide) ||
            (c.fromShapeId === toShapeId && c.fromSide === toSide && c.toShapeId === fromShapeId && c.toSide === fromSide)
        );
        if (!duplicate) {
          setConnections(prev => [...prev, {
            id: `rope-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            fromShapeId,
            fromSide,
            toShapeId,
            toSide,
            amplitude: INITIAL_AMPLITUDE,
            phase: 0,
            settled: false,
          }]);
        }
      }

      setDrag(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, getAllPorts]);

  // ── SVG rope path (Cubic Bezier with tangent-aware control points) ───────────

  const ropeD = (
    x1: number, y1: number, side1: Side,
    x2: number, y2: number, side2: Side,
    amplitude: number, phase: number, settled: boolean
  ): string => {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const tension = Math.min(140, dist * 0.35 + 30);
    const swing = settled ? 0 : amplitude * Math.sin(phase);

    const tangent: Record<Side, [number, number]> = {
      right:  [1,  0],
      left:   [-1, 0],
      bottom: [0,  1],
      top:    [0, -1],
    };

    const [tx1, ty1] = tangent[side1];
    const [tx2, ty2] = tangent[side2];

    const cp1x = x1 + tx1 * tension;
    const cp1y = y1 + ty1 * tension + swing;
    const cp2x = x2 + tx2 * tension;
    const cp2y = y2 + ty2 * tension + swing;

    return `M ${x1} ${y1} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${x2} ${y2}`;
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const ports = getAllPorts();

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: "none", zIndex: 35, overflow: "visible" }}
    >
      {/* Rope connections */}
      {connections.map(c => {
        const from = getPortPos(c.fromShapeId, c.fromSide);
        const to   = getPortPos(c.toShapeId,   c.toSide);
        if (!from || !to) return null;
        const d = ropeD(from.x, from.y, c.fromSide, to.x, to.y, c.toSide, c.amplitude, c.phase, c.settled);
        return (
          <g
            key={c.id}
            style={{ pointerEvents: "all", cursor: "pointer" }}
            onClick={() => setConnections(prev => prev.filter(r => r.id !== c.id))}
          >
            <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
            <path
              d={d}
              fill="none"
              stroke="#818cf8"
              strokeWidth={2.5}
              strokeLinecap="round"
              style={{ filter: "drop-shadow(0 0 5px rgba(129,140,248,0.55))" }}
            />
          </g>
        );
      })}

      {/* Preview rope while dragging */}
      {drag && (() => {
        const d = ropeD(
          drag.startX, drag.startY, drag.fromSide,
          drag.currentX, drag.currentY, drag.fromSide,
          0, 0, true
        );
        return (
          <path
            d={d}
            fill="none"
            stroke="#818cf8"
            strokeWidth={2}
            strokeDasharray="7 5"
            strokeLinecap="round"
            opacity={0.65}
            style={{ pointerEvents: "none" }}
          />
        );
      })()}

      {/* Port dots — 4 sides of each terminal */}
      {ports.map(port => (
        <g
          key={`${port.shapeId}-${port.side}`}
          style={{ pointerEvents: "all", cursor: "crosshair" }}
          onMouseDown={e => {
            e.stopPropagation();
            e.preventDefault();
            const rect = svgRef.current?.getBoundingClientRect();
            if (!rect) return;
            setDrag({
              fromShapeId: port.shapeId,
              fromSide: port.side,
              startX: port.x,
              startY: port.y,
              currentX: e.clientX - rect.left,
              currentY: e.clientY - rect.top,
            });
          }}
        >
          <circle cx={port.x} cy={port.y} r={PORT_RADIUS + 5} fill="rgba(99,102,241,0.10)" />
          <circle
            cx={port.x}
            cy={port.y}
            r={PORT_RADIUS}
            fill="#6366f1"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={1.5}
          />
        </g>
      ))}
    </svg>
  );
};
