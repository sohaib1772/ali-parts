import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Product = {
  id: string;
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  oem_number: string | null;
  price_iqd: number;
  price_usd: number;
  compare_price_iqd: number | null;
  shipping_iqd: number | null;
  category_id: string | null;
  brand_id: string | null;
  compatible_models: string[] | null;
  images: string[] | null;
  in_stock: boolean;
  is_featured: boolean;
  is_deal: boolean;
  specs: Record<string, unknown> | null;
  deal_expires_at?: string | null;
};

export type Category = { id: string; name_ar: string; name_en: string; icon: string | null; image_url: string | null; sort_order: number | null };
export type Brand = { id: string; name_ar: string; name_en: string; logo_url: string | null };
export type CarModel = { id: string; brand_id: string | null; name_ar: string; name_en: string };
export type Banner = { id: string; title_ar: string | null; subtitle_ar: string | null; image_url: string; link: string | null; expires_at?: string | null };

export const categoriesQuery = () =>
  queryOptions({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

export const brandsQuery = () =>
  queryOptions({
    queryKey: ["brands"],
    queryFn: async () => {
      const { data, error } = await supabase.from("brands").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Brand[];
    },
  });

export const carModelsQuery = () =>
  queryOptions({
    queryKey: ["car_models"],
    queryFn: async () => {
      const { data, error } = await supabase.from("car_models").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as CarModel[];
    },
  });

export const bannersQuery = () =>
  queryOptions({
    queryKey: ["banners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("banners").select("*").eq("is_active", true).order("sort_order");
      if (error) throw error;
      const now = Date.now();
      return ((data ?? []) as Banner[]).filter((b) => !b.expires_at || new Date(b.expires_at).getTime() > now);
    },
  });

export const featuredProductsQuery = () =>
  queryOptions({
    queryKey: ["products", "featured"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("is_featured", true).order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

export const dealsQuery = () =>
  queryOptions({
    queryKey: ["products", "deals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("is_deal", true).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      const now = Date.now();
      return ((data ?? []) as Product[]).filter(
        (p) => !p.deal_expires_at || new Date(p.deal_expires_at).getTime() > now,
      );
    },
  });

export const bestSellersQuery = () =>
  queryOptions({
    queryKey: ["products", "best-sellers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("sales_count", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as (Product & { sales_count: number })[];
    },
  });

export const productByIdQuery = (id: string) =>
  queryOptions({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Product;
    },
  });

export const productsByCategoryQuery = (categoryId: string) =>
  queryOptions({
    queryKey: ["products", "category", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("category_id", categoryId);
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

export const searchProductsQuery = (q: string) =>
  queryOptions({
    queryKey: ["products", "search", q],
    queryFn: async () => {
      if (!q.trim()) return [] as Product[];
      const pattern = `%${q}%`;
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .or(`name_ar.ilike.${pattern},oem_number.ilike.${pattern},name_en.ilike.${pattern}`)
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Product[];
    },
    enabled: q.trim().length > 0,
  });

export const productsByIdsQuery = (ids: string[]) =>
  queryOptions({
    queryKey: ["products", "by-ids", ids],
    queryFn: async () => {
      if (!ids.length) return [] as Product[];
      const { data, error } = await supabase.from("products").select("*").in("id", ids);
      if (error) throw error;
      const map = new Map((data ?? []).map((p) => [p.id, p as Product]));
      return ids.map((id) => map.get(id)).filter((v): v is Product => !!v);
    },
    enabled: ids.length > 0,
  });

export const cartQuery = (userId: string | null) =>
  queryOptions({
    queryKey: ["cart", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("cart_items")
        .select("id, quantity, side, note, product_id, product:products(*)")
        .eq("user_id", userId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });

export const favoritesQuery = (userId: string | null) =>
  queryOptions({
    queryKey: ["favorites", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("favorites")
        .select("id, product:products(*)")
        .eq("user_id", userId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });

export const ordersQuery = (userId: string | null) =>
  queryOptions({
    queryKey: ["orders", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });

export const orderByIdQuery = (id: string) =>
  queryOptions({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data: order, error } = await supabase.from("orders").select("*").eq("id", id).single();
      if (error) throw error;
      const { data: items } = await supabase.from("order_items").select("*").eq("order_id", id);
      let customer: { full_name: string | null; phone: string | null } | null = null;
      if (order?.user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("id", order.user_id)
          .maybeSingle();
        if (profile) customer = { full_name: profile.full_name, phone: profile.phone };
      }
      return { order, items: items ?? [], customer };
    },
  });

export const addressesQuery = (userId: string | null) =>
  queryOptions({
    queryKey: ["addresses", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase.from("addresses").select("*").eq("user_id", userId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });

export const profileQuery = (userId: string | null) =>
  queryOptions({
    queryKey: ["profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      return data;
    },
    enabled: !!userId,
  });