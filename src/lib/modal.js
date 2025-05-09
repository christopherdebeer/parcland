
let $root = null;    // modal shell (created on-demand)
let $contentEditorHost = null;    // div that will hold CodeMirror
let $srcEditorHost = null;
let $btnPrev = null;
let $btnNext = null;
let $info = null;
let $btnClear = null;
let $btnCopy = null;
let $btnCancel = null;
let $btnSave = null;
let $btnGenerate = null;
let $tabContent = null;
let $tabSrc = null;
let $errorBox = null;

let cmContent = null;    // CodeMirror instances
let cmSrc = null;

let activeTab = 'content';
let currentEl = null;    // element being edited (live reference)
let currentVerIdx = 0;       // 0 … el.versions.length  (top == current)
let resolver = null;    // Promise resolver returned by showModal
let generateFn = null;    // callback injected by caller (optional)

export function showModal(el, opts = {}) {
  if (!el) throw new Error('showModal: element required');
  generateFn = opts.generateContent ?? null;

  ensureDom();
  hydrateUiFor(el);

  return new Promise((res) => { resolver = res; });
}

function ensureDom() {
  if ($root) return;
  const tpl = /*html*/`
<div id="edit-modal" class="modal">
  <div class="modal-content">
    <div class="modal-versions">
      <div class="versions-nav">
        <button id="versions-prev"><i class="fa-solid fa-angle-left"></i></button>
        <span id="versions-info"></span>
        <button id="versions-next"><i class="fa-solid fa-angle-right"></i></button>
      </div>
      <div id="modal-error"></div>
    </div>
    <div class="modal-tabs">
      <button id="tab-content" class="active">Content</button>
      <button id="tab-src">Src</button>
    </div>
    <div class="modal-editor">
      <div id="editor-content"></div>
      <div id="editor-src" style="display:none"></div>
    </div>
    <div class="modal-buttons">
      <button id="modal-clear">Clear</button>
      <button id="modal-copy">Copy</button>
      <button id="modal-cancel">Close</button>
      <button id="modal-save">Save</button>
      <button id="modal-generate">Generate</button>
    </div>
  </div>
</div>`;
  document.body.insertAdjacentHTML('beforeend', tpl);
  $root = document.getElementById('edit-modal');
  $contentEditorHost = document.getElementById('editor-content');
  $srcEditorHost = document.getElementById('editor-src');
  $btnPrev = document.getElementById('versions-prev');
  $btnNext = document.getElementById('versions-next');
  $info = document.getElementById('versions-info');
  $errorBox = document.getElementById('modal-error');

  $btnClear = document.getElementById('modal-clear');
  $btnCopy = document.getElementById('modal-copy');
  $btnCancel = document.getElementById('modal-cancel');
  $btnSave = document.getElementById('modal-save');
  $btnGenerate = document.getElementById('modal-generate');

  $tabContent = document.getElementById('tab-content');
  $tabSrc = document.getElementById('tab-src');

  /* ------ 2.  install event handlers -------------------------------------- */
  $btnPrev.onclick = () => navVersion(-1);
  $btnNext.onclick = () => navVersion(+1);
  $btnClear.onclick = () => getActiveCM().setValue('');
  $btnCopy.onclick = copyToClipboard;
  $btnCancel.onclick = () => close('cancelled');
  $btnSave.onclick = () => saveAndClose();
  $btnGenerate.onclick = () => generateContent();

  $tabContent.onclick = () => switchTab('content');
  $tabSrc.onclick = () => switchTab('src');

  /* Escape key closes modal */
  document.addEventListener('keydown', (e) => {
    if (!$root.hidden && e.key === 'Escape') close('cancelled');
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 *  Modal lifecycle helpers
 * ------------------------------------------------------------------------- */
function hydrateUiFor(el) {
  /* editors (lazy) */
  if (!cmContent) {
    cmContent = CodeMirror($contentEditorHost, {
      value: '', mode: getMode(el.type), lineNumbers: true,
      theme: 'default', lineWrapping: true
    });
  } else {
    cmContent.setOption('mode', getMode(el.type));
  }
  if (!cmSrc) {
    cmSrc = CodeMirror($srcEditorHost, {
      value: '', mode: 'text', lineNumbers: true,
      theme: 'default', lineWrapping: true
    });
  }

  currentEl = el;
  currentVerIdx = (el.versions ?? []).length; // point to “current”
  activeTab = (el.type === 'img' && el.src) ? 'src' : 'content';
  switchTab(activeTab, /*silent=*/true);

  loadVersion(currentVerIdx);
  clearError();

  $root.style.display = "block";
}

function loadVersion(idx) {
  const vCount = (currentEl.versions ?? []).length;
  currentVerIdx = idx = Math.max(0, Math.min(idx, vCount));

  if (idx < vCount) {
    cmContent.setValue(currentEl.versions[idx].content);
  } else {
    cmContent.setValue(currentEl.content ?? '');
  }
  cmSrc.setValue(currentEl.src ?? '');

  $info.textContent = `Version ${idx + 1} of ${vCount + 1}`;
}

function navVersion(delta) {
  loadVersion(currentVerIdx + delta);
}

function switchTab(tab, silent = false) {
  activeTab = tab;
  $tabContent.classList.toggle('active', tab === 'content');
  $tabSrc.classList.toggle('active', tab === 'src');
  $contentEditorHost.style.display = tab === 'content' ? 'block' : 'none';
  $srcEditorHost.style.display = tab === 'src' ? 'block' : 'none';
  if (!silent) getActiveCM().refresh();
}

function getActiveCM() { return activeTab === 'content' ? cmContent : cmSrc; }

function saveAndClose() {
  if (!currentEl) return;

  if (activeTab === 'content') {
    const newContent = cmContent.getValue();
    if (currentEl.content !== newContent) {
      currentEl.versions = currentEl.versions ?? [];
      currentEl.versions.push({ content: currentEl.content, timestamp: Date.now() });
      currentEl.content = newContent;
      if (currentEl.type !== 'img') currentEl.src = undefined;
    }
  } else {            // src tab
    currentEl.src = cmSrc.getValue();
  }
  close('saved', currentEl);
}

function generateContent() {
  clearError();
  if (typeof generateFn !== 'function') return;

  $btnGenerate.disabled = true;
  const oldLabel = $btnGenerate.textContent;
  $btnGenerate.innerHTML = `Generating… <i class="fa-solid fa-spinner fa-spin"></i>`;

  const seed = getActiveCM().getValue();
  Promise.resolve(generateFn(seed))
    .then(res => {
      if (res) getActiveCM().setValue(res);
      else showError('No content generated.');
    })
    .catch(err => {
      console.error('Generate error', err);
      showError('Error while generating content.');
    })
    .finally(() => {
      $btnGenerate.disabled = false;
      $btnGenerate.innerHTML = oldLabel;
    });
}

function copyToClipboard() {
  navigator.clipboard.writeText(getActiveCM().getValue())
    .then(() => alert('Copied to clipboard!'))
    .catch(err => console.warn('Clipboard error', err));
}

function getMode(type) {
  switch (type) {
    case 'html': return 'htmlmixed';
    case 'markdown': return 'markdown';
    case 'text': return 'javascript';
    default: return 'text';
  }
}

function clearError() { $errorBox.textContent = ''; }
function showError(msg) { $errorBox.textContent = msg; }

function close(status, el = null) {
  $root.style.display = "none";
  resolver?.({ status, el });
  resolver = null;
  currentEl = null;
}