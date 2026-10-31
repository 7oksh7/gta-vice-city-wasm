"use strict";

// Numbered text menu in the style of the PC "Cheats Menu All in One" CLEO mod:
// a dark box in the top-left corner, a heading with a star, entries 1-0 picked by
// number key (or by tapping the line), and a help text along the bottom.
//   S = exit    X = back to the main menu
//
// Every entry runs something this engine can really do:
//   window.typeCheat(code)  the game's own cheat codes
//   window.vcCheatApi       health and position (memory), plus the old God Mode,
//                           AirBreak and money controls (hidden #ce-* elements)
// Opened by the floating button or F3 (see toggleMenu in modules/cheats.js).
(function () {
    const POS_KEY = "vc.tp.v1";
    const LAST_KEY = "vc.lastpos.v1";
    const REGEN_KEY = "vc.regen.v1";

    // ─── Engine helpers ─────────────────────────────────────────────

    const api = () => window.vcCheatApi || null;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    async function code(c) {
        if (typeof window.typeCheat !== "function") return say("Cheat engine is not ready yet");
        try {
            const ok = await window.typeCheat(c);
            say(ok === false ? "Cheat not entered. Reload the page and try again" : "Typed " + c);
        } catch (e) {
            say("Could not run that one");
        }
    }
    async function codes(list) {
        for (const c of list) {
            await code(c);
            await sleep(200);
        }
    }
    function hidden(id) {
        const n = document.getElementById(id);
        if (n) n.click();
        else say("Not available yet");
    }
    function box(id) {
        const n = document.getElementById(id);
        return n ? n.checked : false;
    }
    function setBox(id, on) {
        const n = document.getElementById(id);
        if (!n) return say("Not available yet");
        if (n.checked !== on) {
            n.checked = on;
            n.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }

    function flag(key, fallback) {
        try {
            const v = localStorage.getItem(key);
            return v === null ? fallback : v === "1";
        } catch (e) {
            return fallback;
        }
    }
    function setFlag(key, on) {
        try {
            localStorage.setItem(key, on ? "1" : "0");
        } catch (e) {
            /* ignore */
        }
    }
    function json(key, fallback) {
        try {
            const v = JSON.parse(localStorage.getItem(key));
            return v == null ? fallback : v;
        } catch (e) {
            return fallback;
        }
    }
    function setJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            /* ignore */
        }
    }

    const sane = (p) =>
        Array.isArray(p) && p.length === 3 && p.every((n) => Number.isFinite(n) && Math.abs(n) < 6000) && p[2] > -50 && p[2] < 600 && !(Math.abs(p[0]) < 0.5 && Math.abs(p[1]) < 0.5);

    // remember where the player stands (on foot)
    setInterval(() => {
        if (!document.body.classList.contains("gameIsStarted") || !api() || !api().getPos) return;
        const p = api().getPos();
        if (sane(p)) setJson(LAST_KEY, p);
    }, 5000);

    // health regen: +1 HP every second while 0 < HP < 200 (off by default)
    let regenOn = flag(REGEN_KEY, false);
    setInterval(() => {
        if (!regenOn || !document.body.classList.contains("gameIsStarted") || !api() || !api().getHealth) return;
        const hp = api().getHealth();
        if (Number.isFinite(hp) && hp > 0 && hp < 200) api().setHealth(hp + 1);
    }, 1000);

    // ─── Menu content ───────────────────────────────────────────────
    // An entry: [label, action] or [label, action, () => isOn]. Pages with more than
    // 10 entries get 9 per page plus "0-NextPage".

    const run = (c) => () => code(c);

    function teleportEntries() {
        const slots = json(POS_KEY, [null, null, null]);
        const out = [];
        for (let i = 0; i < 3; i++) {
            out.push([
                "SaveSpot" + (i + 1) + (slots[i] ? " (saved)" : ""),
                () => {
                    const p = api() && api().getPos && api().getPos();
                    if (!sane(p)) return say("Position not available yet. Start playing first");
                    const s = json(POS_KEY, [null, null, null]);
                    s[i] = p;
                    setJson(POS_KEY, s);
                    say("Spot " + (i + 1) + " saved");
                    render();
                },
            ]);
            out.push([
                "GoToSpot" + (i + 1),
                () => {
                    const s = json(POS_KEY, [null, null, null])[i];
                    if (!sane(s)) return say("Spot " + (i + 1) + " is empty");
                    say(api() && api().setPos(s) ? "Teleported to spot " + (i + 1) : "Cannot teleport right now");
                },
            ]);
        }
        out.push([
            "GoToLastPosition",
            () => {
                const s = json(LAST_KEY, null);
                if (!sane(s)) return say("No last position yet");
                say(api() && api().setPos(s) ? "Teleported to your last position" : "Cannot teleport right now");
            },
        ]);
        out.push(["AirBreak", () => setBox("ce-toggle-airbreak", !box("ce-toggle-airbreak")), () => box("ce-toggle-airbreak")]);
        return out;
    }

    const PAGES = {
        locations: {
            title: "LOCATIONS",
            help: "Numbers 1 to 0 to select. Save the spot where you stand and come back to it any time. Works on foot. AirBreak: then press Right Shift to float. Exit (S) Menu (X)",
            entries: teleportEntries,
        },
        missions: {
            title: "MISSIONS",
            help: "Missions can not be started from outside the game in this web port, so there is nothing to select here. Exit (S) Menu (X)",
            entries: () => [],
        },
        upgrades: {
            title: "UPGRADES",
            help: "Numbers 1 to 0 to select. Health regen adds 1 HP every second. Exit (S) Menu (X)",
            entries: () => [
                ["FullHealth", run("ASPIRINE")],
                ["FullArmor", run("PRECIOUSPROTECTION")],
                ["AddMoney", () => hidden("ce-add-money")],
                ["GodMode", () => setBox("ce-toggle-godmode", !box("ce-toggle-godmode")), () => box("ce-toggle-godmode")],
                [
                    "HealthRegen",
                    () => {
                        regenOn = !regenOn;
                        setFlag(REGEN_KEY, regenOn);
                        render();
                    },
                    () => regenOn,
                ],
            ],
        },
        vehicles: {
            title: "VEHICLES",
            help: "Numbers 1 to 0 to select your vehicle. It appears next to you, so look for an open space. Only vehicles with a built-in cheat code are possible. Exit (S) Menu (X)",
            entries: () => [
                ["BloodringBanger", run("TRAVELINSTYLE")],
                ["BloodringBanger2", run("GETTHEREQUICKLY")],
                ["SabreTurbo", run("GETTHEREFAST")],
                ["HotringRacer", run("GETTHEREVERYFASTINDEED")],
                ["HotringRacer2", run("GETTHEREAMAZINGLYFAST")],
                ["Hearse", run("THELASTRIDE")],
                ["Limo", run("ROCKANDROLLCAR")],
                ["Trashmaster", run("RUBBISHCAR")],
                ["Caddie", run("BETTERTHANWALKING")],
                ["Rhino", run("PANZER")],
                ["FlyingCars", run("COMEFLYWITHME")],
                ["FlyingBoats", run("AIRSHIP")],
                ["DriveOnWater", run("SEAWAYS")],
                ["PerfectHandling", run("GRIPISEVERYTHING")],
                ["OnlyWheels", run("WHEELSAREALLINEED")],
                ["BigWheels", run("LOADSOFLITTLETHINGS")],
                ["AllCarsBlack", run("IWANTITPAINTEDBLACK")],
                ["AllCarsPink", run("AHAIRDRESSERSCAR")],
                ["GreenLights", run("GREENLIGHT")],
                ["AggressiveDrivers", run("MIAMITRAFFIC")],
                ["PedsGetInYourCar", run("HOPINGIRL")],
                ["BlowUpCars", run("BIGBANG")],
            ],
        },
        clothes: {
            title: "CLOTHING",
            help: "The game can only give Tommy a random outfit. Tap again for another one. Picking a specific outfit is not possible in this web port. Exit (S) Menu (X)",
            entries: () => [["RandomOutfit", run("STILLLIKEDRESSINGUP")]],
        },
        characters: {
            title: "CHARACTERS",
            help: "Numbers 1 to 0 to select a character. Get out of any vehicle first. Exit (S) Menu (X)",
            entries: () => [
                ["RicardoDiaz", run("CHEATSHAVEBEENCRACKED")],
                ["LanceVance", run("LOOKLIKELANCE")],
                ["KenRosenberg", run("MYSONISALAWYER")],
                ["HilaryKing", run("ILOOKLIKEHILARY")],
                ["JezzTorent", run("ROCKANDROLLMAN")],
                ["Dick", run("WELOVEOURDICK")],
                ["PhilCassidy", run("ONEARMEDBANDIT")],
                ["SonnyForelli", run("IDONTHAVETHEMONEYSONNY")],
                ["Mercedes", run("FOXYLITTLETHING")],
                ["CandySuxx", run("IWANTBIGTITS")],
                ["FatTommy", run("DEEPFRIEDMARSBARS")],
                ["ThinTommy", run("PROGRAMMER")],
                ["Cigarette", run("CERTAINDEATH")],
            ],
        },
        weapons: {
            title: "WEAPONS",
            help: "Numbers 1 to 0 to select your weapons. Exit (S) Menu (X)",
            entries: () => [
                ["LightWeapons", run("THUGSTOOLS")],
                ["MediumWeapons", run("PROFESSIONALTOOLS")],
                ["HeavyWeapons", run("NUTTERTOOLS")],
                ["AllWeapons", () => codes(["THUGSTOOLS", "PROFESSIONALTOOLS", "NUTTERTOOLS"])],
            ],
        },
        time: {
            title: "TIMEMACHINE",
            help: "Numbers 1 to 0 to select the weather or the speed of time. Exit (S) Menu (X)",
            entries: () => [
                ["SunnyWeather", run("ALOVELYDAY")],
                ["LightClouds", run("APLEASANTDAY")],
                ["DenseClouds", run("ABITDRIEG")],
                ["FoggyWeather", run("CANTSEEATHING")],
                ["StormyWeather", run("CATSANDDOGS")],
                ["FastGameClock", run("LIFEISPASSINGMEBY")],
                ["EverythingFaster", run("ONSPEED")],
                ["EverythingSlower", run("BOOOOOORING")],
            ],
        },
        specials: {
            title: "SPECIALS",
            help: "Numbers 1 to 0 to select. Riot and Peds Hate You can not be undone until you restart. Do not save afterwards. Exit (S) Menu (X)",
            entries: () => [
                ["RaiseWantedLevel", run("YOUWONTTAKEMEALIVE")],
                ["ClearWantedLevel", run("LEAVEMEALONE")],
                ["ShowMediaLevel", run("CHASESTAT")],
                ["PedsRiot", run("FIGHTFIGHTFIGHT")],
                ["PedsHateYou", run("NOBODYLIKESME")],
                ["PedsCarryGuns", run("OURGODGIVENRIGHTTOBEARARMS")],
                ["GirlsCarryGuns", run("CHICKSWITHGUNS")],
                ["LadiesMan", run("FANNYMAGNET")],
            ],
        },
        misc: {
            title: "MISCELLANEOUS",
            help: "Numbers 1 to 0 to select. Exit (S) Menu (X)",
            entries: () => [
                ["CommitSuicide", run("ICANTTAKEITANYMORE")],
                ["BlowUpNearbyCars", run("BIGBANG")],
                ["AggressiveDrivers", run("MIAMITRAFFIC")],
                ["FastBoatsFly", run("AIRSHIP")],
                ["MakeMeSmoke", run("CERTAINDEATH")],
            ],
        },
    };

    const MAIN = [
        ["LOCATIONS", "locations"],
        ["MISSIONS", "missions"],
        ["UPGRADES", "upgrades"],
        ["VEHICLES", "vehicles"],
        ["CLOTHES", "clothes"],
        ["CHARACTERS", "characters"],
        ["WEAPONS", "weapons"],
        ["TIMEMACHINE", "time"],
        ["SPECIALS", "specials"],
        ["MISCELLANEOUS", "misc"],
    ];
    const MAIN_HELP = "Hello Tommy Numbers 1 to 0 to select options MISSIONS and CLOTHES are limited in this web port Exit Menu (S) Return Menu (X)";

    // ─── UI ─────────────────────────────────────────────────────────

    const css = `
    #vx-cleo{position:fixed;inset:0;z-index:100001;display:none;pointer-events:none;user-select:none;-webkit-user-select:none;
      font-family:"Trebuchet MS","Segoe UI",Roboto,system-ui,sans-serif;font-weight:700}
    #vx-cleo .mn-box{position:absolute;left:5%;top:6%;width:max(31%,270px);max-width:96vw;box-sizing:border-box;padding:.4em .6em .5em;pointer-events:auto;
      background:rgba(24,30,46,.9);color:#e6e7ec;font-size:clamp(14px,3.3vh,34px);line-height:1.22;text-shadow:1px 1px 0 rgba(0,0,0,.55)}
    #vx-cleo .mn-title{display:flex;align-items:center;gap:.35em;cursor:pointer;color:#f2f2f5}
    #vx-cleo .mn-title svg{width:1em;height:1em;flex:none}
    #vx-cleo .mn-row{display:block;width:100%;padding:.12em 0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;text-shadow:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
    #vx-cleo .mn-row:active{background:rgba(255,255,255,.12)}
    #vx-cleo .mn-row.on{color:#8fe3a0}
    #vx-cleo .mn-help{position:absolute;left:24%;right:5%;bottom:2.5%;text-align:justify;text-justify:inter-word;color:#ececec;font-size:clamp(12px,3.2vh,32px);line-height:1.22;
      text-shadow:2px 2px 0 #000,-1px 1px 0 #000,1px -1px 0 #000,-1px -1px 0 #000;pointer-events:none}
    #vx-cleo .mn-bar{position:absolute;left:5%;top:calc(6% + var(--mn-h,300px) + 8px);display:flex;gap:8px;pointer-events:auto}
    #vx-cleo .mn-btn{padding:.35em .9em;border:1px solid rgba(255,255,255,.35);border-radius:3px;background:rgba(24,30,46,.9);color:#e6e7ec;font:700 clamp(12px,2.6vh,22px) "Trebuchet MS",system-ui,sans-serif;cursor:pointer}
    @media (max-width:700px){#vx-cleo .mn-help{left:5%}}
    `;

    const STAR =
        '<svg viewBox="0 0 24 24" fill="#e6e7ec" aria-hidden="true"><path d="M12 1l2.2 4.6 4.3-2.7-.2 5 4.9 1.3-3.4 3.8 3.4 3.8-4.9 1.3.2 5-4.3-2.7L12 23l-2.2-4.6-4.3 2.7.2-5-4.9-1.3 3.4-3.8L.8 7.2l4.9-1.3-.2-5 4.3 2.7z"/></svg>';

    let root = null;
    let boxNode = null;
    let titleNode = null;
    let listNode = null;
    let helpNode = null;
    let barNode = null;
    let page = null; // null = main menu, otherwise a key of PAGES
    let sub = 0; // sub-page number for long lists
    let isOpen = false;
    let helpTimer = 0;

    function h(tag, props, ...kids) {
        const n = document.createElement(tag);
        Object.assign(n, props || {});
        for (const k of kids) n.append(k);
        return n;
    }

    function baseHelp() {
        return page ? PAGES[page].help : MAIN_HELP;
    }
    function say(text) {
        if (!helpNode) return;
        helpNode.textContent = text;
        clearTimeout(helpTimer);
        helpTimer = setTimeout(() => {
            if (helpNode) helpNode.textContent = baseHelp();
        }, 2600);
    }

    // the entries shown right now, as [label, action, isOn]
    function current() {
        if (!page) return MAIN.map(([label, key]) => [label, () => open(key)]);
        const all = PAGES[page].entries();
        if (all.length <= 10) return all;
        const per = 9;
        const pages = Math.ceil(all.length / per);
        sub = sub % pages;
        const slice = all.slice(sub * per, sub * per + per);
        slice.push(["NextPage", () => { sub += 1; render(); }]);
        return slice;
    }

    function render() {
        if (!root) return;
        const entries = current();
        titleNode.innerHTML = STAR;
        titleNode.append(page ? PAGES[page].title : "MAIN MENU");
        listNode.replaceChildren(
            ...entries.map((entry, i) => {
                const num = (i + 1) % 10;
                const label = `${num}-${entry[0]}${entry[2] ? (entry[2]() ? " [ON]" : " [OFF]") : ""}`;
                return h("button", { type: "button", className: "mn-row" + (entry[2] && entry[2]() ? " on" : ""), onclick: () => choose(i) }, label);
            }),
        );
        helpNode.textContent = baseHelp();
        requestAnimationFrame(() => {
            const r = boxNode.getBoundingClientRect();
            root.style.setProperty("--mn-h", Math.round(r.height) + "px");
        });
    }

    function choose(i) {
        const entry = current()[i];
        if (!entry) return;
        entry[1]();
        if (entry[2]) render();
    }

    function open(key) {
        page = key;
        sub = 0;
        render();
    }

    function dismiss() {
        if (api() && api().toggleMenu) api().toggleMenu();
        else ui.close();
    }

    function onKey(e) {
        if (!isOpen) return;
        let handled = true;
        if (/^[0-9]$/.test(e.key)) choose(e.key === "0" ? 9 : Number(e.key) - 1);
        else if (e.key === "s" || e.key === "S") dismiss();
        else if (e.key === "x" || e.key === "X") open(null);
        else handled = false;
        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    function build() {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);

        titleNode = h("div", { className: "mn-title", onclick: () => open(null) });
        listNode = h("div", { className: "mn-list" });
        boxNode = h("div", { className: "mn-box" }, titleNode, listNode);
        helpNode = h("div", { className: "mn-help" });
        barNode = h("div", { className: "mn-bar" }, h("button", { type: "button", className: "mn-btn", onclick: () => open(null) }, "MENU (X)"), h("button", { type: "button", className: "mn-btn", onclick: () => dismiss() }, "EXIT (S)"));
        root = h("div", { id: "vx-cleo", role: "dialog" }, boxNode, barNode, helpNode);
        ["touchstart", "touchmove", "touchend", "mousedown", "wheel"].forEach((ev) => boxNode.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
        document.body.appendChild(root);
        window.addEventListener("keydown", onKey, true);
    }

    const ui = {
        // returns the new open state; modules/cheats.js uses it for its button and cursor
        toggle() {
            return isOpen ? ui.close() : ui.open();
        },
        open() {
            if (!root) build();
            isOpen = true;
            page = null;
            root.style.display = "block";
            render();
            return true;
        },
        close() {
            isOpen = false;
            if (root) root.style.display = "none";
            const btn = document.getElementById("cheat-toggle-btn");
            if (btn) btn.classList.remove("active");
            return false;
        },
        isOpen: () => isOpen,
    };
    window.vcCleo = ui;
})();
