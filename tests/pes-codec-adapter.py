"""Test-only subprocess bridge to the production exporter (no reference writer)."""
import json
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'src'), str(ROOT/'vendor'/'pyembroidery.zip')]
from codec import encode_file
from pec_compat import correct_pec_origin

request = json.load(sys.stdin)
if request.get('repair'):
    sys.stdout.buffer.write(correct_pec_origin(bytes(request['bytes'])))
else:
    with tempfile.TemporaryDirectory(dir=ROOT/'test-results') as directory:
        path = pathlib.Path(directory)/('test.'+request.get('format', 'pes'))
        preview = encode_file(request['payload'], str(path))
        sys.stdout.write(json.dumps({'bytes':list(path.read_bytes()), 'preview':preview}))
