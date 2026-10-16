import {historyPosition} from './history-model.js?v=2';
export function drawHistoryChart(it,{state,model,s,gold,pct}) {
    const chartEnd=Date.now();
    var W = 420, H = 240, L = 56, R = 404, T = 16, B = 200;
    var mn = it.lo * 0.97, mx = it.hi * 1.03, span = mx - mn || 1;
    function x(i) { return L + (model.preview?i/Math.max(1,it.days.length-1):historyPosition(it.days,i,chartEnd)) * (R - L); }
    function y(v) { return B - (v - mn) / span * (B - T); }
    var svg = s("svg", { class: "mi-chart", viewBox: "0 0 " + W + " " + H, role: "img", tabindex: "0",
      "aria-label": it.name + " price over the last 30 days, now " + gold(it.price) + " gold, " + pct(it.d7) + (model.preview?" this week.":" compared with the preceding 30 days.") + " Use the left and right arrow keys to read each day." });
    for (var g = 0; g < 4; g++) {
      var gy = T + g * (B - T) / 3, gv = mx - g * span / 3;
      svg.appendChild(s("line", { x1: L, x2: R, y1: gy, y2: gy, class: "grid" }));
      var t = s("text", { x: L - 8, y: gy + 5, "text-anchor": "end" }); t.textContent = gold(gv); svg.appendChild(t);
    }
    var band = it.days.map(function (p, i) { return x(i).toFixed(1) + "," + y(p.hi).toFixed(1); })
      .concat(it.days.slice().reverse().map(function (p, i) { return x(it.days.length-1-i).toFixed(1) + "," + y(p.lo).toFixed(1); }));
    if(model.preview)svg.appendChild(s("polygon", { points: band.join(" "), class: "band" }));
    svg.appendChild(s("polyline", { points: it.days.map(function (p, i) { return x(i).toFixed(1) + "," + y(p.avg).toFixed(1); }).join(" "), class: "avg" }));
    [["30 days ago", L, "start"], ["15 days", (L + R) / 2, "middle"], ["Today", R, "end"]].forEach(function (a) {
      var tx = s("text", { x: a[1], y: H - 12, "text-anchor": a[2] }); tx.textContent = a[0]; svg.appendChild(tx);
    });
    var cur = s("line", { class: "cur", y1: T, y2: B, x1: x(state.idx), x2: x(state.idx) });
    var dot = s("rect", { class: "pt", width: 12, height: 12, x: x(state.idx) - 6, y: y(it.days[state.idx].avg) - 6 });
    svg.appendChild(cur); svg.appendChild(dot);
    return { svg: svg, end:chartEnd, move: function (i) { cur.setAttribute("x1", x(i)); cur.setAttribute("x2", x(i)); dot.setAttribute("x", x(i) - 6); dot.setAttribute("y", y(it.days[i].avg) - 6); } };
  }
