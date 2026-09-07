# النشر على خادم افتراضي (VPS)

دليل كامل لنشر منصة الرصد بشهادة HTTPS تلقائية، على **Hostinger VPS** أو
**DigitalOcean Droplet** أو أي خادم Ubuntu آخر بصلاحية جذر.

الخطوات واحدة عند الجميع: يختلف **شكل لوحة التحكم في المرحلة ١ فقط**، وما
بعدها متطابق حرفياً لأنه يجري داخل الخادم لا في لوحة المزوّد.

---

## أولاً: ما نوع الاستضافة التي تصلح؟

| النوع | يصلح؟ | لماذا |
|---|---|---|
| **VPS / خادم افتراضي بصلاحية جذر** | ✅ | يشغّل Docker، وهو ما تحتاجه المنصة |
| استضافة مشتركة (Shared / Premium / Business) | ❌ | PHP و MySQL فقط، وتقتل العمليات الدائمة |
| «Cloud Hosting» عند بعض المزوّدين | ❌ | استضافة مشتركة بموارد أكبر، لا خادم |
| منصات PaaS (App Platform وشبيهاتها) | ⚠️ | تعمل لكن بضعف التكلفة، وتحتاج إعداداً جديداً |

المنصة تحتاج أربعة أشياء لا توفّرها الاستضافة المشتركة: **Node.js 20.11+**
يعمل كخادم دائم، و**PostgreSQL 16**، و**Redis 7**، و**عملية خلفية دائمة**
هي التي تنفّذ الاستخراج. النقطة الأخيرة وحدها كافية للاستبعاد.

> **تنبيه على Redis:** إعداد `noeviction` في ملف compose ليس تفصيلاً. بدونه
> يحذف Redis مهام استخراج منتظرة عند امتلاء الذاكرة، فتختفي العمليات بلا
> خطأ ولا أثر. أي بديل مُدار لا يسمح بضبط هذه السياسة غير صالح هنا.

---

## ما جهّزناه في المشروع

| الملف | دوره |
|---|---|
| `docker-compose.prod.yml` | ملف إنتاجي **مستقل** — لا منفذ مكشوف إلا 80 و443 |
| `deploy/Caddyfile` | وكيل عكسي بشهادة Let's Encrypt تُطلب وتُجدَّد تلقائياً |
| `deploy/dc.sh` | اختصار أمر compose الطويل — يمنع تشغيل ملف التطوير بالغلط |
| `deploy/backup.sh` | نسخة احتياطية مع حذف القديم |
| `.env.production.example` | قالب متغيرات الإنتاج |
| `/api/health` | مسار فحص صحّة يقيس القاعدة و Redis معاً |

---

## المرحلة ١ — إنشاء الخادم

### ١-١ ولّد مفتاح SSH على جهازك (قبل إنشاء الخادم)

المزوّدان يطلبان المفتاح **أثناء** إنشاء الخادم، فجهّزه أولاً. في PowerShell
على جهازك:

```powershell
ssh-keygen -t ed25519 -C "monitoring-deploy"
```

اضغط Enter ثلاث مرات (مسار افتراضي، بلا عبارة مرور). ثم اعرض **المفتاح
العام** وانسخه:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

> لديك مفتاح من قبل؟ اعرضه بالأمر الثاني وحده ولا تولّد جديداً — التوليد فوق
> مفتاح قائم يُبطل وصولك إلى أي خادم يستعمله.

### ١-٢ أنشئ الخادم

**المواصفات المطلوبة عند أي مزوّد:**

| البند | القيمة |
|---|---|
| نظام التشغيل | **Ubuntu 24.04 LTS** |
| الذاكرة | **2 GB** حدّاً أدنى، و**4 GB** أريح |
| القرص | 40 GB فأكثر |
| الصلاحية | **جذر (root)** — شرط لا بديل عنه |
| الموقع | الأقرب جغرافياً لمستخدميكم |

**عن الذاكرة:** بناء التطبيق داخل Docker يستهلك ذاكرة كبيرة. على 2 GB أضف
ملف التبديل في المرحلة ١-٥ وإلا قد يُقتل البناء بلا رسالة مفهومة. مع 4 GB
قد لا تحتاجه — لكن إضافته لا تضرّ.

