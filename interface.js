/* Presentation only: no form values, project data or links are changed. */
(() => {
  const root = document.getElementById('app');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const running = new Set();
  function revealActiveTool() {
    const tabs = root.querySelector('.tool-tabs'),
      active = tabs?.querySelector('a[aria-current="page"]');
    if (!active) return;
    const box = tabs.getBoundingClientRect(),
      item = active.getBoundingClientRect();
    if (item.left < box.left + 7 || item.right > box.right - 7)
      tabs.scrollLeft += item.left - box.left - 7;
  }
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(revealActiveTool);
  });
  const observer = new MutationObserver((records) => {
    revealActiveTool();
    if (reduced.matches || document.hidden) return;
    const added = records.flatMap((record) => [...record.addedNodes]);
    const panels = added.filter(
      (node) =>
        node instanceof HTMLElement &&
        node.matches(
          '.page-head, .stats, .project-register, .grid, .card, .tool-tabs, #tool-content, .project-tool-shortcuts, .event-experience'
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
