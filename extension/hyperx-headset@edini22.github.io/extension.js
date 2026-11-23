import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {BarLevel} from 'resource:///org/gnome/shell/ui/barLevel.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

const BUS_NAME = 'io.github.edini22.HyperXHeadset';
const OBJECT_PATH = '/io/github/edini22/HyperXHeadset';
const INTERFACE_XML = `
<node>
  <interface name="io.github.edini22.HyperXHeadset">
    <property name="Status" type="s" access="read"/>
    <property name="Message" type="s" access="read"/>
    <property name="Battery" type="i" access="read"/>
    <property name="Charging" type="i" access="read"/>
    <property name="Muted" type="i" access="read"/>
    <property name="Sidetone" type="i" access="read"/>
    <property name="AutoOff" type="i" access="read"/>
    <property name="Eq" type="s" access="read"/>
    <property name="EqPresets" type="a(ss)" access="read"/>
    <property name="AutoOffChoices" type="ai" access="read"/>
    <method name="SetSidetone"><arg name="enabled" type="b" direction="in"/></method>
    <method name="SetAutoOff"><arg name="minutes" type="i" direction="in"/></method>
    <method name="SetEq"><arg name="preset" type="s" direction="in"/></method>
    <method name="Refresh"/>
  </interface>
</node>`;

const HeadsetProxy = Gio.DBusProxy.makeProxyWrapper(INTERFACE_XML);
const TITLE = 'HyperX Cloud III S';
const ICON = 'audio-headset-symbolic';
const LOW_BATTERY = 15;
const BAR_WARNING_LEVEL = 20;
const BAR_COLORS = {ok: [0x15, 0xc9, 0x31], warning: [0xff, 0x78, 0x00]};
const HOVER_DELAY_MS = 500;
const RESTART_INTERVAL_SECONDS = 30;
const TOGGLE_STATUSES = new Set(['no-access', 'connecting', 'disconnected', 'deaf', 'reading', 'ok']);

function autoOffLabel(minutes) {
    return minutes === 0 ? 'Never' : `${minutes} min`;
}

function reportError(error) {
    if (error instanceof GLib.Error) Gio.DBusError.strip_remote_error(error);
    Main.notifyError('HyperX Headset', error.message);
}

const BatteryBar = GObject.registerClass(
    class BatteryBar extends St.DrawingArea {
        _init() {
            super._init({
                style_class: 'hyperx-headset-bar',
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._level = 0;
        }

        setLevel(level) {
            if (level === this._level) return;
            this._level = level;
            this.queue_repaint();
        }

        vfunc_repaint() {
            const cr = this.get_context();
            const [width, height] = this.get_surface_size();
            const fg = this.get_theme_node().get_foreground_color();
            const [r, g, b] = this._level <= BAR_WARNING_LEVEL ? BAR_COLORS.warning : BAR_COLORS.ok;
            const capHeight = Math.max(1, Math.round(height * 0.12));
            const capWidth = Math.round(width * 0.5);
            const bodyTop = capHeight;
            const bodyHeight = height - capHeight;
            const inset = 2;
            const fillHeight = ((bodyHeight - 2 * inset) * Math.min(Math.max(this._level, 0), 100)) / 100;

            cr.setSourceRGBA(fg.red / 255, fg.green / 255, fg.blue / 255, fg.alpha / 255);
            cr.rectangle((width - capWidth) / 2, 0, capWidth, capHeight);
            cr.fill();
            cr.setLineWidth(1);
            cr.rectangle(0.5, bodyTop + 0.5, width - 1, bodyHeight - 1);
            cr.stroke();

            cr.setSourceRGBA(r / 255, g / 255, b / 255, 1);
            cr.rectangle(inset, height - inset - fillHeight, width - 2 * inset, fillHeight);
            cr.fill();
            cr.$dispose();
        }
    },
);

const BatteryItem = GObject.registerClass(
    class BatteryItem extends PopupMenu.PopupBaseMenuItem {
        _init() {
            super._init({reactive: false, can_focus: false});
            const box = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                x_expand: true,
                style_class: 'hyperx-headset-battery',
            });
            this._label = new St.Label();
            this._bar = new BarLevel({x_expand: true});
            box.add_child(this._label);
            box.add_child(this._bar);
            this.add_child(box);
        }

        sync(proxy) {
            const battery = proxy.Battery ?? -1;
            this._label.text = proxy.Message ?? '';
            this._bar.visible = battery >= 0;
            this._bar.value = Math.max(battery, 0) / 100;
        }
    },
);

