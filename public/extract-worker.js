// Memory stays small (a few MB) no matter how big the archive is.

function shouldIgnoreEntry(name) {
    const parts = name.split('/');
    const base = parts[parts.length - 1];
    return !name || base === '.DS_Store' || base.startsWith('._');
}

async function openSink(name) {
    const root = await navigator.storage.getDirectory();
    const parts = name.split('/');
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: true });
    }
    const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });

    // Prefer a sync access handle (also avoids Safari's leftover temp copies).
    if (fh.createSyncAccessHandle) {
        const h = await fh.createSyncAccessHandle();
        h.truncate(0);
        let at = 0;
        return {
            write(chunk) {
                h.write(chunk, { at });
                at += chunk.byteLength;
            },
            async close() {
                h.flush();
                h.close();
            },
            async abort() {
                try { h.close(); } catch (e) {}
            },
        };
    }
