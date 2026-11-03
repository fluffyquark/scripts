#!/usr/bin/env python3
"""Decode QR images with OpenCV and check they contain the expected text.

    pip install opencv-python-headless
    python verify_qr.py https://qr.example.com/website website-*.png

Exit code 1 if any image fails. A pass here means one decoder read it, not that every phone will.
"""
import sys
import cv2

def decode(path):
    img = cv2.imread(path)
    out = []
    for name, det in (("classic", cv2.QRCodeDetector()), ("aruco", cv2.QRCodeDetectorAruco())):
        text, _, _ = det.detectAndDecode(img)
        out.append((name, text))
    return out

if __name__ == "__main__":
    expected, files = sys.argv[1], sys.argv[2:]
    bad = 0
    for f in files:
        res = decode(f)
        ok = [n for n, t in res if t == expected]
        print(f"{f}: {'PASS' if ok else 'FAIL'} ({', '.join(ok) or 'no decoder read it'})")
        bad += not ok
    sys.exit(1 if bad else 0)