class ChoiceGroup {
    constructor(menu, title, onSelect) {
        this._title = title;
        this._onSelect = onSelect;
        this._entries = new Map();
        this._keys = null;
        this.item = new PopupMenu.PopupSubMenuMenuItem(title);
        menu.addMenuItem(this.item);
    }

    setChoices(choices) {
        const keys = choices.map(([key]) => key).join('\n');
        if (keys === this._keys) return;
        this._keys = keys;
        this.item.menu.removeAll();
        this._entries.clear();
        for (const [key, label] of choices) {
            const entry = new PopupMenu.PopupMenuItem(label);
            entry.connect('activate', () => this._onSelect(key));
            this.item.menu.addMenuItem(entry);
            this._entries.set(key, {entry, label});
        }
    }

    setCurrent(current) {
        let currentLabel = null;
        for (const [key, {entry, label}] of this._entries) {
            const selected = key === current;
            entry.setOrnament(selected ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
            if (selected) currentLabel = label;
        }
        this.item.label.text = currentLabel ? `${this._title}: ${currentLabel}` : this._title;
    }
}

class HeadsetControls {
    constructor(menu, proxy) {
        this._proxy = proxy;
        this._syncing = false;

        this._battery = new BatteryItem();
        menu.addMenuItem(this._battery);
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._sidetone = new PopupMenu.PopupSwitchMenuItem('Sidetone', false);
        this._sidetone.connect('toggled', (_item, state) => {
            if (!this._syncing) this._proxy.SetSidetoneAsync(state).catch(reportError);
        });
        menu.addMenuItem(this._sidetone);

        this._autoOff = new ChoiceGroup(menu, 'Auto power-off', minutes =>
            this._proxy.SetAutoOffAsync(minutes).catch(reportError),
        );
        this._eq = new ChoiceGroup(menu, 'Equalizer', preset => this._proxy.SetEqAsync(preset).catch(reportError));
    }

    sync(status) {
        const proxy = this._proxy;
        const ready = status === 'ok';
        const muted = proxy.Muted === 1;

        this._battery.sync(proxy);

        this._syncing = true;
        this._sidetone.setToggleState(proxy.Sidetone === 1);
        this._syncing = false;
        this._sidetone.label.text = muted ? 'Sidetone (mic muted)' : 'Sidetone';
        this._sidetone.setSensitive(ready && !muted);

        this._autoOff.setChoices((proxy.AutoOffChoices ?? []).map(minutes => [minutes, autoOffLabel(minutes)]));
        this._autoOff.setCurrent(proxy.AutoOff);
        this._autoOff.item.setSensitive(ready);

        this._eq.setChoices(proxy.EqPresets ?? []);
        this._eq.setCurrent(proxy.Eq);
        this._eq.item.setSensitive(ready);
    }
}

const HeadsetToggle = GObject.registerClass(
    class HeadsetToggle extends QuickMenuToggle {
        _init(proxy) {
            super._init({
                title: 'HyperX',
                iconName: ICON,
                toggleMode: false,
            });
            this._proxy = proxy;
            this.connect('clicked', () => this.menu.open());
            this.menu.setHeader(ICON, TITLE);
            this._controls = new HeadsetControls(this.menu, proxy);
        }

        sync(status) {
            this.visible = TOGGLE_STATUSES.has(status);
            this.checked = status === 'ok';
            this.subtitle = this._proxy.Message || null;
            this._controls.sync(status);
        }
    },
);

class HoverMenu {
    constructor(source, proxy) {
        this._source = source;
        this._timeoutId = 0;
        this._menu = new PopupMenu.PopupMenu(source, 0.5, St.Side.TOP);
        Main.uiGroup.add_child(this._menu.actor);
        this._menu.actor.hide();
        this._manager = new PopupMenu.PopupMenuManager(source);
        this._manager.addMenu(this._menu);

        const title = new PopupMenu.PopupImageMenuItem(TITLE, ICON, {reactive: false, can_focus: false});
        this._menu.addMenuItem(title);
        this._controls = new HeadsetControls(this._menu, proxy);

        this._menu.connect('open-state-changed', (menu, open) => {
            if (open && !Main.panel.menuManager.activeMenu) Main.panel.menuManager.activeMenu = menu;
            else if (!open && Main.panel.menuManager.activeMenu === menu) Main.panel.menuManager.activeMenu = null;
        });
        source.connectObject(
            'enter-event',
            () => this._onEnter(),
            'leave-event',
            () => this._cancelTimeout(),
            this,
        );
    }

