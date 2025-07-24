'use strict'

// === Global State
let scheduledRender = false;
let isSafari = false;
let windowSizeX = 0;
let windowSizeY = 0; // Added global windowSizeY
let scrollY = 0;
let pointer = { x: -Infinity, y: -Infinity };
let events = { keydown: null, click: null, mousemove: null };
let animatedUntilTime = null;
let reducedMotion = null;
let anchor = 0;
let data = [];
let dummyPlaceholder = null;

// === Config
const debug = false;
const msPerAnimationStep = 4;
const promptPaddingBottom = 8;
const promptSizeY = 44 + promptPaddingBottom;
const prompt1DSizeY = 64 + promptPaddingBottom;
const boxesGapX = 24,
    boxesGapY = 24;
const boxes1DGapX = 52,
    boxes1DGapY = 28;
const windowPaddingTop = 40;
const gapTopPeek = 40;
const hitArea1DSizeX = 100;
const hoverMagnetFactor = 40;
const browserUIMaxSizeTop = 100;
const browserUIMaxSizeBottom = 150;

// === Spring Physics
function spring(pos, v = 0, k = 290, b = 30) {
    return { pos, dest: pos, v, k, b };
}
function springStep(s) {
    const t = msPerAnimationStep / 1000;
    const { pos, dest, v, k, b } = s;
    const Fspring = -k * (pos - dest);
    const Fdamper = -b * v;
    const a = Fspring + Fdamper;
    s.v += a * t;
    s.pos += s.v * t;
}
function springGoToEnd(s) {
    s.pos = s.dest;
    s.v = 0;
}
function springForEach(fn) {
    for (const d of data) {
        fn(d.x);
        fn(d.y);
        fn(d.sizeX);
        fn(d.sizeY);
        fn(d.scale);
        fn(d.fxFactor);
    }
}

// === Helpers
function clamp(min, v, max) {
    return Math.max(min, Math.min(v, max));
}
function colsBoxMaxSizeXF(containerSizeX) {
    const boxMinSizeX = 220;
    const cols = clamp(
        1,
        Math.floor((containerSizeX - boxesGapX) / (boxMinSizeX + boxesGapX)),
        7,
    );
    const boxMaxSizeX = (containerSizeX - boxesGapX - cols * boxesGapX) / cols;
    return { cols, boxMaxSizeX };
}
function scheduleRender() {
    if (!scheduledRender) {
        scheduledRender = true;
        requestAnimationFrame(function (now) {
            scheduledRender = false;
            if (render(now)) scheduleRender();
        });
    }
}

// === Hit Testing
function hitTest2DMode(data, pointerX, pointerY) {
    for (let i = 0; i < data.length; i++) {
        const { x, y, sizeX, sizeY } = data[i];
        if (
            x.dest <= pointerX &&
            pointerX < x.dest + sizeX.dest &&
            y.dest <= pointerY && // Corrected from pointer.y
            pointerY < y.dest + sizeY.dest
        )
            return i;
    }
    return null;
}
function hitTest1DMode(data, focused, windowSizeX, pointerX) {
    if (focused > 0 && pointerX <= hitArea1DSizeX) return focused - 1;
    if (focused < data.length - 1 && pointerX >= windowSizeX - hitArea1DSizeX)
        return focused + 1;
    return null;
}

