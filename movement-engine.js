function clampPitch(pitch) {
  const limit = Math.PI / 2 - 0.05;
  return Math.max(-limit, Math.min(limit, pitch));
}

function normalizeVector(vector) {
  const magnitude = Math.sqrt(
    vector.x * vector.x +
    vector.y * vector.y +
    vector.z * vector.z
  );

  if (magnitude === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude
  };
}

function isWithinRadius(position, radius) {
  const distance = Math.sqrt(
    position.x * position.x +
    position.y * position.y +
    position.z * position.z
  );

  return distance < radius;
}

export function createMovementEngine({
  initialState,
  bounds,
  modes,
  initialModeId
}) {
  const state = {
    position: { ...initialState.position },
    yaw: initialState.yaw,
    pitch: initialState.pitch
  };

  const helpers = {
    clampPitch,
    normalizeVector
  };

  let activeModeId = null;
  let activeMode = null;

  function setMode(modeId) {
    const nextMode = modes[modeId];

    if (!nextMode) {
      throw new Error(`Unknown movement mode: ${modeId}`);
    }

    activeMode?.teardown?.();
    activeModeId = modeId;
    activeMode = nextMode;
    activeMode.setup?.({ state, bounds, helpers });
  }

  function update(dt = 1) {
    if (!activeMode?.update) return state;

    const nextState = activeMode.update({ state, dt, bounds, helpers }) || {};

    if (nextState.position && isWithinRadius(nextState.position, bounds.radius)) {
      state.position = nextState.position;
    }

    if (typeof nextState.yaw === 'number') {
      state.yaw = nextState.yaw;
    }

    if (typeof nextState.pitch === 'number') {
      state.pitch = clampPitch(nextState.pitch);
    }

    return state;
  }

  setMode(initialModeId);

  return {
    getModeId: () => activeModeId,
    getState: () => state,
    setMode,
    update
  };
}
