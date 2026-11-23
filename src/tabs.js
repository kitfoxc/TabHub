'use strict';

function allocateTabWidths(textWidths, insets, capacity, { fitText, minWidth, maxWidth, recentCount }) {
    const count = textWidths.length;
    if (!count) return [];
    if (fitText === 'off') return Array(count).fill(Math.min(maxWidth, capacity / count));

    const widths = textWidths.map(width => Math.max(minWidth, insets + width));
    let excess = widths.reduce((sum, width) => sum + width, 0) - capacity;
    const recentStart = Math.max(0, count - recentCount);
    for (let index = 0; index < recentStart && excess > 0; index++) {
        const reduction = Math.min(excess, widths[index] - minWidth);
        widths[index] -= reduction;
        excess -= reduction;
    }
    if (excess <= 0) return widths;

    const recent = textWidths.slice(recentStart);
    const recentBudget = capacity - recentStart * minWidth;
    const sharedWidth = recentBudget / recent.length;
    if (sharedWidth <= insets) {
        return widths.slice(0, recentStart).concat(recent.map(() => sharedWidth));
    }

    // Apply one percentage to the text area, after reserving the theme insets.
    let budget = recentBudget - insets * recent.length;
    const minimumText = Math.max(0, minWidth - insets);
    let total = recent.reduce((sum, width) => sum + width, 0);
    for (const width of recent.slice().sort((a, b) => a - b)) {
        if (width * budget >= minimumText * total) break;
        budget -= minimumText;
        total -= width;
    }
    const scale = total > 0 ? budget / total : 0;
    return widths.slice(0, recentStart).concat(recent.map(width => Math.max(minWidth, insets + width * scale)));
}

