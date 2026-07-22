import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---- Mocks ----
let authState: { userId: string | null } = { userId: null };
vi.mock("@/lib/use-auth", () => ({
  useAuth: () => ({
    ...authState,
    user: authState.userId ? { id: authState.userId } : null,
    loading: false,
  }),
}));

type Row = { id: string; order_id: string | null; type: string };

/** Rows the fake server currently returns for "unread notifications". */
let serverRows: Row[] = [];
/** Every filter the unread query applied, so the test can assert on them. */
let lastFilters: Record<string, unknown> = {};
/** Realtime callbacks registered on the notifications table. */
let realtimeCallbacks: Array<() => void> = [];
let removedChannels = 0;

type UnreadChain = {
  eq: (col: string, val: unknown) => UnreadChain;
  is: (col: string, val: unknown) => UnreadChain;
  order: () => UnreadChain;
  limit: () => Promise<{ data: Row[]; error: null }>;
};
type FakeChannel = {
  on: (evt: string, filter: unknown, cb: () => void) => FakeChannel;
  subscribe: () => FakeChannel;
};

vi.mock("@/integrations/supabase/client", () => {
  const unreadQuery = (): UnreadChain => {
    const chain: UnreadChain = {
      eq: (col, val) => {
        lastFilters[col] = val;
        return chain;
      },
      is: (col, val) => {
        lastFilters[`is:${col}`] = val;
        return chain;
      },
      order: () => chain,
      limit: async () => ({ data: serverRows, error: null }),
    };
    return chain;
  };
  return {
    supabase: {
      from: () => ({ select: () => unreadQuery() }),
      channel: () => {
        const ch: FakeChannel = {
          on: (_evt, _filter, cb) => {
            realtimeCallbacks.push(cb);
            return ch;
          },
          subscribe: () => ch,
        };
        return ch;
      },
      removeChannel: () => {
        removedChannels++;
      },
    },
  };
});

import { useUnreadCounts } from "@/lib/notifications";

function Badges() {
  const { total, orders, orderIds } = useUnreadCounts();
  return (
    <div>
      <span data-testid="bell">{total}</span>
      <span data-testid="orders-tab">{orders}</span>
      <span data-testid="order-ids">{[...orderIds].sort().join(",")}</span>
    </div>
  );
}

function renderBadges() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Badges />
    </QueryClientProvider>,
  );
}

/** Fire the realtime handler the way Supabase would on a notifications change. */
async function emitRealtime() {
  await act(async () => {
    realtimeCallbacks.forEach((cb) => cb());
    await Promise.resolve();
  });
}

beforeEach(() => {
  authState = { userId: "user-1" };
  serverRows = [];
  lastFilters = {};
  realtimeCallbacks = [];
  removedChannels = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("notification badges", () => {
  it("counts unread rows for the signed-in user: bell = all, طلباتي = order-linked only", async () => {
    serverRows = [
      { id: "n1", order_id: "o1", type: "order_status" },
      { id: "n2", order_id: "o1", type: "order_status" },
      { id: "n3", order_id: "o2", type: "order_status" },
      { id: "n4", order_id: null, type: "account_status" },
    ];
    renderBadges();

    await waitFor(() => expect(screen.getByTestId("bell").textContent).toBe("4"));
    // n4 is account_status with no order — it belongs to the bell, not طلباتي.
    expect(screen.getByTestId("orders-tab").textContent).toBe("3");
    // Two distinct orders carry an unread update.
    expect(screen.getByTestId("order-ids").textContent).toBe("o1,o2");
  });

  it("queries by user_id with read_at IS NULL — the same condition /notifications uses", async () => {
    renderBadges();
    await waitFor(() => expect(lastFilters.user_id).toBe("user-1"));
    expect(lastFilters["is:read_at"]).toBe(null);
  });

  it("increments live on a new notification, without a remount", async () => {
    serverRows = [{ id: "n1", order_id: "o1", type: "order_status" }];
    renderBadges();
    await waitFor(() => expect(screen.getByTestId("orders-tab").textContent).toBe("1"));

    // An order status change inserts a notification server-side.
    serverRows = [
      { id: "n1", order_id: "o1", type: "order_status" },
      { id: "n2", order_id: "o1", type: "order_status" },
    ];
    await emitRealtime();

    await waitFor(() => expect(screen.getByTestId("orders-tab").textContent).toBe("2"));
    expect(screen.getByTestId("bell").textContent).toBe("2");
  });

  it("clears live when the notifications are read", async () => {
    serverRows = [
      { id: "n1", order_id: "o1", type: "order_status" },
      { id: "n2", order_id: null, type: "account_status" },
    ];
    renderBadges();
    await waitFor(() => expect(screen.getByTestId("bell").textContent).toBe("2"));

    // read_at is set server-side (order opened, or "تعليم الكل كمقروء").
    serverRows = [];
    await emitRealtime();

    await waitFor(() => expect(screen.getByTestId("bell").textContent).toBe("0"));
    expect(screen.getByTestId("orders-tab").textContent).toBe("0");
    expect(screen.getByTestId("order-ids").textContent).toBe("");
  });

  it("is per-user, not per-device: the count never reads or writes localStorage", async () => {
    const touched: string[] = [];
    vi.stubGlobal("localStorage", {
      length: 0,
      getItem: (k: string) => {
        touched.push(`get:${k}`);
        return null;
      },
      setItem: (k: string) => {
        touched.push(`set:${k}`);
      },
      removeItem: (k: string) => {
        touched.push(`remove:${k}`);
      },
      clear: () => {
        touched.push("clear");
      },
      key: () => null,
    });

    serverRows = [{ id: "n1", order_id: "o1", type: "order_status" }];
    renderBadges();
    await waitFor(() => expect(screen.getByTestId("bell").textContent).toBe("1"));

    // A second device with cleared storage computes the identical count,
    // because nothing about the badge lives on the device.
    expect(touched).toEqual([]);
  });

  it("shows nothing when signed out and does not query", async () => {
    authState = { userId: null };
    serverRows = [{ id: "n1", order_id: "o1", type: "order_status" }];
    renderBadges();

    await waitFor(() => expect(screen.getByTestId("bell").textContent).toBe("0"));
    expect(lastFilters.user_id).toBeUndefined();
  });

  it("shares one realtime channel across every badge consumer", async () => {
    serverRows = [{ id: "n1", order_id: "o1", type: "order_status" }];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        {/* header bell + bottom nav + orders list all subscribe */}
        <Badges />
        <Badges />
        <Badges />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId("bell")[0].textContent).toBe("1"));
    expect(realtimeCallbacks).toHaveLength(1);

    // ...and it is torn down once the last consumer unmounts.
    unmount();
    expect(removedChannels).toBe(1);
  });
});
