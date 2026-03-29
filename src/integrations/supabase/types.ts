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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      assets: {
        Row: {
          boxes: Json | null
          created_at: string
          height_pt: number | null
          id: string
          media_type: string
          metadata: Json
          normalized_storage_path: string | null
          original_filename: string
          page_count: number | null
          preview_storage_path: string | null
          source_storage_path: string
          status: string
          thumbnail_storage_path: string | null
          updated_at: string
          width_pt: number | null
        }
        Insert: {
          boxes?: Json | null
          created_at?: string
          height_pt?: number | null
          id?: string
          media_type: string
          metadata?: Json
          normalized_storage_path?: string | null
          original_filename: string
          page_count?: number | null
          preview_storage_path?: string | null
          source_storage_path: string
          status?: string
          thumbnail_storage_path?: string | null
          updated_at?: string
          width_pt?: number | null
        }
        Update: {
          boxes?: Json | null
          created_at?: string
          height_pt?: number | null
          id?: string
          media_type?: string
          metadata?: Json
          normalized_storage_path?: string | null
          original_filename?: string
          page_count?: number | null
          preview_storage_path?: string | null
          source_storage_path?: string
          status?: string
          thumbnail_storage_path?: string | null
          updated_at?: string
          width_pt?: number | null
        }
        Relationships: []
      }
      branch_capabilities: {
        Row: {
          branch_id: string
          created_at: string
          finishing_options: Json
          id: string
          is_enabled: boolean
          max_pages: number | null
          max_quantity: number | null
          min_pages: number | null
          min_quantity: number | null
          outage_until: string | null
          product_family_id: string
          supports_color: boolean
          temporary_outage: boolean
          turnaround_levels: Json
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          finishing_options?: Json
          id?: string
          is_enabled?: boolean
          max_pages?: number | null
          max_quantity?: number | null
          min_pages?: number | null
          min_quantity?: number | null
          outage_until?: string | null
          product_family_id: string
          supports_color?: boolean
          temporary_outage?: boolean
          turnaround_levels?: Json
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          finishing_options?: Json
          id?: string
          is_enabled?: boolean
          max_pages?: number | null
          max_quantity?: number | null
          min_pages?: number | null
          min_quantity?: number | null
          outage_until?: string | null
          product_family_id?: string
          supports_color?: boolean
          temporary_outage?: boolean
          turnaround_levels?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_capabilities_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_capabilities_product_family_id_fkey"
            columns: ["product_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          city: string | null
          country: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          postal_code: string | null
          province: string | null
          settings: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          settings?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          settings?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      derived_files: {
        Row: {
          asset_id: string | null
          created_at: string
          height: number | null
          id: string
          job_id: string | null
          kind: string
          media_type: string
          metadata: Json
          page: number | null
          storage_path: string
          width: number | null
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          height?: number | null
          id?: string
          job_id?: string | null
          kind: string
          media_type: string
          metadata?: Json
          page?: number | null
          storage_path: string
          width?: number | null
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          height?: number | null
          id?: string
          job_id?: string | null
          kind?: string
          media_type?: string
          metadata?: Json
          page?: number | null
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "derived_files_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "derived_files_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      document_sections: {
        Row: {
          color: string | null
          created_at: string
          document_id: string | null
          id: string
          is_color: boolean
          is_duplex: boolean
          label: string | null
          lamination: string | null
          order_item_id: string
          page_range_end: number | null
          page_range_start: number | null
          paper_stock: string | null
          paper_weight_gsm: number | null
          section_type: Database["public"]["Enums"]["section_type"]
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          is_color?: boolean
          is_duplex?: boolean
          label?: string | null
          lamination?: string | null
          order_item_id: string
          page_range_end?: number | null
          page_range_start?: number | null
          paper_stock?: string | null
          paper_weight_gsm?: number | null
          section_type?: Database["public"]["Enums"]["section_type"]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          is_color?: boolean
          is_duplex?: boolean
          label?: string | null
          lamination?: string | null
          order_item_id?: string
          page_range_end?: number | null
          page_range_start?: number | null
          paper_stock?: string | null
          paper_weight_gsm?: number | null
          section_type?: Database["public"]["Enums"]["section_type"]
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_sections_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_sections_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          backend_asset_id: string | null
          created_at: string
          document_status: Database["public"]["Enums"]["document_status"]
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          order_item_id: string
          page_count: number | null
          page_height_mm: number | null
          page_width_mm: number | null
          preflight_data: Json | null
          sort_order: number
          thumbnail_urls: Json | null
          updated_at: string
        }
        Insert: {
          backend_asset_id?: string | null
          created_at?: string
          document_status?: Database["public"]["Enums"]["document_status"]
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          order_item_id: string
          page_count?: number | null
          page_height_mm?: number | null
          page_width_mm?: number | null
          preflight_data?: Json | null
          sort_order?: number
          thumbnail_urls?: Json | null
          updated_at?: string
        }
        Update: {
          backend_asset_id?: string | null
          created_at?: string
          document_status?: Database["public"]["Enums"]["document_status"]
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          order_item_id?: string
          page_count?: number | null
          page_height_mm?: number | null
          page_width_mm?: number | null
          preflight_data?: Json | null
          sort_order?: number
          thumbnail_urls?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          asset_id: string | null
          celery_task_id: string | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          operation: string
          payload: Json
          queue: string
          result: Json
          retries: number
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          celery_task_id?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          operation: string
          payload?: Json
          queue?: string
          result?: Json
          retries?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          celery_task_id?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          operation?: string
          payload?: Json
          queue?: string
          result?: Json
          retries?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          build_status: Database["public"]["Enums"]["build_status"]
          created_at: string
          id: string
          order_id: string
          product_family_id: string | null
          quantity: number
          spec: Json
          title: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          build_status?: Database["public"]["Enums"]["build_status"]
          created_at?: string
          id?: string
          order_id: string
          product_family_id?: string | null
          quantity?: number
          spec?: Json
          title?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          build_status?: Database["public"]["Enums"]["build_status"]
          created_at?: string
          id?: string
          order_id?: string
          product_family_id?: string | null
          quantity?: number
          spec?: Json
          title?: string | null
          unit_price?: number
          updated_at?: string
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
            foreignKeyName: "order_items_product_family_id_fkey"
            columns: ["product_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          branch_id: string | null
          created_at: string
          fulfillment_type:
            | Database["public"]["Enums"]["fulfillment_type"]
            | null
          id: string
          notes: string | null
          order_status: Database["public"]["Enums"]["order_status"]
          tenant_id: string | null
          total_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          fulfillment_type?:
            | Database["public"]["Enums"]["fulfillment_type"]
            | null
          id?: string
          notes?: string | null
          order_status?: Database["public"]["Enums"]["order_status"]
          tenant_id?: string | null
          total_price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          fulfillment_type?:
            | Database["public"]["Enums"]["fulfillment_type"]
            | null
          id?: string
          notes?: string | null
          order_status?: Database["public"]["Enums"]["order_status"]
          tenant_id?: string | null
          total_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          conditions: Json
          created_at: string
          id: string
          is_active: boolean
          name: string
          price_value: number
          product_family_id: string | null
          rule_type: string
          sort_order: number
          tenant_id: string | null
        }
        Insert: {
          conditions?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price_value?: number
          product_family_id?: string | null
          rule_type?: string
          sort_order?: number
          tenant_id?: string | null
        }
        Update: {
          conditions?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price_value?: number
          product_family_id?: string | null
          rule_type?: string
          sort_order?: number
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_product_family_id_fkey"
            columns: ["product_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_families: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_families_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_options: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          name: string
          option_type: string
          product_family_id: string
          sort_order: number
          values: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          name: string
          option_type: string
          product_family_id: string
          sort_order?: number
          values?: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          name?: string
          option_type?: string
          product_family_id?: string
          sort_order?: number
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "product_options_product_family_id_fkey"
            columns: ["product_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          branch_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          branch_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_roles_branch"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "platform_admin"
        | "head_office_admin"
        | "branch_manager"
        | "store_operator"
        | "customer"
      build_status: "draft" | "building" | "ready" | "quoted" | "ordered"
      document_status:
        | "pending"
        | "uploading"
        | "processing"
        | "analyzed"
        | "ready"
        | "error"
      fulfillment_type: "collection" | "delivery" | "courier"
      node_type: "branch" | "hub" | "partner"
      order_status:
        | "draft"
        | "quoted"
        | "confirmed"
        | "in_production"
        | "quality_check"
        | "ready_for_collection"
        | "dispatched"
        | "delivered"
        | "cancelled"
      section_type: "body" | "front_cover" | "back_cover" | "insert" | "tab"
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
      app_role: [
        "platform_admin",
        "head_office_admin",
        "branch_manager",
        "store_operator",
        "customer",
      ],
      build_status: ["draft", "building", "ready", "quoted", "ordered"],
      document_status: [
        "pending",
        "uploading",
        "processing",
        "analyzed",
        "ready",
        "error",
      ],
      fulfillment_type: ["collection", "delivery", "courier"],
      node_type: ["branch", "hub", "partner"],
      order_status: [
        "draft",
        "quoted",
        "confirmed",
        "in_production",
        "quality_check",
        "ready_for_collection",
        "dispatched",
        "delivered",
        "cancelled",
      ],
      section_type: ["body", "front_cover", "back_cover", "insert", "tab"],
    },
  },
} as const
