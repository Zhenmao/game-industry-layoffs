const accessors = {
  studio: (d) => d["Studio"],
  date: (d) => d["Date"],
  headcount: (d) => d["Headcount"],
  parent: (d) => d["Parent"],
  type: (d) => d["Type"],
  studioLocation: (d) => d["Studio Location"],
  parentLocation: (d) => d["Parent Location"],
};

const formatDate = new Intl.DateTimeFormat(undefined, {
  dateStyle: "long",
}).format;
const formatCount = new Intl.NumberFormat(undefined).format;

const unknownRadius = 10;
const dotRadius = 0.5;
const circlePadding = 2;
const radius = 360;
const marginTop = 60;
const marginRight = 160;
const marginBottom = 80;
const marginLeft = 60;
const width = radius * 2 + marginLeft + marginRight;
const height = radius * 2 + marginTop + marginBottom;

const container = d3.select("#layoffsChart").attr("class", "chart");

const dpr = window.devicePixelRatio || 1;
const canvas = container
  .append("canvas")
  .attr("width", width * dpr)
  .attr("height", height * dpr)
  .style("width", width + "px");
const ctx = canvas.node().getContext("2d");
ctx.scale(dpr, dpr);
ctx.translate(marginLeft + radius, marginTop + radius);

const svg = container
  .append("svg")
  .attr("width", width)
  .attr("height", height)
  .attr("viewBox", [-marginLeft - radius, -marginTop - radius, width, height]);
const timePath = svg.append("path").attr("class", "time-path");
const layoffCirclesG = svg.append("g").attr("class", "layoff-circles-g");
const datesG = svg.append("g").attr("class", "dates-g");

const tooltip = container.append("div").attr("class", "tooltip");

// 0 degrees start at 12 o'clock
const aScale = d3.scaleUtc().range([-Math.PI * 0.5, -Math.PI * (2.5 - 0.25)]);

d3.csv("data.csv", d3.autoType).then(processData).then(draw);

function draw(data) {
  const styles = getComputedStyle(container.node());
  const layoffCircleFill = styles.getPropertyValue(
    "--color-layoff-circle-fill"
  );
  const layoffDotFill = styles.getPropertyValue("--color-layoff-dot-fill");

  ctx.clearRect(-marginLeft - radius, -marginTop - radius, width, height);

  ctx.save();
  ctx.beginPath();
  data.forEach((d) => {
    ctx.moveTo(d.x + d.r - circlePadding, d.y);
    ctx.arc(d.x, d.y, d.r - circlePadding, 0, Math.PI * 2);
  });
  ctx.fillStyle = layoffCircleFill;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  data.forEach((d) => {
    d.dots.forEach((e) => {
      ctx.moveTo(d.x + e.x + e.r, d.y + e.y);
      ctx.arc(d.x + e.x, d.y + e.y, e.r, 0, Math.PI * 2);
    });
  });
  ctx.fillStyle = layoffDotFill;
  ctx.fill();
  ctx.restore();

  timePath.attr("d", () => {
    const p = d3.path();
    const [startAngle, endAngle] = aScale.range();
    p.moveTo(radius * Math.cos(startAngle), radius * Math.sin(startAngle));
    p.arc(0, 0, radius, startAngle, endAngle, true);
    return p.toString();
  });

  layoffCirclesG
    .selectAll(".layoff-circle")
    .data(data)
    .join((enter) =>
      enter
        .append("circle")
        .attr("class", "layoff-circle")
        .attr("r", (d) => d.r)
        .attr("cx", (d) => d.x)
        .attr("cy", (d) => d.y)
        .on("pointerenter", entered)
        .on("pointermove", moved)
        .on("pointerleave", left)
        .on("touchstart", (event) => event.preventDefault())
    );

  datesG
    .selectAll(".date-text")
    .data(aScale.ticks(5))
    .join((enter) =>
      enter
        .append("text")
        .attr("class", "date-text")
        .attr("transform", (d) => {
          const a = aScale(d);
          const r = radius + 8;
          const x = r * Math.cos(a);
          const y = r * Math.sin(a);
          return `translate(${x},${y})`;
        })
        .attr("text-anchor", (d) => {
          const a = aScale(d);
          return a > (-Math.PI / 2) * 3 ? "end" : "start";
        })
        .text((d) => d.getUTCFullYear())
    );
}

function entered(event, d) {
  d3.select(this).classed("active", true);
  const count = accessors.headcount(d.data);
  tooltip
    .html(
      `
  <div>${accessors.studio(d.data)}</div>
  <div>${formatDate(accessors.date(d.data))}</div>
  <div>Headcount: ${count ? formatCount(count) : "Unknown"}</div>  
  `
    )
    .classed("visible", true);
  moved(event);
}

