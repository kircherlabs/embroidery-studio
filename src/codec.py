"""Shared browser/native conversion bridge. Coordinates in the studio are millimeters."""
import json
from pathlib import Path
import pyembroidery as emb
from pec_compat import correct_pec_origin

COMMANDS = {'stitch':emb.STITCH,'jump':emb.JUMP,'trim':emb.TRIM,'stop':emb.STOP,'color':emb.COLOR_CHANGE,'end':emb.END}
REVERSE = {v:k for k,v in COMMANDS.items()}

class BrotherReadPattern(emb.EmbPattern):
    def interpolate_duplicate_color_as_stop(self):
        """Classify every PEC pause, including adjacent stop/color-change events.

        The pinned reader normally waits for a sewing stitch before inspecting a
        color transition, so consecutive pauses overwrite its pending transition.
        Brother represents STOP as a repeated thread entry. Consume each pause in
        order; retain its coordinates and every instruction. This changes reading
        only, never encoded bytes, origin metadata or needle placement.
        """
        index = 0
        for stitch in self.stitches:
            if stitch[2] & emb.COMMAND_MASK != emb.COLOR_CHANGE:
                continue
            if index + 1 < len(self.threadlist) and self.threadlist[index] == self.threadlist[index + 1]:
                stitch[2] = (stitch[2] & ~emb.COMMAND_MASK) | emb.STOP
                del self.threadlist[index + 1]
            else:
                index += 1

def decode_file(path):
    pattern = emb.read(path, pattern=BrotherReadPattern()) if Path(path).suffix.lower() in ('.pes', '.pec') else emb.read(path)
    if pattern is None:
        raise ValueError('Unsupported or unreadable embroidery file.')
    events, color_index = [], 0
    threads = ['#%06x' % (t.color & 0xffffff) for t in pattern.threadlist] or ['#303b53']
    for x,y,raw in pattern.stitches:
        cmd = raw & emb.COMMAND_MASK
        if cmd not in REVERSE:
            raise ValueError('This file contains unsupported machine commands (%s).' % cmd)
        if cmd == emb.COLOR_CHANGE:
            color_index += 1
        events.append(dict(x=x/10,y=y/10,cmd=REVERSE[cmd],color=threads[min(color_index,len(threads)-1)],phase='machine',objectId=None))
        if len(events)>250000:
            raise ValueError('File exceeds 250,000 machine commands.')
    if Path(path).suffix.lower() in ('.pes', '.pec'):
        # Brother uses a design-local origin. PyEmbroidery exposes that prefix
        # as an initial jump; translate the whole decoded design into our hoop-
        # centered display frame, without changing any relative movement.
        moves = [e for e in events if e['cmd'] in ('stitch', 'jump')]
        if moves:
            cx = (min(e['x'] for e in moves) + max(e['x'] for e in moves)) / 2
            cy = (min(e['y'] for e in moves) + max(e['y'] for e in moves)) / 2
            for e in events:
                e['x'] = round(e['x'] - cx, 5) or 0.0
                e['y'] = round(e['y'] - cy, 5) or 0.0
    return events

def encode_file(payload, path):
    data = json.loads(payload) if isinstance(payload,str) else payload
    pattern = emb.EmbPattern()
    events = data['events']
    if not events:
        raise ValueError('There are no stitches to export.')
    pattern.metadata('name', data.get('name','Studio design')[:16])
    first = next((e for e in events if e['cmd']=='stitch'),None)
    if first is None:
        raise ValueError('There are no stitches to export.')
    pattern.add_thread(first['color'])
    positional = next((e for e in events if e['cmd'] in ('stitch', 'jump')), None)
    if Path(path).suffix.lower() in ('.pes', '.pec') and positional['cmd'] != 'jump':
        pattern.add_stitch_absolute(emb.JUMP, round(positional['x']*10), round(positional['y']*10))
    for e in events:
        if e['cmd']=='color':
            pattern.add_thread(e['color'])
        pattern.add_stitch_absolute(COMMANDS[e['cmd']], round(e['x']*10), round(e['y']*10))
    # The studio already places locks and enforces stitch length. Disable implicit locks.
    # Each writer supplies its own jump encoding limit (DST is only 12.1 mm).
    # Overriding that limit globally can silently wrap deltas in EXP/JEF.
    emb.write(pattern,path, {'version':6, 'max_stitch':70, 'explicit_trim':True, 'tie_on':emb.CONTINGENCY_TIE_ON_NONE, 'tie_off':emb.CONTINGENCY_TIE_OFF_NONE})
    if Path(path).suffix.lower() in ('.pes', '.pec'):
        target = Path(path)
        target.write_bytes(correct_pec_origin(target.read_bytes()))
    decoded = decode_file(path)
    if Path(path).suffix.lower() in ('.pes', '.pec'):
        # Compare/display actual decoded geometry in the input design's frame.
        # Only a constant translation changes; on-disk scale and needle deltas
        # are independently tested, including the hardware-verified fixture.
        needle = next(e for e in decoded if e['cmd'] == 'stitch')
        dx = round(first['x']*10)/10 - needle['x']
        dy = round(first['y']*10)/10 - needle['y']
        for e in decoded:
            e['x'] = round(e['x'] + dx, 5) or 0.0
            e['y'] = round(e['y'] + dy, 5) or 0.0
    return decoded
