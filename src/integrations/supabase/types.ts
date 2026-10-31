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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_deletions: {
        Row: {
          consent_version: string | null
          deleted_at: string
          had_core_consent: boolean | null
          id: string
          initiated_by: string
          role: string | null
        }
        Insert: {
          consent_version?: string | null
          deleted_at?: string
          had_core_consent?: boolean | null
          id?: string
          initiated_by?: string
          role?: string | null
        }
        Update: {
          consent_version?: string | null
          deleted_at?: string
          had_core_consent?: boolean | null
          id?: string
          initiated_by?: string
          role?: string | null
        }
        Relationships: []
      }
      app_data: {
        Row: {
          athlete_id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          athlete_id: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          athlete_id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_data_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_feedback: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          kind: string
          page: string | null
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          kind?: string
          page?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          kind?: string
          page?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_feedback_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_update_reads: {
        Row: {
          seen_at: string
          update_id: string
          user_id: string
        }
        Insert: {
          seen_at?: string
          update_id: string
          user_id: string
        }
        Update: {
          seen_at?: string
          update_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_update_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_claims: {
        Row: {
          athlete_id: string
          created_at: string
          token: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          token: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_claims_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_life_events: {
        Row: {
          athlete_id: string
          created_at: string
          date_end: string
          date_start: string
          id: string
          title: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          date_end: string
          date_start: string
          id?: string
          title: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          date_end?: string
          date_start?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_life_events_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_profile_items: {
        Row: {
          athlete_id: string
          category: string
          created_at: string
          id: string
          label: string
          note: string | null
          rating: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          athlete_id: string
          category: string
          created_at?: string
          id?: string
          label: string
          note?: string | null
          rating?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          category?: string
          created_at?: string
          id?: string
          label?: string
          note?: string | null
          rating?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_profile_items_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_staff: {
        Row: {
          added_by: string | null
          added_by_role: string
          athlete_id: string
          athlete_notified_at: string | null
          can_edit_coach_content: boolean
          coach_notified_at: string | null
          created_at: string
          id: string
          permissions: Json
          profession: string
          revoked_at: string | null
          revoked_by: string | null
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          added_by_role: string
          athlete_id: string
          athlete_notified_at?: string | null
          can_edit_coach_content?: boolean
          coach_notified_at?: string | null
          created_at?: string
          id?: string
          permissions?: Json
          profession: string
          revoked_at?: string | null
          revoked_by?: string | null
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          added_by_role?: string
          athlete_id?: string
          athlete_notified_at?: string | null
          can_edit_coach_content?: boolean
          coach_notified_at?: string | null
          created_at?: string
          id?: string
          permissions?: Json
          profession?: string
          revoked_at?: string | null
          revoked_by?: string | null
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_staff_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_staff_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_staff_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_staff_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_test_results: {
        Row: {
          athlete_id: string
          created_at: string | null
          id: string
          notes: string | null
          performed_at: string
          test_definition_id: string
          updated_at: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          performed_at?: string
          test_definition_id: string
          updated_at?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          performed_at?: string
          test_definition_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_test_results_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_test_results_test_definition_id_fkey"
            columns: ["test_definition_id"]
            isOneToOne: false
            referencedRelation: "test_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_test_values: {
        Row: {
          id: string
          result_id: string
          value: number
          variable_id: string
        }
        Insert: {
          id?: string
          result_id: string
          value: number
          variable_id: string
        }
        Update: {
          id?: string
          result_id?: string
          value?: number
          variable_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_test_values_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "athlete_test_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_test_values_variable_id_fkey"
            columns: ["variable_id"]
            isOneToOne: false
            referencedRelation: "athlete_current_values"
            referencedColumns: ["variable_id"]
          },
          {
            foreignKeyName: "athlete_test_values_variable_id_fkey"
            columns: ["variable_id"]
            isOneToOne: false
            referencedRelation: "test_variables"
            referencedColumns: ["id"]
          },
        ]
      }
      citation_likes: {
        Row: {
          created_at: string
          quote_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          quote_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          quote_id?: number
          user_id?: string
        }
        Relationships: []
      }
      citation_stats: {
        Row: {
          likes: number
          quote_id: number
        }
        Insert: {
          likes?: number
          quote_id: number
        }
        Update: {
          likes?: number
          quote_id?: number
        }
        Relationships: []
      }
      coach_api_access_log: {
        Row: {
          athlete_id: string | null
          coach_id: string
          created_at: string
          id: number
          key_id: string | null
          route: string
        }
        Insert: {
          athlete_id?: string | null
          coach_id: string
          created_at?: string
          id?: number
          key_id?: string | null
          route: string
        }
        Update: {
          athlete_id?: string | null
          coach_id?: string
          created_at?: string
          id?: number
          key_id?: string | null
          route?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_api_access_log_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "coach_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_api_drafts: {
        Row: {
          applied_via: string | null
          athlete_id: string
          base_hash: string | null
          body: string
          coach_id: string
          created_at: string
          decided_at: string | null
          id: string
          key_id: string | null
          kind: string
          ops: Json
          status: string
          title: string
          undo: Json
          undone_at: string | null
        }
        Insert: {
          applied_via?: string | null
          athlete_id: string
          base_hash?: string | null
          body?: string
          coach_id: string
          created_at?: string
          decided_at?: string | null
          id?: string
          key_id?: string | null
          kind: string
          ops?: Json
          status?: string
          title: string
          undo?: Json
          undone_at?: string | null
        }
        Update: {
          applied_via?: string | null
          athlete_id?: string
          base_hash?: string | null
          body?: string
          coach_id?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          key_id?: string | null
          kind?: string
          ops?: Json
          status?: string
          title?: string
          undo?: Json
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_api_drafts_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "coach_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_api_keys: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
        }
        Relationships: []
      }
      coach_api_rate: {
        Row: {
          hits: number
          key_id: string
          window_start: string
        }
        Insert: {
          hits?: number
          key_id: string
          window_start: string
        }
        Update: {
          hits?: number
          key_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_api_rate_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "coach_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          athlete_comment: string | null
          athlete_id: string
          coach_id: string
          created_at: string
          date: string
          id: string
          location: string | null
          macrocycle_id: string | null
          name: string
          notes: string | null
          planning_block_id: string | null
          priority: string
          season_id: string | null
          type: string
        }
        Insert: {
          athlete_comment?: string | null
          athlete_id: string
          coach_id: string
          created_at?: string
          date: string
          id?: string
          location?: string | null
          macrocycle_id?: string | null
          name: string
          notes?: string | null
          planning_block_id?: string | null
          priority?: string
          season_id?: string | null
          type?: string
        }
        Update: {
          athlete_comment?: string | null
          athlete_id?: string
          coach_id?: string
          created_at?: string
          date?: string
          id?: string
          location?: string | null
          macrocycle_id?: string | null
          name?: string
          notes?: string | null
          planning_block_id?: string | null
          priority?: string
          season_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitions_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_planning_block_id_fkey"
            columns: ["planning_block_id"]
            isOneToOne: false
            referencedRelation: "planning_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      cycles: {
        Row: {
          athlete_id: string | null
          coach_id: string | null
          created_at: string
          end_date: string
          id: string
          mesocycle_id: string | null
          name: string
          objective: string | null
          start_date: string
        }
        Insert: {
          athlete_id?: string | null
          coach_id?: string | null
          created_at?: string
          end_date: string
          id?: string
          mesocycle_id?: string | null
          name: string
          objective?: string | null
          start_date: string
        }
        Update: {
          athlete_id?: string | null
          coach_id?: string | null
          created_at?: string
          end_date?: string
          id?: string
          mesocycle_id?: string | null
          name?: string
          objective?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycles_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycles_mesocycle_id_fkey"
            columns: ["mesocycle_id"]
            isOneToOne: false
            referencedRelation: "mesocycles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_source_policies: {
        Row: {
          ai_allowed: boolean
          coach_visible: boolean
          notes: string
          source: Database["public"]["Enums"]["data_source"]
        }
        Insert: {
          ai_allowed: boolean
          coach_visible: boolean
          notes: string
          source: Database["public"]["Enums"]["data_source"]
        }
        Update: {
          ai_allowed?: boolean
          coach_visible?: boolean
          notes?: string
          source?: Database["public"]["Enums"]["data_source"]
        }
        Relationships: []
      }
      day_themes: {
        Row: {
          athlete_id: string
          coach_id: string
          color: string
          created_at: string
          date: string
          dominante: string | null
          id: string
          intensity: string | null
          kind: string | null
          label: string
          note: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          color?: string
          created_at?: string
          date: string
          dominante?: string | null
          id?: string
          intensity?: string | null
          kind?: string | null
          label?: string
          note?: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          color?: string
          created_at?: string
          date?: string
          dominante?: string | null
          id?: string
          intensity?: string | null
          kind?: string | null
          label?: string
          note?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_themes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_themes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_assignments: {
        Row: {
          assigned_by: string | null
          athlete_id: string
          coach_note: string | null
          created_at: string
          doc_id: string
          id: string
          seen_at: string | null
          source: string
        }
        Insert: {
          assigned_by?: string | null
          athlete_id: string
          coach_note?: string | null
          created_at?: string
          doc_id: string
          id?: string
          seen_at?: string | null
          source: string
        }
        Update: {
          assigned_by?: string | null
          athlete_id?: string
          coach_note?: string | null
          created_at?: string
          doc_id?: string
          id?: string
          seen_at?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_assignments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_assignments_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "docs"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_comments: {
        Row: {
          athlete_id: string
          author_id: string
          body: string
          created_at: string
          doc_id: string
          id: string
          image_path: string | null
        }
        Insert: {
          athlete_id: string
          author_id: string
          body?: string
          created_at?: string
          doc_id: string
          id?: string
          image_path?: string | null
        }
        Update: {
          athlete_id?: string
          author_id?: string
          body?: string
          created_at?: string
          doc_id?: string
          id?: string
          image_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_comments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_comments_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "docs"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_schedule: {
        Row: {
          added_by: string | null
          athlete_id: string
          created_at: string
          date: string
          doc_id: string
          id: string
          note: string | null
        }
        Insert: {
          added_by?: string | null
          athlete_id: string
          created_at?: string
          date: string
          doc_id: string
          id?: string
          note?: string | null
        }
        Update: {
          added_by?: string | null
          athlete_id?: string
          created_at?: string
          date?: string
          doc_id?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_schedule_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_schedule_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_schedule_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "docs"
            referencedColumns: ["id"]
          },
        ]
      }
      docs: {
        Row: {
          archived_at: string | null
          athlete_id: string | null
          category: string
          coach_id: string
          created_at: string
          description: string | null
          file_path: string | null
          file_size: number | null
          id: string
          is_self_service: boolean
          kind: string
          mime_type: string | null
          origin_id: string | null
          tags: string[]
          title: string
          updated_at: string
          uploaded_by: string | null
          variant_label: string | null
          variant_order: number
        }
        Insert: {
          archived_at?: string | null
          athlete_id?: string | null
          category?: string
          coach_id: string
          created_at?: string
          description?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          is_self_service?: boolean
          kind?: string
          mime_type?: string | null
          origin_id?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          uploaded_by?: string | null
          variant_label?: string | null
          variant_order?: number
        }
        Update: {
          archived_at?: string | null
          athlete_id?: string | null
          category?: string
          coach_id?: string
          created_at?: string
          description?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          is_self_service?: boolean
          kind?: string
          mime_type?: string | null
          origin_id?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          variant_label?: string | null
          variant_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "docs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docs_origin_id_fkey"
            columns: ["origin_id"]
            isOneToOne: false
            referencedRelation: "docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docs_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_session_assignments: {
        Row: {
          activity_type: string | null
          activity_url: string | null
          actual_duration_min: number | null
          athlete_id: string
          block_logs: Json
          coach_id: string | null
          created_at: string
          distance_km: number | null
          energy_session_id: string
          id: string
          microcycle_id: string | null
          notes: string | null
          rpe_score: number | null
          scheduled_date: string
          status: string
          updated_at: string
        }
        Insert: {
          activity_type?: string | null
          activity_url?: string | null
          actual_duration_min?: number | null
          athlete_id: string
          block_logs?: Json
          coach_id?: string | null
          created_at?: string
          distance_km?: number | null
          energy_session_id: string
          id?: string
          microcycle_id?: string | null
          notes?: string | null
          rpe_score?: number | null
          scheduled_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          activity_type?: string | null
          activity_url?: string | null
          actual_duration_min?: number | null
          athlete_id?: string
          block_logs?: Json
          coach_id?: string | null
          created_at?: string
          distance_km?: number | null
          energy_session_id?: string
          id?: string
          microcycle_id?: string | null
          notes?: string | null
          rpe_score?: number | null
          scheduled_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "energy_session_assignments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_session_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_session_assignments_energy_session_id_fkey"
            columns: ["energy_session_id"]
            isOneToOne: false
            referencedRelation: "energy_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_session_assignments_microcycle_id_fkey"
            columns: ["microcycle_id"]
            isOneToOne: false
            referencedRelation: "microcycles"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_sessions: {
        Row: {
          archived_at: string | null
          athlete_id: string | null
          classique_structure: Json | null
          created_at: string
          created_by: string | null
          custom_kind: string | null
          fiches: Json | null
          format: string
          id: string
          images: Json | null
          intervals: Json
          is_public: boolean
          is_verified: boolean
          modality: string | null
          name: string
          notes: string | null
          parent_session_id: string | null
          quality_id: string | null
          schema: Json | null
          session_kind: string
          sport_id: string | null
          structure_type: string
          total_distance_m: number | null
          total_duration_s: number | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          archived_at?: string | null
          athlete_id?: string | null
          classique_structure?: Json | null
          created_at?: string
          created_by?: string | null
          custom_kind?: string | null
          fiches?: Json | null
          format?: string
          id?: string
          images?: Json | null
          intervals?: Json
          is_public?: boolean
          is_verified?: boolean
          modality?: string | null
          name: string
          notes?: string | null
          parent_session_id?: string | null
          quality_id?: string | null
          schema?: Json | null
          session_kind: string
          sport_id?: string | null
          structure_type: string
          total_distance_m?: number | null
          total_duration_s?: number | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          archived_at?: string | null
          athlete_id?: string | null
          classique_structure?: Json | null
          created_at?: string
          created_by?: string | null
          custom_kind?: string | null
          fiches?: Json | null
          format?: string
          id?: string
          images?: Json | null
          intervals?: Json
          is_public?: boolean
          is_verified?: boolean
          modality?: string | null
          name?: string
          notes?: string | null
          parent_session_id?: string | null
          quality_id?: string | null
          schema?: Json | null
          session_kind?: string
          sport_id?: string | null
          structure_type?: string
          total_distance_m?: number | null
          total_duration_s?: number | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "energy_sessions_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_sessions_parent_session_id_fkey"
            columns: ["parent_session_id"]
            isOneToOne: false
            referencedRelation: "energy_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_sessions_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "physical_qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_sessions_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "specific_sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_sessions_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_pr_logs: {
        Row: {
          athlete_id: string
          created_at: string
          date: string
          exercise_ref: string
          id: string
          kg: number
          notes: string | null
          source: string
          source_kg: number | null
          source_reps: number | null
        }
        Insert: {
          athlete_id: string
          created_at?: string
          date: string
          exercise_ref: string
          id?: string
          kg: number
          notes?: string | null
          source?: string
          source_kg?: number | null
          source_reps?: number | null
        }
        Update: {
          athlete_id?: string
          created_at?: string
          date?: string
          exercise_ref?: string
          id?: string
          kg?: number
          notes?: string | null
          source?: string
          source_kg?: number | null
          source_reps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exercise_pr_logs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          bloc: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          difficulty: string | null
          equipment: string | null
          ex_type: string | null
          gif_url: string | null
          id: string
          image_url: string | null
          instructions: string | null
          is_compound: boolean | null
          is_public: boolean | null
          is_unilateral: boolean | null
          is_verified: boolean | null
          name: string
          pdf_url: string | null
          secondary: string[] | null
          target: string | null
          target_2: string | null
          tier: number | null
          tips: string | null
          updated_at: string | null
          youtube_id: string | null
        }
        Insert: {
          bloc?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          difficulty?: string | null
          equipment?: string | null
          ex_type?: string | null
          gif_url?: string | null
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_compound?: boolean | null
          is_public?: boolean | null
          is_unilateral?: boolean | null
          is_verified?: boolean | null
          name: string
          pdf_url?: string | null
          secondary?: string[] | null
          target?: string | null
          target_2?: string | null
          tier?: number | null
          tips?: string | null
          updated_at?: string | null
          youtube_id?: string | null
        }
        Update: {
          bloc?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          difficulty?: string | null
          equipment?: string | null
          ex_type?: string | null
          gif_url?: string | null
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_compound?: boolean | null
          is_public?: boolean | null
          is_unilateral?: boolean | null
          is_verified?: boolean | null
          name?: string
          pdf_url?: string | null
          secondary?: string[] | null
          target?: string | null
          target_2?: string | null
          tier?: number | null
          tips?: string | null
          updated_at?: string | null
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_logs: {
        Row: {
          athlete_id: string
          date: string
          habit_id: string
          id: string
        }
        Insert: {
          athlete_id: string
          date: string
          habit_id: string
          id?: string
        }
        Update: {
          athlete_id?: string
          date?: string
          habit_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_logs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habit_logs_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          athlete_id: string
          color: string
          created_at: string | null
          created_by: string | null
          emoji: string
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          athlete_id: string
          color?: string
          created_at?: string | null
          created_by?: string | null
          emoji?: string
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          athlete_id?: string
          color?: string
          created_at?: string | null
          created_by?: string | null
          emoji?: string
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "habits_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hyrox_race_plans: {
        Row: {
          athlete_id: string
          competition_id: string | null
          created_at: string
          created_by: string | null
          division: string
          id: string
          name: string
          notes: string | null
          predicted_from: Json | null
          predicted_high_s: number | null
          predicted_total_s: number | null
          profile: string
          result_id: string | null
          target_total_s: number
          targets: Json
          updated_at: string
        }
        Insert: {
          athlete_id: string
          competition_id?: string | null
          created_at?: string
          created_by?: string | null
          division: string
          id?: string
          name: string
          notes?: string | null
          predicted_from?: Json | null
          predicted_high_s?: number | null
          predicted_total_s?: number | null
          profile?: string
          result_id?: string | null
          target_total_s: number
          targets: Json
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          competition_id?: string | null
          created_at?: string
          created_by?: string | null
          division?: string
          id?: string
          name?: string
          notes?: string | null
          predicted_from?: Json | null
          predicted_high_s?: number | null
          predicted_total_s?: number | null
          profile?: string
          result_id?: string | null
          target_total_s?: number
          targets?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hyrox_race_plans_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hyrox_race_plans_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hyrox_race_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hyrox_race_plans_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "hyrox_results"
            referencedColumns: ["id"]
          },
        ]
      }
      hyrox_reference_segments: {
        Row: {
          bracket: string
          division: string
          id: string
          is_estimate: boolean
          p1_s: number | null
          p10_s: number | null
          p25_s: number | null
          p5_s: number | null
          p50_s: number
          p75_s: number | null
          p90_s: number | null
          sample_size: number | null
          segment: string
          source: string
        }
        Insert: {
          bracket?: string
          division: string
          id?: string
          is_estimate?: boolean
          p1_s?: number | null
          p10_s?: number | null
          p25_s?: number | null
          p5_s?: number | null
          p50_s: number
          p75_s?: number | null
          p90_s?: number | null
          sample_size?: number | null
          segment: string
          source: string
        }
        Update: {
          bracket?: string
          division?: string
          id?: string
          is_estimate?: boolean
          p1_s?: number | null
          p10_s?: number | null
          p25_s?: number | null
          p5_s?: number | null
          p50_s?: number
          p75_s?: number | null
          p90_s?: number | null
          sample_size?: number | null
          segment?: string
          source?: string
        }
        Relationships: []
      }
      hyrox_results: {
        Row: {
          activity_url: string | null
          age_group: string | null
          athlete_comment: string | null
          athlete_id: string
          bbj_s: number | null
          coach_comment: string | null
          competition_id: string | null
          created_at: string
          created_by: string | null
          date: string
          division: string
          event_name: string
          farmers_s: number | null
          format: string
          id: string
          is_official: boolean
          lunges_s: number | null
          participants_age_group: number | null
          participants_overall: number | null
          penalties_note: string | null
          penalties_s: number
          rank_age_group: number | null
          rank_overall: number | null
          row_s: number | null
          roxzone_splits: Json | null
          roxzone_total_s: number | null
          run_1_s: number | null
          run_2_s: number | null
          run_3_s: number | null
          run_4_s: number | null
          run_5_s: number | null
          run_6_s: number | null
          run_7_s: number | null
          run_8_s: number | null
          ski_s: number | null
          sled_pull_s: number | null
          sled_push_s: number | null
          source: string
          status: string
          total_s: number
          updated_at: string
          venue: string | null
          wall_balls_s: number | null
        }
        Insert: {
          activity_url?: string | null
          age_group?: string | null
          athlete_comment?: string | null
          athlete_id: string
          bbj_s?: number | null
          coach_comment?: string | null
          competition_id?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          division: string
          event_name: string
          farmers_s?: number | null
          format?: string
          id?: string
          is_official?: boolean
          lunges_s?: number | null
          participants_age_group?: number | null
          participants_overall?: number | null
          penalties_note?: string | null
          penalties_s?: number
          rank_age_group?: number | null
          rank_overall?: number | null
          row_s?: number | null
          roxzone_splits?: Json | null
          roxzone_total_s?: number | null
          run_1_s?: number | null
          run_2_s?: number | null
          run_3_s?: number | null
          run_4_s?: number | null
          run_5_s?: number | null
          run_6_s?: number | null
          run_7_s?: number | null
          run_8_s?: number | null
          ski_s?: number | null
          sled_pull_s?: number | null
          sled_push_s?: number | null
          source?: string
          status?: string
          total_s: number
          updated_at?: string
          venue?: string | null
          wall_balls_s?: number | null
        }
        Update: {
          activity_url?: string | null
          age_group?: string | null
          athlete_comment?: string | null
          athlete_id?: string
          bbj_s?: number | null
          coach_comment?: string | null
          competition_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          division?: string
          event_name?: string
          farmers_s?: number | null
          format?: string
          id?: string
          is_official?: boolean
          lunges_s?: number | null
          participants_age_group?: number | null
          participants_overall?: number | null
          penalties_note?: string | null
          penalties_s?: number
          rank_age_group?: number | null
          rank_overall?: number | null
          row_s?: number | null
          roxzone_splits?: Json | null
          roxzone_total_s?: number | null
          run_1_s?: number | null
          run_2_s?: number | null
          run_3_s?: number | null
          run_4_s?: number | null
          run_5_s?: number | null
          run_6_s?: number | null
          run_7_s?: number | null
          run_8_s?: number | null
          ski_s?: number | null
          sled_pull_s?: number | null
          sled_push_s?: number | null
          source?: string
          status?: string
          total_s?: number
          updated_at?: string
          venue?: string | null
          wall_balls_s?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hyrox_results_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hyrox_results_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hyrox_results_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          coach_id: string
          created_at: string | null
          email: string | null
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          email?: string | null
          id?: string
          token?: string
          used_at?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          email?: string | null
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      macrocycles: {
        Row: {
          athlete_id: string
          coach_id: string | null
          created_at: string
          end_date: string
          id: string
          name: string
          objective: string | null
          start_date: string
        }
        Insert: {
          athlete_id: string
          coach_id?: string | null
          created_at?: string
          end_date: string
          id?: string
          name: string
          objective?: string | null
          start_date: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string | null
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          objective?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "macrocycles_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "macrocycles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_logs: {
        Row: {
          athlete_id: string
          bras: number | null
          bras_d: number | null
          bras_g: number | null
          created_at: string
          cuisse: number | null
          cuisse_d: number | null
          cuisse_g: number | null
          date: string
          epaules: number | null
          hanche: number | null
          id: string
          mollet: number | null
          mollet_d: number | null
          mollet_g: number | null
          photos: Json
          poitrine: number | null
          taille: number | null
          weight_kg: number | null
        }
        Insert: {
          athlete_id: string
          bras?: number | null
          bras_d?: number | null
          bras_g?: number | null
          created_at?: string
          cuisse?: number | null
          cuisse_d?: number | null
          cuisse_g?: number | null
          date?: string
          epaules?: number | null
          hanche?: number | null
          id?: string
          mollet?: number | null
          mollet_d?: number | null
          mollet_g?: number | null
          photos?: Json
          poitrine?: number | null
          taille?: number | null
          weight_kg?: number | null
        }
        Update: {
          athlete_id?: string
          bras?: number | null
          bras_d?: number | null
          bras_g?: number | null
          created_at?: string
          cuisse?: number | null
          cuisse_d?: number | null
          cuisse_g?: number | null
          date?: string
          epaules?: number | null
          hanche?: number | null
          id?: string
          mollet?: number | null
          mollet_d?: number | null
          mollet_g?: number | null
          photos?: Json
          poitrine?: number | null
          taille?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "measurement_logs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_attachments: {
        Row: {
          athlete_id: string
          created_at: string
          created_by: string | null
          entry_id: string
          file_name: string | null
          file_path: string
          file_size: number | null
          id: string
          mime_type: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          created_by?: string | null
          entry_id: string
          file_name?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          mime_type: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          created_by?: string | null
          entry_id?: string
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_attachments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "medical_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_entries: {
        Row: {
          athlete_id: string
          context: string | null
          created_at: string
          created_by: string | null
          date: string | null
          days_off: number | null
          declared_by: string | null
          diagnosed_by: string | null
          diagnosis: string | null
          id: string
          injury_type: string | null
          kind: string
          mechanism: string | null
          notes: string | null
          pain_level: number | null
          return_date: string | null
          status: string
          title: string
          training_impact: string | null
          treatment: string | null
          updated_at: string
          zone: string | null
        }
        Insert: {
          athlete_id: string
          context?: string | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          days_off?: number | null
          declared_by?: string | null
          diagnosed_by?: string | null
          diagnosis?: string | null
          id?: string
          injury_type?: string | null
          kind?: string
          mechanism?: string | null
          notes?: string | null
          pain_level?: number | null
          return_date?: string | null
          status?: string
          title: string
          training_impact?: string | null
          treatment?: string | null
          updated_at?: string
          zone?: string | null
        }
        Update: {
          athlete_id?: string
          context?: string | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          days_off?: number | null
          declared_by?: string | null
          diagnosed_by?: string | null
          diagnosis?: string | null
          id?: string
          injury_type?: string | null
          kind?: string
          mechanism?: string | null
          notes?: string | null
          pain_level?: number | null
          return_date?: string | null
          status?: string
          title?: string
          training_impact?: string | null
          treatment?: string | null
          updated_at?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_entries_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_history: {
        Row: {
          allergies: string | null
          athlete_id: string
          conditions: string | null
          created_at: string | null
          current_treatments: string | null
          id: string
          medical_notes: string | null
          past_injuries: Json | null
          surgeries: Json | null
          updated_at: string | null
        }
        Insert: {
          allergies?: string | null
          athlete_id: string
          conditions?: string | null
          created_at?: string | null
          current_treatments?: string | null
          id?: string
          medical_notes?: string | null
          past_injuries?: Json | null
          surgeries?: Json | null
          updated_at?: string | null
        }
        Update: {
          allergies?: string | null
          athlete_id?: string
          conditions?: string | null
          created_at?: string | null
          current_treatments?: string | null
          id?: string
          medical_notes?: string | null
          past_injuries?: Json | null
          surgeries?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_history_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mesocycles: {
        Row: {
          created_at: string
          deload_week: number | null
          end_date: string
          frequency: number | null
          id: string
          intensity_config: Json | null
          macrocycle_id: string
          name: string
          objective: string | null
          start_date: string
          volume_config: Json | null
        }
        Insert: {
          created_at?: string
          deload_week?: number | null
          end_date: string
          frequency?: number | null
          id?: string
          intensity_config?: Json | null
          macrocycle_id: string
          name: string
          objective?: string | null
          start_date: string
          volume_config?: Json | null
        }
        Update: {
          created_at?: string
          deload_week?: number | null
          end_date?: string
          frequency?: number | null
          id?: string
          intensity_config?: Json | null
          macrocycle_id?: string
          name?: string
          objective?: string | null
          start_date?: string
          volume_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mesocycles_macrocycle_id_fkey"
            columns: ["macrocycle_id"]
            isOneToOne: false
            referencedRelation: "macrocycles"
            referencedColumns: ["id"]
          },
        ]
      }
      microcycles: {
        Row: {
          created_at: string
          cycle_id: string
          end_date: string
          id: string
          is_deload: boolean
          start_date: string
          week_number: number
        }
        Insert: {
          created_at?: string
          cycle_id: string
          end_date: string
          id?: string
          is_deload?: boolean
          start_date: string
          week_number: number
        }
        Update: {
          created_at?: string
          cycle_id?: string
          end_date?: string
          id?: string
          is_deload?: boolean
          start_date?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "microcycles_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_logs: {
        Row: {
          athlete_id: string
          coach_validated: boolean | null
          created_at: string | null
          created_by: string | null
          custom_unit: string | null
          date: string
          id: string
          is_active_reference: boolean | null
          metric_name: string
          metric_type: string
          notes: string | null
          test_session_id: string | null
          unit: string
          value: number
        }
        Insert: {
          athlete_id: string
          coach_validated?: boolean | null
          created_at?: string | null
          created_by?: string | null
          custom_unit?: string | null
          date?: string
          id?: string
          is_active_reference?: boolean | null
          metric_name: string
          metric_type: string
          notes?: string | null
          test_session_id?: string | null
          unit: string
          value: number
        }
        Update: {
          athlete_id?: string
          coach_validated?: boolean | null
          created_at?: string | null
          created_by?: string | null
          custom_unit?: string | null
          date?: string
          id?: string
          is_active_reference?: boolean | null
          metric_name?: string
          metric_type?: string
          notes?: string | null
          test_session_id?: string | null
          unit?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_logs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_logs_test_session_id_fkey"
            columns: ["test_session_id"]
            isOneToOne: false
            referencedRelation: "test_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_notifications: {
        Row: {
          athlete_id: string
          coach_id: string
          created_at: string | null
          id: string
          performance_log_id: string
          resolved_at: string | null
          status: string | null
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string | null
          id?: string
          performance_log_id: string
          resolved_at?: string | null
          status?: string | null
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string | null
          id?: string
          performance_log_id?: string
          resolved_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_notifications_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_notifications_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_notifications_performance_log_id_fkey"
            columns: ["performance_log_id"]
            isOneToOne: false
            referencedRelation: "performance_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      physical_qualities: {
        Row: {
          coach_id: string | null
          created_at: string
          id: string
          is_default: boolean
          name: string
          slug: string
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          slug: string
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "physical_qualities_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_blocks: {
        Row: {
          athlete_id: string
          coach_id: string
          color: string
          created_at: string
          description: string | null
          end_week: number
          id: string
          name: string
          parent_block_id: string | null
          season_id: string
          sort_order: number
          start_week: number
          type: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          color?: string
          created_at?: string
          description?: string | null
          end_week: number
          id?: string
          name: string
          parent_block_id?: string | null
          season_id: string
          sort_order?: number
          start_week: number
          type?: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          color?: string
          created_at?: string
          description?: string | null
          end_week?: number
          id?: string
          name?: string
          parent_block_id?: string | null
          season_id?: string
          sort_order?: number
          start_week?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_blocks_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_blocks_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_blocks_parent_block_id_fkey"
            columns: ["parent_block_id"]
            isOneToOne: false
            referencedRelation: "planning_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_blocks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age: number | null
          base_metabolism: number | null
          birth_date: string | null
          body_fat_pct: number | null
          booking_url: string | null
          coach_code: string | null
          coach_hidden: boolean
          coach_id: string | null
          created_at: string | null
          first_name: string | null
          full_name: string
          gender: string | null
          habit_tracker_enabled: boolean | null
          height_cm: number | null
          home_hidden_sections: string[]
          id: string
          is_admin: boolean
          is_certified_coach: boolean
          is_hyrox_athlete: boolean
          is_pending: boolean
          last_name: string | null
          profession: string | null
          role: string
          weight_kg: number | null
        }
        Insert: {
          age?: number | null
          base_metabolism?: number | null
          birth_date?: string | null
          body_fat_pct?: number | null
          booking_url?: string | null
          coach_code?: string | null
          coach_hidden?: boolean
          coach_id?: string | null
          created_at?: string | null
          first_name?: string | null
          full_name: string
          gender?: string | null
          habit_tracker_enabled?: boolean | null
          height_cm?: number | null
          home_hidden_sections?: string[]
          id: string
          is_admin?: boolean
          is_certified_coach?: boolean
          is_hyrox_athlete?: boolean
          is_pending?: boolean
          last_name?: string | null
          profession?: string | null
          role: string
          weight_kg?: number | null
        }
        Update: {
          age?: number | null
          base_metabolism?: number | null
          birth_date?: string | null
          body_fat_pct?: number | null
          booking_url?: string | null
          coach_code?: string | null
          coach_hidden?: boolean
          coach_id?: string | null
          created_at?: string | null
          first_name?: string | null
          full_name?: string
          gender?: string | null
          habit_tracker_enabled?: boolean | null
          height_cm?: number | null
          home_hidden_sections?: string[]
          id?: string
          is_admin?: boolean
          is_certified_coach?: boolean
          is_hyrox_athlete?: boolean
          is_pending?: boolean
          last_name?: string | null
          profession?: string | null
          role?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_activities: {
        Row: {
          ai_allowed: boolean
          athlete_id: string
          avg_hr: number | null
          avg_pace_s_per_km: number | null
          calories: number | null
          details: Json | null
          distance_m: number | null
          duration_s: number | null
          elevation_gain_m: number | null
          external_id: string
          id: string
          imported_at: string
          local_date: string
          max_hr: number | null
          raw: Json | null
          source: Database["public"]["Enums"]["data_source"]
          sport: string | null
          started_at: string
        }
        Insert: {
          ai_allowed?: boolean
          athlete_id: string
          avg_hr?: number | null
          avg_pace_s_per_km?: number | null
          calories?: number | null
          details?: Json | null
          distance_m?: number | null
          duration_s?: number | null
          elevation_gain_m?: number | null
          external_id: string
          id?: string
          imported_at?: string
          local_date: string
          max_hr?: number | null
          raw?: Json | null
          source: Database["public"]["Enums"]["data_source"]
          sport?: string | null
          started_at: string
        }
        Update: {
          ai_allowed?: boolean
          athlete_id?: string
          avg_hr?: number | null
          avg_pace_s_per_km?: number | null
          calories?: number | null
          details?: Json | null
          distance_m?: number | null
          duration_s?: number | null
          elevation_gain_m?: number | null
          external_id?: string
          id?: string
          imported_at?: string
          local_date?: string
          max_hr?: number | null
          raw?: Json | null
          source?: Database["public"]["Enums"]["data_source"]
          sport?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_activities_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_connections: {
        Row: {
          api_host: string | null
          athlete_id: string
          connected_at: string
          external_user_id: string | null
          granted_scopes: string[]
          id: string
          last_error: string | null
          last_sync_at: string | null
          provider: Database["public"]["Enums"]["data_source"]
          status: Database["public"]["Enums"]["provider_status"]
          synced_through: string | null
          updated_at: string
        }
        Insert: {
          api_host?: string | null
          athlete_id: string
          connected_at?: string
          external_user_id?: string | null
          granted_scopes?: string[]
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider: Database["public"]["Enums"]["data_source"]
          status?: Database["public"]["Enums"]["provider_status"]
          synced_through?: string | null
          updated_at?: string
        }
        Update: {
          api_host?: string | null
          athlete_id?: string
          connected_at?: string
          external_user_id?: string | null
          granted_scopes?: string[]
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider?: Database["public"]["Enums"]["data_source"]
          status?: Database["public"]["Enums"]["provider_status"]
          synced_through?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_connections_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_dailies: {
        Row: {
          ai_allowed: boolean
          athlete_id: string
          body_battery_max: number | null
          body_battery_min: number | null
          day: string
          hrv_ms: number | null
          id: string
          imported_at: string
          raw: Json | null
          resting_hr: number | null
          sleep_deep_min: number | null
          sleep_rem_min: number | null
          sleep_score: number | null
          sleep_total_min: number | null
          source: Database["public"]["Enums"]["data_source"]
          steps: number | null
          stress_avg: number | null
          training_load: number | null
          vo2max: number | null
        }
        Insert: {
          ai_allowed?: boolean
          athlete_id: string
          body_battery_max?: number | null
          body_battery_min?: number | null
          day: string
          hrv_ms?: number | null
          id?: string
          imported_at?: string
          raw?: Json | null
          resting_hr?: number | null
          sleep_deep_min?: number | null
          sleep_rem_min?: number | null
          sleep_score?: number | null
          sleep_total_min?: number | null
          source: Database["public"]["Enums"]["data_source"]
          steps?: number | null
          stress_avg?: number | null
          training_load?: number | null
          vo2max?: number | null
        }
        Update: {
          ai_allowed?: boolean
          athlete_id?: string
          body_battery_max?: number | null
          body_battery_min?: number | null
          day?: string
          hrv_ms?: number | null
          id?: string
          imported_at?: string
          raw?: Json | null
          resting_hr?: number | null
          sleep_deep_min?: number | null
          sleep_rem_min?: number | null
          sleep_score?: number | null
          sleep_total_min?: number | null
          source?: Database["public"]["Enums"]["data_source"]
          steps?: number | null
          stress_avg?: number | null
          training_load?: number | null
          vo2max?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_dailies_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_oauth_clients: {
        Row: {
          api_host: string
          client_id: string
          provider: Database["public"]["Enums"]["data_source"]
          registered_at: string
          scope: string
        }
        Insert: {
          api_host: string
          client_id: string
          provider: Database["public"]["Enums"]["data_source"]
          registered_at?: string
          scope: string
        }
        Update: {
          api_host?: string
          client_id?: string
          provider?: Database["public"]["Enums"]["data_source"]
          registered_at?: string
          scope?: string
        }
        Relationships: []
      }
      provider_oauth_states: {
        Row: {
          api_host: string
          athlete_id: string
          code_verifier: string
          created_at: string
          expires_at: string
          provider: Database["public"]["Enums"]["data_source"]
          redirect_uri: string
          state: string
        }
        Insert: {
          api_host: string
          athlete_id: string
          code_verifier: string
          created_at?: string
          expires_at?: string
          provider: Database["public"]["Enums"]["data_source"]
          redirect_uri: string
          state: string
        }
        Update: {
          api_host?: string
          athlete_id?: string
          code_verifier?: string
          created_at?: string
          expires_at?: string
          provider?: Database["public"]["Enums"]["data_source"]
          redirect_uri?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_oauth_states_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_tokens: {
        Row: {
          access_expires_at: string | null
          access_secret_id: string
          connection_id: string
          refresh_secret_id: string | null
          updated_at: string
        }
        Insert: {
          access_expires_at?: string | null
          access_secret_id: string
          connection_id: string
          refresh_secret_id?: string | null
          updated_at?: string
        }
        Update: {
          access_expires_at?: string | null
          access_secret_id?: string
          connection_id?: string
          refresh_secret_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_tokens_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "provider_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      retours: {
        Row: {
          athlete_id: string
          content: string
          created_at: string
          id: string
        }
        Insert: {
          athlete_id: string
          content: string
          created_at?: string
          id?: string
        }
        Update: {
          athlete_id?: string
          content?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retours_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      retours_votes: {
        Row: {
          created_at: string
          id: string
          retour_id: string
          user_id: string
          vote: string
        }
        Insert: {
          created_at?: string
          id?: string
          retour_id: string
          user_id: string
          vote: string
        }
        Update: {
          created_at?: string
          id?: string
          retour_id?: string
          user_id?: string
          vote?: string
        }
        Relationships: [
          {
            foreignKeyName: "retours_votes_retour_id_fkey"
            columns: ["retour_id"]
            isOneToOne: false
            referencedRelation: "retours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retours_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_items: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          phase_id: string | null
          priority: string
          sort_order: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          phase_id?: string | null
          priority?: string
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          phase_id?: string | null
          priority?: string
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_items_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "roadmap_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_phases: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          quarter: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          quarter: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          quarter?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_phases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_votes: {
        Row: {
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          id?: string
          item_id: string
          user_id: string
        }
        Update: {
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_votes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "roadmap_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          athlete_id: string
          coach_id: string
          created_at: string
          end_date: string
          id: string
          name: string
          start_date: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string
          end_date: string
          id?: string
          name: string
          start_date: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seasons_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      specific_blocks: {
        Row: {
          coach_id: string
          content: Json
          created_at: string
          id: string
          name: string
          quality_id: string | null
          sport_id: string | null
          updated_at: string
        }
        Insert: {
          coach_id: string
          content?: Json
          created_at?: string
          id?: string
          name: string
          quality_id?: string | null
          sport_id?: string | null
          updated_at?: string
        }
        Update: {
          coach_id?: string
          content?: Json
          created_at?: string
          id?: string
          name?: string
          quality_id?: string | null
          sport_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "specific_blocks_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "specific_blocks_quality_id_fkey"
            columns: ["quality_id"]
            isOneToOne: false
            referencedRelation: "physical_qualities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "specific_blocks_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "specific_sports"
            referencedColumns: ["id"]
          },
        ]
      }
      specific_sports: {
        Row: {
          coach_id: string | null
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_default: boolean
          name: string
          slug: string
        }
        Insert: {
          coach_id?: string | null
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          name: string
          slug: string
        }
        Update: {
          coach_id?: string | null
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "specific_sports_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          athlete_id: string
          can_edit_coach_content: boolean
          created_at: string
          email: string | null
          expires_at: string
          id: string
          invited_by: string
          invited_by_role: string
          permissions: Json
          profession: string
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          athlete_id: string
          can_edit_coach_content?: boolean
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by: string
          invited_by_role: string
          permissions?: Json
          profession: string
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          athlete_id?: string
          can_edit_coach_content?: boolean
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string
          invited_by_role?: string
          permissions?: Json
          profession?: string
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invitations_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      test_definitions: {
        Row: {
          articulation: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          fill_mode: string
          id: string
          is_global: boolean
          kind: string
          media_url: string | null
          name: string
          protocol: Json | null
          updated_at: string | null
        }
        Insert: {
          articulation?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          fill_mode?: string
          id?: string
          is_global?: boolean
          kind?: string
          media_url?: string | null
          name: string
          protocol?: Json | null
          updated_at?: string | null
        }
        Update: {
          articulation?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          fill_mode?: string
          id?: string
          is_global?: boolean
          kind?: string
          media_url?: string | null
          name?: string
          protocol?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      test_results: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          macrocycle_id: string | null
          notes: string | null
          test_date: string
          test_id: string
          test_session_id: string | null
          value: number
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          macrocycle_id?: string | null
          notes?: string | null
          test_date: string
          test_id: string
          test_session_id?: string | null
          value: number
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          macrocycle_id?: string | null
          notes?: string | null
          test_date?: string
          test_id?: string
          test_session_id?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "test_results_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_results_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_results_test_session_id_fkey"
            columns: ["test_session_id"]
            isOneToOne: false
            referencedRelation: "test_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      test_sessions: {
        Row: {
          athlete_id: string
          coach_id: string | null
          completed: boolean | null
          created_at: string | null
          custom_type: string | null
          date: string
          description: string | null
          id: string
          planning_block_id: string | null
          reference_file_type: string | null
          reference_file_url: string | null
          results_note: string | null
          results_structured: Json | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          athlete_id: string
          coach_id?: string | null
          completed?: boolean | null
          created_at?: string | null
          custom_type?: string | null
          date?: string
          description?: string | null
          id?: string
          planning_block_id?: string | null
          reference_file_type?: string | null
          reference_file_url?: string | null
          results_note?: string | null
          results_structured?: Json | null
          title: string
          type?: string
          updated_at?: string | null
        }
        Update: {
          athlete_id?: string
          coach_id?: string | null
          completed?: boolean | null
          created_at?: string | null
          custom_type?: string | null
          date?: string
          description?: string | null
          id?: string
          planning_block_id?: string | null
          reference_file_type?: string | null
          reference_file_url?: string | null
          results_note?: string | null
          results_structured?: Json | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_sessions_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_sessions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_sessions_planning_block_id_fkey"
            columns: ["planning_block_id"]
            isOneToOne: false
            referencedRelation: "planning_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      test_variables: {
        Row: {
          better_when: string
          created_at: string | null
          extrap_factor: number | null
          extrap_metric: string | null
          extrap_op: string | null
          id: string
          key: string
          label: string
          test_definition_id: string
          unit: string
          value_type: string
        }
        Insert: {
          better_when?: string
          created_at?: string | null
          extrap_factor?: number | null
          extrap_metric?: string | null
          extrap_op?: string | null
          id?: string
          key: string
          label: string
          test_definition_id: string
          unit: string
          value_type?: string
        }
        Update: {
          better_when?: string
          created_at?: string | null
          extrap_factor?: number | null
          extrap_metric?: string | null
          extrap_op?: string | null
          id?: string
          key?: string
          label?: string
          test_definition_id?: string
          unit?: string
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_variables_test_definition_id_fkey"
            columns: ["test_definition_id"]
            isOneToOne: false
            referencedRelation: "test_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      tests: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          higher_is_better: boolean
          id: string
          name: string
          unit: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          higher_is_better?: boolean
          id?: string
          name: string
          unit?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          higher_is_better?: boolean
          id?: string
          name?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_methods: {
        Row: {
          category: string
          config: Json
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_official: boolean
          name: string
          scope: string
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          category: string
          config?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_official?: boolean
          name: string
          scope: string
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          config?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_official?: boolean
          name?: string
          scope?: string
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_methods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_consents: {
        Row: {
          created_at: string
          doc_version: string
          granted: boolean
          id: string
          purpose: Database["public"]["Enums"]["consent_purpose"]
          seq: number
          statement: string
          user_id: string
        }
        Insert: {
          created_at?: string
          doc_version: string
          granted: boolean
          id?: string
          purpose: Database["public"]["Enums"]["consent_purpose"]
          seq?: number
          statement: string
          user_id: string
        }
        Update: {
          created_at?: string
          doc_version?: string
          granted?: boolean
          id?: string
          purpose?: Database["public"]["Enums"]["consent_purpose"]
          seq?: number
          statement?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_retours: {
        Row: {
          athlete_id: string
          athlete_reaction: string | null
          coach_id: string
          comment: string
          created_at: string
          id: string
          reacted_at: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          athlete_id: string
          athlete_reaction?: string | null
          coach_id: string
          comment?: string
          created_at?: string
          id?: string
          reacted_at?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          athlete_id?: string
          athlete_reaction?: string | null
          coach_id?: string
          comment?: string
          created_at?: string
          id?: string
          reacted_at?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_retours_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_retours_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_exercise_comments: {
        Row: {
          comment: string
          created_at: string | null
          exercise_id: string | null
          exercise_name: string
          id: string
          updated_at: string | null
          workout_log_id: string
        }
        Insert: {
          comment: string
          created_at?: string | null
          exercise_id?: string | null
          exercise_name: string
          id?: string
          updated_at?: string | null
          workout_log_id: string
        }
        Update: {
          comment?: string
          created_at?: string | null
          exercise_id?: string | null
          exercise_name?: string
          id?: string
          updated_at?: string | null
          workout_log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercise_comments_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercise_comments_workout_log_id_fkey"
            columns: ["workout_log_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_logs: {
        Row: {
          athlete_id: string
          athlete_modifications: Json | null
          coach_alert: boolean
          coach_id: string | null
          completed_at: string | null
          created_at: string
          duration_s: number | null
          id: string
          microcycle_id: string | null
          notes: string | null
          original_scheduled_date: string | null
          rescheduled_by_athlete: boolean
          rpe_score: number | null
          run_distance_km: number | null
          scheduled_date: string
          session_id: string
          session_name: string
          started_at: string | null
          status: string
          updated_at: string
          week_number: number | null
        }
        Insert: {
          athlete_id: string
          athlete_modifications?: Json | null
          coach_alert?: boolean
          coach_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_s?: number | null
          id?: string
          microcycle_id?: string | null
          notes?: string | null
          original_scheduled_date?: string | null
          rescheduled_by_athlete?: boolean
          rpe_score?: number | null
          run_distance_km?: number | null
          scheduled_date?: string
          session_id: string
          session_name: string
          started_at?: string | null
          status?: string
          updated_at?: string
          week_number?: number | null
        }
        Update: {
          athlete_id?: string
          athlete_modifications?: Json | null
          coach_alert?: boolean
          coach_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_s?: number | null
          id?: string
          microcycle_id?: string | null
          notes?: string | null
          original_scheduled_date?: string | null
          rescheduled_by_athlete?: boolean
          rpe_score?: number | null
          run_distance_km?: number | null
          scheduled_date?: string
          session_id?: string
          session_name?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_microcycle_id_fkey"
            columns: ["microcycle_id"]
            isOneToOne: false
            referencedRelation: "microcycles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_rpe: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          rpe_score: number
          workout_log_id: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          rpe_score: number
          workout_log_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          rpe_score?: number
          workout_log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_rpe_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_rpe_workout_log_id_fkey"
            columns: ["workout_log_id"]
            isOneToOne: true
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ai_provider_activities: {
        Row: {
          athlete_id: string | null
          avg_hr: number | null
          avg_pace_s_per_km: number | null
          calories: number | null
          distance_m: number | null
          duration_s: number | null
          elevation_gain_m: number | null
          external_id: string | null
          id: string | null
          imported_at: string | null
          local_date: string | null
          max_hr: number | null
          source: Database["public"]["Enums"]["data_source"] | null
          sport: string | null
          started_at: string | null
        }
        Insert: {
          athlete_id?: string | null
          avg_hr?: number | null
          avg_pace_s_per_km?: number | null
          calories?: number | null
          distance_m?: number | null
          duration_s?: number | null
          elevation_gain_m?: number | null
          external_id?: string | null
          id?: string | null
          imported_at?: string | null
          local_date?: string | null
          max_hr?: number | null
          source?: Database["public"]["Enums"]["data_source"] | null
          sport?: string | null
          started_at?: string | null
        }
        Update: {
          athlete_id?: string | null
          avg_hr?: number | null
          avg_pace_s_per_km?: number | null
          calories?: number | null
          distance_m?: number | null
          duration_s?: number | null
          elevation_gain_m?: number | null
          external_id?: string | null
          id?: string | null
          imported_at?: string | null
          local_date?: string | null
          max_hr?: number | null
          source?: Database["public"]["Enums"]["data_source"] | null
          sport?: string | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_activities_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_dailies: {
        Row: {
          athlete_id: string | null
          body_battery_max: number | null
          body_battery_min: number | null
          day: string | null
          hrv_ms: number | null
          id: string | null
          imported_at: string | null
          resting_hr: number | null
          sleep_deep_min: number | null
          sleep_rem_min: number | null
          sleep_score: number | null
          sleep_total_min: number | null
          source: Database["public"]["Enums"]["data_source"] | null
          steps: number | null
          stress_avg: number | null
          training_load: number | null
          vo2max: number | null
        }
        Insert: {
          athlete_id?: string | null
          body_battery_max?: number | null
          body_battery_min?: number | null
          day?: string | null
          hrv_ms?: number | null
          id?: string | null
          imported_at?: string | null
          resting_hr?: number | null
          sleep_deep_min?: number | null
          sleep_rem_min?: number | null
          sleep_score?: number | null
          sleep_total_min?: number | null
          source?: Database["public"]["Enums"]["data_source"] | null
          steps?: number | null
          stress_avg?: number | null
          training_load?: number | null
          vo2max?: number | null
        }
        Update: {
          athlete_id?: string | null
          body_battery_max?: number | null
          body_battery_min?: number | null
          day?: string | null
          hrv_ms?: number | null
          id?: string | null
          imported_at?: string | null
          resting_hr?: number | null
          sleep_deep_min?: number | null
          sleep_rem_min?: number | null
          sleep_score?: number | null
          sleep_total_min?: number | null
          source?: Database["public"]["Enums"]["data_source"] | null
          steps?: number | null
          stress_avg?: number | null
          training_load?: number | null
          vo2max?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_dailies_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_current_values: {
        Row: {
          athlete_id: string | null
          best_performed_at: string | null
          better_when: string | null
          current_value: number | null
          key: string | null
          label: string | null
          unit: string | null
          value_type: string | null
          variable_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_test_results_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      current_consents: {
        Row: {
          decided_at: string | null
          doc_version: string | null
          granted: boolean | null
          purpose: Database["public"]["Enums"]["consent_purpose"] | null
          user_id: string | null
        }
        Relationships: []
      }
      pg_all_foreign_keys: {
        Row: {
          fk_columns: unknown[] | null
          fk_constraint_name: unknown
          fk_schema_name: unknown
          fk_table_name: unknown
          fk_table_oid: unknown
          is_deferrable: boolean | null
          is_deferred: boolean | null
          match_type: string | null
          on_delete: string | null
          on_update: string | null
          pk_columns: unknown[] | null
          pk_constraint_name: unknown
          pk_index_name: unknown
          pk_schema_name: unknown
          pk_table_name: unknown
          pk_table_oid: unknown
        }
        Relationships: []
      }
      tap_funky: {
        Row: {
          args: string | null
          is_definer: boolean | null
          is_strict: boolean | null
          is_visible: boolean | null
          kind: unknown
          langoid: unknown
          name: unknown
          oid: unknown
          owner: unknown
          returns: string | null
          returns_set: boolean | null
          schema: unknown
          volatility: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _cleanup: { Args: never; Returns: boolean }
      _contract_on: { Args: { "": string }; Returns: unknown }
      _currtest: { Args: never; Returns: number }
      _db_privs: { Args: never; Returns: unknown[] }
      _extensions: { Args: never; Returns: unknown[] }
      _get: { Args: { "": string }; Returns: number }
      _get_latest: { Args: { "": string }; Returns: number[] }
      _get_note: { Args: { "": string }; Returns: string }
      _is_verbose: { Args: never; Returns: boolean }
      _prokind: { Args: { p_oid: unknown }; Returns: unknown }
      _query: { Args: { "": string }; Returns: string }
      _refine_vol: { Args: { "": string }; Returns: string }
      _retval: { Args: { "": string }; Returns: string }
      _table_privs: { Args: never; Returns: unknown[] }
      _temptypes: { Args: { "": string }; Returns: string }
      _todo: { Args: never; Returns: string }
      accept_staff_invitation: { Args: { p_token: string }; Returns: string }
      ai_eligible_sources: {
        Args: { p_athlete: string }
        Returns: Database["public"]["Enums"]["data_source"][]
      }
      can_coach_athlete: { Args: { athlete_uuid: string }; Returns: boolean }
      can_read_doc: { Args: { doc_uuid: string }; Returns: boolean }
      can_read_doc_file: { Args: { object_name: string }; Returns: boolean }
      close_unfinished_workouts: { Args: never; Returns: number }
      coach_api_hit: { Args: { p_key: string }; Returns: number }
      col_is_null:
        | {
            Args: {
              column_name: unknown
              description?: string
              schema_name: unknown
              table_name: unknown
            }
            Returns: string
          }
        | {
            Args: {
              column_name: unknown
              description?: string
              table_name: unknown
            }
            Returns: string
          }
      col_not_null:
        | {
            Args: {
              column_name: unknown
              description?: string
              schema_name: unknown
              table_name: unknown
            }
            Returns: string
          }
        | {
            Args: {
              column_name: unknown
              description?: string
              table_name: unknown
            }
            Returns: string
          }
      consume_oauth_state: {
        Args: { p_state: string }
        Returns: {
          api_host: string
          athlete_id: string
          code_verifier: string
          provider: Database["public"]["Enums"]["data_source"]
          redirect_uri: string
        }[]
      }
      cycle_athlete_id: { Args: { p_cycle_id: string }; Returns: string }
      cycle_coach_id: { Args: { p_cycle_id: string }; Returns: string }
      delete_energy_session: { Args: { p_session_id: string }; Returns: string }
      diag:
        | {
            Args: { msg: unknown }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { msg: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      diag_test_name: { Args: { "": string }; Returns: string }
      do_tap:
        | { Args: never; Returns: string[] }
        | { Args: { "": string }; Returns: string[] }
      fail:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      findfuncs: { Args: { "": string }; Returns: string[] }
      finish: { Args: { exception_on_failure?: boolean }; Returns: string[] }
      format_type_string: { Args: { "": string }; Returns: string }
      get_app_update_reads: {
        Args: never
        Returns: {
          full_name: string
          seen_at: string
          total_coaches: number
          update_id: string
          user_id: string
        }[]
      }
      get_claim_info: {
        Args: { p_token: string }
        Returns: {
          coach_code: string
          coach_name: string
          first_name: string
          last_name: string
        }[]
      }
      get_coach_overview: { Args: { coach_uuid: string }; Returns: Json }
      get_coaches_list: {
        Args: never
        Returns: {
          athlete_count: number
          coach_code: string
          created_at: string
          full_name: string
          id: string
          is_admin: boolean
          is_certified_coach: boolean
        }[]
      }
      get_my_coach_email: { Args: never; Returns: string }
      get_staff_invitation: {
        Args: { p_token: string }
        Returns: {
          athlete_name: string
          coach_name: string
          invited_by_role: string
          inviter_name: string
          profession: string
          status: string
        }[]
      }
      has_unique: { Args: { "": string }; Returns: string }
      in_todo: { Args: never; Returns: boolean }
      is_coach_of: { Args: { athlete_uuid: string }; Returns: boolean }
      is_empty: { Args: { "": string }; Returns: string }
      isnt_empty: { Args: { "": string }; Returns: string }
      list_user_storage_objects: {
        Args: { target_user: string }
        Returns: {
          bucket_id: string
          object_name: string
        }[]
      }
      lives_ok: { Args: { "": string }; Returns: string }
      mark_doc_seen: { Args: { doc_uuid: string }; Returns: undefined }
      mark_missed_workouts: { Args: never; Returns: number }
      mesocycle_athlete_id: {
        Args: { p_mesocycle_id: string }
        Returns: string
      }
      microcycle_for_athlete_date: {
        Args: { p_athlete_id: string; p_date?: string }
        Returns: {
          cycle_name: string
          is_deload: boolean
          macrocycle_name: string
          mesocycle_name: string
          microcycle_id: string
          week_number: number
        }[]
      }
      my_coach_id: { Args: never; Returns: string }
      no_plan: { Args: never; Returns: boolean[] }
      num_failed: { Args: never; Returns: number }
      os_name: { Args: never; Returns: string }
      pass:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      pg_version: { Args: never; Returns: string }
      pg_version_num: { Args: never; Returns: number }
      pgtap_version: { Args: never; Returns: number }
      provider_token_read: {
        Args: { p_connection_id: string }
        Returns: {
          access_token: string
          expires_at: string
          refresh_token: string
        }[]
      }
      provider_token_write: {
        Args: {
          p_access_token: string
          p_connection_id: string
          p_expires_at?: string
          p_refresh_token?: string
        }
        Returns: undefined
      }
      purge_expired_oauth_states: { Args: never; Returns: number }
      react_weekly_retour: {
        Args: { p_reaction: string; p_retour_id: string }
        Returns: undefined
      }
      run_workout_status_maintenance: {
        Args: never
        Returns: {
          closed: number
          missed: number
        }[]
      }
      runtests:
        | { Args: never; Returns: string[] }
        | { Args: { "": string }; Returns: string[] }
      schedule_doc: {
        Args: {
          p_athlete: string
          p_dates: string[]
          p_doc: string
          p_note?: string
        }
        Returns: number
      }
      set_active_performance_reference: {
        Args: {
          p_athlete_id: string
          p_metric_name: string
          p_performance_log_id: string
        }
        Returns: undefined
      }
      set_athlete_hidden: {
        Args: { athlete_id: string; hidden: boolean }
        Returns: undefined
      }
      skip:
        | { Args: { "": string }; Returns: string }
        | { Args: { how_many: number; why: string }; Returns: string }
      source_consent_granted: {
        Args: {
          p_athlete: string
          p_source: Database["public"]["Enums"]["data_source"]
        }
        Returns: boolean
      }
      staff_app_data_domain: { Args: { p_key: string }; Returns: string }
      staff_apply_to_all: { Args: { p_link_id: string }; Returns: number }
      staff_athlete_profiles: {
        Args: never
        Returns: {
          age: number
          base_metabolism: number
          birth_date: string
          body_fat_pct: number
          coach_id: string
          coach_name: string
          first_name: string
          full_name: string
          gender: string
          habit_tracker_enabled: boolean
          height_cm: number
          id: string
          is_hyrox_athlete: boolean
          last_name: string
          weight_kg: number
        }[]
      }
      staff_can: {
        Args: { athlete_uuid: string; domain: string; level: string }
        Returns: boolean
      }
      staff_can_edit: {
        Args: { athlete_uuid: string; author: string; domain: string }
        Returns: boolean
      }
      staff_can_edit_doc: { Args: { doc_uuid: string }; Returns: boolean }
      staff_can_path: {
        Args: { domain: string; level: string; p_name: string }
        Returns: boolean
      }
      staff_can_write_bank: { Args: { coach_uuid: string }; Returns: boolean }
      staff_can_write_docs_path: { Args: { p_name: string }; Returns: boolean }
      staff_default_permissions: {
        Args: { p_profession: string }
        Returns: Json
      }
      staff_doc_for_athlete: {
        Args: { athlete_uuid: string; doc_uuid: string }
        Returns: boolean
      }
      staff_domains: { Args: never; Returns: string[] }
      staff_is_linked: { Args: { athlete_uuid: string }; Returns: boolean }
      staff_normalize_permissions: { Args: { p: Json }; Returns: Json }
      staff_profile_visible: { Args: { staff_uuid: string }; Returns: boolean }
      staff_sharing_consented: {
        Args: { athlete_uuid: string }
        Returns: boolean
      }
      sync_doc_assignments: {
        Args: { p_athlete: string; p_doc_ids: string[]; p_source: string }
        Returns: undefined
      }
      throws_ok: { Args: { "": string }; Returns: string }
      todo:
        | { Args: { how_many: number }; Returns: boolean[] }
        | { Args: { how_many: number; why: string }; Returns: boolean[] }
        | { Args: { why: string }; Returns: boolean[] }
        | { Args: { how_many: number; why: string }; Returns: boolean[] }
      todo_end: { Args: never; Returns: boolean[] }
      todo_start:
        | { Args: never; Returns: boolean[] }
        | { Args: { "": string }; Returns: boolean[] }
      toggle_coach_certification: {
        Args: { p_certified: boolean; p_target_id: string }
        Returns: undefined
      }
      trigger_coros_sync: { Args: never; Returns: undefined }
      unlink_athlete: { Args: { athlete_id: string }; Returns: undefined }
      workout_log_athlete_id: { Args: { p_log_id: string }; Returns: string }
      workout_log_has_entries: { Args: { mods: Json }; Returns: boolean }
    }
    Enums: {
      consent_purpose:
        | "health_data"
        | "ai_programming"
        | "garmin_sync"
        | "coros_sync"
        | "staff_sharing"
      data_source: "garmin" | "coros" | "file_import" | "manual"
      provider_status:
        | "active"
        | "needs_reauth"
        | "consent_withdrawn"
        | "revoked"
    }
    CompositeTypes: {
      _time_trial_type: {
        a_time: number | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      consent_purpose: [
        "health_data",
        "ai_programming",
        "garmin_sync",
        "coros_sync",
        "staff_sharing",
      ],
      data_source: ["garmin", "coros", "file_import", "manual"],
      provider_status: [
        "active",
        "needs_reauth",
        "consent_withdrawn",
        "revoked",
      ],
    },
  },
} as const
