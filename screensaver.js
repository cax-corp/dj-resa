/* Presentation only: the route, forms and scroll position stay mounted underneath. */
(() => {
  const button = document.getElementById('screensaver-toggle');
  const screen = document.getElementById('syntra-screensaver');
  if (!button || !screen) return;
  let active = false;
  let previousFocus;
  let previousOverflow;
  let scrollPosition;
  let inertStates = [];
  let enteredFullscreen = false;

  function close() {
    if (!active) return;
    active = false;
    screen.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    for (const [node, inert] of inertStates) node.inert = inert;
    inertStates = [];
    document.body.style.overflow = previousOverflow;
    enteredFullscreen = false;
    const focus = previousFocus;
    const position = scrollPosition;
    const restore = () => {
      if (active) return;
      if (focus?.isConnected) focus.focus({ preventScroll:true });
      if (position) window.scrollTo({ left:position.x, top:position.y, behavior:'instant' });
    };
    if (document.fullscreenElement === screen) {
      document.exitFullscreen().catch(() => {}).then(() => requestAnimationFrame(restore));
    } else {
      restore();
    }
  }

  function open() {
    if (active) return;
    active = true;
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    scrollPosition = { x:window.scrollX, y:window.scrollY };
    // Keep underlying controls out of the keyboard and accessibility navigation.
    inertStates = [...document.body.children]
      .filter(node => node !== screen && !['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName))
      .map(node => [node, node.inert]);
    for (const [node] of inertStates) node.inert = true;
    document.body.style.overflow = 'hidden';
    screen.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    screen.focus({ preventScroll:true });
    // Fullscreen is optional: the black viewport works on unsupported browsers too.
    if (screen.requestFullscreen) {
      screen.requestFullscreen().then(() => {
        if (!active && document.fullscreenElement === screen) document.exitFullscreen().catch(() => {});
      }).catch(() => {});
    }
  }

  button.addEventListener('click', open);
  screen.addEventListener('click', close);
  screen.addEventListener('keydown', event => {
    if (['Escape', 'Enter', ' '].includes(event.key)) { event.preventDefault(); close(); }
    if (event.key === 'Tab') { event.preventDefault(); screen.focus(); }
  });
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === screen) enteredFullscreen = true;
    else if (active && enteredFullscreen) close();
  });
})();
