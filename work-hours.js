/* Derived from existing schedule times; never writes prices or schedule records. */
const WorkHours = (() => {
  const DAY = 24 * 60;
  function time(value) {
    const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(String(value || ''));
    if (!match || +match[1] > 23 || +match[2] > 59) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }
  function duration(item) {
    const start = time(item.start_time),
      end = time(item.end_time);
    if (start === null || end === null || start === end) return null;
    return (end - start + DAY) % DAY;
  }
  function summary(items) {
    const ranges = [];
    let incomplete = 0;
    for (const item of items) {
      const length = duration(item);
      if (length === null) {
        incomplete++;
        continue;
      }
      const start = time(item.start_time),
        end = start + length;
      // Split midnight crossings onto the same event-day clock before merging.
      if (end > DAY) {
        ranges.push([start, DAY], [0, end - DAY]);
      } else ranges.push([start, end]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let minutes = 0,
      until = -1;
    for (const [start, end] of ranges) {
      minutes += Math.max(0, end - Math.max(start, until));
      until = Math.max(until, end);
    }
    return { minutes, incomplete, counted: items.length - incomplete };
  }
  function format(minutes) {
    const hours = Math.floor(minutes / 60),
      rest = minutes % 60;
    return `${hours} h${rest ? ' ' + String(rest).padStart(2, '0') : ''}`;
  }
  function render(items) {
    const total = summary(items);
    return `<div class="work-hours-summary" data-work-minutes="${total.minutes}"><div><span class="work-hours-label">Heures de travail planifiées</span><strong>${format(total.minutes)}</strong></div><div><p>${total.counted} créneau${total.counted > 1 ? 'x' : ''} comptabilisé${total.counted > 1 ? 's' : ''} · hors pauses entre les créneaux</p><p class="muted">Les chevauchements comptent une seule fois. Une fin avant le début correspond au lendemain.</p>${total.incomplete ? `<p class="warn-text">${total.incomplete} créneau${total.incomplete > 1 ? 'x' : ''} non comptabilisé${total.incomplete > 1 ? 's' : ''} : indiquez des heures de début et de fin différentes.</p>` : ''}</div></div>`;
  }
  return { duration, summary, format, render };
})();
