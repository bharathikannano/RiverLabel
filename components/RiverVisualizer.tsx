import React, { useMemo, useState, useRef, useEffect } from 'react';
import { RiverData, LabelingResult } from '../types';
import { COLORS } from '../constants';
import { ZoomIn, ZoomOut, Maximize, GripHorizontal, AlertCircle } from 'lucide-react';

interface RiverVisualizerProps {
  river: RiverData;
  result: LabelingResult;
  showCandidates: boolean;
  fontSize: number;
}

const RiverVisualizer: React.FC<RiverVisualizerProps> = ({ 
  river, 
  result, 
  showCandidates, 
  fontSize
}) => {
  const { polygon } = river;
  const { placed, candidates, bounds, centroid } = result;

  const padding = 150;
  
  const intrinsic = useMemo(() => {
    const w = bounds.max.x - bounds.min.x;
    const h = bounds.max.y - bounds.min.y;
    return {
      minX: bounds.min.x - padding,
      minY: bounds.min.y - padding,
      width: w + padding * 2,
      height: h + padding * 2
    };
  }, [bounds]);

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, [river.id]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheelInternal = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = 1.15;
      const direction = e.deltaY < 0 ? 1 : -1;
      
      setTransform(prev => {
        const newScale = direction > 0 ? prev.scale * zoomFactor : prev.scale / zoomFactor;
        const finalScale = Math.min(Math.max(newScale, 0.05), 100);
        const rect = svg.getBoundingClientRect();
        const svgMouseX = (e.clientX - rect.left) * (intrinsic.width / rect.width);
        const svgMouseY = (e.clientY - rect.top) * (intrinsic.height / rect.height);
        const dx = (svgMouseX - prev.x) / prev.scale;
        const dy = (svgMouseY - prev.y) / prev.scale;
        return { scale: finalScale, x: svgMouseX - dx * finalScale, y: svgMouseY - dy * finalScale };
      });
    };

    svg.addEventListener('wheel', handleWheelInternal, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheelInternal);
  }, [intrinsic.width, intrinsic.height]);

  const polygonPath = useMemo(() => {
    if (!polygon.length) return '';
    return polygon.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
  }, [polygon]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    const rect = svgRef.current!.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (intrinsic.width / rect.width);
    const svgY = (e.clientY - rect.top) * (intrinsic.height / rect.height);
    dragStart.current = { x: svgX - transform.x, y: svgY - transform.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (intrinsic.width / rect.width);
    const svgY = (e.clientY - rect.top) * (intrinsic.height / rect.height);
    setTransform(prev => ({ ...prev, x: svgX - dragStart.current.x, y: svgY - dragStart.current.y }));
  };

  const handleMouseUp = () => setIsDragging(false);
  const resetZoom = () => setTransform({ x: 0, y: 0, scale: 1 });

  const zoomStep = (multiplier: number) => {
    setTransform(prev => {
      const finalScale = Math.min(Math.max(prev.scale * multiplier, 0.05), 100);
      const centerX = intrinsic.width / 2;
      const centerY = intrinsic.height / 2;
      const dx = (centerX - prev.x) / prev.scale;
      const dy = (centerY - prev.y) / prev.scale;
      return { scale: finalScale, x: centerX - dx * finalScale, y: centerY - dy * finalScale };
    });
  };

  const pathId = `label-path-${river.id.replace(/\s+/g, '-')}`;
  const hasCollisions = placed?.collisionPoints && placed.collisionPoints.length > 0;
  const lowScore = !placed || result.placed?.score <= 0.04;

  return (
    <div className="relative w-full h-[600px] bg-[#0c121e] rounded-3xl overflow-hidden border border-slate-800 shadow-2xl group select-none">
      <svg 
        ref={svgRef}
        viewBox={`0 0 ${intrinsic.width} ${intrinsic.height}`} 
        className={`w-full h-full touch-none cursor-${isDragging ? 'grabbing' : 'grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          <radialGradient id="collisionGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`} style={{ transition: isDragging ? 'none' : 'transform 0.1s ease-out' }}>
          <g transform={`translate(${-intrinsic.minX}, ${-intrinsic.minY})`}>
            
            {placed?.path && (
              <path id={pathId} d={placed.path} fill="none" pointerEvents="none" />
            )}

            <path 
              d={polygonPath} 
              fill={COLORS.river} 
              fillOpacity={0.35} 
              stroke={COLORS.riverBorder} 
              strokeWidth={3 / transform.scale} 
              strokeLinejoin="round" 
              className="transition-colors duration-500"
            />

            {showCandidates && candidates.map((c, i) => (
              <circle key={i} cx={c.center.x} cy={c.center.y} r={2.5 / transform.scale} fill={COLORS.candidate} fillOpacity={0.5} />
            ))}

            {showCandidates && centroid && (
              <g>
                <circle cx={centroid.x} cy={centroid.y} r={8 / transform.scale} fill={COLORS.centroid} stroke="white" strokeWidth={2 / transform.scale} />
              </g>
            )}

            {/* Visualize collision/warning points */}
            {placed?.collisionPoints?.map((p, i) => (
              <g key={`col-${i}`} className="animate-pulse">
                <circle cx={p.x} cy={p.y} r={fontSize * 1.5} fill="url(#collisionGlow)" />
                <circle cx={p.x} cy={p.y} r={3 / transform.scale} fill="#ef4444" stroke="#7f1d1d" strokeWidth={1 / transform.scale} />
              </g>
            ))}

            {/* Always show the best path visualization to demonstrate spine tracing, regardless of showCandidates */}
            {placed && placed.path && (
               <path 
                 d={placed.path} 
                 fill="none" 
                 stroke={hasCollisions ? "#ef4444" : "#f59e0b"} 
                 strokeWidth={2.5 / transform.scale} 
                 strokeDasharray={`${10/transform.scale} ${10/transform.scale}`}
                 strokeOpacity={0.8}
               />
            )}

            {placed && placed.path && (
              <text
                dominantBaseline="central"
                style={{ 
                  fontSize: `${fontSize}px`, 
                  fontWeight: '700', 
                  textRendering: 'geometricPrecision',
                  // Significantly reduced spacing to prevent truncation and ensure text fits within path bounds
                  letterSpacing: '0.05em',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  fontFamily: '"Inter", sans-serif',
                  paintOrder: 'stroke fill'
                }}
              >
                <textPath 
                  href={`#${pathId}`} 
                  startOffset="50%" 
                  textAnchor="middle" 
                  fill="white"
                  stroke="#0c121e"
                  strokeWidth={`${fontSize * 0.4}px`}
                  strokeLinejoin="round"
                  method="align"
                  spacing="auto"
                >
                  {river.label}
                </textPath>
              </text>
            )}
          </g>
        </g>
      </svg>
      
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <button onClick={() => zoomStep(1.4)} className="p-3 bg-slate-800/90 hover:bg-slate-700 text-white rounded-2xl border border-slate-700 backdrop-blur-md shadow-2xl transition-all active:scale-95">
          <ZoomIn className="w-5 h-5" />
        </button>
        <button onClick={() => zoomStep(1 / 1.4)} className="p-3 bg-slate-800/90 hover:bg-slate-700 text-white rounded-2xl border border-slate-700 backdrop-blur-md shadow-2xl transition-all active:scale-95">
          <ZoomOut className="w-5 h-5" />
        </button>
        <button onClick={resetZoom} className="p-3 bg-slate-800/90 hover:bg-slate-700 text-white rounded-2xl border border-slate-700 backdrop-blur-md shadow-2xl transition-all active:scale-95">
          <Maximize className="w-5 h-5" />
        </button>
      </div>

      <div className="absolute bottom-6 left-6 flex flex-col gap-3">
        {(lowScore || hasCollisions) && (
          <div className="bg-amber-600/20 border border-amber-500/40 text-amber-400 text-[10px] font-black uppercase tracking-[0.2em] px-4 py-2.5 rounded-xl backdrop-blur-md flex items-center gap-2 shadow-xl">
            <AlertCircle className="w-4 h-4" />
            {hasCollisions ? "Edges Overlapping - Try Smaller Font" : "Geometry Constraint Relaxed"}
          </div>
        )}
        <div className="bg-blue-600/20 border border-blue-500/40 text-blue-400 text-[10px] font-black uppercase tracking-[0.25em] px-5 py-3 rounded-2xl backdrop-blur-md flex items-center gap-2 shadow-xl">
          <GripHorizontal className="w-4 h-4" />
          {river.name}
        </div>
      </div>
    </div>
  );
};

export default RiverVisualizer;