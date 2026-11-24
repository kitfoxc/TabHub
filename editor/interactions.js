'use strict';

// Small interaction layer for the Messages Editor workspace. The message model,
// import/export pipeline and Hub preview remain owned by the existing modules.
function applyQuickFormat(key, value) {
    const select = el('format');
    if (!select || !formats.some((format) => format.key === key)) return;
    select.value = key;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const parameter = el('param').firstElementChild;
    if (parameter && value !== undefined) parameter.value = value;
    el('applyFormat').click();
    el('text').focus();
}

document.querySelectorAll('[data-quick-format]').forEach((control) => {
    control.addEventListener('click', () => applyQuickFormat(control.dataset.quickFormat));
});

el('quickColor').addEventListener('change', () => {
    applyQuickFormat('color', el('quickColor').value);
});

document.querySelectorAll('[data-close-panel]').forEach((control) => {
    control.addEventListener('click', () => {
        const toggle = control.dataset.closePanel === 'left' ? 'toggleLeft' : 'toggleRight';
        if (!el(toggle).disabled) el(toggle).click();
    });
});

el('emptyOpen').addEventListener('click', () => el('open').click());

// The slash hint in the search field is a keyboard shortcut, not a placeholder.
document.addEventListener('keydown', (event) => {
    const target = event.target;
    const editing = target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable=true]');
    if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        el('search').focus();
    }
});

// Keep the first view focused on the editor on compact screens. The panels can
// still be opened from the persistent status bar controls.
if (matchMedia('(max-width: 900px)').matches) el('inspector').hidden = true;
if (matchMedia('(max-width: 680px)').matches) el('library').hidden = true;

// Match the dark workspace shown in the design reference on first launch;
// an explicit saved preference always wins.
try {
    if (localStorage.getItem('tabhub.editor.scheme') === null) {
        el('scheme').value = 'dark';
        applyScheme();
        remember('scheme', 'dark');
    }
} catch {}
