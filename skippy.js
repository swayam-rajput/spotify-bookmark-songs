// ============================================================
// Skippy — Spicetify Extension v2
// ============================================================

(function Skippy() {
    if (!Spicetify?.Player?.addEventListener || !Spicetify?.Platform) {
        setTimeout(Skippy, 800);
        return;
    }

    // ─────────────────────────────────────────
    // STORAGE
    // Each entry: { ms: number, name: string, artist: string }
    // Keyed by Spotify track URI.
    // ─────────────────────────────────────────
    const STORAGE_KEY = "Skippy:bookmarks";

    const Storage = {
        getAll() {
            try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
            catch { return {}; }
        },
        saveAll(data) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        },
        get(uri) {
            const entry = this.getAll()[uri];
            // Support both legacy (number) and new ({ms, name, artist}) formats
            if (entry === null || entry === undefined) return null;
            if (typeof entry === "number") return { ms: entry, name: uri, artist: "" };
            return entry;
        },
        set(uri, ms) {
            const data = this.getAll();
            const item = Spicetify.Player.data?.item;
            data[uri] = {
                ms: Math.round(ms),
                name: item?.name ?? uri,
                artist: item?.artists?.[0]?.name ?? "",
            };
            this.saveAll(data);
        },
        remove(uri) {
            const data = this.getAll();
            delete data[uri];
            this.saveAll(data);
        },
    };

    // ─────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────
    function msToTime(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        return `${m}:${(s % 60).toString().padStart(2, "0")}`;
    }

    function getCurrentUri() {
        return Spicetify.Player.data?.item?.uri ?? null;
    }

    function getDuration() {
        return Spicetify.Player.data?.item?.duration?.milliseconds ?? 0;
    }

    // ─────────────────────────────────────────
    // AUTO-SEEK ON SONG CHANGE
    // ─────────────────────────────────────────
    Spicetify.Player.addEventListener("songchange", () => {
        setTimeout(() => {
            const uri = getCurrentUri();
            if (!uri) return;
            const entry = Storage.get(uri);
            if (entry !== null) Spicetify.Player.seek(entry.ms);
            UI.update();
        }, 100);
    });

    // ─────────────────────────────────────────
    // UI
    // ─────────────────────────────────────────
    const UI = {
        pinEl: null,
        markerEl: null,
        tooltipEl: null,
        hoverLabelEl: null,
        progressBarEl: null,
        tooltipHideTimer: null,
        // mouse-drag state
        _drag: null,

        PROGRESSBAR_SELECTORS: [
            '[data-testid="playback-progressbar"]',
            ".playback-progressbar",
            ".progress-bar",
        ],
        REPEAT_SELECTORS: [
            '[data-testid="control-button-repeat"]',
            '[aria-label="Enable repeat"]',
            '[aria-label="Enable repeat one"]',
        ],
        LEFT_CONTROLS_SELECTORS: [
            '[data-testid="player-controls"] .player-controls__left',
            ".player-controls__left",
            '[data-testid="control-button-skip-back"]',
        ],

        init() {
            this.injectStyles();
            this.createTooltip();
            this.watchForBar();
        },

        watchForBar() {
            const tryInject = () => {
                const bar = this.findEl(this.PROGRESSBAR_SELECTORS);
                if (bar) { this.progressBarEl = bar; this.injectUI(); }
                else setTimeout(tryInject, 500);
            };
            tryInject();
        },

        findEl(selectors) {
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) return el;
            }
            return null;
        },

        injectUI() {
            this.createPin();
            this.createMarker();
            this.setupMouseDrag();
            this.setupHoverLabel();
            this.update();
        },

        // ── SVG icons ──────────────────────────────────────
        // Bookmark icon (outline) for the pin button
        ICON_BOOKMARK: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
        // Bookmark filled for the marker chip
        ICON_BOOKMARK_FILL: `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
        // List icon for the list button
        ICON_LIST: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,

        // ── Pin button ──────────────────────────────────────
        createPin() {
            // Wrapper so pin + list-button sit side by side
            const wrap = document.createElement("div");
            wrap.className = "sb-pin-wrap";

            const pin = document.createElement("button");
            pin.id = "sb-drag-pin";
            pin.className = "sb-drag-pin";
            pin.title = "Drag to progress bar to skip to that timestamp";
            pin.innerHTML = this.ICON_BOOKMARK;
            this.pinEl = pin;

            const listBtn = document.createElement("button");
            listBtn.id = "sb-list-btn";
            listBtn.className = "sb-list-btn";
            listBtn.title = "View all bookmarks";
            listBtn.innerHTML = this.ICON_LIST;
            listBtn.addEventListener("click", () => this.showBookmarksList());

            wrap.appendChild(pin);
            wrap.appendChild(listBtn);

            const repeatBtn = this.findEl(this.REPEAT_SELECTORS);
            if (repeatBtn) {
                repeatBtn.parentElement.insertBefore(wrap, repeatBtn.nextSibling);
            } else {
                const lc = this.findEl(this.LEFT_CONTROLS_SELECTORS);
                const parent = lc?.tagName === "BUTTON" ? lc.parentElement : lc;
                (parent ?? this.progressBarEl.parentElement)?.appendChild(wrap);
            }
        },

        // ── Marker chip on progress bar ──────────────────────
        createMarker() {
            const marker = document.createElement("div");
            marker.id = "sb-progress-marker";
            marker.className = "sb-progress-marker";
            marker.title = "Drag to move · hover to remove";
            marker.style.display = "none";
            marker.innerHTML = this.ICON_BOOKMARK_FILL;

            const pbParent = this.progressBarEl.parentElement;
            if (pbParent) {
                pbParent.style.position = "relative";
                pbParent.appendChild(marker);
            }
            this.markerEl = marker;
        },

        // ── Tooltip (shared save/remove prompt) ──────────────
        createTooltip() {
            const tt = document.createElement("div");
            tt.id = "sb-tooltip";
            tt.className = "sb-tooltip";
            tt.innerHTML = `
                <div class="sb-tt-label"></div>
                <div class="sb-tt-time"></div>
                <div class="sb-tt-buttons">
                    <button class="sb-btn sb-btn-confirm">Save</button>
                    <button class="sb-btn sb-btn-cancel">Cancel</button>
                </div>
            `;
            document.body.appendChild(tt);
            this.tooltipEl = tt;
            tt.addEventListener("mouseenter", () => clearTimeout(this.tooltipHideTimer));
            tt.addEventListener("mouseleave", () => this.scheduleHide());

            // Hover timestamp label
            const hl = document.createElement("div");
            hl.id = "sb-hover-label";
            hl.className = "sb-hover-label";
            document.body.appendChild(hl);
            this.hoverLabelEl = hl;
        },

        // ─────────────────────────────────────────
        // MOUSE DRAG (replaces HTML5 drag/drop)
        // Handles both the pin button and the marker chip.
        // ─────────────────────────────────────────
        setupMouseDrag() {
            const pb = this.progressBarEl;

            const startDrag = (source, e) => {
                e.preventDefault();
                this._drag = { source }; // source: "pin" | "marker"
                this.hideTooltip();
                if (source === "marker") this.markerEl.classList.add("dragging");
                if (source === "pin") this.pinEl.classList.add("dragging");
            };

            this.pinEl.addEventListener("mousedown", (e) => startDrag("pin", e));
            this.markerEl.addEventListener("mousedown", (e) => startDrag("marker", e));

            // Marker hover → show remove tooltip (only when not dragging)
            this.markerEl.addEventListener("mouseenter", () => {
                if (this._drag) return;
                clearTimeout(this.tooltipHideTimer);
                const uri = getCurrentUri();
                if (!uri) return;
                const entry = Storage.get(uri);
                if (entry === null) return;
                const rect = this.markerEl.getBoundingClientRect();
                this.showTooltip("remove", rect.left + 10, rect.top, uri, entry.ms);
            });
            this.markerEl.addEventListener("mouseleave", () => this.scheduleHide());

            document.addEventListener("mousemove", (e) => {
                if (!this._drag) return;
                const rect = pb.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const previewMs = pct * getDuration();

                // Move the marker chip visually while dragging
                if (this.markerEl) {
                    this.markerEl.style.left = `calc(${pct * 100}% - 10px)`;
                    this.markerEl.style.display = "flex";
                }

                // Update hover label to show preview time
                const hl = this.hoverLabelEl;
                if (hl) {
                    hl.textContent = msToTime(previewMs);
                    hl.style.left = `${Math.max(4, Math.min(e.clientX - 20, window.innerWidth - 44))}px`;
                    hl.style.top = `${e.clientY - 48}px`;
                    hl.classList.add("show");
                }
            });

            document.addEventListener("mouseup", (e) => {
                if (!this._drag) return;
                const source = this._drag.source;
                this._drag = null;

                if (source === "pin") this.pinEl.classList.remove("dragging");
                if (source === "marker") this.markerEl.classList.remove("dragging");
                this.hoverLabelEl?.classList.remove("show");

                // Only commit if released over the progress bar
                const rect = pb.getBoundingClientRect();
                if (e.clientX < rect.left || e.clientX > rect.right ||
                    e.clientY < rect.top - 30 || e.clientY > rect.bottom + 30) {
                    // Dropped outside — restore marker to saved position
                    this.update();
                    return;
                }

                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const dropMs = pct * getDuration();
                const uri = getCurrentUri();
                if (!uri || dropMs <= 0) { this.update(); return; }

                this.showTooltip("save", e.clientX, e.clientY, uri, dropMs);
            });
        },

        // ── Progress bar hover timestamp ────────────────────
        // setupHoverLabel() {
        //     const pb = this.progressBarEl;
        //     const hl = this.hoverLabelEl;

        //     pb.addEventListener("mousemove", (e) => {
        //         if (this._drag) return; // already handled in drag mousemove
        //         const rect = pb.getBoundingClientRect();
        //         const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        //         hl.textContent = msToTime(pct * getDuration());
        //         hl.style.left = `${Math.max(4, Math.min(e.clientX - 20, window.innerWidth - 44))}px`;
        //         hl.style.top = `${e.clientY - 28}px`;
        //         hl.classList.add("show");
        //     });

        //     pb.addEventListener("mouseleave", () => {
        //         if (!this._drag) hl.classList.remove("show");
        //     });
        // },

        // ─────────────────────────────────────────
        // TOOLTIP LOGIC
        // ─────────────────────────────────────────
        showTooltip(mode, x, y, uri, ms) {
            const tt = this.tooltipEl;
            const label = tt.querySelector(".sb-tt-label");
            const timeEl = tt.querySelector(".sb-tt-time");
            const confirmBtn = tt.querySelector(".sb-btn-confirm");
            const cancelBtn = tt.querySelector(".sb-btn-cancel");

            label.textContent = mode === "save" ? "Skip to this spot?" : "Remove bookmark?";
            timeEl.textContent = msToTime(ms);
            confirmBtn.textContent = mode === "save" ? "Save" : "Remove";
            confirmBtn.dataset.mode = mode;

            const ttW = 170;
            tt.style.left = `${Math.max(8, Math.min(x - ttW / 2, window.innerWidth - ttW - 8))}px`;
            tt.style.top = `${Math.max(8, y - 88)}px`;
            tt.classList.add("show");

            // Clone to strip old listeners
            const nc = confirmBtn.cloneNode(true);
            const nx = cancelBtn.cloneNode(true);
            confirmBtn.replaceWith(nc);
            cancelBtn.replaceWith(nx);

            nc.addEventListener("click", () => {
                if (mode === "save") {
                    Storage.set(uri, ms);
                    Spicetify.showNotification(`Bookmark saved at ${msToTime(ms)}`);
                } else {
                    Storage.remove(uri);
                    Spicetify.showNotification("Bookmark removed");
                }
                this.hideTooltip();
                this.update();
            });
            nx.addEventListener("click", () => { this.hideTooltip(); this.update(); });
        },

        scheduleHide() {
            this.tooltipHideTimer = setTimeout(() => this.hideTooltip(), 2000);
        },

        hideTooltip() {
            this.tooltipEl?.classList.remove("show");
        },

        // ─────────────────────────────────────────
        // BOOKMARKS LIST PANEL
        // ─────────────────────────────────────────
        showBookmarksList() {
            const all = Storage.getAll();
            const entries = Object.entries(all);

            // Sort by artist + track name
            entries.sort(([, a], [, b]) => {
                const aName = typeof a === "object" ? `${a.artist} ${a.name}` : a.toString();
                const bName = typeof b === "object" ? `${b.artist} ${b.name}` : b.toString();
                return aName.localeCompare(bName);
            });

            const rows = entries.length === 0
                ? `<div class="sb-empty-state">No bookmarks saved yet.</div>`
                : entries.map(([uri, raw]) => {
                    const entry = typeof raw === "number"
                        ? { ms: raw, name: uri.split(":")[2] ?? uri, artist: "" }
                        : raw;
                    const isCurrent = uri === getCurrentUri();
                    return `
                        <div class="sb-list-row${isCurrent ? " sb-list-row--current" : ""}" data-uri="${uri}" data-ms="${entry.ms}">
                            <div class="sb-list-info">
                                <span class="sb-list-name">${entry.name}</span>
                                ${entry.artist ? `<span class="sb-list-artist">${entry.artist}</span>` : ""}
                            </div>
                            <span class="sb-list-time">${msToTime(entry.ms)}</span>
                            <button class="sb-list-del" data-uri="${uri}" title="Remove bookmark">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                    `;
                }).join("");

            const container = document.createElement("div");
            container.innerHTML = `
                <style>
                    .sb-modal-content { display: flex; flex-direction: column; gap: 16px; min-width: 320px; }
                    .sb-list { font-size: 13px; color: var(--spice-text); max-height: 280px; overflow-y: auto; }
                    .sb-empty-state {
                        padding: 24px 0; text-align: center;
                        color: var(--spice-subtext, #888); font-style: italic;
                    }
                    .sb-list-row {
                        display: flex; align-items: center; gap: 10px;
                        padding: 8px 4px; border-bottom: 1px solid rgba(255,255,255,0.05);
                        cursor: pointer; border-radius: 4px;
                    }
                    .sb-list-row:hover { background: rgba(255,255,255,0.05); }
                    .sb-list-row--current { background: rgba(255,255,255,0.04); }
                    .sb-list-info { flex: 1; min-width: 0; }
                    .sb-list-name { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
                    .sb-list-artist { display: block; font-size: 11px; color: var(--spice-subtext, #888); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                    .sb-list-time { font-size: 11px; color: var(--spice-subtext, #888); white-space: nowrap; flex-shrink: 0; }
                    .sb-list-del {
                        background: none; border: none; cursor: pointer; padding: 4px;
                        color: var(--spice-subtext, #888); opacity: 0; transition: opacity 0.1s;
                        border-radius: 3px; flex-shrink: 0;
                    }
                    .sb-list-row:hover .sb-list-del { opacity: 1; }
                    .sb-list-del:hover { color: #e05c5c; }
                    
                    /* ── Backup Toolbar ── */
                    .sb-backup-toolbar {
                        display: flex; gap: 10px;
                        border-top: 1px solid rgba(255,255,255,0.1);
                        padding-top: 12px;
                        justify-content: flex-end;
                    }
                    .sb-toolbar-btn {
                        display: inline-flex; align-items: center; gap: 6px;
                        background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 16px; padding: 6px 14px;
                        font-size: 12px; font-weight: 500; color: var(--spice-text, #fff);
                        cursor: pointer; transition: all 0.2s ease;
                    }
                    .sb-toolbar-btn:hover {
                        background: rgba(255,255,255,0.12);
                        border-color: rgba(255,255,255,0.25);
                        transform: translateY(-1px);
                    }
                    .sb-toolbar-btn:active {
                        transform: translateY(0);
                    }
                    .sb-toolbar-btn-primary {
                        background: var(--spice-button-active, #1ed760);
                        color: #000; border: none;
                    }
                    .sb-toolbar-btn-primary:hover {
                        background: #1fdf64;
                        color: #000;
                        opacity: 0.9;
                    }
                </style>
                <div class="sb-modal-content">
                    <div class="sb-list">${rows}</div>
                    <div class="sb-backup-toolbar">
                        <button id="sb-btn-export" class="sb-toolbar-btn" title="Export bookmarks to a JSON file">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Export Backup
                        </button>
                        <button id="sb-btn-import" class="sb-toolbar-btn sb-toolbar-btn-primary" title="Import bookmarks from a JSON file">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            Import Backup
                        </button>
                    </div>
                </div>
            `;

            // Click row → play track from bookmark
            container.querySelectorAll(".sb-list-row").forEach(row => {
                row.addEventListener("click", (e) => {
                    if (e.target.closest(".sb-list-del")) return;
                    const uri = row.dataset.uri;
                    const ms = parseInt(row.dataset.ms, 10);
                    Spicetify.Platform.PlayerAPI.playUri(uri)
                        .then(() => setTimeout(() => Spicetify.Player.seek(ms), 600))
                        .catch(() => {
                            // If already playing, just seek
                            if (uri === getCurrentUri()) Spicetify.Player.seek(ms);
                        });
                    Spicetify.PopupModal.hide();
                });
            });

            // Delete buttons
            container.querySelectorAll(".sb-list-del").forEach(btn => {
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const uri = btn.dataset.uri;
                    Storage.remove(uri);
                    btn.closest(".sb-list-row").remove();
                    this.update();
                    // If no rows left, show empty state instead of closing
                    if (container.querySelectorAll(".sb-list-row").length === 0) {
                        const listContainer = container.querySelector(".sb-list");
                        listContainer.innerHTML = `<div class="sb-empty-state">No bookmarks saved yet.</div>`;
                    }
                });
            });

            // Export Backup button handler
            container.querySelector("#sb-btn-export").addEventListener("click", () => {
                const data = Storage.getAll();
                if (Object.keys(data).length === 0) {
                    Spicetify.showNotification("No bookmarks to export!");
                    return;
                }
                try {
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "skippy_bookmarks.json";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    Spicetify.showNotification("Bookmarks exported successfully!");
                } catch (err) {
                    Spicetify.showNotification("Failed to export: " + err.message);
                }
            });

            // Import Backup button handler
            container.querySelector("#sb-btn-import").addEventListener("click", () => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".json";
                input.style.display = "none";
                input.addEventListener("change", (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            const imported = JSON.parse(event.target.result);
                            if (typeof imported !== "object" || imported === null) {
                                throw new Error("Format must be a JSON object");
                            }
                            const current = Storage.getAll();
                            let count = 0;
                            for (const [uri, entry] of Object.entries(imported)) {
                                if (typeof uri === "string" && (typeof entry === "number" || (typeof entry === "object" && typeof entry.ms === "number"))) {
                                    current[uri] = entry;
                                    count++;
                                }
                            }
                            if (count === 0) {
                                throw new Error("No valid bookmarks found in file");
                            }
                            Storage.saveAll(current);
                            Spicetify.showNotification(`Successfully imported ${count} bookmarks!`);
                            Spicetify.PopupModal.hide();
                            this.update();
                            // Re-open list to show the imported items immediately!
                            setTimeout(() => this.showBookmarksList(), 100);
                        } catch (err) {
                            Spicetify.showNotification("Import failed: " + err.message);
                        }
                    };
                    reader.readAsText(file);
                });
                document.body.appendChild(input);
                input.click();
                input.remove();
            });

            Spicetify.PopupModal.display({
                title: "Bookmarks",
                content: container,
                isLarge: false,
            });
        },

        // ─────────────────────────────────────────
        // UPDATE (pin state + marker position)
        // ─────────────────────────────────────────
        update() {
            const uri = getCurrentUri();
            const entry = uri ? Storage.get(uri) : null;
            const hasBookmark = entry !== null;

            if (this.pinEl) {
                this.pinEl.classList.toggle("has-bookmark", hasBookmark);
                this.pinEl.title = hasBookmark
                    ? `Bookmark at ${msToTime(entry.ms)} — drag to update`
                    : "Drag to progress bar to bookmark a spot";
            }

            if (this.markerEl && this.progressBarEl) {
                if (hasBookmark && getDuration() > 0) {
                    const pct = (entry.ms / getDuration()) * 100;
                    this.markerEl.style.left = `calc(${pct}% - 10px)`;
                    this.markerEl.style.display = "flex";
                } else {
                    this.markerEl.style.display = "none";
                }
            }
        },

        // ─────────────────────────────────────────
        // STYLES
        // ─────────────────────────────────────────
        injectStyles() {
            const style = document.createElement("style");
            style.id = "sb-styles";
            style.textContent = `
                /* ── Pin wrap ── */
                .sb-pin-wrap {
                    display: inline-flex;
                    align-items: center;
                    gap: 2px;
                    margin: 0 4px;
                    flex-shrink: 0;
                    vertical-align: middle;
                }

                /* ── Pin button ── */
                .sb-drag-pin, .sb-list-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 28px;
                    height: 28px;
                    background: transparent;
                    border: 1px solid rgba(71, 69, 69, 0.02);
                    border-radius: 5px;
                    cursor: default;
                    color: var(--spice-subtext, #888);
                    transition: color 0.12s;
                    padding: 0;
                }
                .sb-list-btn { cursor: pointer; }
                .sb-drag-pin:hover, .sb-list-btn:hover {
                    color: var(--spice-text, #fff);
                    background: rgba(255,255,255,0.09);
                    border-color: rgba(255,255,255,0.18);
                }
                .sb-drag-pin:active { cursor: grabbing; }
                .sb-drag-pin.dragging { opacity: 0.35; cursor: default; }
                .sb-drag-pin.has-bookmark {
                    color: var(--spice-button-active, #496e91);
                    border-color: rgba(30,215,96,0.35);
                    background: rgba(30,215,96,0.07);
                }

                /* ── Bookmark marker chip ── */
                .sb-progress-marker {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 15px;
                    height: 15px;
                    background: #4687d6;
                    border-radius: 1px;
                    cursor: pointer;
                    z-index: 20;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #fff;
                    pointer-events: all;
                    transition: border-color 0.12s;
                }
                .sb-progress-marker:hover { border-color: var(--spice-button-active, #1ed760); }
                .sb-progress-marker:active { cursor: grabbing; }
                .sb-progress-marker.dragging { opacity: 0.4; cursor: grabbing; }

                /* ── Tooltip ── */
                .sb-tooltip {
                    position: fixed;
                    background: var(--spice-main, #121212);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 1px;
                    padding: 8px 12px;
                    font-size: 14px;
                    color: var(--spice-text, #fff);
                    z-index: 99999;
                    opacity: 0;
                    visibility: hidden;
                    transition: opacity 0.1s, visibility 0.1s;
                    pointer-events: none;
                    min-width: 160px;
                }
                .sb-tooltip.show { opacity: 1; visibility: visible; pointer-events: all; }
                .sb-tt-label { font-weight: 500; margin-bottom: 2px; }
                .sb-tt-time { color: var(--spice-subtext, #888); font-size: 12px; margin-bottom: 8px; }
                .sb-tt-buttons { display: flex; gap: 6px; }
                .sb-btn {
                    flex: 1; padding: 4px 8px; border-radius: 0px; border: none;
                    cursor: pointer; font-size: 13px; font-weight: 400; transition: opacity 0.1s;
                }
                .sb-btn:hover { opacity: 0.78; }
                .sb-btn-confirm { background: var(--spice-button-active, #1ed760); color: #000; }
                .sb-btn-cancel { background: rgba(255,255,255,0.08); color: var(--spice-subtext, #aaa); }

                /* ── Hover timestamp label ── */
                .sb-hover-label {
                    position: fixed;
                    background: rgba(0,0,0,0.75);
                    border-radius: 3px;
                    padding: 2px 5px;
                    font-size: 12px;
                    color: #fff;
                    z-index: 99999;
                    pointer-events: none;
                    white-space: nowrap;
                    opacity: 0;
                    visibility: hidden;
                    transition: opacity 0.06s, visibility 0.06s;
                }
                .sb-hover-label.show { opacity: 1; visibility: visible; }
            `;
            document.head.appendChild(style);
        },
    };

    // ─────────────────────────────────────────
    // BOOT
    // ─────────────────────────────────────────
    UI.init();

    Spicetify.Player.addEventListener("onprogress", () => {
        if (!UI._progressThrottle) {
            UI._progressThrottle = setTimeout(() => {
                UI._progressThrottle = null;
                UI.update();
            }, 1200);
        }
    });

    console.log("[Skippy] v2 loaded");
})();
