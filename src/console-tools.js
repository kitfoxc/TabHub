'use strict';

const pageButtons = document.querySelectorAll('[data-page]');
for (const button of pageButtons) button.onclick = () => {
    for (const tab of pageButtons) {
        document.getElementById(tab.dataset.page).hidden = tab !== button;
        tab.setAttribute('aria-pressed', String(tab === button));
    }
};

const logList = document.getElementById('log-list');
function writeLog(message) {
    const item = document.createElement('li');
    item.textContent = new Date().toLocaleTimeString() + ' · ' + message;
    logList.prepend(item);
    if (logList.children.length > 200) logList.lastElementChild.remove();
}
document.getElementById('clear-log').onclick = () => logList.replaceChildren();

const handles = new Map();
async function saveScript(filename, contents) {
    let result;
    if (typeof window.showSaveFilePicker === 'function') {
        try {
            const handle = handles.get(filename) ?? await window.showSaveFilePicker({ suggestedName: filename });
            const stream = await handle.createWritable();
            await stream.write(contents);
            await stream.close();
            handles.set(filename, handle);
            result = '已写入 ' + handle.name;
        } catch (error) {
            if (error.name === 'AbortError') result = '已取消保存 ' + filename;
            else { handles.delete(filename); writeLog(filename + ' 写入失败 · ' + error.message); }
        }
    }
    if (!result) {
        downloadScript(filename, contents);
        result = '已请求下载，请替换项目根目录的 ' + filename;
    }
    writeLog(result);
    return result;
}

const entries = document.getElementById('entries');
const editorState = document.getElementById('message-state');
const samples = { text: '', rich: [{ text: '公告', style: { bold: true } }],
    queue: { type: 'queue', content: ['第一条', '第二条'] },
    pack: { type: 'pack', conditions: [{ condition: 'weekday_check', weekday: 6 }], content: ['周六公告'] } };

function addEntry(value) {
    const row = document.createElement('li');
    const field = document.createElement('textarea');
    const plain = typeof value === 'string';
    const label = document.createElement('label');
    label.textContent = plain ? '纯文本' : '结构化公告（JSON）';
    field.dataset.format = plain ? 'text' : 'json';
    field.rows = plain ? 2 : 5;
    field.value = plain ? value : JSON.stringify(value, null, 2);
    label.append(field);
    row.append(label);
    for (const [caption, action] of [
        ['上移', () => row.previousElementSibling?.before(row)],
        ['下移', () => row.nextElementSibling?.after(row)],
        ['删除', () => row.remove()]
    ]) {
        const button = document.createElement('button');
        button.textContent = caption;
        button.onclick = () => { action(); editorState.textContent = '列表已修改。'; };
        row.append(button);
    }
    entries.append(row);
    return field;
}
if (typeof tabHubMessages !== 'undefined' && Array.isArray(tabHubMessages)) tabHubMessages.forEach(addEntry);
else editorState.textContent = '未能读取 messages.js。';
entries.oninput = () => { editorState.textContent = '列表已修改。'; };
document.getElementById('add-entry').onclick = () => {
    addEntry(samples[document.getElementById('entry-kind').value]).focus();
    editorState.textContent = '列表已修改。';
};
document.getElementById('save-messages').onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
        const data = Array.from(entries.querySelectorAll('textarea'), (field, i) => {
            try {
                const value = field.dataset.format === 'text' ? field.value : JSON.parse(field.value);
                if (!validEntry(value)) throw new Error('公告格式无效');
                return value;
            } catch (error) {
                field.focus();
                throw new Error('第 ' + (i + 1) + ' 条 · ' + error.message);
            }
        });
        editorState.textContent = await saveScript('messages.js', 'const tabHubMessages = ' + JSON.stringify(data, null, 2) + ';\n');
    } catch (error) { editorState.textContent = error.message; writeLog('公告保存失败 · ' + error.message); }
    finally { button.disabled = false; }
};