function moved(event) {
  const offset = 10;
  const isRight = event.clientX < window.innerWidth / 2;
  const isBottom = event.clientY < window.innerHeight / 2;
  const transX = isRight
    ? `${event.clientX + offset}px`
    : `calc(-100% + ${event.clientX - offset}px)`;
  const transY = isBottom
    ? `${event.clientY + offset}px`
    : `calc(-100% + ${event.clientY - offset}px)`;
  tooltip.style("transform", `translate(${transX},${transY})`);
}

function left() {
  d3.select(this).classed("active", false);
  tooltip.classed("visible", false);
}

function processData(csv) {
  const initialRadius = dotRadius * 2;
  const initialAngle = Math.PI * (3 - Math.sqrt(5));

  csv = csv
    .slice()
    .sort((a, b) => d3.ascending(accessors.date(a), accessors.date(b)));
  const startDate = d3.utcMonth.floor(accessors.date(csv[0]));
  const endDate = d3.utcMonth.ceil(accessors.date(csv[csv.length - 1]));
  aScale.domain([startDate, endDate]);

  const data = csv.map((d) => {
    const a = aScale(accessors.date(d));
    const x = radius * Math.cos(a);
    const y = radius * Math.sin(a);
    let r = unknownRadius;
    let dots = [];
    if (accessors.headcount(d) > 0) {
      // Dot layout follows a phyllotaxis arrangement https://github.com/d3/d3-force/blob/main/src/simulation.js#L69
      for (let i = 0; i < accessors.headcount(d); i++) {
        const radius = initialRadius * Math.sqrt(0.5 + i);
        const angle = i * initialAngle;
        dots.push({
          x: radius * Math.cos(angle),
          y: radius * Math.sin(angle),
          r: dotRadius,
        });
      }
      const enclosingCircle = d3.packEnclose(dots);
      r = Math.round(enclosingCircle.r) + circlePadding;
    }
    return {
      data: d,
      angle: (a / Math.PI) * 180,
      x,
      y,
      r,
      dots,
    };
  });

  d3.forceSimulation(data)
    .force("radial", d3.forceRadial().radius(radius).strength(0.01))
    .force(
      "angle",
      forceAngular()
        .angle((d) => d.angle)
        .strength(0.1)
    )
    .force(
      "collision",
      d3
        .forceCollide()
        .radius((d) => d.r - circlePadding + 1)
        .iterations(3)
    )
    .tick(300);

  return data;
}

// https://observablehq.com/@fil/forceangular
function constant(x) {
  return function (_) {
    return x;
  };
}
function forceAngular(angle, x, y) {
  var nodes,
    strength = constant(0.1),
    strengths,
    angles;

  if (typeof angle !== "function") angle = constant(+angle);
  if (x == null) x = 0;
  if (y == null) y = 0;

  function force(alpha) {
    for (var i = 0, n = nodes.length; i < n; ++i) {
      var node = nodes[i],
        dx = node.x - x || 1e-6,
        dy = node.y - y || 1e-6,
        a = Math.atan2(dy, dx),
        r = Math.hypot(dy, dx),
        diff = angles[i] - a,
        k = r * Math.sin(diff) * (strengths[i] * alpha);

      // the factor below augments the "unease" for points that are opposite the correct direction:
      // in that case, though sin(diff) is small, tan(diff/2) is very high
      k *= Math.hypot(1, Math.tan(diff / 2));

      node.vx += -k * Math.sin(a);
      node.vy += k * Math.cos(a);
    }
  }

  function initialize() {
    if (!nodes) return;
    var i,
      n = nodes.length;
    strengths = new Array(n);
    angles = new Array(n);
    for (i = 0; i < n; ++i) {
      angles[i] = +angle(nodes[i], i, nodes) * (Math.PI / 180);
      strengths[i] = isNaN(angles[i]) ? 0 : +strength(nodes[i], i, nodes);
    }
  }

  force.initialize = function (_) {
    (nodes = _), initialize();
  };

  force.strength = function (_) {
    return arguments.length
      ? ((strength = typeof _ === "function" ? _ : constant(+_)),
        initialize(),
        force)
      : strength;
  };

  force.angle = function (_) {
    return arguments.length
      ? ((angle = typeof _ === "function" ? _ : constant(+_)),
        initialize(),
        force)
      : angle;
  };

  force.x = function (_) {
    return arguments.length ? ((x = +_), force) : x;
  };

  force.y = function (_) {
    return arguments.length ? ((y = +_), force) : y;
  };

  return force;
}
