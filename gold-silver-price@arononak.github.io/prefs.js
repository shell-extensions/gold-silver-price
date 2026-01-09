'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

const CUSTOM_METALS_KEY = 'custom-metals';
const VISIBLE_METALS_KEY = 'visible-metals';
const RESERVED_IDS = new Set(['gold', 'silver']);

function parseCustomMetals(settings) {
    const raw = settings.get_strv(CUSTOM_METALS_KEY);
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

            metals.push({ id, name, url });
        } catch {
            continue;
        }
    }

    return metals;
}

function serializeCustomMetals(metals) {
    return metals.map((metal) => JSON.stringify({
        id: metal.id,
        name: metal.name,
        url: metal.url,
    }));
}

function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function makeUniqueId(name, existingIds) {
    const base = slugify(name) || 'metal';
    let candidate = `custom-${base}`;
    let suffix = 1;

    while (existingIds.has(candidate)) {
        candidate = `custom-${base}-${suffix}`;
        suffix += 1;
    }

    return candidate;
}

function clearContainer(container) {
    let child = container.get_first_child();

    while (child) {
        const next = child.get_next_sibling();
        container.remove(child);
        child = next;
    }
}

export default class GoldSilverPricePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.set_default_size(600, 420);

        const page = new Adw.PreferencesPage({ title: _('Metals') });
        window.add(page);

        const addGroup = new Adw.PreferencesGroup({ title: _('Add Custom Metal') });
        const nameRow = new Adw.EntryRow({
            title: _('Name'),
            placeholder_text: _('Platinum'),
        });
        const urlRow = new Adw.EntryRow({
            title: _('Google Finance URL'),
            placeholder_text: _('https://www.google.com/finance/quote/PLW00:COMEX'),
        });
        const addRow = new Adw.ActionRow({ title: _('Add to list') });
        const addButton = new Gtk.Button({ label: _('Add') });

        addRow.add_suffix(addButton);
        addRow.set_activatable_widget(addButton);

        addGroup.add(nameRow);
        addGroup.add(urlRow);
        addGroup.add(addRow);
        page.add(addGroup);

        const listGroup = new Adw.PreferencesGroup({ title: _('Custom Metals') });
        page.add(listGroup);

        const refreshList = () => {
            const metals = parseCustomMetals(settings);
            clearContainer(listGroup);

            if (metals.length === 0) {
                const emptyRow = new Adw.ActionRow({
                    title: _('No custom metals yet'),
                    subtitle: _('Use the form above to add one.'),
                });
                emptyRow.set_sensitive(false);
                listGroup.add(emptyRow);
                return;
            }

            for (const metal of metals) {
                const row = new Adw.ActionRow({
                    title: metal.name,
                    subtitle: metal.url,
                });
                const removeButton = new Gtk.Button({ label: _('Remove') });

                removeButton.connect('clicked', () => {
                    const updated = parseCustomMetals(settings).filter((item) => item.id !== metal.id);
                    settings.set_strv(CUSTOM_METALS_KEY, serializeCustomMetals(updated));

                    const visible = settings
                        .get_strv(VISIBLE_METALS_KEY)
                        .filter((item) => item !== metal.id);
                    settings.set_strv(VISIBLE_METALS_KEY, visible);
                });

                row.add_suffix(removeButton);
                row.set_activatable_widget(removeButton);
                listGroup.add(row);
            }
        };

        addButton.connect('clicked', () => {
            const name = nameRow.text.trim();
            const url = urlRow.text.trim();

            if (!name || !url) {
                return;
            }

            const metals = parseCustomMetals(settings);
            const existingIds = new Set(metals.map((metal) => metal.id));
            for (const id of RESERVED_IDS) {
                existingIds.add(id);
            }

            const id = makeUniqueId(name, existingIds);
            metals.push({ id, name, url });
            settings.set_strv(CUSTOM_METALS_KEY, serializeCustomMetals(metals));

            nameRow.text = '';
            urlRow.text = '';
        });

        settings.connect(`changed::${CUSTOM_METALS_KEY}`, refreshList);
        refreshList();
    }
}
