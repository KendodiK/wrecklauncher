/*
 * scripts/carousel.js
 * Small, dependency-free carousel used on the home page.
 * It finds all `.carousel` sections and initializes a lightweight
 * centered-card layout for each one independently.
 */

(function () {
  // Find all carousel sections in the document
  const carousels = Array.from(document.querySelectorAll('.carousel'));
  if (!carousels.length) return;

  carousels.forEach((section) => {
    // Collect the individual cards for this carousel
    const cards = Array.from(section.querySelectorAll('.cards li'));
    if (!cards || cards.length === 0) return;

    // Choose a sensible starting index (centered-ish)
    let active = Math.min(2, Math.max(0, Math.floor(cards.length / 2)));

    // Update CSS classes on cards to reflect the current active index.
    // The CSS handles positioning/scale/opacity for the visual layout.
    function updateCards() {
      cards.forEach((card, i) => {
        card.className = '';
        if (i === active) card.classList.add('active-center');
        else if (i === active - 1) card.classList.add('active-left');
        else if (i === active + 1) card.classList.add('active-right');
        else if (i === active - 2) card.classList.add('left');
        else if (i === active + 2) card.classList.add('right');
        else if (i === active - 3) card.classList.add('left-out');
        else if (i === active + 3) card.classList.add('right-out');
      });
    }

    // Initial render
    updateCards();

    const nextBtn = section.querySelector('.next');
    const prevBtn = section.querySelector('.prev');

    // Local controls: next/previous buttons for this carousel
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        active++;
        if (active >= cards.length) active = 0;
        updateCards();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        active--;
        if (active < 0) active = cards.length - 1;
        updateCards();
      });
    }

    // Keyboard support: when the section has focus use arrows to navigate
    section.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') nextBtn?.click();
      else if (e.key === 'ArrowLeft') prevBtn?.click();
    });

    // Make the section focusable so keyboard navigation works
    if (!section.hasAttribute('tabindex')) section.setAttribute('tabindex', '0');
  });
})();
