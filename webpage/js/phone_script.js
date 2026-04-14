document.addEventListener("DOMContentLoaded", async () => {
    const menuImg = document.getElementById("menu-img");
    const menuCont = document.getElementById("menu-cont");

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
});