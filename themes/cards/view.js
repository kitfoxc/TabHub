'use strict';

registerTabHubView({
    template: `<div class="card">
        <button class="select"><span class="clip"><span class="label"></span></span></button>
        <button class="close" aria-label="关闭公告">×</button>
    </div>`,
    mount() {
        return {
            layout({ visible, active }) {
                for (const [index, tab] of visible.entries()) {
                    const depth = visible.length - index - 1;
                    tab.querySelector('.card').style.setProperty('--card-opacity',
                        tab === active ? 1 : Math.max(.78, 1 - depth * .04));
                }
            }
        };
    }
});
