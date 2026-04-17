function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export const RANDOM_WALK_UI_HINTS =
  'random walk activo &nbsp;|&nbsp; demo aut&oacute;noma del recorrido';

function shortestAngleDelta(from, to) {
  let delta = to - from;

  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }

  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }

  return delta;
}

function yawForVector(x, z) {
  if (x === 0 && z === 0) {
    return null;
  }

  return Math.atan2(x, -z);
}

function distanceFromCenter(position) {
  return Math.sqrt(
    position.x * position.x +
    position.y * position.y +
    position.z * position.z
  );
}

export function createRandomWalkMode({
  velocity,
  turnSpeed = 0.018,
  turnIntervalFrames = { min: 120, max: 260 },
  boundaryThreshold = 0.78,
  centerBias = 0.45
}) {
  let targetYaw = 0;
  let framesUntilTurn = 0;

  function pickNextHeading(state, bounds, forceCenterBias = false) {
    const distanceRatio = distanceFromCenter(state.position) / bounds.radius;
    const shouldBiasToCenter = forceCenterBias || distanceRatio >= boundaryThreshold;
    const jitter = shouldBiasToCenter ? 0.35 : 0.9;

    if (shouldBiasToCenter) {
      const centerYaw = yawForVector(-state.position.x, -state.position.z);
      targetYaw = centerYaw === null
        ? state.yaw + randomBetween(-0.9, 0.9)
        : centerYaw + randomBetween(-jitter, jitter);
    } else {
      targetYaw = state.yaw + randomBetween(-jitter, jitter);
    }

    framesUntilTurn = Math.round(
      randomBetween(turnIntervalFrames.min, turnIntervalFrames.max)
    );
  }

  return {
    getUiHints() {
      return RANDOM_WALK_UI_HINTS;
    },

    setup({ state, bounds }) {
      targetYaw = state.yaw;
      pickNextHeading(state, bounds, true);
    },

    teardown() {},

    update({ state, dt = 1, bounds }) {
      framesUntilTurn -= dt;

      const distanceRatio = distanceFromCenter(state.position) / bounds.radius;
      if (framesUntilTurn <= 0 || distanceRatio >= boundaryThreshold + centerBias * 0.1) {
        pickNextHeading(state, bounds);
      }

      const yawStep = turnSpeed * dt;
      const yawDelta = shortestAngleDelta(state.yaw, targetYaw);
      const yaw =
        Math.abs(yawDelta) <= yawStep
          ? targetYaw
          : state.yaw + Math.sign(yawDelta) * yawStep;

      const nextPosition = {
        x: state.position.x + Math.sin(yaw) * velocity * dt,
        y: state.position.y,
        z: state.position.z - Math.cos(yaw) * velocity * dt
      };

      if (distanceFromCenter(nextPosition) >= bounds.radius * 0.99) {
        pickNextHeading(state, bounds, true);

        return {
          yaw,
          pitch: state.pitch * 0.92,
          position: { ...state.position }
        };
      }

      if (distanceRatio >= boundaryThreshold) {
        const centerYaw = yawForVector(-state.position.x, -state.position.z);
        if (centerYaw !== null) {
          targetYaw = centerYaw + randomBetween(-centerBias, centerBias);
        }
      }

      return {
        yaw,
        pitch: state.pitch * 0.92,
        position: nextPosition
      };
    }
  };
}
