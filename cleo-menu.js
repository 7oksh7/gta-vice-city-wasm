"use strict";

// CLEO-style mod menu. It replaces the old cheat panel's look and feel but
// drives the same engine hooks that panel already had:
//   - window.typeCheat(code)      types a built-in game cheat code
//   - hidden #ce-* controls       God Mode, AirBreak, money
//   - window.vcCheatApi           read/write the player position
// Opened by the floating button or F3 (see toggleMenu in modules/cheats.js).
(function () {
    const POS_KEY = "vc.tp.v1";
    const LAST_KEY = "vc.lastpos.v1";

    // ─── Menu content ───────────────────────────────────────────────

    const section = (label) => ({ kind: "section", label });
    const cheat = (label, code, hint) => ({ kind: "run", label, hint, run: () => typeCode(code, label) });
    const toggle = (label, hint, boxId) => ({ kind: "toggle", label, hint, boxId });
    const action = (label, hint, run) => ({ kind: "run", label, hint, run });

    const note = (text) => ({ kind: "note", text });
    const sw = (label, hint, get, set) => ({ kind: "switch", label, hint, get, set });

    // Vehicles that have a built-in cheat code.
    const SPAWN = [
        ["Bloodring Banger", "TRAVELINSTYLE"],
        ["Bloodring Banger 2", "GETTHEREQUICKLY"],
        ["Sabre Turbo", "GETTHEREFAST"],
        ["Hotring Racer", "GETTHEREVERYFASTINDEED"],
        ["Hotring Racer 2", "GETTHEREAMAZINGLYFAST"],
        ["Hearse", "THELASTRIDE"],
        ["Limo", "ROCKANDROLLCAR"],
        ["Trashmaster", "RUBBISHCAR"],
        ["Caddie", "BETTERTHANWALKING"],
        ["Rhino tank", "PANZER"],
    ];

    // Health regen (the "HEALTH REGEN" script of the CLEO mod; it autostarts).
    let regenOn = readPref("vc.regen.v1", true);

    // "CHEATS" script of the CLEO mod: same entries, same order, same wording
    // (CHT_0 to CHT_56). Section headings are only for easier scrolling.
    const CHEATS = [
        section("Weapons and player"),
        cheat("All light weapons", "THUGSTOOLS"),
        cheat("All medium weapons", "PROFESSIONALTOOLS"),
        cheat("All heavy weapons", "NUTTERTOOLS"),
        cheat("Full Health", "ASPIRINE", "Also repairs the car you are in"),
        cheat("Full Armor", "PRECIOUSPROTECTION"),
        cheat("Commit Suicide", "ICANTTAKEITANYMORE", "You only survive with high health and armor"),
        cheat("Raise Wanted Level", "YOUWONTTAKEMEALIVE"),
        cheat("Decrease Wanted Level", "LEAVEMEALONE"),
        section("Fun"),
        cheat("Fast boats can fly", "AIRSHIP"),
        cheat("Ladies Man, Women Follow You", "FANNYMAGNET"),
        cheat("Makes you smoke a cigarette", "CERTAINDEATH"),
        cheat("Makes Tommy fatter", "DEEPFRIEDMARSBARS"),
        cheat("Gives Tommy girly arms/legs", "PROGRAMMER"),
        section("Skins (get out of any vehicle first)"),
        cheat("Change Skin/Clothes", "STILLLIKEDRESSINGUP"),
        cheat("Play as Ricardo Diaz", "CHEATSHAVEBEENCRACKED"),
        cheat("Play as Lance Vance", "LOOKLIKELANCE"),
        cheat("Play as Ken Rosenberg", "MYSONISALAWYER"),
        cheat("Play as Hilary King", "ILOOKLIKEHILARY"),
        cheat("Play as Jezz Torent", "ROCKANDROLLMAN"),
        cheat("Play as Dick", "WELOVEOURDICK"),
        cheat("Play as Phil Cassidy", "ONEARMEDBANDIT"),
        cheat("Play as Sonny Forelli", "IDONTHAVETHEMONEYSONNY"),
        cheat("Play as Mercedes", "FOXYLITTLETHING"),
        section("Vehicles (stand in an open area near a road)"),
        action("Spawn a random car", "Picks one of the cars below", () => {
            const [name, code] = SPAWN[Math.floor(Math.random() * SPAWN.length)];
            typeCode(code, "random car: " + name);
        }),
        cheat("Spawn a Bloodring Banger", "TRAVELINSTYLE"),
        cheat("Spawn a Bloodring Banger 2", "GETTHEREQUICKLY"),
        cheat("Spawn a Sabre Turbo", "GETTHEREFAST"),
        cheat("Spawn a Hotring Racer", "GETTHEREVERYFASTINDEED"),
        cheat("Spawn a Hotring Racer 2", "GETTHEREAMAZINGLYFAST"),
        cheat("Spawn a Hearse", "THELASTRIDE"),
        cheat("Spawn Limo", "ROCKANDROLLCAR"),
        cheat("Spawn a Trashmaster", "RUBBISHCAR"),
        cheat("Spawn a Caddie", "BETTERTHANWALKING"),
        section("Traffic and cars"),
        cheat("Blow up nearby cars", "BIGBANG", "Destroys every loaded vehicle, including yours"),
        cheat("Aggressive Drivers", "MIAMITRAFFIC"),
        cheat("All cars are pink", "AHAIRDRESSERSCAR"),
        cheat("All cars are black", "IWANTITPAINTEDBLACK"),
        cheat("Cars can fly", "COMEFLYWITHME"),
        cheat("Perfect Handling", "GRIPISEVERYTHING"),
        cheat("All traffic lights are green", "GREENLIGHT"),
        cheat("Cars can drive/hover over water", "SEAWAYS"),
        cheat("Only the wheels of a car are visible", "WHEELSAREALLINEED"),
        cheat("Sportscars have big wheels", "LOADSOFLITTLETHINGS"),
        cheat("Peds get in your car", "HOPINGIRL"),
        section("Weather"),
        cheat("Sunny Weather", "ALOVELYDAY"),
        cheat("Light Clouds", "APLEASANTDAY"),
        cheat("Dense Clouds", "ABITDRIEG"),
        cheat("Foggy Weather", "CANTSEEATHING"),
        cheat("Stormy Weather", "CATSANDDOGS"),
        section("Game speed"),
        cheat("Speed up game clock", "LIFEISPASSINGMEBY"),
        cheat("Makes everything faster", "ONSPEED"),
        cheat("Makes everything slower", "BOOOOOORING"),
        section("Pedestrians and media"),
        cheat("Peds Riot", "FIGHTFIGHTFIGHT", "Cannot be undone this session. Do not save afterwards"),
        cheat("Peds Hate You", "NOBODYLIKESME", "Cannot be undone this session. Do not save afterwards"),
        cheat("Peds Carry Guns", "OURGODGIVENRIGHTTOBEARARMS"),
        cheat("Girls Carry Guns", "CHICKSWITHGUNS"),
        cheat("Shows Media Level", "CHASESTAT"),
    ];

    const TABS = [
        { id: "cheats", name: "Cheats", items: CHEATS },
        {
            id: "spawner",
            name: "Car spawner",
            items: [
                note("The original spawner lists every vehicle in the game. This port can only spawn the vehicles that have a built-in cheat code, so those are listed here."),
                ...SPAWN.map(([name, code]) => cheat(name, code)),
            ],
        },
        {
            id: "scripts",
            name: "Scripts",
            items: [
                sw("Health regen", "Slowly refills your health while you play (autostart)", () => regenOn, (v) => {
                    regenOn = v;
                    writePref("vc.regen.v1", v);
                    say("Health regen " + (v ? "ON" : "OFF"));
                }),
                action("All weapons", "Gives all three weapon sets at once", () =>
                    runMany(["THUGSTOOLS", "PROFESSIONALTOOLS", "NUTTERTOOLS"], "All weapons activated!")),
            ],
        },
        {
            id: "extras",
            name: "Extras",
            items: [
                toggle("God Mode", "Infinite health", "ce-toggle-godmode"),
                toggle("AirBreak", "Turn on, then press Right Shift (or the fly button) to float and move freely", "ce-toggle-airbreak"),
                action("Add $9,999,999", "Adds to your current money", () => clickHidden("ce-add-money", "+$9,999,999")),
            ],
        },
        { id: "teleport", name: "Teleport", custom: () => renderTeleport() },
        { id: "code", name: "Code", custom: () => renderCode() },
    ];

    // ─── Engine helpers ─────────────────────────────────────────────

    let statusNode = null;
    function say(text) {
        if (statusNode) statusNode.textContent = text;
    }

    async function typeCode(code, label) {
        if (typeof window.typeCheat !== "function") return say("Cheat engine not ready yet");
        say("Running: " + label + " \u2026");
        try {
            await window.typeCheat(code);
            say("\u2713 " + label);
        } catch (e) {
            say("Could not run: " + label);
        }
    }

    async function runMany(codes, label) {
        for (const code of codes) {
            await typeCode(code, code);
            await new Promise((r) => setTimeout(r, 200));
        }
        say("\u2713 " + label);
    }

    function clickHidden(id, label) {
        const node = document.getElementById(id);
        if (!node) return say("Not available yet");
        node.click();
        say("\u2713 " + label);
    }

    function setBox(id, on) {
        const box = document.getElementById(id);
        if (!box) return false;
        if (box.checked !== on) {
            box.checked = on;
            box.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return true;
    }

    const api = () => window.vcCheatApi || null;

    function readPref(key, fallback) {
        try {
            const v = localStorage.getItem(key);
            return v === null ? fallback : v === "1";
        } catch (e) {
            return fallback;
        }
    }
    function writePref(key, on) {
        try {
            localStorage.setItem(key, on ? "1" : "0");
        } catch (e) {
            /* ignore */
        }
    }

    function readJSON(key, fallback) {
        try {
            const v = JSON.parse(localStorage.getItem(key));
            return v == null ? fallback : v;
        } catch (e) {
            return fallback;
        }
    }
    function writeJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            /* ignore */
        }
    }

    const sane = (p) =>
        Array.isArray(p) &&
        p.length === 3 &&
        p.every((n) => Number.isFinite(n) && Math.abs(n) < 6000) &&
        p[2] > -50 &&
        p[2] < 600 &&
        !(Math.abs(p[0]) < 0.5 && Math.abs(p[1]) < 0.5);

    // Health regen: a few HP every second, up to full health.
    setInterval(() => {
        if (!regenOn || !document.body.classList.contains("gameIsStarted") || !api() || !api().getHealth) return;
        const hp = api().getHealth();
        if (Number.isFinite(hp) && hp > 0 && hp < 100) api().setHealth(Math.min(100, hp + 3));
    }, 1000);

    // Remember where the player stands (on foot) so it can be returned to later.
    setInterval(() => {
        if (!document.body.classList.contains("gameIsStarted") || !api()) return;
        const p = api().getPos();
        if (sane(p)) writeJSON(LAST_KEY, p);
    }, 5000);

    // ─── UI ─────────────────────────────────────────────────────────

    const css = `
    #vx-cleo{position:fixed;top:0;right:0;height:100%;width:min(440px,100vw);box-sizing:border-box;z-index:100001;display:none;flex-direction:column;
      background:rgba(9,6,20,.95);border-left:1px solid rgba(255,61,139,.5);color:#f6f1ff;font:500 15px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
      padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);box-shadow:-20px 0 60px rgba(0,0,0,.55);user-select:none;-webkit-user-select:none}
    #vx-cleo *{box-sizing:border-box}
    #vx-cleo .vc-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px}
    #vx-cleo .vc-title{font-weight:900;letter-spacing:.18em;font-size:13px;text-transform:uppercase;color:#b4abd0}
    #vx-cleo .vc-title b{background:linear-gradient(135deg,#ff3d8b,#ffb347);-webkit-background-clip:text;background-clip:text;color:transparent;font-size:17px;letter-spacing:.12em;margin-right:6px}
    #vx-cleo .vc-x{width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#fff;font-size:18px;cursor:pointer}
    #vx-cleo .vc-tabs{display:flex;gap:8px;padding:6px 16px 12px;overflow-x:auto;scrollbar-width:none;flex:none;touch-action:pan-x}
    #vx-cleo .vc-tabs::-webkit-scrollbar{display:none}
    #vx-cleo .vc-tab{flex:none;min-height:38px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#b4abd0;font:700 13px system-ui,sans-serif;cursor:pointer}
    #vx-cleo .vc-tab.on{color:#200612;border-color:transparent;background:linear-gradient(135deg,#ff3d8b,#ffb347)}
    #vx-cleo .vc-list{flex:1;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:0 12px 12px}
    #vx-cleo .vc-sec{margin:14px 6px 6px;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#3de6ff}
    #vx-cleo .vc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:56px;padding:10px 14px;margin:0 0 6px;border-radius:14px;
      border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:inherit;text-align:left;font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
    #vx-cleo .vc-row:active{background:rgba(255,61,139,.16);border-color:rgba(255,61,139,.5)}
    #vx-cleo .vc-txt{display:flex;flex-direction:column;min-width:0}
    #vx-cleo .vc-lab{font-weight:700}
    #vx-cleo .vc-hint{font-size:12px;color:#8d85a8}
    #vx-cleo .vc-go{flex:none;padding:6px 12px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.1em;color:#3de6ff;border:1px solid rgba(61,230,255,.35)}
    #vx-cleo .vc-sw{position:relative;flex:none;width:48px;height:28px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);transition:background .2s}
    #vx-cleo .vc-sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s}
    #vx-cleo .vc-sw.on{background:linear-gradient(135deg,#ff3d8b,#ffb347);border-color:transparent}
    #vx-cleo .vc-sw.on::after{transform:translateX(20px)}
    #vx-cleo .vc-slot{display:flex;align-items:center;gap:8px;padding:10px 14px;margin:0 0 6px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04)}
    #vx-cleo .vc-slot .vc-txt{flex:1}
    #vx-cleo .vc-btn{min-height:40px;padding:0 14px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#fff;font:700 13px system-ui,sans-serif;cursor:pointer}
    #vx-cleo .vc-btn:disabled{opacity:.4}
    #vx-cleo .vc-input{flex:1;min-width:0;min-height:40px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.35);color:#fff;font:700 15px system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;user-select:text;-webkit-user-select:text}
    #vx-cleo .vc-input:focus{outline:none;border-color:#3de6ff}
    #vx-cleo .vc-note{margin:4px 6px 10px;font-size:12px;line-height:1.5;color:#8d85a8}
    #vx-cleo .vc-foot{flex:none;min-height:44px;padding:10px 16px;border-top:1px solid rgba(255,255,255,.08);font-size:13px;color:#b4abd0}
    `;

    let root = null;
    let listNode = null;
    let activeTab = "cheats";
    let open = false;
    let lastGameStatus = "";

    function h(tag, props, ...kids) {
        const n = document.createElement(tag);
        Object.assign(n, props || {});
        for (const k of kids) n.append(k);
        return n;
    }

    function renderItems(items) {
        const nodes = [];
        for (const it of items) {
            if (it.kind === "section") {
                nodes.push(h("div", { className: "vc-sec" }, it.label));
            } else if (it.kind === "note") {
                nodes.push(h("div", { className: "vc-note" }, it.text));
            } else if (it.kind === "switch") {
                const knob = h("span", { className: "vc-sw" });
                knob.classList.toggle("on", Boolean(it.get()));
                nodes.push(
                    h(
                        "button",
                        {
                            type: "button",
                            className: "vc-row",
                            onclick: () => {
                                it.set(!it.get());
                                knob.classList.toggle("on", Boolean(it.get()));
                            },
                        },
                        h("span", { className: "vc-txt" }, h("span", { className: "vc-lab" }, it.label), h("span", { className: "vc-hint" }, it.hint || "")),
                        knob,
                    ),
                );
            } else if (it.kind === "toggle") {
                const sw = h("span", { className: "vc-sw" });
                const box = document.getElementById(it.boxId);
                if (box && box.checked) sw.classList.add("on");
                const row = h(
                    "button",
                    {
                        type: "button",
                        className: "vc-row",
                        onclick: () => {
                            const cur = document.getElementById(it.boxId);
                            if (!cur) return say("Not available yet");
                            setBox(it.boxId, !cur.checked);
                            sw.classList.toggle("on", cur.checked);
                            say(it.label + (cur.checked ? " ON" : " OFF"));
                        },
                    },
                    h("span", { className: "vc-txt" }, h("span", { className: "vc-lab" }, it.label), h("span", { className: "vc-hint" }, it.hint || "")),
                    sw,
                );
                nodes.push(row);
            } else {
                nodes.push(
                    h(
                        "button",
                        { type: "button", className: "vc-row", onclick: it.run },
                        h("span", { className: "vc-txt" }, h("span", { className: "vc-lab" }, it.label), h("span", { className: "vc-hint" }, it.hint || "")),
                        h("span", { className: "vc-go" }, "RUN"),
                    ),
                );
            }
        }
        return nodes;
    }

    function renderTeleport() {
        const slots = readJSON(POS_KEY, [null, null, null]);
        const nodes = [h("div", { className: "vc-note" }, "Works on foot. Save a spot, then jump back to it any time, even after restarting the game.")];

        const fmt = (p) => (p ? `${p[0].toFixed(0)}, ${p[1].toFixed(0)}, ${p[2].toFixed(0)}` : "empty");

        const last = readJSON(LAST_KEY, null);
        nodes.push(
            h(
                "div",
                { className: "vc-slot" },
                h("span", { className: "vc-txt" }, h("span", { className: "vc-lab" }, "Last position"), h("span", { className: "vc-hint" }, last ? fmt(last) : "remembered every few seconds while you play")),
                h("button", { type: "button", className: "vc-btn", disabled: !last, onclick: () => go(last, "last position") }, "Go"),
            ),
        );

        for (let i = 0; i < 3; i++) {
            nodes.push(
                h(
                    "div",
                    { className: "vc-slot" },
                    h("span", { className: "vc-txt" }, h("span", { className: "vc-lab" }, "Spot " + (i + 1)), h("span", { className: "vc-hint" }, fmt(slots[i]))),
                    h(
                        "button",
                        {
                            type: "button",
                            className: "vc-btn",
                            onclick: () => {
                                const p = api() && api().getPos();
                                if (!sane(p)) return say("Position not available yet. Start playing first.");
                                slots[i] = p;
                                writeJSON(POS_KEY, slots);
                                say("\u2713 Saved spot " + (i + 1));
                                render();
                            },
                        },
                        "Save",
                    ),
                    h("button", { type: "button", className: "vc-btn", disabled: !slots[i], onclick: () => go(slots[i], "spot " + (i + 1)) }, "Go"),
                ),
            );
        }
        return nodes;
    }

    const CODES_KEY = "vc.codes.v1";

    function renderCode() {
        const recent = readJSON(CODES_KEY, []);
        const input = h("input", { type: "text", className: "vc-input", placeholder: "Type a cheat code", autocomplete: "off", spellcheck: false });
        input.setAttribute("autocapitalize", "characters");
        const run = (code) => {
            const v = String(code).replace(/[^a-z]/gi, "").toUpperCase();
            if (!v) return say("Type a code first");
            const list = [v].concat(recent.filter((c) => c !== v)).slice(0, 8);
            writeJSON(CODES_KEY, list);
            typeCode(v, v);
            render();
        };
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") run(input.value);
        });
        const nodes = [
            h("div", { className: "vc-note" }, "Run any cheat code. Letters only, no Enter needed. Use it for codes that are not in the other tabs."),
            h("div", { className: "vc-slot" }, input, h("button", { type: "button", className: "vc-btn", onclick: () => run(input.value) }, "Run")),
        ];
        if (recent.length) {
            nodes.push(h("div", { className: "vc-sec" }, "Recent"));
            recent.forEach((c) => nodes.push(h("button", { type: "button", className: "vc-row", onclick: () => run(c) }, h("span", { className: "vc-txt" }, h("span", { className: "vc-lab" }, c)), h("span", { className: "vc-go" }, "RUN"))));
        }
        return nodes;
    }

    function go(p, label) {
        if (!api() || !sane(p)) return say("Cannot teleport right now");
        say(api().setPos(p) ? "\u2713 Teleported to " + label : "Could not teleport");
    }

    function render() {
        if (!root) return;
        const tab = TABS.find((x) => x.id === activeTab) || TABS[0];
        root.querySelectorAll(".vc-tab").forEach((b) => b.classList.toggle("on", b.dataset.id === tab.id));
        listNode.replaceChildren(...(tab.custom ? tab.custom() : renderItems(tab.items)));
    }

    function build() {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);

        statusNode = h("span", {}, "Ready");
        listNode = h("div", { className: "vc-list" });
        const tabs = h("div", { className: "vc-tabs" });
        for (const tab of TABS) {
            const b = h("button", { type: "button", className: "vc-tab", onclick: () => { activeTab = tab.id; render(); listNode.scrollTop = 0; } }, tab.name);
            b.dataset.id = tab.id;
            tabs.append(b);
        }
        root = h(
            "div",
            { id: "vx-cleo", role: "dialog" },
            h("div", { className: "vc-head" }, h("div", { className: "vc-title" }, h("b", {}, "CLEO"), "Mod menu"), h("button", { type: "button", className: "vc-x", onclick: () => (window.vcCheatApi && window.vcCheatApi.toggleMenu ? window.vcCheatApi.toggleMenu() : api2.close()) }, "\u2715")),
            tabs,
            listNode,
            h("div", { className: "vc-foot" }, statusNode),
        );
        ["touchstart", "touchmove", "touchend", "mousedown", "wheel"].forEach((ev) => root.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
        document.body.appendChild(root);

        // mirror the engine's own status text (for example "GodMode ON")
        setInterval(() => {
            const s = document.getElementById("ce-airbreak-status");
            if (!open || !s || s.textContent === lastGameStatus) return;
            lastGameStatus = s.textContent;
            say(s.textContent);
        }, 600);
    }

    // returns the new open state; modules/cheats.js uses it for its button and cursor
    const api2 = {
        toggle() {
            return open ? api2.close() : api2.open();
        },
        open() {
            if (!root) build();
            open = true;
            root.style.display = "flex";
            render();
            return true;
        },
        close() {
            open = false;
            if (root) root.style.display = "none";
            const btn = document.getElementById("cheat-toggle-btn");
            if (btn) btn.classList.remove("active");
            return false;
        },
        isOpen: () => open,
    };
    window.vcCleo = api2;
})();
