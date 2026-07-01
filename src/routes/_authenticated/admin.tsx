import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, uploadProductImage, settingsQuery } from "@/lib/admin";
import {
  categoriesQuery,
  brandsQuery,
  bannersQuery,
  carModelsQuery,
} from "@/lib/queries";
import { VehicleBar, getSavedVehicle, useSavedVehicle } from "@/components/vehicle-picker";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Upload, ShieldAlert, Package, Image as ImageIcon, Tags, Settings as SettingsIcon, ClipboardList } from "lucide-react";
import { formatIQD } from "@/lib/format";
import { statusLabel, statusColor } from "@/lib/order-status";

const STATUSES = ["received", "preparing", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"] as const;

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();

  if (!isAdmin) {
    return (
      <PageShell title="لوحة الإدارة">
        <div className="px-4 pt-10 flex flex-col items-center text-center gap-3">
          <div className="size-16 rounded-full bg-destructive/10 grid place-items-center">
            <ShieldAlert className="size-8 text-destructive" />
          </div>
          <div className="font-extrabold text-lg">ليس لديك صلاحية</div>
          <p className="text-sm text-muted-foreground">هذه اللوحة مخصصة للمدراء فقط.</p>
          <Button onClick={() => navigate({ to: "/" })}>العودة للرئيسية</Button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="لوحة الإدارة">
      <div className="px-4 pt-3 pb-6">
        <Tabs defaultValue="products">
          <TabsList className="w-full grid grid-cols-5 h-auto">
            <TabsTrigger value="products" className="flex-col gap-1 py-2 text-[10px]"><Package className="size-4" />منتجات</TabsTrigger>
            <TabsTrigger value="banners" className="flex-col gap-1 py-2 text-[10px]"><ImageIcon className="size-4" />عروض</TabsTrigger>
            <TabsTrigger value="taxonomy" className="flex-col gap-1 py-2 text-[10px]"><Tags className="size-4" />تصنيفات</TabsTrigger>
            <TabsTrigger value="orders" className="flex-col gap-1 py-2 text-[10px]"><ClipboardList className="size-4" />طلبات</TabsTrigger>
            <TabsTrigger value="settings" className="flex-col gap-1 py-2 text-[10px]"><SettingsIcon className="size-4" />إعدادات</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="mt-4"><ProductsAdmin /></TabsContent>
          <TabsContent value="banners" className="mt-4"><BannersAdmin /></TabsContent>
          <TabsContent value="taxonomy" className="mt-4"><TaxonomyAdmin /></TabsContent>
          <TabsContent value="orders" className="mt-4"><OrdersAdmin /></TabsContent>
          <TabsContent value="settings" className="mt-4"><SettingsAdmin /></TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}

/* ---------------- Products ---------------- */

type ProductForm = {
  id?: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  oem_number: string;
  price_iqd: string;
  compare_price_iqd: string;
  category_id: string;
  brand_id: string;
  images: string[];
  in_stock: boolean;
  is_featured: boolean;
  is_deal: boolean;
  compatible_models: string[];
};

const emptyProduct: ProductForm = {
  name_ar: "", name_en: "", description_ar: "", oem_number: "",
  price_iqd: "", compare_price_iqd: "", category_id: "", brand_id: "",
  images: [], in_stock: true, is_featured: false, is_deal: false,
  compatible_models: [],
};

function ProductsAdmin() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyProduct);
  const [saving, setSaving] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin", "products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: categories = [] } = useQuery(categoriesQuery());
  const { data: brands = [] } = useQuery(brandsQuery());
  const { data: carModels = [] } = useQuery(carModelsQuery());
  const savedVehicle = useSavedVehicle();

  const openNew = () => { setForm(emptyProduct); setOpen(true); };
  const openEdit = (p: any) => {
    setForm({
      id: p.id,
      name_ar: p.name_ar ?? "",
      name_en: p.name_en ?? "",
      description_ar: p.description_ar ?? "",
      oem_number: p.oem_number ?? "",
      price_iqd: String(p.price_iqd ?? ""),
      compare_price_iqd: String(p.compare_price_iqd ?? ""),
      category_id: p.category_id ?? "",
      brand_id: p.brand_id ?? "",
      images: p.images ?? [],
      in_stock: !!p.in_stock,
      is_featured: !!p.is_featured,
      is_deal: !!p.is_deal,
      compatible_models: p.compatible_models ?? [],
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name_ar.trim() || !form.price_iqd) {
      toast.error("الاسم والسعر مطلوبان");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name_ar: form.name_ar,
        name_en: form.name_en || null,
        description_ar: form.description_ar || null,
        oem_number: form.oem_number || null,
        price_iqd: Number(form.price_iqd),
        price_usd: Number(form.price_iqd) / 1310,
        compare_price_iqd: form.compare_price_iqd ? Number(form.compare_price_iqd) : null,
        category_id: form.category_id || null,
        brand_id: form.brand_id || null,
        images: form.images,
        in_stock: form.in_stock,
        is_featured: form.is_featured,
        is_deal: form.is_deal,
        compatible_models: form.compatible_models.length > 0 ? form.compatible_models : null,
      };
      const res = form.id
        ? await supabase.from("products").update(payload).eq("id", form.id)
        : await supabase.from("products").insert(payload);
      if (res.error) throw res.error;
      toast.success(form.id ? "تم التحديث" : "تم إضافة المنتج");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e: any) {
      toast.error(e.message ?? "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المنتج؟")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{products.length} منتج</div>
        <Button size="sm" onClick={openNew}><Plus className="size-4 me-1" /> إضافة منتج</Button>
      </div>

      {isLoading ? (
        <div className="text-center text-sm text-muted-foreground py-8">جاري التحميل...</div>
      ) : products.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8">لا توجد منتجات بعد</div>
      ) : (
        <div className="space-y-2">
          {products.map((p: any) => (
            <div key={p.id} className="bg-card border border-border rounded-2xl p-3 flex gap-3 items-center">
              <div className="size-14 rounded-xl bg-muted overflow-hidden shrink-0">
                {p.images?.[0] && <img src={p.images[0]} alt="" className="size-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{p.name_ar}</div>
                <div className="text-xs text-muted-foreground">{formatIQD(p.price_iqd)}</div>
                <div className="text-[10px] text-muted-foreground">{p.in_stock ? "متوفر" : "غير متوفر"}</div>
              </div>
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "تعديل منتج" : "إضافة منتج جديد"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <ImageUploader images={form.images} onChange={(imgs) => setForm({ ...form, images: imgs })} />
            <Field label="الاسم بالعربي *">
              <Input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
            </Field>
            <Field label="الاسم بالإنجليزي">
              <Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
            </Field>
            <Field label="الوصف">
              <Textarea value={form.description_ar} onChange={(e) => setForm({ ...form, description_ar: e.target.value })} rows={3} />
            </Field>
            <Field label="رقم القطعة (OEM)">
              <Input value={form.oem_number} onChange={(e) => setForm({ ...form, oem_number: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="السعر (د.ع) *">
                <Input type="number" value={form.price_iqd} onChange={(e) => setForm({ ...form, price_iqd: e.target.value })} />
              </Field>
              <Field label="السعر قبل الخصم">
                <Input type="number" value={form.compare_price_iqd} onChange={(e) => setForm({ ...form, compare_price_iqd: e.target.value })} />
              </Field>
            </div>
            <Field label="التصنيف">
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختر تصنيف" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="الماركة">
              <Select value={form.brand_id} onValueChange={(v) => setForm({ ...form, brand_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختر ماركة" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <CompatibleModelsField
              models={carModels}
              selected={form.compatible_models}
              savedVehicle={savedVehicle}
              onChange={(ids) => setForm({ ...form, compatible_models: ids })}
            />

            <div className="flex items-center justify-between py-1">
              <Label>متوفر</Label>
              <Switch checked={form.in_stock} onCheckedChange={(v) => setForm({ ...form, in_stock: v })} />
            </div>
            <div className="flex items-center justify-between py-1">
              <Label>مميز</Label>
              <Switch checked={form.is_featured} onCheckedChange={(v) => setForm({ ...form, is_featured: v })} />
            </div>
            <div className="flex items-center justify-between py-1">
              <Label>عرض / تخفيض</Label>
              <Switch checked={form.is_deal} onCheckedChange={(v) => setForm({ ...form, is_deal: v })} />
            </div>
            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Banners ---------------- */

function BannersAdmin() {
  const qc = useQueryClient();
  const { data: banners = [] } = useQuery(bannersQuery());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ id?: string; title_ar: string; subtitle_ar: string; image_url: string; link: string }>({
    title_ar: "", subtitle_ar: "", image_url: "", link: "",
  });

  const save = async () => {
    if (!form.image_url) { toast.error("الصورة مطلوبة"); return; }
    const payload = {
      title_ar: form.title_ar || null,
      subtitle_ar: form.subtitle_ar || null,
      image_url: form.image_url,
      link: form.link || null,
      is_active: true,
    };
    const res = form.id
      ? await supabase.from("banners").update(payload).eq("id", form.id)
      : await supabase.from("banners").insert(payload);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success("تم الحفظ");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["banners"] });
  };

  const remove = async (id: string) => {
    if (!confirm("حذف هذا العرض؟")) return;
    const { error } = await supabase.from("banners").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["banners"] });
  };

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => { setForm({ title_ar: "", subtitle_ar: "", image_url: "", link: "" }); setOpen(true); }}>
        <Plus className="size-4 me-1" /> إضافة عرض
      </Button>
      {banners.map((b) => (
        <div key={b.id} className="bg-card border border-border rounded-2xl overflow-hidden">
          <img src={b.image_url} alt={b.title_ar ?? ""} className="w-full h-32 object-cover" />
          <div className="p-3 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm truncate">{b.title_ar ?? "بدون عنوان"}</div>
              <div className="text-xs text-muted-foreground truncate">{b.subtitle_ar ?? ""}</div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => { setForm({ id: b.id, title_ar: b.title_ar ?? "", subtitle_ar: b.subtitle_ar ?? "", image_url: b.image_url, link: b.link ?? "" }); setOpen(true); }}>
              <Pencil className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => remove(b.id)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        </div>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "تعديل عرض" : "إضافة عرض"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <ImageUploader
              images={form.image_url ? [form.image_url] : []}
              max={1}
              onChange={(imgs) => setForm({ ...form, image_url: imgs[0] ?? "" })}
            />
            <Field label="العنوان"><Input value={form.title_ar} onChange={(e) => setForm({ ...form, title_ar: e.target.value })} /></Field>
            <Field label="العنوان الفرعي"><Input value={form.subtitle_ar} onChange={(e) => setForm({ ...form, subtitle_ar: e.target.value })} /></Field>
            <Field label="رابط (اختياري)"><Input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="/category/..." /></Field>
            <Button className="w-full" onClick={save}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Taxonomy (Categories + Brands) ---------------- */

function TaxonomyAdmin() {
  const qc = useQueryClient();
  const { data: categories = [] } = useQuery(categoriesQuery());
  const { data: brands = [] } = useQuery(brandsQuery());

  const addCategory = async () => {
    const name = prompt("اسم التصنيف بالعربي:");
    if (!name) return;
    const { error } = await supabase.from("categories").insert({ name_ar: name, name_en: name });
    if (error) toast.error(error.message);
    else { toast.success("تمت الإضافة"); qc.invalidateQueries({ queryKey: ["categories"] }); }
  };
  const removeCategory = async (id: string) => {
    if (!confirm("حذف التصنيف؟")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["categories"] });
  };
  const addBrand = async () => {
    const name = prompt("اسم الماركة:");
    if (!name) return;
    const { error } = await supabase.from("brands").insert({ name_ar: name, name_en: name });
    if (error) toast.error(error.message);
    else { toast.success("تمت الإضافة"); qc.invalidateQueries({ queryKey: ["brands"] }); }
  };
  const removeBrand = async (id: string) => {
    if (!confirm("حذف الماركة؟")) return;
    const { error } = await supabase.from("brands").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["brands"] });
  };

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">التصنيفات</h3>
          <Button size="sm" onClick={addCategory}><Plus className="size-4 me-1" /> جديد</Button>
        </div>
        <div className="space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-2">
              <span className="flex-1 text-sm font-semibold">{c.name_ar}</span>
              <Button size="icon" variant="ghost" onClick={() => removeCategory(c.id)}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">الماركات</h3>
          <Button size="sm" onClick={addBrand}><Plus className="size-4 me-1" /> جديد</Button>
        </div>
        <div className="space-y-2">
          {brands.map((b) => (
            <div key={b.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-2">
              <span className="flex-1 text-sm font-semibold">{b.name_ar}</span>
              <Button size="icon" variant="ghost" onClick={() => removeBrand(b.id)}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------------- Orders ---------------- */

function OrdersAdmin() {
  const qc = useQueryClient();
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("orders").update({ status: status as never }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم التحديث");
    qc.invalidateQueries({ queryKey: ["admin", "orders"] });
  };

  if (isLoading) return <div className="text-center text-sm text-muted-foreground py-8">جاري التحميل...</div>;
  if (!orders.length) return <div className="text-center text-sm text-muted-foreground py-8">لا توجد طلبات</div>;

  return (
    <div className="space-y-2">
      {orders.map((o: any) => (
        <div key={o.id} className="bg-card border border-border rounded-2xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono text-muted-foreground">#{o.id.slice(0, 8)}</div>
          <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusColor(o.status)}`}>
              {statusLabel(o.status)}
            </div>
          </div>
          <div className="text-sm">{formatIQD(o.total_iqd)}</div>
          <Select value={o.status} onValueChange={(v) => updateStatus(o.id, v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((k) => (
                <SelectItem key={k} value={k}>{statusLabel(k)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Settings ---------------- */

function SettingsAdmin() {
  const qc = useQueryClient();
  const { data: settings = {} } = useQuery(settingsQuery());
  const [wa, setWa] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [logo, setLogo] = useState("");
  const [address, setAddress] = useState("");
  const [about, setAbout] = useState("");
  const [saving, setSaving] = useState(false);
  const waVal = wa || settings.whatsapp_number || "";
  const phoneVal = phone || settings.phone_number || "";
  const nameVal = name || settings.store_name || "";
  const taglineVal = tagline || settings.store_tagline || "";
  const logoVal = logo || settings.store_logo || "";
  const addressVal = address || settings.store_address || "";
  const aboutVal = about || settings.store_about || "";

  const upsert = async (rows: { key: string; value: string }[]) => {
    const { error } = await supabase
      .from("app_settings")
      .upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
    if (error) throw error;
  };

  const save = async () => {
    const clean = waVal.replace(/\D/g, "");
    if (clean.length < 8) { toast.error("أدخل رقم واتساب صحيح"); return; }
    setSaving(true);
    try {
      await upsert([
        { key: "whatsapp_number", value: clean },
        { key: "phone_number", value: phoneVal.replace(/\D/g, "") },
        { key: "store_name", value: nameVal },
        { key: "store_tagline", value: taglineVal },
        { key: "store_logo", value: logoVal },
        { key: "store_address", value: addressVal },
        { key: "store_about", value: aboutVal },
      ]);
      toast.success("تم حفظ الإعدادات");
      qc.invalidateQueries({ queryKey: ["app_settings"] });
    } catch (e: any) {
      toast.error(e.message ?? "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="اسم المتجر">
        <Input value={nameVal} onChange={(e) => setName(e.target.value)} placeholder="Ali Parts" />
      </Field>
      <Field label="الشعار الفرعي (تحت الاسم)">
        <Input value={taglineVal} onChange={(e) => setTagline(e.target.value)} placeholder="قطع أصلية · العراق" />
      </Field>
      <div>
        <Label className="text-xs mb-1 block">شعار المتجر (لوگو)</Label>
        <ImageUploader
          images={logoVal ? [logoVal] : []}
          max={1}
          onChange={(imgs) => setLogo(imgs[0] ?? "")}
        />
        <p className="text-xs text-muted-foreground mt-1">إذا لم يتم رفع صورة سيظهر الحرف الأول من اسم المتجر.</p>
      </div>
      <Field label="رقم الواتساب (صيغة دولية بدون +)">
        <Input
          value={waVal}
          onChange={(e) => setWa(e.target.value)}
          placeholder="9647701234567"
          inputMode="numeric"
          dir="ltr"
        />
        <p className="text-xs text-muted-foreground mt-1">مثال: 9647701234567 (964 رمز العراق + الرقم بدون صفر)</p>
      </Field>
      <Field label="رقم الاتصال الهاتفي (صيغة دولية بدون +)">
        <Input
          value={phoneVal}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="9647701234567"
          inputMode="numeric"
          dir="ltr"
        />
        <p className="text-xs text-muted-foreground mt-1">يظهر في زر "اتصال هاتفي" بصفحة اتصل بنا. اتركه فارغاً لاستخدام رقم الواتساب.</p>
      </Field>
      <Field label="العنوان (يظهر في صفحة اتصل بنا)">
        <Input value={addressVal} onChange={(e) => setAddress(e.target.value)} placeholder="بغداد، العراق" />
      </Field>
      <Field label="نبذة عن المتجر (يظهر في من نحن)">
        <Textarea value={aboutVal} onChange={(e) => setAbout(e.target.value)} rows={4} placeholder="متجر متخصص في بيع قطع غيار..." />
      </Field>
      <Button className="w-full" onClick={save} disabled={saving}>
        {saving ? "جاري الحفظ..." : "حفظ"}
      </Button>
    </div>
  );
}

/* ---------------- Shared ---------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs mb-1 block">{label}</Label>
      {children}
    </div>
  );
}

function ImageUploader({ images, onChange, max = 6 }: { images: string[]; onChange: (imgs: string[]) => void; max?: number }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        if (images.length + urls.length >= max) break;
        const url = await uploadProductImage(f);
        if (url) urls.push(url);
      }
      onChange([...images, ...urls]);
      toast.success("تم رفع الصور");
    } catch (e: any) {
      toast.error(e.message ?? "فشل رفع الصور");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <Label className="text-xs mb-1 block">الصور</Label>
      <div className="flex gap-2 flex-wrap">
        {images.map((url, i) => (
          <div key={i} className="relative size-20 rounded-xl overflow-hidden border border-border">
            <img src={url} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(images.filter((_, j) => j !== i))}
              className="absolute top-0.5 end-0.5 size-6 rounded-full bg-destructive text-white grid place-items-center"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}
        {images.length < max && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="size-20 rounded-xl border-2 border-dashed border-border grid place-items-center text-muted-foreground hover:bg-muted transition"
          >
            {uploading ? <span className="text-xs">...</span> : <Upload className="size-5" />}
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
    </div>
  );
}