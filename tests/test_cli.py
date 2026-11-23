import socket

import pytest
from support import captured, hh


@pytest.fixture
def dongle():
    ours, headset = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET)
    ours.setblocking(False)
    device = hh.Dongle.__new__(hh.Dongle)
    device.path, device.fd = "/dev/hidraw-test", ours.fileno()
    yield device, headset
    ours.close()
    headset.close()


def queue(headset, *reports):
    for report in reports:
        headset.send(captured(report))


def test_request_sends_the_query_and_returns_the_answer(dongle):
    device, headset = dongle
    queue(headset, "0c 02 03 01 00 06 50")
    assert device.request(hh.CMD_BATTERY) == {"battery": 80}
    assert headset.recv(64) == hh.get_packet(hh.CMD_BATTERY)


def test_request_keeps_events_that_arrive_before_the_answer(dongle):
    device, headset = dongle
    queue(headset, "0d 00 00 00 0a 01", "0c 02 03 01 00 06 50")
    assert device.request(hh.CMD_BATTERY) == {"charging": 1, "battery": 80}


def test_request_gives_up_when_the_dongle_does_not_answer(dongle):
    device, _ = dongle
    assert device.request(hh.CMD_BATTERY, timeout=0.05) == {}


def test_status_reads_everything_from_a_connected_headset(dongle):
    device, headset = dongle
    queue(
        headset,
        "0c 02 03 01 00 02 02",
        "0c 02 03 01 00 06 50",
        "0c 02 03 01 00 48 00",
        "0c 02 03 01 00 04 00",
        "0c 02 03 01 00 16 01",
        "0c 02 03 01 00 4b 04 b0",
    )
    assert device.status() == {
        "connected": True,
        "battery": 80,
        "charging": 0,
        "muted": False,
        "sidetone": True,
        "auto_off": 20,
    }
    queries = [headset.recv(64)[5] for _ in hh.STATUS_QUERIES]
    assert queries == list(hh.STATUS_QUERIES)


def test_status_stops_after_the_first_query_when_the_headset_is_off(dongle):
    device, headset = dongle
    queue(headset, "0c 02 03 01 00 02 00")
    assert device.status() == {"connected": False}
    headset.recv(64)
    headset.setblocking(False)
    with pytest.raises(BlockingIOError):
        headset.recv(64)


def test_texts():
    assert hh.battery_text({"battery": 80, "charging": 1}) == "80% (charging)"
    assert hh.battery_text({"battery": 80, "charging": 0}) == "80%"
    assert hh.battery_text({}) == "?"
    assert hh.auto_off_text(0) == "never"
    assert hh.auto_off_text(30) == "30 min"
    assert hh.eq_text({"eq": "vocal"}) == "Vocal"
    custom = {"eq": [6, 5, 3, 1, 0, 0, 0, 0, 0, -1.5]}
    assert hh.eq_text(custom) == "Custom (+6, +5, +3, +1, +0, +0, +0, +0, +0, -1.5 dB)"
    assert hh.eq_text({}).startswith("unknown")


@pytest.mark.parametrize(
    ("state", "expected"),
    [
        ({}, "The dongle did not reply"),
        ({"connected": False}, "Headset is off or out of range."),
        ({"connected": True}, "usbcore.quirks=03f0:02cc:r"),
        (
            {"connected": True, "battery": 80, "charging": 1, "muted": True, "sidetone": False, "auto_off": 20},
            "  Battery:         80% (charging)\n"
            "  Microphone:      muted\n"
            "  Sidetone:        off\n"
            "  Auto power-off:  20 min\n",
        ),
    ],
)
def test_print_status(capsys, state, expected):
    hh.print_status("/dev/hidraw-test", state, {})
    output = capsys.readouterr().out
    assert output.startswith("HyperX Cloud III S Wireless (/dev/hidraw-test)\n")
    assert expected in output
