document.addEventListener("DOMContentLoaded", async () => {
    const sitesUl = document.getElementById("sites-ul");
    const pirateUl = document.getElementById("pirate-ul");

    if (CSS.supports("animation-timeline: scroll()")) {
        document.body.classList.add("scroll-animation");
    } else {
        document.body.classList.add("no-scroll-animation");
    }

    const fallbackSites = ["Steam", "itch.io", "gogo.com"];
    const fallbackPirateSites = ["PC games", "Fit-girl repack"];
    const url = "https://api.anchorlauncher.hu/api";

    let sitesFromApi = []; 
    try {
        await fetch(`${url}/platforms`).then(response => response.json())
            .then(data => {
                sitesFromApi = data;
            });
    } catch (error) {
        console.error("Error fetching platforms from API:", error);
    }

    let pirateSitesFromApi = [];
    try {
        await fetch(`${url}/pirate-sites`).then(response => response.json())
            .then(data => {
                pirateSitesFromApi = data;
            });
    } catch (error) {
        console.error("Error fetching pirate sites from API:", error);
    }

    if (sitesFromApi.length > 0) {
        for(const site of sitesFromApi) {
            let row = `<li>${site.platform_name}</li>`;
            sitesUl.insertAdjacentHTML("beforeend", row);
        }
    } else {
        console.log("No platforms received from API, using fallback list.");
        for(const site of fallbackSites) {
            let row = `<li>${site}</li>`;
            sitesUl.insertAdjacentHTML("beforeend", row);
        }
    }

    if (pirateSitesFromApi.length > 0) {
        for(const site of pirateSitesFromApi) {
            let row = `<li>${site.name}</li>`;
            pirateUl.insertAdjacentHTML("beforeend", row);
        }
    } else {
        console.log("No pirate sites received from API, using fallback list.");
        for(const site of fallbackPirateSites) {
            let row = `<li>${site}</li>`;
            pirateUl.insertAdjacentHTML("beforeend", row);
        }
    }

    await fetch(`${url}/games/gamecount`).then(response => response.json())
        .then(data => {
            const gameCountElement = document.getElementById("game-count");
            gameCountElement.textContent = `${data.count}`;
        }).catch(error => {
            console.error("Error fetching game count from API:", error);
        }
    );

    //----------creating QR code for mobile app download----------

    const qrElement = document.getElementById('qrcode');
    // ensure the container is empty to avoid duplicate QR renderings
    qrElement.innerHTML = '';

    const qrUrl = 'https://github.com/Milan-aka-Suguru/wrecklauncher-server-only/releases/download/latest/Anchor-Launcher-Setup-Android.apk/';

    const qrcode = new QRCode(qrElement, {
    text: qrUrl,
    width: 128,
    height: 128,
    colorDark : '#000',
    colorLight : '#fff',
    correctLevel : QRCode.CorrectLevel.H
    });

    const qrActionButtons = Array.from(qrElement.querySelectorAll('.qr-action'));

    qrActionButtons.find(b => b.dataset.qrAction === 'visit').href = qrUrl;

    document.addEventListener('click', e => {
        if (e.target) {
            if (qrActionButtons.indexOf(e.target) !== -1) {
            const button = e.target;
            const action = button.dataset.qrAction;
            if (action === 'download') {
                const a = document.createElement('a');
                a.download = 'QR-Code.png';
                a.href = qrElement.querySelector('img').src;
                console.log(a.href);
                a.click();
                a.remove();
            } else if (action === 'copy') {
                fetch(qrElement.querySelector('img').src).then(res => res.blob()).then(blob => navigator.clipboard.write([new ClipboardItem({[blob.type]:blob})]));
            } else if (action === 'visit') {
                // handled organically
            }
            }
        }
    });
});