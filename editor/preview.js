'use strict';

// Preview has no broadcast receiver, file imports or connection to a live Hub.
setPaused(true);
let latest = 0;
let freezeMotion = false;
let shouldPlay = false;
const heldAnimations = new Set();
function syncMotion() {
    if (freezeMotion) {
        for (const animation of document.getAnimations()) {
            if (animation.playState === 'running') {
                animation.pause();
                heldAnimations.add(animation);
            }
        }
    } else {
        for (const animation of heldAnimations) if (animation.playState === 'paused') animation.play();
        heldAnimations.clear();
    }
}
window.addEventListener('message', async (event) => {
    const data = event.data;
    if (
        event.source !== parent ||
        (event.origin !== location.origin && !(location.protocol === 'file:' && event.origin === 'null')) ||
        data?.channel !== 'tabhub-editor'
    )
        return;
    if (data.action === 'motion') {
        freezeMotion = data.frozen;
        syncMotion();
        return;
    }
    if (data.action === 'next') {
        nextTab();
        syncMotion();
        return;
    }
    if (data.action === 'pause') {
        shouldPlay = false;
        setPaused(true);
        return;
    }
    if (data.action === 'play') {
        shouldPlay = true;
        setPaused(false);
        return;
    }
    if (data.action !== 'render') return;
    const request = ++latest;
    shouldPlay = data.playing;
    freezeMotion = data.frozen;
    try {
        setPaused(true);
        if (
            !(await applyHubSettings({
                ...defaults,
                themeId: data.theme,
                colorMode: data.palette,
                openTiming: 'fixed',
                openInterval: data.interval
            }))
        )
            return;
        if (latest !== request) return;
        heldAnimations.clear();
        clearAnnouncements();
        source.entries = data.entries.filter((entry) => validEntry(entry));
        source.reset();
        nextTab();
        nextOpenAt = now() + openDelay();
        if (shouldPlay) setPaused(false);
        syncMotion();
    } catch (error) {
        if (latest === request)
            parent.postMessage({ channel: 'tabhub-preview-error', message: error.message }, '*');
    }
});
parent.postMessage({ channel: 'tabhub-preview-ready' }, '*');
