/* Browser chrome follows the browser colour scheme, independently of the page theme. */
(() => {
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  function update() {
    const theme = scheme.matches ? 'dark' : 'light';
    document.getElementById('syntra-touch-icon').href = `assets/syntra-icon-${theme}-180.png?v=2`;
    document.getElementById('syntra-manifest').href = scheme.matches ? 'site-dark.webmanifest?v=2' : 'site.webmanifest?v=2';
  }
  update();
  scheme.addEventListener('change', update);
})();
