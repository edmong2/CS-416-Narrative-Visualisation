// script.js
console.log("Script loaded—and ready for D3!");

// 1. Data URLs
const topoURL   = "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";
const countyCSV = "https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-counties.csv";

// wave annotation texts and button labels (no longer used, but kept for future repurposing)
const waveLabels = ["Spring 2020 Surge", "Summer 2020 Surge", "Winter 2020 Surge"];
const btnLabels  = ["Next",             "Next",              "Explore"];

// Timeline state
let timelineIndex = 0;
let autoplay = false;
let autoplayInterval = null;
let autoplaySpeed = 1; // default speed (1x, 100ms per frame)

function setPlayButtonState(isPlaying) {
  d3.select("#play-btn").text(isPlaying ? "Pause" : "Play");
}

function stopAutoplay() {
  autoplay = false;
  if (autoplayInterval) {
    clearInterval(autoplayInterval);
    autoplayInterval = null;
  }
  setPlayButtonState(false);
}

function startAutoplay() {
  stopAutoplay(); // Always clear any previous interval
  autoplay = true;
  setPlayButtonState(true);
  let baseMs = 100;
  let intervalMs = baseMs / autoplaySpeed;
  autoplayInterval = setInterval(() => {
    if (!autoplay) return;
    if (timelineIndex < dates.length - 1) {
      timelineIndex++;
      updateTimelineDate(false);
    } else {
      stopAutoplay();
    }
  }, intervalMs);
}
// Always start in Explore mode
let scene = 3;

// 2. Globals for processed data
let countyFeatures,
    dates,
    dailyNewCasesByDate,
    monthlyCasesByDate,
    cumulativeCasesByDate,
    waveAverages,
    globalMax,
    cumulativeMax;

// --- Global view mode: 'daily' or 'cumulative' ---
let viewMode = 'cumulative'; // default

// Key narrative pause points (must be declared before any function that uses them)
const keyStages = [
 {
    date: '2020-05-31',
    title: 'End of Wave 1',
    desc:  'After rapid exponential growth in March and April, driven by outbreaks in New York City, Seattle and other early hotspots,the first national surge tapers off. Hospitals stabilise, with case counts settling into a plateau around 20-25k new cases per day as lockdowns and social distancing take effect.'
  },
  {
    date: '2020-09-30',
    title: 'End of Wave 2',
    desc:  'The “Sun Belt” wave in June-August, fueled by reopenings in Florida, Texas, Arizona and other southern states,slows by late September. Although daily averages fall from their July highs of 70k, many regions sustain elevated transmission into the fall, setting the stage for winter resurgence.'
  },
  {
    date: '2021-01-31',
    title: 'End of Wave 3',
    desc:  'The post-holiday winter wave, driven by colder weather and relaxed gatherings, reaches its peak with over 250k new cases per day, an all-time high. By January’s end, daily counts begin a gradual decline, even as hospitalisations remain severe in many areas.'
  },
  {
    date: '2021-07-01',
    title: 'Delta Variant Emerges',
    desc:  'Just as case counts dipped into spring lows, the highly transmissible Delta variant takes hold. Beginning in late June, daily new cases climb from under 20k back up toward 50k, with rural and under-vaccinated counties seeing disproportionate surges.'
  },
  {
    date: '2021-12-15',
    title: 'Omicron Variant Surges',
    desc:  'By mid-December, the Omicron variant, a far more contagious strain than any prior, drives new daily cases past 400k. Surges with intense hotspots nationwide are seen, demonstrating both its rapid spread and the limits of prior immunity.'
  }
];
// Map key dates to timeline indices
let keyStageIndices = [];



// --- Patch timeline logic to handle overlays, view mode, and unified update ---
// Integrate view mode dropdown into controls on entering Explore mode
function ensureViewModeControl() {
  if (d3.select('#view-mode-select').empty()) {
    setupViewModeControl();
  }
  d3.select('#view-mode-select').style('display', 'inline-block');
}

// Map key narrative dates to timeline indices (run after dates are loaded)
function computeKeyStageIndices() {
  keyStageIndices = keyStages.map(stage => {
    const idx = dates.findIndex(d => d >= stage.date);
    return idx !== -1 ? idx : null;
  }).filter(idx => idx !== null);
}

