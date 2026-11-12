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
      activity_laps: {
        Row: {
          activity_id: string
          ai_allowed: boolean
          athlete_id: string
          created_at: string
          distance_override_m: number | null
          end_s: number
          exercise_id: string | null
          id: string
          load_kg: number | null
          name: string | null
          needs_review: boolean
          origin: string
          planned_block_ref: string | null
          position: number
          reps: number | null
          source: Database["public"]["Enums"]["data_source"]
          start_s: number
          status: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          ai_allowed?: boolean
          athlete_id: string
          created_at?: string
          distance_override_m?: number | null
          end_s: number
          exercise_id?: string | null
          id?: string
          load_kg?: number | null
          name?: string | null
          needs_review?: boolean
          origin: string
          planned_block_ref?: string | null
          position: number
          reps?: number | null
          source: Database["public"]["Enums"]["data_source"]
          start_s: number
          status: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          ai_allowed?: boolean
          athlete_id?: string
          created_at?: string
          distance_override_m?: number | null
          end_s?: number
          exercise_id?: string | null
          id?: string
          load_kg?: number | null
          name?: string | null
          needs_review?: boolean
          origin?: string
          planned_block_ref?: string | null
          position?: number
          reps?: number | null
          source?: Database["public"]["Enums"]["data_source"]
          start_s?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_laps_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "ai_provider_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_laps_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "provider_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_laps_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_laps_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_plan_links: {
        Row: {
          activity_id: string
          ai_allowed: boolean
          athlete_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          cost: number | null
          created_at: string
          id: string
          local_date: string
          planned_id: string
          planned_kind: string
          source: Database["public"]["Enums"]["data_source"]
          status: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          ai_allowed?: boolean
          athlete_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          cost?: number | null
          created_at?: string
          id?: string
          local_date: string
          planned_id: string
          planned_kind: string
          source: Database["public"]["Enums"]["data_source"]
          status: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          ai_allowed?: boolean
          athlete_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          cost?: number | null
          created_at?: string
          id?: string
          local_date?: string
          planned_id?: string
          planned_kind?: string
          source?: Database["public"]["Enums"]["data_source"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_plan_links_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "ai_provider_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_plan_links_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "provider_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_plan_links_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_plan_links_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_sets: {
        Row: {
          activity_id: string
          ai_allowed: boolean
          athlete_id: string
          category: number[] | null
          category_subtype: number[] | null
          created_at: string
          duration_s: number | null
          id: string
          position: number
          reps: number | null
          set_type: string | null
          source: Database["public"]["Enums"]["data_source"]
          start_s: number | null
          weight_kg: number | null
        }
        Insert: {
          activity_id: string
          ai_allowed?: boolean
          athlete_id: string
          category?: number[] | null
          category_subtype?: number[] | null
          created_at?: string
          duration_s?: number | null
          id?: string
          position: number
          reps?: number | null
          set_type?: string | null
          source: Database["public"]["Enums"]["data_source"]
          start_s?: number | null
          weight_kg?: number | null
        }
        Update: {
          activity_id?: string
          ai_allowed?: boolean
          athlete_id?: string
          category?: number[] | null
          category_subtype?: number[] | null
          created_at?: string
          duration_s?: number | null
          id?: string
          position?: number
          reps?: number | null
          set_type?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          start_s?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_sets_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "ai_provider_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_sets_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "provider_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_sets_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_streams: {
        Row: {
          activity_id: string
          ai_allowed: boolean
          alt: number[] | null
          athlete_id: string
          cadence: number[] | null
          created_at: string
          device: Json | null
          dist: number[] | null
          hr: number[] | null
          laps_edited: boolean
          laps_version: number
          lat: number[] | null
          lon: number[] | null
          normalized_from: string
          power: number[] | null
          sample_count: number
          source: Database["public"]["Enums"]["data_source"]
          speed: number[] | null
          splits: Json
          sport: string | null
          stance: number[] | null
          started_at: string
          step_len: number[] | null
          t: number[]
          temp: number[] | null
          timer: number[] | null
          updated_at: string
          utc_offset_s: number | null
          vosc: number[] | null
          vratio: number[] | null
          watch_laps: Json
          watch_time_in_zone: Json
        }
        Insert: {
          activity_id: string
          ai_allowed?: boolean
          alt?: number[] | null
          athlete_id: string
          cadence?: number[] | null
          created_at?: string
          device?: Json | null
          dist?: number[] | null
          hr?: number[] | null
          laps_edited?: boolean
          laps_version?: number
          lat?: number[] | null
          lon?: number[] | null
          normalized_from: string
          power?: number[] | null
          sample_count: number
          source: Database["public"]["Enums"]["data_source"]
          speed?: number[] | null
          splits?: Json
          sport?: string | null
          stance?: number[] | null
          started_at: string
          step_len?: number[] | null
          t: number[]
          temp?: number[] | null
          timer?: number[] | null
          updated_at?: string
          utc_offset_s?: number | null
          vosc?: number[] | null
          vratio?: number[] | null
          watch_laps?: Json
          watch_time_in_zone?: Json
        }
        Update: {
          activity_id?: string
          ai_allowed?: boolean
          alt?: number[] | null
          athlete_id?: string
          cadence?: number[] | null
          created_at?: string
          device?: Json | null
          dist?: number[] | null
          hr?: number[] | null
          laps_edited?: boolean
          laps_version?: number
          lat?: number[] | null
          lon?: number[] | null
          normalized_from?: string
          power?: number[] | null
          sample_count?: number
          source?: Database["public"]["Enums"]["data_source"]
          speed?: number[] | null
          splits?: Json
          sport?: string | null
          stance?: number[] | null
          started_at?: string
          step_len?: number[] | null
          t?: number[]
          temp?: number[] | null
          timer?: number[] | null
          updated_at?: string
          utc_offset_s?: number | null
          vosc?: number[] | null
          vratio?: number[] | null
          watch_laps?: Json
          watch_time_in_zone?: Json
        }
        Relationships: [
          {
            foreignKeyName: "activity_streams_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: true
            referencedRelation: "ai_provider_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_streams_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: true
            referencedRelation: "provider_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_streams_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_zone_summaries: {
        Row: {
          activity_id: string
          ai_allowed: boolean
          athlete_id: string
          bounds: number[]
          computed_at: string
          kind: string
          model_id: string | null
          no_hr_s: number
          seconds: number[]
          source: Database["public"]["Enums"]["data_source"]
        }
        Insert: {
          activity_id: string
          ai_allowed?: boolean
          athlete_id: string
          bounds: number[]
          computed_at?: string
          kind: string
          model_id?: string | null
          no_hr_s?: number
          seconds: number[]
          source: Database["public"]["Enums"]["data_source"]
        }
        Update: {
          activity_id?: string
          ai_allowed?: boolean
          athlete_id?: string
          bounds?: number[]
          computed_at?: string
          kind?: string
          model_id?: string | null
          no_hr_s?: number
          seconds?: number[]
          source?: Database["public"]["Enums"]["data_source"]
        }
        Relationships: [
          {
            foreignKeyName: "activity_zone_summaries_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: true
            referencedRelation: "ai_provider_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_zone_summaries_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: true
            referencedRelation: "provider_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_zone_summaries_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_zone_summaries_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "hr_zone_models"
            referencedColumns: ["id"]
          },
        ]
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
      athlete_co_coaches: {
        Row: {
          added_by: string | null
          added_by_role: string
          athlete_id: string
          co_coach_id: string
          created_at: string
          hidden: boolean
        }
        Insert: {
          added_by?: string | null
          added_by_role: string
          athlete_id: string
          co_coach_id: string
          created_at?: string
          hidden?: boolean
        }
        Update: {
          added_by?: string | null
          added_by_role?: string
          athlete_id?: string
          co_coach_id?: string
          created_at?: string
          hidden?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "athlete_co_coaches_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_co_coaches_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_co_coaches_co_coach_id_fkey"
            columns: ["co_coach_id"]
            isOneToOne: false
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
      body_weight_goals: {
        Row: {
          athlete_id: string
          reference_kg: number | null
          target_kg: number | null
          updated_at: string
        }
        Insert: {
          athlete_id: string
          reference_kg?: number | null
          target_kg?: number | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          reference_kg?: number | null
          target_kg?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "body_weight_goals_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      body_weight_logs: {
        Row: {
          athlete_id: string
          created_at: string
          day: string
          kg: number
          updated_at: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          day: string
          kg: number
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          day?: string
          kg?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "body_weight_logs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      body_weight_milestones: {
        Row: {
          athlete_id: string
          created_at: string
          day: string
          kg: number
        }
        Insert: {
          athlete_id: string
          created_at?: string
          day: string
          kg: number
        }
        Update: {
          athlete_id?: string
          created_at?: string
          day?: string
          kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "body_weight_milestones_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          consent_purpose: Database["public"]["Enums"]["consent_purpose"] | null
          notes: string
          source: Database["public"]["Enums"]["data_source"]
        }
        Insert: {
          ai_allowed: boolean
          coach_visible: boolean
          consent_purpose?:
            | Database["public"]["Enums"]["consent_purpose"]
            | null
          notes: string
          source: Database["public"]["Enums"]["data_source"]
        }
        Update: {
          ai_allowed?: boolean
          coach_visible?: boolean
          consent_purpose?:
            | Database["public"]["Enums"]["consent_purpose"]
            | null
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
      health_sync_errors: {
        Row: {
          athlete_id: string | null
          constraint_name: string | null
          created_at: string
          id: number
          key: string
          sqlstate: string | null
        }
        Insert: {
          athlete_id?: string | null
          constraint_name?: string | null
          created_at?: string
          id?: never
          key: string
          sqlstate?: string | null
        }
        Update: {
          athlete_id?: string | null
          constraint_name?: string | null
          created_at?: string
          id?: never
          key?: string
          sqlstate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_sync_errors_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_zone_models: {
        Row: {
          athlete_id: string
          bounds: number[] | null
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          kind: string
          origin: string
          refs_day: string | null
          status: string
          test_result_id: string | null
          valid_from: string
        }
        Insert: {
          athlete_id: string
          bounds?: number[] | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind: string
          origin?: string
          refs_day?: string | null
          status?: string
          test_result_id?: string | null
          valid_from?: string
        }
        Update: {
          athlete_id?: string
          bounds?: number[] | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind?: string
          origin?: string
          refs_day?: string | null
          status?: string
          test_result_id?: string | null
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_zone_models_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_zone_models_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_zone_models_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_zone_models_test_result_id_fkey"
            columns: ["test_result_id"]
            isOneToOne: false
            referencedRelation: "athlete_test_results"
            referencedColumns: ["id"]
          },
        ]
      }
      hyrox_axes_params: {
        Row: {
          created_at: string
          notes: string | null
          params: Json
          version: string
        }
        Insert: {
          created_at?: string
          notes?: string | null
          params: Json
          version: string
        }
        Update: {
          created_at?: string
          notes?: string | null
          params?: Json
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "hyrox_axes_params_version_fkey"
            columns: ["version"]
            isOneToOne: true
            referencedRelation: "hyrox_test_grid_versions"
            referencedColumns: ["version"]
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
          roxzone_cause: string | null
          roxzone_rank: number | null
          roxzone_splits: Json | null
          roxzone_top_pct: number | null
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
          top_pct_overall: number | null
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
          roxzone_cause?: string | null
          roxzone_rank?: number | null
          roxzone_splits?: Json | null
          roxzone_top_pct?: number | null
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
          top_pct_overall?: number | null
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
          roxzone_cause?: string | null
          roxzone_rank?: number | null
          roxzone_splits?: Json | null
          roxzone_top_pct?: number | null
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
          top_pct_overall?: number | null
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
      hyrox_test_analyses: {
        Row: {
          algo_version: string
          athlete_id: string
          axes_validated: Json | null
          created_at: string
          created_by: string | null
          date: string
          grid_version: string
          id: string
          inputs: Json
          kind: string
          outputs: Json
          profile: Json
          recalculated_from: string | null
          source_result_ids: string[]
          target_s: number | null
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          algo_version: string
          athlete_id: string
          axes_validated?: Json | null
          created_at?: string
          created_by?: string | null
          date: string
          grid_version: string
          id?: string
          inputs: Json
          kind: string
          outputs: Json
          profile: Json
          recalculated_from?: string | null
          source_result_ids?: string[]
          target_s?: number | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          algo_version?: string
          athlete_id?: string
          axes_validated?: Json | null
          created_at?: string
          created_by?: string | null
          date?: string
          grid_version?: string
          id?: string
          inputs?: Json
          kind?: string
          outputs?: Json
          profile?: Json
          recalculated_from?: string | null
          source_result_ids?: string[]
          target_s?: number | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hyrox_test_analyses_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hyrox_test_analyses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hyrox_test_analyses_grid_version_fkey"
            columns: ["grid_version"]
            isOneToOne: false
            referencedRelation: "hyrox_test_grid_versions"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "hyrox_test_analyses_recalculated_from_fkey"
            columns: ["recalculated_from"]
            isOneToOne: false
            referencedRelation: "hyrox_test_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hyrox_test_analyses_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hyrox_test_axes_drafts: {
        Row: {
          analysis_id: string
          axes_plan: Json | null
          context: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          analysis_id: string
          axes_plan?: Json | null
          context?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          analysis_id?: string
          axes_plan?: Json | null
          context?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hyrox_test_axes_drafts_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: true
            referencedRelation: "hyrox_test_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hyrox_test_axes_drafts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hyrox_test_grid_versions: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          notes: string | null
          version: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          notes?: string | null
          version: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          notes?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "hyrox_test_grid_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hyrox_test_grids: {
        Row: {
          active: boolean
          axis: string
          category: string | null
          created_at: string
          direction: string
          id: string
          metric_key: string
          notes: string | null
          sex: string | null
          source: string
          thresholds: number[]
          version: string
          weight: number
        }
        Insert: {
          active?: boolean
          axis: string
          category?: string | null
          created_at?: string
          direction: string
          id?: string
          metric_key: string
          notes?: string | null
          sex?: string | null
          source: string
          thresholds: number[]
          version: string
          weight?: number
        }
        Update: {
          active?: boolean
          axis?: string
          category?: string | null
          created_at?: string
          direction?: string
          id?: string
          metric_key?: string
          notes?: string | null
          sex?: string | null
          source?: string
          thresholds?: number[]
          version?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "hyrox_test_grids_version_fkey"
            columns: ["version"]
            isOneToOne: false
            referencedRelation: "hyrox_test_grid_versions"
            referencedColumns: ["version"]
          },
        ]
      }
      hyrox_test_params: {
        Row: {
          created_at: string
          notes: string | null
          params: Json
          scope: string
          version: string
        }
        Insert: {
          created_at?: string
          notes?: string | null
          params: Json
          scope: string
          version: string
        }
        Update: {
          created_at?: string
          notes?: string | null
          params?: Json
          scope?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "hyrox_test_params_version_fkey"
            columns: ["version"]
            isOneToOne: false
            referencedRelation: "hyrox_test_grid_versions"
            referencedColumns: ["version"]
          },
        ]
      }
      hyrox_work_axes_rules: {
        Row: {
          active: boolean
          axis: string
          condition: Json
          created_at: string
          group_name: string
          id: string
          means: string
          metric_key: string | null
          rationale: string
          rule_key: string
          sort_order: number
          step: string
          to_recalibrate: boolean
          version: string
        }
        Insert: {
          active?: boolean
          axis: string
          condition: Json
          created_at?: string
          group_name: string
          id?: string
          means: string
          metric_key?: string | null
          rationale: string
          rule_key: string
          sort_order?: number
          step: string
          to_recalibrate?: boolean
          version: string
        }
        Update: {
          active?: boolean
          axis?: string
          condition?: Json
          created_at?: string
          group_name?: string
          id?: string
          means?: string
          metric_key?: string | null
          rationale?: string
          rule_key?: string
          sort_order?: number
          step?: string
          to_recalibrate?: boolean
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "hyrox_work_axes_rules_version_fkey"
            columns: ["version"]
            isOneToOne: false
            referencedRelation: "hyrox_test_grid_versions"
            referencedColumns: ["version"]
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
          client_build: string | null
          client_build_at: string | null
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
          hyrox_category: string | null
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
          client_build?: string | null
          client_build_at?: string | null
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
          hyrox_category?: string | null
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
          client_build?: string | null
          client_build_at?: string | null
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
          hyrox_category?: string | null
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
          commute: boolean | null
          description: string | null
          details: Json | null
          device_name: string | null
          distance_m: number | null
          duration_s: number | null
          elevation_gain_m: number | null
          external_id: string
          gear: string | null
          id: string
          imported_at: string
          local_date: string
          max_hr: number | null
          origin_quality: string | null
          raw: Json | null
          rpe: number | null
          source: Database["public"]["Enums"]["data_source"]
          sources: string[]
          sport: string | null
          started_at: string
          strava_activity_id: string | null
          title: string | null
        }
        Insert: {
          ai_allowed?: boolean
          athlete_id: string
          avg_hr?: number | null
          avg_pace_s_per_km?: number | null
          calories?: number | null
          commute?: boolean | null
          description?: string | null
          details?: Json | null
          device_name?: string | null
          distance_m?: number | null
          duration_s?: number | null
          elevation_gain_m?: number | null
          external_id: string
          gear?: string | null
          id?: string
          imported_at?: string
          local_date: string
          max_hr?: number | null
          origin_quality?: string | null
          raw?: Json | null
          rpe?: number | null
          source: Database["public"]["Enums"]["data_source"]
          sources?: string[]
          sport?: string | null
          started_at: string
          strava_activity_id?: string | null
          title?: string | null
        }
        Update: {
          ai_allowed?: boolean
          athlete_id?: string
          avg_hr?: number | null
          avg_pace_s_per_km?: number | null
          calories?: number | null
          commute?: boolean | null
          description?: string | null
          details?: Json | null
          device_name?: string | null
          distance_m?: number | null
          duration_s?: number | null
          elevation_gain_m?: number | null
          external_id?: string
          gear?: string | null
          id?: string
          imported_at?: string
          local_date?: string
          max_hr?: number | null
          origin_quality?: string | null
          raw?: Json | null
          rpe?: number | null
          source?: Database["public"]["Enums"]["data_source"]
          sources?: string[]
          sport?: string | null
          started_at?: string
          strava_activity_id?: string | null
          title?: string | null
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
          sync_lock_token: string | null
          sync_locked_until: string | null
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
          sync_lock_token?: string | null
          sync_locked_until?: string | null
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
          sync_lock_token?: string | null
          sync_locked_until?: string | null
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
          active_kcal: number | null
          active_time_min: number | null
          ai_allowed: boolean
          athlete_id: string
          bmi: number | null
          bmr_kcal: number | null
          body_battery_charged: number | null
          body_battery_drained: number | null
          body_battery_max: number | null
          body_battery_min: number | null
          body_fat_pct: number | null
          body_water_pct: number | null
          bone_mass_kg: number | null
          bp_diastolic: number | null
          bp_pulse: number | null
          bp_systolic: number | null
          day: string
          distance_m: number | null
          fitness_age: number | null
          floors_climbed: number | null
          hr_avg: number | null
          hr_max: number | null
          hr_min: number | null
          hrv_ms: number | null
          hrv_peak_5min_ms: number | null
          hydration_ml: number | null
          id: string
          imported_at: string
          intensity_moderate_min: number | null
          intensity_vigorous_min: number | null
          muscle_mass_kg: number | null
          raw: Json | null
          respiration_day_avg: number | null
          respiration_sleep_avg: number | null
          resting_hr: number | null
          skin_temp_delta_c: number | null
          sleep_awake_min: number | null
          sleep_deep_min: number | null
          sleep_end_at: string | null
          sleep_light_min: number | null
          sleep_nap_min: number | null
          sleep_rem_min: number | null
          sleep_score: number | null
          sleep_start_at: string | null
          sleep_subscores: Json | null
          sleep_total_min: number | null
          source: Database["public"]["Enums"]["data_source"]
          spo2_avg: number | null
          spo2_min: number | null
          steps: number | null
          stress_activity_min: number | null
          stress_avg: number | null
          stress_high_min: number | null
          stress_low_min: number | null
          stress_max: number | null
          stress_medium_min: number | null
          stress_rest_min: number | null
          total_kcal: number | null
          training_load: number | null
          vo2max: number | null
          vo2max_cycling: number | null
          weight_kg: number | null
        }
        Insert: {
          active_kcal?: number | null
          active_time_min?: number | null
          ai_allowed?: boolean
          athlete_id: string
          bmi?: number | null
          bmr_kcal?: number | null
          body_battery_charged?: number | null
          body_battery_drained?: number | null
          body_battery_max?: number | null
          body_battery_min?: number | null
          body_fat_pct?: number | null
          body_water_pct?: number | null
          bone_mass_kg?: number | null
          bp_diastolic?: number | null
          bp_pulse?: number | null
          bp_systolic?: number | null
          day: string
          distance_m?: number | null
          fitness_age?: number | null
          floors_climbed?: number | null
          hr_avg?: number | null
          hr_max?: number | null
          hr_min?: number | null
          hrv_ms?: number | null
          hrv_peak_5min_ms?: number | null
          hydration_ml?: number | null
          id?: string
          imported_at?: string
          intensity_moderate_min?: number | null
          intensity_vigorous_min?: number | null
          muscle_mass_kg?: number | null
          raw?: Json | null
          respiration_day_avg?: number | null
          respiration_sleep_avg?: number | null
          resting_hr?: number | null
          skin_temp_delta_c?: number | null
          sleep_awake_min?: number | null
          sleep_deep_min?: number | null
          sleep_end_at?: string | null
          sleep_light_min?: number | null
          sleep_nap_min?: number | null
          sleep_rem_min?: number | null
          sleep_score?: number | null
          sleep_start_at?: string | null
          sleep_subscores?: Json | null
          sleep_total_min?: number | null
          source: Database["public"]["Enums"]["data_source"]
          spo2_avg?: number | null
          spo2_min?: number | null
          steps?: number | null
          stress_activity_min?: number | null
          stress_avg?: number | null
          stress_high_min?: number | null
          stress_low_min?: number | null
          stress_max?: number | null
          stress_medium_min?: number | null
          stress_rest_min?: number | null
          total_kcal?: number | null
          training_load?: number | null
          vo2max?: number | null
          vo2max_cycling?: number | null
          weight_kg?: number | null
        }
        Update: {
          active_kcal?: number | null
          active_time_min?: number | null
          ai_allowed?: boolean
          athlete_id?: string
          bmi?: number | null
          bmr_kcal?: number | null
          body_battery_charged?: number | null
          body_battery_drained?: number | null
          body_battery_max?: number | null
          body_battery_min?: number | null
          body_fat_pct?: number | null
          body_water_pct?: number | null
          bone_mass_kg?: number | null
          bp_diastolic?: number | null
          bp_pulse?: number | null
          bp_systolic?: number | null
          day?: string
          distance_m?: number | null
          fitness_age?: number | null
          floors_climbed?: number | null
          hr_avg?: number | null
          hr_max?: number | null
          hr_min?: number | null
          hrv_ms?: number | null
          hrv_peak_5min_ms?: number | null
          hydration_ml?: number | null
          id?: string
          imported_at?: string
          intensity_moderate_min?: number | null
          intensity_vigorous_min?: number | null
          muscle_mass_kg?: number | null
          raw?: Json | null
          respiration_day_avg?: number | null
          respiration_sleep_avg?: number | null
          resting_hr?: number | null
          skin_temp_delta_c?: number | null
          sleep_awake_min?: number | null
          sleep_deep_min?: number | null
          sleep_end_at?: string | null
          sleep_light_min?: number | null
          sleep_nap_min?: number | null
          sleep_rem_min?: number | null
          sleep_score?: number | null
          sleep_start_at?: string | null
          sleep_subscores?: Json | null
          sleep_total_min?: number | null
          source?: Database["public"]["Enums"]["data_source"]
          spo2_avg?: number | null
          spo2_min?: number | null
          steps?: number | null
          stress_activity_min?: number | null
          stress_avg?: number | null
          stress_high_min?: number | null
          stress_low_min?: number | null
          stress_max?: number | null
          stress_medium_min?: number | null
          stress_rest_min?: number | null
          total_kcal?: number | null
          training_load?: number | null
          vo2max?: number | null
          vo2max_cycling?: number | null
          weight_kg?: number | null
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
      provider_fit_quota: {
        Row: {
          connection_id: string
          day: string
          updated_at: string
          used: number
        }
        Insert: {
          connection_id: string
          day: string
          updated_at?: string
          used?: number
        }
        Update: {
          connection_id?: string
          day?: string
          updated_at?: string
          used?: number
        }
        Relationships: [
          {
            foreignKeyName: "provider_fit_quota_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "provider_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_intraday: {
        Row: {
          ai_allowed: boolean
          athlete_id: string
          day: string
          measure: string
          offsets: number[]
          source: Database["public"]["Enums"]["data_source"]
          updated_at: string
          utc_offset_s: number | null
          values: number[]
        }
        Insert: {
          ai_allowed?: boolean
          athlete_id: string
          day: string
          measure: string
          offsets: number[]
          source: Database["public"]["Enums"]["data_source"]
          updated_at?: string
          utc_offset_s?: number | null
          values: number[]
        }
        Update: {
          ai_allowed?: boolean
          athlete_id?: string
          day?: string
          measure?: string
          offsets?: number[]
          source?: Database["public"]["Enums"]["data_source"]
          updated_at?: string
          utc_offset_s?: number | null
          values?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "provider_intraday_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_moveiq: {
        Row: {
          activity_type: string | null
          ai_allowed: boolean
          athlete_id: string
          day: string
          duration_s: number | null
          external_id: string
          id: string
          imported_at: string
          source: Database["public"]["Enums"]["data_source"]
          started_at: string
        }
        Insert: {
          activity_type?: string | null
          ai_allowed?: boolean
          athlete_id: string
          day: string
          duration_s?: number | null
          external_id: string
          id?: string
          imported_at?: string
          source: Database["public"]["Enums"]["data_source"]
          started_at: string
        }
        Update: {
          activity_type?: string | null
          ai_allowed?: boolean
          athlete_id?: string
          day?: string
          duration_s?: number | null
          external_id?: string
          id?: string
          imported_at?: string
          source?: Database["public"]["Enums"]["data_source"]
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_moveiq_athlete_id_fkey"
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
      provider_raw_records: {
        Row: {
          ai_allowed: boolean
          athlete_id: string
          external_user_id: string | null
          file_bytes: number | null
          file_path: string | null
          file_type: string | null
          id: string
          payload: Json
          received_at: string
          samples_count: number | null
          samples_path: string | null
          source: Database["public"]["Enums"]["data_source"]
          summary_id: string
          summary_type: string
          updated_at: string
        }
        Insert: {
          ai_allowed?: boolean
          athlete_id: string
          external_user_id?: string | null
          file_bytes?: number | null
          file_path?: string | null
          file_type?: string | null
          id?: string
          payload: Json
          received_at?: string
          samples_count?: number | null
          samples_path?: string | null
          source: Database["public"]["Enums"]["data_source"]
          summary_id: string
          summary_type: string
          updated_at?: string
        }
        Update: {
          ai_allowed?: boolean
          athlete_id?: string
          external_user_id?: string | null
          file_bytes?: number | null
          file_path?: string | null
          file_type?: string | null
          id?: string
          payload?: Json
          received_at?: string
          samples_count?: number | null
          samples_path?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          summary_id?: string
          summary_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_raw_records_athlete_id_fkey"
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
          refresh_expires_at: string | null
          refresh_locked_until: string | null
          refresh_secret_id: string | null
          updated_at: string
        }
        Insert: {
          access_expires_at?: string | null
          access_secret_id: string
          connection_id: string
          refresh_expires_at?: string | null
          refresh_locked_until?: string | null
          refresh_secret_id?: string | null
          updated_at?: string
        }
        Update: {
          access_expires_at?: string | null
          access_secret_id?: string
          connection_id?: string
          refresh_expires_at?: string | null
          refresh_locked_until?: string | null
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
      provider_webhook_inbox: {
        Row: {
          attempts: number
          error: string | null
          external_user_id: string | null
          fingerprint: string
          id: string
          locked_until: string | null
          payload: Json
          processed_at: string | null
          provider: Database["public"]["Enums"]["data_source"]
          received_at: string
          type: string
        }
        Insert: {
          attempts?: number
          error?: string | null
          external_user_id?: string | null
          fingerprint: string
          id?: string
          locked_until?: string | null
          payload: Json
          processed_at?: string | null
          provider: Database["public"]["Enums"]["data_source"]
          received_at?: string
          type: string
        }
        Update: {
          attempts?: number
          error?: string | null
          external_user_id?: string | null
          fingerprint?: string
          id?: string
          locked_until?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: Database["public"]["Enums"]["data_source"]
          received_at?: string
          type?: string
        }
        Relationships: []
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
          battery: string | null
          battery_order: number | null
          battery_session: string | null
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
          battery?: string | null
          battery_order?: number | null
          battery_session?: string | null
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
          battery?: string | null
          battery_order?: number | null
          battery_session?: string | null
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
      wellness_entries: {
        Row: {
          archived: boolean
          athlete_id: string
          bedtime: string | null
          created_at: string
          day: string
          doms: number | null
          doms_points: Json
          doms_zones: string[]
          energie: number | null
          fatigue: number | null
          injury_note: string | null
          score: number | null
          sleep_hours: number | null
          sleep_interrupt_note: string | null
          sleep_interrupted: boolean | null
          sommeil: number | null
          stress: number | null
          updated_at: string
          wake: string | null
          weight_kg: number | null
        }
        Insert: {
          archived?: boolean
          athlete_id: string
          bedtime?: string | null
          created_at?: string
          day: string
          doms?: number | null
          doms_points?: Json
          doms_zones?: string[]
          energie?: number | null
          fatigue?: number | null
          injury_note?: string | null
          score?: number | null
          sleep_hours?: number | null
          sleep_interrupt_note?: string | null
          sleep_interrupted?: boolean | null
          sommeil?: number | null
          stress?: number | null
          updated_at?: string
          wake?: string | null
          weight_kg?: number | null
        }
        Update: {
          archived?: boolean
          athlete_id?: string
          bedtime?: string | null
          created_at?: string
          day?: string
          doms?: number | null
          doms_points?: Json
          doms_zones?: string[]
          energie?: number | null
          fatigue?: number | null
          injury_note?: string | null
          score?: number | null
          sleep_hours?: number | null
          sleep_interrupt_note?: string | null
          sleep_interrupted?: boolean | null
          sommeil?: number | null
          stress?: number | null
          updated_at?: string
          wake?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wellness_entries_athlete_id_fkey"
            columns: ["athlete_id"]
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
      _energy_assignment_for_write: {
        Args: { p_assignment: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "energy_session_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      _workout_log_for_write: {
        Args: { p_coach_only?: boolean; p_log: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "workout_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      accept_staff_invitation: { Args: { p_token: string }; Returns: string }
      activity_detail_upsert: {
        Args: { p_activity: string; p_detail: Json }
        Returns: Json
      }
      activity_detail_visible: {
        Args: {
          p_athlete: string
          p_source: Database["public"]["Enums"]["data_source"]
        }
        Returns: boolean
      }
      activity_from_garmin_device: {
        Args: {
          p_device: string
          p_raw: Json
          p_source: Database["public"]["Enums"]["data_source"]
          p_sources: string[]
        }
        Returns: boolean
      }
      activity_laps_editor: { Args: { p_athlete: string }; Returns: boolean }
      activity_sport_family: { Args: { p_sport: string }; Returns: string }
      activity_zone_seconds: {
        Args: {
          p_bounds: number[]
          p_hr: number[]
          p_t: number[]
          p_timer: number[]
        }
        Returns: number[]
      }
      add_co_coach: {
        Args: { p_athlete: string; p_coach_code: string }
        Returns: Json
      }
      ai_eligible_sources: {
        Args: { p_athlete: string }
        Returns: Database["public"]["Enums"]["data_source"][]
      }
      apply_hr_zone_model_to_past: { Args: { p_id: string }; Returns: number }
      auto_link_day: {
        Args: { p_athlete: string; p_day: string }
        Returns: number
      }
      can_coach_athlete: { Args: { athlete_uuid: string }; Returns: boolean }
      can_read_doc: { Args: { doc_uuid: string }; Returns: boolean }
      can_read_doc_file: { Args: { object_name: string }; Returns: boolean }
      close_unfinished_workouts: { Args: never; Returns: number }
      coach_api_hit: { Args: { p_key: string }; Returns: number }
      coach_code_exists: { Args: { p_code: string }; Returns: boolean }
      coach_profile_visible: { Args: { p_id: string }; Returns: boolean }
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
      complete_energy_assignment: {
        Args: {
          p_activity_type?: string
          p_activity_url?: string
          p_assignment: string
          p_block_logs?: Json
          p_distance_km?: number
          p_duration_min?: number
          p_notes?: string
          p_rpe?: number
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "energy_session_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_workout: {
        Args: {
          p_log: string
          p_mods?: Json
          p_rpe?: number
          p_run_km?: number
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "workout_logs"
          isOneToOne: true
          isSetofReturn: false
        }
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
      create_cycle: {
        Args: {
          p_athlete: string
          p_deload_week?: number
          p_end: string
          p_mesocycle?: string
          p_name: string
          p_sessions?: Json
          p_start: string
        }
        Returns: Json
      }
      current_user_is_admin: { Args: never; Returns: boolean }
      cycle_athlete_id: { Args: { p_cycle_id: string }; Returns: string }
      cycle_coach_id: { Args: { p_cycle_id: string }; Returns: string }
      decide_hr_zone_model: {
        Args: { p_accept: boolean; p_id: string }
        Returns: undefined
      }
      decide_plan_link: {
        Args: { p_confirm: boolean; p_link: string }
        Returns: undefined
      }
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
      doc_for_my_athlete: { Args: { doc_uuid: string }; Returns: boolean }
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
      health_day: { Args: { p: string }; Returns: string }
      health_hm: { Args: { p: Json }; Returns: string }
      health_item: { Args: { p: Json }; Returns: number }
      health_num: { Args: { p: Json }; Returns: number }
      health_parse_wellness: {
        Args: {
          p_archived: boolean
          p_athlete: string
          p_key: string
          p_v: Json
        }
        Returns: {
          archived: boolean
          athlete_id: string
          bedtime: string | null
          created_at: string
          day: string
          doms: number | null
          doms_points: Json
          doms_zones: string[]
          energie: number | null
          fatigue: number | null
          injury_note: string | null
          score: number | null
          sleep_hours: number | null
          sleep_interrupt_note: string | null
          sleep_interrupted: boolean | null
          sommeil: number | null
          stress: number | null
          updated_at: string
          wake: string | null
          weight_kg: number | null
        }
        SetofOptions: {
          from: "*"
          to: "wellness_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      health_resync: { Args: { p_athlete?: string }; Returns: number }
      health_sync_goals: { Args: { p_athlete: string }; Returns: undefined }
      health_sync_key: {
        Args: { p_athlete: string; p_key: string }
        Returns: undefined
      }
      health_sync_milestones: {
        Args: { p_athlete: string }
        Returns: undefined
      }
      health_sync_weight: { Args: { p_athlete: string }; Returns: undefined }
      health_sync_wellness: { Args: { p_athlete: string }; Returns: undefined }
      health_text: { Args: { p: Json }; Returns: string }
      hr_bounds_valid: { Args: { b: number[] }; Returns: boolean }
      hr_zone_bounds_at: {
        Args: { p_athlete: string; p_day: string }
        Returns: {
          bounds: number[]
          kind: string
          model_id: string
        }[]
      }
      in_todo: { Args: never; Returns: boolean }
      invitation_is_valid: { Args: { p_token: string }; Returns: boolean }
      is_athlete_coach: {
        Args: { athlete_uuid: string; p_coach: string }
        Returns: boolean
      }
      is_co_coach_of: { Args: { athlete_uuid: string }; Returns: boolean }
      is_coach_of: { Args: { athlete_uuid: string }; Returns: boolean }
      is_coach_of_folder: { Args: { p_folder: string }; Returns: boolean }
      is_coach_partner: { Args: { p_coach: string }; Returns: boolean }
      is_empty: { Args: { "": string }; Returns: string }
      isnt_empty: { Args: { "": string }; Returns: string }
      jsonb_int_array: { Args: { j: Json }; Returns: number[] }
      jsonb_real_array: { Args: { j: Json }; Returns: number[] }
      link_activity_to_plan: {
        Args: { p_activity: string; p_kind: string; p_planned: string }
        Returns: string
      }
      link_to_coach_by_code: { Args: { p_code: string }; Returns: string }
      linked_planned_ids: {
        Args: { p_ids: string[]; p_kind: string }
        Returns: string[]
      }
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
      merge_provider_activities: {
        Args: {
          p_activities: Json
          p_athlete: string
          p_source: Database["public"]["Enums"]["data_source"]
          p_tag: string
        }
        Returns: Json
      }
      merge_provider_activity: {
        Args: {
          p_activity: Json
          p_athlete: string
          p_source: Database["public"]["Enums"]["data_source"]
          p_tag: string
        }
        Returns: Json
      }
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
      normalize_metric_name: { Args: { p_name: string }; Returns: string }
      num_failed: { Args: never; Returns: number }
      nutrition_save_day: {
        Args: { p_athlete: string; p_day: string; p_log: Json }
        Returns: Json
      }
      origin_quality_rank: { Args: { q: string }; Returns: number }
      os_name: { Args: never; Returns: string }
      outing_sports_compatible: {
        Args: { a: string; b: string }
        Returns: boolean
      }
      pass:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      patch_workout_entries: {
        Args: { p_log: string; p_patch: Json }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "workout_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pg_version: { Args: never; Returns: string }
      pg_version_num: { Args: never; Returns: number }
      pgtap_version: { Args: never; Returns: number }
      plan_family_accepts: {
        Args: { p_activity: string; p_planned: string }
        Returns: boolean
      }
      plan_match_cost: {
        Args: { a_dist: number; a_dur: number; p_dist: number; p_dur: number }
        Returns: number
      }
      planned_sessions_of_day: {
        Args: { p_athlete: string; p_day: string }
        Returns: {
          distance_m: number
          duration_s: number
          family: string
          id: string
          kind: string
        }[]
      }
      program_save_sessions: {
        Args: {
          p_athlete: string
          p_base?: Json
          p_order?: string[]
          p_remove?: string[]
          p_upsert: Json
        }
        Returns: Json
      }
      provider_daily_columns: {
        Args: never
        Returns: {
          col: string
          typ: string
        }[]
      }
      provider_daily_merge: {
        Args: {
          p_athlete: string
          p_day: string
          p_fields: Json
          p_kind: string
          p_raw: Json
          p_source: Database["public"]["Enums"]["data_source"]
        }
        Returns: string
      }
      provider_fit_quota_exhaust: {
        Args: { p_connection_id: string; p_limit: number }
        Returns: undefined
      }
      provider_fit_quota_remaining: {
        Args: { p_connection_id: string; p_limit: number }
        Returns: number
      }
      provider_fit_quota_reserve: {
        Args: { p_connection_id: string; p_count: number; p_limit: number }
        Returns: boolean
      }
      provider_forget: {
        Args: {
          p_athlete: string
          p_provider: Database["public"]["Enums"]["data_source"]
        }
        Returns: Json
      }
      provider_inbox_claim: {
        Args: {
          p_ids?: string[]
          p_limit?: number
          p_provider: Database["public"]["Enums"]["data_source"]
        }
        Returns: {
          attempts: number
          error: string | null
          external_user_id: string | null
          fingerprint: string
          id: string
          locked_until: string | null
          payload: Json
          processed_at: string | null
          provider: Database["public"]["Enums"]["data_source"]
          received_at: string
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "provider_webhook_inbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      provider_intraday_merge: {
        Args: {
          p_athlete: string
          p_day: string
          p_measure: string
          p_offsets: number[]
          p_source: Database["public"]["Enums"]["data_source"]
          p_utc_offset_s: number
          p_values: number[]
        }
        Returns: number
      }
      provider_raw_objects: {
        Args: {
          p_athlete: string
          p_provider: Database["public"]["Enums"]["data_source"]
          p_types?: string[]
        }
        Returns: {
          object_name: string
        }[]
      }
      provider_sync_try_lock: {
        Args: { p_connection_id: string; p_ttl_seconds?: number }
        Returns: string
      }
      provider_sync_unlock: {
        Args: { p_connection_id: string; p_token: string }
        Returns: undefined
      }
      provider_token_claim_refresh: {
        Args: { p_connection_id: string; p_seconds?: number }
        Returns: boolean
      }
      provider_token_read: {
        Args: { p_connection_id: string }
        Returns: {
          access_token: string
          expires_at: string
          refresh_token: string
        }[]
      }
      provider_token_release_refresh: {
        Args: { p_connection_id: string }
        Returns: undefined
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
      redeem_invitation: { Args: { p_token: string }; Returns: string }
      refresh_activity_zone_summary: {
        Args: { p_activity: string }
        Returns: undefined
      }
      refresh_athlete_zone_summaries: {
        Args: { p_athlete: string; p_from: string }
        Returns: number
      }
      remove_co_coach: { Args: { p_athlete: string }; Returns: undefined }
      reopen_energy_assignment: {
        Args: { p_assignment: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "energy_session_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reopen_workout: {
        Args: { p_log: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "workout_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_client_build: { Args: { p_build: string }; Returns: undefined }
      reset_activity_laps_to_watch: {
        Args: { p_activity: string; p_expected_version: number }
        Returns: number
      }
      review_performance_notification: {
        Args: { p_approve: boolean; p_log: string; p_notification: string }
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
      save_activity_laps: {
        Args: { p_activity: string; p_expected_version: number; p_laps: Json }
        Returns: number
      }
      save_athlete_test_result: {
        Args: {
          p_athlete: string
          p_definition: string
          p_notes: string
          p_performed_at: string
          p_result?: string
          p_values: Json
        }
        Returns: string
      }
      save_fc_zones: {
        Args: { p_athlete: string; p_zones: Json }
        Returns: number
      }
      save_hr_zone_model: {
        Args: {
          p_athlete: string
          p_bounds: number[]
          p_kind: string
          p_valid_from?: string
        }
        Returns: string
      }
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
      set_coach_override: {
        Args: { p_log: string; p_override: Json }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "workout_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_cycle_dates: {
        Args: {
          p_change_mesocycle?: boolean
          p_cycle: string
          p_drop_planned?: boolean
          p_end: string
          p_mesocycle?: string
          p_start: string
          p_trim_after_end?: boolean
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "cycles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_energy_rpe: {
        Args: { p_assignment: string; p_rpe: number }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "energy_session_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_own_coach: { Args: { p_coach: string }; Returns: string }
      set_performance_reference: {
        Args: {
          p_athlete: string
          p_date?: string
          p_metric: string
          p_unit?: string
          p_validated?: boolean
          p_value: number
        }
        Returns: string
      }
      set_workout_rpe: {
        Args: { p_log: string; p_rpe: number }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "workout_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      signup_birth_date_error: {
        Args: { p_birth: string; p_min?: number; p_today: string }
        Returns: string
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
      source_rank: {
        Args: { s: Database["public"]["Enums"]["data_source"] }
        Returns: number
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
      stream_quality_rank: { Args: { q: string }; Returns: number }
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
      trigger_garmin_maintenance: { Args: never; Returns: undefined }
      unlink_athlete: { Args: { athlete_id: string }; Returns: undefined }
      weight_record_milestone: {
        Args: { p_athlete: string; p_day: string; p_kg: number }
        Returns: Json
      }
      weight_set_day: {
        Args: { p_athlete: string; p_day: string; p_kg: number }
        Returns: Json
      }
      weight_set_goal: {
        Args: { p_athlete: string; p_target_kg: number }
        Returns: Json
      }
      wellness_delete_day: {
        Args: { p_athlete: string; p_day: string }
        Returns: boolean
      }
      wellness_set_day: {
        Args: { p_athlete: string; p_day: string; p_entry: Json }
        Returns: Json
      }
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