#### إن كنت على Hostinger

من **hPanel ← VPS ← Create / Manage**:

| الحقل | اختر |
|---|---|
| Plan | **KVM 1** فأعلى (ذاكرتها 4 GB عادةً — مريحة للبناء) |
| Location | **Frankfurt** أو **Vilnius** — الأقرب للمنطقة |
| OS / Template | **Ubuntu 24.04** — أو **Ubuntu 24.04 with Docker** إن توفّر |
| SSH Key | الصق مفتاحك من ١-١، أو أضفه من **VPS ← SSH Keys** |
| Panel | **بلا لوحة تحكم** — لا تختر cPanel ولا CyberPanel |

اختيار قالب فيه Docker مسبقاً يُغنيك عن **المرحلة ٢** كاملة.

> **لا تختر لوحة تحكم** مثل cPanel أو CyberPanel أو Plesk: تحجز المنافذ 80
> و443 لخادمها، فيفشل Caddy في الاستماع عليهما، ولا تحصل على شهادة.

#### إن كنت على DigitalOcean

من **Create ← Droplets**:

| الحقل | اختر |
|---|---|
| Region | **Frankfurt (FRA1)** |
| Image | **Ubuntu 24.04 (LTS) x64** |
| Droplet Type | **Basic — Regular** |
| Size | **2 GB / 1 vCPU** (≈12$) أو **4 GB / 2 vCPU** (≈24$) |
| Authentication | **SSH Key** ← الصق مفتاحك من ١-١ |
| Hostname | `monitoring` |

بعد الإنشاء انسخ **IP** الخادم من اللوحة — تحتاجه في الخطوة التالية.

### ١-٣ ادخل إلى الخادم

من PowerShell على جهازك (استبدل العنوان بـ IP خادمك):

```powershell
ssh root@203.0.113.10
```

### ١-٤ أنشئ مستخدماً غير الجذر

العمل اليومي بحساب `root` يعني أن أي خطأ مطبعي في أمر حذف يمسح النظام.

```bash
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/
```

اخرج وادخل بالحساب الجديد:

```bash
exit
```

```powershell
ssh deploy@203.0.113.10
```

### ١-٥ ملف التبديل (مهم على خادم 2 GB)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

تأكّد:

```bash
free -h
```

يجب أن يظهر سطر `Swap` بحجم 2Gi.

### ١-٦ الجدار الناري

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

المفتوح ثلاثة منافذ فقط. قاعدة البيانات و Redis لا تُنشران على الشبكة إطلاقاً في ملف compose الإنتاجي — لا يحتاجان قاعدة جدار لأنهما غير مرئيين أصلاً.

> **حصر الوصول بجهتكم:** إن كانت المنصة داخلية بالكامل، اسمح بالمنفذ 443 من
> نطاق عناوين مؤسستكم وحده. عندها لا يصل الموقع أحد من خارج شبكتكم حتى لو
> عرف النطاق. على Hostinger: **hPanel ← VPS ← Firewall**. على DigitalOcean:
> **Networking ← Firewalls**. أو بـ ufw من داخل الخادم.
>
> ولا تجمع بين جدار اللوحة و ufw معاً: منعٌ من طبقتين يصعب تشخيصه لاحقاً،
> إذ تفتح المنفذ في إحداهما فيبقى مغلقاً في الأخرى بلا رسالة تدلّك.

### ١-٧ التحديثات الأمنية التلقائية

```bash
sudo apt update && sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

---

## المرحلة ٢ — تثبيت Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

**اخرج وادخل من جديد** حتى تسري عضوية المجموعة:

```bash
exit
```

```powershell
ssh deploy@203.0.113.10
```

تأكّد أن Docker يعمل بلا `sudo`:

```bash
docker run --rm hello-world
```

---

## المرحلة ٣ — النطاق

### ٣-١ سجل DNS

عند مزوّد نطاقك، أضف سجلاً:

| النوع | الاسم | القيمة | TTL |
|---|---|---|---|
| A | `monitoring` (أو `@` للنطاق الجذر) | IP الخادم | 3600 |

### ٣-٢ تأكّد أن الانتشار تمّ **قبل** المتابعة

```bash
dig +short monitoring.example.gov.sa
```

يجب أن يظهر IP خادمك. **لا تتابع قبل ذلك:** Caddy يطلب الشهادة عند أول إقلاع، ولـ Let's Encrypt حدّ لعدد المحاولات الفاشلة أسبوعياً.

---

## المرحلة ٤ — جلب المشروع

المستودع خاص، فيحتاج الخادم مفتاحاً ليقرأ منه.

### ٤-١ ولّد مفتاح نشر على الخادم

```bash
ssh-keygen -t ed25519 -C "server-monitoring" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