// Annotation panel logic for key stages (sidebar, with pause/continue)
let currentKeyStageIndex = null;
let annotationPauseActive = false;
let wasAutoplayingBeforeAnnotation = false;
function checkAndShowAnnotation(idx) {
  let found = null;
  keyStageIndices.forEach((stageIdx, i) => {
    if (stageIdx === idx) {
      found = i;
    }
  });
  if (found !== null && found !== currentKeyStageIndex) {
    // Pause playback and block timeline advancement
    wasAutoplayingBeforeAnnotation = autoplay;
    annotationPauseActive = true;
    stopAutoplay();
    showKeyStageAnnotation(keyStages[found], found);
    currentKeyStageIndex = found;
  } else if (found === null && currentKeyStageIndex !== null) {
    removeKeyStageAnnotation();
    annotationPauseActive = false;
    currentKeyStageIndex = null;
  }
}



// Annotation panel implementation (sidebar)
function showKeyStageAnnotation(stage, idx) {
  removeKeyStageAnnotation();
  // Add annotation panel fixed to the right side of the viewport
  let panel = d3.select('#annotation-panel');
  if (panel.empty()) {
    panel = d3.select('body').append('div').attr('id', 'annotation-panel');
    panel.style('position', 'fixed')
      .style('top', '50%')
      .style('right', '32px')
      .style('transform', 'translateY(-50%)')
      .style('width', '340px')
      .style('background', '#fff')
      .style('padding', '24px 28px')
      .style('border-radius', '10px')
      .style('box-shadow', '0 2px 16px rgba(0,0,0,0.13)')
      .style('z-index', 1000)
      .style('font-family', 'sans-serif');
  }
  panel.html('');
  panel.append('h2')
    .text(stage.title)
    .style('margin-bottom', '10px');
  panel.append('p')
    .text(stage.desc)
    .style('margin-bottom', '18px');
  panel.append('button')
    .attr('id', 'continue-annotation-btn')
    .text('Continue')
    .style('font-size', '16px')
    .style('padding', '8px 24px')
    .style('border-radius', '6px')
    .style('border', 'none')
    .style('background', '#1976d2')
    .style('color', '#fff')
    .style('cursor', 'pointer')
    .on('click', function(event) {
      event.stopPropagation();
      removeKeyStageAnnotation();
      annotationPauseActive = false;
      if (wasAutoplayingBeforeAnnotation) {
        startAutoplay();
      }
    });
}

function removeKeyStageAnnotation() {
  d3.select('#annotation-panel').remove();
}

// Patch timeline and autoplay logic to use updateExploreMap and overlays
function updateTimelineDate(useTransition = true) {
  d3.select("#timeline-date").text(dates[timelineIndex]);
  d3.select("#timeline-slider").property("value", timelineIndex);
  updateExploreMap(timelineIndex, useTransition);
  // Block timeline advancement if annotation pause is active
  if (annotationPauseActive) return;
  checkAndShowAnnotation(timelineIndex);
  if (window._tooltipUpdateFn) window._tooltipUpdateFn();
}

function startAutoplay() {
  autoplay = true;
  d3.select("#play-btn").text("Pause");
  let baseMs = 100;
  let intervalMs = baseMs / autoplaySpeed;
  autoplayInterval = setInterval(() => {
    if (!autoplay) return; // Respect pause immediately
    if (annotationPauseActive) return; // Block timeline advancement at key stage
    if (timelineIndex < dates.length - 1) {
      timelineIndex++;
      updateTimelineDate(false);
    } else {
      stopAutoplay();
    }
  }, intervalMs);
}

