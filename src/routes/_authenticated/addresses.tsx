import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MapPin, Plus, Trash2, Check } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { addressesQuery } from "@/lib/queries";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/addresses")({
  component: AddressesPage,
});

function AddressesPage() {
  const { userId } = useAuth();
  const { data: addresses = [] } = useQuery(addressesQuery(userId));
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

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
        {addresses.map((a: any) => (
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
              <button onClick={() => remove(a.id)} className="size-9 rounded-xl bg-destructive/10 text-destructive grid place-items-center">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}

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

function AddressForm({ onDone }: { onDone: () => void }) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState({ full_name: "", city: "بغداد", area: "", street: "", phone: "", phone2: "" });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    const { error } = await supabase.from("addresses").insert({ ...f, user_id: userId } as any);
    if (error) return toast.error("تعذّر الحفظ");
    toast.success("تمت إضافة العنوان");
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
      {input("city", "المحافظة")}
      {input("area", "المنطقة")}
      {input("street", "أقرب نقطة دالة")}
      {input("phone", "الرقم الأول", true, "tel")}
      {input("phone2", "الرقم الثاني (اختياري)", false, "tel")}
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onDone} className="flex-1 h-11 rounded-xl border border-border font-bold text-sm">إلغاء</button>
        <button type="submit" className="flex-1 h-11 rounded-xl bg-gradient-gold text-navy font-bold text-sm shadow-gold">حفظ</button>
      </div>
    </form>
  );
}