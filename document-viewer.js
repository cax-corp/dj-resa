/* File bytes are served only after a private-user or live share-token check. */
const DocumentViewer = (() => {
  let objectURL = null;
  let currentRequest = null;
  const scripts = new Map();
  const shareURL = (token) =>
    `${location.origin}${location.pathname}#/lecture/${encodeURIComponent(token)}`;
  const privateURL = (id) => `#/document/${encodeURIComponent(id)}`;
  function cleanup() {
    currentRequest?.abort();
    currentRequest = null;
    if (objectURL) {
      URL.revokeObjectURL(objectURL);
      objectURL = null;
    }
  }
  window.addEventListener('hashchange', cleanup);
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
    if (!response.ok) {
      let message = 'Le document est indisponible ou son accès a été révoqué.';
      try {
        message = (await response.json()).error || message;
      } catch {}
      throw new Error(message);
    }
    return response;
  }
  async function blobFor(body, signal) {
    return (await api(body, signal)).blob();
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function downloadPrivate(doc) {
    download(await blobFor({ document_id: doc.id }), doc.name);
  }
  function loadScript(path) {
    if (!scripts.has(path))
      scripts.set(
        path,
        new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = path;
          script.onload = resolve;
          script.onerror = () => {
            scripts.delete(path);
            script.remove();
            reject(new Error('Impossible de charger le lecteur. Réessayez.'));
          };
          document.head.append(script);
        })
      );
    return scripts.get(path);
  }
  const isCurrent = (signal) => !signal.aborted;
  function textPreview(container, text, note = '') {
    if (note) {
      const label = document.createElement('p');
      label.className = 'reader-note';
      label.textContent = note;
      container.append(label);
    }
    const pre = document.createElement('pre');
    pre.className = 'document-text';
    pre.textContent = text.slice(0, 1000000);
    container.append(pre);
    if (text.length > 1000000) {
      const p = document.createElement('p');
      p.className = 'reader-note';
      p.textContent =
        'Aperçu limité au premier million de caractères. Le téléchargement contient le fichier complet.';
      container.append(p);
    }
  }
  function columnName(index) {
    let name = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
      name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    return name;
  }
  function tablePreview(container, rows, note = '') {
    if (note) {
      const p = document.createElement('p');
      p.className = 'reader-note';
      p.textContent = note;
      container.append(p);
    }
    const scroll = document.createElement('div');
    scroll.className = 'document-table-scroll';
    const table = document.createElement('table');
    table.className = 'document-table';
    const visible = rows.slice(0, 300);
    const width = Math.min(30, Math.max(0, ...visible.map((row) => row.length)));
    const head = document.createElement('thead');
    const header = document.createElement('tr');
    ['N°', ...Array.from({ length: width }, (_, i) => columnName(i))].forEach((text) => {
      const th = document.createElement('th');
      th.textContent = text;
      header.append(th);
    });
    head.append(header);
    table.append(head);
    const body = document.createElement('tbody');
    visible.forEach((values, i) => {
      const row = document.createElement('tr');
      const index = document.createElement('th');
      index.textContent = String(i + 1);
      row.append(index);
      for (let j = 0; j < width; j++) {
        const td = document.createElement('td');
        td.textContent = String(values[j] ?? '');
        row.append(td);
      }
      body.append(row);
    });
    table.append(body);
    scroll.append(table);
    container.append(scroll);
  }
  async function preview(container, blob, meta, signal) {
    const ext = meta.name.split('.').pop().toLowerCase();
    const type = meta.mime_type;
    if (type === 'application/pdf') {
      objectURL = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const frame = document.createElement('iframe');
      frame.className = 'document-pdf';
      frame.title = 'Lecture de ' + meta.name;
      frame.src = objectURL + '#view=FitH';
      container.append(frame);
      return;
    }
    if (['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
      objectURL = URL.createObjectURL(blob);
      const img = document.createElement('img');
      img.className = 'document-image';
      img.alt = meta.name;
      img.src = objectURL;
      container.append(img);
      return;
    }
    if (type === 'text/plain' || ext === 'txt') {
      const text = await blob.text();
      if (isCurrent(signal)) textPreview(container, text);
      return;
    }
    if (type === 'text/csv' || ext === 'csv') {
      const text = await blob.text();
      if (isCurrent(signal))
        tablePreview(
          container,
          Enhancements.parseCSV(text),
          'Aperçu limité à 300 lignes et 30 colonnes.'
        );
      return;
    }
    if (ext === 'docx') {
      await loadScript('vendor/mammoth.browser.min.js?v=1.10.0');
      if (!isCurrent(signal)) return;
      const result = await mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() });
      if (isCurrent(signal))
        textPreview(container, result.value, 'Document Word · lecture du texte.');
      return;
    }
    if (ext === 'xlsx') {
      await loadScript('vendor/exceljs.min.js?v=4.4.0');
      if (!isCurrent(signal)) return;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await blob.arrayBuffer());
      if (!isCurrent(signal)) return;
      const select = document.createElement('select');
      select.className = 'document-sheet-choice';
      select.setAttribute('aria-label', 'Feuille du classeur');
      workbook.worksheets.forEach((sheet, i) => {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = sheet.name;
        select.append(option);
      });
      const sheetRoot = document.createElement('div');
      container.append(select, sheetRoot);
      const draw = () => {
        sheetRoot.replaceChildren();
        const sheet = workbook.worksheets[Number(select.value)];
        if (!sheet) {
          textPreview(sheetRoot, 'Ce classeur ne contient aucune feuille.');
          return;
        }
        const data = [];
        for (let i = 1; i <= Math.min(300, sheet.rowCount); i++) {
          const values = [];
          for (let j = 1; j <= Math.min(30, sheet.columnCount); j++) {
            const cell = sheet.getRow(i).getCell(j);
            values.push(cell.text || (cell.value?.formula ? '=' + cell.value.formula : ''));
          }
          data.push(values);
        }
        tablePreview(
          sheetRoot,
          data,
          'Lecture seule · 300 lignes et 30 colonnes au maximum par feuille. Les formules ne sont pas recalculées.'
        );
      };
      select.onchange = draw;
      draw();
      return;
    }
    const p = document.createElement('p');
    p.className = 'reader-note';
    p.textContent =
      'Ce format ancien ne dispose pas d’un aperçu intégré. Importez une version PDF, DOCX ou XLSX pour le consulter ici, ou utilisez le bouton Télécharger.';
    container.append(p);
  }
  async function open({ id, token }) {
    cleanup();
    const controller = new AbortController();
    currentRequest = controller;
    const signal = controller.signal;
    const body = token ? { share_token: token } : { document_id: id };
    app.innerHTML =
      '<section class="card document-reader-loading"><p>Ouverture du document…</p></section>';
    try {
      const meta = await (await api({ ...body, metadata: true }, signal)).json();
      if (!isCurrent(signal)) return;
      app.innerHTML = `<section class="document-reader"><div class="page-head"><div><p class="eyebrow">${token ? 'Document partagé · Lecture seule' : 'Documents du projet'}</p><h1>${esc(meta.name)}</h1><p>${(meta.size_bytes / 1024 / 1024).toFixed(2)} Mo</p></div><div class="actions"><button type="button" class="btn" id="document-download" disabled>Télécharger</button>${!token && meta.project_id ? `<a class="btn" href="#/outils/${meta.project_id}?section=documents">Retour aux documents</a>` : '<a class="btn" href="#/">Accueil</a>'}</div></div><div class="document-canvas" id="document-preview"><p class="document-loading">Chargement de l’aperçu…</p></div></section>`;
      const blob = await blobFor(body, signal);
      if (!isCurrent(signal)) return;
      const button = document.getElementById('document-download');
      button.disabled = false;
      button.onclick = () => download(blob, meta.name);
      const target = document.getElementById('document-preview');
      target.replaceChildren();
      try {
        await preview(target, blob, meta, signal);
      } catch (error) {
        if (isCurrent(signal)) {
          target.replaceChildren();
          textPreview(
            target,
            'L’aperçu de ce fichier ne peut pas être affiché. Vous pouvez toujours télécharger le document.'
          );
        }
      }
    } catch (error) {
      if (signal.aborted) return;
      app.innerHTML = `<section class="card"><h1>Document indisponible</h1><p>${esc(error.message)}</p><a class="btn" href="#/">Retour à l’accueil</a></section>`;
    }
  }
  return { shareURL, privateURL, downloadPrivate, open };
})();
