import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

function dumpMenu(prefix, menu) {
    for (const item of menu._getMenuItems()) {
        const bar = item._bar ? ` bar=${item._bar.visible}:${item._bar.value}` : '';
        console.log(
            `PROBE ${prefix} ${item.constructor.name} label="${item.label?.text ?? item._label?.text ?? ''}" sensitive=${item.getSensitive?.()}${bar}`,
        );
    }
}

export default class Probe extends Extension {
    enable() {
        this._id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 12, () => {
            try {
                this._report();
            } catch (e) {
                console.log(`PROBE error ${e}\n${e.stack}`);
            }
            this._id = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _report() {
        const qs = Main.panel.statusArea.quickSettings;
        const ind = qs._indicators.get_children().find(c => c.constructor.name === 'HeadsetIndicator');
        if (!ind) {
            console.log('PROBE no indicator');
            return;
        }
        const parts = ind
            .get_children()
            .map(c => `${c.constructor.name}:${c.visible}:${c.text ?? c.icon_name ?? ''}:${c.width}x${c.height}`);
        console.log(`PROBE indicator visible=${ind.visible} children=${parts.join(' | ')}`);
        const toggle = ind.quickSettingsItems[0];
        console.log(`PROBE toggle checked=${toggle.checked} subtitle=${toggle.subtitle}`);
        dumpMenu('toggle-menu', toggle.menu);

        ind._hoverMenu._onEnter();
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 900, () => {
            try {
                const menu = ind._hoverMenu._menu;
                console.log(
                    `PROBE hover open=${menu.isOpen} panelActive=${Main.panel.menuManager.activeMenu === menu}`,
                );
                dumpMenu('hover-menu', menu);
                menu.close();
                console.log(
                    `PROBE hover closed=${!menu.isOpen} panelActiveCleared=${Main.panel.menuManager.activeMenu === null}`,
                );
            } catch (e) {
                console.log(`PROBE error ${e}\n${e.stack}`);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    disable() {
        if (this._id) GLib.source_remove(this._id);
    }
}