// === Main Render Function
function render(now) {
    if (data.length === 0) return;

    const inputCode = events.keydown?.code ?? null;
    if (events.click) {
        pointer.x = events.click.clientX;
        pointer.y = events.click.clientY;
    }
    if (events.mousemove) {
        pointer.x = events.mousemove.clientX;
        pointer.y = events.mousemove.clientY;
    }

    // Update window size on each render to handle resizes
    const newWindowSizeX = document.documentElement.clientWidth;
    const newWindowSizeY = document.documentElement.clientHeight;

    const animationDisabled = reducedMotion.matches;
    const currentScrollY = isSafari ? document.body.scrollTop : window.scrollY;
    const currentScrollX = isSafari ? document.body.scrollLeft : window.scrollX;
    const hashImgId = window.location.hash.slice(1);

    // Correctly handle focused state: null if no hash, otherwise find index
    let focused = hashImgId ? data.findIndex((d) => d.id === hashImgId) : null;
    if (focused === -1) focused = null; // Ensure focused is null if ID not found

    const pointerXLocal = pointer.x + currentScrollX;
    const pointerYLocal = pointer.y + currentScrollY;

    let newFocused = (() => {
        if (inputCode === "Escape") return null;
        if (
            (inputCode === "ArrowLeft" || inputCode === "ArrowRight") &&
            focused == null
        )
            return 0;
        if (inputCode === "ArrowLeft") return Math.max(0, focused - 1);
        if (inputCode === "ArrowRight")
            return Math.min(data.length - 1, focused + 1);
        return focused;
    })();

    if (events.click) {
        const { target } = events.click;
        if (target.tagName === "FIGCAPTION") {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(target);
            selection.removeAllRanges();
            selection.addRange(range);
        } else if (focused == null) {
            newFocused =
                hitTest2DMode(data, pointerXLocal, pointerYLocal) ?? newFocused;
        } else {
            newFocused = hitTest1DMode(
                data,
                focused,
                newWindowSizeX,
                pointerXLocal,
            );
        }
    }

    const { cols, boxMaxSizeX } = colsBoxMaxSizeXF(newWindowSizeX);
    const boxes2DSizeX = [],
        boxes2DSizeY = [],
        rowsTop = [windowPaddingTop];
    {
        let rowMaxSizeY = 0;
        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            const imgMaxSizeY =
                d.ar === 1
                    ? boxMaxSizeX * 0.85
                    : d.ar < 1
                      ? boxMaxSizeX * 1.05
                      : boxMaxSizeX;
            const sizeX = Math.min(
                d.naturalSizeX,
                boxMaxSizeX,
                imgMaxSizeY * d.ar,
            );
            const sizeY = sizeX / d.ar + promptSizeY;
            boxes2DSizeX.push(sizeX);
            boxes2DSizeY.push(sizeY);
            rowMaxSizeY = Math.max(rowMaxSizeY, sizeY);
            if (i % cols === cols - 1 || i === data.length - 1) {
                rowsTop.push(rowsTop.at(-1) + rowMaxSizeY + boxesGapY);
                rowMaxSizeY = 0;
            }
        }
    }

    let cursor = "auto";
    let newAnchor = anchor;
    let adjustedScrollTop = currentScrollY;

    if (newFocused == null) {
        if (focused != null) {
            const focusedTop = rowsTop[Math.floor(focused / cols)];
            const focusedBottom = focusedTop + boxes2DSizeY[focused];
            if (
                focusedTop <= currentScrollY ||
                focusedBottom >= currentScrollY + newWindowSizeY
            ) {
                adjustedScrollTop = focusedTop - boxesGapY - gapTopPeek;
            }
        }

        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            const sizeX = boxes2DSizeX[i];
            const sizeY = boxes2DSizeY[i];
            const row = Math.floor(i / cols);
            const rowMaxSizeY = rowsTop[row + 1] - boxesGapY - rowsTop[row];
            d.sizeX.dest = sizeX;
            d.sizeY.dest = sizeY;
            d.x.dest =
                boxesGapX +
                (boxMaxSizeX + boxesGapX) * (i % cols) +
                (boxMaxSizeX - sizeX) / 2;
            d.y.dest = rowsTop[row] + (rowMaxSizeY - sizeY) / 2;
            d.scale.dest = 1;
            d.fxFactor.dest = 1;
        }

        const hit = hitTest2DMode(data, pointerXLocal, pointerYLocal);
        if (hit != null) {
            cursor = "zoom-in";
            const d = data[hit];
            d.x.dest +=
                (pointerXLocal - (d.x.dest + d.sizeX.dest / 2)) /
                hoverMagnetFactor;
            d.y.dest +=
                (pointerYLocal - (d.y.dest + d.sizeY.dest / 2)) /
                hoverMagnetFactor;
            d.scale.dest = 1.02;
        }

        const anchorY = data[anchor].y.dest - gapTopPeek;
        if (newWindowSizeX !== windowSizeX)
            adjustedScrollTop = Math.max(0, anchorY);
        if (
            adjustedScrollTop !== scrollY &&
            Math.abs(anchorY - adjustedScrollTop) > newWindowSizeY / 10
        ) {
            for (newAnchor = 0; newAnchor < data.length; newAnchor += cols) {
                const d = data[newAnchor];
                if (
                    d.y.dest + d.sizeY.dest - adjustedScrollTop >
                    newWindowSizeY / 5
                )
                    break;
            }
        }
    } else {
        const img1DSizeY =
            newWindowSizeY - windowPaddingTop - prompt1DSizeY - boxes1DGapY;
        const box1DMaxSizeX =
            newWindowSizeX - boxes1DGapX * 2 - hitArea1DSizeX * 2;

        let currentLeft = hitArea1DSizeX + boxes1DGapX;
        for (let i = newFocused - 1; i >= 0; i--) {
            const d = data[i];
            const imgSizeX =
                Math.min(d.naturalSizeX, box1DMaxSizeX, img1DSizeY * d.ar) *
                0.7;
            currentLeft -= imgSizeX + boxes1DGapX;
        }

        const edgeBoost =
            inputCode === "ArrowLeft" && focused === 0
                ? 2000
                : inputCode === "ArrowRight" && focused === data.length - 1
                  ? -2000
                  : 0;

        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            const isFocused = i === newFocused;
            const imgSizeX =
                Math.min(d.naturalSizeX, box1DMaxSizeX, img1DSizeY * d.ar) *
                (isFocused ? 1 : 0.7);
            const sizeY = imgSizeX / d.ar + prompt1DSizeY;
            d.sizeX.dest = imgSizeX;
            d.sizeY.dest = sizeY;
            d.y.dest =
                Math.max(windowPaddingTop, (newWindowSizeY - sizeY) / 2) +
                adjustedScrollTop;
            d.x.dest = isFocused
                ? (newWindowSizeX - imgSizeX) / 2
                : currentLeft;
            d.x.v += edgeBoost / (isFocused ? 1 : 4);
            d.scale.dest = 1;
            d.fxFactor.dest = isFocused ? 1 : 0.2;
            currentLeft = isFocused
                ? newWindowSizeX - hitArea1DSizeX
                : currentLeft + imgSizeX + boxes1DGapX;
        }

        const hit = hitTest1DMode(
            data,
            newFocused,
            newWindowSizeX,
            pointerXLocal,
        );
        if (hit != null) {
            cursor = "zoom-in";
            const d = data[hit];
            d.x.dest +=
                (pointerXLocal - (d.x.dest + d.sizeX.dest / 2)) /
                hoverMagnetFactor;
            d.y.dest +=
                (pointerYLocal - (d.y.dest + d.sizeY.dest / 2)) /
                hoverMagnetFactor;
            d.scale.dest = 1.02;
            d.fxFactor.dest = 0.5;
        } else {
            cursor = "zoom-out";
        }
    }

    for (const d of data) d.y.pos += adjustedScrollTop - currentScrollY;

    // === Animate
    let newAnimatedUntilTime = animatedUntilTime ?? now;
    const steps = Math.floor((now - newAnimatedUntilTime) / msPerAnimationStep);
    newAnimatedUntilTime += steps * msPerAnimationStep;
    let stillAnimating = false;

    if (animationDisabled) springForEach(springGoToEnd);
    else {
        springForEach((s) => {
            for (let i = 0; i < steps; i++) springStep(s);
            if (Math.abs(s.v) < 0.01 && Math.abs(s.dest - s.pos) < 0.01)
                springGoToEnd(s);
            else stillAnimating = true;
        });
    }

    // === DOM Update
    for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const { node } = d;
        const img = node.children[0];
        const prompt = node.children[1];
        const inView =
            d.y.pos - adjustedScrollTop <=
                newWindowSizeY + browserUIMaxSizeBottom &&
            d.y.pos + d.sizeY.pos - adjustedScrollTop >= -browserUIMaxSizeTop &&
            d.x.pos <= newWindowSizeX &&
            d.x.pos + d.sizeX.pos >= 0;

        if (inView) {
            node.style.width = `${d.sizeX.pos}px`;
            node.style.height = `${d.sizeY.pos}px`;
            node.style.transform = `translate3d(${d.x.pos}px,${d.y.pos}px,0) scale(${d.scale.pos})`;
            node.style.filter =
                newFocused != null &&
                (i === newFocused - 1 ||
                    i === newFocused ||
                    i === newFocused + 1)
                    ? `brightness(${d.fxFactor.pos * 100}%) blur(${Math.max(0, 6 - d.fxFactor.pos * 6)}px)`
                    : `brightness(${d.fxFactor.pos * 100}%)`;
            node.style.zIndex = i === newFocused ? data.length + 999 : i + 1;

            prompt.style.top = `${d.sizeX.pos / d.ar}px`;
            prompt.style.overflowY = i === newFocused ? "auto" : "hidden";
            prompt.style.height = `${(i === newFocused ? prompt1DSizeY : promptSizeY) - promptPaddingBottom}px`;
            prompt.style.lineClamp = prompt.style.webkitLineClamp =
                i === newFocused ? 999 : 2;
            img.style.display = "block";

            if (node.parentNode == null) document.body.appendChild(node);
        } else if (node.parentNode != null) {
            document.body.removeChild(node);
        }
    }

    document.body.style.cursor = cursor;
    document.body.style.overflowY = newFocused == null ? "auto" : "hidden";
    dummyPlaceholder.style.height = `${rowsTop.at(-1)}px`; // Uncommented and moved here

    // === State Updates
    if (adjustedScrollTop !== currentScrollY) {
        (isSafari ? document.body : window).scrollTo({
            top: adjustedScrollTop,
        });
    }
    if (newFocused !== focused) {
        window.history.pushState(
            null,
            "",
            `${window.location.pathname}${window.location.search}${newFocused == null ? "" : "#" + data[newFocused].id}`,
        );
        
        // Toggle UI elements visibility based on focus state
        const uploadForm = document.getElementById('uploadForm');
        const githubRibbon = document.querySelector('.github-fork-ribbon');
        
        if (newFocused !== null) {
            uploadForm?.classList.add('focused-mode');
            githubRibbon?.classList.add('focused-mode');
        } else {
            uploadForm?.classList.remove('focused-mode');
            githubRibbon?.classList.remove('focused-mode');
        }
    }

    events.keydown = events.click = events.mousemove = null;
    animatedUntilTime = stillAnimating ? newAnimatedUntilTime : null;
    anchor = newAnchor;
    windowSizeX = newWindowSizeX; // Update global windowSizeX
    windowSizeY = newWindowSizeY; // Update global windowSizeY
    scrollY = adjustedScrollTop;

    return stillAnimating;
}

