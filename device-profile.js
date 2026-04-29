export function createDeviceProfile() {
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const hasHover = window.matchMedia('(hover: hover)').matches;
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const hasPointerLock = 'requestPointerLock' in Element.prototype;
  const hasDeviceOrientation = typeof window.DeviceOrientationEvent !== 'undefined';
  const hasDeviceMotion = typeof window.DeviceMotionEvent !== 'undefined';

  const isProbablyMobile = hasCoarsePointer && maxTouchPoints > 0 && !hasHover;

  return {
    platform: isProbablyMobile ? 'mobile' : 'desktop',
    isProbablyMobile,
    hasPointerLock,
    hasDeviceOrientation,
    hasDeviceMotion
  };
}
