import argparse
import importlib.machinery
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "bin" / "hyperx-headset"


def load_script():
    loader = importlib.machinery.SourceFileLoader("hyperx_headset", str(SCRIPT))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


hh = load_script()


def captured(hex_bytes):
    return bytes.fromhex(hex_bytes).ljust(hh.REPORT_LEN, b"\0")


class PacketTests(unittest.TestCase):
    def test_query_is_a_64_byte_output_report_with_the_command(self):
        packet = hh.get_packet(hh.CMD_BATTERY)
        self.assertEqual(len(packet), 64)
        self.assertEqual(packet[:6], bytes.fromhex("0c 02 03 01 00 06"))
        self.assertFalse(any(packet[6:]))

    def test_setting_clears_the_query_flag_and_carries_the_value(self):
        self.assertEqual(hh.set_packet(hh.CMD_SET_SIDETONE, True)[:7], bytes.fromhex("0c 02 03 00 00 0d 01"))

    def test_auto_off_is_big_endian_seconds(self):
        self.assertEqual(hh.auto_off_packet(20)[5:8], bytes.fromhex("4a 04 b0"))
        self.assertEqual(hh.auto_off_packet(0)[5:8], bytes.fromhex("4a 00 00"))

    def test_eq_band_gain_is_signed_hundredths_of_a_db(self):
        first, *_ = hh.eq_packets([-2] + [0] * 9)
        self.assertEqual(first[5:9], bytes.fromhex("5f 00 ff 38"))

    def test_eq_gain_is_clamped_to_12_db(self):
        packets = list(hh.eq_packets([0, 12.5] + [0] * 8))
        self.assertEqual(len(packets), 10)
        self.assertEqual(packets[1][5:9], bytes.fromhex("5f 01 04 b0"))


class ParseTests(unittest.TestCase):
    def test_battery_response_captured_from_the_dongle(self):
        self.assertEqual(hh.parse_report(captured("0c 02 03 01 00 06 50 0f 7f")), {"battery": 80})

    def test_connected_means_value_2(self):
        self.assertEqual(hh.parse_report(captured("0c 02 03 01 00 02 02")), {"connected": True})
        self.assertEqual(hh.parse_report(captured("0c 02 03 01 00 02 00")), {"connected": False})

    def test_ff_means_the_headset_sent_no_data(self):
        self.assertEqual(hh.parse_report(captured("0c 02 03 01 00 06 ff")), {})

    def test_auto_off_response_is_converted_to_minutes(self):
        self.assertEqual(hh.parse_report(captured("0c 02 03 01 00 4b 04 b0")), {"auto_off": 20})

    def test_notifications(self):
        self.assertEqual(hh.parse_report(captured("0d 00 00 00 01 37")), {"battery": 55})
        self.assertEqual(hh.parse_report(captured("0d 00 00 00 0a 01")), {"charging": 1})
        self.assertEqual(hh.parse_report(captured("0d 00 00 00 0c 00")), {"connected": False})

    def test_mic_report(self):
        self.assertEqual(hh.parse_report(bytes.fromhex("05 02")), {"muted": True})
        self.assertEqual(hh.parse_report(bytes.fromhex("05 00")), {"muted": False})

    def test_answers_matches_the_echoed_command(self):
        report = captured("0c 02 03 01 00 16 00")
        self.assertTrue(hh.answers(report, hh.CMD_SIDETONE))
        self.assertFalse(hh.answers(report, hh.CMD_BATTERY))


class InputTests(unittest.TestCase):
    def test_parse_gains_accepts_ten_values_within_12_db(self):
        self.assertEqual(hh.parse_gains("6,5,3,1,0,0,0,0,0,-1.5"), [6, 5, 3, 1, 0, 0, 0, 0, 0, -1.5])

    def test_parse_gains_rejects_bad_input(self):
        for text in ("1,2", "13,0,0,0,0,0,0,0,0,0", "a,b,c,d,e,f,g,h,i,j"):
            with self.subTest(text=text), self.assertRaises(argparse.ArgumentTypeError):
                hh.parse_gains(text)

    def test_config_gains_from_a_preset_or_a_custom_list(self):
        self.assertEqual(hh.config_gains({"eq": "flat"}), (0,) * 10)
        self.assertEqual(hh.config_gains({"eq": [1] * 10}), [1] * 10)
        self.assertIsNone(hh.config_gains({"eq": "unknown"}))
        self.assertIsNone(hh.config_gains({}))


if __name__ == "__main__":
    unittest.main()
