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
lines.extend(['','## حدود الجرد والتحقق','- لا يمكن إثبات صلاحيات الوصول عبر البحث النصي عن زر. الخادم هو المرجع النهائي.','- مصفوفتا demo وlive تختبران الشاشات المرئية لكل دور على عشرة عروض وتكبير 1 و2.\n- live_actions_test يختبر إرسال نموذج كل دور وإعادة محاولة مستقرة وحفظ الإعدادات وحالات الخطأ ببوابة محقونة.\n- تسجيل الدخول وGoogle وإذن FCM وطباعة الجهاز والإرسال لشركة حقيقية تتطلب integration خارجي؛ callbacks أعلاه لا تثبتها.'])
out=ROOT/'docs/SCREEN_AND_BUTTON_AUDIT.md'
manual=''
if out.exists() and '## مراجعة المسارات' in out.read_text():
    manual='\n## مراجعة المسارات'+out.read_text().split('## مراجعة المسارات',1)[1]
out.write_text('\n'.join(lines)+'\n'+manual)
print('Dart files:',len(files),'inventory:',out)
