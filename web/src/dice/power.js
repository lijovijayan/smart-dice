// What to tell the person about the board's power: awake, about to sleep, or asleep.

export const SLEEP_WARNING_SECONDS = 20;

/** 45 -> "45 s", 120 -> "2 min", 185 -> "3 min 5 s". */
export function formatDuration(seconds) {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/**
 * @param {{ connected: boolean, asleep: boolean, sleepIn: number | null | undefined }} power
 * @returns {{ kind: 'awake' | 'soon' | 'asleep' | 'unknown', label: string, note: string }}
 */
export function powerStatus({ connected, asleep, sleepIn }) {
  if (asleep) {
    return {
      kind: 'asleep',
      label: 'Asleep',
      note: 'The board went to sleep after no movement. Move it to wake it, then press Connect.',
    };
  }
  if (!connected) {
    return { kind: 'unknown', label: 'Not connected', note: 'Connect the board to see its power state.' };
  }
  if (sleepIn === null || sleepIn === undefined) {
    return { kind: 'unknown', label: 'Awake', note: 'Auto sleep is off, or this board does not report it.' };
  }
  if (sleepIn === 0) {
    return { kind: 'soon', label: 'Going to sleep', note: 'No movement for a while. Move the die to wake it.' };
  }
  if (sleepIn <= SLEEP_WARNING_SECONDS) {
    return {
      kind: 'soon',
      label: `Sleeping in ${formatDuration(sleepIn)}`,
      note: 'Move the die to keep it awake.',
    };
  }
  return {
    kind: 'awake',
    label: 'Awake',
    note: `Goes to sleep after ${formatDuration(sleepIn)} without movement.`,
  };
}
