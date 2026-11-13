/* Presentation only: no form values, project data or links are changed. */
(() => {
  const root = document.getElementById('app');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const running = new Set();
  const observer = new MutationObserver((records) => {
    const tabs = root.querySelector('.tool-tabs');
    const active = tabs?.querySelector('a[aria-current="page"]');
    if (
      active &&
      (active.offsetLeft < tabs.scrollLeft ||
        active.offsetLeft + active.offsetWidth > tabs.scrollLeft + tabs.clientWidth)
    ) {
      tabs.scrollLeft = active.offsetLeft - 7;
    }
    if (reduced.matches || document.hidden) return;
    const added = records.flatMap((record) => [...record.addedNodes]);
    const panels = added.filter(
      (node) =>
        node instanceof HTMLElement &&
        node.matches(
          '.page-head, .stats, .project-register, .grid, .card, .tool-tabs, #tool-content, .project-tool-shortcuts'
        )
    );
    panels.slice(0, 6).forEach((panel, index) => {
      if (!panel.isConnected || panel.contains(document.activeElement)) return;
      const animation = panel.animate(
        [
          { opacity: 0, transform: 'translateY(7px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 240, delay: Math.min(index * 30, 120), easing: 'cubic-bezier(.22,1,.36,1)' }
      );
      running.add(animation);
      animation.finished.catch(() => {}).finally(() => running.delete(animation));
    });
  });
  observer.observe(root, { childList: true });
  reduced.addEventListener('change', () => {
    if (reduced.matches) running.forEach((animation) => animation.cancel());
  });
})();
