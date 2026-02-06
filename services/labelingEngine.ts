import { Polygon, Point, LabelPlacement, LabelingResult, LabelBounds } from '../types';

/**
 * Standard point-in-polygon check with AABB optimization.
 */
function isPointInPolygon(point: Point, polygon: Polygon): boolean {
  let minX = polygon[0].x, maxX = polygon[0].x, minY = polygon[0].y, maxY = polygon[0].y;
  for (let i = 1; i < polygon.length; i++) {
    if (polygon[i].x < minX) minX = polygon[i].x;
    if (polygon[i].x > maxX) maxX = polygon[i].x;
    if (polygon[i].y < minY) minY = polygon[i].y;
    if (polygon[i].y > maxY) maxY = polygon[i].y;
  }
  if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegment(p: Point, v: Point, w: Point): number {
  const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
  if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt(Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + Math.pow(p.y - (v.y + t * (w.y - v.y)), 2));
}

function getDistanceToEdge(point: Point, polygon: Polygon): number {
  let minDist = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const d = distToSegment(point, polygon[i], polygon[j]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function estimateRiverOrientation(point: Point, polygon: Polygon): number {
  let minDist = Infinity, nearestIdx = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const d = distToSegment(point, polygon[i], polygon[j]);
    if (d < minDist) { minDist = d; nearestIdx = j; }
  }
  const p1 = polygon[nearestIdx], p2 = polygon[(nearestIdx + 1) % polygon.length];
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

function snapToMedialAxis(p: Point, angle: number, polygon: Polygon): { point: Point, width: number } {
  const nx = -Math.sin(angle), ny = Math.cos(angle);
  const findBoundary = (dx: number, dy: number): number => {
    let low = 0, high = 1000, step = 1;
    // Fast expansion
    while (step < 2000 && isPointInPolygon({ x: p.x + dx * step, y: p.y + dy * step }, polygon)) {
      step *= 2;
    }
    // Binary search refinement
    high = step;
    for (let i = 0; i < 8; i++) {
      const mid = (low + high) / 2;
      if (isPointInPolygon({ x: p.x + dx * mid, y: p.y + dy * mid }, polygon)) low = mid;
      else high = mid;
    }
    return low;
  };
  const d1 = findBoundary(nx, ny);
  const d2 = findBoundary(-nx, -ny);
  const shift = (d1 - d2) / 2;
  return { 
    point: { x: p.x + nx * shift, y: p.y + ny * shift },
    width: d1 + d2
  };
}

/**
 * Helper to trim a list of points (radiating from a start) to a max cumulative length.
 */
function trimPointsToLength(points: Point[], targetLen: number): Point[] {
  if (points.length === 0) return [];
  if (targetLen <= 0.1) return []; // Too short

  const result: Point[] = [];
  let currentLen = 0;
  
  // Points are expected to be ordered from center outwards
  result.push(points[0]);

  for (let i = 1; i < points.length; i++) {
    const pPrev = points[i-1];
    const pCurr = points[i];
    const dist = Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y);
    
    if (currentLen + dist >= targetLen) {
      // Interpolate the final point to hit exact length
      const remaining = targetLen - currentLen;
      if (remaining > 0.01) {
          const ratio = remaining / dist;
          result.push({
            x: pPrev.x + (pCurr.x - pPrev.x) * ratio,
            y: pPrev.y + (pCurr.y - pPrev.y) * ratio
          });
      }
      break;
    }
    
    result.push(pCurr);
    currentLen += dist;
  }
  return result;
}

/**
 * Smooths a path of points using a simple moving average to reduce jitter.
 */
function smoothSpine(points: Point[], iterations: number = 3): Point[] {
  let current = [...points];
  // Don't smooth if too few points
  if (current.length < 3) return current;

  for (let k = 0; k < iterations; k++) {
    const next: Point[] = [current[0]]; // Keep start fixed
    for (let i = 1; i < current.length - 1; i++) {
      // Weighted average: 0.25 prev, 0.5 curr, 0.25 next
      next.push({
        x: 0.25 * current[i-1].x + 0.5 * current[i].x + 0.25 * current[i+1].x,
        y: 0.25 * current[i-1].y + 0.5 * current[i].y + 0.25 * current[i+1].y
      });
    }
    next.push(current[current.length - 1]); // Keep end fixed
    current = next;
  }
  return current;
}

/**
 * Generates a smooth multi-segment Cubic Bezier path that fits the river spine.
 * Uses adaptive control point scaling to prevent loops in sharp corners.
 */
function generateCurvedLabelPath(spine: Point[], labelWidth: number, tension: number = 0.5): string {
  if (spine.length < 2) return "";
  if (spine.length === 2) return `M ${spine[0].x} ${spine[0].y} L ${spine[1].x} ${spine[1].y}`;

  // 1. Calculate cumulative length of the raw spine
  const lengths = [0];
  let totalLen = 0;
  for (let i = 1; i < spine.length; i++) {
    const dist = Math.hypot(spine[i].x - spine[i-1].x, spine[i].y - spine[i-1].y);
    totalLen += dist;
    lengths.push(totalLen);
  }

  // 2. Determine dynamic step count
  const idealSegmentLength = Math.max(25, Math.min(60, labelWidth / 5));
  const numSegments = Math.max(2, Math.ceil(totalLen / idealSegmentLength));

  // 3. Resample the spine at uniform intervals
  const sampledPoints: Point[] = [];
  for (let i = 0; i <= numSegments; i++) {
    const targetDist = (i / numSegments) * totalLen;
    
    // Find the segment containing this distance
    let idx = 0;
    while (idx < lengths.length - 1 && lengths[idx + 1] < targetDist) {
      idx++;
    }
    
    if (idx >= lengths.length - 1) {
      sampledPoints.push(spine[spine.length - 1]);
    } else {
      // Linear interpolation between spine[idx] and spine[idx+1]
      const p0 = spine[idx];
      const p1 = spine[idx + 1];
      const dist0 = lengths[idx];
      const dist1 = lengths[idx + 1];
      const span = dist1 - dist0;
      const t = span > 0 ? (targetDist - dist0) / span : 0;
      
      sampledPoints.push({
        x: p0.x + (p1.x - p0.x) * t,
        y: p0.y + (p1.y - p0.y) * t
      });
    }
  }

  // 4. Generate Enhanced Cubic Beziers
  let d = `M ${sampledPoints[0].x} ${sampledPoints[0].y}`;
  const smoothnessBase = tension * 0.5; 

  const tangents: Point[] = [];
  const curvatureFactors: number[] = [];

  for (let i = 0; i < sampledPoints.length; i++) {
    const pPrev = sampledPoints[Math.max(0, i - 1)];
    const pCurr = sampledPoints[i];
    const pNext = sampledPoints[Math.min(sampledPoints.length - 1, i + 1)];
    
    let tx = pNext.x - pPrev.x;
    let ty = pNext.y - pPrev.y;
    const len = Math.hypot(tx, ty);
    if (len > 1e-6) { tx /= len; ty /= len; } else { tx = 1; ty = 0; }
    tangents.push({ x: tx, y: ty });

    let vx1 = pCurr.x - pPrev.x;
    let vy1 = pCurr.y - pPrev.y;
    const l1 = Math.hypot(vx1, vy1);
    if (l1 > 1e-6) { vx1 /= l1; vy1 /= l1; }

    let vx2 = pNext.x - pCurr.x;
    let vy2 = pNext.y - pCurr.y;
    const l2 = Math.hypot(vx2, vy2);
    if (l2 > 1e-6) { vx2 /= l2; vy2 /= l2; }

    if (i === 0 || i === sampledPoints.length - 1) {
        curvatureFactors.push(1.0);
    } else {
        const dot = vx1 * vx2 + vy1 * vy2;
        const factor = Math.max(0.2, (1 + dot) * 0.5 + 0.2); 
        curvatureFactors.push(Math.min(1.0, factor));
    }
  }

  for (let i = 0; i < sampledPoints.length - 1; i++) {
    const p0 = sampledPoints[i];
    const p1 = sampledPoints[i + 1];
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);

    const scale1 = smoothnessBase * curvatureFactors[i];
    const scale2 = smoothnessBase * curvatureFactors[i+1];

    const cp1 = {
      x: p0.x + tangents[i].x * dist * scale1,
      y: p0.y + tangents[i].y * dist * scale1
    };

    const cp2 = {
      x: p1.x - tangents[i+1].x * dist * scale2,
      y: p1.y - tangents[i+1].y * dist * scale2
    };

    d += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p1.x} ${p1.y}`;
  }

  return d;
}

/**
 * Traces the medial axis from a start point in a specific direction.
 */
function traceMedialPath(
  startPoint: Point, 
  startAngle: number, 
  targetLength: number, 
  polygon: Polygon, 
  direction: 1 | -1
): { points: Point[], actualLen: number } {
  const points: Point[] = [];
  let currentPos = { ...startPoint };
  let currentAngle = startAngle;
  let traveled = 0;
  
  const initialSnap = snapToMedialAxis(currentPos, currentAngle, polygon);
  let currentWidth = initialSnap.width;

  const MAX_STEPS = 1000;
  let steps = 0;

  while (traveled < targetLength && steps < MAX_STEPS) {
    steps++;

    const stepSize = Math.max(1.5, Math.min(20.0, currentWidth * 0.2));

    const localAngle = estimateRiverOrientation(currentPos, polygon);
    
    const dx = Math.cos(currentAngle), dy = Math.sin(currentAngle);
    const ldx = Math.cos(localAngle), ldy = Math.sin(localAngle);
    
    let targetAngle = localAngle;
    if (dx * ldx + dy * ldy < 0) targetAngle += Math.PI;
    
    currentAngle = currentAngle * 0.85 + targetAngle * 0.15;

    const nextGuess = { 
      x: currentPos.x + Math.cos(currentAngle) * stepSize * direction, 
      y: currentPos.y + Math.sin(currentAngle) * stepSize * direction 
    };

    if (!isPointInPolygon(nextGuess, polygon)) break;

    const snapped = snapToMedialAxis(nextGuess, currentAngle, polygon);
    const medial = snapped.point;
    currentWidth = snapped.width;
    
    const dist = Math.hypot(medial.x - currentPos.x, medial.y - currentPos.y);
    if (dist < 0.05) break; 

    points.push(medial);
    traveled += dist;
    currentPos = medial;
  }
  return { points, actualLen: traveled };
}

/**
 * Robust Pole of Inaccessibility Finder
 */
function findVisualCenter(polygon: Polygon, bounds: { min: Point, max: Point }): { p: Point, clearance: number } {
  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  
  // Increased resolution for better initial seed finding
  const resolution = 40; 
  const stepX = width / resolution;
  const stepY = height / resolution;
  
  let best = { p: polygon[0], clearance: 0 };
  
  for (let x = bounds.min.x; x <= bounds.max.x; x += stepX) {
    for (let y = bounds.min.y; y <= bounds.max.y; y += stepY) {
      const p = { x, y };
      if (isPointInPolygon(p, polygon)) {
        const d = getDistanceToEdge(p, polygon);
        if (d > best.clearance) {
          best = { p, clearance: d };
        }
      }
    }
  }

  // More aggressive random refinement
  for (let i = 0; i < 60; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (best.clearance || 10);
    const p = {
      x: best.p.x + Math.cos(angle) * dist,
      y: best.p.y + Math.sin(angle) * dist
    };
    if (isPointInPolygon(p, polygon)) {
      const d = getDistanceToEdge(p, polygon);
      if (d > best.clearance) {
        best = { p, clearance: d };
      }
    }
  }

  return best;
}

export function calculateLabelPlacement(
  polygon: Polygon, 
  label: string, 
  fontSize: number = 12,
  curveTension: number = 0.8,
  existingLabels: LabelBounds[] = []
): LabelingResult {
  const minX = Math.min(...polygon.map(p => p.x)), maxX = Math.max(...polygon.map(p => p.x));
  const minY = Math.min(...polygon.map(p => p.y)), maxY = Math.max(...polygon.map(p => p.y));
  const bounds = { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };

  // Calculate Text Dimensions
  const charWidth = fontSize * 0.7; 
  const textWidth = label.length * charWidth;
  const textHeight = fontSize * 1.2;

  // 1. Find Visual Center 
  const visualCenter = findVisualCenter(polygon, bounds);

  // 2. Systematic Seed Generation via Skeleton Sampling
  const seeds: Point[] = [];
  
  const originAngle = estimateRiverOrientation(visualCenter.p, polygon);
  const originSnap = snapToMedialAxis(visualCenter.p, originAngle, polygon);
  
  const maxDim = Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y);
  
  // Trace Master Spine
  const spineForward = traceMedialPath(originSnap.point, originAngle, maxDim, polygon, 1);
  const spineBackward = traceMedialPath(originSnap.point, originAngle, maxDim, polygon, -1);
  
  const masterSpine = [
    ...spineBackward.points.slice().reverse(),
    originSnap.point,
    ...spineForward.points
  ];
  
  // Sample seeds along this spine
  const sampleInterval = Math.max(textWidth * 0.2, 20); // Denser sampling
  let distAcc = 0;
  seeds.push(originSnap.point);
  
  for(let i = 1; i < masterSpine.length; i++) {
     const d = Math.hypot(masterSpine[i].x - masterSpine[i-1].x, masterSpine[i].y - masterSpine[i-1].y);
     distAcc += d;
     if(distAcc >= sampleInterval) {
        seeds.push(masterSpine[i]);
        distAcc = 0;
     }
  }

  // Cap seed count
  let finalSeeds = seeds;
  const MAX_SEEDS = 60;
  if (seeds.length > MAX_SEEDS) {
      finalSeeds = [];
      const step = Math.ceil(seeds.length / MAX_SEEDS);
      for(let i = 0; i < seeds.length; i += step) {
        finalSeeds.push(seeds[i]);
      }
  }

  const candidates: LabelPlacement[] = [];

  for (const seedPoint of finalSeeds) {
    if (!isPointInPolygon(seedPoint, polygon)) continue;

    const angle = estimateRiverOrientation(seedPoint, polygon);
    const snapped = snapToMedialAxis(seedPoint, angle, polygon);
    const startCenter = snapped.point;
    
    // Trace generous local spine
    const requiredSpan = textWidth * 1.5;
    const traceForward = traceMedialPath(startCenter, angle, requiredSpan, polygon, 1);
    const traceBackward = traceMedialPath(startCenter, angle, requiredSpan, polygon, -1);
    
    // Compose raw spine for this seed
    const rawSpine = [
      ...traceBackward.points.slice().reverse(),
      startCenter,
      ...traceForward.points
    ];

    // Calculate distances along spine
    const dists = [0];
    for(let i=1; i<rawSpine.length; i++) {
        dists.push(dists[i-1] + Math.hypot(rawSpine[i].x - rawSpine[i-1].x, rawSpine[i].y - rawSpine[i-1].y));
    }
    const totalLen = dists[dists.length - 1];

    if (totalLen < textWidth) continue;

    // Find seed index (which is at the end of backward points)
    const seedIndex = traceBackward.points.length;
    const seedDist = dists[seedIndex];

    // Define window centered on seed, but constrained by available length
    let startDist = seedDist - textWidth / 2;
    let endDist = seedDist + textWidth / 2;

    if (startDist < 0) {
        startDist = 0;
        endDist = Math.min(textWidth, totalLen);
    }
    if (endDist > totalLen) {
        endDist = totalLen;
        startDist = Math.max(0, totalLen - textWidth);
    }

    // Verify length of window (might be short if totalLen is just barely enough)
    if (endDist - startDist < textWidth * 0.95) continue;

    // Extract sub-spine
    const pathPoints: Point[] = [];
    
    for(let i=0; i<rawSpine.length - 1; i++) {
        const dCurrent = dists[i];
        const dNext = dists[i+1];

        if (dNext >= startDist && dCurrent <= endDist) {
            let p1 = rawSpine[i];
            let p2 = rawSpine[i+1];

            // Interpolate Start
            if (dCurrent < startDist) {
                const t = (startDist - dCurrent) / (dNext - dCurrent);
                p1 = {
                    x: rawSpine[i].x + (rawSpine[i+1].x - rawSpine[i].x) * t,
                    y: rawSpine[i].y + (rawSpine[i+1].y - rawSpine[i].y) * t
                };
            }
            
            // Interpolate End
            if (dNext > endDist) {
                 const t = (endDist - dCurrent) / (dNext - dCurrent);
                 p2 = {
                    x: rawSpine[i].x + (rawSpine[i+1].x - rawSpine[i].x) * t,
                    y: rawSpine[i].y + (rawSpine[i+1].y - rawSpine[i].y) * t
                 };
            }
            
            if (pathPoints.length === 0) pathPoints.push(p1);
            pathPoints.push(p2);
        }
    }

    if (pathPoints.length < 2) continue;
    
    // Smooth points
    const smoothedSpine = smoothSpine(pathPoints, 3);
    
    // Check clearance strictly along the actual path
    let minClearance = Infinity;
    let sumClearance = 0;
    const collisionPoints: Point[] = [];
    
    for (const p of smoothedSpine) {
        const c = getDistanceToEdge(p, polygon);
        if (c < minClearance) minClearance = c;
        sumClearance += c;
        // Mark as collision/warning if closer than 50% of text height (radius of text height)
        if (c < textHeight * 0.5) {
            collisionPoints.push(p);
        }
    }
    const avgClearance = sumClearance / smoothedSpine.length;

    // Strict Clearance Check: Reject if path gets too close to edge
    // Allowance: text height * 0.4 (radius) means text diameter 0.8. 
    // This implies we allow the text to be slightly larger than the river width (10% overlap).
    // If clearance is less than 0.35 * textHeight (diameter 0.7), it likely overlaps significantly.
    if (minClearance < textHeight * 0.35) continue;

    const path = generateCurvedLabelPath(smoothedSpine, textWidth, curveTension); 

    // Bounds for simple collision
    const pathXs = smoothedSpine.map(p => p.x);
    const pathYs = smoothedSpine.map(p => p.y);
    const minP = { x: Math.min(...pathXs), y: Math.min(...pathYs) };
    const maxP = { x: Math.max(...pathXs), y: Math.max(...pathYs) };
    const radius = Math.hypot(maxP.x - minP.x, maxP.y - minP.y) / 2;
    
    const labelBounds: LabelBounds = {
      min: { x: minP.x - textHeight, y: minP.y - textHeight },
      max: { x: maxP.x + textHeight, y: maxP.y + textHeight },
      center: startCenter,
      radius: radius + textHeight
    };

    // Scoring Weights
    const clearanceScore = Math.min(1, minClearance / (textHeight * 0.6));
    const distToVisualCenter = Math.hypot(startCenter.x - visualCenter.p.x, startCenter.y - visualCenter.p.y);
    const centerScore = 1 / (1 + distToVisualCenter * 0.05);

    // Heavily favor clearance to solve "overlapping edges" issue
    const score = (clearanceScore * 5.0) + (centerScore * 1.0);

    candidates.push({
      center: startCenter,
      angle,
      score,
      width: textWidth,
      height: textHeight,
      clearance: avgClearance,
      path,
      bounds: labelBounds,
      collisionPoints
    });
  }

  const sortedCandidates = candidates.sort((a, b) => b.score - a.score);
  let best = sortedCandidates.length > 0 ? sortedCandidates[0] : null;

  if (!best) {
     const angle = estimateRiverOrientation(visualCenter.p, polygon);
     const start = { 
         x: visualCenter.p.x - Math.cos(angle) * textWidth/2, 
         y: visualCenter.p.y - Math.sin(angle) * textWidth/2 
     };
     const end = { 
         x: visualCenter.p.x + Math.cos(angle) * textWidth/2, 
         y: visualCenter.p.y + Math.sin(angle) * textWidth/2 
     };
     
     // Generate fallback collision points
     const fallbackCols: Point[] = [];
     const steps = 10;
     for(let i=0; i<=steps; i++){
         const t = i/steps;
         const p = { x: start.x + (end.x - start.x)*t, y: start.y + (end.y - start.y)*t };
         if (getDistanceToEdge(p, polygon) < textHeight * 0.5) fallbackCols.push(p);
     }

     best = {
         center: visualCenter.p,
         angle,
         score: 0,
         width: textWidth,
         height: textHeight,
         clearance: visualCenter.clearance,
         path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
         bounds: { min: start, max: end, center: visualCenter.p, radius: textWidth },
         collisionPoints: fallbackCols
     };
  }

  return {
    placed: best,
    candidates: sortedCandidates,
    centroid: visualCenter.p,
    bounds
  };
}
