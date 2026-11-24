'use strict';

function openDraftDatabase() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('tabhub-messages-editor', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('workspaces');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
// Keep separate drafts for independent editor windows. The most recent one is
// offered on a fresh launch, while reloading a tab restores its own workspace.
const draftPrefix = location.href.split(/[?#]/)[0] + '#';
let workspaceKey;
function listDrafts(db) {
    return new Promise((resolve, reject) => {
        const req = db
            .transaction('workspaces')
            .objectStore('workspaces')
            .getAll(IDBKeyRange.bound(draftPrefix, draftPrefix + '\uffff'));
        req.onsuccess = () => resolve(req.result.sort((a, b) => b.updated - a.updated));
        req.onerror = () => reject(req.error);
    });
}
async function loadWorkspace(db) {
    const saved = await listDrafts(db);
    let previous;
    try {
        previous = sessionStorage.getItem(draftPrefix);
    } catch {}
    // On a reload, keep the same key. New windows (including duplicated tabs)
    // start a separate draft even if the browser copied sessionStorage.
    const reload = performance.getEntriesByType('navigation')[0]?.type === 'reload';
    workspaceKey = reload && previous ? previous : draftPrefix + editorId();
    try {
        sessionStorage.setItem(draftPrefix, workspaceKey);
    } catch {}
    return saved.find((item) => item.key === previous) ?? saved[0];
}
function storeWorkspace(db, docs, activeId) {
    if (!workspaceKey) return Promise.resolve();
    const documents = docs.map(({ id, name, rows, active, saved, handle, original }) => ({
        id,
        name,
        rows,
        active,
        handle,
        original,
        dirty: rows !== saved
    }));
    return new Promise((resolve, reject) => {
        const tx = db.transaction('workspaces', 'readwrite');
        tx.objectStore('workspaces').put(
            { key: workspaceKey, updated: Date.now(), documents, activeId },
            workspaceKey
        );
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error || new Error('草稿写入已取消'));
    });
}
async function readMessageFile(file) {
    const source = await file.text();
    const content = file.name.toLowerCase().endsWith('.json') ? 'const tabHubMessages = ' + source : source;
    return { name: file.name, entries: parseStaticMessages(content), original: source };
}
function downloadText(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function outputName(doc) {
    if (doc.name === '未命名.js') return 'messages.js';
    return doc.name.replace(/(?:\.js|\.json)?$/i, '.js');
}
async function writeDocument(doc, saveAs) {
    if (doc.writing) return;
    const rows = doc.rows;
    if (rows.some((row) => row.error)) throw new Error('请先修正公告源码中的错误');
    const text = serializeMessages(rows.map((row) => row.value));
    let handle = !saveAs && doc.handle;
    let writer;
    doc.writing = true;
    try {
        if (!handle && window.showSaveFilePicker) {
            handle = await window.showSaveFilePicker({
                suggestedName: outputName(doc),
                types: [{ description: 'TabHub 消息文件', accept: { 'text/javascript': ['.js'] } }]
            });
        }
        if (!handle) {
            downloadText(outputName(doc), text);
            return '已导出下载';
        }
        if (doc.handle && (await handle.isSameEntry(doc.handle))) {
            const current = await (await handle.getFile()).text();
            if (current !== doc.original) throw new Error('磁盘文件已被外部修改');
        }
        writer = await handle.createWritable();
        await writer.write(text);
        await writer.close();
        Object.assign(doc, { handle, original: text, saved: rows, name: handle.name });
        return '文件已保存';
    } catch (error) {
        if (writer) await writer.abort().catch(() => {});
        if (!writer && error.name === 'AbortError') return '已取消保存';
        downloadText(outputName(doc), text);
        return (error.message || '写入失败') + ' · 已下载独立副本';
    } finally {
        doc.writing = false;
    }
}
