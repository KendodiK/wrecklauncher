import React from 'react';
import GameSliderBase from './GameSliderBase.jsx';

// Styled + animated GameSlider wrapper.
// - CSS classes are defined in src/index.css under .gs-* selectors
// - Animation config (transition + timing) lives here
const GameSlider = (props) => {
	return (
		<GameSliderBase
			{...props}
			classNameWrapper="gs-carousel-wrapper"
			classNameCarousel="gs-carousel"
			classNameContainer="gs-cards"
			classNameCard="gs-card"
			classNameCardActive="gs-card-active"
			transition="transform 0.3s cubic-bezier(.2, .8, .2, 1)"
			transitionMs={300}
		/>
	);
};

export default GameSlider;
