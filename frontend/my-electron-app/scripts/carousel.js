/*
 * scripts/carousel.js
 * Small, dependency-free carousel used on the home page.
 * It finds all `.carousel` sections and initializes a lightweight
 * centered-card layout for each one independently.
 *
 * Exposes window.initCarousels() so React can (re)run
 * the carousel wiring after it renders content.
 */

(function () {
  function initCarousels() {
    const carousels = Array.from(document.querySelectorAll('.carousel'));
    if (!carousels.length) return;

    carousels.forEach((section) => {
      // Avoid double-binding if called multiple times
      if (section.dataset.carouselInitialized === 'true') return;
      section.dataset.carouselInitialized = 'true';

      const cards = Array.from(section.querySelectorAll('.cards li'));
      if (!cards || cards.length === 0) return;

      let active = Math.min(2, Math.max(0, Math.floor(cards.length / 2)));

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

      updateCards();

      const nextBtn = section.querySelector('.next');
      const prevBtn = section.querySelector('.prev');

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

      section.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') nextBtn?.click();
        else if (e.key === 'ArrowLeft') prevBtn?.click();
      });

      if (!section.hasAttribute('tabindex')) section.setAttribute('tabindex', '0');
    });
  }

  // Make available to React / other scripts
  window.initCarousels = initCarousels;

  // Also run once on DOM ready for non-React content
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCarousels);
  } else {
    initCarousels();
  }
})();
