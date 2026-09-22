import { useSyncExternalStore } from "react";
import {
  getMotionPref,
  onMotionPrefChange,
  type MotionPref,
} from "../lib/motion";

/**
 * The reader's motion preference, as reactive state.
 *
 * Any component that sets up motion should read it through this hook and list
 * the result in its effect dependencies. That way a component's animations are
 * torn down and rebuilt the moment the preference changes, instead of the
 * change only taking effect on the next page load.
 */
export function useMotionPref(): MotionPref {
  return useSyncExternalStore(onMotionPrefChange, getMotionPref, () => "full");
}
