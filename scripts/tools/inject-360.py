"""Mark an MP4 as a 360 video, so YouTube and VR players wrap it round the viewer.

Without this, an equirectangular video plays as a flat, stretched rectangle.
It writes Google's Spherical Video V1 metadata: an XML block in a `uuid` box
inside the video track. Every major player and uploader reads it.

    python scripts/tools/inject-360.py in.mp4 out.mp4

The input must have its `moov` box after `mdat` (ffmpeg's default without
-movflags +faststart). Growing `moov` then moves no media data, so no chunk
offsets need rewriting - which is the part of MP4 editing that goes wrong.
"""
import struct
import sys

SPHERICAL_UUID = bytes.fromhex('ffcc8263f8554a938814587a02521fdd')
XML = (
    '<?xml version="1.0"?>'
    '<rdf:SphericalVideo xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" '
    'xmlns:GSpherical="http://ns.google.com/videos/1.0/spherical/">'
    '<GSpherical:Spherical>true</GSpherical:Spherical>'
    '<GSpherical:Stitched>true</GSpherical:Stitched>'
    '<GSpherical:StitchingSoftware>Unreal Engine Movie Render Queue</GSpherical:StitchingSoftware>'
    '<GSpherical:ProjectionType>equirectangular</GSpherical:ProjectionType>'
    '</rdf:SphericalVideo>'
).encode('utf-8')


def boxes(data, start, end):
    """(type, offset, size, header) for each box in data[start:end]."""
    at = start
    while at < end:
        size, kind = struct.unpack('>I4s', data[at:at + 8])
        header = 8
        if size == 1:
            size = struct.unpack('>Q', data[at + 8:at + 16])[0]
            header = 16
        elif size == 0:
            size = end - at
        yield kind.decode('latin-1'), at, size, header
        at += size


def main(src, dst):
    data = bytearray(open(src, 'rb').read())
    top = list(boxes(data, 0, len(data)))
    order = [k for k, *_ in top]
    if 'moov' not in order or 'mdat' not in order:
        sys.exit('not an MP4 with moov and mdat')
    if order.index('moov') < order.index('mdat'):
        sys.exit('moov is before mdat (faststart); re-encode without +faststart')

    _, moov_at, moov_size, moov_head = next(b for b in top if b[0] == 'moov')
    video_trak = None
    for kind, at, size, head in boxes(data, moov_at + moov_head, moov_at + moov_size):
        if kind != 'trak':
            continue
        # The video track is the one whose handler says 'vide'.
        if b'vide' in data[at:at + size][:4096] or b'hdlrvide' in data[at:at + size]:
            video_trak = (at, size, head)
            break
    if video_trak is None:
        sys.exit('no video track found')

    payload = SPHERICAL_UUID + XML
    box = struct.pack('>I4s', 8 + len(payload), b'uuid') + payload
    trak_at, trak_size, trak_head = video_trak
    if trak_head != 8 or moov_head != 8:
        sys.exit('64-bit box sizes are not handled')

    insert_at = trak_at + trak_size
    data[insert_at:insert_at] = box
    struct.pack_into('>I', data, trak_at, trak_size + len(box))
    struct.pack_into('>I', data, moov_at, moov_size + len(box))
    open(dst, 'wb').write(data)
    print('wrote %s  (+%d bytes of spherical metadata in the video track)' % (dst, len(box)))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
