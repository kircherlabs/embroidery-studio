"""Shared browser/native conversion bridge. Coordinates in the studio are millimeters."""
import json
import pyembroidery as emb

COMMANDS = {'stitch':emb.STITCH,'jump':emb.JUMP,'trim':emb.TRIM,'stop':emb.STOP,'color':emb.COLOR_CHANGE,'end':emb.END}
REVERSE = {v:k for k,v in COMMANDS.items()}

def decode_file(path):
    pattern = emb.read(path)
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
    for e in events:
        if e['cmd']=='color':
            pattern.add_thread(e['color'])
        pattern.add_stitch_absolute(COMMANDS[e['cmd']], round(e['x']*10), round(e['y']*10))
    # The studio already places locks and enforces stitch length. Disable implicit locks.
    # Each writer supplies its own jump encoding limit (DST is only 12.1 mm).
    # Overriding that limit globally can silently wrap deltas in EXP/JEF.
    emb.write(pattern,path, {'version':6, 'max_stitch':70, 'explicit_trim':True, 'tie_on':emb.CONTINGENCY_TIE_ON_NONE, 'tie_off':emb.CONTINGENCY_TIE_OFF_NONE})
    return decode_file(path)