    sync(status) {
        this._controls.sync(status);
        if (status !== 'ok') this._menu.close();
    }

    _onEnter() {
        if (this._timeoutId || this._menu.isOpen || Main.panel.menuManager.activeMenu) return;
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HOVER_DELAY_MS, () => {
            this._timeoutId = 0;
            if (this._source.visible && !Main.panel.menuManager.activeMenu) this._menu.open();
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelTimeout() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }

    destroy() {
        this._cancelTimeout();
        this._source.disconnectObject(this);
        if (Main.panel.menuManager.activeMenu === this._menu) Main.panel.menuManager.activeMenu = null;
        this._manager.removeMenu(this._menu);
        this._menu.destroy();
    }
}

const HeadsetIndicator = GObject.registerClass(
    class HeadsetIndicator extends SystemIndicator {
        _init() {
            super._init();
            this._icon = this._addIndicator();
            this._icon.iconName = ICON;
            this._bar = new BatteryBar();
            this.add_child(this._bar);
            this._label = new St.Label({
                style_class: 'power-status',
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this._label);

            this._restartId = 0;
            this._cancellable = new Gio.Cancellable();
            this._proxy = new HeadsetProxy(
                Gio.DBus.session,
                BUS_NAME,
                OBJECT_PATH,
                (_proxy, error) => {
                    if (error && !error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        console.error(`HyperX Headset: ${error.message}`);
                    else if (!error) this._sync();
                },
                this._cancellable,
            );

            this._toggle = new HeadsetToggle(this._proxy);
            this.quickSettingsItems.push(this._toggle);
            this._hoverMenu = new HoverMenu(this, this._proxy);

            this._proxy.connectObject(
                'g-properties-changed',
                () => this._sync(),
                'notify::g-name-owner',
                () => this._sync(),
                this,
            );
            this.connect('destroy', () => this._onDestroy());
            this._sync();
        }

        _sync() {
            const proxy = this._proxy;
            const status = proxy.g_name_owner ? (proxy.Status ?? 'connecting') : 'stopped';
            const battery = proxy.Battery ?? -1;
            const charging = proxy.Charging === 1;
            const shown = status === 'ok' && battery >= 0;

            this._label.text = shown ? `${battery}%${charging ? ' ⚡' : ''}` : '';
            if (shown && battery <= LOW_BATTERY && !charging) this._label.add_style_class_name('hyperx-headset-low');
            else this._label.remove_style_class_name('hyperx-headset-low');
            this._bar.setLevel(battery);
            for (const actor of [this._icon, this._bar, this._label]) actor.visible = shown;
            this._syncIndicatorsVisible();

            if (status === 'stopped') this._scheduleRestart();
            else this._cancelRestart();

            this._toggle.sync(status);
            this._hoverMenu.sync(status);
        }

        _scheduleRestart() {
            if (this._restartId) return;
            this._restartId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, RESTART_INTERVAL_SECONDS, () => {
                this._proxy.RefreshAsync().catch(() => {});
                return GLib.SOURCE_CONTINUE;
            });
        }

        _cancelRestart() {
            if (this._restartId) {
                GLib.source_remove(this._restartId);
                this._restartId = 0;
            }
        }

        _onDestroy() {
            this._cancellable.cancel();
            this._cancelRestart();
            this._hoverMenu.destroy();
        }
    },
);

export default class HyperXHeadsetExtension extends Extension {
    enable() {
        this._indicator = new HeadsetIndicator();
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        this._indicator.quickSettingsItems.forEach(item => item.destroy());
        this._indicator.destroy();
        this._indicator = null;
    }
}
