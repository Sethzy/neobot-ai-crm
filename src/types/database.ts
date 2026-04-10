export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type JsonObject = { [key: string]: Json | undefined }

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_todo: {
        Row: {
          client_id: string
          created_at: string
          id: string
          payload: Json
          thread_id: string
          title: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          payload?: Json
          thread_id: string
          title: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          payload?: Json
          thread_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_todo_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "agent_todo_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      agent_triggers: {
        Row: {
          client_id: string
          created_at: string
          cron_expression: string | null
          current_run_id: string | null
          enabled: boolean
          id: string
          instruction_path: string
          invocation_message: string | null
          last_fired_at: string | null
          last_status: string | null
          name: string
          next_fire_at: string | null
          payload: Json
          retry_count: number
          thread_id: string
          trigger_type: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          cron_expression?: string | null
          current_run_id?: string | null
          enabled?: boolean
          id?: string
          instruction_path: string
          invocation_message?: string | null
          last_fired_at?: string | null
          last_status?: string | null
          name: string
          next_fire_at?: string | null
          payload?: Json
          retry_count?: number
          thread_id: string
          trigger_type?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          cron_expression?: string | null
          current_run_id?: string | null
          enabled?: boolean
          id?: string
          instruction_path?: string
          invocation_message?: string | null
          last_fired_at?: string | null
          last_status?: string | null
          name?: string
          next_fire_at?: string | null
          payload?: Json
          retry_count?: number
          thread_id?: string
          trigger_type?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_triggers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "agent_triggers_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      approval_events: {
        Row: {
          approval_id: string
          client_id: string
          created_at: string
          id: string
          resolved_at: string | null
          run_id: string | null
          session_id: string | null
          status: string
          thread_id: string
          tool_input: Json
          tool_name: string
          tool_use_id: string | null
        }
        Insert: {
          approval_id: string
          client_id: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          run_id?: string | null
          session_id?: string | null
          status?: string
          thread_id: string
          tool_input?: Json
          tool_name: string
          tool_use_id?: string | null
        }
        Update: {
          approval_id?: string
          client_id?: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          run_id?: string | null
          session_id?: string | null
          status?: string
          thread_id?: string
          tool_input?: Json
          tool_name?: string
          tool_use_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "approval_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "approval_events_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      autopilot_config: {
        Row: {
          client_id: string
          config_id: string
          created_at: string
          enabled: boolean
          pulse_interval: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          config_id?: string
          created_at?: string
          enabled?: boolean
          pulse_interval?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          config_id?: string
          created_at?: string
          enabled?: boolean
          pulse_interval?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      browser_profiles: {
        Row: {
          browser_use_profile_id: string
          client_id: string
          created_at: string
          id: string
          label: string | null
          platform: string
          updated_at: string
        }
        Insert: {
          browser_use_profile_id: string
          client_id: string
          created_at?: string
          id?: string
          label?: string | null
          platform: string
          updated_at?: string
        }
        Update: {
          browser_use_profile_id?: string
          client_id?: string
          created_at?: string
          id?: string
          label?: string | null
          platform?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "browser_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      cases: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      client_message_usage_monthly: {
        Row: {
          client_id: string
          created_at: string
          messages_used: number
          period_start: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          messages_used?: number
          period_start: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          messages_used?: number
          period_start?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_message_usage_monthly_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      clients: {
        Row: {
          client_id: string
          client_profile: string | null
          created_at: string
          display_name: string | null
          is_bootstrapped: boolean
          plan_name: string | null
          quota_exempt: boolean
          stripe_customer_id: string | null
          stripe_product_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          user_id: string
          user_preferences: string | null
        }
        Insert: {
          client_id?: string
          client_profile?: string | null
          created_at?: string
          display_name?: string | null
          is_bootstrapped?: boolean
          plan_name?: string | null
          quota_exempt?: boolean
          stripe_customer_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          user_id: string
          user_preferences?: string | null
        }
        Update: {
          client_id?: string
          client_profile?: string | null
          created_at?: string
          display_name?: string | null
          is_bootstrapped?: boolean
          plan_name?: string | null
          quota_exempt?: boolean
          stripe_customer_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          user_id?: string
          user_preferences?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          client_id: string
          company_id: string
          created_at: string
          custom_fields: Json
          email: string | null
          industry: string | null
          linkedin: string | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          client_id: string
          company_id?: string
          created_at?: string
          custom_fields?: Json
          email?: string | null
          industry?: string | null
          linkedin?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          client_id?: string
          company_id?: string
          created_at?: string
          custom_fields?: Json
          email?: string | null
          industry?: string | null
          linkedin?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      connections: {
        Row: {
          account_identifier: string | null
          activated_tools: string[]
          client_id: string
          composio_connected_account_id: string
          created_at: string
          display_name: string | null
          id: string
          status: string
          tool_count: number
          toolkit_slug: string
          updated_at: string
        }
        Insert: {
          account_identifier?: string | null
          activated_tools?: string[]
          client_id: string
          composio_connected_account_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          status?: string
          tool_count?: number
          toolkit_slug: string
          updated_at?: string
        }
        Update: {
          account_identifier?: string | null
          activated_tools?: string[]
          client_id?: string
          composio_connected_account_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          status?: string
          tool_count?: number
          toolkit_slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      contacts: {
        Row: {
          city: string | null
          client_id: string
          company_id: string | null
          contact_id: string
          created_at: string
          created_by: string | null
          custom_fields: Json
          email: string | null
          first_name: string
          job_title: string | null
          last_name: string
          linkedin: string | null
          notes: string | null
          phone: string | null
          type: string
          updated_at: string
          x_link: string | null
        }
        Insert: {
          city?: string | null
          client_id: string
          company_id?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          email?: string | null
          first_name: string
          job_title?: string | null
          last_name: string
          linkedin?: string | null
          notes?: string | null
          phone?: string | null
          type: string
          updated_at?: string
          x_link?: string | null
        }
        Update: {
          city?: string | null
          client_id?: string
          company_id?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          email?: string | null
          first_name?: string
          job_title?: string | null
          last_name?: string
          linkedin?: string | null
          notes?: string | null
          phone?: string | null
          type?: string
          updated_at?: string
          x_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["company_id"]
          },
        ]
      }
      conversation_channel_delivery_receipts: {
        Row: {
          channel: string
          client_id: string
          created_at: string
          delivery_id: string
          receipt_id: string
          thread_id: string
        }
        Insert: {
          channel: string
          client_id: string
          created_at?: string
          delivery_id: string
          receipt_id?: string
          thread_id: string
        }
        Update: {
          channel?: string
          client_id?: string
          created_at?: string
          delivery_id?: string
          receipt_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_channel_delivery_receipts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "conversation_channel_delivery_receipts_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      conversation_channel_mappings: {
        Row: {
          channel: string
          client_id: string
          created_at: string
          external_conversation_id: string
          mapping_id: string
          thread_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          client_id: string
          created_at?: string
          external_conversation_id: string
          mapping_id?: string
          thread_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          client_id?: string
          created_at?: string
          external_conversation_id?: string
          mapping_id?: string
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_channel_mappings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "conversation_channel_mappings_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          content: string | null
          created_at: string
          message_id: string
          parts: Json | null
          role: string
          source_event_id: string | null
          thread_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          message_id?: string
          parts?: Json | null
          role: string
          source_event_id?: string | null
          thread_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          message_id?: string
          parts?: Json | null
          role?: string
          source_event_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      conversation_threads: {
        Row: {
          client_id: string
          compaction_compacted_through_at: string | null
          compaction_compacted_through_message_id: string | null
          compaction_summary: string | null
          compaction_summary_model: string | null
          compaction_summary_tokens_used: number
          context_reset_at: string | null
          created_at: string
          is_archived: boolean
          is_pinned: boolean
          is_primary: boolean
          session_id: string | null
          thread_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          compaction_compacted_through_at?: string | null
          compaction_compacted_through_message_id?: string | null
          compaction_summary?: string | null
          compaction_summary_model?: string | null
          compaction_summary_tokens_used?: number
          context_reset_at?: string | null
          created_at?: string
          is_archived?: boolean
          is_pinned?: boolean
          is_primary?: boolean
          session_id?: string | null
          thread_id?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          compaction_compacted_through_at?: string | null
          compaction_compacted_through_message_id?: string | null
          compaction_summary?: string | null
          compaction_summary_model?: string | null
          compaction_summary_tokens_used?: number
          context_reset_at?: string | null
          created_at?: string
          is_archived?: boolean
          is_pinned?: boolean
          is_primary?: boolean
          session_id?: string | null
          thread_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      crm_config: {
        Row: {
          client_id: string
          company_custom_fields: Json
          company_fields: Json | null
          company_industries: Json | null
          company_label: string
          config_id: string
          contact_custom_fields: Json
          contact_fields: Json | null
          contact_types: Json | null
          created_at: string
          deal_contact_roles: Json | null
          deal_custom_fields: Json
          deal_fields: Json | null
          deal_label: string
          deal_stages: Json | null
          interaction_types: Json | null
          task_custom_fields: Json
          task_types: Json | null
          updated_at: string
        }
        Insert: {
          client_id: string
          company_custom_fields?: Json
          company_fields?: Json | null
          company_industries?: Json | null
          company_label?: string
          config_id?: string
          contact_custom_fields?: Json
          contact_fields?: Json | null
          contact_types?: Json | null
          created_at?: string
          deal_contact_roles?: Json | null
          deal_custom_fields?: Json
          deal_fields?: Json | null
          deal_label?: string
          deal_stages?: Json | null
          interaction_types?: Json | null
          task_custom_fields?: Json
          task_types?: Json | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          company_custom_fields?: Json
          company_fields?: Json | null
          company_industries?: Json | null
          company_label?: string
          config_id?: string
          contact_custom_fields?: Json
          contact_fields?: Json | null
          contact_types?: Json | null
          created_at?: string
          deal_contact_roles?: Json | null
          deal_custom_fields?: Json
          deal_fields?: Json | null
          deal_label?: string
          deal_stages?: Json | null
          interaction_types?: Json | null
          task_custom_fields?: Json
          task_types?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      crm_config_history: {
        Row: {
          client_id: string
          config_snapshot: Json
          created_at: string
          id: string
        }
        Insert: {
          client_id: string
          config_snapshot: Json
          created_at?: string
          id?: string
        }
        Update: {
          client_id?: string
          config_snapshot?: Json
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_config_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          client_id: string
          contact_id: string | null
          created_at: string
          custom_fields: Json
          deal_id: string | null
          description: string | null
          due_date: string | null
          status: string
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          contact_id?: string | null
          created_at?: string
          custom_fields?: Json
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          status?: string
          task_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          contact_id?: string | null
          created_at?: string
          custom_fields?: Json
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          status?: string
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_client_contact_tenant_fkey"
            columns: ["client_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["client_id", "contact_id"]
          },
          {
            foreignKeyName: "crm_tasks_client_deal_tenant_fkey"
            columns: ["client_id", "deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["client_id", "deal_id"]
          },
          {
            foreignKeyName: "crm_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "crm_tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "crm_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      crm_views: {
        Row: {
          client_id: string
          created_at: string
          entity_type: string
          filters: Json
          is_default: boolean
          is_seeded: boolean
          name: string
          sort: Json | null
          updated_at: string
          view_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          entity_type: string
          filters?: Json
          is_default?: boolean
          is_seeded?: boolean
          name: string
          sort?: Json | null
          updated_at?: string
          view_id?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          entity_type?: string
          filters?: Json
          is_default?: boolean
          is_seeded?: boolean
          name?: string
          sort?: Json | null
          updated_at?: string
          view_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_views_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      deal_contacts: {
        Row: {
          client_id: string
          contact_id: string
          created_at: string
          deal_contact_id: string
          deal_id: string
          is_primary: boolean
          role: string
        }
        Insert: {
          client_id: string
          contact_id: string
          created_at?: string
          deal_contact_id?: string
          deal_id: string
          is_primary?: boolean
          role?: string
        }
        Update: {
          client_id?: string
          contact_id?: string
          created_at?: string
          deal_contact_id?: string
          deal_id?: string
          is_primary?: boolean
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_contacts_client_contact_tenant_fkey"
            columns: ["client_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["client_id", "contact_id"]
          },
          {
            foreignKeyName: "deal_contacts_client_deal_tenant_fkey"
            columns: ["client_id", "deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["client_id", "deal_id"]
          },
          {
            foreignKeyName: "deal_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "deal_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "deal_contacts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deals: {
        Row: {
          address: string
          amount: number | null
          client_id: string
          close_date: string | null
          company_id: string | null
          created_at: string
          custom_fields: Json
          deal_id: string
          name: string | null
          notes: string | null
          point_of_contact_id: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          address: string
          amount?: number | null
          client_id: string
          close_date?: string | null
          company_id?: string | null
          created_at?: string
          custom_fields?: Json
          deal_id?: string
          name?: string | null
          notes?: string | null
          point_of_contact_id?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          address?: string
          amount?: number | null
          client_id?: string
          close_date?: string | null
          company_id?: string | null
          created_at?: string
          custom_fields?: Json
          deal_id?: string
          name?: string | null
          notes?: string | null
          point_of_contact_id?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "deals_point_of_contact_id_fkey"
            columns: ["point_of_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      documents: {
        Row: {
          case_id: string | null
          created_at: string | null
          filename: string | null
          id: string
          status: string | null
          storage_path: string | null
          updated_at: string | null
        }
        Insert: {
          case_id?: string | null
          created_at?: string | null
          filename?: string | null
          id?: string
          status?: string | null
          storage_path?: string | null
          updated_at?: string | null
        }
        Update: {
          case_id?: string | null
          created_at?: string | null
          filename?: string | null
          id?: string
          status?: string | null
          storage_path?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          client_id: string
          contact_id: string
          created_at: string
          deal_id: string | null
          interaction_id: string
          occurred_at: string
          summary: string | null
          type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          contact_id: string
          created_at?: string
          deal_id?: string | null
          interaction_id?: string
          occurred_at: string
          summary?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          contact_id?: string
          created_at?: string
          deal_id?: string | null
          interaction_id?: string
          occurred_at?: string
          summary?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_client_contact_tenant_fkey"
            columns: ["client_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["client_id", "contact_id"]
          },
          {
            foreignKeyName: "interactions_client_deal_tenant_fkey"
            columns: ["client_id", "deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["client_id", "deal_id"]
          },
          {
            foreignKeyName: "interactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "interactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "interactions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      meeting_records: {
        Row: {
          audio_path: string
          client_id: string
          created_at: string
          duration_seconds: number | null
          idempotency_key: string
          linked_company_id: string | null
          linked_contact_id: string | null
          linked_deal_id: string | null
          meeting_record_id: string
          notes: string | null
          status: string
          summary: string | null
          thread_id: string | null
          title: string | null
          transcript_path: string | null
          updated_at: string
        }
        Insert: {
          audio_path: string
          client_id: string
          created_at?: string
          duration_seconds?: number | null
          idempotency_key: string
          linked_company_id?: string | null
          linked_contact_id?: string | null
          linked_deal_id?: string | null
          meeting_record_id?: string
          notes?: string | null
          status?: string
          summary?: string | null
          thread_id?: string | null
          title?: string | null
          transcript_path?: string | null
          updated_at?: string
        }
        Update: {
          audio_path?: string
          client_id?: string
          created_at?: string
          duration_seconds?: number | null
          idempotency_key?: string
          linked_company_id?: string | null
          linked_contact_id?: string | null
          linked_deal_id?: string | null
          meeting_record_id?: string
          notes?: string | null
          status?: string
          summary?: string | null
          thread_id?: string | null
          title?: string | null
          transcript_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "meeting_records_linked_company_id_fkey"
            columns: ["linked_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "meeting_records_linked_contact_id_fkey"
            columns: ["linked_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "meeting_records_linked_deal_id_fkey"
            columns: ["linked_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "meeting_records_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      record_attachments: {
        Row: {
          attachment_id: string
          client_id: string
          content_type: string
          created_at: string
          file_category: string
          file_size: number
          filename: string
          record_id: string
          record_type: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          attachment_id?: string
          client_id: string
          content_type: string
          created_at?: string
          file_category: string
          file_size: number
          filename: string
          record_id: string
          record_type: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          attachment_id?: string
          client_id?: string
          content_type?: string
          created_at?: string
          file_category?: string
          file_size?: number
          filename?: string
          record_id?: string
          record_type?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_attachments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      record_notes: {
        Row: {
          body: string
          client_id: string
          created_at: string
          note_id: string
          record_id: string
          record_type: string
          updated_at: string
        }
        Insert: {
          body?: string
          client_id: string
          created_at?: string
          note_id?: string
          record_id: string
          record_type: string
          updated_at?: string
        }
        Update: {
          body?: string
          client_id?: string
          created_at?: string
          note_id?: string
          record_id?: string
          record_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      run_scores: {
        Row: {
          comment: string | null
          created_at: string
          evaluator_name: string
          run_id: string
          score_id: string
          score_type: string
          score_value: number | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          evaluator_name: string
          run_id: string
          score_id?: string
          score_type: string
          score_value?: number | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          evaluator_name?: string
          run_id?: string
          score_id?: string
          score_type?: string
          score_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "run_scores_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      runs: {
        Row: {
          cache_read_tokens: number | null
          client_id: string
          completed_at: string | null
          cost_usd: number | null
          created_at: string
          events_cursor: string | null
          model: string | null
          parent_run_id: string | null
          prompt_tokens: number | null
          run_id: string
          run_type: string
          session_id: string | null
          status: Database["public"]["Enums"]["run_status"]
          step_count: number | null
          thread_id: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          cache_read_tokens?: number | null
          client_id: string
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string
          events_cursor?: string | null
          model?: string | null
          parent_run_id?: string | null
          prompt_tokens?: number | null
          run_id?: string
          run_type?: string
          session_id?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          step_count?: number | null
          thread_id: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          cache_read_tokens?: number | null
          client_id?: string
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string
          events_cursor?: string | null
          model?: string | null
          parent_run_id?: string | null
          prompt_tokens?: number | null
          run_id?: string
          run_type?: string
          session_id?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          step_count?: number | null
          thread_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "runs_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      telegram_pairing_tokens: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string
          token: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at: string
          token: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_pairing_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      telegram_pending_questions: {
        Row: {
          answers: Json
          awaiting_text_reply: boolean
          chat_id: string
          client_id: string
          created_at: string
          current_index: number
          questions: Json
          thread_id: string
          token: string
        }
        Insert: {
          answers?: Json
          awaiting_text_reply?: boolean
          chat_id: string
          client_id: string
          created_at?: string
          current_index?: number
          questions?: Json
          thread_id: string
          token: string
        }
        Update: {
          answers?: Json
          awaiting_text_reply?: boolean
          chat_id?: string
          client_id?: string
          created_at?: string
          current_index?: number
          questions?: Json
          thread_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_pending_questions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "telegram_pending_questions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      thread_queue_records: {
        Row: {
          channel: string
          client_id: string
          content: Json
          created_at: string
          queue_id: string
          thread_id: string
        }
        Insert: {
          channel?: string
          client_id: string
          content: Json
          created_at?: string
          queue_id?: string
          thread_id: string
        }
        Update: {
          channel?: string
          client_id?: string
          content?: Json
          created_at?: string
          queue_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_queue_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "thread_queue_records_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      timeline_activities: {
        Row: {
          actor_label: string | null
          actor_type: string
          client_id: string
          created_at: string
          happened_at: string
          id: string
          name: string
          properties: Json | null
          record_id: string
          record_type: string
          updated_at: string
        }
        Insert: {
          actor_label?: string | null
          actor_type?: string
          client_id: string
          created_at?: string
          happened_at?: string
          id?: string
          name: string
          properties?: Json | null
          record_id: string
          record_type: string
          updated_at?: string
        }
        Update: {
          actor_label?: string | null
          actor_type?: string
          client_id?: string
          created_at?: string
          happened_at?: string
          id?: string
          name?: string
          properties?: Json | null
          record_id?: string
          record_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      user_instructions: {
        Row: {
          created_at: string
          description: string
          id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          client_config_id: string | null
          created_at: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          client_config_id?: string | null
          created_at?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          client_config_id?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      autopilot_interval_to_cron: {
        Args: { p_pulse_interval: string }
        Returns: string
      }
      autopilot_next_fire_at: {
        Args: { p_pulse_interval: string; p_reference: string }
        Returns: string
      }
      claim_due_triggers: {
        Args: never
        Returns: {
          client_id: string
          created_at: string
          cron_expression: string | null
          current_run_id: string | null
          enabled: boolean
          id: string
          instruction_path: string
          invocation_message: string | null
          last_fired_at: string | null
          last_status: string | null
          name: string
          next_fire_at: string | null
          payload: Json
          retry_count: number
          thread_id: string
          trigger_type: string
          updated_at: string
          webhook_secret: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_triggers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      consume_message_quota: {
        Args: { p_client_id: string }
        Returns: {
          allowed: boolean
          client_id: string
          messages_remaining: number
          messages_used: number
          monthly_message_limit: number
          next_reset_date: string
          period_start: string
          plan_name: string
        }[]
      }
      create_run_if_idle: {
        Args: { p_client_id: string; p_run_type?: string; p_thread_id: string }
        Returns: string
      }
      crm_default_deal_stages: { Args: never; Returns: Json }
      drain_thread_queue: {
        Args: { p_client_id: string; p_thread_id: string }
        Returns: {
          content: Json
          created_at: string
          queue_id: string
        }[]
      }
      ensure_autopilot_for_client: {
        Args: { p_client_id: string }
        Returns: undefined
      }
      ensure_crm_views_for_client: {
        Args: { p_client_id: string }
        Returns: undefined
      }
      get_client_accessible_schema: { Args: never; Returns: Json }
      get_message_quota_status: {
        Args: { p_client_id: string }
        Returns: {
          client_id: string
          messages_remaining: number
          messages_used: number
          monthly_message_limit: number
          next_reset_date: string
          period_start: string
          plan_name: string
        }[]
      }
      get_my_client_config: { Args: never; Returns: string }
      get_my_client_id: { Args: never; Returns: string }
      get_system_reminder_context: {
        Args: { p_client_id: string; p_thread_id: string }
        Returns: Json
      }
      mark_stale_runs_failed: {
        Args: { p_stale_minutes?: number; p_thread_id?: string }
        Returns: number
      }
      patch_approval_part_state: {
        Args: {
          p_approval_id: string
          p_approved: boolean
          p_client_id: string
          p_thread_id: string
        }
        Returns: Json
      }
      release_message_quota: {
        Args: { p_client_id: string; p_period_start: string }
        Returns: {
          released: boolean
        }[]
      }
      release_stale_trigger_claims: {
        Args: { p_stale_minutes?: number }
        Returns: number
      }
      release_trigger_claim: {
        Args: {
          p_advance_next_fire_at?: boolean
          p_next_fire_at?: string
          p_run_id: string
          p_status?: string
          p_trigger_id: string
        }
        Returns: boolean
      }
      run_readonly_sql: { Args: { query_text: string }; Returns: Json }
      search_records: {
        Args: { query: string }
        Returns: {
          id: string
          subtitle: string
          title: string
          type: string
        }[]
      }
      upsert_timeline_activity: {
        Args: {
          p_actor_label: string
          p_actor_type: string
          p_client_id: string
          p_happened_at?: string
          p_name: string
          p_properties: Json
          p_record_id: string
          p_record_type: string
        }
        Returns: string
      }
    }
    Enums: {
      run_status:
        | "queued"
        | "running"
        | "completed"
        | "partial"
        | "failed"
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
      run_status: [
        "queued",
        "running",
        "completed",
        "partial",
        "failed",
        "cancelled",
      ],
    },
  },
} as const
