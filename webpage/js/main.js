document.addEventListener("DOMContentLoaded", async () => {
    const sitesUl = document.getElementById("sites-ul");
    const pirateUl = document.getElementById("pirate-ul");

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
});