(function (root, factory) {
  "use strict";
  root.EnthusiaMapCore = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const clone = value => JSON.parse(JSON.stringify(value));
  const numericPart = value => Number(String(value).match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
  const naturalCompare = (a, b) => numericPart(a) - numericPart(b) || String(a).localeCompare(String(b));

  function compressStallRanges(ids) {
    const numbers = [...new Set(ids.map(numericPart).filter(Number.isFinite))].sort((a, b) => a - b);
    if (!numbers.length) return "No stalls";
    const ranges = [];
    for (let start = 0; start < numbers.length;) {
      let end = start;
      while (end + 1 < numbers.length && numbers[end + 1] === numbers[end] + 1) end += 1;
      ranges.push(start === end ? `${numbers[start]}` : `${numbers[start]}\u2013${numbers[end]}`);
      start = end + 1;
    }
    return `${numbers.length === 1 ? "Stall" : "Stalls"} ${ranges.join(", ")}`;
  }

  function pointOnSegment(point, a, b, epsilon = 1e-7) {
    const cross = (point.z - a.z) * (b.x - a.x) - (point.x - a.x) * (b.z - a.z);
    if (Math.abs(cross) > epsilon) return false;
    return point.x >= Math.min(a.x, b.x) - epsilon && point.x <= Math.max(a.x, b.x) + epsilon && point.z >= Math.min(a.z, b.z) - epsilon && point.z <= Math.max(a.z, b.z) + epsilon;
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if (pointOnSegment(point, a, b)) return true;
      if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / ((b.z - a.z) || 1e-12) + a.x) inside = !inside;
    }
    return inside;
  }

  function polygonArea(polygon) {
    let area = 0;
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      area += a.x * b.z - b.x * a.z;
    }
    return area / 2;
  }

  function orientation(a, b, c) {
    const value = (b.z - a.z) * (c.x - b.x) - (b.x - a.x) * (c.z - b.z);
    return Math.abs(value) < 1e-9 ? 0 : value > 0 ? 1 : 2;
  }
  function segmentsIntersect(a, b, c, d) {
    return orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b);
  }
  function polygonSelfIntersects(polygon) {
    for (let i = 0; i < polygon.length; i += 1) for (let j = i + 1; j < polygon.length; j += 1) {
      if ((i + 1) % polygon.length === j || i === (j + 1) % polygon.length) continue;
      if (segmentsIntersect(polygon[i], polygon[(i + 1) % polygon.length], polygon[j], polygon[(j + 1) % polygon.length])) return true;
    }
    return false;
  }

  function distanceToSegment(point, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = dx || dz ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz))) : 0;
    return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
  }
  function signedDistance(point, polygon) {
    let distance = Infinity;
    for (let i = 0; i < polygon.length; i += 1) distance = Math.min(distance, distanceToSegment(point, polygon[i], polygon[(i + 1) % polygon.length]));
    return (pointInPolygon(point, polygon) ? 1 : -1) * distance;
  }
  function interiorLabelPoint(polygon, precision = 0.25) {
    const xs = polygon.map(p => p.x), zs = polygon.map(p => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    let best = {x: minX, z: minZ, d: -Infinity};
    const size = Math.min(maxX - minX, maxZ - minZ) || 1, queue = [];
    for (let x = minX; x < maxX; x += size) for (let z = minZ; z < maxZ; z += size) {
      const h = size / 2, point = {x: x + h, z: z + h}; queue.push({...point, h, d: signedDistance(point, polygon)});
    }
    while (queue.length) {
      queue.sort((a, b) => (b.d + b.h * Math.SQRT2) - (a.d + a.h * Math.SQRT2));
      const cell = queue.shift();
      if (cell.d > best.d) best = cell;
      if (cell.d + cell.h * Math.SQRT2 - best.d <= precision) continue;
      const h = cell.h / 2;
      for (const dx of [-h, h]) for (const dz of [-h, h]) {
        const point = {x: cell.x + dx, z: cell.z + dz}; queue.push({...point, h, d: signedDistance(point, polygon)});
      }
    }
    return {x: best.x, z: best.z};
  }

  function hitTestBuildings(buildings, point) {
    return buildings.filter(building => pointInPolygon(point, building.footprint)).sort((a, b) => Math.abs(polygonArea(a.footprint)) - Math.abs(polygonArea(b.footprint)))[0] || null;
  }
  function snap(value, mode = "block") {
    if (mode === "free") return value;
    const increment = mode === "half" ? 0.5 : 1;
    return Math.round(value / increment) * increment;
  }
  function nextBuildingId(buildings) {
    const used = new Set(buildings.map(building => building.id));
    let value = 1; while (used.has(`building-${value}`)) value += 1;
    return `building-${value}`;
  }
  const floorName = index => `Floor ${index}`;

  function validateLayout(layout) {
    const errors = [], warnings = [], ownership = new Map(layout.stalls.map(stall => [stall.id, []]));
    for (const building of layout.buildings) {
      if (!building.stallIds?.length) errors.push({type:"empty-building", buildingId:building.id, message:`${building.id} has no stalls.`});
      if (!building.footprint || building.footprint.length < 3 || Math.abs(polygonArea(building.footprint)) < 0.01) errors.push({type:"zero-area", buildingId:building.id, message:`${building.id} needs a valid outline.`});
      else if (polygonSelfIntersects(building.footprint)) errors.push({type:"self-intersection", buildingId:building.id, message:`${building.id} outline crosses itself.`});
      for (const stallId of building.stallIds || []) {
        if (!ownership.has(stallId)) errors.push({type:"unknown-stall", buildingId:building.id, stallId, message:`${building.id} contains unknown ${stallId}.`});
        else ownership.get(stallId).push(building.id);
      }
    }
    for (const [stallId, owners] of ownership) {
      if (!owners.length) errors.push({type:"missing-assignment", stallId, message:`${stallId} is not assigned.`});
      if (owners.length > 1) errors.push({type:"duplicate-assignment", stallId, message:`${stallId} is assigned to ${owners.join(", ")}.`});
      if (owners.length === 1) {
        const stall = layout.stalls.find(candidate => candidate.id === stallId), building = layout.buildings.find(candidate => candidate.id === owners[0]);
        const intersects = pointInPolygon({x:stall.centerX,z:stall.centerZ}, building.footprint) || stall.polygon.some(point => pointInPolygon(point, building.footprint));
        if (!intersects && !layout.metadata?.outsideStallConfirmations?.includes(stallId)) errors.push({type:"outside-stall", stallId, buildingId:building.id, message:`${stallId} falls outside ${building.id}. Confirm or redraw it.`});
      }
    }
    return {valid:errors.length === 0, errors, warnings};
  }

  return {clone,naturalCompare,compressStallRanges,pointInPolygon,polygonArea,polygonSelfIntersects,interiorLabelPoint,hitTestBuildings,snap,nextBuildingId,floorName,validateLayout};
});
