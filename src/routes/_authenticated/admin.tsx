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
  type CarModel,
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
import { Plus, Pencil, Trash2, Upload, ShieldAlert, Package, Image as ImageIcon, Tags, Settings as SettingsIcon, ClipboardList, Phone, MapPin, User as UserIcon, Copy, StickyNote, Receipt, Search as SearchIcon, Ban, CheckCircle2, History } from "lucide-react";
import { WhatsappIcon } from "@/components/icons";
import { formatIQD, whatsappLink } from "@/lib/format";
import { statusLabel, statusColor } from "@/lib/order-status";
import { PrintableInvoice, InvoicePreviewDialog } from "@/components/printable-invoice";

const STATUSES = ["received", "preparing", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"] as const;

/* ---------------- Block Log ---------------- */

function BlockLogAdmin() {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["admin", "block-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_block_log")
        .select("id, user_id, actor_id, action, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const ids = Array.from(new Set(entries.flatMap((e: any) => [e.user_id, e.actor_id]).filter(Boolean)));
  const { data: profiles = [] } = useQuery({
    queryKey: ["admin", "block-log-profiles", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, phone").in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });
  const nameMap = new Map((profiles as any[]).map((p) => [p.id, p]));

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" });
    } catch { return iso; }
  };
  const nameOf = (id: string | null) => {
    if (!id) return "—";
    const p: any = nameMap.get(id);
    return p?.full_name || p?.phone || id.slice(0, 8);
  };

  if (isLoading) return <div className="text-center text-sm text-muted-foreground py-8">جاري التحميل…</div>;
  if (!entries.length) return <div className="text-center text-sm text-muted-foreground py-8">لا توجد سجلات بعد</div>;

  return (
    <div className="space-y-2">
      {entries.map((e: any) => {
        const isBlock = e.action === "block";
        return (
          <div key={e.id} className="bg-card border border-border rounded-2xl p-3 flex items-start gap-3">
            <div className={`size-9 rounded-full grid place-items-center shrink-0 ${isBlock ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
              {isBlock ? <Ban className="size-4" /> : <CheckCircle2 className="size-4" />}
            </div>
            <div className="flex-1 min-w-0 text-sm">
              <div className="font-bold">
                {isBlock ? "حظر زبون" : "رفع الحظر عن زبون"}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                الزبون: <span className="font-semibold text-foreground">{nameOf(e.user_id)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                بواسطة: <span className="font-semibold text-foreground">{nameOf(e.actor_id)}</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">{fmt(e.created_at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
          <TabsList className="w-full grid grid-cols-6 h-auto">
            <TabsTrigger value="products" className="flex-col gap-1 py-2 text-[10px]"><Package className="size-4" />منتجات</TabsTrigger>
            <TabsTrigger value="banners" className="flex-col gap-1 py-2 text-[10px]"><ImageIcon className="size-4" />عروض</TabsTrigger>
            <TabsTrigger value="taxonomy" className="flex-col gap-1 py-2 text-[10px]"><Tags className="size-4" />تصنيفات</TabsTrigger>
            <TabsTrigger value="orders" className="flex-col gap-1 py-2 text-[10px]"><ClipboardList className="size-4" />طلبات</TabsTrigger>
            <TabsTrigger value="block-log" className="flex-col gap-1 py-2 text-[10px]"><History className="size-4" />سجل الحظر</TabsTrigger>
            <TabsTrigger value="settings" className="flex-col gap-1 py-2 text-[10px]"><SettingsIcon className="size-4" />إعدادات</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="mt-4"><ProductsAdmin /></TabsContent>
          <TabsContent value="banners" className="mt-4"><BannersAdmin /></TabsContent>
          <TabsContent value="taxonomy" className="mt-4"><TaxonomyAdmin /></TabsContent>
          <TabsContent value="orders" className="mt-4"><OrdersAdmin /></TabsContent>
          <TabsContent value="block-log" className="mt-4"><BlockLogAdmin /></TabsContent>
          <TabsContent value="settings" className="mt-4"><SettingsAdmin /></TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}

/* ---------------- Products ---------------- */

function CompatibleModelsField({
  models,
  selected,
  savedVehicle,
  onChange,
}: {
  models: CarModel[];
  selected: string[];
  savedVehicle: { brandName: string; modelId: string; modelName: string; year: string; engine: string } | null;
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>السيارات المتوافقة</Label>
        {savedVehicle && !selected.includes(savedVehicle.modelId) && (
          <button
            type="button"
            onClick={() => onChange([...selected, savedVehicle.modelId])}
            className="text-[11px] font-bold text-gold hover:underline"
          >
            + اضف {savedVehicle.brandName} {savedVehicle.modelName}
          </button>
        )}
      </div>
      {savedVehicle && selected.includes(savedVehicle.modelId) && (
        <div className="text-xs text-gold font-semibold">
          متوافق مع المركبة المختارة: {savedVehicle.brandName} {savedVehicle.modelName} ({savedVehicle.year}) · {savedVehicle.engine}
        </div>
      )}
      <div className="max-h-40 overflow-y-auto border border-border rounded-xl p-2 space-y-1 bg-card">
        {models.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-2">لا توجد موديلات مسجلة</div>
        ) : (
          models.map((m) => (
            <label key={m.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(m.id)}
                onChange={() => toggle(m.id)}
                className="size-4 accent-navy"
              />
              <span className="text-sm flex-1">{m.name_ar}</span>
              {m.name_en && <span className="text-xs text-muted-foreground">{m.name_en}</span>}
            </label>
          ))
        )}
      </div>
      <div className="text-xs text-muted-foreground">{selected.length} موديل محدد</div>
    </div>
  );
}

type ProductForm = {
  id?: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  oem_number: string;
  price_iqd: string;
  compare_price_iqd: string;
  shipping_iqd: string;
  category_id: string;
  brand_id: string;
  images: string[];
  in_stock: boolean;
  is_featured: boolean;
  is_deal: boolean;
  compatible_models: string[];
  deal_expires_at: string;
};

const emptyProduct: ProductForm = {
  name_ar: "", name_en: "", description_ar: "", oem_number: "",
  price_iqd: "", compare_price_iqd: "", shipping_iqd: "", category_id: "", brand_id: "",
  images: [], in_stock: true, is_featured: false, is_deal: false,
  compatible_models: [], deal_expires_at: "",
};

function ProductsAdmin() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyProduct);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin", "products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const filteredProducts = (() => {
    const s = search.trim().toLowerCase();
    if (!s) return products;
    return products.filter((p: any) =>
      [p.name_ar, p.name_en, p.oem_number]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(s)),
    );
  })();
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
      shipping_iqd: String(p.shipping_iqd ?? ""),
      category_id: p.category_id ?? "",
      brand_id: p.brand_id ?? "",
      images: p.images ?? [],
      in_stock: !!p.in_stock,
      is_featured: !!p.is_featured,
      is_deal: !!p.is_deal,
      compatible_models: p.compatible_models ?? [],
      deal_expires_at: p.deal_expires_at ? new Date(p.deal_expires_at).toISOString().slice(0, 16) : "",
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
        shipping_iqd: form.shipping_iqd ? Number(form.shipping_iqd) : 0,
        category_id: form.category_id || null,
        brand_id: form.brand_id || null,
        images: form.images,
        in_stock: form.in_stock,
        is_featured: form.is_featured,
        is_deal: form.is_deal,
        compatible_models: form.compatible_models.length > 0 ? form.compatible_models : null,
        deal_expires_at: form.is_deal && form.deal_expires_at ? new Date(form.deal_expires_at).toISOString() : null,
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
        <div className="text-sm text-muted-foreground">{search ? `${filteredProducts.length}/${products.length}` : products.length} منتج</div>
        <Button size="sm" onClick={openNew}><Plus className="size-4 me-1" /> إضافة منتج</Button>
      </div>

      <label className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 focus-within:border-gold">
        <SearchIcon className="size-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو رقم OEM…"
          className="flex-1 bg-transparent outline-none text-sm"
        />
      </label>

      {isLoading ? (
        <div className="text-center text-sm text-muted-foreground py-8">جاري التحميل...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8">لا توجد منتجات بعد</div>
      ) : (
        <div className="space-y-2">
          {filteredProducts.map((p: any) => (
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
            <Field label="كلفة التوصيل لهذا المنتج (د.ع)">
              <Input type="number" value={form.shipping_iqd} onChange={(e) => setForm({ ...form, shipping_iqd: e.target.value })} inputMode="numeric" dir="ltr" placeholder="0" />
            </Field>
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
            {form.is_deal && (
              <Field label="ينتهي العرض في (اختياري)">
                <Input
                  type="datetime-local"
                  value={form.deal_expires_at}
                  onChange={(e) => setForm({ ...form, deal_expires_at: e.target.value })}
                />
              </Field>
            )}
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
  const [form, setForm] = useState<{ id?: string; title_ar: string; subtitle_ar: string; image_url: string; link: string; expires_at: string }>({
    title_ar: "", subtitle_ar: "", image_url: "", link: "", expires_at: "",
  });

  const save = async () => {
    if (!form.image_url) { toast.error("الصورة مطلوبة"); return; }
    const payload = {
      title_ar: form.title_ar || null,
      subtitle_ar: form.subtitle_ar || null,
      image_url: form.image_url,
      link: form.link || null,
      is_active: true,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
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
    if (!window.confirm("هل أنت متأكد من حذف هذا العرض؟")) return;
    const { error } = await supabase.from("banners").delete().eq("id", id);
    if (error) { toast.error("تعذّر الحذف: " + error.message); return; }
    toast.success("تم حذف العرض");
    qc.invalidateQueries({ queryKey: ["banners"] });
  };

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => { setForm({ title_ar: "", subtitle_ar: "", image_url: "", link: "", expires_at: "" }); setOpen(true); }}>
        <Plus className="size-4 me-1" /> إضافة عرض
      </Button>
      {banners.map((b) => (
        <div key={b.id} className="bg-card border border-border rounded-2xl overflow-hidden">
          <img src={b.image_url} alt={b.title_ar ?? ""} className="w-full h-32 object-cover" />
          <div className="p-3 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm truncate">{b.title_ar ?? "بدون عنوان"}</div>
              <div className="text-xs text-muted-foreground truncate">{b.subtitle_ar ?? ""}</div>
              {(b as any).expires_at && (
                <div className="text-[10px] text-gold font-semibold mt-0.5">
                  ينتهي: {new Date((b as any).expires_at).toLocaleString("ar-IQ")}
                </div>
              )}
            </div>
            <Button size="icon" variant="ghost" onClick={() => { setForm({ id: b.id, title_ar: b.title_ar ?? "", subtitle_ar: b.subtitle_ar ?? "", image_url: b.image_url, link: b.link ?? "", expires_at: (b as any).expires_at ? new Date((b as any).expires_at).toISOString().slice(0,16) : "" }); setOpen(true); }}>
              <Pencil className="size-4" />
            </Button>
            <Button size="sm" variant="destructive" onClick={() => remove(b.id)} className="gap-1">
              <Trash2 className="size-4" /> حذف
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
            <Field label="ينتهي في (اختياري)"><Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></Field>
            <Button className="w-full" onClick={save}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Taxonomy (Categories + Brands) ---------------- */

const ICON_OPTIONS = [
  { key: "engine", label: "محرك" },
  { key: "brake", label: "فرامل" },
  { key: "electrical", label: "كهرباء" },
  { key: "filter", label: "فلتر" },
  { key: "oil", label: "زيوت" },
  { key: "suspension", label: "محرك/تعليق" },
  { key: "body", label: "بدي" },
  { key: "wheel", label: "إطار" },
  { key: "wiper", label: "مساحات" },
  { key: "light", label: "إنارة" },
  { key: "tool", label: "أدوات" },
];

function TaxonomyAdmin() {
  const qc = useQueryClient();
  const { data: categories = [] } = useQuery(categoriesQuery());
  const { data: brands = [] } = useQuery(brandsQuery());
  const [catOpen, setCatOpen] = useState(false);
  const [catForm, setCatForm] = useState<{ id?: string; name_ar: string; name_en: string; icon: string; image_url: string }>({ name_ar: "", name_en: "", icon: "", image_url: "" });

  const openCat = (c?: any) => {
    setCatForm({
      id: c?.id,
      name_ar: c?.name_ar ?? "",
      name_en: c?.name_en ?? "",
      icon: c?.icon ?? "",
      image_url: c?.image_url ?? "",
    });
    setCatOpen(true);
  };

  const saveCategory = async () => {
    if (!catForm.name_ar.trim()) {
      toast.error("اسم التصنيف مطلوب");
      return;
    }
    const payload = {
      name_ar: catForm.name_ar,
      name_en: catForm.name_en || catForm.name_ar,
      icon: catForm.icon || null,
      image_url: catForm.image_url || null,
    };
    const res = catForm.id
      ? await supabase.from("categories").update(payload).eq("id", catForm.id)
      : await supabase.from("categories").insert(payload);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(catForm.id ? "تم التحديث" : "تمت الإضافة");
    setCatOpen(false);
    qc.invalidateQueries({ queryKey: ["categories"] });
  };

  const addCategory = () => openCat();
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
            <div key={c.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="size-12 rounded-lg bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                {c.image_url ? <img src={c.image_url} alt="" className="size-full object-cover" /> : <span className="text-xl">{categoryEmoji(c.icon)}</span>}
              </div>
              <span className="flex-1 text-sm font-semibold truncate">{c.name_ar}</span>
              <Button size="icon" variant="ghost" onClick={() => openCat(c)}><Pencil className="size-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => removeCategory(c.id)}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      </section>

      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{catForm.id ? "تعديل تصنيف" : "إضافة تصنيف"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <ImageUploader images={catForm.image_url ? [catForm.image_url] : []} max={1} resizeTo={256} onChange={(imgs) => setCatForm({ ...catForm, image_url: imgs[0] ?? "" })} />
            <Field label="الاسم بالعربي *"><Input value={catForm.name_ar} onChange={(e) => setCatForm({ ...catForm, name_ar: e.target.value })} /></Field>
            <Field label="الاسم بالإنجليزي"><Input value={catForm.name_en} onChange={(e) => setCatForm({ ...catForm, name_en: e.target.value })} /></Field>
            <Field label="الأيقونة (اختياري)">
              <Select value={catForm.icon || "__none__"} onValueChange={(v) => setCatForm({ ...catForm, icon: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="اختر أيقونة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">بدون</SelectItem>
                  {ICON_OPTIONS.map((opt) => <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Button className="w-full" onClick={saveCategory}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>

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

function categoryEmoji(icon: string | null) {
  const map: Record<string, string> = {
    engine: "⚙️",
    brake: "🛞",
    braking: "🛞",
    electrical: "⚡",
    filter: "🌀",
    oil: "🛢️",
    suspension: "🔩",
    body: "🚙",
    wheel: "🛞",
    wiper: "🌧️",
    light: "💡",
    tool: "🛠️",
  };
  return map[icon ?? ""] ?? "🏷️";
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
        <OrderAdminCard key={o.id} order={o} onStatusChange={updateStatus} />
      ))}
    </div>
  );
}

function OrderAdminCard({ order: o, onStatusChange }: { order: any; onStatusChange: (id: string, status: string) => void }) {
  const addr = (o.address ?? {}) as { label?: string; full_name?: string; phone?: string; city?: string; area?: string; street?: string; notes?: string };
  const phoneDigits = String(addr.phone ?? "").replace(/\D/g, "");
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`تم نسخ ${label}`); } catch { toast.error("تعذّر النسخ"); }
  };
  const { data: items = [] } = useQuery({
    queryKey: ["admin", "order-items", o.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id,name_ar,oem_number,image_url,unit_price_iqd,quantity,side,note")
        .eq("order_id", o.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: customer } = useQuery({
    queryKey: ["admin", "order-customer", o.user_id],
    enabled: !!o.user_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone, is_blocked")
        .eq("id", o.user_id)
        .maybeSingle();
      return data ?? null;
    },
  });
  const qcCard = useQueryClient();
  const [blockSaving, setBlockSaving] = useState(false);
  const isBlocked = !!(customer as any)?.is_blocked;
  const toggleBlock = async () => {
    if (!o.user_id || blockSaving) return;
    const next = !isBlocked;
    const defaultReason = "تم حظر حسابك لأنك قمت بإرسال أكثر من طلب وهمي. يرجى التواصل مع قسم المبيعات.";
    let reason: string | undefined = next ? defaultReason : undefined;
    if (next) {
      if (!window.confirm("حظر هذا الزبون من إرسال طلبات جديدة؟")) return;
    } else {
      if (!window.confirm("رفع الحظر عن هذا الزبون؟")) return;
    }
    setBlockSaving(true);
    try {
      const { error } = await supabase.rpc("admin_set_user_blocked", {
        p_user_id: o.user_id,
        p_blocked: next,
        p_reason: reason,
      });
      if (error) { toast.error(error.message || "تعذّر تحديث الحالة"); return; }
      toast.success(next ? "تم حظر الزبون وإرسال الإشعار" : "تم رفع الحظر");
      qcCard.invalidateQueries({ queryKey: ["admin", "order-customer", o.user_id] });
      qcCard.invalidateQueries({ queryKey: ["admin", "block-log"] });
    } finally {
      setBlockSaving(false);
    }
  };
  const addressRows = [
    { key: "label", label: "التسمية", value: addr.label || "—" },
    { key: "full_name", label: "الاسم الكامل", value: addr.full_name || "—" },
    { key: "phone", label: "رقم الهاتف", value: phoneDigits ? `+${phoneDigits}` : "—", mono: true },
    { key: "city", label: "المحافظة", value: addr.city || "—" },
    { key: "area", label: "المنطقة / القضاء", value: addr.area || "—" },
    { key: "street", label: "الشارع / تفاصيل", value: addr.street || "—" },
    { key: "notes", label: "ملاحظات إضافية", value: addr.notes || "—", muted: true },
  ];
  return (
    <div className="bg-card border border-border rounded-2xl p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-mono text-muted-foreground">#{(o.order_number ?? o.id).toString().slice(0, 10)}</div>
        <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusColor(o.status)}`}>{statusLabel(o.status)}</div>
      </div>

      <div className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-gold mb-1">
          <MapPin className="size-4" /> تفاصيل عنوان التوصيل
        </div>
        {addressRows.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-2 text-sm">
            <span className="text-muted-foreground text-xs shrink-0">{row.label}</span>
            <div className={`flex-1 text-end ${row.mono ? "font-mono" : ""} ${row.muted ? "text-muted-foreground text-xs" : "font-semibold"}`}>
              {row.value}
            </div>
          </div>
        ))}
        {phoneDigits && (
          <button
            onClick={() => copy([addr.label, addr.full_name, `+${phoneDigits}`, addr.city, addr.area, addr.street, addr.notes].filter(Boolean).join("\n"), "تفاصيل العنوان")}
            className="w-full mt-1 h-8 rounded-lg border border-border text-muted-foreground text-xs font-bold flex items-center justify-center gap-1.5 hover:text-gold hover:border-gold/50 transition"
          >
            <Copy className="size-3.5" /> نسخ العنوان كاملاً
          </button>
        )}
      </div>

      {items.length > 0 && (
        <div className="rounded-xl border border-border/70 divide-y divide-border/60">
          <div className="px-3 py-1.5 text-[11px] font-bold text-muted-foreground bg-muted/30 rounded-t-xl">
            القطع ({items.length})
          </div>
          {items.map((it: any) => (
            <div key={it.id} className="flex gap-2 p-2">
              <div className="size-12 rounded-lg bg-muted overflow-hidden shrink-0">
                {it.image_url && <img src={it.image_url} alt="" className="size-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0 text-xs">
                <div className="font-bold line-clamp-2">{it.name_ar}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {it.side && (
                    <span className="inline-flex items-center rounded-full bg-navy text-primary-foreground px-2 py-0.5 text-[10px] font-black">
                      {it.side === "LH" ? "LH · يسار" : it.side === "RH" ? "RH · يمين" : "تخم"}
                    </span>
                  )}
                  {it.oem_number && (
                    <span className="font-mono text-[10px] text-muted-foreground">OEM: {it.oem_number}</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-muted-foreground">×{it.quantity}</span>
                  <span className="font-bold">{formatIQD(Number(it.unit_price_iqd) * it.quantity)}</span>
                </div>
                {it.note && (
                  <div className="mt-1 flex items-start gap-1 text-[10px] text-muted-foreground bg-gold/5 border border-gold/20 rounded p-1.5">
                    <StickyNote className="size-3 text-gold shrink-0 mt-0.5" />
                    <span className="whitespace-pre-wrap">{it.note}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {o.notes && (
        <div className="rounded-xl border border-gold/30 bg-gold/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gold mb-1">
            <StickyNote className="size-3.5" /> ملاحظة الزبون على الطلب
          </div>
          <div className="text-sm whitespace-pre-wrap">{o.notes}</div>
        </div>
      )}

      {phoneDigits && (
        <div className="grid grid-cols-2 gap-2">
          <a href={whatsappLink(`مرحباً، بخصوص طلبك #${(o.order_number ?? o.id).toString().slice(0, 10)}`, phoneDigits)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 h-9 rounded-lg bg-whatsapp text-white text-xs font-bold">
            <WhatsappIcon className="size-4" /> واتساب
          </a>
          <a href={`tel:+${phoneDigits}`} className="flex items-center justify-center gap-1.5 h-9 rounded-lg bg-navy text-primary-foreground text-xs font-bold">
            <Phone className="size-4" /> اتصال
          </a>
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground text-xs">الإجمالي</span>
        <span className="font-bold">{formatIQD(o.total_iqd)}</span>
      </div>

      <Select value={o.status} onValueChange={(v) => onStatusChange(o.id, v)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {STATUSES.map((k) => (
            <SelectItem key={k} value={k}>{statusLabel(k)}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <InvoiceActions order={o} items={items} customer={customer ?? null} />

      {o.user_id && (
        <button
          onClick={toggleBlock}
          disabled={blockSaving}
          className={`w-full h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition ${
            isBlocked
              ? "border-success/40 text-success bg-success/5 hover:bg-success/10"
              : "border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/10"
          } disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {blockSaving ? "جاري التحديث…" : isBlocked ? (<><CheckCircle2 className="size-4" /> رفع الحظر عن الزبون</>) : (<><Ban className="size-4" /> حظر الزبون من الطلبات</>)}
        </button>
      )}
    </div>
  );
}

function InvoiceActions({ order, items, customer }: { order: any; items: any[]; customer: { full_name: string | null; phone: string | null } | null }) {
  const [open, setOpen] = useState(false);
  const domId = `admin-invoice-${order.id}`;
  const previewId = `admin-invoice-preview-${order.id}`;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 h-9 rounded-lg bg-gradient-gold text-navy text-xs font-bold shadow-gold"
      >
        <Receipt className="size-4" /> معاينة الفاتورة
      </button>
      <PrintableInvoice order={order} items={items} customer={customer} domId={domId} />
      <InvoicePreviewDialog
        order={order}
        items={items}
        customer={customer}
        open={open}
        onOpenChange={setOpen}
        domId={previewId}
      />
    </>
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
  const [shipLocalName, setShipLocalName] = useState("");
  const [shipLocalCost, setShipLocalCost] = useState("");
  const [shipAramexName, setShipAramexName] = useState("");
  const [shipAramexCost, setShipAramexCost] = useState("");
  const [saving, setSaving] = useState(false);
  const waVal = wa || settings.whatsapp_number || "";
  const phoneVal = phone || settings.phone_number || "";
  const nameVal = name || settings.store_name || "";
  const taglineVal = tagline || settings.store_tagline || "";
  const logoVal = logo || settings.store_logo || "";
  const addressVal = address || settings.store_address || "";
  const aboutVal = about || settings.store_about || "";
  const shipLocalNameVal = shipLocalName || settings.ship_local_name || "التوصيل المحلي";
  const shipLocalCostVal = shipLocalCost || settings.ship_local_cost || "5000";
  const shipAramexNameVal = shipAramexName || settings.ship_aramex_name || "أرامكس";
  const shipAramexCostVal = shipAramexCost || settings.ship_aramex_cost || "10000";

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
        { key: "ship_local_name", value: shipLocalNameVal },
        { key: "ship_local_cost", value: String(Number(shipLocalCostVal) || 0) },
        { key: "ship_aramex_name", value: shipAramexNameVal },
        { key: "ship_aramex_cost", value: String(Number(shipAramexCostVal) || 0) },
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
      <div className="bg-muted/30 border border-border rounded-2xl p-3 space-y-3">
        <div className="text-sm font-bold text-gold flex items-center gap-2">
          <Package className="size-4" /> إعدادات شركات التوصيل
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="اسم الخيار الأول">
            <Input value={shipLocalNameVal} onChange={(e) => setShipLocalName(e.target.value)} placeholder="التوصيل المحلي" />
          </Field>
          <Field label="كلفة التوصيل (د.ع)">
            <Input type="number" value={shipLocalCostVal} onChange={(e) => setShipLocalCost(e.target.value)} inputMode="numeric" dir="ltr" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="اسم الخيار الثاني">
            <Input value={shipAramexNameVal} onChange={(e) => setShipAramexName(e.target.value)} placeholder="أرامكس" />
          </Field>
          <Field label="كلفة التوصيل (د.ع)">
            <Input type="number" value={shipAramexCostVal} onChange={(e) => setShipAramexCost(e.target.value)} inputMode="numeric" dir="ltr" />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">اترك الاسم فارغاً لإخفاء الخيار من صفحة الدفع.</p>
      </div>
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

async function resizeImageFile(file: File, size: number): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.clearRect(0, 0, size, size);
    // contain: keep aspect ratio, center
    const scale = Math.min(size / bitmap.width, size / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png", 0.92));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" });
  } catch {
    return file;
  }
}

function ImageUploader({ images, onChange, max = 6, resizeTo }: { images: string[]; onChange: (imgs: string[]) => void; max?: number; resizeTo?: number }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        if (images.length + urls.length >= max) break;
        const toUpload = resizeTo ? await resizeImageFile(f, resizeTo) : f;
        const url = await uploadProductImage(toUpload);
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