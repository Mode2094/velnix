from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
files=sorted((ROOT/'lib').rglob('*.dart'))
lines=['# جرد استاتيكي لمواضع التفاعل في الواجهات', '',
       'هذه الأرقام تعني وجود callbacks في الكود، **وليست إثباتاً على عمل الأزرار داخل التطبيق**.','',
       '| الملف | onPressed | onTap | onChanged | إجمالي مواضع التفاعل |', '|---|---:|---:|---:|---:|']
for f in files:
    s=f.read_text()
    hits=[len(re.findall(r'\b'+k+r'\s*:',s)) for k in ('onPressed','onTap','onChanged')]
    if sum(hits): lines.append(f"| `{f.relative_to(ROOT)}` | {hits[0]} | {hits[1]} | {hits[2]} | {sum(hits)} |")
lines.extend(['','## ملاحظات','- لا يمكن إثبات صلاحيات الوصول عبر البحث النصي عن زر. الخادم هو المرجع النهائي.','- يجب تنفيذ اختبارات Flutter widget وintegration على المقاسات المختلفة.'])
out=ROOT/'docs/26_UI_ACTION_INVENTORY_AR.md';out.write_text('\n'.join(lines)+'\n')
print('Dart files:',len(files),'inventory:',out)
