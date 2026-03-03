import { diff_match_patch } from 'diff-match-patch';

const dmp = new diff_match_patch();

export interface TextDiff {
    patches: string; // serialized patch string
}

/**
 * Compute a diff between two text strings.
 * The diff can be used to go from `before` -> `after`.
 */
export function computeDiff(before: string, after: string): TextDiff {
    const patches = dmp.patch_make(before, after);
    return { patches: dmp.patch_toText(patches) };
}
