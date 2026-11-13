/* Files stay private; the server checks the user or the document's share token. */
const DocumentViewer = (() => {
  let currentRequest = null;
  const shareURL = (token) =>
    `${location.origin}${location.pathname}#/lecture/${encodeURIComponent(token)}`;
  const privateURL = (id) => `#/document/${encodeURIComponent(id)}`;
  window.addEventListener('hashchange', () => currentRequest?.abort());

  async function api(body, signal) {
    const {
      data: { session },
    } = await sb.auth.getSession();
    const response = await fetch(SUPABASE_URL + '/functions/v1/read-document', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + (session?.access_token || SUPABASE_ANON_KEY),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Le document est indisponible ou son accès a été révoqué.');
    return response;
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function downloadPrivate(doc) {
    download(await (await api({ document_id: doc.id })).blob(), doc.name);
  }
  async function open({ id, token }) {
    currentRequest?.abort();
    const controller = new AbortController();
    currentRequest = controller;
    const { signal } = controller;
    const body = token ? { share_token: token } : { document_id: id };
    app.innerHTML = '<section class="card"><p>Ouverture du document…</p></section>';
    try {
      const meta = await (await api({ ...body, metadata: true }, signal)).json();
      const blob = await (await api(body, signal)).blob();
      if (signal.aborted) return;
      // Let the browser handle its native formats in the whole tab, without a site viewer.
      if (
        ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'].includes(
          meta.mime_type
        )
      ) {
        const file = new Blob([blob], { type: meta.mime_type });
        location.replace(URL.createObjectURL(file));
        return;
      }
      app.innerHTML = `<section class="card"><h1>${esc(meta.name)}</h1><p>Ce format s’ouvre avec une application sur votre appareil.</p><button type="button" class="btn" id="document-download">Télécharger</button></section>`;
      document.getElementById('document-download').onclick = () => download(blob, meta.name);
    } catch (error) {
      if (signal.aborted) return;
      app.innerHTML = `<section class="card"><h1>Document indisponible</h1><p>${esc(error.message)}</p><a class="btn" href="#/">Retour à l’accueil</a></section>`;
    }
  }
  return { shareURL, privateURL, downloadPrivate, open };
})();
