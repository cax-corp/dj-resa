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
  function day(item) {
    return Number.isInteger(item.day_offset) ? item.day_offset : 0;
  }
  function dayLabel(offset, eventDate) {
    const label =
      offset === 0
        ? 'Jour de l’événement'
        : offset === 1
          ? 'Lendemain (J+1)'
          : offset === -1
            ? 'Veille (J−1)'
            : `J${offset > 0 ? '+' : '−'}${Math.abs(offset)}`;
    if (!eventDate) return label;
    const date = new Date(eventDate + 'T12:00:00Z');
    if (Number.isNaN(date.getTime())) return label;
    date.setUTCDate(date.getUTCDate() + offset);
    return (
      label +
      ' · ' +
      date.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })
    );
  }
  function dayOptions(eventDate) {
    return Object.fromEntries(
      [
        ...Array.from({ length: 31 }, (_, i) => i),
        ...Array.from({ length: 7 }, (_, i) => -i - 1),
      ].map((offset) => [String(offset), dayLabel(offset, eventDate)])
    );
  }
  function label(item, eventDate) {
    return dayLabel(day(item), eventDate) + (item.day_offset == null ? ' · jour à confirmer' : '');
  }
  function sort(items) {
    return [...items].sort(
      (a, b) =>
        day(a) - day(b) ||
        (time(a.start_time) ?? 0) - (time(b.start_time) ?? 0) ||
        String(a.id || '').localeCompare(String(b.id || ''))
    );
  }
  function summary(items) {
    const ranges = [];
    let incomplete = 0;
    const legacyOnly = items.every((item) => item.day_offset == null);
    for (const item of items) {
      const length = duration(item);
      if (length === null) {
        incomplete++;
        continue;
      }
      const start = time(item.start_time) + (legacyOnly ? 0 : day(item) * DAY),
        end = start + length;
      // Split midnight crossings onto the same event-day clock before merging.
      if (legacyOnly && end > DAY) {
        ranges.push([start, DAY], [0, end - DAY]);
      } else ranges.push([start, end]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let minutes = 0,
      until = -Infinity;
    for (const [start, end] of ranges) {
      minutes += Math.max(0, end - Math.max(start, until));
      until = Math.max(until, end);
    }
    return {
      minutes,
      incomplete,
      counted: items.length - incomplete,
      unspecified: items.filter((item) => item.day_offset == null).length,
    };
  }
  function format(minutes) {
    const hours = Math.floor(minutes / 60),
      rest = minutes % 60;
    return `${hours} h${rest ? ' ' + String(rest).padStart(2, '0') : ''}`;
  }
  function render(items) {
    const total = summary(items);
    return `<div class="work-hours-summary" data-work-minutes="${total.minutes}"><div><span class="work-hours-label">Heures de travail planifiées</span><strong>${format(total.minutes)}</strong></div><div><p>${total.counted} créneau${total.counted > 1 ? 'x' : ''} comptabilisé${total.counted > 1 ? 's' : ''} · hors pauses entre les créneaux</p><p class="muted">Les chevauchements comptent une seule fois. Une fin avant le début correspond au lendemain.</p>${total.unspecified ? `<p class="warn-text">${total.unspecified} ancien(s) créneau(x) : jour à confirmer dans le planning. Le total peut évoluer après confirmation.</p>` : ''}${total.incomplete ? `<p class="warn-text">${total.incomplete} créneau${total.incomplete > 1 ? 'x' : ''} non comptabilisé${total.incomplete > 1 ? 's' : ''} : indiquez des heures de début et de fin différentes.</p>` : ''}</div></div>`;
  }
  return { duration, summary, format, render, day, dayLabel, dayOptions, label, sort };
})();
