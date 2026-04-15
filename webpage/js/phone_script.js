document.addEventListener("DOMContentLoaded", async () => {
    const menuImg = document.getElementById("menu-img");
    const menuCont = document.getElementById("menu-cont");
    const url = "https://api.anchorlauncher.hu/api";

    menuImg.addEventListener("click", () => {
        if (menuCont.style.display === "block") {
            menuCont.style.display = "none";
        } else {
            menuCont.style.display = "block";
        }
    });

    document.addEventListener("click", (event) => {
        if (!menuCont.contains(event.target) && event.target !== menuImg) {
            menuCont.style.display = "none";
        }
    });

    await fetch(`${url}/games/gamecount`).then(response => response.json())
        .then(data => {
            const gameCountElement = document.getElementById("game-count");
            gameCountElement.textContent = `${data.count}`;
        }).catch(error => {
            console.error("Error fetching game count from API:", error);
        }
    );
});