// Patch setupTimeline to use new logic and show view mode control
function setupTimeline() {
  if (d3.select("#timeline-controls").empty()) {
    d3.select("#controls")
      .append("div")
      .attr("id", "timeline-controls")
      .style("display", "none")
      .style("align-items", "center")
      .style("gap", "10px")
      .html(`
        <button id="play-btn">Play</button>
        <input id="timeline-slider" type="range" min="0" max="${dates.length - 1}" value="0" style="width:300px;">
        <span id="timeline-date"></span>
      `);
  }
  if (d3.select("#speed-dropdown").empty()) {
    d3.select("#controls")
      .append("select")
      .attr("id", "speed-dropdown")
      .style("margin-left", "12px")
      .style("font-size", "14px")
      .html(`
        <option value="0.5">0.5x</option>
        <option value="1" selected>1x</option>
        <option value="1.5">1.5x</option>
        <option value="2">2x</option>
      `);
  }
  // Add view mode control
  ensureViewModeControl();
  d3.select('#view-mode-select').style('display', 'inline-block');

  d3.select("#timeline-slider").on("input", function() {
    timelineIndex = +this.value;
    updateTimelineDate(true); // Use transitions for manual scrubbing
    stopAutoplay();
  });
  d3.select("#play-btn").on("click", function() {
    if (autoplay) {
      stopAutoplay();
    } else {
      startAutoplay();
    }
  });
  d3.select("#speed-dropdown").on("change", function() {
    autoplaySpeed = +this.value;
    if (autoplay) {
      startAutoplay(); // This will clear and restart interval
    }
  });
  d3.select('#view-mode-select').on('change', function() {
    viewMode = this.value;
    updateExploreMap(timelineIndex, true);
  });
  updateTimelineDate();
}

// Patch drawScene to use unified update and show controls
function drawScene(i) {
  // Only Explore mode
  d3.select("#controls").selectAll(".annotation").remove();
  d3.select("#controls")
    .append("div")
    .attr("class", "annotation")
    .text("Explore: use the timeline and controls below");
  d3.select("#next-btn")
    .text("Explore")
    .attr("disabled", true);
  d3.select("#timeline-controls").style("display", "flex");
  ensureViewModeControl();
  d3.select('#view-mode-select').style('display', 'inline-block');
  updateTimelineDate();
}



// On load, compute key stage indices
// (Call after dates are loaded)
// (Do not call here; call after 'dates' is initialized in data load)

// SVG + projection setup
const svg = d3.select("#map"),
      width  = +svg.attr("width"),
      height = +svg.attr("height");

const projection = d3.geoAlbersUsa()
    .translate([width / 2, height / 2])
    .scale(1300);

const path = d3.geoPath().projection(projection);

