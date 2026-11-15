/* Shared scene interactions and tab-scoped drafts. */
const StageLayout = (() => {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const key = (pid, kind) => `dj-booking-draft:${me.id}:board:${pid}:${kind}`;
  function draft(pid, kind, revision, base) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(key(pid, kind)));
      if (cached?.revision === revision) return clone(cached.data);
    } catch {}
    return clone(base);
  }
  function remember(pid, kind, revision, data) {
    try {
      sessionStorage.setItem(key(pid, kind), JSON.stringify({ revision, data }));
    } catch {}
  }
  function clear(pid, kind) {
    sessionStorage.removeItem(key(pid, kind));
  }
  function drag(svg, { editable, items, select, changed, draw }) {
    let active = null;
    const point = (event) => {
      const p = svg.createSVGPoint();
      p.x = event.clientX;
      p.y = event.clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    };
    svg.addEventListener('pointerdown', (event) => {
      const target = event.target.closest('[data-stage-id]');
      if (!target) return;
      const item = items().find((i) => i.id === target.dataset.stageId);
      if (!item) return;
      select(item.id);
      if (!editable) return;
      active = item;
      svg.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    svg.addEventListener('pointermove', (event) => {
      if (!active) return;
      const p = point(event);
      active.x = Math.max(5, Math.min(95, Number((p.x / 10).toFixed(1))));
      active.y = Math.max(7, Math.min(93, Number((p.y / 6).toFixed(1))));
      draw();
    });
    const stop = () => {
      if (active) {
        active = null;
        changed();
      }
    };
    svg.addEventListener('pointerup', stop);
    svg.addEventListener('pointercancel', stop);
    svg.addEventListener('keydown', (event) => {
      if (!editable || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
        return;
      const target = event.target.closest('[data-stage-id]');
      const item = items().find((i) => i.id === target?.dataset.stageId);
      if (!item) return;
      event.preventDefault();
      item.x = Math.max(
        5,
        Math.min(95, item.x + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0))
      );
      item.y = Math.max(
        7,
        Math.min(93, item.y + (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0))
      );
      select(item.id);
      draw();
      svg.querySelector('[data-stage-id="' + item.id + '"]')?.focus({ preventScroll: true });
      changed();
    });
  }
  function downloadSVG(svg, name, legend = []) {
    const copy = svg.cloneNode(true);
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (legend.length) {
      const lines = legend.flatMap((line) => String(line).match(/.{1,120}/gu) || ['']);
      copy.setAttribute('viewBox', '0 0 1000 ' + (650 + lines.length * 22));
      copy.setAttribute('width', '1000');
      copy.setAttribute('height', String(650 + lines.length * 22));
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      for (const [k, v] of Object.entries({
        x: 0,
        y: 600,
        width: 1000,
        height: 50 + lines.length * 22,
        fill: '#fff',
      }))
        bg.setAttribute(k, v);
      copy.append(bg);
      lines.forEach((line, i) => {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        for (const [k, v] of Object.entries({
          x: 20,
          y: 630 + i * 22,
          fill: '#222',
          'font-family': 'sans-serif',
          'font-size': 13,
        }))
          text.setAttribute(k, v);
        text.textContent = line;
        copy.append(text);
      });
    }
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { clone, draft, remember, clear, drag, downloadSVG };
})();
