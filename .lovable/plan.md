
## ملاحظة مهمة

المشروع ما يستخدم Firebase، يستخدم **Lovable Cloud** (Supabase/Postgres). كل التحسينات ستكون على نفس الـ Backend الحالي — بنفس المنطق اللي طلبته (Pagination, Indexes, Caching, Queries...).

---

## نطاق العمل

### 1) قاعدة البيانات — Indexes وتسريع Queries

إضافة Indexes للأعمدة الأكثر استخدامًا في الفلاتر والفرز:

- `products`: `(category_id)`, `(brand_id)`, `(in_stock, sales_count DESC)`, `(created_at DESC)`, `(is_deal) WHERE is_deal`, GIN على `search_tsv/name_ar` للبحث
- `orders`: `(user_id, created_at DESC)`, `(status, created_at DESC)`
- `order_items`: `(order_id)`, `(product_id)`
- `notifications`: `(user_id, created_at DESC)`, `(user_id) WHERE read_at IS NULL`
- `banner_comments`: `(banner_id, created_at DESC)`
- `favorites`, `cart_items`: `(user_id)`
- `audit_logs`, `stock_movements`: `(created_at DESC)`

تشغيل `ANALYZE` بعد الإنشاء.

### 2) Pagination + Lazy Loading

- **صفحة المنتجات / التصنيف / البحث / الأكثر مبيعًا / العروض**: تحميل صفحات من 20 منتج عبر `useInfiniteQuery` مع `range()` بدل جلب كل شيء.
- **صفحة الطلبات**: تحميل 15 طلب مع "تحميل المزيد".
- **الإشعارات**: تحميل 20 مع Infinite scroll.
- **الأدمن** (منتجات/طلبات/مستخدمين): Pagination من الخادم بدل `.select('*')` كامل.
- **ريلز العروض**: تحميل 5 ريلز أولية ثم المزيد عند القرب من النهاية.

### 3) اختيار الأعمدة (تقليل الحجم)

استبدال `select('*')` بأعمدة محددة فقط في:
- كروت المنتجات: `id, name_ar, price_iqd, price_usd, images[1], in_stock, is_deal, discount_percentage, category_id, brand_id`
- قوائم الطلبات: بدون `address` و`notes` (تجلب في التفاصيل فقط)
- الإشعارات في الـ Header: آخر 5 فقط بدون `body` الطويل

### 4) TanStack Query — Caching صحيح

- `staleTime` معقول (30s للقوائم، 5min للتصنيفات/العلامات، 24h للثوابت).
- `queryKey` مضبوط لكل فلتر/صفحة.
- Prefetch للصفحة التالية عند اقتراب الـ scroll من النهاية.
- إزالة أي `useEffect + fetch` متبقٍّ واستبداله بـ `useQuery`.

### 5) Skeletons موحّدة

مكوّن `<ProductCardSkeleton/>`, `<OrderRowSkeleton/>`, `<ListSkeleton/>`، وعرضها بدل السبينر الكبير على كل الصفحات الرئيسية.

### 6) الصور — ضغط + Thumbnails + Lazy

- عند رفع صور المنتجات/الأفاتار: ضغط في المتصفح عبر `browser-image-compression` (max 1600px, ~0.8 quality, WebP إن أمكن) قبل الرفع لـ Storage.
- إنشاء نسخة `thumb` (400px) وتخزينها في نفس الـ Bucket بمسار `thumbs/…` لعرضها في الكروت.
- كل `<img>` في القوائم: `loading="lazy" decoding="async"` + `width/height` لتفادي CLS.
- Preload للصورة الأولى في الهيدر فقط (LCP).

### 7) Realtime بدل Polling

الإشعارات وسلة التسوق تستخدم Supabase Realtime على قناة المستخدم بدل جلب متكرر. تقليل عدد الـ requests عند فتح التطبيق.

### 8) تقليل Requests عند الإقلاع

- دمج queries الصفحة الرئيسية في `Promise.all` واحد (banners + categories + best-sellers + deals).
- كسول: تحميل صور/ريلز `offers` فقط عند دخول التبويب.
- تأجيل تحميل `admin bundle` عبر route-level code splitting (موجود مسبقًا، نتأكد منه).

### 9) الأدمن — أثقل الصفحات

- جدول المنتجات/الطلبات: Pagination خادمي + بحث خادمي + عمود واحد للفرز.
- إزالة `select('*')` من كل الاستعلامات الإدارية.

### 10) RLS + الأمان

مراجعة سريعة أن الـ Indexes لا تعطل RLS، وأن الاستعلامات ما تكشف بيانات مستخدمين آخرين. (RLS مفعّل مسبقًا — نتأكد فقط.)

---

## تفاصيل تقنية

- Migration واحدة لكل الـ Indexes (CREATE INDEX بدون CONCURRENTLY لأنها داخل معاملة).
- استخدام `range(from, to)` مع `count: 'exact', head: false` فقط عند الحاجة للعدّاد (وإلا `count: 'estimated'` لتسريع).
- `useInfiniteQuery` مع `IntersectionObserver` sentinel للـ auto-load.
- ضغط الصور: `bun add browser-image-compression`.
- Skeletons: مكوّن مشترك في `src/components/skeletons.tsx`.
- كل التغييرات على Frontend + Migration واحدة فقط للـ DB — بدون كسر أي ميزة.

---

## الترتيب

1. Migration الـ Indexes  
2. Skeletons + Pagination على `products`, `category.$id`, `search`, `best-sellers`, `deals`  
3. Pagination على `orders`, `notifications`, `admin`  
4. ضغط الصور + Thumbnails  
5. Realtime + تقليل requests الإقلاع  
6. تنظيف select('*') المتبقي  
7. اختبار كل صفحة + تأكيد عدم كسر شيء

---

## ملاحظة حول "مليون مستخدم"

الـ Frontend + الاستعلامات ستكون جاهزة لذلك. لكن التوسّع الفعلي لملايين المستخدمين يحتاج أيضًا **ترقية حجم مثيل Lovable Cloud** (Backend → Advanced settings → Upgrade instance) عند زيادة الحمل الحقيقي — هذا شي منفصل عن الكود.

هل أبدأ التنفيذ بهذا الترتيب؟
