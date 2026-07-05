export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          area: string | null
          city: string
          created_at: string
          full_name: string
          id: string
          is_default: boolean
          label: string | null
          notes: string | null
          phone: string
          street: string | null
          user_id: string
        }
        Insert: {
          area?: string | null
          city: string
          created_at?: string
          full_name: string
          id?: string
          is_default?: boolean
          label?: string | null
          notes?: string | null
          phone: string
          street?: string | null
          user_id: string
        }
        Update: {
          area?: string | null
          city?: string
          created_at?: string
          full_name?: string
          id?: string
          is_default?: boolean
          label?: string | null
          notes?: string | null
          phone?: string
          street?: string | null
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      banner_comments: {
        Row: {
          banner_id: string
          content: string
          created_at: string
          id: string
          is_admin_reply: boolean
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          banner_id: string
          content: string
          created_at?: string
          id?: string
          is_admin_reply?: boolean
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          banner_id?: string
          content?: string
          created_at?: string
          id?: string
          is_admin_reply?: boolean
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "banner_comments_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "banners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banner_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "banner_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      banner_likes: {
        Row: {
          banner_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          banner_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          banner_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "banner_likes_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "banners"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          expires_at: string | null
          id: string
          image_url: string
          is_active: boolean
          link: string | null
          sort_order: number | null
          subtitle_ar: string | null
          title_ar: string | null
          video_url: string | null
        }
        Insert: {
          expires_at?: string | null
          id?: string
          image_url: string
          is_active?: boolean
          link?: string | null
          sort_order?: number | null
          subtitle_ar?: string | null
          title_ar?: string | null
          video_url?: string | null
        }
        Update: {
          expires_at?: string | null
          id?: string
          image_url?: string
          is_active?: boolean
          link?: string | null
          sort_order?: number | null
          subtitle_ar?: string | null
          title_ar?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      brands: {
        Row: {
          id: string
          logo_url: string | null
          name_ar: string
          name_en: string
          sort_order: number | null
        }
        Insert: {
          id?: string
          logo_url?: string | null
          name_ar: string
          name_en: string
          sort_order?: number | null
        }
        Update: {
          id?: string
          logo_url?: string | null
          name_ar?: string
          name_en?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      car_models: {
        Row: {
          brand_id: string | null
          id: string
          image_url: string | null
          name_ar: string
          name_en: string
          sort_order: number | null
        }
        Insert: {
          brand_id?: string | null
          id?: string
          image_url?: string | null
          name_ar: string
          name_en: string
          sort_order?: number | null
        }
        Update: {
          brand_id?: string | null
          id?: string
          image_url?: string | null
          name_ar?: string
          name_en?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "car_models_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          created_at: string
          id: string
          note: string | null
          product_id: string
          quantity: number
          side: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          product_id: string
          quantity?: number
          side?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          product_id?: string
          quantity?: number
          side?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          icon: string | null
          id: string
          image_url: string | null
          name_ar: string
          name_en: string
          sort_order: number | null
        }
        Insert: {
          icon?: string | null
          id?: string
          image_url?: string | null
          name_ar: string
          name_en: string
          sort_order?: number | null
        }
        Update: {
          icon?: string | null
          id?: string
          image_url?: string | null
          name_ar?: string
          name_en?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          order_id: string | null
          read_at: string | null
          status: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          read_at?: string | null
          status?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          read_at?: string | null
          status?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          image_url: string | null
          name_ar: string
          note: string | null
          oem_number: string | null
          order_id: string
          product_id: string | null
          quantity: number
          side: string | null
          unit_price_iqd: number
        }
        Insert: {
          id?: string
          image_url?: string | null
          name_ar: string
          note?: string | null
          oem_number?: string | null
          order_id: string
          product_id?: string | null
          quantity: number
          side?: string | null
          unit_price_iqd: number
        }
        Update: {
          id?: string
          image_url?: string | null
          name_ar?: string
          note?: string | null
          oem_number?: string | null
          order_id?: string
          product_id?: string | null
          quantity?: number
          side?: string | null
          unit_price_iqd?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address: Json
          created_at: string
          id: string
          notes: string | null
          order_number: string
          payment_method: string
          points_earned: number
          points_used: number
          shipping_iqd: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal_iqd: number
          total_iqd: number
          user_id: string
        }
        Insert: {
          address: Json
          created_at?: string
          id?: string
          notes?: string | null
          order_number?: string
          payment_method?: string
          points_earned?: number
          points_used?: number
          shipping_iqd?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_iqd?: number
          total_iqd?: number
          user_id: string
        }
        Update: {
          address?: Json
          created_at?: string
          id?: string
          notes?: string | null
          order_number?: string
          payment_method?: string
          points_earned?: number
          points_used?: number
          shipping_iqd?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_iqd?: number
          total_iqd?: number
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          brand_id: string | null
          category_id: string | null
          compare_price_iqd: number | null
          compatible_models: string[] | null
          created_at: string
          deal_expires_at: string | null
          description_ar: string | null
          id: string
          images: string[] | null
          in_stock: boolean
          is_deal: boolean
          is_featured: boolean
          name_ar: string
          name_en: string | null
          oem_number: string | null
          price_iqd: number
          price_usd: number
          sales_count: number
          shipping_iqd: number
          specs: Json | null
        }
        Insert: {
          brand_id?: string | null
          category_id?: string | null
          compare_price_iqd?: number | null
          compatible_models?: string[] | null
          created_at?: string
          deal_expires_at?: string | null
          description_ar?: string | null
          id?: string
          images?: string[] | null
          in_stock?: boolean
          is_deal?: boolean
          is_featured?: boolean
          name_ar: string
          name_en?: string | null
          oem_number?: string | null
          price_iqd?: number
          price_usd?: number
          sales_count?: number
          shipping_iqd?: number
          specs?: Json | null
        }
        Update: {
          brand_id?: string | null
          category_id?: string | null
          compare_price_iqd?: number | null
          compatible_models?: string[] | null
          created_at?: string
          deal_expires_at?: string | null
          description_ar?: string | null
          id?: string
          images?: string[] | null
          in_stock?: boolean
          is_deal?: boolean
          is_featured?: boolean
          name_ar?: string
          name_en?: string | null
          oem_number?: string | null
          price_iqd?: number
          price_usd?: number
          sales_count?: number
          shipping_iqd?: number
          specs?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          is_blocked: boolean
          phone: string | null
          points_balance: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_blocked?: boolean
          phone?: string | null
          points_balance?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_blocked?: boolean
          phone?: string | null
          points_balance?: number
        }
        Relationships: []
      }
      user_block_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _contains_profanity: { Args: { input: string }; Returns: boolean }
      _normalize_ar: { Args: { input: string }; Returns: string }
      add_cart_item: {
        Args: { p_product_id: string; p_quantity?: number; p_side?: string }
        Returns: undefined
      }
      admin_set_user_blocked: {
        Args: { p_blocked: boolean; p_reason?: string; p_user_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      place_order: {
        Args: {
          p_address: Json
          p_notes: string
          p_payment: string
          p_points_used: number
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user"
      order_status:
        | "received"
        | "preparing"
        | "packed"
        | "shipped"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      order_status: [
        "received",
        "preparing",
        "packed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
    },
  },
} as const
