# النشر على DigitalOcean

دليل كامل لنشر منصة الرصد على خادم DigitalOcean بشهادة HTTPS تلقائية.

---

## أولاً: أي مسار تختار؟

DigitalOcean تعرض طريقين. الفرق بينهما جوهري لهذه المنصة تحديداً:

| | **Droplet + Docker** (المُوصى به) | **App Platform** |
|---|---|---|
| ما هو | خادم افتراضي تديره أنت | منصة تبني وتشغّل من GitHub |
| ملفات المشروع | جاهزة — `docker-compose.prod.yml` | تحتاج إعداداً جديداً |
| العامل الخلفي | حاوية ضمن الخادم نفسه | مكوّن Worker مستقلّ بسعر مستقلّ |
| قاعدة البيانات | داخل الخادم | Managed Database بسعر شهري |
| Redis | داخل الخادم، بإعداد `noeviction` الحرج | Managed Valkey — الأغلى في الفاتورة |
| التكلفة التقريبية | **12–24 دولاراً شهرياً** | **30–40 دولاراً شهرياً** |
| حصر الوصول بعناوين جهتكم | متاح عبر جدار DO الناري | أصعب |

**التوصية: Droplet.** المشروع يحمل أصلاً `Dockerfile` وملف compose إنتاجياً جاهزاً، والمنصة داخلية لا تحتاج تمدّداً تلقائياً. والأهمّ أن Redis هنا يعمل بسياسة `noeviction` — وهي ليست تفصيلاً: بدونها تُحذف مهام الاستخراج المنتظرة بصمت عند امتلاء الذاكرة.

> بقية هذا الدليل عن مسار الـ Droplet.

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

### ١-١ أنشئ الـ Droplet

من لوحة DigitalOcean: **Create ← Droplets**

| الخيار | القيمة | لماذا |
|---|---|---|
| Region | **Frankfurt (FRA1)** | أقرب مراكز DO زمنياً إلى الخليج |
| Image | **Ubuntu 24.04 LTS** | دعم طويل، ومستودعات Docker جاهزة |
| Size | **Basic Regular — 2 GB / 1 vCPU** (≈12$/شهر) | الحدّ الأدنى العملي |
| Authentication | **SSH Key** | لا كلمة مرور — انظر أدناه |
| Hostname | `monitoring` | يظهر في السجلات |

**عن الحجم:** بناء التطبيق داخل Docker يستهلك ذاكرة كبيرة. على خادم 2 GB أضف ملف تبديل (المرحلة ١-٤) وإلا قد يُقتل البناء بلا رسالة مفهومة. إن أردت راحة بلا حيل فاختر **4 GB / 2 vCPU** (≈24$).

**عن مفتاح SSH:** إن لم يكن لديك مفتاح، ولّده على جهازك:

```powershell
ssh-keygen -t ed25519 -C "monitoring-deploy"
```

اضغط Enter لقبول المسار الافتراضي، ثم انسخ **المفتاح العام**:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

والصقه في حقل SSH Key في لوحة DigitalOcean.

### ١-٢ ادخل إلى الخادم

من PowerShell على جهازك (استبدل العنوان بـ IP خادمك):

```powershell
ssh root@203.0.113.10
```

### ١-٣ أنشئ مستخدماً غير الجذر

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

### ١-٤ ملف التبديل (مهم على خادم 2 GB)

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

### ١-٥ الجدار الناري

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

المفتوح ثلاثة منافذ فقط. قاعدة البيانات و Redis لا تُنشران على الشبكة إطلاقاً في ملف compose الإنتاجي — لا يحتاجان قاعدة جدار لأنهما غير مرئيين أصلاً.

> **حصر الوصول بجهتكم:** إن كانت المنصة داخلية بالكامل، أضف من لوحة DigitalOcean (**Networking ← Firewalls**) قاعدة تسمح بالمنفذ 443 من نطاق عناوين مؤسستكم فقط. عندها لا يصل الموقع أحد من خارج الشبكة حتى لو عرف النطاق.

### ١-٦ التحديثات الأمنية التلقائية

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
ssh-keygen -t ed25519 -C "droplet-monitoring" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

### ٤-٢ أضفه في GitHub

انسخ المفتاح الظاهر، ثم في المستودع على GitHub:

**Settings ← Deploy keys ← Add deploy key**

- Title: `Droplet — monitoring`
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

- **DigitalOcean Snapshots**: من لوحة الـ Droplet، فعّل النسخ الأسبوعي التلقائي (بنسبة من سعر الخادم).
- **DigitalOcean Spaces**: خزّن ملفات `backups/*.dump` فيها عبر `s3cmd` أو `rclone`.

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

| البند | تقريباً |
|---|---|
| Droplet 2 GB | 12$ |
| نسخ احتياطية تلقائية (اختياري) | ~2.4$ |
| النطاق | حسب المزوّد |
| شهادة HTTPS | مجاناً (Let's Encrypt) |
| **المجموع** | **~14$ شهرياً** |

الأسعار تقريبية — راجع صفحة أسعار DigitalOcean وقت الشراء.