// === Public API
export function initCardViewer(initialData) {
    data = initialData.map((d, i) => {
        const ar = d.w / d.h;
        const { cols, boxMaxSizeX } = colsBoxMaxSizeXF(windowSizeX);
        const imgMaxSizeY = boxMaxSizeX + 100;
        const sizeX = Math.min(d.w, boxMaxSizeX, imgMaxSizeY * ar);
        const sizeY = sizeX / ar + promptSizeY;

        const node = document.createElement("div");
        node.className = "box";
        node.style.backgroundImage = `url(${d.lowResSrc})`;

        const img = document.createElement("img");
        const promptNode = document.createElement("figcaption");
        promptNode.className = "prompt";
        promptNode.textContent = d.prompt;

        node.append(img, promptNode);

        return {
            id: d.id,
            naturalSizeX: d.w,
            ar,
            sizeX: spring(sizeX),
            sizeY: spring(sizeY),
            x: spring((boxMaxSizeX + boxesGapX) * (i % cols) + boxesGapX + (boxMaxSizeX - sizeX) / 2),
            y: spring(windowPaddingTop + Math.floor(i / cols) * (boxMaxSizeX * 0.7 + boxesGapY)),
            scale: spring(1),
            fxFactor: spring(20),
            node,
            highResSrc: d.highResSrc,
        };
    });

    scheduleRender();
}