### ٤-٢ أضفه في GitHub

انسخ المفتاح الظاهر، ثم في المستودع على GitHub:

**Settings ← Deploy keys ← Add deploy key**

- Title: `خادم المنصة — monitoring`
- Key: الصق المفتاح
- **Allow write access: اتركه فارغاً** — الخادم يقرأ فقط ولا يدفع شيئاً

### ٤-٣ استنسخ المشروع

```bash
cd ~
git clone git@github.com:khaledalrefaeide2-alt/Boot.git
cd Boot/platform
git checkout claude/social-media-monitoring-platform-45iz0q
```

---

## المرحلة ٥ — متغيرات البيئة

### ٥-١ انسخ القالب

```bash
cp .env.production.example .env.production
```

### ٥-٢ ولّد الأسرار

```bash
echo "SESSION_SECRET=$(openssl rand -base64 48)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)"
```

انسخ السطرين — ستلصقهما بعد قليل.

### ٥-٣ حرّر الملف

```bash
nano .env.production
```

املأ على الأقل:

```ini
APP_DOMAIN="monitoring.example.gov.sa"
ACME_EMAIL="it@example.gov.sa"

POSTGRES_PASSWORD="<الملصوق من الأمر السابق>"
SESSION_SECRET="<الملصوق من الأمر السابق>"

APIFY_TOKEN="<الرمز من console.apify.com>"

SEED_OWNER_EMAIL="khaled.alrefaei.de2@gmail.com"
SEED_OWNER_NAME="خالد الرفاعي"
SEED_OWNER_PASSWORD="<كلمة مرور قوية للدخول الأول>"
```

للحفظ في nano: `Ctrl+O` ثم Enter ثم `Ctrl+X`.

### ٥-٤ أغلق الملف على غيرك

```bash
chmod 600 .env.production
ls -l .env.production
```

يجب أن تكون الصلاحيات `-rw-------`. الملف يحمل كلمة مرور القاعدة وسرّ الجلسات ورمز Apify، وهو مستثنى من Git فلا يُرفع أبداً.

---

## المرحلة ٦ — النشر

```bash
chmod +x deploy/*.sh
./deploy/dc.sh up -d --build
```

البناء الأول يستغرق **من خمس إلى خمس عشرة دقيقة** — يُنزّل الصور ويثبّت 358 حزمة ويبني التطبيق. تابع التقدّم:

```bash
./deploy/dc.sh logs -f
```

اخرج من متابعة السجل بـ `Ctrl+C` (هذا يوقف المتابعة فقط، لا الخدمات).

---

## المرحلة ٧ — التحقق

### ٧-١ كل الحاويات تعمل

```bash
./deploy/dc.sh ps
```

يجب أن ترى خمس حاويات: `mm_caddy`, `mm_app`, `mm_worker`, `mm_postgres`, `mm_redis` — وحالة `mm_app` تحمل `(healthy)`.

### ٧-٢ فحص الصحّة

```bash
curl -i https://monitoring.example.gov.sa/api/health
```

المتوقع `HTTP/2 200` و`{"ok":true}`. إن جاء `503` فأحد مكوّنَي القاعدة أو Redis لا يستجيب — راجع `./deploy/dc.sh logs app`.

### ٧-٣ الشهادة

```bash
echo | openssl s_client -connect monitoring.example.gov.sa:443 2>/dev/null | openssl x509 -noout -issuer -dates
```

يجب أن يظهر `Let's Encrypt` وتاريخ انتهاء بعد نحو 90 يوماً. Caddy يجدّدها وحده عند بقاء ثلاثين يوماً.

