export function nextSlide(index: number, step: number, count: number): number;
export function autoplayAllowed(options: { count: number; paused: boolean; reducedMotion: boolean; visible: boolean; hovered: boolean; focused: boolean; overlayOpen: boolean }): boolean;
export function swipeDirection(startX: number, startY: number, endX: number, endY: number): -1 | 0 | 1;