export function updateCardImage(id, highResSrc, width, height) {
    const card = data.find((d) => d.id === id);
    if (card) {
        card.node.children[0].src = highResSrc;
        card.naturalSizeX = width;
        card.ar = width / height;

        const { boxMaxSizeX } = colsBoxMaxSizeXF(windowSizeX);
        const imgMaxSizeY = boxMaxSizeX + 100;
        const newSizeX = Math.min(
            card.naturalSizeX,
            boxMaxSizeX,
            imgMaxSizeY * card.ar,
        );
        const newSizeY = newSizeX / card.ar + promptSizeY;

        card.sizeX.dest = newSizeX;
        card.sizeY.dest = newSizeY;
        scheduleRender();
    }
}

export function initializeCardViewer() {
    isSafari =
        navigator.userAgent.includes("Safari") &&
        !navigator.userAgent.includes("Chrome");
    if (isSafari) {
        document.body.style.contain = "layout";
        document.body.style.width = "100vw";
        document.body.style.height = "100vh";
    }

    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    windowSizeX = document.documentElement.clientWidth;
    windowSizeY = document.documentElement.clientHeight;
    scrollY = isSafari ? document.body.scrollTop : window.scrollY;
    pointer = { x: -Infinity, y: -Infinity };
    events = { keydown: null, click: null, mousemove: null };

    dummyPlaceholder = document.createElement("div");
    dummyPlaceholder.style.position = "absolute";
    dummyPlaceholder.style.width = "1px";
    document.body.append(dummyPlaceholder);

    if (debug) {
        document.documentElement.style.background =
            "repeating-linear-gradient(#e66465 0px, #9198e5 300px)";
        document.documentElement.style.height = "100%";
    }

    window.addEventListener("resize", scheduleRender);
    window.addEventListener("scroll", scheduleRender, true);
    window.addEventListener("popstate", scheduleRender);
    window.addEventListener("keydown", (e) => {
        events.keydown = e;
        scheduleRender();
    });
    window.addEventListener("click", (e) => {
        events.click = e;
        scheduleRender();
    });
    window.addEventListener("mousemove", (e) => {
        events.mousemove = e;
        scheduleRender();
    });

    scheduleRender();
}
