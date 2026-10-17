"""Real codec integration: pinned vendored library, no pip installation required."""
import importlib.util
import json
import pathlib
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
(ROOT/'test-results').mkdir(exist_ok=True)
tempfile.tempdir=str(ROOT/'test-results')
sys.path.insert(0,str(ROOT/'vendor'/'pyembroidery.zip'))
spec=importlib.util.spec_from_file_location('codec', ROOT/'src'/'codec.py')
codec=importlib.util.module_from_spec(spec)
spec.loader.exec_module(codec)

class CodecTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload=json.loads(subprocess.check_output(['node',str(ROOT/'tests'/'fixture.mjs')],text=True))

    def test_supported_machine_formats_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            for ext in ['pes','pec','dst','exp','jef','vp3']:
                with self.subTest(format=ext):
                    path=str(pathlib.Path(directory)/('design.'+ext))
                    events=codec.encode_file(self.payload,path)
                    self.assertGreater(len(events),1500)
                    self.assertTrue(any(e['cmd']=='color' for e in events))
                    self.assertEqual(events[-1]['cmd'],'end')
                    xs=[e['x'] for e in events if e['cmd']=='stitch']
                    ys=[e['y'] for e in events if e['cmd']=='stitch']
                    source=[e for e in self.payload['events'] if e['cmd']=='stitch']
                    for axis,actual in [('x',xs),('y',ys)]:
                        self.assertAlmostEqual(min(actual), min(e[axis] for e in source), delta=.11)
                        self.assertAlmostEqual(max(actual), max(e[axis] for e in source), delta=.11)
                    self.assertEqual(sum(e['cmd']=='color' for e in events),sum(e['cmd']=='color' for e in self.payload['events']))
                    if ext=='pes':
                        data=pathlib.Path(path).read_bytes()
                        self.assertEqual(data[:8],b'#PES0060')
                        offset=struct.unpack('<I',data[8:12])[0]
                        self.assertEqual(data[offset:offset+3],b'LA:')
                        self.assertGreater(len(set(e['color'] for e in events)),2)

    def test_pes_coordinates_and_commands(self):
        payload={'name':'Golden','events':[
            dict(cmd='jump',x=-10,y=-5,color='#e5765e'),
            dict(cmd='stitch',x=-7,y=-5,color='#e5765e'),
            dict(cmd='stitch',x=-7,y=-2,color='#e5765e'),
            dict(cmd='trim',x=-7,y=-2,color='#e5765e'),
            dict(cmd='color',x=-7,y=-2,color='#536e55'),
            dict(cmd='jump',x=5,y=10,color='#536e55'),
            dict(cmd='stitch',x=7,y=10,color='#536e55'),
            dict(cmd='end',x=7,y=10,color='#536e55')]}
        with tempfile.TemporaryDirectory() as directory:
            events=codec.encode_file(payload,str(pathlib.Path(directory)/'golden.pes'))
            points=[(e['x'],e['y']) for e in events if e['cmd']=='stitch']
            self.assertEqual(points,[(-7,-5),(-7,-2),(7,10)])
            self.assertEqual(sum(e['cmd']=='color' for e in events),1)
            self.assertTrue(any(e['cmd']=='trim' for e in events))

    def test_empty_exports_rejected(self):
        with self.assertRaises(ValueError):
            codec.encode_file({'events':[]},'/tmp/empty.pes')

if __name__=='__main__':
    unittest.main()
