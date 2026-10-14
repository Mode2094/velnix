"""Render the actual PDF fixtures and decode Code128 at printer resolutions."""
import json
import subprocess
from pathlib import Path
from PIL import Image
import zxingcpp

root = Path(__file__).resolve().parents[1]
source = root / 'build/qa/pdf'
output = root / 'build/qa/barcodes'
output.mkdir(parents=True, exist_ok=True)
expected = 'VNX-Order_1234567890'
results = []
for pdf in sorted(source.glob('*.pdf')):
    expected = 'VNX-AbCdEfGhIjKlMnOpQrSt' if pdf.stem.endswith('_standard_id') else 'VNX-Order_1234567890'
    for dpi in (203, 300, 600):
        prefix = output / f'{pdf.stem}-{dpi}'
        subprocess.run(['pdftoppm', '-r', str(dpi), '-png', str(pdf), str(prefix)], check=True, capture_output=True)
        images = sorted(output.glob(prefix.name + '-*.png'))
        decoded = set()
        preprocessing = []
        for image in images:
            with Image.open(image) as original:
                grayscale = original.convert('L')
                codes = zxingcpp.read_barcodes(grayscale, formats=zxingcpp.BarcodeFormat.Code128)
                if not codes:
                    # Generic decoder fallback for undersampled 1D symbols; no payload hint is supplied.
                    enlarged = grayscale.resize((grayscale.width * 2, grayscale.height * 2), Image.Resampling.BILINEAR)
                    codes = zxingcpp.read_barcodes(enlarged, formats=zxingcpp.BarcodeFormat.Code128)
                    enlarged.close()
                    if codes:
                        preprocessing.append({'image': image.name, 'method': '2x bilinear upsampling'})
                decoded.update(code.text for code in codes)
                grayscale.close()
        success = expected in decoded
        results.append({'paper': pdf.stem, 'dpi': dpi, 'pages': len(images), 'expected': expected, 'decoded': sorted(decoded), 'preprocessing': preprocessing, 'passed': success})
        print(f'{pdf.stem} {dpi} DPI: {"PASS" if success else "FAIL"} ({len(images)} pages)', flush=True)
if not results:
    raise SystemExit('Generate PDF fixtures with Flutter tests before decoding')
(output / 'decode-results.json').write_text(json.dumps(results, indent=2) + '\n')
if any(not result['passed'] for result in results):
    raise SystemExit('Barcode decoding failed; inspect rendered artifacts')
