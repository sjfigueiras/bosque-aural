export function createKeyboardMouseMode({
  targetElement,
  documentRef = document,
  sensitivity,
  velocity
}) {
  const pressedKeys = new Set();
  let yawDelta = 0;
  let pitchDelta = 0;

  let handleMouseMove = null;
  let handleKeyDown = null;
  let handleKeyUp = null;
  let handlePointerLockChange = null;

  function requestPointerLock() {
    targetElement.requestPointerLock?.();
  }

  return {
    setup() {
      requestPointerLock();

      handlePointerLockChange = () => {
        if (!documentRef.pointerLockElement) {
          targetElement.addEventListener('click', requestPointerLock, { once: true });
        }
      };

      handleMouseMove = event => {
        if (documentRef.pointerLockElement !== targetElement) return;

        yawDelta -= event.movementX * sensitivity;
        pitchDelta -= event.movementY * sensitivity;
      };

      handleKeyDown = event => {
        pressedKeys.add(event.code);
        event.preventDefault();
      };

      handleKeyUp = event => {
        pressedKeys.delete(event.code);
      };

      documentRef.addEventListener('pointerlockchange', handlePointerLockChange);
      documentRef.addEventListener('mousemove', handleMouseMove);
      documentRef.addEventListener('keydown', handleKeyDown);
      documentRef.addEventListener('keyup', handleKeyUp);
    },

    teardown() {
      if (handlePointerLockChange) {
        documentRef.removeEventListener('pointerlockchange', handlePointerLockChange);
      }

      if (handleMouseMove) {
        documentRef.removeEventListener('mousemove', handleMouseMove);
      }

      if (handleKeyDown) {
        documentRef.removeEventListener('keydown', handleKeyDown);
      }

      if (handleKeyUp) {
        documentRef.removeEventListener('keyup', handleKeyUp);
      }
    },

    update({ state, helpers }) {
      const yaw = state.yaw + yawDelta;
      const pitch = helpers.clampPitch(state.pitch + pitchDelta);

      yawDelta = 0;
      pitchDelta = 0;

      const fx = Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = Math.sin(yaw);

      let dx = 0;
      let dy = 0;
      let dz = 0;

      if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) {
        dx += fx;
        dz += fz;
      }

      if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) {
        dx -= fx;
        dz -= fz;
      }

      if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) {
        dx -= rx;
        dz -= rz;
      }

      if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) {
        dx += rx;
        dz += rz;
      }

      if (pressedKeys.has('KeyQ') || pressedKeys.has('Space')) {
        dy += 1;
      }

      if (pressedKeys.has('KeyE') || pressedKeys.has('ShiftLeft')) {
        dy -= 1;
      }

      const direction = helpers.normalizeVector({ x: dx, y: dy, z: dz });

      return {
        yaw,
        pitch,
        position: {
          x: state.position.x + direction.x * velocity,
          y: state.position.y + direction.y * velocity,
          z: state.position.z + direction.z * velocity
        }
      };
    }
  };
}
