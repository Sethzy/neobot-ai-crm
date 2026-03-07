export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/** A JSON object (non-array, non-primitive). */
export type JsonObject = { [key: string]: Json | undefined };

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      cases: {
        Row: {
          case_name: string
          case_opened_at: string
          case_ref: string
          created_at: string
          created_by: string
          description: string | null
          event_date: string | null
          id: string
          updated_at: string
        }
        Insert: {
          case_name: string
          case_opened_at?: string
          case_ref: string
          created_at?: string
          created_by: string
          description?: string | null
          event_date?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          case_name?: string
          case_opened_at?: string
          case_ref?: string
          created_at?: string
          created_by?: string
          description?: string | null
          event_date?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          case_id: string
          created_at: string
          created_by: string
          description: string | null
          document_date: string | null
          duplicate_status: string | null
          file_hash: string
          file_size: number
          file_type: string
          filename: string
          gemini_response: Json | null
          id: string
          is_heterogeneous: boolean | null
          is_reviewed: boolean | null
          original_filename: string
          page_ranges: Json | null
          primary_tag: string | null
          processed_at: string | null
          processing_error: string | null
          renamed_filename: string | null
          reviewed_at: string | null
          status: string
          storage_path: string
          tags: Json | null
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by: string
          description?: string | null
          document_date?: string | null
          duplicate_status?: string | null
          file_hash: string
          file_size: number
          file_type: string
          filename: string
          gemini_response?: Json | null
          id?: string
          is_heterogeneous?: boolean | null
          is_reviewed?: boolean | null
          original_filename: string
          page_ranges?: Json | null
          primary_tag?: string | null
          processed_at?: string | null
          processing_error?: string | null
          renamed_filename?: string | null
          reviewed_at?: string | null
          status?: string
          storage_path: string
          tags?: Json | null
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          document_date?: string | null
          duplicate_status?: string | null
          file_hash?: string
          file_size?: number
          file_type?: string
          filename?: string
          gemini_response?: Json | null
          id?: string
          is_heterogeneous?: boolean | null
          is_reviewed?: boolean | null
          original_filename?: string
          page_ranges?: Json | null
          primary_tag?: string | null
          processed_at?: string | null
          processing_error?: string | null
          renamed_filename?: string | null
          reviewed_at?: string | null
          status?: string
          storage_path?: string
          tags?: Json | null
          updated_at?: string
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
      report_history: {
        Row: {
          ai_summary: string | null
          case_id: string
          created_at: string
          file_path: string
          file_size_bytes: number | null
          generated_at: string
          generated_by: string
          id: string
          name: string
          prompt: string | null
          report_type: string
          splits_count: number
          tags_included: string[]
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          case_id: string
          created_at?: string
          file_path: string
          file_size_bytes?: number | null
          generated_at?: string
          generated_by: string
          id?: string
          name: string
          prompt?: string | null
          report_type: string
          splits_count: number
          tags_included: string[]
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          case_id?: string
          created_at?: string
          file_path?: string
          file_size_bytes?: number | null
          generated_at?: string
          generated_by?: string
          id?: string
          name?: string
          prompt?: string | null
          report_type?: string
          splits_count?: number
          tags_included?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_history_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      splits: {
        Row: {
          created_at: string | null
          dismissed_rule_ids: string[] | null
          document_date: string | null
          document_id: string
          end_page: number
          extend_dashboard_url: string | null
          extend_processor_id: string | null
          extracted_data: Json | null
          extraction_error: string | null
          extraction_metadata: Json | null
          extraction_status: string | null
          id: string
          identifier: string | null
          low_confidence_fields: Json | null
          observation: string | null
          original_extracted_data: Json | null
          page_height: number | null
          page_width: number | null
          potential_duplicate: string | null
          schema_version: string | null
          split_index: number
          start_page: number
          tag_id: string
          updated_at: string | null
          validation_failures: Json | null
        }
        Insert: {
          created_at?: string | null
          dismissed_rule_ids?: string[] | null
          document_date?: string | null
          document_id: string
          end_page: number
          extend_dashboard_url?: string | null
          extend_processor_id?: string | null
          extracted_data?: Json | null
          extraction_error?: string | null
          extraction_metadata?: Json | null
          extraction_status?: string | null
          id?: string
          identifier?: string | null
          low_confidence_fields?: Json | null
          observation?: string | null
          original_extracted_data?: Json | null
          page_height?: number | null
          page_width?: number | null
          potential_duplicate?: string | null
          schema_version?: string | null
          split_index: number
          start_page: number
          tag_id: string
          updated_at?: string | null
          validation_failures?: Json | null
        }
        Update: {
          created_at?: string | null
          dismissed_rule_ids?: string[] | null
          document_date?: string | null
          document_id?: string
          end_page?: number
          extend_dashboard_url?: string | null
          extend_processor_id?: string | null
          extracted_data?: Json | null
          extraction_error?: string | null
          extraction_metadata?: Json | null
          extraction_status?: string | null
          id?: string
          identifier?: string | null
          low_confidence_fields?: Json | null
          observation?: string | null
          original_extracted_data?: Json | null
          page_height?: number | null
          page_width?: number | null
          potential_duplicate?: string | null
          schema_version?: string | null
          split_index?: number
          start_page?: number
          tag_id?: string
          updated_at?: string | null
          validation_failures?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "splits_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "splits_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents_with_status"
            referencedColumns: ["id"]
          },
        ]
      }
      user_instructions: {
        Row: {
          case_id: string | null
          created_at: string
          description: string
          id: string
          title: string
          user_id: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          description: string
          id?: string
          title: string
          user_id: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          description?: string
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_instructions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_contacts: {
        Row: {
          id: string
          user_id: string
          phone: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          phone: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          phone?: string
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          id: string
          whatsapp_msg_id: string
          phone: string
          contact_id: string
          case_id: string
          document_id: string | null
          message_type: string
          message_text: string | null
          filename: string | null
          status: string
          whatsapp_timestamp: string
          created_at: string
        }
        Insert: {
          id?: string
          whatsapp_msg_id: string
          phone: string
          contact_id: string
          case_id: string
          document_id?: string | null
          message_type: string
          message_text?: string | null
          filename?: string | null
          status?: string
          whatsapp_timestamp: string
          created_at?: string
        }
        Update: {
          id?: string
          whatsapp_msg_id?: string
          phone?: string
          contact_id?: string
          case_id?: string
          document_id?: string | null
          message_type?: string
          message_text?: string | null
          filename?: string | null
          status?: string
          whatsapp_timestamp?: string
          created_at?: string
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
      vault_files: {
        Row: {
          client_id: string
          content: string | null
          content_type: string | null
          created_at: string
          file_id: string
          filename: string
          fts: unknown
          needs_reprocess: boolean
          size_bytes: number | null
          storage_path: string
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          content?: string | null
          content_type?: string | null
          created_at?: string
          file_id?: string
          filename: string
          fts?: unknown
          needs_reprocess?: boolean
          size_bytes?: number | null
          storage_path: string
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          content?: string | null
          content_type?: string | null
          created_at?: string
          file_id?: string
          filename?: string
          fts?: unknown
          needs_reprocess?: boolean
          size_bytes?: number | null
          storage_path?: string
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_files_client_id_fkey"
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
          created_at: string
          display_name: string | null
          user_id: string
        }
        Insert: {
          client_id?: string
          created_at?: string
          display_name?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          display_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
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
      contacts: {
        Row: {
          client_id: string
          contact_id: string
          created_at: string
          custom_fields: Json
          email: string | null
          first_name: string
          last_name: string
          notes: string | null
          phone: string | null
          type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          contact_id?: string
          created_at?: string
          custom_fields?: Json
          email?: string | null
          first_name: string
          last_name: string
          notes?: string | null
          phone?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          contact_id?: string
          created_at?: string
          custom_fields?: Json
          email?: string | null
          first_name?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey"
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
          config_id: string
          contact_custom_fields: Json
          contact_types: Json | null
          created_at: string
          deal_contact_roles: Json | null
          deal_custom_fields: Json
          deal_label: string
          deal_stages: Json | null
          interaction_types: Json | null
          task_types: Json | null
          task_custom_fields: Json
          updated_at: string
        }
        Insert: {
          client_id: string
          config_id?: string
          contact_custom_fields?: Json
          contact_types?: Json | null
          created_at?: string
          deal_contact_roles?: Json | null
          deal_custom_fields?: Json
          deal_label?: string
          deal_stages?: Json | null
          interaction_types?: Json | null
          task_types?: Json | null
          task_custom_fields?: Json
          updated_at?: string
        }
        Update: {
          client_id?: string
          config_id?: string
          contact_custom_fields?: Json
          contact_types?: Json | null
          created_at?: string
          deal_contact_roles?: Json | null
          deal_custom_fields?: Json
          deal_label?: string
          deal_stages?: Json | null
          interaction_types?: Json | null
          task_types?: Json | null
          task_custom_fields?: Json
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
      deal_contacts: {
        Row: {
          deal_contact_id: string
          client_id: string
          deal_id: string
          contact_id: string
          role: string
          is_primary: boolean
          created_at: string
        }
        Insert: {
          deal_contact_id?: string
          client_id: string
          deal_id: string
          contact_id: string
          role?: string
          is_primary?: boolean
          created_at?: string
        }
        Update: {
          deal_contact_id?: string
          client_id?: string
          deal_id?: string
          contact_id?: string
          role?: string
          is_primary?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "deal_contacts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deal_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      deals: {
        Row: {
          address: string
          client_id: string
          created_at: string
          custom_fields: Json
          deal_id: string
          notes: string | null
          price: number | null
          stage: string
          updated_at: string
        }
        Insert: {
          address: string
          client_id: string
          created_at?: string
          custom_fields?: Json
          deal_id?: string
          notes?: string | null
          price?: number | null
          stage?: string
          updated_at?: string
        }
        Update: {
          address?: string
          client_id?: string
          created_at?: string
          custom_fields?: Json
          deal_id?: string
          notes?: string | null
          price?: number | null
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
      autopilot_config: {
        Row: {
          client_id: string
          config_id: string
          created_at: string
          enabled: boolean
          pulse_interval: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
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
      conversation_threads: {
        Row: {
          client_id: string
          compaction_compacted_through_at: string | null
          compaction_compacted_through_message_id: string | null
          compaction_summary: string | null
          compaction_summary_model: string | null
          compaction_summary_tokens_used: number
          created_at: string
          is_archived: boolean
          is_pinned: boolean
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
          created_at?: string
          is_archived?: boolean
          is_pinned?: boolean
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
          created_at?: string
          is_archived?: boolean
          is_pinned?: boolean
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
      connections: {
        Row: {
          client_id: string
          composio_connected_account_id: string
          created_at: string
          display_name: string | null
          id: string
          status: string
          toolkit_slug: string
          updated_at: string
        }
        Insert: {
          client_id: string
          composio_connected_account_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          status?: string
          toolkit_slug: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          composio_connected_account_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          status?: string
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
      agent_triggers: {
        Row: {
          client_id: string
          created_at: string
          cron_expression: string | null
          current_run_id: string | null
          enabled: boolean
          id: string
          invocation_message: string | null
          instruction_path: string
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
          invocation_message?: string | null
          instruction_path: string
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
          invocation_message?: string | null
          instruction_path?: string
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
      conversation_messages: {
        Row: {
          content: string | null
          created_at: string
          message_id: string
          parts: Json | null
          role: string
          thread_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          message_id?: string
          parts?: Json | null
          role: string
          thread_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          message_id?: string
          parts?: Json | null
          role?: string
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
      runs: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string
          model: string | null
          run_id: string
          status: Database["public"]["Enums"]["run_status"]
          step_count: number | null
          thread_id: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          model?: string | null
          run_id?: string
          status?: Database["public"]["Enums"]["run_status"]
          step_count?: number | null
          thread_id: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          model?: string | null
          run_id?: string
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
            foreignKeyName: "runs_thread_id_fkey"
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
    }
    Views: {
      documents_with_status: {
        Row: {
          case_id: string | null
          computed_status: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          document_date: string | null
          file_hash: string | null
          file_size: number | null
          file_type: string | null
          filename: string | null
          gemini_response: Json | null
          id: string | null
          is_heterogeneous: boolean | null
          is_reviewed: boolean | null
          ocr_confidence: string | null
          original_filename: string | null
          page_ranges: Json | null
          primary_tag: string | null
          processed_at: string | null
          processing_error: string | null
          renamed_filename: string | null
          reviewed_at: string | null
          status: string | null
          storage_path: string | null
          tags: Json | null
          updated_at: string | null
        }
        Insert: {
          case_id?: string | null
          computed_status?: never
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_date?: string | null
          file_hash?: string | null
          file_size?: number | null
          file_type?: string | null
          filename?: string | null
          gemini_response?: Json | null
          id?: string | null
          is_heterogeneous?: boolean | null
          is_reviewed?: boolean | null
          ocr_confidence?: string | null
          original_filename?: string | null
          page_ranges?: Json | null
          primary_tag?: string | null
          processed_at?: string | null
          processing_error?: string | null
          renamed_filename?: string | null
          reviewed_at?: string | null
          status?: string | null
          storage_path?: string | null
          tags?: Json | null
          updated_at?: string | null
        }
        Update: {
          case_id?: string | null
          computed_status?: never
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          document_date?: string | null
          file_hash?: string | null
          file_size?: number | null
          file_type?: string | null
          filename?: string | null
          gemini_response?: Json | null
          id?: string | null
          is_heterogeneous?: boolean | null
          is_reviewed?: boolean | null
          ocr_confidence?: string | null
          original_filename?: string | null
          page_ranges?: Json | null
          primary_tag?: string | null
          processed_at?: string | null
          processing_error?: string | null
          renamed_filename?: string | null
          reviewed_at?: string | null
          status?: string | null
          storage_path?: string | null
          tags?: Json | null
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
    }
    Functions: {
      claim_due_triggers: {
        Args: never
        Returns: {
          client_id: string
          created_at: string
          cron_expression: string | null
          current_run_id: string | null
          enabled: boolean
          id: string
          invocation_message: string | null
          instruction_path: string
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
      }
      create_run_if_idle: {
        Args: { p_client_id: string; p_thread_id: string }
        Returns: string | null
      }
      drain_thread_queue: {
        Args: { p_client_id: string; p_thread_id: string }
        Returns: {
          content: Json
          created_at: string
          queue_id: string
        }[]
      }
      get_client_accessible_schema: {
        Args: never
        Returns: Json
      }
      get_my_client_config: { Args: never; Returns: string }
      get_my_client_id: { Args: never; Returns: string }
      get_system_reminder_context: {
        Args: { p_client_id: string; p_thread_id: string }
        Returns: {
          active_connection_toolkits: string[]
          active_trigger_count: number
          days_since_signup: number | null
          display_name: string | null
          memory_file_count: number
          open_todo_count: number
          user_email: string | null
        }
      }
      mark_stale_runs_failed: {
        Args: { p_stale_minutes?: number; p_thread_id?: string | null }
        Returns: number
      }
      release_stale_trigger_claims: {
        Args: { p_stale_minutes?: number }
        Returns: number
      }
      release_trigger_claim: {
        Args: {
          p_advance_next_fire_at?: boolean | null
          p_next_fire_at?: string | null
          p_run_id: string
          p_status?: string
          p_trigger_id: string
        }
        Returns: boolean
      }
      run_readonly_sql: {
        Args: { query_text: string }
        Returns: Json
      }
    }
    Enums: {
      run_status: "queued" | "running" | "completed" | "partial" | "failed" | "cancelled"
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
      run_status: ["queued", "running", "completed", "partial", "failed", "cancelled"],
    },
  },
} as const
