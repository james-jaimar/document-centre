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
      apps: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      artwork_template_placeholders: {
        Row: {
          background_hex: string | null
          corner_radius_mm: number
          created_at: string
          default_value: string | null
          fit_mode: string
          height_mm: number
          id: string
          is_locked: boolean
          is_required: boolean
          is_watermark: boolean
          kind: string
          layer: string
          max_length: number | null
          name: string
          opacity: number
          sort_order: number
          template_id: string
          text_style: Json
          updated_at: string
          width_mm: number
          x_mm: number
          y_mm: number
          z_index: number
        }
        Insert: {
          background_hex?: string | null
          corner_radius_mm?: number
          created_at?: string
          default_value?: string | null
          fit_mode?: string
          height_mm?: number
          id?: string
          is_locked?: boolean
          is_required?: boolean
          is_watermark?: boolean
          kind: string
          layer?: string
          max_length?: number | null
          name: string
          opacity?: number
          sort_order?: number
          template_id: string
          text_style?: Json
          updated_at?: string
          width_mm?: number
          x_mm?: number
          y_mm?: number
          z_index?: number
        }
        Update: {
          background_hex?: string | null
          corner_radius_mm?: number
          created_at?: string
          default_value?: string | null
          fit_mode?: string
          height_mm?: number
          id?: string
          is_locked?: boolean
          is_required?: boolean
          is_watermark?: boolean
          kind?: string
          layer?: string
          max_length?: number | null
          name?: string
          opacity?: number
          sort_order?: number
          template_id?: string
          text_style?: Json
          updated_at?: string
          width_mm?: number
          x_mm?: number
          y_mm?: number
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "artwork_template_placeholders_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "artwork_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      artwork_templates: {
        Row: {
          base_knockout_tolerance: number
          base_knockout_white: boolean
          base_pdf_path: string | null
          base_transparent_path: string | null
          bleed_mm: number
          branch_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          page_count: number
          preview_path: string | null
          product_family_id: string | null
          scope_type: Database["public"]["Enums"]["rate_card_scope"]
          sort_order: number
          status: string
          tenant_id: string | null
          trim_height_mm: number
          trim_offset_x_mm: number
          trim_offset_y_mm: number
          trim_width_mm: number
          updated_at: string
        }
        Insert: {
          base_knockout_tolerance?: number
          base_knockout_white?: boolean
          base_pdf_path?: string | null
          base_transparent_path?: string | null
          bleed_mm?: number
          branch_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          page_count?: number
          preview_path?: string | null
          product_family_id?: string | null
          scope_type?: Database["public"]["Enums"]["rate_card_scope"]
          sort_order?: number
          status?: string
          tenant_id?: string | null
          trim_height_mm?: number
          trim_offset_x_mm?: number
          trim_offset_y_mm?: number
          trim_width_mm?: number
          updated_at?: string
        }
        Update: {
          base_knockout_tolerance?: number
          base_knockout_white?: boolean
          base_pdf_path?: string | null
          base_transparent_path?: string | null
          bleed_mm?: number
          branch_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          page_count?: number
          preview_path?: string | null
          product_family_id?: string | null
          scope_type?: Database["public"]["Enums"]["rate_card_scope"]
          sort_order?: number
          status?: string
          tenant_id?: string | null
          trim_height_mm?: number
          trim_offset_x_mm?: number
          trim_offset_y_mm?: number
          trim_width_mm?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artwork_templates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artwork_templates_product_family_id_fkey"
            columns: ["product_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artwork_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
      binding_specifications: {
        Row: {
          binding_method: string
          created_at: string
          id: string
          is_active: boolean
          max_sheets_80gsm: number
          min_sheets: number
          notes: string | null
          pitch: string | null
          size_mm: number
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          binding_method: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_sheets_80gsm: number
          min_sheets?: number
          notes?: string | null
          pitch?: string | null
          size_mm: number
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          binding_method?: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_sheets_80gsm?: number
          min_sheets?: number
          notes?: string | null
          pitch?: string | null
          size_mm?: number
          updated_at?: string
          weight_grams?: number | null
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
      branch_catalog_overrides: {
        Row: {
          branch_id: string
          catalog: Database["public"]["Enums"]["catalog_kind"]
          created_at: string
          id: string
          is_enabled: boolean
          item_code: string
          label_override: string | null
          metadata_override: Json | null
          price_delta_minor: number | null
          price_override_minor: number | null
          sub_attribute: string | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          catalog: Database["public"]["Enums"]["catalog_kind"]
          created_at?: string
          id?: string
          is_enabled?: boolean
          item_code: string
          label_override?: string | null
          metadata_override?: Json | null
          price_delta_minor?: number | null
          price_override_minor?: number | null
          sub_attribute?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          catalog?: Database["public"]["Enums"]["catalog_kind"]
          created_at?: string
          id?: string
          is_enabled?: boolean
          item_code?: string
          label_override?: string | null
          metadata_override?: Json | null
          price_delta_minor?: number | null
          price_override_minor?: number | null
          sub_attribute?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_catalog_overrides_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_discount_customers: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_user_id: string | null
          discount_id: string
          id: string
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_user_id?: string | null
          discount_id: string
          id?: string
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_user_id?: string | null
          discount_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_discount_customers_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "branch_discounts"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_discount_products: {
        Row: {
          created_at: string
          discount_id: string
          id: string
          product_family_id: string
        }
        Insert: {
          created_at?: string
          discount_id: string
          id?: string
          product_family_id: string
        }
        Update: {
          created_at?: string
          discount_id?: string
          id?: string
          product_family_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_discount_products_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "branch_discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_discount_products_product_family_id_fkey"
            columns: ["product_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_discount_redemptions: {
        Row: {
          amount_applied: number
          branch_id: string
          customer_email: string | null
          customer_user_id: string | null
          discount_id: string
          id: string
          order_id: string
          redeemed_at: string
        }
        Insert: {
          amount_applied?: number
          branch_id: string
          customer_email?: string | null
          customer_user_id?: string | null
          discount_id: string
          id?: string
          order_id: string
          redeemed_at?: string
        }
        Update: {
          amount_applied?: number
          branch_id?: string
          customer_email?: string | null
          customer_user_id?: string | null
          discount_id?: string
          id?: string
          order_id?: string
          redeemed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_discount_redemptions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_discount_redemptions_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "branch_discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_discount_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_discounts: {
        Row: {
          allow_combine_with_code: boolean
          branch_id: string
          code: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          description: string | null
          ends_at: string | null
          first_time_customer_only: boolean
          free_item_ref: Json | null
          id: string
          is_active: boolean
          kind: string
          max_per_customer: number | null
          max_redemptions: number | null
          min_order_subtotal: number | null
          name: string
          starts_at: string | null
          tenant_id: string
          updated_at: string
          value_amount: number
          value_type: string
        }
        Insert: {
          allow_combine_with_code?: boolean
          branch_id: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          description?: string | null
          ends_at?: string | null
          first_time_customer_only?: boolean
          free_item_ref?: Json | null
          id?: string
          is_active?: boolean
          kind: string
          max_per_customer?: number | null
          max_redemptions?: number | null
          min_order_subtotal?: number | null
          name: string
          starts_at?: string | null
          tenant_id: string
          updated_at?: string
          value_amount?: number
          value_type: string
        }
        Update: {
          allow_combine_with_code?: boolean
          branch_id?: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          description?: string | null
          ends_at?: string | null
          first_time_customer_only?: boolean
          free_item_ref?: Json | null
          id?: string
          is_active?: boolean
          kind?: string
          max_per_customer?: number | null
          max_redemptions?: number | null
          min_order_subtotal?: number | null
          name?: string
          starts_at?: string | null
          tenant_id?: string
          updated_at?: string
          value_amount?: number
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_discounts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_discounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_onboarding_progress: {
        Row: {
          banking_done: boolean
          branch_id: string
          branding_done: boolean
          company_details_done: boolean
          completed_at: string | null
          created_at: string
          dismissed_at: string | null
          email_settings_done: boolean
          first_order_done: boolean
          payfast_done: boolean
          pricing_reviewed: boolean
          pricing_reviewed_at: string | null
          team_invited: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          banking_done?: boolean
          branch_id: string
          branding_done?: boolean
          company_details_done?: boolean
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          email_settings_done?: boolean
          first_order_done?: boolean
          payfast_done?: boolean
          pricing_reviewed?: boolean
          pricing_reviewed_at?: string | null
          team_invited?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          banking_done?: boolean
          branch_id?: string
          branding_done?: boolean
          company_details_done?: boolean
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          email_settings_done?: boolean
          first_order_done?: boolean
          payfast_done?: boolean
          pricing_reviewed?: boolean
          pricing_reviewed_at?: string | null
          team_invited?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_onboarding_progress_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_onboarding_progress_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_payment_gateways: {
        Row: {
          branch_id: string
          created_at: string
          credentials_secret_id: string | null
          id: string
          is_enabled: boolean
          mode: string
          provider: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          credentials_secret_id?: string | null
          id?: string
          is_enabled?: boolean
          mode?: string
          provider: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          credentials_secret_id?: string | null
          id?: string
          is_enabled?: boolean
          mode?: string
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_payment_gateways_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_pricing_import_snapshots: {
        Row: {
          applied_at: string
          branch_id: string
          created_at: string
          filename: string | null
          id: string
          reverted_at: string | null
          row_count: number
          snapshot: Json
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          applied_at?: string
          branch_id: string
          created_at?: string
          filename?: string | null
          id?: string
          reverted_at?: string | null
          row_count?: number
          snapshot: Json
          tenant_id: string
          uploaded_by?: string | null
        }
        Update: {
          applied_at?: string
          branch_id?: string
          created_at?: string
          filename?: string | null
          id?: string
          reverted_at?: string | null
          row_count?: number
          snapshot?: Json
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_pricing_import_snapshots_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_pricing_import_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_private: {
        Row: {
          accounts_email: string | null
          banking_details: Json
          billing_email: string | null
          branch_id: string
          created_at: string
          legal_name: string | null
          registration_number: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          accounts_email?: string | null
          banking_details?: Json
          billing_email?: string | null
          branch_id: string
          created_at?: string
          legal_name?: string | null
          registration_number?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          accounts_email?: string | null
          banking_details?: Json
          billing_email?: string | null
          branch_id?: string
          created_at?: string
          legal_name?: string | null
          registration_number?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_private_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_product_option_overrides: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_enabled: boolean
          product_option_id: string
          updated_at: string
          value_slug: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          product_option_id: string
          updated_at?: string
          value_slug: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          product_option_id?: string
          updated_at?: string
          value_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_product_option_overrides_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_product_option_overrides_product_option_id_fkey"
            columns: ["product_option_id"]
            isOneToOne: false
            referencedRelation: "product_options"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_settings: {
        Row: {
          branch_id: string
          category: string
          created_at: string
          id: string
          is_sensitive: boolean
          setting_key: string
          setting_value: Json | null
          sort_order: number
          tenant_id: string
          updated_at: string
          value_type: string | null
        }
        Insert: {
          branch_id: string
          category: string
          created_at?: string
          id?: string
          is_sensitive?: boolean
          setting_key: string
          setting_value?: Json | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
          value_type?: string | null
        }
        Update: {
          branch_id?: string
          category?: string
          created_at?: string
          id?: string
          is_sensitive?: boolean
          setting_key?: string
          setting_value?: Json | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          value_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_subscriptions: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_plan_slug: string | null
          billing_status: string | null
          branch_id: string
          cancelled_at: string | null
          comp_until: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          discount_type: string | null
          discount_value: number | null
          grace_until: string | null
          id: string
          metadata: Json
          override_reason: string | null
          plan_slug: string | null
          promo_code_id: string | null
          region_id: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          trial_days: number | null
          trial_ends_at: string | null
          trial_started_at: string | null
          trial_started_via: string | null
          trial_status: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_plan_slug?: string | null
          billing_status?: string | null
          branch_id: string
          cancelled_at?: string | null
          comp_until?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          discount_type?: string | null
          discount_value?: number | null
          grace_until?: string | null
          id?: string
          metadata?: Json
          override_reason?: string | null
          plan_slug?: string | null
          promo_code_id?: string | null
          region_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          trial_days?: number | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          trial_started_via?: string | null
          trial_status?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_plan_slug?: string | null
          billing_status?: string | null
          branch_id?: string
          cancelled_at?: string | null
          comp_until?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          discount_type?: string | null
          discount_value?: number | null
          grace_until?: string | null
          id?: string
          metadata?: Json
          override_reason?: string | null
          plan_slug?: string | null
          promo_code_id?: string | null
          region_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          trial_days?: number | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          trial_started_via?: string | null
          trial_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_subscriptions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          city: string | null
          code: string | null
          country: string
          created_at: string
          email: string | null
          external_ref: string | null
          id: string
          is_active: boolean
          is_live: boolean
          name: string
          phone: string | null
          postal_code: string | null
          pricing_seeded_at: string | null
          province: string | null
          settings: Json
          slug: string
          storefront_closed_at: string | null
          tenant_id: string
          trading_name: string | null
          updated_at: string
          url_slug: string | null
          website_url: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code?: string | null
          country?: string
          created_at?: string
          email?: string | null
          external_ref?: string | null
          id?: string
          is_active?: boolean
          is_live?: boolean
          name: string
          phone?: string | null
          postal_code?: string | null
          pricing_seeded_at?: string | null
          province?: string | null
          settings?: Json
          slug: string
          storefront_closed_at?: string | null
          tenant_id: string
          trading_name?: string | null
          updated_at?: string
          url_slug?: string | null
          website_url?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string | null
          country?: string
          created_at?: string
          email?: string | null
          external_ref?: string | null
          id?: string
          is_active?: boolean
          is_live?: boolean
          name?: string
          phone?: string | null
          postal_code?: string | null
          pricing_seeded_at?: string | null
          province?: string | null
          settings?: Json
          slug?: string
          storefront_closed_at?: string | null
          tenant_id?: string
          trading_name?: string | null
          updated_at?: string
          url_slug?: string | null
          website_url?: string | null
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
      catalog_finishing: {
        Row: {
          binding_method: string | null
          branch_id: string | null
          category: string | null
          code: string
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string
          max_sheets: number | null
          metadata: Json
          pricing_basis: string | null
          scope_type: Database["public"]["Enums"]["catalog_scope"]
          size_in: number | null
          size_mm: number | null
          sort_order: number
          tenant_id: string | null
          unit_system: string
          updated_at: string
          variant: string | null
          weight_grams: number | null
        }
        Insert: {
          binding_method?: string | null
          branch_id?: string | null
          category?: string | null
          code: string
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          max_sheets?: number | null
          metadata?: Json
          pricing_basis?: string | null
          scope_type?: Database["public"]["Enums"]["catalog_scope"]
          size_in?: number | null
          size_mm?: number | null
          sort_order?: number
          tenant_id?: string | null
          unit_system?: string
          updated_at?: string
          variant?: string | null
          weight_grams?: number | null
        }
        Update: {
          binding_method?: string | null
          branch_id?: string | null
          category?: string | null
          code?: string
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          max_sheets?: number | null
          metadata?: Json
          pricing_basis?: string | null
          scope_type?: Database["public"]["Enums"]["catalog_scope"]
          size_in?: number | null
          size_mm?: number | null
          sort_order?: number
          tenant_id?: string | null
          unit_system?: string
          updated_at?: string
          variant?: string | null
          weight_grams?: number | null
        }
        Relationships: []
      }
      catalog_finishing_prices: {
        Row: {
          branch_id: string | null
          cost_price_minor: number | null
          created_at: string
          finishing_id: string
          id: string
          is_active: boolean
          scope_type: Database["public"]["Enums"]["catalog_scope"]
          sell_price_minor: number
          size_code: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          cost_price_minor?: number | null
          created_at?: string
          finishing_id: string
          id?: string
          is_active?: boolean
          scope_type?: Database["public"]["Enums"]["catalog_scope"]
          sell_price_minor?: number
          size_code?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          cost_price_minor?: number | null
          created_at?: string
          finishing_id?: string
          id?: string
          is_active?: boolean
          scope_type?: Database["public"]["Enums"]["catalog_scope"]
          sell_price_minor?: number
          size_code?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_finishing_prices_finishing_id_fkey"
            columns: ["finishing_id"]
            isOneToOne: false
            referencedRelation: "catalog_finishing"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_paper_prices: {
        Row: {
          branch_id: string | null
          cost_price_minor: number | null
          created_at: string
          id: string
          is_active: boolean
          paper_id: string
          scope_type: Database["public"]["Enums"]["catalog_scope"]
          sell_price_minor: number
          size_code: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          cost_price_minor?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          paper_id: string
          scope_type?: Database["public"]["Enums"]["catalog_scope"]
          sell_price_minor?: number
          size_code: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          cost_price_minor?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          paper_id?: string
          scope_type?: Database["public"]["Enums"]["catalog_scope"]
          sell_price_minor?: number
          size_code?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_paper_prices_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "catalog_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_papers: {
        Row: {
          branch_id: string | null
          category: string | null
          code: string
          created_at: string
          finish: string | null
          id: string
          is_active: boolean
          is_cover_stock: boolean
          is_edge_to_edge_only: boolean
          label: string
          lb_basis: string | null
          metadata: Json
          scope_type: Database["public"]["Enums"]["catalog_scope"]
          sort_order: number
          stocked_sizes: string[]
          tenant_id: string | null
          unit_system: string
          updated_at: string
          weight_gsm: number | null
          weight_lb: number | null
        }
        Insert: {
          branch_id?: string | null
          category?: string | null
          code: string
          created_at?: string
          finish?: string | null
          id?: string
          is_active?: boolean
          is_cover_stock?: boolean
          is_edge_to_edge_only?: boolean
          label: string
          lb_basis?: string | null
          metadata?: Json
          scope_type?: Database["public"]["Enums"]["catalog_scope"]
          sort_order?: number
          stocked_sizes?: string[]
          tenant_id?: string | null
          unit_system?: string
          updated_at?: string
          weight_gsm?: number | null
          weight_lb?: number | null
        }
        Update: {
          branch_id?: string | null
          category?: string | null
          code?: string
          created_at?: string
          finish?: string | null
          id?: string
          is_active?: boolean
          is_cover_stock?: boolean
          is_edge_to_edge_only?: boolean
          label?: string
          lb_basis?: string | null
          metadata?: Json
          scope_type?: Database["public"]["Enums"]["catalog_scope"]
          sort_order?: number
          stocked_sizes?: string[]
          tenant_id?: string | null
          unit_system?: string
          updated_at?: string
          weight_gsm?: number | null
          weight_lb?: number | null
        }
        Relationships: []
      }
      catalog_print_attrs: {
        Row: {
          attribute: string
          branch_id: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          metadata: Json
          scope_type: Database["public"]["Enums"]["catalog_scope"]
          sort_order: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          attribute: string
          branch_id?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          metadata?: Json
          scope_type?: Database["public"]["Enums"]["catalog_scope"]
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          attribute?: string
          branch_id?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          metadata?: Json
          scope_type?: Database["public"]["Enums"]["catalog_scope"]
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      catalog_sizes: {
        Row: {
          branch_id: string | null
          code: string
          created_at: string
          height_mm: number
          id: string
          is_active: boolean
          iso_name: string | null
          label: string
          metadata: Json
          region: string | null
          scope_type: Database["public"]["Enums"]["catalog_scope"]
          sort_order: number
          tenant_id: string | null
          unit_system: string
          updated_at: string
          width_mm: number
        }
        Insert: {
          branch_id?: string | null
          code: string
          created_at?: string
          height_mm: number
          id?: string
          is_active?: boolean
          iso_name?: string | null
          label: string
          metadata?: Json
          region?: string | null
          scope_type?: Database["public"]["Enums"]["catalog_scope"]
          sort_order?: number
          tenant_id?: string | null
          unit_system?: string
          updated_at?: string
          width_mm: number
        }
        Update: {
          branch_id?: string | null
          code?: string
          created_at?: string
          height_mm?: number
          id?: string
          is_active?: boolean
          iso_name?: string | null
          label?: string
          metadata?: Json
          region?: string | null
          scope_type?: Database["public"]["Enums"]["catalog_scope"]
          sort_order?: number
          tenant_id?: string | null
          unit_system?: string
          updated_at?: string
          width_mm?: number
        }
        Relationships: []
      }
      catalog_variants: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          label: string
          metadata: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          metadata?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          metadata?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      contact_submissions: {
        Row: {
          company: string | null
          created_at: string
          email: string
          handled_at: string | null
          handled_by_profile_id: string | null
          id: string
          ip_address: string | null
          message: string
          metadata: Json
          name: string
          notes: string | null
          phone: string | null
          source: string | null
          spam_reasons: string[]
          spam_score: number
          status: string
          subject: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          handled_at?: string | null
          handled_by_profile_id?: string | null
          id?: string
          ip_address?: string | null
          message: string
          metadata?: Json
          name: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          spam_reasons?: string[]
          spam_score?: number
          status?: string
          subject?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          handled_at?: string | null
          handled_by_profile_id?: string | null
          id?: string
          ip_address?: string | null
          message?: string
          metadata?: Json
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          spam_reasons?: string[]
          spam_score?: number
          status?: string
          subject?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_submissions_handled_by_profile_id_fkey"
            columns: ["handled_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address_type: string
          app_id: string
          city: string | null
          company_name: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          customer_profile_id: string
          email: string | null
          id: string
          instructions: string | null
          is_default: boolean
          label: string | null
          line1: string | null
          line2: string | null
          phone: string | null
          postal_code: string | null
          province: string | null
          suburb: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address_type?: string
          app_id: string
          city?: string | null
          company_name?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          customer_profile_id: string
          email?: string | null
          id?: string
          instructions?: string | null
          is_default?: boolean
          label?: string | null
          line1?: string | null
          line2?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          suburb?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address_type?: string
          app_id?: string
          city?: string | null
          company_name?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          customer_profile_id?: string
          email?: string | null
          id?: string
          instructions?: string | null
          is_default?: boolean
          label?: string | null
          line1?: string | null
          line2?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          suburb?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_companies: {
        Row: {
          app_id: string
          billing_city: string | null
          billing_country: string | null
          billing_line1: string | null
          billing_line2: string | null
          billing_postal_code: string | null
          billing_province: string | null
          billing_suburb: string | null
          branch_id: string | null
          created_at: string
          created_by: string | null
          credit_limit: number
          default_discount_pct: number
          delivery_city: string | null
          delivery_country: string | null
          delivery_line1: string | null
          delivery_line2: string | null
          delivery_postal_code: string | null
          delivery_province: string | null
          delivery_same_as_billing: boolean
          delivery_suburb: string | null
          email: string | null
          id: string
          industry: string | null
          is_active: boolean
          is_trade_customer: boolean
          mis_account_number: string | null
          name: string
          notes: string | null
          payment_terms_days: number
          phone: string | null
          registration_number: string | null
          tenant_id: string
          trading_name: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          app_id: string
          billing_city?: string | null
          billing_country?: string | null
          billing_line1?: string | null
          billing_line2?: string | null
          billing_postal_code?: string | null
          billing_province?: string | null
          billing_suburb?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          default_discount_pct?: number
          delivery_city?: string | null
          delivery_country?: string | null
          delivery_line1?: string | null
          delivery_line2?: string | null
          delivery_postal_code?: string | null
          delivery_province?: string | null
          delivery_same_as_billing?: boolean
          delivery_suburb?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          is_trade_customer?: boolean
          mis_account_number?: string | null
          name: string
          notes?: string | null
          payment_terms_days?: number
          phone?: string | null
          registration_number?: string | null
          tenant_id: string
          trading_name?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          app_id?: string
          billing_city?: string | null
          billing_country?: string | null
          billing_line1?: string | null
          billing_line2?: string | null
          billing_postal_code?: string | null
          billing_province?: string | null
          billing_suburb?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          default_discount_pct?: number
          delivery_city?: string | null
          delivery_country?: string | null
          delivery_line1?: string | null
          delivery_line2?: string | null
          delivery_postal_code?: string | null
          delivery_province?: string | null
          delivery_same_as_billing?: boolean
          delivery_suburb?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          is_trade_customer?: boolean
          mis_account_number?: string | null
          name?: string
          notes?: string | null
          payment_terms_days?: number
          phone?: string | null
          registration_number?: string | null
          tenant_id?: string
          trading_name?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_companies_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_accounts: {
        Row: {
          account_ref: string | null
          app_id: string
          branch_id: string | null
          created_at: string
          credit_limit: number | null
          customer_profile_id: string
          default_discount_pct: number | null
          id: string
          is_active: boolean
          notes: string | null
          payment_terms_days: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_ref?: string | null
          app_id: string
          branch_id?: string | null
          created_at?: string
          credit_limit?: number | null
          customer_profile_id: string
          default_discount_pct?: number | null
          id?: string
          is_active?: boolean
          notes?: string | null
          payment_terms_days?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_ref?: string | null
          app_id?: string
          branch_id?: string | null
          created_at?: string
          credit_limit?: number | null
          customer_profile_id?: string
          default_discount_pct?: number | null
          id?: string
          is_active?: boolean
          notes?: string | null
          payment_terms_days?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_notes: {
        Row: {
          app_id: string
          body: string
          created_at: string
          created_by: string | null
          customer_profile_id: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          app_id: string
          body: string
          created_at?: string
          created_by?: string | null
          customer_profile_id: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          app_id?: string
          body?: string
          created_at?: string
          created_by?: string | null
          customer_profile_id?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_saved_orders: {
        Row: {
          app_id: string
          branch_id: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          profile_id: string
          snapshot: Json
          source_order_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          app_id: string
          branch_id?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          profile_id: string
          snapshot?: Json
          source_order_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          app_id?: string
          branch_id?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          profile_id?: string
          snapshot?: Json
          source_order_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_saved_orders_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_saved_orders_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tags: {
        Row: {
          app_id: string
          color: string | null
          created_at: string
          created_by: string | null
          customer_profile_id: string
          id: string
          tag: string
          tenant_id: string
        }
        Insert: {
          app_id: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          customer_profile_id: string
          id?: string
          tag: string
          tenant_id: string
        }
        Update: {
          app_id?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          customer_profile_id?: string
          id?: string
          tag?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tags_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tags_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_methods: {
        Row: {
          code: string
          created_at: string
          description: string | null
          fulfillment_kind: string
          id: string
          is_active: boolean
          is_express: boolean
          label: string
          sort_order: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          fulfillment_kind?: string
          id?: string
          is_active?: boolean
          is_express?: boolean
          label: string
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          fulfillment_kind?: string
          id?: string
          is_active?: boolean
          is_express?: boolean
          label?: string
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_methods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_rates: {
        Row: {
          branch_id: string | null
          created_at: string
          currency_code: string
          id: string
          is_active: boolean
          max_weight_kg: number | null
          method_id: string
          min_weight_kg: number
          price: number
          scope_type: Database["public"]["Enums"]["delivery_scope"]
          sort_order: number
          tenant_id: string | null
          updated_at: string
          zone_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          max_weight_kg?: number | null
          method_id: string
          min_weight_kg?: number
          price: number
          scope_type?: Database["public"]["Enums"]["delivery_scope"]
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
          zone_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          max_weight_kg?: number | null
          method_id?: string
          min_weight_kg?: number
          price?: number
          scope_type?: Database["public"]["Enums"]["delivery_scope"]
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_rates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_rates_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "delivery_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_rates_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zone_locations: {
        Row: {
          country: string
          created_at: string
          id: string
          match_type: Database["public"]["Enums"]["delivery_location_match"]
          notes: string | null
          value: string
          zone_id: string
        }
        Insert: {
          country?: string
          created_at?: string
          id?: string
          match_type: Database["public"]["Enums"]["delivery_location_match"]
          notes?: string | null
          value: string
          zone_id: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          match_type?: Database["public"]["Enums"]["delivery_location_match"]
          notes?: string | null
          value?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zone_locations_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          branch_id: string | null
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default_fallback: boolean
          label: string
          scope_type: Database["public"]["Enums"]["delivery_scope"]
          sort_order: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default_fallback?: boolean
          label: string
          scope_type?: Database["public"]["Enums"]["delivery_scope"]
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default_fallback?: boolean
          label?: string
          scope_type?: Database["public"]["Enums"]["delivery_scope"]
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_zones_tenant_id_fkey"
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
          bank_position: number | null
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
          bank_position?: number | null
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
          bank_position?: number | null
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
      email_accounts: {
        Row: {
          branch_id: string | null
          created_at: string
          from_email: string
          from_name: string
          graph_client_id: string | null
          graph_client_secret_id: string | null
          graph_sender_address: string | null
          graph_tenant_id: string | null
          id: string
          is_active: boolean
          is_default: boolean
          label: string
          last_error: string | null
          last_verified_at: string | null
          max_concurrency: number
          max_concurrent: number
          oauth_email: string | null
          oauth_refresh_token_secret_id: string | null
          reply_to: string | null
          send_delay_ms: number
          smtp_host: string | null
          smtp_password_secret_id: string | null
          smtp_port: number | null
          smtp_secure: string | null
          smtp_username: string | null
          tenant_id: string | null
          transport: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          from_email: string
          from_name: string
          graph_client_id?: string | null
          graph_client_secret_id?: string | null
          graph_sender_address?: string | null
          graph_tenant_id?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label: string
          last_error?: string | null
          last_verified_at?: string | null
          max_concurrency?: number
          max_concurrent?: number
          oauth_email?: string | null
          oauth_refresh_token_secret_id?: string | null
          reply_to?: string | null
          send_delay_ms?: number
          smtp_host?: string | null
          smtp_password_secret_id?: string | null
          smtp_port?: number | null
          smtp_secure?: string | null
          smtp_username?: string | null
          tenant_id?: string | null
          transport?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          from_email?: string
          from_name?: string
          graph_client_id?: string | null
          graph_client_secret_id?: string | null
          graph_sender_address?: string | null
          graph_tenant_id?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string
          last_error?: string | null
          last_verified_at?: string | null
          max_concurrency?: number
          max_concurrent?: number
          oauth_email?: string | null
          oauth_refresh_token_secret_id?: string | null
          reply_to?: string | null
          send_delay_ms?: number
          smtp_host?: string | null
          smtp_password_secret_id?: string | null
          smtp_port?: number | null
          smtp_secure?: string | null
          smtp_username?: string | null
          tenant_id?: string | null
          transport?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_accounts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          event_type: string
          id: string
          outbox_id: string | null
          provider_message_id: string | null
          raw: Json
          received_at: string
          recipient: string | null
        }
        Insert: {
          event_type: string
          id?: string
          outbox_id?: string | null
          provider_message_id?: string | null
          raw?: Json
          received_at?: string
          recipient?: string | null
        }
        Update: {
          event_type?: string
          id?: string
          outbox_id?: string | null
          provider_message_id?: string | null
          raw?: Json
          received_at?: string
          recipient?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "email_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          app_id: string | null
          attachments: Json
          attempts: number
          bcc: string[] | null
          branch_id: string | null
          category: string
          cc: string[] | null
          claimed_at: string | null
          claimed_by: string | null
          created_by_profile_id: string | null
          email_account_id: string | null
          error_message: string | null
          from_email: string | null
          from_name: string | null
          html: string | null
          id: string
          last_error_code: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          message_id: string | null
          metadata: Json
          next_attempt_at: string
          provider: string | null
          provider_message_id: string | null
          queued_at: string
          related_id: string | null
          related_type: string | null
          reply_to: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string
          subject: string
          tenant_id: string | null
          text_body: string | null
          to_email: string
          worker_lease_until: string | null
        }
        Insert: {
          app_id?: string | null
          attachments?: Json
          attempts?: number
          bcc?: string[] | null
          branch_id?: string | null
          category?: string
          cc?: string[] | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_by_profile_id?: string | null
          email_account_id?: string | null
          error_message?: string | null
          from_email?: string | null
          from_name?: string | null
          html?: string | null
          id?: string
          last_error_code?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          message_id?: string | null
          metadata?: Json
          next_attempt_at?: string
          provider?: string | null
          provider_message_id?: string | null
          queued_at?: string
          related_id?: string | null
          related_type?: string | null
          reply_to?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          tenant_id?: string | null
          text_body?: string | null
          to_email: string
          worker_lease_until?: string | null
        }
        Update: {
          app_id?: string | null
          attachments?: Json
          attempts?: number
          bcc?: string[] | null
          branch_id?: string | null
          category?: string
          cc?: string[] | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_by_profile_id?: string | null
          email_account_id?: string | null
          error_message?: string | null
          from_email?: string | null
          from_name?: string | null
          html?: string | null
          id?: string
          last_error_code?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          message_id?: string | null
          metadata?: Json
          next_attempt_at?: string
          provider?: string | null
          provider_message_id?: string | null
          queued_at?: string
          related_id?: string | null
          related_type?: string | null
          reply_to?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          tenant_id?: string | null
          text_body?: string | null
          to_email?: string
          worker_lease_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_metrics: {
        Row: {
          avg_latency_ms: number
          bucket_at: string
          created_at: string
          email_account_id: string | null
          failed_count: number
          id: string
          sent_count: number
          tenant_id: string | null
        }
        Insert: {
          avg_latency_ms?: number
          bucket_at: string
          created_at?: string
          email_account_id?: string | null
          failed_count?: number
          id?: string
          sent_count?: number
          tenant_id?: string | null
        }
        Update: {
          avg_latency_ms?: number
          bucket_at?: string
          created_at?: string
          email_account_id?: string | null
          failed_count?: number
          id?: string
          sent_count?: number
          tenant_id?: string | null
        }
        Relationships: []
      }
      email_suppressions: {
        Row: {
          created_at: string
          email: string
          id: string
          reason: string
          source: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          reason: string
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          reason?: string
          source?: string | null
        }
        Relationships: []
      }
      email_tracking_events: {
        Row: {
          campaign_id: string | null
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          recipient_id: string | null
          url: string | null
          user_agent: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          ip_hash?: string | null
          recipient_id?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          recipient_id?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_tracking_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "platform_email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_tracking_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "platform_email_campaign_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_sessions: {
        Row: {
          actions_count: number
          actor_profile_id: string
          branch_id: string | null
          ended_at: string | null
          ended_reason: string | null
          id: string
          ip: string | null
          metadata: Json
          started_at: string
          target_profile_id: string
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          actions_count?: number
          actor_profile_id: string
          branch_id?: string | null
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          started_at?: string
          target_profile_id: string
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          actions_count?: number
          actor_profile_id?: string
          branch_id?: string | null
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          started_at?: string
          target_profile_id?: string
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_sessions_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_sessions_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      imposition_templates: {
        Row: {
          bleed_mm: number
          columns: number | null
          created_at: string
          creep_per_sheet_mm: number
          crop_mark_length_mm: number
          crop_mark_offset_mm: number
          description: string | null
          fallback_trim_inset_mm: number
          gutter_mm: number
          has_bleed: boolean
          has_crop_marks: boolean
          id: string
          input_height_mm: number
          input_size: string
          input_width_mm: number
          is_active: boolean
          kind: string
          n_up: number | null
          name: string
          output_height_mm: number
          output_size: string
          output_width_mm: number
          rows: number | null
          show_registration: boolean
          slots: Json
          sort_order: number
          template_pdf_path: string | null
          updated_at: string
          work_style: string
        }
        Insert: {
          bleed_mm?: number
          columns?: number | null
          created_at?: string
          creep_per_sheet_mm?: number
          crop_mark_length_mm?: number
          crop_mark_offset_mm?: number
          description?: string | null
          fallback_trim_inset_mm?: number
          gutter_mm?: number
          has_bleed?: boolean
          has_crop_marks?: boolean
          id?: string
          input_height_mm: number
          input_size: string
          input_width_mm: number
          is_active?: boolean
          kind?: string
          n_up?: number | null
          name: string
          output_height_mm: number
          output_size: string
          output_width_mm: number
          rows?: number | null
          show_registration?: boolean
          slots?: Json
          sort_order?: number
          template_pdf_path?: string | null
          updated_at?: string
          work_style?: string
        }
        Update: {
          bleed_mm?: number
          columns?: number | null
          created_at?: string
          creep_per_sheet_mm?: number
          crop_mark_length_mm?: number
          crop_mark_offset_mm?: number
          description?: string | null
          fallback_trim_inset_mm?: number
          gutter_mm?: number
          has_bleed?: boolean
          has_crop_marks?: boolean
          id?: string
          input_height_mm?: number
          input_size?: string
          input_width_mm?: number
          is_active?: boolean
          kind?: string
          n_up?: number | null
          name?: string
          output_height_mm?: number
          output_size?: string
          output_width_mm?: number
          rows?: number | null
          show_registration?: boolean
          slots?: Json
          sort_order?: number
          template_pdf_path?: string | null
          updated_at?: string
          work_style?: string
        }
        Relationships: []
      }
      job_events: {
        Row: {
          app_id: string | null
          asset_id: string | null
          created_at: string
          duration_ms: number | null
          finished_at: string | null
          id: string
          job_id: string
          message: string | null
          metadata_json: Json | null
          queue_name: string | null
          stage: string
          started_at: string
          status: string
          task_name: string | null
          tenant_id: string | null
          worker_name: string | null
        }
        Insert: {
          app_id?: string | null
          asset_id?: string | null
          created_at?: string
          duration_ms?: number | null
          finished_at?: string | null
          id?: string
          job_id: string
          message?: string | null
          metadata_json?: Json | null
          queue_name?: string | null
          stage: string
          started_at?: string
          status: string
          task_name?: string | null
          tenant_id?: string | null
          worker_name?: string | null
        }
        Update: {
          app_id?: string | null
          asset_id?: string | null
          created_at?: string
          duration_ms?: number | null
          finished_at?: string | null
          id?: string
          job_id?: string
          message?: string | null
          metadata_json?: Json | null
          queue_name?: string | null
          stage?: string
          started_at?: string
          status?: string
          task_name?: string | null
          tenant_id?: string | null
          worker_name?: string | null
        }
        Relationships: []
      }
      job_proofs: {
        Row: {
          app_id: string
          approval_token: string | null
          approved_at: string | null
          created_at: string
          document_id: string | null
          id: string
          job_id: string
          metadata: Json
          order_id: string
          proof_status: string
          proof_type: string
          rejected_at: string | null
          tenant_id: string
          viewer_type: string
          viewer_url: string | null
        }
        Insert: {
          app_id: string
          approval_token?: string | null
          approved_at?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          job_id: string
          metadata?: Json
          order_id: string
          proof_status?: string
          proof_type: string
          rejected_at?: string | null
          tenant_id: string
          viewer_type: string
          viewer_url?: string | null
        }
        Update: {
          app_id?: string
          approval_token?: string | null
          approved_at?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          job_id?: string
          metadata?: Json
          order_id?: string
          proof_status?: string
          proof_type?: string
          rejected_at?: string | null
          tenant_id?: string
          viewer_type?: string
          viewer_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_proofs_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_proofs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "order_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_proofs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "order_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_proofs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_proofs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      messages: {
        Row: {
          app_id: string
          branch_id: string | null
          created_at: string
          id: string
          impersonated_by: string | null
          is_internal: boolean
          job_id: string | null
          message_body: string
          order_id: string | null
          read_by_customer_at: string | null
          read_by_staff_at: string | null
          recipient_type: string
          sender_profile_id: string | null
          sender_type: string
          tenant_id: string
        }
        Insert: {
          app_id: string
          branch_id?: string | null
          created_at?: string
          id?: string
          impersonated_by?: string | null
          is_internal?: boolean
          job_id?: string | null
          message_body: string
          order_id?: string | null
          read_by_customer_at?: string | null
          read_by_staff_at?: string | null
          recipient_type?: string
          sender_profile_id?: string | null
          sender_type: string
          tenant_id: string
        }
        Update: {
          app_id?: string
          branch_id?: string | null
          created_at?: string
          id?: string
          impersonated_by?: string | null
          is_internal?: boolean
          job_id?: string | null
          message_body?: string
          order_id?: string | null
          read_by_customer_at?: string | null
          read_by_staff_at?: string | null
          recipient_type?: string
          sender_profile_id?: string | null
          sender_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_impersonated_by_fkey"
            columns: ["impersonated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "order_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      nudge_send_log: {
        Row: {
          branch_id: string
          id: string
          nudge_key: string
          offset_day: number
          outbox_id: string | null
          recipient_email: string
          sent_at: string
        }
        Insert: {
          branch_id: string
          id?: string
          nudge_key: string
          offset_day: number
          outbox_id?: string | null
          recipient_email: string
          sent_at?: string
        }
        Update: {
          branch_id?: string
          id?: string
          nudge_key?: string
          offset_day?: number
          outbox_id?: string | null
          recipient_email?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nudge_send_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      number_sequences: {
        Row: {
          app_id: string
          branch_id: string | null
          id: string
          last_value: number
          prefix: string
          sequence_type: string
          tenant_id: string | null
        }
        Insert: {
          app_id: string
          branch_id?: string | null
          id?: string
          last_value?: number
          prefix: string
          sequence_type: string
          tenant_id?: string | null
        }
        Update: {
          app_id?: string
          branch_id?: string | null
          id?: string
          last_value?: number
          prefix?: string
          sequence_type?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "number_sequences_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_role: string | null
          app_id: string | null
          created_at: string
          id: string
          message: string | null
          request_payload: Json | null
          response_payload: Json | null
          status: string
          target_id: string | null
          target_type: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          app_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
          target_id?: string | null
          target_type?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          app_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
          target_id?: string | null
          target_type?: string | null
          tenant_id?: string | null
        }
        Relationships: []
      }
      ops_storage_snapshots: {
        Row: {
          backend: string
          breakdown: Json | null
          bucket: string
          captured_at: string
          duration_ms: number | null
          id: string
          object_count: number
          prefix: string | null
          total_bytes: number
        }
        Insert: {
          backend?: string
          breakdown?: Json | null
          bucket?: string
          captured_at?: string
          duration_ms?: number | null
          id?: string
          object_count?: number
          prefix?: string | null
          total_bytes?: number
        }
        Update: {
          backend?: string
          breakdown?: Json | null
          bucket?: string
          captured_at?: string
          duration_ms?: number | null
          id?: string
          object_count?: number
          prefix?: string | null
          total_bytes?: number
        }
        Relationships: []
      }
      order_addresses: {
        Row: {
          address_type: string
          city: string | null
          company_name: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          instructions: string | null
          line1: string | null
          line2: string | null
          order_id: string
          phone: string | null
          postal_code: string | null
          province: string | null
          suburb: string | null
        }
        Insert: {
          address_type: string
          city?: string | null
          company_name?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          instructions?: string | null
          line1?: string | null
          line2?: string | null
          order_id: string
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          suburb?: string | null
        }
        Update: {
          address_type?: string
          city?: string | null
          company_name?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          instructions?: string | null
          line1?: string | null
          line2?: string | null
          order_id?: string
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          suburb?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_addresses_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          metadata: Json
          order_id: string
          status: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          metadata?: Json
          order_id: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          metadata?: Json
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_documents: {
        Row: {
          app_id: string
          branch_id: string | null
          created_at: string
          created_by: string | null
          document_type: string
          file_name: string
          file_size_bytes: number | null
          id: string
          is_customer_visible: boolean
          job_id: string | null
          metadata: Json
          mime_type: string | null
          order_id: string | null
          public_url: string | null
          source_app_managed: boolean
          storage_bucket: string
          storage_path: string
          tenant_id: string
          title: string | null
          version_no: number
        }
        Insert: {
          app_id: string
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          document_type: string
          file_name: string
          file_size_bytes?: number | null
          id?: string
          is_customer_visible?: boolean
          job_id?: string | null
          metadata?: Json
          mime_type?: string | null
          order_id?: string | null
          public_url?: string | null
          source_app_managed?: boolean
          storage_bucket?: string
          storage_path: string
          tenant_id: string
          title?: string | null
          version_no?: number
        }
        Update: {
          app_id?: string
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          document_type?: string
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          is_customer_visible?: boolean
          job_id?: string | null
          metadata?: Json
          mime_type?: string | null
          order_id?: string | null
          public_url?: string | null
          source_app_managed?: boolean
          storage_bucket?: string
          storage_path?: string
          tenant_id?: string
          title?: string | null
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_documents_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_documents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "order_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_invoices: {
        Row: {
          amount_paid: number
          app_id: string
          created_at: string
          currency: string
          id: string
          invoice_number: string
          issued_at: string
          kind: string
          metadata: Json
          order_id: string
          storage_bucket: string
          storage_path: string
          tenant_id: string
          total_amount: number
        }
        Insert: {
          amount_paid?: number
          app_id: string
          created_at?: string
          currency?: string
          id?: string
          invoice_number: string
          issued_at?: string
          kind?: string
          metadata?: Json
          order_id: string
          storage_bucket?: string
          storage_path: string
          tenant_id: string
          total_amount?: number
        }
        Update: {
          amount_paid?: number
          app_id?: string
          created_at?: string
          currency?: string
          id?: string
          invoice_number?: string
          issued_at?: string
          kind?: string
          metadata?: Json
          order_id?: string
          storage_bucket?: string
          storage_path?: string
          tenant_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_invoices_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          variant_code: string | null
          weight_grams: number | null
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
          variant_code?: string | null
          weight_grams?: number | null
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
          variant_code?: string | null
          weight_grams?: number | null
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
      order_jobs: {
        Row: {
          app_id: string
          assembly_report: Json | null
          assigned_supplier_id: string | null
          assigned_to_profile_id: string | null
          auto_assemble_error: string | null
          auto_assemble_failed_at: string | null
          branch_id: string | null
          completed_at: string | null
          configuration: Json
          cost_price: number
          created_at: string
          customer_job_status: string
          external_job_ref: string | null
          external_product_key: string | null
          file_status: string
          gross_price: number
          id: string
          imposed_components: Json
          imposed_pdf_path: string | null
          imposition_n_up: number | null
          imposition_template_id: string | null
          imposition_templates_by_component: Json
          integration_payload: Json
          job_name: string | null
          job_number: string
          job_status: string
          job_ticket_pdf_path: string | null
          net_price: number
          order_id: string
          print_ready_assembled_at: string | null
          print_ready_pdf_path: string | null
          print_ready_pdf_paths: Json | null
          print_ready_spec_hash: string | null
          product_category: string | null
          product_name: string
          product_snapshot: Json
          production_specs: Json
          proof_status: string
          qty_remaining: number
          qty_sent: number
          quantity: number
          ready_at: string | null
          sequence_no: number
          supplier_status: string | null
          tenant_id: string
          unit_label: string | null
          updated_at: string
          urgency: string
          vat_rate: number
          weight_grams_override: number | null
          weight_kg: number | null
          weight_source: string | null
        }
        Insert: {
          app_id: string
          assembly_report?: Json | null
          assigned_supplier_id?: string | null
          assigned_to_profile_id?: string | null
          auto_assemble_error?: string | null
          auto_assemble_failed_at?: string | null
          branch_id?: string | null
          completed_at?: string | null
          configuration?: Json
          cost_price?: number
          created_at?: string
          customer_job_status?: string
          external_job_ref?: string | null
          external_product_key?: string | null
          file_status?: string
          gross_price?: number
          id?: string
          imposed_components?: Json
          imposed_pdf_path?: string | null
          imposition_n_up?: number | null
          imposition_template_id?: string | null
          imposition_templates_by_component?: Json
          integration_payload?: Json
          job_name?: string | null
          job_number: string
          job_status?: string
          job_ticket_pdf_path?: string | null
          net_price?: number
          order_id: string
          print_ready_assembled_at?: string | null
          print_ready_pdf_path?: string | null
          print_ready_pdf_paths?: Json | null
          print_ready_spec_hash?: string | null
          product_category?: string | null
          product_name: string
          product_snapshot?: Json
          production_specs?: Json
          proof_status?: string
          qty_remaining?: number
          qty_sent?: number
          quantity?: number
          ready_at?: string | null
          sequence_no: number
          supplier_status?: string | null
          tenant_id: string
          unit_label?: string | null
          updated_at?: string
          urgency?: string
          vat_rate?: number
          weight_grams_override?: number | null
          weight_kg?: number | null
          weight_source?: string | null
        }
        Update: {
          app_id?: string
          assembly_report?: Json | null
          assigned_supplier_id?: string | null
          assigned_to_profile_id?: string | null
          auto_assemble_error?: string | null
          auto_assemble_failed_at?: string | null
          branch_id?: string | null
          completed_at?: string | null
          configuration?: Json
          cost_price?: number
          created_at?: string
          customer_job_status?: string
          external_job_ref?: string | null
          external_product_key?: string | null
          file_status?: string
          gross_price?: number
          id?: string
          imposed_components?: Json
          imposed_pdf_path?: string | null
          imposition_n_up?: number | null
          imposition_template_id?: string | null
          imposition_templates_by_component?: Json
          integration_payload?: Json
          job_name?: string | null
          job_number?: string
          job_status?: string
          job_ticket_pdf_path?: string | null
          net_price?: number
          order_id?: string
          print_ready_assembled_at?: string | null
          print_ready_pdf_path?: string | null
          print_ready_pdf_paths?: Json | null
          print_ready_spec_hash?: string | null
          product_category?: string | null
          product_name?: string
          product_snapshot?: Json
          production_specs?: Json
          proof_status?: string
          qty_remaining?: number
          qty_sent?: number
          quantity?: number
          ready_at?: string | null
          sequence_no?: number
          supplier_status?: string | null
          tenant_id?: string
          unit_label?: string | null
          updated_at?: string
          urgency?: string
          vat_rate?: number
          weight_grams_override?: number | null
          weight_kg?: number | null
          weight_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_jobs_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_jobs_assigned_supplier_id_fkey"
            columns: ["assigned_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_jobs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_jobs_imposition_template_id_fkey"
            columns: ["imposition_template_id"]
            isOneToOne: false
            referencedRelation: "imposition_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_legal_acceptances: {
        Row: {
          accepted_at: string
          branch_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          order_id: string
          privacy_snapshot_hash: string | null
          privacy_updated_at: string | null
          tenant_id: string
          terms_snapshot_hash: string | null
          terms_updated_at: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          accepted_at?: string
          branch_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          order_id: string
          privacy_snapshot_hash?: string | null
          privacy_updated_at?: string | null
          tenant_id: string
          terms_snapshot_hash?: string | null
          terms_updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          accepted_at?: string
          branch_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          order_id?: string
          privacy_snapshot_hash?: string | null
          privacy_updated_at?: string | null
          tenant_id?: string
          terms_snapshot_hash?: string | null
          terms_updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_legal_acceptances_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_legal_acceptances_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_legal_acceptances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payment_attempts: {
        Row: {
          amount: number
          app_id: string
          branch_id: string | null
          created_at: string
          currency: string
          id: string
          order_id: string
          provider: string
          provider_session_id: string | null
          raw_payload: Json
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          app_id: string
          branch_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          order_id: string
          provider: string
          provider_session_id?: string | null
          raw_payload?: Json
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          app_id?: string
          branch_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          order_id?: string
          provider?: string
          provider_session_id?: string | null
          raw_payload?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payment_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_pricing_snapshots: {
        Row: {
          amount_due: number
          amount_paid: number
          created_at: string
          currency: string
          delivery_amount: number
          discount_amount: number
          id: string
          order_id: string
          pricing_snapshot: Json
          subtotal: number
          total_amount: number
          vat_amount: number
          vat_rate: number
          version_no: number
        }
        Insert: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          currency?: string
          delivery_amount?: number
          discount_amount?: number
          id?: string
          order_id: string
          pricing_snapshot?: Json
          subtotal: number
          total_amount: number
          vat_amount?: number
          vat_rate?: number
          version_no?: number
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          currency?: string
          delivery_amount?: number
          discount_amount?: number
          id?: string
          order_id?: string
          pricing_snapshot?: Json
          subtotal?: number
          total_amount?: number
          vat_amount?: number
          vat_rate?: number
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_pricing_snapshots_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_status: string
          amount_due: number
          amount_paid: number
          app_id: string | null
          branch_id: string | null
          company_name: string | null
          completed_at: string | null
          cost_centre: string | null
          created_at: string
          created_by_admin_profile_id: string | null
          created_under_impersonation_id: string | null
          currency: string
          customer_email: string | null
          customer_name: string | null
          customer_status: string
          date_required: string | null
          delivery_amount: number
          discount_amount: number
          discount_code: string | null
          discount_snapshot: Json | null
          dispatched_at: string | null
          external_code: string | null
          external_order_ref: string | null
          fulfillment_type:
            | Database["public"]["Enums"]["fulfillment_type"]
            | null
          fulfilment_status: string
          id: string
          impersonated_by: string | null
          is_demo: boolean
          metadata: Json
          notes: string | null
          notes_customer: string | null
          notes_internal: string | null
          order_number: string | null
          order_status: Database["public"]["Enums"]["order_status"]
          ordered_by_profile_id: string | null
          payment_status: string
          po_number: string | null
          production_branch_id: string | null
          ready_at: string | null
          source_channel: string | null
          storefront_name: string | null
          submitted_at: string | null
          subtotal: number
          tenant_id: string | null
          total_amount: number
          total_price: number
          tracking_carrier: string | null
          tracking_number: string | null
          turnaround_time_text: string | null
          updated_at: string
          user_id: string
          vat_amount: number
        }
        Insert: {
          admin_status?: string
          amount_due?: number
          amount_paid?: number
          app_id?: string | null
          branch_id?: string | null
          company_name?: string | null
          completed_at?: string | null
          cost_centre?: string | null
          created_at?: string
          created_by_admin_profile_id?: string | null
          created_under_impersonation_id?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_status?: string
          date_required?: string | null
          delivery_amount?: number
          discount_amount?: number
          discount_code?: string | null
          discount_snapshot?: Json | null
          dispatched_at?: string | null
          external_code?: string | null
          external_order_ref?: string | null
          fulfillment_type?:
            | Database["public"]["Enums"]["fulfillment_type"]
            | null
          fulfilment_status?: string
          id?: string
          impersonated_by?: string | null
          is_demo?: boolean
          metadata?: Json
          notes?: string | null
          notes_customer?: string | null
          notes_internal?: string | null
          order_number?: string | null
          order_status?: Database["public"]["Enums"]["order_status"]
          ordered_by_profile_id?: string | null
          payment_status?: string
          po_number?: string | null
          production_branch_id?: string | null
          ready_at?: string | null
          source_channel?: string | null
          storefront_name?: string | null
          submitted_at?: string | null
          subtotal?: number
          tenant_id?: string | null
          total_amount?: number
          total_price?: number
          tracking_carrier?: string | null
          tracking_number?: string | null
          turnaround_time_text?: string | null
          updated_at?: string
          user_id: string
          vat_amount?: number
        }
        Update: {
          admin_status?: string
          amount_due?: number
          amount_paid?: number
          app_id?: string | null
          branch_id?: string | null
          company_name?: string | null
          completed_at?: string | null
          cost_centre?: string | null
          created_at?: string
          created_by_admin_profile_id?: string | null
          created_under_impersonation_id?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_status?: string
          date_required?: string | null
          delivery_amount?: number
          discount_amount?: number
          discount_code?: string | null
          discount_snapshot?: Json | null
          dispatched_at?: string | null
          external_code?: string | null
          external_order_ref?: string | null
          fulfillment_type?:
            | Database["public"]["Enums"]["fulfillment_type"]
            | null
          fulfilment_status?: string
          id?: string
          impersonated_by?: string | null
          is_demo?: boolean
          metadata?: Json
          notes?: string | null
          notes_customer?: string | null
          notes_internal?: string | null
          order_number?: string | null
          order_status?: Database["public"]["Enums"]["order_status"]
          ordered_by_profile_id?: string | null
          payment_status?: string
          po_number?: string | null
          production_branch_id?: string | null
          ready_at?: string | null
          source_channel?: string | null
          storefront_name?: string | null
          submitted_at?: string | null
          subtotal?: number
          tenant_id?: string | null
          total_amount?: number
          total_price?: number
          tracking_carrier?: string | null
          tracking_number?: string | null
          turnaround_time_text?: string | null
          updated_at?: string
          user_id?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_admin_profile_id_fkey"
            columns: ["created_by_admin_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_under_impersonation_id_fkey"
            columns: ["created_under_impersonation_id"]
            isOneToOne: false
            referencedRelation: "impersonation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_impersonated_by_fkey"
            columns: ["impersonated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_ordered_by_profile_fk"
            columns: ["ordered_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_production_branch_id_fkey"
            columns: ["production_branch_id"]
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
      payments: {
        Row: {
          amount: number
          app_id: string
          created_at: string
          currency: string
          id: string
          initiated_at: string | null
          metadata: Json
          order_id: string
          paid_at: string | null
          payment_reference: string | null
          provider: string
          provider_payment_intent_id: string | null
          provider_refund_id: string | null
          provider_transaction_id: string | null
          raw_payload: Json
          status: string
          tenant_id: string
        }
        Insert: {
          amount: number
          app_id: string
          created_at?: string
          currency?: string
          id?: string
          initiated_at?: string | null
          metadata?: Json
          order_id: string
          paid_at?: string | null
          payment_reference?: string | null
          provider: string
          provider_payment_intent_id?: string | null
          provider_refund_id?: string | null
          provider_transaction_id?: string | null
          raw_payload?: Json
          status: string
          tenant_id: string
        }
        Update: {
          amount?: number
          app_id?: string
          created_at?: string
          currency?: string
          id?: string
          initiated_at?: string | null
          metadata?: Json
          order_id?: string
          paid_at?: string | null
          payment_reference?: string | null
          provider?: string
          provider_payment_intent_id?: string | null
          provider_refund_id?: string | null
          provider_transaction_id?: string | null
          raw_payload?: Json
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_activation_requests: {
        Row: {
          created_at: string
          email_confirmed: boolean
          id: string
          ip_hash: string | null
          result: string
          slug: string
        }
        Insert: {
          created_at?: string
          email_confirmed?: boolean
          id?: string
          ip_hash?: string | null
          result: string
          slug: string
        }
        Update: {
          created_at?: string
          email_confirmed?: boolean
          id?: string
          ip_hash?: string | null
          result?: string
          slug?: string
        }
        Relationships: []
      }
      platform_admin_audit: {
        Row: {
          action: string
          actor_email_snapshot: string | null
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          branch_id: string | null
          created_at: string
          id: string
          ip: string | null
          reason: string | null
          target_id: string | null
          target_type: string
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email_snapshot?: string | null
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          branch_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          reason?: string | null
          target_id?: string | null
          target_type: string
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email_snapshot?: string | null
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          branch_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          reason?: string | null
          target_id?: string | null
          target_type?: string
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      platform_branch_activation_pages: {
        Row: {
          app_id: string | null
          branch_id: string
          contact_email: string
          contact_name: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          slug: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          app_id?: string | null
          branch_id: string
          contact_email: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          slug: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          app_id?: string | null
          branch_id?: string
          contact_email?: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          slug?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_branch_activation_pages_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_branch_activation_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_campaign_triggers: {
        Row: {
          action_template_slug: string
          campaign_id: string | null
          condition: string
          created_at: string
          created_by: string | null
          delay_hours: number
          enabled: boolean
          id: string
          max_follow_ups: number
          template_slug: string | null
          updated_at: string
        }
        Insert: {
          action_template_slug: string
          campaign_id?: string | null
          condition: string
          created_at?: string
          created_by?: string | null
          delay_hours?: number
          enabled?: boolean
          id?: string
          max_follow_ups?: number
          template_slug?: string | null
          updated_at?: string
        }
        Update: {
          action_template_slug?: string
          campaign_id?: string | null
          condition?: string
          created_at?: string
          created_by?: string | null
          delay_hours?: number
          enabled?: boolean
          id?: string
          max_follow_ups?: number
          template_slug?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_campaign_triggers_action_template_slug_fkey"
            columns: ["action_template_slug"]
            isOneToOne: false
            referencedRelation: "platform_email_templates"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "platform_campaign_triggers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "platform_email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_email_campaign_recipients: {
        Row: {
          action_link: string | null
          activated_at: string | null
          branch_id: string | null
          campaign_id: string
          click_count: number
          created_at: string
          email: string | null
          error: string | null
          first_clicked_at: string | null
          first_opened_at: string | null
          follow_up_count: number
          id: string
          last_clicked_url: string | null
          last_follow_up_at: string | null
          open_count: number
          sent_at: string | null
          status: string
        }
        Insert: {
          action_link?: string | null
          activated_at?: string | null
          branch_id?: string | null
          campaign_id: string
          click_count?: number
          created_at?: string
          email?: string | null
          error?: string | null
          first_clicked_at?: string | null
          first_opened_at?: string | null
          follow_up_count?: number
          id?: string
          last_clicked_url?: string | null
          last_follow_up_at?: string | null
          open_count?: number
          sent_at?: string | null
          status: string
        }
        Update: {
          action_link?: string | null
          activated_at?: string | null
          branch_id?: string | null
          campaign_id?: string
          click_count?: number
          created_at?: string
          email?: string | null
          error?: string | null
          first_clicked_at?: string | null
          first_opened_at?: string | null
          follow_up_count?: number
          id?: string
          last_clicked_url?: string | null
          last_follow_up_at?: string | null
          open_count?: number
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_email_campaign_recipients_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "platform_email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_email_campaigns: {
        Row: {
          body_html_snapshot: string
          body_text_snapshot: string | null
          created_at: string
          created_by: string | null
          failed_count: number
          id: string
          kind: string
          parent_campaign_id: string | null
          sent_count: number
          skipped_count: number
          status: string
          subject_snapshot: string
          template_slug: string
          tenant_id: string | null
          total_recipients: number
        }
        Insert: {
          body_html_snapshot: string
          body_text_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          kind?: string
          parent_campaign_id?: string | null
          sent_count?: number
          skipped_count?: number
          status?: string
          subject_snapshot: string
          template_slug: string
          tenant_id?: string | null
          total_recipients?: number
        }
        Update: {
          body_html_snapshot?: string
          body_text_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          kind?: string
          parent_campaign_id?: string | null
          sent_count?: number
          skipped_count?: number
          status?: string
          subject_snapshot?: string
          template_slug?: string
          tenant_id?: string | null
          total_recipients?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_email_campaigns_parent_campaign_id_fkey"
            columns: ["parent_campaign_id"]
            isOneToOne: false
            referencedRelation: "platform_email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_email_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_email_templates: {
        Row: {
          body_html: string
          body_text: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean
          kind: string
          name: string
          slug: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_html: string
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          kind?: string
          name: string
          slug: string
          subject: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          kind?: string
          name?: string
          slug?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_legal_documents: {
        Row: {
          created_at: string
          draft_html: string | null
          draft_updated_at: string | null
          draft_updated_by: string | null
          effective_date: string | null
          published_at: string | null
          published_by: string | null
          published_html: string | null
          published_version: number
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          draft_html?: string | null
          draft_updated_at?: string | null
          draft_updated_by?: string | null
          effective_date?: string | null
          published_at?: string | null
          published_by?: string | null
          published_html?: string | null
          published_version?: number
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          draft_html?: string | null
          draft_updated_at?: string | null
          draft_updated_by?: string | null
          effective_date?: string | null
          published_at?: string | null
          published_by?: string | null
          published_html?: string | null
          published_version?: number
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_legal_versions: {
        Row: {
          created_at: string
          effective_date: string | null
          html: string
          id: string
          published_at: string
          published_by: string | null
          slug: string
          version: number
        }
        Insert: {
          created_at?: string
          effective_date?: string | null
          html: string
          id?: string
          published_at?: string
          published_by?: string | null
          slug: string
          version: number
        }
        Update: {
          created_at?: string
          effective_date?: string | null
          html?: string
          id?: string
          published_at?: string
          published_by?: string | null
          slug?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_legal_versions_slug_fkey"
            columns: ["slug"]
            isOneToOne: false
            referencedRelation: "platform_legal_documents"
            referencedColumns: ["slug"]
          },
        ]
      }
      platform_nudge_settings: {
        Row: {
          description: string | null
          enabled: boolean
          label: string
          min_hours_between_sends: number
          nudge_key: string
          offsets_days: number[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          label: string
          min_hours_between_sends?: number
          nudge_key: string
          offsets_days?: number[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          enabled?: boolean
          label?: string
          min_hours_between_sends?: number
          nudge_key?: string
          offsets_days?: number[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_onboarding_tokens: {
        Row: {
          branch_id: string | null
          campaign_recipient_id: string | null
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          last_used_at: string | null
          profile_id: string | null
          purpose: string
          tenant_id: string | null
          token: string
          use_count: number
        }
        Insert: {
          branch_id?: string | null
          campaign_recipient_id?: string | null
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          profile_id?: string | null
          purpose?: string
          tenant_id?: string | null
          token: string
          use_count?: number
        }
        Update: {
          branch_id?: string | null
          campaign_recipient_id?: string | null
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          profile_id?: string | null
          purpose?: string
          tenant_id?: string | null
          token?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_onboarding_tokens_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_onboarding_tokens_campaign_recipient_id_fkey"
            columns: ["campaign_recipient_id"]
            isOneToOne: false
            referencedRelation: "platform_email_campaign_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_onboarding_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_pricing_plans: {
        Row: {
          created_at: string
          id: string
          plan_name: string
          plan_slug: string
          price: number
          region_id: string
          scope: string
          sort_order: number
          stripe_coupon_id: string | null
          stripe_coupon_id_with_trial: string | null
          stripe_price_id: string | null
          stripe_promotion_code_id: string | null
          trial_offer: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_name: string
          plan_slug: string
          price?: number
          region_id: string
          scope?: string
          sort_order?: number
          stripe_coupon_id?: string | null
          stripe_coupon_id_with_trial?: string | null
          stripe_price_id?: string | null
          stripe_promotion_code_id?: string | null
          trial_offer?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_name?: string
          plan_slug?: string
          price?: number
          region_id?: string
          scope?: string
          sort_order?: number
          stripe_coupon_id?: string | null
          stripe_coupon_id_with_trial?: string | null
          stripe_price_id?: string | null
          stripe_promotion_code_id?: string | null
          trial_offer?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_pricing_plans_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "platform_pricing_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_pricing_regions: {
        Row: {
          country_codes: string[]
          created_at: string
          currency_code: string
          currency_symbol: string
          id: string
          is_default: boolean
          is_rest_of_world: boolean
          region_code: string
          region_label: string
          sort_order: number
          tax_note: string | null
          updated_at: string
        }
        Insert: {
          country_codes?: string[]
          created_at?: string
          currency_code: string
          currency_symbol: string
          id?: string
          is_default?: boolean
          is_rest_of_world?: boolean
          region_code: string
          region_label: string
          sort_order?: number
          tax_note?: string | null
          updated_at?: string
        }
        Update: {
          country_codes?: string[]
          created_at?: string
          currency_code?: string
          currency_symbol?: string
          id?: string
          is_default?: boolean
          is_rest_of_world?: boolean
          region_code?: string
          region_label?: string
          sort_order?: number
          tax_note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_promo_codes: {
        Row: {
          applicable_plan_slugs: string[] | null
          code: string
          created_at: string
          currency_code: string | null
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          max_uses: number | null
          times_used: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applicable_plan_slugs?: string[] | null
          code: string
          created_at?: string
          currency_code?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          times_used?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applicable_plan_slugs?: string[] | null
          code?: string
          created_at?: string
          currency_code?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          times_used?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
          value_type: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
          value_type?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          value_type?: string
        }
        Relationships: []
      }
      pricing_currency_profiles: {
        Row: {
          buying_power_mult: number
          currency_code: string
          fx_from_zar: number
          min_value: number
          notes: string | null
          rounding_step: number
          symbol: string | null
          updated_at: string
        }
        Insert: {
          buying_power_mult?: number
          currency_code: string
          fx_from_zar: number
          min_value?: number
          notes?: string | null
          rounding_step?: number
          symbol?: string | null
          updated_at?: string
        }
        Update: {
          buying_power_mult?: number
          currency_code?: string
          fx_from_zar?: number
          min_value?: number
          notes?: string | null
          rounding_step?: number
          symbol?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          branch_id: string | null
          conditions: Json
          created_at: string
          currency_code: string
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
          branch_id?: string | null
          conditions?: Json
          created_at?: string
          currency_code?: string
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
          branch_id?: string | null
          conditions?: Json
          created_at?: string
          currency_code?: string
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
            foreignKeyName: "pricing_rules_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
      product_catalog_links: {
        Row: {
          branch_id: string | null
          catalog: Database["public"]["Enums"]["catalog_kind"]
          created_at: string
          id: string
          is_default: boolean
          item_code: string
          product_family_id: string
          scope_type: Database["public"]["Enums"]["catalog_scope"]
          sort_order: number
          sub_attribute: string
          tenant_id: string | null
          unit_system: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          catalog: Database["public"]["Enums"]["catalog_kind"]
          created_at?: string
          id?: string
          is_default?: boolean
          item_code: string
          product_family_id: string
          scope_type?: Database["public"]["Enums"]["catalog_scope"]
          sort_order?: number
          sub_attribute?: string
          tenant_id?: string | null
          unit_system?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          catalog?: Database["public"]["Enums"]["catalog_kind"]
          created_at?: string
          id?: string
          is_default?: boolean
          item_code?: string
          product_family_id?: string
          scope_type?: Database["public"]["Enums"]["catalog_scope"]
          sort_order?: number
          sub_attribute?: string
          tenant_id?: string | null
          unit_system?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_catalog_links_product_family_id_fkey"
            columns: ["product_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_families: {
        Row: {
          category_id: string | null
          cmyk_profile: string
          color_output: string
          created_at: string
          description: string | null
          expected_page_count: number | null
          expected_trim_height_mm: number | null
          expected_trim_width_mm: number | null
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean
          kind: string | null
          name: string
          pricing_addons: Json
          pricing_engine: string
          pricing_options: Json
          printing_rules: Json
          quantity_blocks: Json
          quantity_mode: string
          render_intent: string
          slug: string
          sort_order: number
          supplied_artwork_only: boolean
          supports_editable_artwork: boolean
          tenant_id: string | null
        }
        Insert: {
          category_id?: string | null
          cmyk_profile?: string
          color_output?: string
          created_at?: string
          description?: string | null
          expected_page_count?: number | null
          expected_trim_height_mm?: number | null
          expected_trim_width_mm?: number | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          kind?: string | null
          name: string
          pricing_addons?: Json
          pricing_engine?: string
          pricing_options?: Json
          printing_rules?: Json
          quantity_blocks?: Json
          quantity_mode?: string
          render_intent?: string
          slug: string
          sort_order?: number
          supplied_artwork_only?: boolean
          supports_editable_artwork?: boolean
          tenant_id?: string | null
        }
        Update: {
          category_id?: string | null
          cmyk_profile?: string
          color_output?: string
          created_at?: string
          description?: string | null
          expected_page_count?: number | null
          expected_trim_height_mm?: number | null
          expected_trim_width_mm?: number | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          kind?: string | null
          name?: string
          pricing_addons?: Json
          pricing_engine?: string
          pricing_options?: Json
          printing_rules?: Json
          quantity_blocks?: Json
          quantity_mode?: string
          render_intent?: string
          slug?: string
          sort_order?: number
          supplied_artwork_only?: boolean
          supports_editable_artwork?: boolean
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_families_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_families_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_imposition_defaults: {
        Row: {
          created_at: string
          id: string
          imposition_template_id: string
          is_primary: boolean
          product_family_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          imposition_template_id: string
          is_primary?: boolean
          product_family_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          imposition_template_id?: string
          is_primary?: boolean
          product_family_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_imposition_defaults_imposition_template_id_fkey"
            columns: ["imposition_template_id"]
            isOneToOne: false
            referencedRelation: "imposition_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_imposition_defaults_product_family_id_fkey"
            columns: ["product_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
        ]
      }
      product_options: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          manual_values: Json
          name: string
          option_type: string
          product_family_id: string
          sort_order: number
          source: string
          source_filter: Json | null
          values: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          manual_values?: Json
          name: string
          option_type: string
          product_family_id: string
          sort_order?: number
          source?: string
          source_filter?: Json | null
          values?: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          manual_values?: Json
          name?: string
          option_type?: string
          product_family_id?: string
          sort_order?: number
          source?: string
          source_filter?: Json | null
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
      product_pack_pricing_overrides: {
        Row: {
          branch_id: string | null
          id: string
          pricing_addons: Json | null
          product_family_id: string
          quantity_blocks: Json
          tenant_id: string
          updated_at: string
          updated_by: string | null
          variant_code: string | null
        }
        Insert: {
          branch_id?: string | null
          id?: string
          pricing_addons?: Json | null
          product_family_id: string
          quantity_blocks?: Json
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          variant_code?: string | null
        }
        Update: {
          branch_id?: string | null
          id?: string
          pricing_addons?: Json | null
          product_family_id?: string
          quantity_blocks?: Json
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          variant_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_pack_pricing_overrides_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_pack_pricing_overrides_product_family_id_fkey"
            columns: ["product_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_pack_pricing_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_price_overrides: {
        Row: {
          branch_id: string | null
          conditions: Json
          cost_price: number | null
          created_at: string
          currency_code: string
          id: string
          is_active: boolean
          product_family_id: string
          quantity_max: number | null
          quantity_min: number | null
          sell_price: number
          tenant_id: string
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          branch_id?: string | null
          conditions?: Json
          cost_price?: number | null
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          product_family_id: string
          quantity_max?: number | null
          quantity_min?: number | null
          sell_price: number
          tenant_id: string
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          branch_id?: string | null
          conditions?: Json
          cost_price?: number | null
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          product_family_id?: string
          quantity_max?: number | null
          quantity_min?: number | null
          sell_price?: number
          tenant_id?: string
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: []
      }
      product_variant_links: {
        Row: {
          catalog_variant_id: string
          created_at: string
          id: string
          is_default: boolean
          product_family_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          catalog_variant_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          product_family_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          catalog_variant_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          product_family_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_links_catalog_variant_id_fkey"
            columns: ["catalog_variant_id"]
            isOneToOne: false
            referencedRelation: "catalog_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_links_product_family_id_fkey"
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
          email: string | null
          favourite_branch_id: string | null
          first_name: string | null
          global_role: string
          id: string
          is_active: boolean
          is_anonymous: boolean
          is_demo: boolean
          last_name: string | null
          phone: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          favourite_branch_id?: string | null
          first_name?: string | null
          global_role?: string
          id: string
          is_active?: boolean
          is_anonymous?: boolean
          is_demo?: boolean
          last_name?: string | null
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          favourite_branch_id?: string | null
          first_name?: string | null
          global_role?: string
          id?: string
          is_active?: boolean
          is_anonymous?: boolean
          is_demo?: boolean
          last_name?: string | null
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_favourite_branch_id_fkey"
            columns: ["favourite_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_documents: {
        Row: {
          created_at: string
          file_name: string
          file_size_bytes: number | null
          id: string
          metadata: Json
          mime_type: string | null
          quote_id: string
          quote_item_id: string | null
          source_order_document_id: string | null
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size_bytes?: number | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          quote_id: string
          quote_item_id?: string | null
          source_order_document_id?: string | null
          storage_bucket?: string
          storage_path: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          quote_id?: string
          quote_item_id?: string | null
          source_order_document_id?: string | null
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_documents_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_documents_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          configuration: Json
          created_at: string
          external_product_key: string | null
          gross_price: number
          id: string
          job_name: string | null
          net_price: number
          product_category: string | null
          product_family_id: string | null
          product_name: string
          product_snapshot: Json
          quantity: number
          quote_id: string
          sequence_no: number
          source_job_id: string | null
          unit_label: string | null
          unit_price: number
          variant_code: string | null
          vat_rate: number
        }
        Insert: {
          configuration?: Json
          created_at?: string
          external_product_key?: string | null
          gross_price?: number
          id?: string
          job_name?: string | null
          net_price?: number
          product_category?: string | null
          product_family_id?: string | null
          product_name: string
          product_snapshot?: Json
          quantity?: number
          quote_id: string
          sequence_no?: number
          source_job_id?: string | null
          unit_label?: string | null
          unit_price?: number
          variant_code?: string | null
          vat_rate?: number
        }
        Update: {
          configuration?: Json
          created_at?: string
          external_product_key?: string | null
          gross_price?: number
          id?: string
          job_name?: string | null
          net_price?: number
          product_category?: string | null
          product_family_id?: string | null
          product_name?: string
          product_snapshot?: Json
          quantity?: number
          quote_id?: string
          sequence_no?: number
          source_job_id?: string | null
          unit_label?: string | null
          unit_price?: number
          variant_code?: string | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_revisions: {
        Row: {
          change_reason: string | null
          changed_by_profile_id: string | null
          created_at: string
          id: string
          quote_id: string
          revision_no: number
          snapshot: Json
          subtotal: number
          total_amount: number
        }
        Insert: {
          change_reason?: string | null
          changed_by_profile_id?: string | null
          created_at?: string
          id?: string
          quote_id: string
          revision_no: number
          snapshot?: Json
          subtotal?: number
          total_amount?: number
        }
        Update: {
          change_reason?: string | null
          changed_by_profile_id?: string | null
          created_at?: string
          id?: string
          quote_id?: string
          revision_no?: number
          snapshot?: Json
          subtotal?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_revisions_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          app_id: string
          approved_at: string | null
          branch_id: string | null
          company_name: string | null
          converted_at: string | null
          converted_order_id: string | null
          created_at: string
          created_by_profile_id: string | null
          created_via: string
          currency: string
          current_revision_no: number
          customer_email: string | null
          customer_name: string | null
          customer_profile_id: string
          declined_at: string | null
          delivery_amount: number
          discount_amount: number
          email_recipients: string[]
          expired_at: string | null
          id: string
          metadata: Json
          name: string | null
          notes_for_customer: string | null
          notes_internal: string | null
          pdf_generated_at: string | null
          pdf_storage_path: string | null
          quote_number: string
          quote_status: Database["public"]["Enums"]["quote_status"]
          source_order_id: string | null
          subtotal: number
          tenant_id: string
          total_amount: number
          updated_at: string
          valid_until: string
          vat_amount: number
        }
        Insert: {
          app_id: string
          approved_at?: string | null
          branch_id?: string | null
          company_name?: string | null
          converted_at?: string | null
          converted_order_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          created_via?: string
          currency?: string
          current_revision_no?: number
          customer_email?: string | null
          customer_name?: string | null
          customer_profile_id: string
          declined_at?: string | null
          delivery_amount?: number
          discount_amount?: number
          email_recipients?: string[]
          expired_at?: string | null
          id?: string
          metadata?: Json
          name?: string | null
          notes_for_customer?: string | null
          notes_internal?: string | null
          pdf_generated_at?: string | null
          pdf_storage_path?: string | null
          quote_number: string
          quote_status?: Database["public"]["Enums"]["quote_status"]
          source_order_id?: string | null
          subtotal?: number
          tenant_id: string
          total_amount?: number
          updated_at?: string
          valid_until: string
          vat_amount?: number
        }
        Update: {
          app_id?: string
          approved_at?: string | null
          branch_id?: string | null
          company_name?: string | null
          converted_at?: string | null
          converted_order_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          created_via?: string
          currency?: string
          current_revision_no?: number
          customer_email?: string | null
          customer_name?: string | null
          customer_profile_id?: string
          declined_at?: string | null
          delivery_amount?: number
          discount_amount?: number
          email_recipients?: string[]
          expired_at?: string | null
          id?: string
          metadata?: Json
          name?: string | null
          notes_for_customer?: string | null
          notes_internal?: string | null
          pdf_generated_at?: string | null
          pdf_storage_path?: string | null
          quote_number?: string
          quote_status?: Database["public"]["Enums"]["quote_status"]
          source_order_id?: string | null
          subtotal?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          valid_until?: string
          vat_amount?: number
        }
        Relationships: []
      }
      rate_card_business_cards: {
        Row: {
          branch_id: string | null
          code: string
          cost_price: number
          created_at: string
          finish: string
          id: string
          is_active: boolean
          label: string
          paper: string
          quantity: number
          scope_type: string
          sell_price: number
          sides: string
          sort_order: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          code: string
          cost_price?: number
          created_at?: string
          finish?: string
          id?: string
          is_active?: boolean
          label: string
          paper?: string
          quantity: number
          scope_type: string
          sell_price?: number
          sides?: string
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          code?: string
          cost_price?: number
          created_at?: string
          finish?: string
          id?: string
          is_active?: boolean
          label?: string
          paper?: string
          quantity?: number
          scope_type?: string
          sell_price?: number
          sides?: string
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_card_business_cards_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_card_business_cards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_card_canvas_prints: {
        Row: {
          branch_id: string | null
          cost_price: number
          created_at: string
          height_mm: number
          id: string
          is_active: boolean
          scope_type: Database["public"]["Enums"]["rate_card_scope"]
          sell_price: number
          size_label: string
          size_slug: string
          sort_order: number
          tenant_id: string | null
          updated_at: string
          width_mm: number
          wrap_mm: number
        }
        Insert: {
          branch_id?: string | null
          cost_price?: number
          created_at?: string
          height_mm: number
          id?: string
          is_active?: boolean
          scope_type: Database["public"]["Enums"]["rate_card_scope"]
          sell_price?: number
          size_label: string
          size_slug: string
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
          width_mm: number
          wrap_mm: number
        }
        Update: {
          branch_id?: string | null
          cost_price?: number
          created_at?: string
          height_mm?: number
          id?: string
          is_active?: boolean
          scope_type?: Database["public"]["Enums"]["rate_card_scope"]
          sell_price?: number
          size_label?: string
          size_slug?: string
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
          width_mm?: number
          wrap_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "rate_card_canvas_prints_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_card_canvas_prints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_card_canvas_wrap_surcharges: {
        Row: {
          branch_id: string | null
          cost_price: number
          created_at: string
          id: string
          is_active: boolean
          scope_type: Database["public"]["Enums"]["rate_card_scope"]
          sell_price: number
          tenant_id: string | null
          updated_at: string
          wrap_mode: string
        }
        Insert: {
          branch_id?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          scope_type: Database["public"]["Enums"]["rate_card_scope"]
          sell_price?: number
          tenant_id?: string | null
          updated_at?: string
          wrap_mode: string
        }
        Update: {
          branch_id?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          scope_type?: Database["public"]["Enums"]["rate_card_scope"]
          sell_price?: number
          tenant_id?: string | null
          updated_at?: string
          wrap_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_card_canvas_wrap_surcharges_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_card_canvas_wrap_surcharges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_card_clicks: {
        Row: {
          branch_id: string | null
          catalog_size_code: string | null
          colour: Database["public"]["Enums"]["click_colour"]
          cost_price: number
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          scope_type: Database["public"]["Enums"]["rate_card_scope"]
          sell_price: number
          sides: Database["public"]["Enums"]["click_sides"]
          size: string
          tenant_id: string | null
          updated_at: string
          variant_code: string | null
        }
        Insert: {
          branch_id?: string | null
          catalog_size_code?: string | null
          colour: Database["public"]["Enums"]["click_colour"]
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          scope_type: Database["public"]["Enums"]["rate_card_scope"]
          sell_price?: number
          sides: Database["public"]["Enums"]["click_sides"]
          size: string
          tenant_id?: string | null
          updated_at?: string
          variant_code?: string | null
        }
        Update: {
          branch_id?: string | null
          catalog_size_code?: string | null
          colour?: Database["public"]["Enums"]["click_colour"]
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          scope_type?: Database["public"]["Enums"]["rate_card_scope"]
          sell_price?: number
          sides?: Database["public"]["Enums"]["click_sides"]
          size?: string
          tenant_id?: string | null
          updated_at?: string
          variant_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_card_clicks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_card_clicks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_card_photo_prints: {
        Row: {
          border_mm: number
          branch_id: string | null
          code: string
          cost_price: number
          created_at: string
          finish: string
          height_mm: number
          id: string
          is_active: boolean
          label: string
          min_quantity: number
          scope_type: Database["public"]["Enums"]["rate_card_scope"]
          sell_price: number
          size_slug: string
          sort_order: number
          tenant_id: string | null
          updated_at: string
          width_mm: number
        }
        Insert: {
          border_mm?: number
          branch_id?: string | null
          code: string
          cost_price?: number
          created_at?: string
          finish?: string
          height_mm: number
          id?: string
          is_active?: boolean
          label: string
          min_quantity?: number
          scope_type: Database["public"]["Enums"]["rate_card_scope"]
          sell_price?: number
          size_slug: string
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
          width_mm: number
        }
        Update: {
          border_mm?: number
          branch_id?: string | null
          code?: string
          cost_price?: number
          created_at?: string
          finish?: string
          height_mm?: number
          id?: string
          is_active?: boolean
          label?: string
          min_quantity?: number
          scope_type?: Database["public"]["Enums"]["rate_card_scope"]
          sell_price?: number
          size_slug?: string
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
          width_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "rate_card_photo_prints_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_card_photo_prints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_card_price_breaks: {
        Row: {
          branch_id: string | null
          cost_price: number
          created_at: string
          id: string
          max_quantity: number | null
          min_quantity: number
          rate_card_id: string
          rate_card_table: string
          scope_type: string
          sell_price: number
          sort_order: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          max_quantity?: number | null
          min_quantity: number
          rate_card_id: string
          rate_card_table: string
          scope_type: string
          sell_price?: number
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          max_quantity?: number | null
          min_quantity?: number
          rate_card_id?: string
          rate_card_table?: string
          scope_type?: string
          sell_price?: number
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      status_history: {
        Row: {
          app_id: string
          changed_by: string | null
          created_at: string
          entity_type: string
          from_status: string | null
          id: string
          job_id: string | null
          order_id: string | null
          reason: string | null
          tenant_id: string
          to_status: string
        }
        Insert: {
          app_id: string
          changed_by?: string | null
          created_at?: string
          entity_type: string
          from_status?: string | null
          id?: string
          job_id?: string | null
          order_id?: string | null
          reason?: string | null
          tenant_id: string
          to_status: string
        }
        Update: {
          app_id?: string
          changed_by?: string | null
          created_at?: string
          entity_type?: string
          from_status?: string | null
          id?: string
          job_id?: string | null
          order_id?: string | null
          reason?: string | null
          tenant_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_history_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_history_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "order_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_acceptances: {
        Row: {
          accepted_at: string
          accepted_by: string
          branch_id: string
          context: string
          created_at: string
          document_slug: string
          document_version: number
          id: string
          ip_address: string | null
          metadata: Json
          stripe_checkout_session_id: string | null
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          accepted_at?: string
          accepted_by: string
          branch_id: string
          context?: string
          created_at?: string
          document_slug: string
          document_version: number
          id?: string
          ip_address?: string | null
          metadata?: Json
          stripe_checkout_session_id?: string | null
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          accepted_at?: string
          accepted_by?: string
          branch_id?: string
          context?: string
          created_at?: string
          document_slug?: string
          document_version?: number
          id?: string
          ip_address?: string | null
          metadata?: Json
          stripe_checkout_session_id?: string | null
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_acceptances_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_acceptances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      tenant_catalog_overrides: {
        Row: {
          catalog: Database["public"]["Enums"]["catalog_kind"]
          created_at: string
          id: string
          is_enabled: boolean
          item_code: string
          label_override: string | null
          metadata_override: Json | null
          price_delta_minor: number | null
          price_override_minor: number | null
          sub_attribute: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          catalog: Database["public"]["Enums"]["catalog_kind"]
          created_at?: string
          id?: string
          is_enabled?: boolean
          item_code: string
          label_override?: string | null
          metadata_override?: Json | null
          price_delta_minor?: number | null
          price_override_minor?: number | null
          sub_attribute?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          catalog?: Database["public"]["Enums"]["catalog_kind"]
          created_at?: string
          id?: string
          is_enabled?: boolean
          item_code?: string
          label_override?: string | null
          metadata_override?: Json | null
          price_delta_minor?: number | null
          price_override_minor?: number | null
          sub_attribute?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_catalog_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_delivery_method_overrides: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          is_enabled: boolean
          method_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          method_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          method_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_delivery_method_overrides_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_delivery_method_overrides_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "delivery_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_delivery_method_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_demo_gate: {
        Row: {
          cookie_days: number
          created_at: string
          disclaimer_html: string
          enabled: boolean
          headline: string
          password_hash: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cookie_days?: number
          created_at?: string
          disclaimer_html?: string
          enabled?: boolean
          headline?: string
          password_hash?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cookie_days?: number
          created_at?: string
          disclaimer_html?: string
          enabled?: boolean
          headline?: string
          password_hash?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_demo_gate_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          app_id: string
          branch_id: string | null
          can_view_all_orders: boolean
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          is_primary_branch: boolean
          is_primary_contact: boolean
          is_trade_customer: boolean
          job_title: string | null
          metadata: Json
          mis_account_number: string | null
          profile_id: string
          role: string
          tenant_id: string
        }
        Insert: {
          app_id: string
          branch_id?: string | null
          can_view_all_orders?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary_branch?: boolean
          is_primary_contact?: boolean
          is_trade_customer?: boolean
          job_title?: string | null
          metadata?: Json
          mis_account_number?: string | null
          profile_id: string
          role: string
          tenant_id: string
        }
        Update: {
          app_id?: string
          branch_id?: string | null
          can_view_all_orders?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary_branch?: boolean
          is_primary_contact?: boolean
          is_trade_customer?: boolean
          job_title?: string | null
          metadata?: Json
          mis_account_number?: string | null
          profile_id?: string
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_memberships_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "customer_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payment_gateways: {
        Row: {
          created_at: string
          credentials_secret_id: string | null
          display_label: string | null
          id: string
          is_enabled: boolean
          mode: string
          provider: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credentials_secret_id?: string | null
          display_label?: string | null
          id?: string
          is_enabled?: boolean
          mode?: string
          provider: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credentials_secret_id?: string | null
          display_label?: string | null
          id?: string
          is_enabled?: boolean
          mode?: string
          provider?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payment_gateways_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_product_toggles: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          product_family_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          product_family_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          product_family_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenant_settings: {
        Row: {
          category: string
          created_at: string
          id: string
          is_sensitive: boolean
          setting_key: string
          setting_value: Json
          sort_order: number
          tenant_id: string
          updated_at: string
          value_type: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_sensitive?: boolean
          setting_key: string
          setting_value?: Json
          sort_order?: number
          tenant_id: string
          updated_at?: string
          value_type?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_sensitive?: boolean
          setting_key?: string
          setting_value?: Json
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_plan_slug: string | null
          billing_status: string
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          discount_type: string | null
          discount_value: number | null
          id: string
          metadata: Json
          plan_slug: string
          promo_code_id: string | null
          region_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          trial_days: number | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_plan_slug?: string | null
          billing_status?: string
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          discount_type?: string | null
          discount_value?: number | null
          id?: string
          metadata?: Json
          plan_slug?: string
          promo_code_id?: string | null
          region_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          trial_days?: number | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_plan_slug?: string | null
          billing_status?: string
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          discount_type?: string | null
          discount_value?: number | null
          id?: string
          metadata?: Json
          plan_slug?: string
          promo_code_id?: string | null
          region_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          trial_days?: number | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "platform_promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "platform_pricing_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          app_id: string | null
          assigned_discount_type: string | null
          assigned_discount_value: number | null
          assigned_plan_slug: string | null
          assigned_region_id: string | null
          assigned_trial_days: number | null
          billing_email: string | null
          billing_notes: string | null
          country: string
          country_code: string
          created_at: string
          custom_domain: string | null
          default_currency: string
          external_ref: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          legal_name: string | null
          locale: string
          logo_url: string | null
          name: string
          onboarding_status: string
          payment_mode: string
          plan_assigned_at: string | null
          plan_assigned_by: string | null
          plan_slug: string
          proof_mode: string
          registration_number: string | null
          settings: Json
          show_country_selector: boolean
          slug: string
          support_email: string | null
          support_phone: string | null
          timezone: string
          trading_name: string | null
          updated_at: string
          vat_number: string | null
          website_url: string | null
          workflow_template: string
        }
        Insert: {
          app_id?: string | null
          assigned_discount_type?: string | null
          assigned_discount_value?: number | null
          assigned_plan_slug?: string | null
          assigned_region_id?: string | null
          assigned_trial_days?: number | null
          billing_email?: string | null
          billing_notes?: string | null
          country?: string
          country_code?: string
          created_at?: string
          custom_domain?: string | null
          default_currency?: string
          external_ref?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          legal_name?: string | null
          locale?: string
          logo_url?: string | null
          name: string
          onboarding_status?: string
          payment_mode?: string
          plan_assigned_at?: string | null
          plan_assigned_by?: string | null
          plan_slug?: string
          proof_mode?: string
          registration_number?: string | null
          settings?: Json
          show_country_selector?: boolean
          slug: string
          support_email?: string | null
          support_phone?: string | null
          timezone?: string
          trading_name?: string | null
          updated_at?: string
          vat_number?: string | null
          website_url?: string | null
          workflow_template?: string
        }
        Update: {
          app_id?: string | null
          assigned_discount_type?: string | null
          assigned_discount_value?: number | null
          assigned_plan_slug?: string | null
          assigned_region_id?: string | null
          assigned_trial_days?: number | null
          billing_email?: string | null
          billing_notes?: string | null
          country?: string
          country_code?: string
          created_at?: string
          custom_domain?: string | null
          default_currency?: string
          external_ref?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          legal_name?: string | null
          locale?: string
          logo_url?: string | null
          name?: string
          onboarding_status?: string
          payment_mode?: string
          plan_assigned_at?: string | null
          plan_assigned_by?: string | null
          plan_slug?: string
          proof_mode?: string
          registration_number?: string | null
          settings?: Json
          show_country_selector?: boolean
          slug?: string
          support_email?: string | null
          support_phone?: string | null
          timezone?: string
          trading_name?: string | null
          updated_at?: string
          vat_number?: string | null
          website_url?: string | null
          workflow_template?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_assigned_region_id_fkey"
            columns: ["assigned_region_id"]
            isOneToOne: false
            referencedRelation: "platform_pricing_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          actor_name: string | null
          actor_profile_id: string | null
          actor_type: string
          app_id: string
          branch_id: string | null
          created_at: string
          description: string
          event_type: string
          id: string
          impersonated_by: string | null
          job_id: string | null
          metadata: Json
          order_id: string | null
          tenant_id: string
          visibility: string
        }
        Insert: {
          actor_name?: string | null
          actor_profile_id?: string | null
          actor_type: string
          app_id: string
          branch_id?: string | null
          created_at?: string
          description: string
          event_type: string
          id?: string
          impersonated_by?: string | null
          job_id?: string | null
          metadata?: Json
          order_id?: string | null
          tenant_id: string
          visibility?: string
        }
        Update: {
          actor_name?: string | null
          actor_profile_id?: string | null
          actor_type?: string
          app_id?: string
          branch_id?: string | null
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          impersonated_by?: string | null
          job_id?: string | null
          metadata?: Json
          order_id?: string | null
          tenant_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_impersonated_by_fkey"
            columns: ["impersonated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "order_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_sessions: {
        Row: {
          app_id: string
          created_at: string
          created_by: string
          expires_at: string
          file_count: number
          id: string
          is_active: boolean
          order_item_id: string | null
          tenant_id: string
          token: string
          updated_at: string
        }
        Insert: {
          app_id: string
          created_at?: string
          created_by: string
          expires_at?: string
          file_count?: number
          id?: string
          is_active?: boolean
          order_item_id?: string | null
          tenant_id: string
          token?: string
          updated_at?: string
        }
        Update: {
          app_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          file_count?: number
          id?: string
          is_active?: boolean
          order_item_id?: string | null
          tenant_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_sessions_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_sessions_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_admin_audit: {
        Row: {
          action: string
          actor_profile_id: string
          app_id: string | null
          created_at: string
          id: string
          metadata: Json
          reason: string | null
          target_email: string | null
          target_profile_id: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_profile_id: string
          app_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          target_email?: string | null
          target_profile_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string
          app_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          target_email?: string | null
          target_profile_id?: string | null
          tenant_id?: string | null
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
      apply_tenant_plan_to_branches: {
        Args: { p_tenant_id: string }
        Returns: number
      }
      branch_setting_own: {
        Args: { p_branch_id: string; p_category: string; p_key: string }
        Returns: Json
      }
      branch_subscription_active: {
        Args: { p_branch_id: string }
        Returns: boolean
      }
      caller_can_impersonate: { Args: { _target: string }; Returns: boolean }
      caller_has_branch_access: {
        Args: { _branch_id: string }
        Returns: boolean
      }
      catalog_code_in_unit: {
        Args: {
          p_catalog: string
          p_code: string
          p_sub_attribute: string
          p_unit: string
        }
        Returns: boolean
      }
      catalog_unit_twin_code: {
        Args: { p_catalog: string; p_code: string; p_unit: string }
        Returns: string
      }
      claim_email_batch: {
        Args: {
          p_batch_size?: number
          p_lease_seconds?: number
          p_worker_id: string
        }
        Returns: {
          app_id: string | null
          attachments: Json
          attempts: number
          bcc: string[] | null
          branch_id: string | null
          category: string
          cc: string[] | null
          claimed_at: string | null
          claimed_by: string | null
          created_by_profile_id: string | null
          email_account_id: string | null
          error_message: string | null
          from_email: string | null
          from_name: string | null
          html: string | null
          id: string
          last_error_code: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          message_id: string | null
          metadata: Json
          next_attempt_at: string
          provider: string | null
          provider_message_id: string | null
          queued_at: string
          related_id: string | null
          related_type: string | null
          reply_to: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string
          subject: string
          tenant_id: string | null
          text_body: string | null
          to_email: string
          worker_lease_until: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "email_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clone_master_catalog_to_tenant: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      clone_master_rate_card_to_tenant: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      clone_tenant_catalog_to_branch: {
        Args: { p_branch_id: string }
        Returns: undefined
      }
      clone_tenant_delivery_to_branch: {
        Args: { p_branch_id: string }
        Returns: undefined
      }
      clone_tenant_pricing_to_branch: {
        Args: { p_branch_id: string }
        Returns: undefined
      }
      create_email_account_secret: {
        Args: { p_name: string; p_secret: string }
        Returns: string
      }
      create_payment_secret: {
        Args: { p_name: string; p_secret: string }
        Returns: string
      }
      create_spec_quote: {
        Args: {
          p_app_id: string
          p_branch_id: string
          p_created_via: string
          p_currency: string
          p_customer_email: string
          p_customer_name: string
          p_customer_profile_id: string
          p_notes_internal: string
          p_product_family_id: string
          p_product_name: string
          p_product_slug: string
          p_quantity: number
          p_quote_name: string
          p_spec: Json
          p_tenant_id: string
          p_total_amount: number
          p_unit_price: number
          p_validity_days: number
        }
        Returns: {
          id: string
          quote_number: string
        }[]
      }
      current_storefront_tenant_id: { Args: never; Returns: string }
      delete_email_account_secret: {
        Args: { p_secret_id: string }
        Returns: undefined
      }
      delete_payment_secret: {
        Args: { p_secret_id: string }
        Returns: undefined
      }
      enable_family_for_tenant_branches: {
        Args: {
          p_only_untouched?: boolean
          p_product_family_id: string
          p_tenant_id: string
        }
        Returns: number
      }
      ensure_branch_pricing_seeded: {
        Args: { _branch_id: string }
        Returns: boolean
      }
      expire_branch_trials: { Args: never; Returns: number }
      generate_invoice_number: {
        Args: { p_app_id: string; p_branch_id?: string; p_tenant_id: string }
        Returns: string
      }
      generate_job_number: {
        Args: { p_order_number: string; p_sequence_no: number }
        Returns: string
      }
      generate_order_number: { Args: { p_app_id: string }; Returns: string }
      generate_quote_number: { Args: { p_app_id: string }; Returns: string }
      get_branch_customers: {
        Args: { _branch_id: string }
        Returns: {
          display_name: string
          email: string
          first_name: string
          last_name: string
          last_order_at: string
          order_count: number
          phone: string
          profile_id: string
          total_spent: number
        }[]
      }
      get_tenant_customers_for_branch: {
        Args: { _branch_id: string }
        Returns: {
          display_name: string
          email: string
          first_name: string
          last_name: string
          last_order_at: string
          order_count: number
          phone: string
          profile_id: string
          total_spent: number
        }[]
      }
      get_unread_message_counts_for_customer: {
        Args: never
        Returns: {
          order_id: string
          unread_count: number
        }[]
      }
      get_unread_message_counts_for_staff: {
        Args: { p_branch_id?: string; p_tenant_id: string }
        Returns: {
          order_id: string
          unread_count: number
        }[]
      }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_demo_tenant: { Args: { p_tenant_id: string }; Returns: boolean }
      issue_invoice_number: {
        Args: { p_app_id: string; p_branch_id?: string; p_tenant_id: string }
        Returns: string
      }
      map_customer_job_status: {
        Args: { p_job_status: string; p_payment_status?: string }
        Returns: string
      }
      mark_branch_pricing_reviewed: {
        Args: { _branch_id: string }
        Returns: undefined
      }
      mark_order_messages_read_customer: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      mark_order_messages_read_staff: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      next_number: {
        Args: {
          p_app_id: string
          p_branch_id?: string
          p_sequence_type: string
          p_tenant_id?: string
        }
        Returns: number
      }
      platform_backfill_branch_seeding: {
        Args: never
        Returns: {
          err: string
          healed: boolean
          out_branch_id: string
        }[]
      }
      platform_legal_acceptance_status: {
        Args: never
        Returns: {
          accepted_at: string
          accepted_version: number
          branch_id: string
          branch_name: string
          doc_slug: string
          tenant_id: string
          tenant_name: string
        }[]
      }
      platform_list_branch_subscriptions: {
        Args: never
        Returns: {
          assigned_plan_slug: string
          billing_status: string
          branch_id: string
          branch_name: string
          branch_slug: string
          cancelled_at: string
          comp_until: string
          created_at: string
          current_period_end: string
          grace_until: string
          override_reason: string
          plan_slug: string
          status: string
          storefront_closed_at: string
          stripe_customer_id: string
          stripe_subscription_id: string
          subscription_id: string
          tenant_id: string
          tenant_name: string
          tenant_slug: string
          trial_ends_at: string
          updated_at: string
        }[]
      }
      profile_belongs_to_branch: {
        Args: { _branch_id: string; _profile_id: string }
        Returns: boolean
      }
      quote_delivery_rate: {
        Args: {
          p_billable_kg: number
          p_branch_id: string
          p_currency?: string
          p_method_id: string
          p_tenant_id: string
          p_zone_id: string
        }
        Returns: {
          currency_code: string
          max_weight_kg: number
          method_id: string
          min_weight_kg: number
          price: number
          rate_id: string
          zone_id: string
        }[]
      }
      read_email_account_secret: {
        Args: { p_secret_id: string }
        Returns: string
      }
      read_payment_secret: { Args: { p_secret_id: string }; Returns: string }
      recompute_branch_onboarding: {
        Args: { _branch_id: string }
        Returns: undefined
      }
      regenerate_pricing_rules_for_currency: {
        Args: { p_currency: string }
        Returns: number
      }
      release_stuck_claims: { Args: never; Returns: number }
      resolve_branch_entitlement: {
        Args: { _branch_id: string }
        Returns: Json
      }
      resolve_branch_setting: {
        Args: { p_branch_id: string; p_category: string; p_key: string }
        Returns: Json
      }
      resolve_catalog_unit_system: {
        Args: { p_branch_id?: string; p_tenant_id: string }
        Returns: string
      }
      resolve_delivery_zone: {
        Args: {
          p_branch_id: string
          p_city: string
          p_country?: string
          p_postal_code: string
          p_province: string
          p_tenant_id: string
        }
        Returns: string
      }
      resolve_demo_gate: { Args: { p_tenant_id: string }; Returns: Json }
      resolve_product_options: {
        Args: {
          p_branch_id?: string
          p_product_family_id: string
          p_tenant_id?: string
        }
        Returns: {
          catalog: Database["public"]["Enums"]["catalog_kind"]
          is_default: boolean
          is_enabled: boolean
          item_code: string
          label: string
          metadata: Json
          price_delta_minor: number
          price_override_minor: number
          sort_order: number
          sub_attribute: string
        }[]
      }
      resolve_tenant_setting: {
        Args: { p_category: string; p_key: string; p_tenant_id: string }
        Returns: Json
      }
      resync_branch_catalog_from_tenant: {
        Args: { p_branch_id: string }
        Returns: undefined
      }
      resync_branch_pricing_from_tenant: {
        Args: { p_branch_id: string }
        Returns: undefined
      }
      resync_tenant_catalog_from_master: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      rollup_order_status: { Args: { p_order_id: string }; Returns: undefined }
      seed_branch_capabilities: {
        Args: { p_branch_id: string }
        Returns: undefined
      }
      seed_default_price_breaks: {
        Args: {
          p_branch_id: string
          p_cost_price: number
          p_rate_card_id: string
          p_scope_type: string
          p_sell_price: number
          p_table: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      set_branch_onboarding_step: {
        Args: { _branch_id: string; _done: boolean; _step: string }
        Returns: undefined
      }
      start_branch_trial: {
        Args: { _branch_id: string }
        Returns: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_plan_slug: string | null
          billing_status: string | null
          branch_id: string
          cancelled_at: string | null
          comp_until: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          discount_type: string | null
          discount_value: number | null
          grace_until: string | null
          id: string
          metadata: Json
          override_reason: string | null
          plan_slug: string | null
          promo_code_id: string | null
          region_id: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          trial_days: number | null
          trial_ends_at: string | null
          trial_started_at: string | null
          trial_started_via: string | null
          trial_status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "branch_subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sync_master_rate_card_to_tenant: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      sync_order_amounts: { Args: { p_order_id: string }; Returns: undefined }
      user_branch_id: { Args: never; Returns: string }
      user_can_access_order_production: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      user_can_bypass_branch_gate: {
        Args: { p_branch_id: string }
        Returns: boolean
      }
      user_can_manage_branch: {
        Args: { p_branch_id: string }
        Returns: boolean
      }
      user_can_manage_branch_catalog: {
        Args: { p_branch_id: string }
        Returns: boolean
      }
      user_can_read_branch_subscription: {
        Args: { p_branch_id: string }
        Returns: boolean
      }
      user_can_read_order:
        | {
            Args: {
              p_app_id: string
              p_branch_id: string
              p_ordered_by_profile_id: string
              p_tenant_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_app_id: string
              p_ordered_by_profile_id: string
              p_tenant_id: string
            }
            Returns: boolean
          }
      user_can_see_tenant_quote: {
        Args: { p_branch_id: string; p_tenant_id: string }
        Returns: boolean
      }
      user_can_view_branch_staff_profile: {
        Args: { _profile_id: string }
        Returns: boolean
      }
      user_can_write_branch_subscription: {
        Args: { p_branch_id: string }
        Returns: boolean
      }
      user_has_membership: {
        Args: { p_app_id: string; p_tenant_id: string }
        Returns: boolean
      }
      user_is_branch_manager: {
        Args: { p_app_id: string; p_branch_id: string; p_tenant_id: string }
        Returns: boolean
      }
      user_is_member_admin: {
        Args: { p_app_id: string; p_tenant_id: string }
        Returns: boolean
      }
      user_is_staff_for: {
        Args: { p_app_id: string; p_tenant_id: string }
        Returns: boolean
      }
      user_is_staff_for_branch: {
        Args: { p_app_id: string; p_branch_id: string; p_tenant_id: string }
        Returns: boolean
      }
      user_is_staff_for_tenant: {
        Args: { p_app_id: string; p_tenant_id: string }
        Returns: boolean
      }
      user_is_tenant_admin: { Args: { p_tenant_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "platform_admin"
        | "head_office_admin"
        | "branch_manager"
        | "store_operator"
        | "customer"
      build_status: "draft" | "building" | "ready" | "quoted" | "ordered"
      catalog_kind: "size" | "print_attr" | "paper" | "finishing"
      catalog_scope: "master" | "tenant" | "branch"
      click_colour: "mono" | "colour"
      click_sides: "simplex" | "duplex"
      click_size: "A4" | "A3"
      delivery_location_match: "city" | "postcode_prefix" | "province"
      delivery_scope: "platform" | "tenant" | "branch"
      document_status:
        | "pending"
        | "uploading"
        | "processing"
        | "analyzed"
        | "ready"
        | "error"
      finishing_basis:
        | "per_unit"
        | "per_sheet"
        | "per_set"
        | "per_cut"
        | "per_document"
        | "per_page"
      fulfillment_type: "collection" | "delivery" | "courier"
      node_type: "branch" | "hub" | "partner"
      order_status:
        | "cart"
        | "draft"
        | "quoted"
        | "confirmed"
        | "in_production"
        | "quality_check"
        | "ready_for_collection"
        | "dispatched"
        | "delivered"
        | "cancelled"
      quote_status:
        | "active"
        | "expired"
        | "approved"
        | "declined"
        | "converted"
        | "void"
      rate_card_scope: "master" | "tenant" | "branch"
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
      catalog_kind: ["size", "print_attr", "paper", "finishing"],
      catalog_scope: ["master", "tenant", "branch"],
      click_colour: ["mono", "colour"],
      click_sides: ["simplex", "duplex"],
      click_size: ["A4", "A3"],
      delivery_location_match: ["city", "postcode_prefix", "province"],
      delivery_scope: ["platform", "tenant", "branch"],
      document_status: [
        "pending",
        "uploading",
        "processing",
        "analyzed",
        "ready",
        "error",
      ],
      finishing_basis: [
        "per_unit",
        "per_sheet",
        "per_set",
        "per_cut",
        "per_document",
        "per_page",
      ],
      fulfillment_type: ["collection", "delivery", "courier"],
      node_type: ["branch", "hub", "partner"],
      order_status: [
        "cart",
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
      quote_status: [
        "active",
        "expired",
        "approved",
        "declined",
        "converted",
        "void",
      ],
      rate_card_scope: ["master", "tenant", "branch"],
      section_type: ["body", "front_cover", "back_cover", "insert", "tab"],
    },
  },
} as const
