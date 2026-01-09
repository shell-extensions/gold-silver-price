/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

'use strict';

import St from 'gi://St';
import Gio from 'gi://Gio';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const PRICE_REFRESH_MS = 5 * 60 * 1000;
const PRICE_PATTERN = '<div [^>]*class="[^"]*YMlKec fxKbKc[^"]*"[^>]*>\\s*\\K[^<]+';
const VISIBLE_METALS_KEY = 'visible-metals';
const CUSTOM_METALS_KEY = 'custom-metals';

const BASE_METALS = [
    {
        id: 'gold',
        name: 'Gold',
        url: 'https://www.google.com/finance/quote/GCW00:COMEX',
    },
    {
        id: 'silver',
        name: 'Silver',
        url: 'https://www.google.com/finance/quote/SIW00:COMEX',
    },
];

function openUrl(url) {
    try {
        Gio.Subprocess.new(['xdg-open', url], Gio.SubprocessFlags.NONE);
    } catch (error) {
        logError(error);
    }
}

function executeCommandAsync(command) {
    return new Promise((resolve, reject) => {
        try {
            const process = Gio.Subprocess.new(
                ['sh', '-c', command],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            process.communicate_utf8_async(null, null, (proc, res) => {
                try {
                    const [, stdout, stderr] = proc.communicate_utf8_finish(res);

                    if (proc.get_successful()) {
                        resolve(stdout.trim());
                    } else {
                        reject(`stderr: ${stderr.trim()}`);
                    }
                } catch (error) {
                    logError(error);
                    reject(error.message);
                }
            });
        } catch (error) {
            logError(error);
            reject(error.message);
        }
    });
}

function shellEscape(value) {
    return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function clearChildren(actor) {
    for (const child of actor.get_children()) {
        child.destroy();
    }
}

function parseCustomMetals(raw) {
    const metals = [];

    for (const entry of raw) {
        try {
            const metal = JSON.parse(entry);
            if (!metal || typeof metal !== 'object') {
                continue;
            }

            const id = typeof metal.id === 'string' ? metal.id.trim() : '';
            const name = typeof metal.name === 'string' ? metal.name.trim() : '';
            const url = typeof metal.url === 'string' ? metal.url.trim() : '';

            if (!id || !name || !url) {
                continue;
            }

            metals.push({ id, name, url, custom: true });
        } catch {
            continue;
        }
    }

    return metals;
}

export default class GoldSilverPriceGnomeExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._settingsChangedId = this._settings.connect('changed', (settings, key) => {
            this._onSettingsChanged(key);
        });

        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this._panelBox = new St.BoxLayout({ style_class: 'panel-status-menu-box', style: 'spacing: 6px;' });
        this._indicator.add_child(this._panelBox);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._priceCache = new Map();

        this._rebuildUi();
        this._refreshPrices();

        this._refreshInterval = setInterval(() => this._refreshPrices(), PRICE_REFRESH_MS);
    }

    disable() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }

        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        this._indicator?.destroy();
        this._indicator = null;
        this._panelBox = null;
        this._menuPriceItems = null;
        this._menuToggleItems = null;
        this._panelLabels = null;
        this._priceCache = null;
        this._metals = null;
        this._metalById = null;
        this._visibleIds = null;
        this._settings = null;
    }

    _onSettingsChanged(key) {
        const previousIds = this._metals
            ? new Set(this._metals.map((metal) => metal.id))
            : new Set();

        this._rebuildUi();

        if (key === CUSTOM_METALS_KEY) {
            const newMetals = this._metals.filter((metal) => !previousIds.has(metal.id));
            if (newMetals.length > 0) {
                this._refreshPrices(newMetals);
            }
        }
    }

    _rebuildUi() {
        this._metals = this._getAllMetals();
        this._metalById = new Map(this._metals.map((metal) => [metal.id, metal]));
        this._visibleIds = this._getVisibleIds();

        this._buildPanel();
        this._buildMenu();
        this._updateToggleSensitivity();

        for (const metal of this._metals) {
            this._updateMetalLabels(metal.id);
        }
    }

    _getAllMetals() {
        const metals = [...BASE_METALS];
        const existingIds = new Set(metals.map((metal) => metal.id));

        for (const custom of parseCustomMetals(this._settings.get_strv(CUSTOM_METALS_KEY))) {
            if (existingIds.has(custom.id)) {
                continue;
            }

            metals.push(custom);
            existingIds.add(custom.id);
        }

        return metals;
    }

    _getVisibleIds() {
        const validIds = new Set(this._metals.map((metal) => metal.id));
        const configured = this._settings.get_strv(VISIBLE_METALS_KEY);
        const unique = [];
        const seen = new Set();

        for (const id of configured) {
            if (validIds.has(id) && !seen.has(id)) {
                unique.push(id);
                seen.add(id);
            }
        }

        let visible = unique;
        if (visible.length === 0 && this._metals.length > 0) {
            visible = [this._metals[0].id];
            this._settings.set_strv(VISIBLE_METALS_KEY, visible);
        } else if (visible.length !== configured.length) {
            this._settings.set_strv(VISIBLE_METALS_KEY, visible);
        }

        return visible;
    }

    _buildPanel() {
        clearChildren(this._panelBox);
        this._panelLabels = new Map();

        for (const id of this._orderedVisibleIds()) {
            const metal = this._metalById.get(id);
            if (!metal) {
                continue;
            }

            const label = new St.Label({ text: this._formatPanelLabel(metal) });
            this._panelBox.add_child(label);
            this._panelLabels.set(id, label);
        }
    }

    _buildMenu() {
        this._indicator.menu.removeAll();
        this._menuPriceItems = new Map();
        this._menuToggleItems = new Map();

        const pricesSection = new PopupMenu.PopupMenuSection();
        for (const metal of this._metals) {
            const item = new PopupMenu.PopupMenuItem(this._formatMenuLabel(metal));
            item.connect('activate', () => openUrl(metal.url));
            pricesSection.addMenuItem(item);
            this._menuPriceItems.set(metal.id, item);
        }
        this._indicator.menu.addMenuItem(pricesSection);

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const visibilitySection = new PopupMenu.PopupMenuSection();
        for (const metal of this._metals) {
            const toggle = new PopupMenu.PopupSwitchMenuItem(
                metal.name,
                this._visibleIds.includes(metal.id)
            );
            toggle.connect('toggled', (item, state) => this._onToggleMetal(metal.id, state));
            visibilitySection.addMenuItem(toggle);
            this._menuToggleItems.set(metal.id, toggle);
        }
        this._indicator.menu.addMenuItem(visibilitySection);

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const optionsItem = new PopupMenu.PopupMenuItem(_('Options...'));
        optionsItem.connect('activate', () => this.openPreferences());
        this._indicator.menu.addMenuItem(optionsItem);
    }

    _orderedVisibleIds() {
        const visibleSet = new Set(this._visibleIds);
        return this._metals.map((metal) => metal.id).filter((id) => visibleSet.has(id));
    }

    _updateToggleSensitivity() {
        const visibleSet = new Set(this._visibleIds);

        if (visibleSet.size === 1) {
            const [onlyId] = visibleSet;
            for (const [id, item] of this._menuToggleItems) {
                item.setSensitive(id !== onlyId);
            }
        } else {
            for (const item of this._menuToggleItems.values()) {
                item.setSensitive(true);
            }
        }
    }

    _onToggleMetal(id, state) {
        const visibleSet = new Set(this._visibleIds);

        if (state) {
            visibleSet.add(id);
        } else {
            visibleSet.delete(id);
        }

        if (visibleSet.size === 0) {
            const toggle = this._menuToggleItems.get(id);
            if (toggle) {
                toggle.setToggleState(true);
            }
            return;
        }

        const ordered = this._metals
            .map((metal) => metal.id)
            .filter((metalId) => visibleSet.has(metalId));

        this._settings.set_strv(VISIBLE_METALS_KEY, ordered);
    }

    _formatPanelLabel(metal, value = null) {
        if (!value) {
            return `${metal.name} ...`;
        }

        return `${metal.name} ${value}$`;
    }

    _formatMenuLabel(metal, value = null) {
        if (!value) {
            return `${metal.name}: ...`;
        }

        return `${metal.name}: ${value}$`;
    }

    _updateMetalLabels(id) {
        const metal = this._metalById.get(id);
        if (!metal) {
            return;
        }

        const value = this._priceCache.get(id) ?? null;
        const panelLabel = this._panelLabels.get(id);
        if (panelLabel) {
            panelLabel.text = this._formatPanelLabel(metal, value);
        }

        const menuItem = this._menuPriceItems.get(id);
        if (menuItem) {
            menuItem.label.text = this._formatMenuLabel(metal, value);
        }
    }

    _fetchPrice(url) {
        const command = `curl -s ${shellEscape(url)} | grep -oP '${PRICE_PATTERN}' | tr -d ',$'`;
        return executeCommandAsync(command);
    }

    _refreshPrices(metals = this._metals) {
        if (!metals) {
            return;
        }

        for (const metal of metals) {
            this._fetchPrice(metal.url)
                .then((value) => {
                    this._priceCache.set(metal.id, value);
                    this._updateMetalLabels(metal.id);
                })
                .catch(() => {
                    this._priceCache.set(metal.id, null);
                    this._updateMetalLabels(metal.id);
                });
        }
    }
}
