"use strict";

// CLEO mod menu, rebuilt from the "Install CLEO Scripts Mod For GTA Vice City
// Android" scripts. Same four scripts, same behaviour:
//
//   CAR SPAWNER   tap left/right of the screen to pick a vehicle, centre to spawn,
//                 any other part of the screen to dismiss
//   CHEATS        same controls, 57 cheats in the mod's order
//   HEALTH REGEN  +1 HP every second while 0 < HP < 200, autostart
//   ALL WEAPON    on/off
//
// Opened by the floating button or F3 (see toggleMenu in modules/cheats.js).
// Cheats are typed with window.typeCheat(code), the engine's own cheat entry.
(function () {
    // ─── Script data ────────────────────────────────────────────────

    // Vehicles that have a built-in cheat code (a port limit: the original script
    // spawns any model).
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
        ["Rhino", "PANZER"],
    ];

    // CHT_0 .. CHT_56 from gtavc.cheats.fxt, same order and wording.
    const CHEATS = [
        ["All light weapons", "THUGSTOOLS"],
        ["All medium weapons", "PROFESSIONALTOOLS"],
        ["All heavy weapons", "NUTTERTOOLS"],
        ["Full Health", "ASPIRINE"],
        ["Full Armor", "PRECIOUSPROTECTION"],
        ["Commit Suicide", "ICANTTAKEITANYMORE"],
        ["Raise Wanted Level", "YOUWONTTAKEMEALIVE"],
        ["Decrease Wanted Level", "LEAVEMEALONE"],
        ["Fast boats can fly", "AIRSHIP"],
        ["Ladies Man, Women Follow You", "FANNYMAGNET"],
        ["Makes you smoke a cigarette", "CERTAINDEATH"],
        ["Makes Tommy fatter", "DEEPFRIEDMARSBARS"],
        ["Gives Tommy girly arms/legs", "PROGRAMMER"],
        ["Change Skin/Clothes", "STILLLIKEDRESSINGUP"],
        ["Play as Ricardo Diaz", "CHEATSHAVEBEENCRACKED"],
        ["Play as Lance Vance", "LOOKLIKELANCE"],
        ["Play as Ken Rosenberg", "MYSONISALAWYER"],
        ["Play as Hilary King", "ILOOKLIKEHILARY"],
        ["Play as Jezz Torent", "ROCKANDROLLMAN"],
        ["Play as Dick", "WELOVEOURDICK"],
        ["Play as Phil Cassidy", "ONEARMEDBANDIT"],
        ["Play as Sonny Forelli", "IDONTHAVETHEMONEYSONNY"],
        ["Play as Mercedes", "FOXYLITTLETHING"],
        ["Spawn a random car", () => SPAWN[Math.floor(Math.random() * SPAWN.length)][1]],
        ["Spawn a Bloodring Banger", "TRAVELINSTYLE"],
        ["Spawn a Bloodring Banger 2", "GETTHEREQUICKLY"],
        ["Spawn a Sabre Turbo", "GETTHEREFAST"],
        ["Spawn a Hotring Racer", "GETTHEREVERYFASTINDEED"],
        ["Spawn a Hotring Racer 2", "GETTHEREAMAZINGLYFAST"],
        ["Spawn a Hearse", "THELASTRIDE"],
        ["Spawn Limo", "ROCKANDROLLCAR"],
        ["Spawn a Trashmaster", "RUBBISHCAR"],
        ["Spawn a Caddie", "BETTERTHANWALKING"],
        ["Blow up nearby cars", "BIGBANG"],
        ["Aggressive Drivers", "MIAMITRAFFIC"],
        ["All cars are pink", "AHAIRDRESSERSCAR"],
        ["All cars are black", "IWANTITPAINTEDBLACK"],
        ["Cars can fly", "COMEFLYWITHME"],
        ["Perfect Handling", "GRIPISEVERYTHING"],
        ["All traffic lights are green", "GREENLIGHT"],
        ["Cars can drive/hover over water", "SEAWAYS"],
        ["Only the wheels of a car are visible", "WHEELSAREALLINEED"],
        ["Sportscars have big wheels", "LOADSOFLITTLETHINGS"],
        ["Peds get in your car", "HOPINGIRL"],
        ["Sunny Weather", "ALOVELYDAY"],
        ["Light Clouds", "APLEASANTDAY"],
        ["Dense Clouds", "ABITDRIEG"],
        ["Foggy Weather", "CANTSEEATHING"],
        ["Stormy Weather", "CATSANDDOGS"],
        ["Speed up game clock", "LIFEISPASSINGMEBY"],
        ["Makes everything faster", "ONSPEED"],
        ["Makes everything slower", "BOOOOOORING"],
        ["Peds Riot", "FIGHTFIGHTFIGHT"],
        ["Peds Hate You", "NOBODYLIKESME"],
        ["Peds Carry Guns", "OURGODGIVENRIGHTTOBEARARMS"],
        ["Girls Carry Guns", "CHICKSWITHGUNS"],
        ["Shows Media Level", "CHASESTAT"],
    ];

    const TEXT = {
        cheatsHelp: "Touch screen left or right to select a cheat, center to use, any other screen part to dismiss",
        spawnHelp: "Touch screen left or right to select a vehicle, center to spawn, any other screen part to dismiss",
        spawned: "Vehicle spawned!",
        spawnOff: "Car spawner deactivated!",
        weaponsOn: "All weapons activated!",
        weaponsOff: "All weapons deactivated!",
    };

    // scripts.xml
    const SCRIPTS = [
        {
            key: "spawner",
            name: "CAR SPAWNER",
            desc: "features all of game vehicles, spawn what you want and where you want; has ibuilt vehicle preview; activation using CLEO menu.",
            port: "In this web port the spawner lists the vehicles that have a built-in cheat code, and has no preview.",
        },
        { key: "cheats", name: "CHEATS", desc: "features all standard cheats; activation using CLEO menu." },
        { key: "regen", name: "HEALTH REGEN", desc: "constantly regenerates few player's HP every second; autostart." },
        { key: "weapons", name: "ALL WEAPON", desc: "gives an ability to have all weapons at once; (de)activation using CLEO menu." },
    ];

    // ─── Small helpers ──────────────────────────────────────────────

    const api = () => window.vcCheatApi || null;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function readFlag(key, fallback) {
        try {
            const v = localStorage.getItem(key);
            return v === null ? fallback : v === "1";
        } catch (e) {
            return fallback;
        }
    }
    function writeFlag(key, on) {
        try {
            localStorage.setItem(key, on ? "1" : "0");
        } catch (e) {
            /* ignore */
        }
    }

    async function typeCode(code) {
        if (typeof window.typeCheat !== "function") return;
        try {
            await window.typeCheat(code);
        } catch (e) {
            console.warn("[cleo] cheat failed", e);
        }
    }

    // ─── HEALTH REGEN (gtavc.regen.csa) ─────────────────────────────
    // every 1000 ms: if the player lives and HP is not 200, HP += 1
    let regenOn = readFlag("vc.regen.v1", true);
    setInterval(() => {
        if (!regenOn || !document.body.classList.contains("gameIsStarted") || !api() || !api().getHealth) return;
        const hp = api().getHealth();
        if (Number.isFinite(hp) && hp > 0 && hp < 200) api().setHealth(hp + 1);
    }, 1000);

    // ─── ALL WEAPON (gtavc.allweapon.csa + on/off .csi) ─────────────
    let weaponsOn = false;
    async function setWeapons(on) {
        weaponsOn = on;
        say(on ? TEXT.weaponsOn : TEXT.weaponsOff);
        if (on) {
            for (const code of ["THUGSTOOLS", "PROFESSIONALTOOLS", "NUTTERTOOLS"]) {
                await typeCode(code);
                await sleep(200);
            }
        }
    }

    // ─── UI ─────────────────────────────────────────────────────────

    const css = `
    #vx-cleo{position:fixed;inset:0;z-index:100001;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);
      font:500 15px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;user-select:none;-webkit-user-select:none}
    #vx-cleo .cl-panel{width:min(560px,94vw);max-height:92vh;overflow-y:auto;background:#1b1b1f;border:1px solid #3a3a42;border-radius:6px;box-shadow:0 20px 60px rgba(0,0,0,.6)}
    #vx-cleo .cl-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#26262c;border-bottom:1px solid #3a3a42}
    #vx-cleo .cl-title{font-weight:800;letter-spacing:.14em}
    #vx-cleo .cl-x{width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:#fff;font-size:20px;cursor:pointer}
    #vx-cleo .cl-row{display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;padding:14px 18px;border:0;border-bottom:1px solid #2c2c33;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
    #vx-cleo .cl-row:active{background:#2c2c33}
    #vx-cleo .cl-name{font-weight:800;letter-spacing:.06em}
    #vx-cleo .cl-desc{margin-top:3px;font-size:13px;color:#a8a8b3}
    #vx-cleo .cl-port{margin-top:4px;font-size:12px;color:#e0a458}
    #vx-cleo .cl-badge{flex:none;min-width:48px;padding:5px 10px;border-radius:4px;text-align:center;font-size:12px;font-weight:800;letter-spacing:.08em;background:#3a3a42;color:#c9c9d2}
    #vx-cleo .cl-badge.on{background:#2e9e5b;color:#fff}

    #vx-cleo-sel{position:fixed;inset:0;z-index:100001;display:none;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer}
    #vx-cleo-sel .sl-help{position:absolute;left:2.2%;top:3.5%;max-width:min(42vw,360px);padding:10px 14px;background:rgba(0,0,0,.62);border:1px solid rgba(255,255,255,.28);
      color:#fff;font:600 clamp(12px,1.55vw,15px)/1.4 system-ui,"Segoe UI",Roboto,sans-serif}
    #vx-cleo-sel .sl-big{position:absolute;left:0;right:0;top:56%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;gap:2vw;padding:0 3vw;
      font:italic 900 clamp(26px,5.6vw,60px)/1.05 "Arial Black",Impact,system-ui,sans-serif;color:#fff;text-align:center;letter-spacing:.01em;
      text-shadow:2px 2px 0 #000,-2px 2px 0 #000,2px -2px 0 #000,-2px -2px 0 #000,0 4px 14px rgba(0,0,0,.7);pointer-events:none}
    #vx-cleo-sel .sl-name{flex:0 1 auto}
    #vx-cleo-sel .sl-arrow{display:none;flex:none;width:12vw}
    #vx-cleo-sel .sl-arrow.l{text-align:left}#vx-cleo-sel .sl-arrow.r{text-align:right}
    #vx-cleo-sel.arrows .sl-big{justify-content:space-between}
    #vx-cleo-sel.arrows .sl-arrow{display:block}
    `;

    let panel = null;
    let sel = null;
    let helpNode = null;
    let nameNode = null;
    let mode = null; // null | "list" | "cheats" | "spawner"
    let index = 0;
    let helpTimer = 0;

    function h(tag, props, ...kids) {
        const n = document.createElement(tag);
        Object.assign(n, props || {});
        for (const k of kids) n.append(k);
        return n;
    }

    // short message in the help box, then back to the instructions
    function say(text, ms) {
        if (!helpNode) return;
        helpNode.textContent = text;
        clearTimeout(helpTimer);
        helpTimer = setTimeout(() => {
            if (helpNode && (mode === "cheats" || mode === "spawner")) helpNode.textContent = mode === "cheats" ? TEXT.cheatsHelp : TEXT.spawnHelp;
        }, ms || 2200);
    }

    // ─── CLEO list ──────────────────────────────────────────────────

    function renderList() {
        const body = panel.querySelector(".cl-body");
        const rows = SCRIPTS.map((s) => {
            let badge = null;
            if (s.key === "regen") badge = h("span", { className: "cl-badge" + (regenOn ? " on" : "") }, regenOn ? "ON" : "OFF");
            if (s.key === "weapons") badge = h("span", { className: "cl-badge" + (weaponsOn ? " on" : "") }, weaponsOn ? "ON" : "OFF");
            const text = h("span", {}, h("div", { className: "cl-name" }, s.name), h("div", { className: "cl-desc" }, s.desc));
            if (s.port) text.append(h("div", { className: "cl-port" }, s.port));
            return h(
                "button",
                {
                    type: "button",
                    className: "cl-row",
                    onclick: () => {
                        if (s.key === "cheats") startSelector("cheats");
                        else if (s.key === "spawner") startSelector("spawner");
                        else if (s.key === "regen") {
                            regenOn = !regenOn;
                            writeFlag("vc.regen.v1", regenOn);
                            renderList();
                        } else if (s.key === "weapons") {
                            setWeapons(!weaponsOn);
                            renderList();
                        }
                    },
                },
                text,
                badge || "",
            );
        });
        body.replaceChildren(...rows);
    }

    // ─── Selector (CHEATS / CAR SPAWNER) ────────────────────────────

    function currentList() {
        return mode === "spawner" ? SPAWN : CHEATS;
    }

    function showCurrent() {
        nameNode.textContent = currentList()[index][0];
    }

    function startSelector(which) {
        mode = which;
        index = 0;
        panel.style.display = "none";
        sel.style.display = "block";
        sel.classList.toggle("arrows", which === "spawner");
        helpNode.textContent = which === "cheats" ? TEXT.cheatsHelp : TEXT.spawnHelp;
        showCurrent();
    }

    function step(delta) {
        const n = currentList().length;
        index = (index + delta + n) % n;
        showCurrent();
    }

    async function useCurrent() {
        const [, code] = currentList()[index];
        await typeCode(typeof code === "function" ? code() : code);
        if (mode === "spawner") say(TEXT.spawned);
    }

    // any other part of the screen: dismiss the whole script
    function dismiss() {
        if (api() && api().toggleMenu) api().toggleMenu();
        else ui.close();
    }

    // Touch zones: vertical band 25%..75% of the screen height, split in thirds.
    function onTap(e) {
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;
        if (y < 0.25 || y > 0.75) return dismiss();
        if (x < 1 / 3) return step(-1);
        if (x > 2 / 3) return step(1);
        useCurrent();
    }

    function onKey(e) {
        if (mode !== "cheats" && mode !== "spawner") return;
        if (e.key === "ArrowLeft") step(-1);
        else if (e.key === "ArrowRight") step(1);
        else if (e.key === "Enter") useCurrent();
        else if (e.key === "Escape") dismiss();
        else return;
        e.preventDefault();
        e.stopPropagation();
    }

    // ─── Build and public API ───────────────────────────────────────

    function build() {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);

        panel = h(
            "div",
            { id: "vx-cleo", role: "dialog" },
            h(
                "div",
                { className: "cl-panel" },
                h("div", { className: "cl-head" }, h("span", { className: "cl-title" }, "CLEO"), h("button", { type: "button", className: "cl-x", onclick: () => dismiss() }, "\u2715")),
                h("div", { className: "cl-body" }),
            ),
        );
        helpNode = h("div", { className: "sl-help" });
        nameNode = h("span", { className: "sl-name" });
        sel = h(
            "div",
            { id: "vx-cleo-sel" },
            helpNode,
            h("div", { className: "sl-big" }, h("span", { className: "sl-arrow l" }, "<"), nameNode, h("span", { className: "sl-arrow r" }, ">")),
        );
        sel.addEventListener("pointerup", onTap);
        ["touchstart", "touchmove", "touchend", "mousedown", "wheel", "contextmenu"].forEach((ev) => sel.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
        panel.addEventListener("pointerup", (e) => e.stopPropagation());
        document.body.append(panel, sel);
        window.addEventListener("keydown", onKey, true);
    }

    const ui = {
        // returns the new open state; modules/cheats.js uses it for its button and cursor
        toggle() {
            return mode ? ui.close() : ui.open();
        },
        open() {
            if (!panel) build();
            mode = "list";
            sel.style.display = "none";
            panel.style.display = "flex";
            renderList();
            return true;
        },
        close() {
            mode = null;
            if (panel) panel.style.display = "none";
            if (sel) sel.style.display = "none";
            const btn = document.getElementById("cheat-toggle-btn");
            if (btn) btn.classList.remove("active");
            return false;
        },
        isOpen: () => Boolean(mode),
    };
    window.vcCleo = ui;
})();
