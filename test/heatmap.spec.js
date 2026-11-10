const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/heatmap.html');
const CLIP_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/heatmap-clip.html');

test('defaults to a reversed Diverging.RdBu, not the shared Qualitative.Tableau10', async ({ page }) => {
  await page.goto(FIXTURE);
  const { paletteColors, expected } = await page.evaluate(() => ({
    paletteColors: window.graph.paletteColors,
    expected:      d3.easygraph.palette('Diverging.RdBu', { reverse: true }),
  }));
  expect(paletteColors).toEqual(expected);
});

test('renders a cell grid matching the data dimensions', async ({ page }) => {
  await page.goto(FIXTURE);
  // 4 rows x 6 cols in the fixture data
  await expect(page.locator('g.easygraph-heatmap-row')).toHaveCount(4);
  await expect(page.locator('rect.easygraph-heatmap-cell')).toHaveCount(24);
});

test('resize updates cell width proportionally', async ({ page }) => {
  await page.goto(FIXTURE);

  const widthBefore = await page.evaluate(() =>
    Number(document.querySelector('rect.easygraph-heatmap-cell').getAttribute('width'))
  );

  await page.evaluate(() => { document.querySelector('#wrap').style.width = '300px'; });
  await page.waitForFunction((w0) => {
    const w = Number(document.querySelector('rect.easygraph-heatmap-cell').getAttribute('width'));
    return w > 0 && w < w0;
  }, widthBefore);

  const widthAfter = await page.evaluate(() =>
    Number(document.querySelector('rect.easygraph-heatmap-cell').getAttribute('width'))
  );
  expect(widthAfter).toBeLessThan(widthBefore);
  expect(widthAfter).toBeGreaterThan(0);
});

test('cell fill transitions over graph.duration on a data update, not an instant swap', async ({ page }) => {
  await page.goto(FIXTURE);
  const { immediateFill, settledFill, finalFill } = await page.evaluate(() => {
    return new Promise((resolve) => {
      var cell = document.querySelector('rect.easygraph-heatmap-cell');
      // first cell's value flips from 1 (near the domain's low end) to 9 (its high end) -
      // a big enough jump that an immediate vs. settled color reliably differ
      var flipped = window.testData.map(function(row) { return row.map(function(v) { return 10 - v; }); });
      window.graph.update(flipped, { x: [0, 6], y: [0, 4] });
      var immediateFill = getComputedStyle(cell).fill;
      setTimeout(function() {
        resolve({
          immediateFill: immediateFill,
          settledFill: getComputedStyle(cell).fill,
          finalFill: window.graph.color.$scale(9)
        });
      }, 700); // graph.duration defaults to 500ms
    });
  });
  expect(immediateFill).not.toBe(settledFill);
  expect(settledFill).toBe(finalFill);
});

test('color clip narrows the domain away from a single outlier cell, clamped rather than extrapolated', async ({ page }) => {
  await page.goto(CLIP_FIXTURE);
  const result = await page.evaluate(() => {
    var scale = window.graph.color.$scale;
    var domain = scale.domain();
    var domainMax = domain[domain.length - 1];
    return {
      domainMax:       domainMax,
      outlierColor:    scale(1000),
      domainEdgeColor: scale(domainMax)
    };
  });
  // fixture's outlier cell is 1000, far past every other cell (1-8)
  expect(result.domainMax).toBeLessThan(500);
  expect(result.outlierColor).toBe(result.domainEdgeColor);
});

test('update([]) with no data clears the grid instead of throwing', async ({ page }) => {
  await page.goto(FIXTURE);
  const result = await page.evaluate(() => {
    try {
      window.graph.update([]);
      return { threw: false, cells: document.querySelectorAll('rect.easygraph-heatmap-cell').length };
    } catch (e) {
      return { threw: true, error: e.message };
    }
  });
  expect(result.threw).toBe(false);
  expect(result.cells).toBe(0);
});

test('with no explicit ranges the axes span the grid dimensions, not a meaningless [0,1]', async ({ page }) => {
  await page.goto(FIXTURE);
  const domains = await page.evaluate(() => {
    // fixture data is 4 rows x 6 cols
    window.graph.update(window.testData);
    return { x: window.graph.x.$scale.domain(), y: window.graph.y.$scale.domain() };
  });
  expect(domains.x).toEqual([0, 6]);
  expect(domains.y).toEqual([0, 4]);
});

test('a null or undefined cell is drawn empty (no fill, the missing class), not black or a real color', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    var d = document.createElement('div'); d.style.width = '400px'; document.body.appendChild(d);
    var g = d3.easygraph.heatmap({ container: d, height: 200, duration: 0 });
    function cells() {
      return Array.prototype.map.call(g.$marks.selectAll('.easygraph-heatmap-cell').nodes(), function (n) {
        return { fill: getComputedStyle(n).fill, missing: n.classList.contains('easygraph-heatmap-cell-missing') };
      });
    }
    g.update([[0, null, 10], [undefined, 5, 10]]);
    var first = cells();
    g.update([[0, 3, 10], [7, 5, null]]);          // the gaps fill in, a colored cell becomes a gap
    return { first: first, second: cells() };
  });
  // grid order: row 0 cells, then row 1 cells
  expect(r.first.map(c => c.missing)).toEqual([false, true, false, true, false, false]);
  expect(r.first[1].fill).toBe('none');
  expect(r.first[3].fill).toBe('none');
  expect(r.first[0].fill).not.toBe('none');
  expect(r.first[0].fill).not.toBe('rgb(0, 0, 0)');
  expect(r.second.map(c => c.missing)).toEqual([false, false, false, false, false, true]);
  expect(r.second[5].fill).toBe('none');
  expect(r.second[1].fill).not.toBe('none');
});

test('color.trim ignores missing cells instead of counting them as 0', async ({ page }) => {
  await page.goto(FIXTURE);
  const domain = await page.evaluate(() => {
    var d = document.createElement('div'); d.style.width = '400px'; document.body.appendChild(d);
    var g = d3.easygraph.heatmap({ container: d, height: 200, duration: 0, color: { trim: [0, 1] } });
    g.update([[null, null, 10], [20, null, 30]]);
    var dom = g.color.$scale.domain();
    return [dom[0], dom[dom.length - 1]];
  });
  expect(domain).toEqual([10, 30]);
});
