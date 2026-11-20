#!/usr/bin/env python3
"""Check install-time ZIP constraints not covered by APK signature verification."""
import pathlib, struct, sys, zipfile
p=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(p) as z, p.open('rb') as raw:
    if z.testzip() is not None:raise SystemExit('APK contains a corrupt ZIP member')
    for name in ['AndroidManifest.xml','classes.dex','resources.arsc']:
        if name not in z.namelist():raise SystemExit('Missing APK member: '+name)
    resource=z.getinfo('resources.arsc')
    # Android 11+ rejects apps targeting API 30+ if this table is compressed.
    if resource.compress_type!=zipfile.ZIP_STORED:
        raise SystemExit('Android install constraint: resources.arsc must be stored without compression')
    raw.seek(resource.header_offset)
    header=raw.read(30)
    if header[:4]!=b'PK\x03\x04':raise SystemExit('Invalid local ZIP header')
    name_length,extra_length=struct.unpack_from('<HH',header,26)
    offset=resource.header_offset+30+name_length+extra_length
    if offset%4:raise SystemExit('Android install constraint: resources.arsc must be aligned on 4 bytes')
    if z.read('classes.dex')[:4]!=b'dex\n':raise SystemExit('Invalid Android DEX')
print('APK packaging verified: uncompressed, 4-byte-aligned resources.arsc; valid ZIP and DEX.')
