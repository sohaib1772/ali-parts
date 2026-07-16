import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { MapPin, Plus, Trash2, Check, Pencil, ChevronDown, Search, X } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { addressesQuery } from "@/lib/queries";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const IRAQ_GOVERNORATES = [
  "بغداد",
  "البصرة",
  "نينوى",
  "أربيل",
  "النجف",
  "كربلاء",
  "بابل",
  "ذي قار",
  "ديالى",
  "الأنبار",
  "صلاح الدين",
  "كركوك",
  "واسط",
  "ميسان",
  "المثنى",
  "القادسية",
  "دهوك",
  "السليمانية",
  "حلبجة",
];

// Aliases / common alt spellings so search is forgiving
const GOV_ALIASES: Record<string, string[]> = {
  "بغداد": ["baghdad", "العاصمة"],
  "البصرة": ["basra", "basrah", "بصرة"],
  "نينوى": ["nineveh", "mosul", "الموصل", "موصل"],
  "أربيل": ["erbil", "arbil", "hawler", "اربيل", "هولير"],
  "النجف": ["najaf", "نجف"],
  "كربلاء": ["karbala"],
  "بابل": ["babil", "babylon", "hilla", "الحلة", "حلة"],
  "ذي قار": ["thi qar", "dhi qar", "ناصرية", "الناصرية", "ذيقار"],
  "ديالى": ["diyala", "baquba", "بعقوبة"],
  "الأنبار": ["anbar", "الرمادي", "ramadi", "انبار"],
  "صلاح الدين": ["salah al-din", "salahaddin", "تكريت", "tikrit"],
  "كركوك": ["kirkuk"],
  "واسط": ["wasit", "الكوت", "kut"],
  "ميسان": ["maysan", "missan", "العمارة", "amara"],
  "المثنى": ["muthanna", "السماوة", "samawah", "مثنى"],
  "القادسية": ["qadisiyah", "diwaniyah", "الديوانية", "قادسية"],
  "دهوك": ["duhok", "dohuk"],
  "السليمانية": ["sulaymaniyah", "sulaimani", "سليمانية"],
  "حلبجة": ["halabja"],
};

function normalizeAr(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670]/g, "") // diacritics
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/گ/g, "ك")
    .replace(/\s+/g, " ")
    .trim();
}

