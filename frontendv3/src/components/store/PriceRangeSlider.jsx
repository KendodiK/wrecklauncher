import React, { useState, useEffect, useRef } from 'react';

/**
 * Dual-thumb price range slider component
 * Allows users to select min/max price range for game filtering
 */
const PriceRangeSlider = ({ min = 0, max = 100, value = { min: 0, max: 100 }, onChange, className = '' }) => {
	const [localValue, setLocalValue] = useState(value);
	const [isDragging, setIsDragging] = useState(null);
	const sliderRef = useRef(null);

	useEffect(() => {
		setLocalValue(value);
	}, [value]);

	const handleMinChange = (e) => {
		const newMin = Math.min(Number(e.target.value), localValue.max - 1);
		const newValue = { min: newMin, max: localValue.max };
		setLocalValue(newValue);
		onChange?.(newValue);
	};

	const handleMaxChange = (e) => {
		const newMax = Math.max(Number(e.target.value), localValue.min + 1);
		const newValue = { min: localValue.min, max: newMax };
		setLocalValue(newValue);
		onChange?.(newValue);
	};

	const formatPrice = (price) => {
		if (price === max) return 'Any';
		if (price === 0) return 'Free';
		return `$${price}`;
	};

	const minPercent = ((localValue.min - min) / (max - min)) * 100;
	const maxPercent = ((localValue.max - min) / (max - min)) * 100;

	return (
		<div className={`relative ${className}`}>
			{/* Price display */}
			<div className="flex justify-between items-center mb-3">
				<span className="text-sm text-slate-300 font-medium">
					{formatPrice(localValue.min)}
				</span>
				<span className="text-xs text-slate-500">to</span>
				<span className="text-sm text-slate-300 font-medium">
					{formatPrice(localValue.max)}
				</span>
			</div>

			{/* Slider container */}
			<div className="relative h-8" ref={sliderRef}>
				{/* Track background */}
				<div className="absolute top-1/2 -translate-y-1/2 w-full h-1.5 bg-slate-700 rounded-full" />

				{/* Active range */}
				<div
					className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-slate-300 rounded-full transition-all"
					style={{
						left: `${minPercent}%`,
						right: `${100 - maxPercent}%`,
					}}
				/>

				{/* Min range input */}
				<input
					type="range"
					min={min}
					max={max}
					value={localValue.min}
					onChange={handleMinChange}
					className="absolute w-full h-8 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-100 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-slate-600 [&::-webkit-slider-thumb]:hover:bg-white [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:transition-all [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-slate-100 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-slate-600 [&::-moz-range-thumb]:hover:bg-white [&::-moz-range-thumb]:hover:scale-110 [&::-moz-range-thumb]:transition-all"
					style={{ zIndex: localValue.min > max - 10 ? 5 : 3 }}
				/>

				{/* Max range input */}
				<input
					type="range"
					min={min}
					max={max}
					value={localValue.max}
					onChange={handleMaxChange}
					className="absolute w-full h-8 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-100 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-slate-600 [&::-webkit-slider-thumb]:hover:bg-white [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:transition-all [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-slate-100 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-slate-600 [&::-moz-range-thumb]:hover:bg-white [&::-moz-range-thumb]:hover:scale-110 [&::-moz-range-thumb]:transition-all"
					style={{ zIndex: 4 }}
				/>
			</div>
		</div>
	);
};

export default PriceRangeSlider;
