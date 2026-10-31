"use strict";

// Quality-of-life layer, loaded after game.js:
//   1. remembers the start-screen preferences
//   2. auto-backs-up saves while you play (last 5 versions per slot)
//   3. syncs the game's settings file on a timer, not only when the engine asks
//   4. keeps the cheat button and menu visible inside fullscreen
//   5. asks the browser not to evict the game's storage
(function () {
    const U = window.vcUserData;
    const { t } = window.vcI18n;

    // ─── 1. Preferences ─────────────────────────────────────────────

    const PREFS_KEY = "vc.prefs.v1";
    const DEFAULTS = { cheats: true, autobackup: true, remind: true };

    function loadPrefs() {
        try {
            return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"));
        } catch (e) {
            return Object.assign({}, DEFAULTS);
        }
    }
    const prefs = loadPrefs();

    function savePrefs() {
        try {
            localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
        } catch (e) {
            /* storage unavailable: the choice just will not persist */
        }
    }

    function bindPref(id, key) {
        const box = document.getElementById(id);
        if (!box) return;
        box.checked = Boolean(prefs[key]);
        box.addEventListener("change", () => {
            prefs[key] = box.checked;
            savePrefs();
        });
        // game.js reads the cheats switch through its own change listener.
        if (key === "cheats") box.dispatchEvent(new Event("change"));
    }

    // ─── Helpers ────────────────────────────────────────────────────

    const running = () => document.body.classList.contains("gameIsStarted") && window.Module && window.Module.FS;

    // The cheat button, cheat menu and toasts live on <body>. If the engine
    // fullscreens some other element (its canvas container), body children
    // are hidden, so move them into whatever element is fullscreen.
    const PORTAL_IDS = [
        "cheat-toggle-btn",
        "cheat-engine-ui",
        "vx-cleo",
        "airbreak-touch-controls",
        "airbreak-vertical-btns",
        "airbreak-toggle-fly",
        "vx-toast",
    ];

    function portalHost() {
        const fs = document.fullscreenElement || document.webkitFullscreenElement;
        return !fs || fs === document.documentElement || fs === document.body ? document.body : fs;
    }

    function portal() {
        const host = portalHost();
        for (const id of PORTAL_IDS) {
            const node = document.getElementById(id);
            if (node && node.parentNode !== host) host.appendChild(node);
        }
    }

    let toastNode = null;
    let toastTimer = 0;
    function toast(message, ms) {
        if (!toastNode) {
            toastNode = document.createElement("div");
            toastNode.id = "vx-toast";
            document.body.appendChild(toastNode);
        }
        toastNode.textContent = message;
        portal();
        toastNode.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastNode.classList.remove("show"), ms || 2800);
    }

    // ─── 2. Auto-backup of saves ────────────────────────────────────

    const SAVE_DIR = "/vc-assets/local/userfiles";
    const IDBFS_DB_VERSION = 21; // must match IDBFS in modules/fs.js
    const IDBFS_STORE = "FILE_DATA";
    const FILE_MODE = 0o100666;

    const BK_DB = "vc-backups";
    const BK_STORE = "backups";
    const KEEP_PER_SLOT = 5;

    function openBackupDB() {
        return U.openDB(BK_DB, 1, (db) => {
            if (!db.objectStoreNames.contains(BK_STORE)) {
                const store = db.createObjectStore(BK_STORE, { keyPath: "id", autoIncrement: true });
                store.createIndex("slot", "slot", { unique: false });
            }
        });
    }

    async function listBackups() {
        return U.withDB(openBackupDB, async (db) => {
            const all = await U.reqToPromise(db.transaction(BK_STORE, "readonly").objectStore(BK_STORE).getAll());
            return all.sort((a, b) => b.time - a.time);
        });
    }

    async function addBackup(slot, bytes, name) {
        await U.withDB(openBackupDB, async (db) => {
            const tx = db.transaction(BK_STORE, "readwrite");
            tx.objectStore(BK_STORE).add({
                slot,
                time: Date.now(),
                name: name || "",
                size: bytes.length,
                bytes: new Uint8Array(bytes),
            });
            await U.txDone(tx);
        });
        // keep only the newest few per slot
        const old = (await listBackups()).filter((b) => b.slot === slot).slice(KEEP_PER_SLOT);
        if (old.length) {
            await U.withDB(openBackupDB, async (db) => {
                const tx = db.transaction(BK_STORE, "readwrite");
                old.forEach((b) => tx.objectStore(BK_STORE).delete(b.id));
                await U.txDone(tx);
            });
        }
    }

    async function removeBackup(id) {
        await U.withDB(openBackupDB, async (db) => {
            const tx = db.transaction(BK_STORE, "readwrite");
            tx.objectStore(BK_STORE).delete(id);
            await U.txDone(tx);
        });
    }


    // Same checks as saves.js (those helpers are private to that file).
    function isValidSave(bytes) {
        if (!bytes || bytes.length < 1024) return false;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const first = view.getUint32(0, true);
        if (first === 0 || first >= bytes.length) return false;
        const end = bytes.length - 4;
        let sum = 0;
        for (let i = 0; i < end; i++) sum = (sum + bytes[i]) >>> 0;
        return sum === view.getUint32(end, true);
    }

    function saveLabel(bytes) {
        try {
            const chars = new Uint16Array(bytes.slice(4, 52).buffer);
            const end = chars.indexOf(0);
            return String.fromCharCode(...(end < 0 ? chars : chars.subarray(0, end))).trim();
        } catch (e) {
            return "";
        }
    }

    const lastSignature = new Map(); // slot -> "size:checksum"
    let lastSaveAt = Date.now();
    let scanning = false;

    // The last 4 bytes of a save are a checksum of the rest, so size + checksum
    // identifies a version cheaply.
    function signature(bytes) {
        const n = bytes.length;
        return n + ":" + new DataView(bytes.buffer, bytes.byteOffset, n).getUint32(n - 4, true);
    }

    async function scanSaves() {
        if (scanning || !running()) return;
        const FS = window.Module.FS;
        let names;
        try {
            names = FS.readdir(SAVE_DIR);
        } catch (e) {
            return; // directory not created yet
        }
        scanning = true;
        try {
            for (const name of names) {
                const m = /^GTAVCsf([1-8])\.b$/.exec(name);
                if (!m) continue;
                let bytes;
                try {
                    bytes = FS.readFile(SAVE_DIR + "/" + name);
                } catch (e) {
                    continue;
                }
                // skip files that are half-written or not a valid save
                if (!isValidSave(bytes)) continue;

                const slot = Number(m[1]);
                const sig = signature(bytes);
                const previous = lastSignature.get(slot);
                lastSignature.set(slot, sig);
                if (previous === sig) continue;
                if (previous !== undefined) lastSaveAt = Date.now(); // a real in-game save happened

                if (!prefs.autobackup) continue;
                const newest = (await listBackups()).find((b) => b.slot === slot);
                if (newest && U.equalBytes(newest.bytes, bytes)) continue;
                await addBackup(slot, bytes, saveLabel(bytes));
                toast(t("ui.backupToast", { slot }));
            }
        } catch (err) {
            console.warn("[backup]", err);
        } finally {
            scanning = false;
        }
    }

    // Backups panel on the start screen.
    function initBackupsPanel() {
        const list = document.getElementById("backup-list");
        if (!list) return;
        const { setStatus, run } = U.createPanel("backups-status");
        const { el, formatDate, download } = U;

        const openSaveDB = () =>
            U.openDB(SAVE_DIR, IDBFS_DB_VERSION, (db, tx) => {
                const store = db.objectStoreNames.contains(IDBFS_STORE)
                    ? tx.objectStore(IDBFS_STORE)
                    : db.createObjectStore(IDBFS_STORE);
                if (!store.indexNames.contains("timestamp")) {
                    store.createIndex("timestamp", "timestamp", { unique: false });
                }
            });

        async function restore(b) {
            if (!confirm(t("ui.restoreConfirm", { slot: b.slot }))) return;
            await U.withDB(openSaveDB, async (db) => {
                const tx = db.transaction(IDBFS_STORE, "readwrite");
                tx.objectStore(IDBFS_STORE).put(
                    { timestamp: new Date(), mode: FILE_MODE, contents: new Uint8Array(b.bytes) },
                    `${SAVE_DIR}/GTAVCsf${b.slot}.b`,
                );
                await U.txDone(tx);
            });
            // saves.js redraws its slot list on this event
            window.dispatchEvent(new Event("vc:languagechange"));
            setStatus(t("ui.restored", { slot: b.slot }), "ok");
        }

        const button = (label, handler, cls) =>
            el("button", { type: "button", className: ("userdata-btn " + (cls || "")).trim(), onclick: run(handler) }, label);

        function row(b) {
            return el(
                "li",
                { className: "userdata-row" },
                el("span", { className: "userdata-row-title" }, t("ui.slotShort", { slot: b.slot })),
                el(
                    "span",
                    { className: "userdata-row-info" },
                    `${b.name || t("saves.unnamed")} · ${formatDate(new Date(b.time))}`,
                ),
                el(
                    "span",
                    { className: "userdata-row-actions" },
                    button(t("ui.restore"), () => restore(b)),
                    button(t("saves.export"), async () => download(b.bytes, `GTAVCsf${b.slot}.b`)),
                    button(
                        t("saves.remove"),
                        async () => {
                            await removeBackup(b.id);
                            await refresh();
                        },
                        "userdata-btn-danger",
                    ),
                ),
            );
        }

        async function refresh() {
            const items = await listBackups();
            list.replaceChildren(
                ...(items.length ? items.map(row) : [el("li", { className: "userdata-empty" }, t("ui.backupsEmpty"))]),
            );
        }

        refresh().catch((err) => console.warn("[backup]", err));
        window.addEventListener("vc:languagechange", () => refresh().catch(() => {}));
    }


    // ─── Storage flush + storage check ──────────────────────────────

    // The engine only pushes its files to IndexedDB at certain moments (after a
    // save-point save, after a settings change). Anything else it writes stays in
    // memory and disappears with the tab. Flush regularly instead.
    //
    // Safety: never flush before the engine has finished its first load from
    // storage (syncdone === 1), or an empty in-memory folder could overwrite
    // what is stored.
    let flushing = false;
    let lastFlushAt = 0;

    function flushStorage() {
        const M = window.Module;
        if (flushing || !running() || M.syncdone !== 1) return Promise.resolve(false);
        flushing = true;
        return new Promise((resolve) => {
            try {
                M.FS.syncfs(false, (err) => {
                    flushing = false;
                    if (err) console.warn("[flush]", err);
                    else lastFlushAt = Date.now();
                    resolve(!err);
                });
            } catch (e) {
                flushing = false;
                console.warn("[flush]", e);
                resolve(false);
            }
        });
    }

    async function manualFlush() {
        const M = window.Module;
        if (!running()) return;
        if (M.syncdone !== 1) {
            toast(t("ui.flushWait"));
            return;
        }
        try {
            if (typeof M.syncRevcIni === "function") M.syncRevcIni();
        } catch (e) {
            /* ignore */
        }
        const ok = await flushStorage();
        toast(ok ? t("ui.flushOk") : t("ui.flushFail"));
    }

    // Read what is actually stored (works before the game starts).
    async function readStoredFiles() {
        if (indexedDB.databases) {
            const dbs = await indexedDB.databases();
            if (!dbs.some((d) => d.name === SAVE_DIR)) return [];
        }
        return new Promise((resolve, reject) => {
            const open = indexedDB.open(SAVE_DIR);
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const db = open.result;
                if (!db.objectStoreNames.contains(IDBFS_STORE)) {
                    db.close();
                    return resolve([]);
                }
                const out = [];
                const cur = db.transaction(IDBFS_STORE, "readonly").objectStore(IDBFS_STORE).openCursor();
                cur.onerror = () => {
                    db.close();
                    reject(cur.error);
                };
                cur.onsuccess = () => {
                    const c = cur.result;
                    if (!c) {
                        db.close();
                        return resolve(out);
                    }
                    const v = c.value;
                    if (v && v.contents) {
                        out.push({ name: String(c.key).split("/").pop(), size: v.contents.length, time: v.timestamp });
                    }
                    c.continue();
                };
            };
        });
    }

    function initStoragePanel() {
        const list = document.getElementById("storage-list");
        if (!list) return;
        const { el, formatDate, formatSize } = U;
        const { setStatus } = U.createPanel("storage-status");

        async function refresh() {
            const lines = [];
            let persisted = null;
            try {
                persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
            } catch (e) {
                /* ignore */
            }
            let est = null;
            try {
                est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
            } catch (e) {
                /* ignore */
            }
            const iniLen = (localStorage.getItem("vcsky.revc.ini") || "").length;

            lines.push([t("ui.stPersist"), persisted === null ? "?" : persisted ? t("ui.yes") : t("ui.no")]);
            if (est) lines.push([t("ui.stUsage"), `${formatSize(est.usage || 0)} / ${formatSize(est.quota || 0)}`]);
            lines.push([t("ui.stIni"), iniLen ? t("ui.yes") : t("ui.no")]);

            let files = [];
            try {
                files = await readStoredFiles();
            } catch (e) {
                setStatus(String(e && e.message ? e.message : e), "error");
            }
            const rows = lines.map(([k, v]) =>
                el("li", { className: "userdata-row" }, el("span", { className: "userdata-row-title" }, k), el("span", { className: "userdata-row-info" }, v)),
            );
            rows.push(
                el("li", { className: "userdata-row" }, el("span", { className: "userdata-row-title" }, t("ui.stFiles")), el("span", { className: "userdata-row-info" }, String(files.length))),
            );
            files
                .sort((a, b) => a.name.localeCompare(b.name))
                .forEach((f) =>
                    rows.push(
                        el(
                            "li",
                            { className: "userdata-row" },
                            el("span", { className: "userdata-row-title" }, f.name),
                            el("span", { className: "userdata-row-info" }, `${formatSize(f.size)}${f.time ? " · " + formatDate(new Date(f.time)) : ""}`),
                        ),
                    ),
                );
            list.replaceChildren(...rows);
        }

        const btn = document.getElementById("storage-refresh");
        if (btn) btn.addEventListener("click", () => refresh().catch(() => {}));
        document.getElementById("storage-panel").addEventListener("toggle", (e) => {
            if (e.target.open) refresh().catch(() => {});
        });
        window.addEventListener("vc:languagechange", () => refresh().catch(() => {}));
    }

    // ─── Boot ───────────────────────────────────────────────────────

    function init() {
        bindPref("enable-cheats", "cheats");
        bindPref("pref-autobackup", "autobackup");
        bindPref("pref-remind", "remind");
        initBackupsPanel();
        initStoragePanel();

        // 5. keep the browser from evicting game files and saves under storage pressure
        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().catch(() => {});
        }

        // 3. game settings: the engine only reports changes occasionally; copy them regularly
        setInterval(() => {
            if (!running() || typeof window.Module.syncRevcIni !== "function") return;
            try {
                window.Module.syncRevcIni();
            } catch (e) {
                /* settings file not written yet */
            }
        }, 20000);

        // regular flush of the game's files to storage, plus F8 for "save to storage now"
        setInterval(flushStorage, 15000);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") flushStorage();
        });
        window.addEventListener("pagehide", flushStorage);
        window.addEventListener("keydown", (e) => {
            if (e.key === "F8") {
                e.preventDefault();
                manualFlush();
            }
        });

        // 2. backups
        setInterval(scanSaves, 30000);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") scanSaves();
        });
        window.addEventListener("pagehide", scanSaves);

        // save reminder
        let lastRemindAt = Date.now();
        setInterval(() => {
            if (!running() || !prefs.remind) return;
            const now = Date.now();
            if (now - lastSaveAt > 20 * 60000 && now - lastRemindAt > 20 * 60000) {
                lastRemindAt = now;
                toast(t("ui.remindToast"), 4500);
            }
        }, 60000);

        // 4. cheats in fullscreen
        document.addEventListener("fullscreenchange", portal);
        document.addEventListener("webkitfullscreenchange", portal);
        setInterval(portal, 1000);
    }

    U.ready(init);
})();