### ٧-٤ افتح الموقع

```
https://monitoring.example.gov.sa
```

ادخل بالبريد وكلمة المرور من `SEED_OWNER_EMAIL` و`SEED_OWNER_PASSWORD`.

### ٧-٥ افحص التكاملات من داخل الموقع

**لوحة الإدارة ← الإعدادات**. تأكّد أن:

- **Apify**: «متصل» مع اسم المستخدم
- **الطابور**: «متصل والعامل الخلفي يسحب المهام»

إن قال الطابور «لا يوجد عامل خلفي» فحاوية `mm_worker` متوقفة: `./deploy/dc.sh logs worker`.

### ٧-٦ غيّر كلمة مرور المالك

كلمة المرور الأولى مرّت في ملف نصّي وربما في سجل الطرفية. غيّرها من داخل الموقع (**الملف الشخصي**)، أو:

```bash
./deploy/dc.sh exec app npm run owner:reset -- "كلمة_مرور_جديدة"
```

ثم احذف قيمة `SEED_OWNER_PASSWORD` من `.env.production` — لن تُستعمل بعد ذلك، لأن التهيئة لا تلمس حساباً موجوداً.

---

## المرحلة ٨ — النسخ الاحتياطي

### ٨-١ جرّبه يدوياً أولاً

```bash
./deploy/backup.sh
```

يجب أن يظهر اسم الملف وحجمه. نسخة بحجم صفر تعني فشلاً، والسكربت يكشفها ويحذفها بدل أن يتركها تُطمئنك كذباً.

### ٨-٢ اجعله يومياً

```bash
crontab -e
```

أضف السطر (عدّل المسار إن اختلف):

```cron
30 2 * * * cd /home/deploy/Boot/platform && ./deploy/backup.sh >> /home/deploy/backup.log 2>&1
```

نسخة كل يوم الساعة 2:30 فجراً، والاحتفاظ 14 يوماً افتراضياً (يُغيَّر بـ `BACKUP_KEEP_DAYS`).

### ٨-٣ انسخ النسخ خارج الخادم

نسخة احتياطية على القرص نفسه لا تحمي من فقدان الخادم. الخياران:

- **لقطة الخادم من لوحة المزوّد**: Hostinger يمنح نسخاً أسبوعية تلقائية ضمن
  بعض خطط VPS (**hPanel ← VPS ← Backups**)، و DigitalOcean يعرضها بنسبة من
  سعر الخادم (**Droplet ← Backups**). فعّلها.
- **نسخ الملفات إلى مكان آخر**: انسخ `backups/*.dump` إلى تخزين خارجي أو إلى
  جهازك دورياً بـ `rclone` أو `scp`. مثال من جهازك:
  ```powershell
  scp deploy@<IP>:~/Boot/platform/backups/*.dump D:\backups\
  ```

### ٨-٤ الاستعادة عند الحاجة

```bash
# أوقف التطبيق والعامل حتى لا يكتبا أثناء الاستعادة
./deploy/dc.sh stop app worker

./deploy/dc.sh exec -T postgres \
  pg_restore -U monitor -d monitoring --clean --if-exists < backups/monitoring-20260907-023000.dump

./deploy/dc.sh start app worker
```

---

## المرحلة ٩ — التحديث بعد كل تعديل

```bash
cd ~/Boot/platform
git pull origin claude/social-media-monitoring-platform-45iz0q
./deploy/dc.sh up -d --build
```

- **المهاجرات تُطبَّق تلقائياً** عند إقلاع حاوية التطبيق — لا أمر إضافي.
- **التوقّف لحظي**: الحاوية القديمة تُستبدل بالجديدة بعد بنائها.
- **خذ نسخة قبل تحديث يمسّ قاعدة البيانات**: `./deploy/backup.sh`

للتراجع عن تحديث:

```bash
git log --oneline -5          # اعرف رقم الإصدار السابق
git checkout <رقم_الإصدار>
./deploy/dc.sh up -d --build
```

---

## أوامر يومية

