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
          code: string | null
          country: string
          created_at: string
          email: string | null
          external_ref: string | null
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
          code?: string | null
          country?: string
          created_at?: string
          email?: string | null
          external_ref?: string | null
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
          code?: string | null
          country?: string
          created_at?: string
          email?: string | null
          external_ref?: string | null
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
      email_log: {
        Row: {
          app_id: string | null
          error_message: string | null
          event_key: string
          id: string
          metadata: Json
          order_id: string | null
          recipient_email: string
          sent_at: string
          status: string
          subject: string
          tenant_id: string | null
        }
        Insert: {
          app_id?: string | null
          error_message?: string | null
          event_key: string
          id?: string
          metadata?: Json
          order_id?: string | null
          recipient_email: string
          sent_at?: string
          status?: string
          subject: string
          tenant_id?: string | null
        }
        Update: {
          app_id?: string | null
          error_message?: string | null
          event_key?: string
          id?: string
          metadata?: Json
          order_id?: string | null
          recipient_email?: string
          sent_at?: string
          status?: string
          subject?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_log_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          is_internal: boolean
          job_id: string | null
          message_body: string
          order_id: string | null
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
          is_internal?: boolean
          job_id?: string | null
          message_body: string
          order_id?: string | null
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
          is_internal?: boolean
          job_id?: string | null
          message_body?: string
          order_id?: string | null
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
      number_sequences: {
        Row: {
          app_id: string
          id: string
          last_value: number
          prefix: string
          sequence_type: string
        }
        Insert: {
          app_id: string
          id?: string
          last_value?: number
          prefix: string
          sequence_type: string
        }
        Update: {
          app_id?: string
          id?: string
          last_value?: number
          prefix?: string
          sequence_type?: string
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
      order_jobs: {
        Row: {
          app_id: string
          assigned_supplier_id: string | null
          assigned_to_profile_id: string | null
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
          integration_payload: Json
          job_name: string | null
          job_number: string
          job_status: string
          net_price: number
          order_id: string
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
          weight_kg: number | null
        }
        Insert: {
          app_id: string
          assigned_supplier_id?: string | null
          assigned_to_profile_id?: string | null
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
          integration_payload?: Json
          job_name?: string | null
          job_number: string
          job_status?: string
          net_price?: number
          order_id: string
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
          weight_kg?: number | null
        }
        Update: {
          app_id?: string
          assigned_supplier_id?: string | null
          assigned_to_profile_id?: string | null
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
          integration_payload?: Json
          job_name?: string | null
          job_number?: string
          job_status?: string
          net_price?: number
          order_id?: string
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
          weight_kg?: number | null
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
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string | null
          customer_status: string
          date_required: string | null
          delivery_amount: number
          discount_amount: number
          external_code: string | null
          external_order_ref: string | null
          fulfillment_type:
            | Database["public"]["Enums"]["fulfillment_type"]
            | null
          fulfilment_status: string
          id: string
          metadata: Json
          notes: string | null
          notes_customer: string | null
          notes_internal: string | null
          order_number: string | null
          order_status: Database["public"]["Enums"]["order_status"]
          ordered_by_profile_id: string | null
          payment_status: string
          source_channel: string | null
          storefront_name: string | null
          submitted_at: string | null
          subtotal: number
          tenant_id: string | null
          total_amount: number
          total_price: number
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
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_status?: string
          date_required?: string | null
          delivery_amount?: number
          discount_amount?: number
          external_code?: string | null
          external_order_ref?: string | null
          fulfillment_type?:
            | Database["public"]["Enums"]["fulfillment_type"]
            | null
          fulfilment_status?: string
          id?: string
          metadata?: Json
          notes?: string | null
          notes_customer?: string | null
          notes_internal?: string | null
          order_number?: string | null
          order_status?: Database["public"]["Enums"]["order_status"]
          ordered_by_profile_id?: string | null
          payment_status?: string
          source_channel?: string | null
          storefront_name?: string | null
          submitted_at?: string | null
          subtotal?: number
          tenant_id?: string | null
          total_amount?: number
          total_price?: number
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
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_status?: string
          date_required?: string | null
          delivery_amount?: number
          discount_amount?: number
          external_code?: string | null
          external_order_ref?: string | null
          fulfillment_type?:
            | Database["public"]["Enums"]["fulfillment_type"]
            | null
          fulfilment_status?: string
          id?: string
          metadata?: Json
          notes?: string | null
          notes_customer?: string | null
          notes_internal?: string | null
          order_number?: string | null
          order_status?: Database["public"]["Enums"]["order_status"]
          ordered_by_profile_id?: string | null
          payment_status?: string
          source_channel?: string | null
          storefront_name?: string | null
          submitted_at?: string | null
          subtotal?: number
          tenant_id?: string | null
          total_amount?: number
          total_price?: number
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
          image_url: string | null
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
          image_url?: string | null
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
          image_url?: string | null
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
          email: string | null
          first_name: string | null
          global_role: string
          id: string
          is_active: boolean
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
          first_name?: string | null
          global_role?: string
          id: string
          is_active?: boolean
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
          first_name?: string | null
          global_role?: string
          id?: string
          is_active?: boolean
          last_name?: string | null
          phone?: string | null
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
      tenant_memberships: {
        Row: {
          app_id: string
          branch_id: string | null
          can_view_all_orders: boolean
          created_at: string
          id: string
          is_active: boolean
          profile_id: string
          role: string
          tenant_id: string
        }
        Insert: {
          app_id: string
          branch_id?: string | null
          can_view_all_orders?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          profile_id: string
          role: string
          tenant_id: string
        }
        Update: {
          app_id?: string
          branch_id?: string | null
          can_view_all_orders?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
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
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      tenants: {
        Row: {
          app_id: string | null
          billing_email: string | null
          country: string
          created_at: string
          custom_domain: string | null
          default_currency: string
          external_ref: string | null
          id: string
          is_active: boolean
          legal_name: string | null
          locale: string
          logo_url: string | null
          name: string
          onboarding_status: string
          payment_mode: string
          proof_mode: string
          registration_number: string | null
          settings: Json
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
          billing_email?: string | null
          country?: string
          created_at?: string
          custom_domain?: string | null
          default_currency?: string
          external_ref?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          locale?: string
          logo_url?: string | null
          name: string
          onboarding_status?: string
          payment_mode?: string
          proof_mode?: string
          registration_number?: string | null
          settings?: Json
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
          billing_email?: string | null
          country?: string
          created_at?: string
          custom_domain?: string | null
          default_currency?: string
          external_ref?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          locale?: string
          logo_url?: string | null
          name?: string
          onboarding_status?: string
          payment_mode?: string
          proof_mode?: string
          registration_number?: string | null
          settings?: Json
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
      generate_invoice_number: {
        Args: { p_app_id: string; p_tenant_id: string }
        Returns: string
      }
      generate_job_number: {
        Args: { p_order_number: string; p_sequence_no: number }
        Returns: string
      }
      generate_order_number: { Args: { p_app_id: string }; Returns: string }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      issue_invoice_number: {
        Args: { p_app_id: string; p_tenant_id: string }
        Returns: string
      }
      map_customer_job_status: {
        Args: { p_job_status: string; p_payment_status?: string }
        Returns: string
      }
      next_number: {
        Args: { p_app_id: string; p_sequence_type: string }
        Returns: number
      }
      resolve_tenant_setting: {
        Args: { p_category: string; p_key: string; p_tenant_id: string }
        Returns: Json
      }
      rollup_order_status: { Args: { p_order_id: string }; Returns: undefined }
      seed_branch_capabilities: {
        Args: { p_branch_id: string }
        Returns: undefined
      }
      sync_order_amounts: { Args: { p_order_id: string }; Returns: undefined }
      user_branch_id: { Args: never; Returns: string }
      user_can_read_order: {
        Args: {
          p_app_id: string
          p_ordered_by_profile_id: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      user_has_membership: {
        Args: { p_app_id: string; p_tenant_id: string }
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
      section_type: ["body", "front_cover", "back_cover", "insert", "tab"],
    },
  },
} as const
