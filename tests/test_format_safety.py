"""Actual six-format needles, pauses, headers and safety guards; no hardware claims."""
import pathlib
import sys
import tempfile
import unittest
import struct
import math

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'src'), str(ROOT/'vendor'/'pyembroidery.zip')]
import codec


def event(cmd, x=0, y=0, color='#102080'):
    return dict(cmd=cmd, x=x, y=y, color=color)


def native_points(data, fmt):
    """Independent test decoder for EXP/JEF needle deltas, not pyembroidery."""
    x = y = 0
    points = []
    i = struct.unpack_from('<I', data, 0)[0] if fmt == 'jef' else 0
    signed = lambda b: b-256 if b >= 128 else b
    while i+1 < len(data):
        a, b = data[i:i+2]; i += 2
        if a != 0x80:
            x += signed(a); y -= signed(b)
            points.append((x/10, y/10)); continue
        if fmt == 'jef' and b == 0x10:
            break
        if i+1 >= len(data):
            break
        dx, dy = map(signed, data[i:i+2]); i += 2
        if (fmt == 'exp' and b == 4) or (fmt == 'jef' and b == 2):
            x += dx; y -= dy
    return points


class FormatSafetyTests(unittest.TestCase):
    def run_export(self, events, fmt):
        with tempfile.TemporaryDirectory(dir=ROOT/'test-results') as directory:
            path = pathlib.Path(directory)/('safety.'+fmt)
            decoded = codec.encode_file({'name':'Format safety','events':events}, str(path))
            return decoded, path.read_bytes()

    def test_asymmetric_geometry_and_real_color_order_in_all_six_formats(self):
        # Upright, right-facing F, off the origin, followed by a disconnected color.
        points = [(-9,-7),(-9,-3),(-9,1),(-9,-3),(-5,-3),(-9,-3),(-9,-7),(-4,-7)]
        events = [event('jump',*points[0])] + [event('stitch',*p) for p in points]
        events += [event('trim',*points[-1]),event('color',*points[-1], '#df2060'),event('jump',20,15,'#df2060'),event('stitch',20,15,'#df2060'),event('stitch',24,17,'#df2060'),event('end',24,17,'#df2060')]
        wanted = points + [(20,15),(24,17)]
        for fmt in ('pes','pec','dst','exp','jef','vp3'):
            with self.subTest(format=fmt):
                decoded, data = self.run_export(events, fmt)
                self.assertEqual([(e['x'],e['y']) for e in decoded if e['cmd']=='stitch'],wanted)
                self.assertEqual(sum(e['cmd']=='color' for e in decoded),1)
                self.assertEqual(decoded[-1]['cmd'],'end')
                self.assertEqual((min(x for x,y in wanted),max(x for x,y in wanted),min(y for x,y in wanted),max(y for x,y in wanted)),(-9,24,-7,17))
                if fmt in ('exp','jef'):
                    self.assertEqual(native_points(data,fmt),wanted)

    def test_vp3_each_color_block_starts_at_absolute_axes_and_origin(self):
        for origin in [(0,30),(30,0),(0,0)]:
            events=[event('jump',20,20),event('stitch',20,20),event('stitch',22,22),event('color',22,22,'#df2060'),event('jump',*origin,'#df2060'),event('stitch',*origin,'#df2060'),event('stitch',origin[0]+3,origin[1]+2,'#df2060'),event('end',origin[0]+3,origin[1]+2,'#df2060')]
            decoded,_=self.run_export(events,'vp3')
            self.assertEqual([(e['x'],e['y']) for e in decoded if e['cmd']=='stitch'],[(20,20),(22,22),origin,(origin[0]+3,origin[1]+2)])

    def test_jumps_are_split_without_wrapping_exp_jef_and_dst(self):
        events=[event('jump',-35,-20),event('stitch',-35,-20),event('trim',-35,-20),event('jump',45,35),event('stitch',45,35),event('stitch',48,36),event('end',48,36)]
        for fmt in ('exp','jef','dst'):
            with self.subTest(format=fmt):
                decoded,data=self.run_export(events,fmt)
                self.assertEqual([(e['x'],e['y']) for e in decoded if e['cmd']=='stitch'],[(-35,-20),(45,35),(48,36)])
                prev=(0,0)
                for e in decoded:
                    if e['cmd'] in ('jump','stitch'):
                        self.assertLessEqual(abs(e['x']-prev[0]),12.71)
                        self.assertLessEqual(abs(e['y']-prev[1]),12.71)
                        prev=(e['x'],e['y'])

    def test_pause_encodings_and_rejection_of_lost_vp3_stops(self):
        events=[event('stitch'),event('stop'),event('stitch',2),event('color',2,0,'#ff4080'),event('stitch',4,0,'#ff4080'),event('end',4,0,'#ff4080')]
        for fmt in ('pes','pec','jef','dst','exp'):
            decoded,_=self.run_export(events,fmt)
            expected=['color','color'] if fmt in ('dst','exp') else ['stop','color']
            self.assertEqual([e['cmd'] for e in decoded if e['cmd'] in ('stop','color')],expected)
        with self.assertRaisesRegex(ValueError,'standalone machine stops'):
            self.run_export(events,'vp3')

    def test_jef_legacy_header_guard_and_valid_small_header(self):
        events=[event('jump',-99,-99),event('stitch',-99,-99),event('jump',99,99),event('stitch',99,99),event('end',99,99)]
        _,data=self.run_export(events,'jef')
        self.assertEqual(struct.unpack_from('<I',data,32)[0],4)
        for point in events[2:]:
            point['y']=110
        with self.assertRaisesRegex(ValueError,'hoop header'):
            self.run_export(events,'jef')

    def test_palette_block_limits_bad_commands_and_unimplemented_writers(self):
        for fmt in ('pes','pec','vp3'):
            events=[event('stitch')]+[event('color') for _ in range(255)]+[event('end')]
            with self.assertRaisesRegex(ValueError,'color / pause blocks'):
                self.run_export(events,fmt)
        for fmt in ('hus','vip'):
            with self.assertRaisesRegex(ValueError,'No tested export writer'):
                self.run_export([event('stitch'),event('end')],fmt)
        for events in ([event('stitch',math.inf),event('end')],[event('laser'),event('end')]):
            with self.assertRaisesRegex(ValueError,'Invalid'):
                self.run_export(events,'pes')


if __name__=='__main__':
    unittest.main()
