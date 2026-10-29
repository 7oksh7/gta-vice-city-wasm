// Streaming extractor: file -> gunzip -> tar parser -> OPFS, one chunk at a time.
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

    const w = await fh.createWritable();
    return {
        async write(chunk) { await w.write(chunk); },
        async close() { await w.close(); },
        async abort() { try { await w.abort(); } catch (e) {} },
    };
}

async function writeSmall(name, bytes) {
    const sink = await openSink(name);
    try {
        await sink.write(bytes);
        await sink.close();
    } catch (e) {
        await sink.abort();
        throw e;
    }
}

self.onmessage = async (event) => {
    const { file } = event.data;
    try {
        self.postMessage({ type: 'progress', phase: 'extracting', pct: 0, done: 0 });

        let loaded = 0;
        const counted = file.stream().pipeThrough(new TransformStream({
            transform(chunk, ctl) {
                loaded += chunk.byteLength;
                ctl.enqueue(chunk);
            },
        }));
        const rd = counted.pipeThrough(new DecompressionStream('gzip')).getReader();

        // --- tiny pull-based byte reader over the decompressed stream ---
        let cur = new Uint8Array(0);
        let pos = 0;
        let ended = false;

        async function fill() {
            if (ended) return false;
            const { done, value } = await rd.read();
            if (done) { ended = true; return false; }
            cur = value;
            pos = 0;
            return true;
        }
        async function readExact(n) {
            const out = new Uint8Array(n);
            let got = 0;
            while (got < n) {
                if (pos >= cur.length && !(await fill())) break;
                const k = Math.min(n - got, cur.length - pos);
                out.set(cur.subarray(pos, pos + k), got);
                pos += k;
                got += k;
            }
            return got === n ? out : null;
        }
        async function skip(n) {
            while (n > 0) {
                if (pos >= cur.length && !(await fill())) return;
                const k = Math.min(n, cur.length - pos);
                pos += k;
                n -= k;
            }
        }
        async function pump(n, sink) {
            while (n > 0) {
                if (pos >= cur.length && !(await fill())) {
                    throw new Error('Archive ended early (file is incomplete or corrupt)');
                }
                const k = Math.min(n, cur.length - pos);
                await sink.write(cur.subarray(pos, pos + k));
                pos += k;
                n -= k;
            }
        }

        const dec = new TextDecoder();
        let pendingLongName = null;
        let done = 0;
        let lastPost = 0;

        while (true) {
            const header = await readExact(512);
            if (!header) break;

            let allZero = true;
            for (let i = 0; i < 512; i++) {
                if (header[i] !== 0) { allZero = false; break; }
            }
            if (allZero) break;

            const readStr = (start, len) => {
                let end = start;
                while (end < start + len && header[end] !== 0) end++;
                return dec.decode(header.subarray(start, end));
            };

            const typeflag = String.fromCharCode(header[156]);
            const rawName = readStr(0, 100);
            const prefix = readStr(345, 155);
            const size = parseInt(readStr(124, 12).trim(), 8) || 0;
            const pad = Math.ceil(size / 512) * 512 - size;

            if (typeflag === 'L') {
                const data = await readExact(size);
                if (!data) throw new Error('Archive ended early');
                pendingLongName = dec.decode(data).replace(/\0/g, '');
                await skip(pad);
                continue;
            }
            if (typeflag !== '0' && typeflag !== '' && typeflag !== '\0') {
                pendingLongName = null;
                await skip(size + pad);
                continue;
            }

            let name = pendingLongName || (prefix ? prefix + '/' + rawName : rawName);
            pendingLongName = null;
            name = name.replace(/\0/g, '').replace(/\/$/, '');

            if (shouldIgnoreEntry(name)) {
                await skip(size + pad);
                continue;
            }

            const sink = await openSink(name);
            try {
                await pump(size, sink);
                await sink.close();
            } catch (e) {
                await sink.abort();
                throw e;
            }
            await skip(pad);

            done++;
            const now = Date.now();
            if (now - lastPost > 250) {
                lastPost = now;
                const pct = Math.min(99, Math.round((loaded / file.size) * 100));
                self.postMessage({ type: 'progress', phase: 'extracting', pct, done });
            }
        }

        await writeSmall('_game_ready', new TextEncoder().encode('v4'));
        self.postMessage({ type: 'progress', phase: 'extracting', pct: 100, done, total: done });
        self.postMessage({ type: 'done' });
    } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
    }
};
