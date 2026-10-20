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
sys.path.insert(0,str(ROOT/'src'))
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

    def test_adjacent_stops_and_color_changes_keep_order_and_thread_colors(self):
        def event(cmd,x,color):
            return dict(cmd=cmd,x=x,y=0,color=color)
        payload={'name':'Pause order','events':[
            event('stitch',0,'#ff0000'),event('stitch',2,'#ff0000'),
            event('stop',2,'#ff0000'),event('color',2,'#0000ff'),
            event('stitch',4,'#0000ff'),event('stop',4,'#0000ff'),
            event('color',4,'#ff0000'),event('stitch',6,'#ff0000'),
            event('stop',6,'#ff0000'),event('stitch',8,'#ff0000'),event('end',8,'#ff0000')]}
        with tempfile.TemporaryDirectory() as directory:
            for ext in ['pes','pec']:
                with self.subTest(format=ext):
                    path=str(pathlib.Path(directory)/('pause.'+ext))
                    events=codec.encode_file(payload,path)
                    pauses=[e['cmd'] for e in events if e['cmd'] in ('stop','color')]
                    self.assertEqual(pauses,['stop','color','stop','color','stop'])
                    self.assertEqual([(e['x'],e['y']) for e in events if e['cmd']=='stitch'],[(0,0),(2,0),(4,0),(6,0),(8,0)])
                    if ext=='pes':
                        self.assertEqual([e['color'] for e in events if e['cmd']=='stitch'],['#ff0000','#ff0000','#0000ff','#ff0000','#ff0000'])

if __name__=='__main__':
    unittest.main()
