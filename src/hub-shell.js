'use strict';

// Shared by the OBS source and the editor's isolated preview.
document.body.insertAdjacentHTML('beforeend', `<svg class="symbols" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>
        <symbol id="stack" viewBox="0 0 32 32"><path d="M3 24V9q0-2 2-3l13-5q2-1 3 1M9 27V12q0-2 2-3l13-5q2 0 2 2M15 29V15q0-2 2-3l11-4q3-1 3 2v14q0 2-2 3l-11 4q-3 1-3-2Z"/></symbol>
        <symbol id="page" viewBox="0 0 32 32"><rect x="3" y="3" width="26" height="26" rx="3"/><path d="M13 3v4q0 2 2 2h13"/><g stroke="none" fill="currentColor"><circle cx="10" cy="18" r="2"/><circle cx="16" cy="18" r="2"/><circle cx="22" cy="18" r="2"/></g></symbol>
        <symbol id="cross" viewBox="0 0 32 32"><path d="m7 7 18 18M25 7 7 25"/></symbol>
        <symbol id="plus" viewBox="0 0 32 32"><path d="M16 2v28M2 16h28"/></symbol>
    </defs></svg>
    <header class="chrome">
        <button class="tool" id="pause" title="暂停轮播" aria-label="暂停轮播" aria-pressed="false"><svg><use href="#stack"/></svg></button>
        <div id="rail"><div id="tabs" data-layout="horizontal" aria-label="公告标签"></div><button id="new-tab" title="打开下一条公告" aria-label="打开下一条公告"><svg><use href="#plus"/></svg></button></div>
        <div class="window-controls" aria-hidden="true"><i></i><i></i><svg><use href="#cross"/></svg></div>
    </header>
    <template id="tab-template"><div class="tab"><div class="face">
        <button class="select"><svg class="favicon"><use href="#page"/></svg><span class="clip"><span class="label"></span></span></button>
        <button class="close" aria-label="关闭标签"><svg><use href="#cross"/></svg></button>
    </div></div></template>
    <footer><strong id="live"></strong><span id="topic"></span><span id="detail"></span></footer>`);
