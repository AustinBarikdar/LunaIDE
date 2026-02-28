import { diff_match_patch, patch_obj } from 'diff-match-patch';

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

/**
 * Apply a diff forward — apply the patch to transform `before` into `after`.
 */
export function applyDiffForward(text: string, diff: TextDiff): string {
    const patches = dmp.patch_fromText(diff.patches);
    const [result, applied] = dmp.patch_apply(patches, text);
    const allApplied = applied.every((a: boolean) => a);
    if (!allApplied) {
        throw new Error('Failed to fully apply diff — some patches did not match');
    }
    return result;
}
