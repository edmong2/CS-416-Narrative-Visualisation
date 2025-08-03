// script.js

// 1. Data URLs
const topoURL   = "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";
const countyCSV = "https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-counties.csv";

// 2. Globals for processed data
let countyFeatures,
    dates,
    dailyNewCasesByDate,
    waveAverages,
    scene = 0;

// 3. SVG + projection setup
const svg = d3.select("#map"),
      width  = +svg.attr("width"),
      height = +svg.attr("height");

const projection = d3.geoAlbersUsa()
    .translate([width / 2, height / 2])
    .scale(1300);

const path = d3.geoPath().projection(projection);

// 4. Load TopoJSON + CSV
Promise.all([
  d3.json(topoURL),
  d3.csv(countyCSV, d => ({
    date:   d3.timeParse("%Y-%m-%d")(d.date),
    fips:   d.fips,
    cases:  +d.cases
  }))
]).then(([usTopo, raw]) => {
  // 4a. Extract county features
  countyFeatures = topojson.feature(usTopo, usTopo.objects.counties).features;

  // 4b. Sort CSV by date then fips
  raw.sort((a, b) => a.date - b.date || a.fips.localeCompare(b.fips));

  // 4c. Compute dailyNewCasesByDate: Map(dateStr → Map(fips → newCases))
  dailyNewCasesByDate = new Map();
  const byFips = d3.group(raw, d => d.fips);
  byFips.forEach(arr => {
    arr.forEach((d, i) => {
      const dateStr = d3.timeFormat("%Y-%m-%d")(d.date);
      const prev = i > 0 ? arr[i - 1].cases : 0;
      const newCases = d.cases - prev;
      if (!dailyNewCasesByDate.has(dateStr)) {
        dailyNewCasesByDate.set(dateStr, new Map());
      }
      dailyNewCasesByDate.get(dateStr).set(d.fips, newCases);
    });
  });

  // 4d. Extract sorted list of dates
  dates = Array.from(dailyNewCasesByDate.keys()).sort(
    (a, b) => new Date(a) - new Date(b)
  );

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

  // 5. Draw the static map and first scene
  drawBaseMap();
  drawScene(0);
})
.catch(console.error);


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

// 7. drawScene: recolor counties based on waveAverages[scene]
function drawScene(i) {
  // recoil through three waves
  if (i < 3) {
    const avgMap = waveAverages[i];
    // build a color scale keyed to this wave’s max
    const maxVal = d3.max(Array.from(avgMap.values()));
    const color = d3.scaleSequential(d3.interpolateReds)
      .domain([0, maxVal]);

    svg.selectAll("path")
      .transition().duration(500)
      .attr("fill", d => {
        const val = avgMap.get(d.id) || 0;
        return color(val);
      });

    // update annotation text
    d3.select("#controls").selectAll(".annotation").remove();
    d3.select("#controls")
      .append("div")
      .attr("class", "annotation")
      .style("margin-top", "8px")
      .text(["Spring 2020 Surge","Summer 2020 Surge","Winter 2020 Surge"][i]);

    // update button label
    d3.select("#next-btn")
      .text(i < 2 ? "Next" : "Explore")
      .on("click", () => {
        scene = Math.min(3, scene + 1);
        drawScene(scene);
      });

  } else {
    // Explore mode placeholder: we'll expand this next
    d3.select("#controls .annotation").text("Explore: use the slider below");
    // (slider, zoom & tooltip logic to come in the next step)
  }
}
