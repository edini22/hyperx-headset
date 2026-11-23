import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {QuickSettingsItem} from 'resource:///org/gnome/shell/ui/quickSettings.js';

const CAPTURE_WIDTH = 600;
const SETTLE_MS = 900;

function wait(ms) {
    return new Promise(resolve =>
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        }),
    );
}

export default class Demo extends Extension {
    enable() {
        this._record().catch(e => console.log(`DEMO error ${e}\n${e.stack}`));
    }

    disable() {}

    async _record() {
        const dir = GLib.getenv('HYPERX_DEMO_DIR');
        const quickSettings = Main.panel.statusArea.quickSettings;
        let indicator = null;
        for (let i = 0; i < 60 && !indicator?.visible; i++) {
            await wait(500);
            indicator = quickSettings._indicators
                .get_children()
                .find(child => child.constructor.name === 'HeadsetIndicator');
        }
        if (!indicator?.visible) {
            console.log('DEMO error: the headset indicator never showed a battery level');
            return;
        }

        const controls = indicator.quickSettingsItems[0]._controls;
        const toggle = indicator.quickSettingsItems[0];
        const shooter = new Shell.Screenshot();
        let frame = 0;
        const shoot = async name => {
            await wait(SETTLE_MS);
            frame += 1;
            const file = Gio.File.new_for_path(`${dir}/${String(frame).padStart(2, '0')}-${name}.png`);
            const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
            await shooter.screenshot_area(
                global.stage.width - CAPTURE_WIDTH,
                0,
                CAPTURE_WIDTH,
                global.stage.height,
                stream,
            );
            stream.close(null);
            console.log(`DEMO frame ${file.get_basename()}`);
        };

        await shoot('panel');
        indicator._hoverMenu._menu.open();
        await shoot('hover-menu');
        indicator._hoverMenu._menu.close();
        for (const item of quickSettings.menu._grid.get_children()) {
            if (item instanceof QuickSettingsItem && item !== toggle) item.hide();
        }
        quickSettings.menu.open();
        await shoot('quick-settings');
        toggle.menu.open();
        await shoot('hyperx-menu');
        controls._autoOff.item.setSubmenuShown(true);
        await shoot('auto-power-off');
        controls._autoOff.item.setSubmenuShown(false);
        controls._eq.item.setSubmenuShown(true);
        await shoot('equalizer');
        quickSettings.menu.close();
        console.log('DEMO done');
    }
}