function useGovernorateFrequency() {
  const [freq, setFreq] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem("gov-frequency");
      if (raw) setFreq(JSON.parse(raw));
    } catch {}
  }, []);
  const bump = (g: string) => {
    setFreq((prev) => {
      const next = { ...prev, [g]: (prev[g] ?? 0) + 1 };
      try {
        localStorage.setItem("gov-frequency", JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  return { freq, bump };
}

function GovernoratePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { freq, bump } = useGovernorateFrequency();
  const filtered = useMemo(() => {
    const s = normalizeAr(q).trim();
    if (!s) {
      return [...IRAQ_GOVERNORATES].sort((a, b) => (freq[b] ?? 0) - (freq[a] ?? 0));
    }
    const score = (g: string): number => {
      const ng = normalizeAr(g);
      const f = freq[g] ?? 0;
      if (ng === s) return 1000 + f * 10;
      if (ng.startsWith(s)) return 500 + f * 10;
      if (ng.includes(s)) return 300 + f * 10;
      const aliases = GOV_ALIASES[g] ?? [];
      let aliasScore = 0;
      for (const a of aliases) {
        const na = normalizeAr(a);
        if (na === s) aliasScore = Math.max(aliasScore, 200);
        else if (na.startsWith(s)) aliasScore = Math.max(aliasScore, 150);
        else if (na.includes(s)) aliasScore = Math.max(aliasScore, 100);
      }
      return aliasScore ? aliasScore + f * 10 : 0;
    };
    return IRAQ_GOVERNORATES.map((g) => ({ g, s: score(g) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.g.localeCompare(b.g, "ar"))
      .map((x) => x.g);
  }, [q, freq]);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-11 w-full px-4 rounded-xl bg-card border border-border text-sm outline-none focus:border-gold flex items-center justify-between text-start"
      >
        <span className={value ? "" : "text-muted-foreground"}>{value || "المحافظة"}</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md bg-background rounded-t-3xl sm:rounded-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 p-4 border-b border-border">
              <div className="font-bold flex-1">اختر المحافظة</div>
              <button type="button" onClick={() => setOpen(false)} className="size-8 rounded-full bg-muted grid place-items-center">
                <X className="size-4" />
              </button>
            </div>
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="size-4 text-muted-foreground absolute top-1/2 -translate-y-1/2 start-3" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ابحث عن محافظة..."
                  className="h-11 w-full ps-10 pe-4 rounded-xl bg-card border border-border text-sm outline-none focus:border-gold"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">لا توجد نتائج</div>
              ) : (
                filtered.map((g) => (
                    <button
                    key={g}
                    type="button"
                    onClick={() => { onChange(g); bump(g); setOpen(false); }}
                    className={`w-full text-start px-4 py-3 rounded-xl hover:bg-muted transition flex items-center justify-between ${value === g ? "bg-gold/10 text-gold font-bold" : ""}`}
                  >
                    <span>{g}</span>
                    {value === g && <Check className="size-4" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export const Route = createFileRoute("/_authenticated/addresses")({
  component: AddressesPage,
});

function AddressesPage() {
  const { userId } = useAuth();
  const { data: addresses = [] } = useQuery(addressesQuery(userId));
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const remove = async (id: string) => {
    await supabase.from("addresses").delete().eq("id", id);
    toast.success("حُذف العنوان");
    qc.invalidateQueries({ queryKey: ["addresses"] });
  };

  const makeDefault = async (id: string) => {
    await supabase.from("addresses").update({ is_default: false }).eq("user_id", userId!);
    await supabase.from("addresses").update({ is_default: true }).eq("id", id);
    toast.success("تم تعيين العنوان الرئيسي");
    qc.invalidateQueries({ queryKey: ["addresses"] });
  };

  return (
    <PageShell title="عناويني">
      <div className="px-4 pt-4 space-y-3">
        {addresses.length === 0 && !adding && (
          <div className="py-16 text-center">
            <div className="size-20 rounded-full bg-muted grid place-items-center mx-auto mb-4">
              <MapPin className="size-10 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-6">لا توجد عناوين محفوظة</p>
          </div>
        )}
        {addresses.map((a: any) =>
          editingId === a.id ? (
            <AddressForm
              key={a.id}
              onDone={() => setEditingId(null)}
              addressId={a.id}
              initial={{
                full_name: a.full_name || "",
                city: a.city || "",
                area: a.area || "",
                street: a.street || "",
                phone: a.phone || "",
                phone2: a.phone2 || "",
              }}
            />
          ) : (
            <div key={a.id} className="bg-card rounded-2xl border border-border p-4 shadow-card">
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-xl bg-gold/10 text-gold grid place-items-center flex-shrink-0"><MapPin className="size-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-bold text-sm">{a.label ?? "عنوان"}</div>
                    {a.is_default && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold/20 text-gold font-bold">افتراضي</span>}
                  </div>
                  <div className="text-sm mt-1">{a.full_name} · {a.phone}{a.phone2 ? ` · ${a.phone2}` : ""}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{a.city} · {a.area}{a.street ? ` · ${a.street}` : ""}</div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                {!a.is_default && (
                  <button onClick={() => makeDefault(a.id)} className="flex-1 h-9 rounded-xl bg-muted text-navy text-xs font-bold flex items-center justify-center gap-1">
                    <Check className="size-3.5" /> اجعله افتراضياً
                  </button>
                )}
                <button onClick={() => setEditingId(a.id)} className="size-9 rounded-xl bg-gold/10 text-gold grid place-items-center">
                  <Pencil className="size-4" />
                </button>
                <button onClick={() => remove(a.id)} className="size-9 rounded-xl bg-destructive/10 text-destructive grid place-items-center">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          )
        )}

        {adding ? (
          <AddressForm onDone={() => setAdding(false)} />
        ) : (
          <button onClick={() => setAdding(true)} className="w-full h-12 rounded-2xl border-2 border-dashed border-gold text-gold font-bold flex items-center justify-center gap-2">
            <Plus className="size-4" /> إضافة عنوان جديد
          </button>
        )}
      </div>
    </PageShell>
  );
}

function AddressForm({
  onDone,
  addressId,
  initial,
}: {
  onDone: () => void;
  addressId?: string;
  initial?: {
    full_name: string;
    city: string;
    area: string;
    street: string;
    phone: string;
    phone2: string;
  };
}) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState(initial ?? { full_name: "", city: "بغداد", area: "", street: "", phone: "", phone2: "" });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    if (addressId) {
      const { error } = await supabase.from("addresses").update(f).eq("id", addressId);
      if (error) return toast.error("تعذّر تحديث العنوان");
      toast.success("تم تحديث العنوان");
    } else {
      const { error } = await supabase.from("addresses").insert({ ...f, user_id: userId } as any);
      if (error) return toast.error("تعذّر الحفظ");
      toast.success("تمت إضافة العنوان");
    }
    qc.invalidateQueries({ queryKey: ["addresses"] });
    onDone();
  };

  const input = (k: keyof typeof f, ph: string, req = true, type: string = "text") => (
    <input required={req} type={type} placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}
      className="h-11 w-full px-4 rounded-xl bg-card border border-border text-sm outline-none focus:border-gold" />
  );

  return (
    <form onSubmit={save} className="bg-card rounded-2xl border border-border p-4 shadow-card space-y-2">
      {input("full_name", "الاسم")}
      <GovernoratePicker value={f.city} onChange={(v) => setF({ ...f, city: v })} />
      {input("area", "المنطقة")}
      {input("street", "أقرب نقطة دالة", false)}
      {input("phone", "الرقم الأول", true, "tel")}
      {input("phone2", "الرقم الثاني (اختياري)", false, "tel")}
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onDone} className="flex-1 h-11 rounded-xl border border-border font-bold text-sm">إلغاء</button>
        <button type="submit" className="flex-1 h-11 rounded-xl bg-gradient-gold text-navy font-bold text-sm shadow-gold">{addressId ? "تحديث" : "حفظ"}</button>
      </div>
    </form>
  );
}