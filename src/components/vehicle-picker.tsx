import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brandsQuery, carModelsQuery } from "@/lib/queries";
import { Car, Check, ChevronRight } from "lucide-react";

const STORAGE_KEY = "alsaaer_vehicle";

export type Vehicle = {
  brandId: string;
  brandName: string;
  brandLogo?: string | null;
  modelId: string;
  modelName: string;
  year: string;
  engine: string;
};

export function getSavedVehicle(): Vehicle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Vehicle) : null;
  } catch {
    return null;
  }
}

export function saveVehicle(v: Vehicle) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  window.dispatchEvent(new CustomEvent("vehicle-changed"));
}

export function clearVehicle() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("vehicle-changed"));
}

export function useSavedVehicle(): Vehicle | null {
  const [v, setV] = useState<Vehicle | null>(() => getSavedVehicle());
  useEffect(() => {
    const on = () => setV(getSavedVehicle());
    window.addEventListener("vehicle-changed", on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener("vehicle-changed", on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return v;
}

const ENGINES = ["1500 cc", "2000 cc", "2500 cc", "3000 cc", "3500 cc", "V6", "V8", "تيربو"];

export function VehiclePicker({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: brands = [] } = useQuery(brandsQuery());
  const { data: allModels = [] } = useQuery(carModelsQuery());

  const [step, setStep] = useState(1);
  const [brand, setBrand] = useState<{ id: string; name: string; logo?: string | null } | null>(null);
  const [model, setModel] = useState<{ id: string; name: string } | null>(null);
  const [year, setYear] = useState<string>("");
  const [engine, setEngine] = useState<string>("");

  useEffect(() => {
    if (open) {
      const v = getSavedVehicle();
      if (v) {
        setBrand({ id: v.brandId, name: v.brandName, logo: v.brandLogo });
        setModel({ id: v.modelId, name: v.modelName });
        setYear(v.year);
        setEngine(v.engine);
        setStep(1);
      } else {
        setBrand(null); setModel(null); setYear(""); setEngine(""); setStep(1);
      }
    }
  }, [open]);

  const models = useMemo(
    () => (brand ? allModels.filter((m) => m.brand_id === brand.id) : []),
    [allModels, brand],
  );

  const years = useMemo(() => {
    const arr: string[] = [];
    for (let y = 2025; y >= 2016; y--) arr.push(String(y));
    return arr;
  }, []);

  const finish = () => {
    if (!brand || !model || !year || !engine) return;
    saveVehicle({
      brandId: brand.id,
      brandName: brand.name,
      brandLogo: brand.logo ?? null,
      modelId: model.id,
      modelName: model.name,
      year,
      engine,
    });
    onOpenChange(false);
  };

  const steps = [
    { n: 1, label: "الشركة المصنعة" },
    { n: 2, label: "نوع السيارة" },
    { n: 3, label: "سنة الصنع" },
    { n: 4, label: "المحرك" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto p-0">
        <SheetHeader className="px-5 pt-5 pb-2">
          <SheetTitle className="text-center">اختيار المركبة</SheetTitle>
        </SheetHeader>

        {/* stepper */}
        <div className="px-5 pt-3 pb-4 flex items-center justify-between" dir="rtl">
          {steps.map((s, i) => {
            const done = step > s.n;
            const active = step === s.n;
            return (
              <div key={s.n} className="flex-1 flex items-center gap-2">
                <div className={`size-9 shrink-0 rounded-lg grid place-items-center text-sm font-bold ${active ? "bg-navy text-primary-foreground" : done ? "bg-gold text-navy" : "bg-muted text-muted-foreground"}`}>
                  {done ? <Check className="size-4" /> : s.n}
                </div>
                <div className="text-[11px] font-semibold flex-1 truncate">{s.label}</div>
                {i < steps.length - 1 && <div className="h-px bg-border flex-1" />}
              </div>
            );
          })}
        </div>

        <div className="px-5 pb-24">
          {step === 1 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 font-bold"><Car className="size-4" /> الشركة المصنعة</div>
                <div className="text-xs text-muted-foreground">
                  {brands.filter((b) =>
                    ["شوفرليت", "Chevrolet", "جمسي", "GMC", "GM"].some((n) =>
                      b.name_ar?.toLowerCase().includes(n.toLowerCase()) ||
                      b.name_en?.toLowerCase().includes(n.toLowerCase())
                    )
                  ).length} خيار
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {brands.filter((b) =>
                  ["شوفرليت", "Chevrolet", "جمسي", "GMC", "GM"].some((n) =>
                    b.name_ar?.toLowerCase().includes(n.toLowerCase()) ||
                    b.name_en?.toLowerCase().includes(n.toLowerCase())
                  )
                ).map((b) => {
                  const sel = brand?.id === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setBrand({ id: b.id, name: b.name_ar, logo: b.logo_url })}
                      className={`rounded-2xl border-2 p-3 bg-card flex flex-col items-center gap-2 transition ${sel ? "border-navy shadow-luxe" : "border-border"}`}
                    >
                      <div className="h-16 w-full grid place-items-center">
                        {b.logo_url ? (
                          <img src={b.logo_url} alt={b.name_ar} className="max-h-14 max-w-full object-contain" />
                        ) : (
                          <div className="text-2xl font-black text-navy">{b.name_en?.[0] ?? b.name_ar[0]}</div>
                        )}
                      </div>
                      <div className="font-bold text-sm text-navy">{b.name_en || b.name_ar}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold">نوع السيارة</div>
                <div className="text-xs text-muted-foreground">{models.length} خيار</div>
              </div>
              {models.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">لا توجد موديلات مسجلة لهذه الشركة</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {models.map((m) => {
                    const sel = model?.id === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setModel({ id: m.id, name: m.name_ar })}
                        className={`rounded-2xl border-2 p-4 bg-card text-start transition ${sel ? "border-navy shadow-luxe" : "border-border"}`}
                      >
                        <div className="font-bold text-sm text-navy">{m.name_ar}</div>
                        {m.name_en && <div className="text-xs text-muted-foreground mt-0.5">{m.name_en}</div>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="font-bold mb-3">سنة الصنع</div>
              <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto pe-1">
                {years.map((y) => {
                  const sel = year === y;
                  return (
                    <button
                      key={y}
                      onClick={() => setYear(y)}
                      className={`h-11 rounded-xl border-2 font-bold text-sm transition ${sel ? "border-navy bg-navy text-primary-foreground" : "border-border bg-card"}`}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <div className="font-bold mb-3">المحرك</div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {ENGINES.map((e) => {
                  const sel = engine === e;
                  return (
                    <button
                      key={e}
                      onClick={() => setEngine(e)}
                      className={`h-11 rounded-xl border-2 font-bold text-sm transition ${sel ? "border-navy bg-navy text-primary-foreground" : "border-border bg-card"}`}
                    >
                      {e}
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-muted-foreground mb-1">أو أدخل نوع المحرك يدوياً:</div>
              <Input value={engine} onChange={(e) => setEngine(e.target.value)} placeholder="مثال: 5.3L V8" />
            </div>
          )}
        </div>

        <div className="fixed bottom-0 inset-x-0 bg-card border-t border-border p-3 flex gap-2 max-w-md mx-auto">
          {step > 1 && (
            <Button variant="outline" className="flex-1" onClick={() => setStep(step - 1)}>
              السابق
            </Button>
          )}
          {step < 4 ? (
            <Button
              className="flex-1"
              disabled={(step === 1 && !brand) || (step === 2 && !model) || (step === 3 && !year)}
              onClick={() => setStep(step + 1)}
            >
              التالي <ChevronRight className="size-4 ms-1 rtl:rotate-180" />
            </Button>
          ) : (
            <Button className="flex-1" disabled={!engine} onClick={finish}>
              حفظ المركبة
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function VehicleBar({ onOpen }: { onOpen: () => void }) {
  const v = useSavedVehicle();
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 bg-navy text-primary-foreground rounded-2xl px-4 py-3 shadow-luxe"
    >
      <div className="size-10 rounded-xl bg-white/10 grid place-items-center overflow-hidden">
        {v?.brandLogo ? <img src={v.brandLogo} alt="" className="max-h-8 max-w-8 object-contain" /> : <Car className="size-5 text-gold" />}
      </div>
      <div className="flex-1 text-start min-w-0">
        <div className="text-[11px] text-gold font-bold">مركباتي</div>
        {v ? (
          <div className="text-sm font-extrabold truncate">
            {v.brandName} {v.modelName} · {v.year} · {v.engine}
          </div>
        ) : (
          <div className="text-sm font-bold">إدارة واختيار مركبتك</div>
        )}
      </div>
      <ChevronRight className="size-5 rtl:rotate-180 text-gold" />
    </button>
  );
}