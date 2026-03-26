document.addEventListener("DOMContentLoaded", () => {
    const anchImg = document.getElementById("anchor-image");
    const chainContainer = document.getElementById("chain-container");

    if (anchImg && chainContainer) {
        //onOpacityOne(anchImg, loadChains);
    }

    function loadChains() {
        let chainPozes = [];

        const anchorRect = anchImg.getBoundingClientRect();
        console.log(anchorRect);
        const containerRect = chainContainer.getBoundingClientRect();
        const baseX = anchorRect.left - containerRect.left - 40;
        const baseY = anchorRect.top - containerRect.top;   

        for (let i = 0; i < 25; i++) {
            let pozY = baseY;
            let pozX = baseX - i * 42;
            let chainPoz = [pozX, pozY];
            chainPozes.push(chainPoz);
        }

        console.log(chainPozes);

        for (let i = 0; i < 25; i++) {
            const img = document.createElement('img');
            img.src = (i % 2 === 0) ? 'img/link_one.svg' : 'img/link_two.svg';
            img.style.width = "4vw";
            img.style.height = "auto";
            img.style.position = "absolute";
            img.style.left = chainPozes[i][0] + 'px';
            img.style.top = chainPozes[i][1] + 'px';
            chainContainer.appendChild(img);
        }
    }

    function onOpacityOne(el, cb) {
        if (!el) return;
        const get = () => parseFloat(window.getComputedStyle(el).opacity) || 0;

        if (get() >= 0.999) return cb();

        const onTransitionEnd = (e) => {
            if (e.propertyName === 'opacity' && get() >= 0.999) {
            cleanup();
            cb();
            }
        };

        const mo = new MutationObserver(() => {
            if (get() >= 0.999) {
            cleanup();
            cb();
            }
        });

        let rafId;
        function poll() {
            if (get() >= 0.999) {
            cleanup();
            cb();
            } else {
            rafId = requestAnimationFrame(poll);
            }
        }

        function cleanup() {
            el.removeEventListener('transitionend', onTransitionEnd);
            mo.disconnect();
            if (rafId) cancelAnimationFrame(rafId);
        }

        el.addEventListener('transitionend', onTransitionEnd);
        mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
        rafId = requestAnimationFrame(poll);
    }
});