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

// Dimensions are in the rail's unscaled CSS pixels.
const tabLayouts = {
    horizontal: {
        dimension: 'width',
        offset: 'offsetWidth',
        capacity(rail, button, css) {
            return rail.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)
                - (parseFloat(css.columnGap) || 0) - button.offsetWidth;
        },
        minimum(options) { return options.minWidth; },
        sizes(items, { capacity, options, insets }) {
            return allocateTabWidths(items.map(item => item.textWidth), insets, capacity, options);
        },
        labelArea({ size, current, titleInset, closeInset, narrowWidth, iconOnlyWidth }) {
            const narrow = size < narrowWidth;
            return { narrow, iconOnly: size < iconOnlyWidth,
                width: size - titleInset - (current || !narrow ? closeInset : 0) };
        }
    },
    vertical: {
        dimension: 'height',
        offset: 'offsetHeight',
        capacity(rail, button, css) {
            return rail.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom)
                - (parseFloat(css.rowGap) || 0) - button.offsetHeight;
        },
        minimum(options, metric) { return Math.max(1, metric('--card-height') || 72); },
        sizes(items, { minimum }) { return items.map(() => minimum); },
        labelArea({ label }) {
            return { narrow: false, iconOnly: false, width: label.parentElement.clientWidth };
        }
    }
};
