# خطوات رفع تطبيق مكتب علي شوفرليت إلى Google Play

> هذا الدليل يفترض أن المشروع متصل بـ GitHub أو محمّل على جهازك كـ ZIP.

---

## 1) تحضير المشروع على جهازك

### المتطلبات
- Android Studio (أحدث إصدار مستقر)
- JDK 17 أو أحدث
- Android SDK
- Node.js + Bun

### الأوامر
```bash
# داخل مجلد المشروع
bun install
bun run build

# إضافة منصة Android
npx cap add android
npx cap sync android

# توليد الأيقونات والشاشة الافتتاحية
bun run mobile:resources
npx cap sync android
```

---

## 2) إنشاء Keystore (مرة واحدة فقط — احفظه بأمان)

```bash
keytool -genkey -v \
  -keystore ali-chevrolet.keystore \
  -alias ali-chevrolet \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

انسخ الملف المُنتج إلى:
```
android/app/ali-chevrolet.keystore
```

> **تحذير:** إذا فقدت هذا الملف لن تستطيع تحديث التطبيق على Google Play أبدًا.

---

## 3) إعداد التوقيع

1. أنشئ ملف `android/keystore.properties` (ليس للرفع على GitHub):

```properties
storeFile=app/ali-chevrolet.keystore
storePassword=your_keystore_password
keyAlias=ali-chevrolet
keyPassword=your_key_password
```

> نموذج جاهز موجود في: `android/keystore.properties.example`

2. أضف هذا الكود في `android/app/build.gradle` داخل `android { ... }`:

```gradle
    signingConfigs {
        release {
            def keystorePropertiesFile = rootProject.file("keystore.properties")
            def keystoreProperties = new Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
```

3. تأكد من رفع `versionCode` و `versionName` في `build.gradle` قبل كل إصدار:

```gradle
android {
    defaultConfig {
        applicationId "app.lovable.alichevrolet"
        minSdkVersion 23
        targetSdkVersion 35
        versionCode 1
        versionName "1.0.0"
    }
}
```

---

## 4) بناء ملف AAB

```bash
cd android
./gradlew bundleRelease
```

ملف AAB سيظهر هنا:
```
android/app/build/outputs/bundle/release/app-release.aab
```

---

## 5) رفع AAB إلى Google Play Console

1. افتح [https://play.google.com/console](https://play.google.com/console)
2. سجّل حساب مطوّر (25$ دفعة واحدة)
3. أنشئ تطبيق جديد باسم: **مكتب علي شوفرليت**
4. أكمل المعلومات:
   - اسم التطبيق ووصف قصير وطويل
   - صور screenshots (2-8 صور)
   - أيقونة 512×512
   - صورة Feature Graphic 1024×500
   - تصنيف المحتوى (Content Rating)
   - الفئة والجمهور المستهدف
   - أمان البيانات (Data Safety)
5. اذهب إلى **Production > Create new release**
6. ارفع ملف `app-release.aab`
7. اضغط **Review release** ثم **Start rollout to Production**

---

## ملاحظات مهمة

- `capacitor.config.ts` تم حذف `server` block منه ليعمل التطبيق محليًا بدلاً من تحميله من الإنترنت.
- لا ترفع ملف `keystore.properties` أو `ali-chevrolet.keystore` إلى GitHub.
- عند كل تحديث، زِد `versionCode` بواحد على الأقل.
- لتجربة التطبيق قبل الرفع: `npx cap open android` ثم شغّله من Android Studio.