d3.select("#loading").style("display", "flex");
// --- Tooltip logic ---
function addTooltip() {
  // Remove any existing tooltip
  d3.select("body").selectAll(".county-tooltip").remove();
  // Add tooltip div
  d3.select("body")
    .append("div")
    .attr("class", "county-tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("background", "rgba(255,255,255,0.95)")
    .style("border", "1px solid #aaa")
    .style("border-radius", "4px")
    .style("padding", "6px 10px")
    .style("font-size", "13px")
    .style("font-family", "sans-serif")
    .style("box-shadow", "0 2px 8px rgba(0,0,0,0.15)")
    .style("display", "none");

  // Attach events to counties after map is drawn
  // Called after every map update
  function attachEvents(getValue, getLabel) {
    // Track hovered county and mouse position
    if (!window._hoveredCountyDatum) window._hoveredCountyDatum = null;
    if (!window._hoveredCountyMouse) window._hoveredCountyMouse = null;
    function showTooltip(d, event) {
      const tooltip = d3.select(".county-tooltip");
      const value = getValue(d);
      const label = getLabel(d);
      const dateStr = dates[timelineIndex];
      let monthly = null, cumulative = null;
      if (monthlyCasesByDate && monthlyCasesByDate.has(dateStr)) {
        monthly = monthlyCasesByDate.get(dateStr).get(d.id);
      }
      if (cumulativeCasesByDate && cumulativeCasesByDate.has(dateStr)) {
        cumulative = cumulativeCasesByDate.get(dateStr).get(d.id);
      }
      let html = `<strong>${label}</strong><br>`;
      html += `New cases: ${value !== undefined ? value : 'N/A'}<br>`;
      html += `30-day cases: ${monthly !== undefined && monthly !== null ? monthly : 'N/A'}<br>`;
      html += `Total cases: ${cumulative !== undefined && cumulative !== null ? cumulative : 'N/A'}`;
      let x = event ? event.pageX : (window._hoveredCountyMouse ? window._hoveredCountyMouse[0] : 0);
      let y = event ? event.pageY : (window._hoveredCountyMouse ? window._hoveredCountyMouse[1] : 0);
      tooltip.html(html)
        .style("left", (x + 15) + "px")
        .style("top", (y - 10) + "px")
        .style("display", "block");
    }
    svg.selectAll("path")
      .on("mousemove", function(event, d) {
        window._hoveredCountyDatum = d;
        window._hoveredCountyMouse = [event.pageX, event.pageY];
        showTooltip(d, event);
      })
      .on("mouseleave", function() {
        window._hoveredCountyDatum = null;
        window._hoveredCountyMouse = null;
        d3.select(".county-tooltip").style("display", "none");
      });
    // Expose for timeline update (always overwrite)
    window._tooltipUpdateFn = () => {
      if (window._hoveredCountyDatum) {
        showTooltip(window._hoveredCountyDatum, null);
      }
    };
  }

  // Expose for use after each map update
  addTooltip.attachEvents = attachEvents;
}

// Load TopoJSON + CSV
Promise.all([
  d3.json(topoURL),
  d3.csv(countyCSV, d => ({
    date:   d3.timeParse("%Y-%m-%d")(d.date),
    fips:   d.fips ? d.fips.padStart(5, '0') : undefined,
    cases:  +d.cases
  }))
]).then(([usTopo, raw]) => {
  // Extract county features
  countyFeatures = topojson.feature(usTopo, usTopo.objects.counties).features;
  // Ensure countyFeatures have id as zero-padded 5-digit string
  countyFeatures.forEach(f => {
    f.id = f.id ? f.id.padStart(5, '0') : f.id;
  });


  //Filter out rows with missing fips, then sort CSV by date then fips
  const filteredRaw = raw.filter(d => d.fips);
  filteredRaw.sort((a, b) => a.date - b.date || a.fips.localeCompare(b.fips));


    // Compute dailyNewCasesByDate, cumulativeCasesByDate, and monthlyCasesByDate (30-day rolling sum)
    dailyNewCasesByDate = new Map();
    cumulativeCasesByDate = new Map();
    monthlyCasesByDate = new Map();
    const byFips = d3.group(filteredRaw, d => d.fips);
    byFips.forEach(arr => {
    for (let i = 0; i < arr.length; ++i) {
        const d = arr[i];
        const dateStr = d3.timeFormat("%Y-%m-%d")(d.date);
        const prev = i > 0 ? arr[i - 1].cases : 0;
        const newCases = d.cases - prev;
        if (!dailyNewCasesByDate.has(dateStr)) {
        dailyNewCasesByDate.set(dateStr, new Map());
        cumulativeCasesByDate.set(dateStr, new Map());
        }
        dailyNewCasesByDate.get(dateStr).set(d.fips, newCases);
        cumulativeCasesByDate.get(dateStr).set(d.fips, d.cases);
    }
    // Compute 30-day rolling sum for this county
    for (let i = 0; i < arr.length; ++i) {
        const d = arr[i];
        const dateStr = d3.timeFormat("%Y-%m-%d")(d.date);
        let sum = 0;
        for (let j = Math.max(0, i - 29); j <= i; ++j) {
        const prev = j > 0 ? arr[j - 1].cases : 0;
        sum += arr[j].cases - prev;
        }
        if (!monthlyCasesByDate.has(dateStr)) {
        monthlyCasesByDate.set(dateStr, new Map());
        }
        monthlyCasesByDate.get(dateStr).set(d.fips, sum);
    }
    });



  // 4d. Extract sorted list of dates
  dates = Array.from(dailyNewCasesByDate.keys()).sort(
    (a, b) => new Date(a) - new Date(b)
  );
  computeKeyStageIndices();

  // Compute cumulative max for legend and color scale
  cumulativeMax = d3.max(Array.from(cumulativeCasesByDate.values()).flatMap(map => Array.from(map.values())));

  // 4e. Precompute wave averages
  const waveWindows = [
    ["2020-03-01","2020-05-31"],  // Wave 1
    ["2020-06-01","2020-09-30"],  // Wave 2
    ["2020-11-01","2021-01-31"]   // Wave 3
  ];


  waveAverages = waveWindows.map(([start, end]) => {
    const windowDates = dates.filter(d => d >= start && d <= end);
    const sumMap = new Map(), countMap = new Map();
    windowDates.forEach(d => {
      const dailyMap = dailyNewCasesByDate.get(d);
      dailyMap.forEach((val, fips) => {
        sumMap.set(fips, (sumMap.get(fips) || 0) + val);
        countMap.set(fips, (countMap.get(fips) || 0) + 1);
      });
    });
    const avgMap = new Map();
    sumMap.forEach((sum, fips) => {
      avgMap.set(fips, sum / countMap.get(fips));
    });
    return avgMap;
  });

  // Compute the global max across all waves for legend and color scale
  globalMax = d3.max(waveAverages.flatMap(avgMap => Array.from(avgMap.values())));

// 5. Draw the static map and jump straight to Explore mode
  addTooltip();
  drawBaseMap();
  setupTimeline();
  drawScene(3);
})
.catch(console.error)
.finally(() => {
// 2. Hide the loader once the first scene is on screen
d3.select("#loading").style("display", "none");
});



// Nonlinear color scale: breakpoints and colors
const colorBreaks = [0, 1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000];
const colorRange = [
  "#fff",      // 0
  "#ffffb2",  // 1
  "#fed976",  // 3
  "#feb24c",  // 10
  "#fd8d3c",  // 30
  "#fc4e2a",  // 100
  "#e31a1c",  // 300
  "#bd0026",  // 1000
  "#800026",  // 3000
  "#6a176a",  // 10000
  "#7a1fa2",  // 30000
  "#4a1486"   // 100000
];

function getThresholdColorScale(maxVal) {
  // Adjust breaks if maxVal is lower than the highest break
  const breaks = colorBreaks.filter(b => b <= maxVal);
  const colors = colorRange.slice(0, breaks.length);
  return d3.scaleThreshold()
    .domain(breaks.slice(1))
    .range(colors);
}

// Remove setupLegendToggle and legendType

function updateLegendHTML(isCumulative = false) {
  // Use globalMax for waves, cumulativeMax for cumulative
  const maxVal = isCumulative ? (cumulativeMax ? Math.ceil(cumulativeMax) : 10000) : (globalMax ? Math.ceil(globalMax) : 200);
  const colorScale = getThresholdColorScale(maxVal);
  const breaks = colorScale.domain();
  const colors = colorScale.range();
  d3.select("#legend-container").selectAll('.legend-item').remove();
  const item = d3.select("#legend-container")
    .append("div")
    .attr("class","legend-item");

  // Stepped legend only
  const bar = item.append("div")
    .attr("class", "legend-bar")
    .style("display", "flex");
  for (let i = 0; i < colors.length; ++i) {
    bar.append("div")
      .style("flex", "1 1 0")
      .style("height", "100%")
      .style("background", colors[i]);
  }
  // Show a label for each color segment, aligned
  const labels = item.append("div")
    .attr("class","legend-labels");
  labels.append("span").text("0");
  breaks.forEach(b => labels.append("span").text(b));
}

// 6. drawBaseMap: append all counties with neutral fill
function drawBaseMap() {
  svg.selectAll("path")
    .data(countyFeatures)
    .enter().append("path")
      .attr("d", path)
      .attr("fill", "#eee")
      .attr("stroke", "#999")
      .attr("stroke-width", 0.2);
}


function drawScene(i) {
  // clear old annotation in controls
  d3.select("#controls").selectAll(".annotation").remove();

  if (i < 3) {
    // ...existing code for wave scenes...
    const avgMap = waveAverages[i];
    const color = getThresholdColorScale(globalMax);
    svg.selectAll("path")
      .transition().duration(500)
      .attr("fill", d => color(avgMap.get(d.id) || 0));
    addTooltip.attachEvents(
      d => avgMap.get(d.id),
      d => d.properties && d.properties.name ? d.properties.name : d.id
    );
    updateLegendHTML(false);
    d3.select("#controls")
      .append("div")
      .attr("class", "annotation")
      .text(waveLabels[i]);
    // ...existing code...
  } else {
    // Explore mode: use unified update logic and annotation
    shownOverlays = new Set(); // Reset overlays when entering Explore mode
    d3.select("#controls")
      .append("div")
      .attr("class", "annotation")
      .text((viewMode === 'daily' ? 'Daily new cases' : 'Cumulative cases') + ': use the timeline below');
    d3.select("#next-btn")
      .text("Explore")
      .attr("disabled", true);
    d3.select("#timeline-controls").style("display", "flex");
    ensureViewModeControl();
    d3.select('#view-mode-select').style('display', 'inline-block');
    updateTimelineDate();
  }
}


// --- View mode control ---
function setupViewModeControl() {
  if (d3.select('#view-mode-select').empty()) {
    d3.select('#controls')
      .append('select')
      .attr('id', 'view-mode-select')
      .style('margin-left', '18px')
      .style('font-size', '14px')
      .html(`
        <option value="daily">Daily new cases</option>
        <option value="cumulative" selected>Total cumulative cases</option>
      `)
      .on('change', function() {
        viewMode = this.value;
        updateExploreMap(timelineIndex, true);
      });
  }
}

// --- Unified map update for explore mode ---
function updateExploreMap(idx, useTransition = true) {
  const date = dates[idx];
  let casesMap, maxVal;
  if (viewMode === 'daily') {
    casesMap = dailyNewCasesByDate.get(date);
    maxVal = globalMax;
    // Use threshold scale for daily
    const color = getThresholdColorScale(maxVal);
    const sel = svg.selectAll('path');
    if (useTransition) {
      sel.transition().duration(100)
        .attr('fill', d => color((casesMap && casesMap.get(d.id)) || 0));
    } else {
      sel.interrupt().attr('fill', d => color((casesMap && casesMap.get(d.id)) || 0));
    }
    updateLegendHTML(false);
    addTooltip.attachEvents(
      d => (casesMap && casesMap.get(d.id)),
      d => d.properties && d.properties.name ? d.properties.name : d.id
    );
  } else {
    // Cumulative: use log scale with gamma correction
    casesMap = cumulativeCasesByDate.get(date);
    maxVal = cumulativeMax;
    const logMax = Math.log10(maxVal || 1);
    const gamma = 1.7; // Higher = more aggressive, try 1.5-2.0
    const logColor = d3.scaleSequential(d3.interpolateReds)
      .domain([0, 1])
      .clamp(true);
    const sel = svg.selectAll('path');
    if (useTransition) {
      sel.transition().duration(100)
        .attr('fill', d => {
          const v = (casesMap && casesMap.get(d.id)) || 0;
          if (v > 0) {
            let norm = Math.log10(v) / logMax;
            norm = Math.pow(norm, gamma);
            return logColor(norm);
          }
          return '#fff';
        });
    } else {
      sel.interrupt().attr('fill', d => {
        const v = (casesMap && casesMap.get(d.id)) || 0;
        if (v > 0) {
          let norm = Math.log10(v) / logMax;
          norm = Math.pow(norm, gamma);
          return logColor(norm);
        }
        return '#fff';
      });
    }
    updateLogLegend(maxVal, gamma);
    addTooltip.attachEvents(
      d => (casesMap && casesMap.get(d.id)),
      d => d.properties && d.properties.name ? d.properties.name : d.id
    );
  }
}

// --- Logarithmic legend for cumulative view ---
function updateLogLegend(maxVal, gamma = 1.7) {
  const logMax = Math.log10(maxVal || 1);
  const logMaxCeil = Math.ceil(logMax);
  const ticks = [];
  for (let i = 0; i <= logMaxCeil; ++i) {
    ticks.push(Math.pow(10, i));
  }
  const logColor = d3.scaleSequential(d3.interpolateReds)
    .domain([0, 1])
    .clamp(true);
  d3.select("#legend-container").selectAll('.legend-item').remove();
  const item = d3.select("#legend-container")
    .append("div")
    .attr("class","legend-item");
  // Bar
  const bar = item.append("div")
    .attr("class", "legend-bar")
    .style("display", "flex");
  const nSteps = 60;
  for (let i = 0; i < nSteps; ++i) {
    let frac = i / (nSteps - 1);
    // Invert gamma to match map
    let logFrac = Math.pow(frac, 1 / gamma);
    bar.append("div")
      .style("flex", "1 1 0")
      .style("height", "100%")
      .style("background", logColor(frac));
  }
  // Labels
  const labels = item.append("div")
    .attr("class","legend-labels");
  ticks.forEach(t => labels.append("span").text(t));
  // Annotation
  item.append("div")
    .attr("class", "legend-note")
    .style("font-size", "12px")
    .style("color", "#666")
    .style("margin-top", "2px")
    .text("Cumulative cases (log scale, gamma " + gamma + ")");
}
