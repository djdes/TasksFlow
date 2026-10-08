export const MOTION_STORAGE_KEY = "tf_motion_enabled";
export const UI_SPRING = { type: "spring", duration: 0.32, bounce: 0 } as const;

// Only an explicit opt-out disables motion. Old/malformed values keep the default.
export function parseMotionPreference(value: string | null): boolean {
  return value !== "false";
}

export function readMotionPreference(): boolean {
  try {
    return parseMotionPreference(window.localStorage.getItem(MOTION_STORAGE_KEY));
  } catch {
    return true;
  }
}
