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
          activity_url: string | null
          actual_duration_min: number | null
          athlete_id: string
          block_logs: Json
          coach_id: string | null
          created_at: string
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
          activity_url?: string | null
          actual_duration_min?: number | null
          athlete_id: string
          block_logs?: Json
          coach_id?: string | null
          created_at?: string
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
          activity_url?: string | null
          actual_duration_min?: number | null
          athlete_id?: string
          block_logs?: Json
          coach_id?: string | null
          created_at?: string
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
          coach_id: string
          created_at: string
          end_date: string
          id: string
          name: string
          objective: string | null
          start_date: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string
          end_date: string
          id?: string
          name: string
          objective?: string | null
          start_date: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
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
          coach_code: string | null
          coach_id: string | null
          created_at: string | null
          first_name: string | null
          full_name: string
          gender: string | null
          habit_tracker_enabled: boolean | null
          height_cm: number | null
          id: string
          is_admin: boolean
          is_certified_coach: boolean
          is_hyrox_athlete: boolean
          last_name: string | null
          role: string
          weight_kg: number | null
        }
        Insert: {
          age?: number | null
          base_metabolism?: number | null
          birth_date?: string | null
          body_fat_pct?: number | null
          coach_code?: string | null
          coach_id?: string | null
          created_at?: string | null
          first_name?: string | null
          full_name: string
          gender?: string | null
          habit_tracker_enabled?: boolean | null
          height_cm?: number | null
          id: string
          is_admin?: boolean
          is_certified_coach?: boolean
          is_hyrox_athlete?: boolean
          last_name?: string | null
          role: string
          weight_kg?: number | null
        }
        Update: {
          age?: number | null
          base_metabolism?: number | null
          birth_date?: string | null
          body_fat_pct?: number | null
          coach_code?: string | null
          coach_id?: string | null
          created_at?: string | null
          first_name?: string | null
          full_name?: string
          gender?: string | null
          habit_tracker_enabled?: boolean | null
          height_cm?: number | null
          id?: string
          is_admin?: boolean
          is_certified_coach?: boolean
          is_hyrox_athlete?: boolean
          last_name?: string | null
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
      can_read_doc: { Args: { doc_uuid: string }; Returns: boolean }
      can_read_doc_file: { Args: { object_name: string }; Returns: boolean }
      close_unfinished_workouts: { Args: never; Returns: number }
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
      cycle_athlete_id: { Args: { p_cycle_id: string }; Returns: string }
      cycle_coach_id: { Args: { p_cycle_id: string }; Returns: string }
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
      has_unique: { Args: { "": string }; Returns: string }
      in_todo: { Args: never; Returns: boolean }
      is_coach_of: { Args: { athlete_uuid: string }; Returns: boolean }
      is_empty: { Args: { "": string }; Returns: string }
      isnt_empty: { Args: { "": string }; Returns: string }
      lives_ok: { Args: { "": string }; Returns: string }
      mark_doc_seen: { Args: { doc_uuid: string }; Returns: undefined }
      mark_missed_workouts: { Args: never; Returns: number }
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
      set_active_performance_reference: {
        Args: {
          p_athlete_id: string
          p_metric_name: string
          p_performance_log_id: string
        }
        Returns: undefined
      }
      skip:
        | { Args: { "": string }; Returns: string }
        | { Args: { how_many: number; why: string }; Returns: string }
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
      unlink_athlete: { Args: { athlete_id: string }; Returns: undefined }
      workout_log_has_entries: { Args: { mods: Json }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
