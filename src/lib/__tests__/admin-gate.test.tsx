import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---- Mocks ----
let authState: { userId: string | null; loading: boolean } = {
  userId: null,
  loading: true,
};
vi.mock("@/lib/use-auth", () => ({
  useAuth: () => ({ ...authState, user: authState.userId ? { id: authState.userId } : null }),
}));

type Resolver<T> = (v: T) => void;
let adminResolver: Resolver<{ data: unknown; error: null }> | null = null;
let staffResolver: Resolver<{ data: unknown; error: null }> | null = null;

function pending<T>(setResolver: (r: Resolver<T>) => void) {
  return new Promise<T>((resolve) => setResolver(resolve));
}

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => pending((r) => (adminResolver = r)),
        }),
        maybeSingle: () => pending((r) => (staffResolver = r)),
      }),
    }),
  });
  return {
    supabase: {
      from,
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    },
  };
});

// Import AFTER mocks
import { useIsAdminStatus, useStaffPermissionsStatus } from "@/lib/admin";

function Harness() {
  const { isAdmin, isLoading: adminLoading, isError: adminError } = useIsAdminStatus();
  const { staff, isLoading: staffLoading, isError: staffError } = useStaffPermissionsStatus();
  if (adminLoading || staffLoading) {
    return <div data-testid="state">جاري التحقق من الصلاحيات…</div>;
  }
  if (adminError || staffError) {
    return <div data-testid="state">تعذر التحقق من الصلاحيات</div>;
  }
  const hasAccess =
    isAdmin ||
    !!staff?.can_orders ||
    !!staff?.can_products ||
    !!staff?.can_replacements ||
    !!staff?.can_block;
  if (!hasAccess) return <div data-testid="state">ليس لديك صلاحية</div>;
  return <div data-testid="state">لوحة الإدارة</div>;
}

function renderHarness() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  authState = { userId: null, loading: true };
  adminResolver = null;
  staffResolver = null;
});

describe("Admin permission gate", () => {
  it("shows loading while auth is still resolving", () => {
    renderHarness();
    expect(screen.getByTestId("state").textContent).toContain("جاري التحقق");
    expect(screen.queryByText(/ليس لديك صلاحية/)).toBeNull();
  });

  it("keeps loading after auth resolves but before permissions arrive", async () => {
    const { rerender } = renderHarness();
    // Simulate auth becoming ready with a userId
    await act(async () => {
      authState = { userId: "u1", loading: false };
      rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <Harness />
        </QueryClientProvider>,
      );
    });
    // Permission queries are still pending
    expect(screen.getByTestId("state").textContent).toContain("جاري التحقق");
    expect(screen.queryByText(/ليس لديك صلاحية/)).toBeNull();
  });

  it("does not flash 'no permission' when permissions eventually grant access", async () => {
    authState = { userId: "u1", loading: false };
    renderHarness();

    // Skeleton must be visible while queries pend
    expect(screen.getByTestId("state").textContent).toContain("جاري التحقق");
    expect(screen.queryByText(/ليس لديك صلاحية/)).toBeNull();

    // Resolve admin=false but staff grants can_block
    await waitFor(() => expect(adminResolver).toBeTruthy());
    await waitFor(() => expect(staffResolver).toBeTruthy());
    await act(async () => {
      adminResolver!({ data: null, error: null });
      staffResolver!({
        data: { can_orders: false, can_products: false, can_replacements: false, can_block: true },
        error: null,
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toContain("لوحة الإدارة"),
    );
    // Never rendered the "no permission" screen
    expect(screen.queryByText(/ليس لديك صلاحية/)).toBeNull();
  });

  it("shows 'no permission' only after both queries resolve with no access", async () => {
    authState = { userId: "u1", loading: false };
    renderHarness();

    await waitFor(() => expect(adminResolver).toBeTruthy());
    await waitFor(() => expect(staffResolver).toBeTruthy());
    await act(async () => {
      adminResolver!({ data: null, error: null });
      staffResolver!({ data: null, error: null });
    });

    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toContain("ليس لديك صلاحية"),
    );
  });

  it("shows professional error message (not 'no permission') when admin query fails", async () => {
    authState = { userId: "u1", loading: false };
    renderHarness();

    // Skeleton visible while pending
    expect(screen.getByTestId("state").textContent).toContain("جاري التحقق");

    await waitFor(() => expect(adminResolver).toBeTruthy());
    await waitFor(() => expect(staffResolver).toBeTruthy());
    await act(async () => {
      adminResolver!({ data: null, error: { message: "network down" } });
      staffResolver!({ data: null, error: null });
    });

    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toContain("تعذر التحقق"),
    );
    // The false-permission screen must never appear on network errors
    expect(screen.queryByText(/ليس لديك صلاحية/)).toBeNull();
  });

  it("shows professional error when staff permissions query fails", async () => {
    authState = { userId: "u1", loading: false };
    renderHarness();

    await waitFor(() => expect(adminResolver).toBeTruthy());
    await waitFor(() => expect(staffResolver).toBeTruthy());
    await act(async () => {
      adminResolver!({ data: null, error: null });
      staffResolver!({ data: null, error: { message: "PGRST timeout" } });
    });

    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toContain("تعذر التحقق"),
    );
    expect(screen.queryByText(/ليس لديك صلاحية/)).toBeNull();
  });

  it("stays on skeleton when queries never resolve (timeout in-flight)", async () => {
    authState = { userId: "u1", loading: false };
    renderHarness();

    // Wait long enough that if the gate were to bail out early, it would have
    await new Promise((r) => setTimeout(r, 150));

    expect(screen.getByTestId("state").textContent).toContain("جاري التحقق");
    expect(screen.queryByText(/ليس لديك صلاحية/)).toBeNull();
    expect(screen.queryByText(/تعذر التحقق/)).toBeNull();
  });
});