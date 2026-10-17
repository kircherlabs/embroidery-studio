"""Brother origin-prefix compatibility for the pinned PyEmbroidery writer.

The first long positioning pair doubles as PEC's origin prefix on Brother
machines. Keep subsequent stitch bytes intact; do not rescale needle positions.
"""
import struct


def pec_layout(data):
    if data[:4] == b'#PES':
        if len(data) < 12:
            raise ValueError('Truncated PES header.')
        pec = struct.unpack_from('<I', data, 8)[0]
    elif data[:8] == b'#PEC0001':
        pec = 8
    else:
        raise ValueError('Expected PES or PEC data.')
    block = pec + 512
    if data[pec:pec + 3] != b'LA:' or len(data) < block + 21:
        raise ValueError('Invalid PEC header.')
    length = int.from_bytes(data[block + 2:block + 5], 'little')
    end = block + length
    if data[block + 5:block + 8] != b'\x31\xff\xf0' or end > len(data) or length < 21:
        raise ValueError('Invalid PEC stitch block.')
    origin = block + 16
    if data[origin] & 0xf0 != 0x90 or data[origin + 2] & 0xf0 != 0x90:
        raise ValueError('PEC export lacks the initial long positioning pair.')
    return block, origin, end


def correct_pec_origin(data):
    """Return a copy with the four prefix bytes corrected, or reject bad framing.

    Decode independently of PyEmbroidery, starting AFTER the prefix. The prefix
    anchors the first head position, so zero participates in the stream bounds.
    """
    block, origin, end = pec_layout(data)
    at = origin + 4
    x = y = min_x = min_y = max_x = max_y = 0

    def coordinate():
        nonlocal at
        if at >= end:
            raise ValueError('Truncated PEC coordinate.')
        b = data[at]
        at += 1
        if b & 0x80:
            if b & 0x40 or at >= end:
                raise ValueError('Invalid PEC long coordinate.')
            value = ((b & 0x0f) << 8) | data[at]
            at += 1
            return value - 4096 if value >= 2048 else value
        return b - 128 if b >= 64 else b

    while at < end:
        if data[at] == 0xff:
            at += 1
            if at != end:
                raise ValueError('PEC terminator disagrees with stitch-block length.')
            break
        if data[at:at + 2] == b'\xfe\xb0':
            if at + 3 > end or data[at + 2] not in (1, 2):
                raise ValueError('Invalid PEC color change.')
            at += 3
            continue
        x += coordinate()
        y += coordinate()
        min_x, max_x = min(min_x, x), max(max_x, x)
        min_y, max_y = min(min_y, y), max(max_y, y)
    else:
        raise ValueError('PEC stream has no terminator.')
    width, height = struct.unpack_from('<HH', data, block + 8)
    if (max_x - min_x, max_y - min_y) != (width, height):
        raise ValueError('PEC dimensions disagree with encoded movement bounds.')
    if not (0 <= -min_x <= 2047 and 0 <= -min_y <= 2047):
        raise ValueError('PEC origin exceeds its signed 12-bit range.')
    result = bytearray(data)
    struct.pack_into('>HH', result, origin, 0x9000 | -min_x, 0x9000 | -min_y)
    return bytes(result)
