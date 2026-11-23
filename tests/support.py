import importlib.machinery
import importlib.util
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
