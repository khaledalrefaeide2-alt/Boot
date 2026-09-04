# =============================================================================
# إعداد منصة الرصد على ويندوز
# التشغيل من مجلد platform:   .\setup.ps1
#
# يكتب ملف .env نيابة عنك بصيغة سليمة، ويولّد مفتاح الجلسات تلقائياً،
# فلا تحتاج إلى تحرير أي ملف يدوياً.
# =============================================================================

$ErrorActionPreference = 'Stop'
$envPath = Join-Path $PSScriptRoot '.env'

Write-Host ''
Write-Host '  إعداد منصة رصد وتحليل المنصات الإعلامية' -ForegroundColor Cyan
Write-Host '  ----------------------------------------' -ForegroundColor Cyan
Write-Host ''

if (Test-Path $envPath) {
  $answer = Read-Host 'يوجد ملف .env بالفعل. هل تريد استبداله؟ (y/n)'
  if ($answer -ne 'y') { Write-Host 'أُلغي الإعداد.' -ForegroundColor Yellow; exit 0 }
}

# --- قراءة القيم من المستخدم مع التحقق ---
function Read-Required([string]$prompt, [int]$minLength, [string]$hint) {
  while ($true) {
    $value = Read-Host $prompt
    $value = $value.Trim()
    if ($value.Length -ge $minLength -and $value -notmatch '["#]') { return $value }
    Write-Host "  $hint" -ForegroundColor Yellow
  }
}

Write-Host 'اكتب القيم التالية بحروف لاتينية وأرقام:' -ForegroundColor Gray
Write-Host ''

$dbPassword = Read-Required 'كلمة مرور قاعدة البيانات (8 محارف فأكثر)' 8 'قصيرة جداً أو تحتوي على محرف ممنوع " أو #'
$ownerEmail = Read-Required 'بريدك الإلكتروني للدخول' 5 'بريد غير صالح'
$ownerName  = Read-Required 'اسمك (بحروف لاتينية — يمكن تغييره للعربية من داخل الموقع)' 2 'قصير جداً'
$ownerPass  = Read-Required 'كلمة مرور دخولك (10 محارف فأكثر وتحتوي على رقم)' 10 'يجب ألا تقل عن 10 محارف'
$apifyToken = Read-Host 'رمز Apify (اضغط Enter لتخطيه الآن)'
$apifyToken = $apifyToken.Trim()

# --- توليد مفتاح الجلسات ---
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$sessionSecret = [Convert]::ToBase64String($bytes)

# --- كتابة الملف بترميز UTF-8 بلا BOM ---
$content = @"
# أُنشئ هذا الملف بواسطة setup.ps1 — لا تشاركه مع أحد فهو يحوي أسراراً
POSTGRES_USER="monitor"
POSTGRES_DB="monitoring"
POSTGRES_PASSWORD="$dbPassword"
DATABASE_URL="postgresql://monitor:$dbPassword@localhost:5432/monitoring?schema=public"
REDIS_URL="redis://localhost:6379"
SESSION_SECRET="$sessionSecret"
SESSION_TTL_DAYS="7"
APP_URL="http://localhost:3000"
APIFY_TOKEN="$apifyToken"
APIFY_API_BASE="https://api.apify.com/v2"
APIFY_MAX_ITEMS_HARD_CAP="1000"
APIFY_RUN_TIMEOUT_SECONDS="900"
SEED_OWNER_EMAIL="$ownerEmail"
SEED_OWNER_NAME="$ownerName"
SEED_OWNER_PASSWORD="$ownerPass"
NODE_ENV="development"
"@

[System.IO.File]::WriteAllText($envPath, $content, (New-Object System.Text.UTF8Encoding $false))

Write-Host ''
Write-Host '  تم إنشاء ملف .env بنجاح' -ForegroundColor Green
if ([string]::IsNullOrEmpty($apifyToken)) {
  Write-Host '  ملاحظة: رمز Apify فارغ — الموقع سيعمل لكن الاستخراج معطّل حتى تضيفه' -ForegroundColor Yellow
}
Write-Host ''
Write-Host '  الخطوة التالية:' -ForegroundColor Cyan
Write-Host '      docker compose up -d --build'
Write-Host ''
Write-Host '  ثم افتح المتصفح على http://localhost:3000'
Write-Host "  وسجّل الدخول بالبريد: $ownerEmail"
Write-Host ''
