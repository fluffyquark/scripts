#!/usr/bin/env python3
"""Generate styled QR codes with open-source libraries (python-qrcode + Pillow).

    pip install "qrcode[pil]" pillow
    python make_qr.py https://qr.example.com/website --out website [--logo logo.png]

Writes <out>-plain.png, <out>-rounded.png and <out>-styled.png.
Always run verify_qr.py on the result before printing anything.
"""
import argparse
import qrcode
from qrcode.constants import ERROR_CORRECT_H, ERROR_CORRECT_M
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import RoundedModuleDrawer, SquareModuleDrawer
from qrcode.image.styles.colormasks import SolidFillColorMask, RadialGradiantColorMask


def build(data, ec):
    qr = qrcode.QRCode(error_correction=ec, box_size=16, border=4)  # border=4 is the spec'd quiet zone
    qr.add_data(data)
    qr.make(fit=True)
    return qr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("data")
    ap.add_argument("--out", default="qr")
    ap.add_argument("--logo", help="optional centre logo (PNG); keep it small, it eats error correction")
    a = ap.parse_args()

    # 1. Plain: the baseline everything else is compared against
    build(a.data, ERROR_CORRECT_M).make_image(fill_color="black", back_color="white").save(f"{a.out}-plain.png")

    # 2. Rounded modules, one dark solid colour on white: safe and looks deliberate
    build(a.data, ERROR_CORRECT_M).make_image(
        image_factory=StyledPilImage,
        module_drawer=RoundedModuleDrawer(),
        color_mask=SolidFillColorMask(back_color=(255, 255, 255), front_color=(8, 24, 48)),
    ).save(f"{a.out}-rounded.png")

    # 3. Rounded + dark gradient + optional logo. Level H because a logo destroys modules.
    kw = dict(
        image_factory=StyledPilImage,
        module_drawer=RoundedModuleDrawer(),
        color_mask=RadialGradiantColorMask(
            back_color=(255, 255, 255), center_color=(0, 90, 130), edge_color=(10, 20, 60)
        ),
    )
    if a.logo:
        kw["embedded_image_path"] = a.logo
    build(a.data, ERROR_CORRECT_H).make_image(**kw).save(f"{a.out}-styled.png")


if __name__ == "__main__":
    main()
