/**
 * Resolve the competitor handle list. Input takes priority; if it is empty the
 * actor falls back to a competitor-list.md file in the working directory (a
 * convenience for local runs). If that file is missing, a commented template is
 * created and the run stops with instructions — mirroring the original spec.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const TEMPLATE = `# PackHawk competitor list
# Add one YouTube competitor per line: an @handle or a full channel URL.
# Lines starting with '#' are ignored. Only the first few are scanned
# (see the "Max channels" actor input).
#
# @MrBeast
# @mkbhd
# @veritasium
`;

export async function resolveHandles(inputHandles) {
    const fromInput = (inputHandles || []).map((s) => String(s).trim()).filter(Boolean);
    if (fromInput.length) return fromInput;

    const file = path.join(process.cwd(), 'competitor-list.md');
    let text;
    try {
        text = await fs.readFile(file, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') {
            await fs.writeFile(file, TEMPLATE, 'utf8');
            throw new Error(
                `No "competitorHandles" provided and competitor-list.md was missing. ` +
                    `A template was created at ${file} — add your competitor @handles (one per line) ` +
                    `and run again, or pass "competitorHandles" in the actor input.`,
            );
        }
        throw err;
    }

    const handles = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));

    if (!handles.length) {
        throw new Error(
            `competitor-list.md exists at ${file} but contains no handles. ` +
                `Add at least one @handle (one per line) and run again.`,
        );
    }
    return handles;
}