function createTabStrip(onChange) {
    const tabs = document.getElementById('tabs');
    const rail = document.getElementById('rail');
    const chromeBar = document.querySelector('.chrome');
    const template = document.getElementById('tab-template');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let active;
    let duration = 0;
    const textAnimations = new Map();
    // Opening order is independent of both visual placement and user selection.
    const announcements = new Set();
    let previous;
    const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : null;
    const characterCounts = new WeakMap();

    function closeMotion(tab) {
        if (!announcements.delete(tab)) return;
        const label = tab.querySelector('.label');
        const scrolling = textAnimations.get(label);
        if (scrolling) {
            scrolling.animation.pause();
            textAnimations.delete(label);
        }
        if (tab === active) {
            const visible = [...tabs.children].filter(item => !item.inert);
            const i = visible.indexOf(tab);
            active = visible[i + 1] || visible[i - 1] || [...announcements].at(-1);
        }
        if (!duration || reducedMotion.matches || !tab.offsetWidth) {
            tab.remove();
            return;
        }
        tab.dataset.closeSide = options.closeSide;
        const painted = getComputedStyle(tab);
        tab.style.setProperty('--closing-width', painted.width);
        tab.style.setProperty('--closing-opacity', painted.opacity);
        tab.style.setProperty('--closing-transform', painted.transform);
        tab.classList.add('leaving');
        tab.classList.toggle('was-active', tab.classList.contains('active'));
        tab.classList.remove('active');
        tab.inert = true;
        tab.style.width = '0px';
        // Includes hidden tabs and reduced-motion profiles that emit no transitionend.
        const finish = event => {
            if (event.target === tab && event.propertyName === 'width') tab.remove();
        };
        tab.addEventListener('transitionend', finish);
        setTimeout(() => tab.remove(), duration + 50);
    }

    function scrollLabel(label, distance, transition) {
        const travel = distance / options.scrollSpeed * 1000;
        const cycle = travel + options.scrollHold * 2;
        const signature = [distance, options.scrollSpeed, options.scrollHold, options.scrollRepeat].join('/');
        const existing = textAnimations.get(label);
        if (existing?.signature === signature) return;
        existing?.animation.cancel();
        const end = 'translateX(-' + distance + 'px)';
        const frames = [
            { transform: 'translateX(0)', offset: 0 },
            { transform: 'translateX(0)', offset: options.scrollHold / cycle },
            { transform: end, offset: 1 - options.scrollHold / cycle },
            { transform: end, offset: 1 }
        ];
        const animation = label.animate(frames, {
            delay: transition, duration: cycle,
            iterations: options.scrollRepeat === 'loop' ? Infinity : 1, fill: 'both'
        });
        textAnimations.set(label, { animation, signature });
    }

    function layout() {
        const scrolling = new Set();
        const theme = getComputedStyle(chromeBar);
        const metric = name => Number(theme.getPropertyValue(name));
        const scale = Math.max(.5, Math.min(metric('--max-scale'), innerWidth / metric('--design-width')));
        chromeBar.style.setProperty('--tab-scale', scale);
        duration = reducedMotion.matches ? 0 : metric('--motion-ms') / options.speed;
        chromeBar.style.setProperty('--motion', duration + 'ms');
        chromeBar.style.setProperty('--curve', options.easing === 'browser' ? 'cubic-bezier(.08,.75,.12,1)' : options.easing === 'theme' ? 'var(--theme-curve)' : options.easing);

        const railStyle = getComputedStyle(rail);
        const capacity = Math.max(0, rail.clientWidth - parseFloat(railStyle.paddingRight)
            - parseFloat(railStyle.columnGap) - document.getElementById('new-tab').offsetWidth);
        const open = [...announcements];
        const count = Math.min(options.limit, Math.floor(capacity / options.minWidth));
        const visible = count ? open.slice(-count) : [];
        if (active && visible.length && !visible.includes(active)) visible[0] = active;
        const visibleTabs = new Set(visible);
        for (const tab of open) {
            tab.inert = !visibleTabs.has(tab);
            tab.classList.toggle('shelved', tab.inert);
            if (tab.inert) tab.style.width = '0px';
            tab.classList.toggle('active', tab === active);
        }

        const titleInset = metric('--title-inset');
        const closeInset = metric('--close-inset');
        const narrowWidth = metric('--narrow-width');
        const iconOnlyWidth = metric('--icon-only-width');
        const items = visible.map(tab => {
            const label = tab.querySelector('.label');
            const textWidth = Math.ceil(label.getBoundingClientRect().width / scale);
            return { tab, label, textWidth };
        });
        const widths = allocateTabWidths(items.map(item => item.textWidth), titleInset + closeInset, capacity, options);

        for (const [index, { tab, label, textWidth }] of items.entries()) {
            const width = widths[index];
            const current = tab === active;
            const iconOnly = width < iconOnlyWidth;
            const hasClose = current || width >= narrowWidth;
            tab.classList.toggle('narrow', width < narrowWidth);
            tab.classList.toggle('icon-only', iconOnly);
            tab.style.width = width + 'px';
            tab.querySelector('.select').setAttribute('aria-pressed', String(current));

            const clipWidth = Math.max(0, width - titleInset - (hasClose ? closeInset : 0));
            const distance = Math.max(0, textWidth - clipWidth);
            tab.classList.toggle('overflowing', distance > 0);
            const allowScroll = options.scrollScope === 'all' || (current && options.scrollScope === 'active');
            if (allowScroll && clipWidth > 0 && distance > 0 && !iconOnly && !document.hidden && !reducedMotion.matches) {
                scrolling.add(label);
                scrollLabel(label, distance, duration);
            }
        }
        for (const [label, state] of textAnimations) {
            if (scrolling.has(label)) continue;
            state.animation.cancel();
            textAnimations.delete(label);
        }
    }

    function closeCandidates() {
        const candidates = [...tabs.children].filter(tab => announcements.has(tab) && tab !== active);
        if (options.closeSide === 'right') candidates.reverse();
        return candidates;
    }
    function trimHistory() {
        if (announcements.size <= options.limit) return;
        const candidates = closeCandidates();
        if (!options.limit && active) candidates.push(active);
        for (const tab of candidates.slice(0, announcements.size - options.limit)) closeMotion(tab);
    }
    function appendTab(content, manual) {
        const html = content.innerHTML;
        if (!options.limit || !content.textContent || (!manual && html === previous && active)) return false;
        previous = html;
        const tab = template.content.firstElementChild.cloneNode(true);
        const label = tab.querySelector('.label');
        label.append(...content.childNodes);
        const text = label.textContent;
        tab.querySelector('.select').title = text;
        const characters = segmenter ? Array.from(segmenter.segment(text), part => part.segment) : Array.from(text);
        characterCounts.set(tab, characters.filter(character => /\S/u.test(character)).length);
        announcements.add(tab);
        tab.dataset.openSide = options.openSide;
        if (options.openSide === 'left') tabs.prepend(tab);
        else tabs.append(tab);
        tab.getBoundingClientRect(); // Establish width zero before opening.
        active = tab;
        trimHistory();
        return true;
    }

    tabs.addEventListener('click', event => {
        const tab = event.target.closest('.tab');
        if (!tab || tab.inert) return;
        if (event.target.closest('.close')) {
            closeMotion(tab);
        } else {
            active = tab;
        }
        onChange();
    });
    reducedMotion.addEventListener('change', onChange);
    return {
        get activeCharacterCount() { return characterCounts.get(active) ?? 0; },
        get size() { return announcements.size; },
        append: appendTab, layout, trimHistory,
        finishThemeMotion() {
            for (const tab of tabs.children) {
                if (announcements.has(tab)) delete tab.dataset.openSide;
            }
            tabs.querySelectorAll('.leaving').forEach(tab => tab.remove());
        },
        clear() {
            for (const { animation } of textAnimations.values()) animation.cancel();
            textAnimations.clear();
            announcements.clear();
            active = undefined;
            previous = undefined;
            tabs.replaceChildren();
        },
        closeNext() {
            const victim = closeCandidates()[0] || active;
            if (victim) closeMotion(victim);
        }
    };
}
