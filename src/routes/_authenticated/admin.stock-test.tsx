import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsAdmin } from "@/lib/admin";
import { runStockTests } from "@/lib/stock-test.functions";
import { CheckCircle2, XCircle, Loader2, FlaskConical, ShieldAlert, ArrowRight } from "lucide-react";
import { toast } from "sonner";

type Check = { name: string; pass: boolean; expected: string; actual: string; detail?: string };
type Scenario = { scenario: string; description: string; checks: Check[] };
type Result = { ok: boolean; scenarios: Scenario[]; summary: { passed: number; failed: number } };

export const Route = createFileRoute("/_authenticated/admin/stock-test")({
  component: StockTestPage,
  head: () => ({
    meta: [{ title: "اختبار حركات المخزون" }, { name: "robots", content: "noindex" }],
  }),
});

function StockTestPage() {
  const { isAdmin, loading } = useIsAdmin();
  const runFn = useServerFn(runStockTests);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  if (loading) return <PageShell title="اختبار المخزون"><div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div></PageShell>;
  if (!isAdmin) {
    return (
      <PageShell title="اختبار المخزون">
        <div className="mx-auto max-w-md p-6 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <p className="text-muted-foreground">هذه الصفحة متاحة للمشرفين فقط.</p>
        </div>
      </PageShell>
    );
  }

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = (await runFn()) as Result;
      setResult(res);
      if (res.ok) toast.success(`نجحت جميع الفحوصات (${res.summary.passed})`);
      else toast.error(`فشل ${res.summary.failed} من ${res.summary.passed + res.summary.failed}`);
    } catch (e) {
      toast.error((e as Error).message || "فشل تشغيل الاختبار");
    } finally {
      setRunning(false);
    }
  };

  return (
    <PageShell title="اختبار حركات المخزون">
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-5 w-5 text-primary" />
              فحص تلقائي شامل
            </CardTitle>
            <Link to="/admin" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              العودة للوحة <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground leading-relaxed">
              ينشئ منتجات وطلبات مؤقتة، يُشغّل سيناريوهات: <b>الإلغاء</b>، <b>حفظ بنفس الحالة</b>،
              <b> إعادة التفعيل</b>، <b>حذف طلب نشط</b>، <b>حذف طلب ملغى</b>، و<b>سلسلة تغيير حالات</b>،
              ثم يتحقق أن المخزون رجع/خُصم بشكل صحيح بدون تكرار — ويحذف كل شيء تلقائياً بعد الانتهاء.
            </p>
            <Button onClick={run} disabled={running} className="w-full">
              {running ? (<><Loader2 className="ms-2 h-4 w-4 animate-spin" /> جارٍ التنفيذ…</>) : "تشغيل الاختبار الآن"}
            </Button>
          </CardContent>
        </Card>

        {result && (
          <>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  {result.ok ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  ) : (
                    <XCircle className="h-6 w-6 text-destructive" />
                  )}
                  <div>
                    <div className="font-semibold">{result.ok ? "كل شيء سليم" : "توجد أخطاء"}</div>
                    <div className="text-xs text-muted-foreground">
                      نجح {result.summary.passed} • فشل {result.summary.failed}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {result.scenarios.map((s, i) => {
              const failed = s.checks.filter((c) => !c.pass).length;
              return (
                <Card key={i}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        {failed === 0 ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        {s.scenario}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {s.checks.length - failed}/{s.checks.length}
                      </span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {s.checks.map((c, j) => (
                      <div
                        key={j}
                        className={`rounded-md border p-2 text-xs ${
                          c.pass ? "border-green-500/30 bg-green-500/5" : "border-destructive/40 bg-destructive/5"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {c.pass ? (
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                          ) : (
                            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                          )}
                          <div className="flex-1 space-y-0.5">
                            <div className="font-medium">{c.name}</div>
                            {!c.pass && (
                              <div className="font-mono text-[11px] text-muted-foreground">
                                متوقع: {c.expected} • فعلي: {c.actual}
                                {c.detail ? <div className="opacity-70">{c.detail}</div> : null}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}
      </div>
    </PageShell>
  );
}