| الغرض | الأمر |
|---|---|
| حالة الخدمات | `./deploy/dc.sh ps` |
| سجل التطبيق | `./deploy/dc.sh logs -f app` |
| سجل العامل | `./deploy/dc.sh logs -f worker` |
| سجل الوكيل والشهادة | `./deploy/dc.sh logs -f caddy` |
| إعادة تشغيل خدمة | `./deploy/dc.sh restart app` |
| فتح صدفة في التطبيق | `./deploy/dc.sh exec app sh` |
| صدفة قاعدة البيانات | `./deploy/dc.sh exec postgres psql -U monitor -d monitoring` |
| مساحة القرص | `df -h` و `docker system df` |
| تنظيف صور قديمة | `docker image prune -a -f` |

---

## الأعطال الشائعة

| العَرَض | السبب الأرجح | الحل |
|---|---|---|
| الشهادة لا تصدر، وسجل Caddy يكرر المحاولة | النطاق لا يشير إلى الخادم بعد | `dig +short النطاق` — انتظر انتشار DNS ثم `./deploy/dc.sh restart caddy` |
| `HTTP 503` من `/api/health` | القاعدة أو Redis لا يستجيب | `./deploy/dc.sh ps` ثم سجل الخدمة المتوقفة |
| البناء يُقتل فجأة بلا خطأ | نفاد الذاكرة | فعّل ملف التبديل (المرحلة ١-٤) أو كبّر الخادم |
| `required variable POSTGRES_PASSWORD is missing` | القيمة فارغة في `.env.production` | املأها ثم أعد `up -d` |
| الموقع يفتح لكن الاستخراج لا يبدأ | حاوية العامل متوقفة | `./deploy/dc.sh logs worker` |
| «رمز Apify غير معرّف» | `APIFY_TOKEN` فارغ | أضفه ثم `./deploy/dc.sh up -d app worker` |
| تسجيل الدخول يُرفض دائماً | `APP_DOMAIN` لا يطابق العنوان المستعمل | صحّح القيمة وأعد التشغيل |
| القرص يمتلئ | صور Docker قديمة أو نسخ متراكمة | `docker image prune -a -f` و راجع `backups/` |

---

## ملاحظات أمنية

هذه القرارات مبنيّة في ملفات النشر، لا تحتاج عملاً منك — لكن اعرفها:

1. **لا منفذ مكشوف إلا 80 و443.** قاعدة البيانات و Redis يعيشان على شبكة Docker الداخلية ولا يُريان من الإنترنت. الوصول إليهما عند الحاجة عبر `exec` من داخل الخادم.
2. **الأسرار في ملف بيئة واحد** بصلاحيات `600`، مستثنى من Git ومن صورة Docker معاً.
3. **رمز Apify لا يصل الواجهة أبداً** — لا يُخزَّن في قاعدة البيانات ولا يُرسل إلى المتصفح.
4. **HSTS مفعّل لسنة**، والترويسات الأمنية الأخرى يضيفها التطبيق نفسه.
5. **الموقع غير مفهرس**: ترويسة `X-Robots-Tag: noindex` على كل مسار.
6. **`/api/health` مفتوح بلا مصادقة لكنه لا يقول شيئاً** — `ok` أو لا، بلا تفصيل يرسم خريطة لمن يفحص الخوادم.
7. **لا تسجيل ذاتي**: الحسابات يُنشئها المسؤول من داخل الموقع.

---

## التكلفة الشهرية التقريبية

| البند | Hostinger VPS | DigitalOcean |
|---|---|---|
| الخادم | أرخص على عقد طويل، **ويرتفع عند التجديد** | ثابت: 12$ لـ 2 GB، 24$ لـ 4 GB |
| نسخ احتياطية تلقائية | مضمّنة في بعض الخطط | ~20٪ من سعر الخادم |
| النطاق | حسب المزوّد | حسب المزوّد |
| شهادة HTTPS | مجاناً (Let's Encrypt) | مجاناً (Let's Encrypt) |

الأسعار تقريبية وتتغيّر — راجع صفحة الأسعار وقت الشراء.

**انتبه عند Hostinger** إلى سعر **التجديد** لا سعر العرض: الخصم الكبير يكون
على عقد سنتين أو أربع، ويقفز السعر بعد انتهائه.
