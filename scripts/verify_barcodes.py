"""Render the actual PDF fixtures and decode Code128 and QR at printer DPI."""
import json
import subprocess
from pathlib import Path
from PIL import Image
import zxingcpp

root = Path(__file__).resolve().parents[1]
source = root / 'build/qa/pdf'
output = root / 'build/qa/barcodes'
output.mkdir(parents=True, exist_ok=True)
results = []
for pdf in sorted(source.glob('*.pdf')):
    expected = 'VNX-AbCdEfGhIjKlMnOpQrSt' if pdf.stem.endswith('_standard_id') else 'VNX-Order_1234567890'
    for dpi in (203, 300, 600):
        prefix = output / f'{pdf.stem}-{dpi}'
        # Remove only this generated prefix so stale pages cannot satisfy a scan.
        for stale in output.glob(prefix.name + '-*.png'):
            stale.unlink()
        subprocess.run(['pdftoppm', '-r', str(dpi), '-png', str(pdf), str(prefix)], check=True, capture_output=True)
        images = sorted(output.glob(prefix.name + '-*.png'))
        decoded = set()
        decoded_qr = set()
        preprocessing = []
        for image in images:
            with Image.open(image) as original:
                grayscale = original.convert('L')
                # Code128
                codes = zxingcpp.read_barcodes(grayscale, formats=zxingcpp.BarcodeFormat.Code128)
                if not codes:
                    # Generic decoder fallback for undersampled 1D symbols.
                    enlarged = grayscale.resize((grayscale.width * 2, grayscale.height * 2), Image.Resampling.BILINEAR)
                    codes = zxingcpp.read_barcodes(enlarged, formats=zxingcpp.BarcodeFormat.Code128)
                    enlarged.close()
                    if codes:
                        preprocessing.append({'image': image.name, 'method': '2x bilinear upsampling'})
                decoded.update(code.text for code in codes)
                # QR: the payload must equal the same stable internal reference.
                qr_codes = zxingcpp.read_barcodes(grayscale, formats=zxingcpp.BarcodeFormat.QRCode)
                decoded_qr.update(code.text for code in qr_codes)
                grayscale.close()
        # The QR shares the barcode's internal reference (VNX-<id>).
        qr_ok = expected in decoded_qr
        success = expected in decoded and qr_ok
        results.append({
            'paper': pdf.stem, 'dpi': dpi, 'pages': len(images), 'expected': expected,
            'decoded': sorted(decoded), 'decodedQr': sorted(decoded_qr),
            'preprocessing': preprocessing, 'passed': success,
        })
        print(f'{pdf.stem} {dpi} DPI: {"PASS" if success else "FAIL"} (barcode={"ok" if expected in decoded else "miss"}, qr={"ok" if qr_ok else "miss"}) ({len(images)} pages)', flush=True)
if not results:
    raise SystemExit('Generate PDF fixtures with Flutter tests before decoding')
(output / 'decode-results.json').write_text(json.dumps(results, indent=2) + '\n')
if any(not result['passed'] for result in results):
    raise SystemExit('Barcode/QR decoding failed; inspect rendered artifacts')
