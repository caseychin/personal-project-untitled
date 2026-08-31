// Generated from the dev Supabase project (xbkletxxxfmoehqgdliv) via the
// Supabase MCP `generate_typescript_types` tool. Regenerate after every
// migration — nothing enforces this automatically, and dev/prod are only
// guaranteed to match immediately after a migration is applied to both.
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
      catalog_attributes: {
        Row: {
          group_code: string
          group_name: string
          id: string
          value_code: string
          value_name: string
        }
        Insert: {
          group_code: string
          group_name: string
          id?: string
          value_code: string
          value_name: string
        }
        Update: {
          group_code?: string
          group_name?: string
          id?: string
          value_code?: string
          value_name?: string
        }
        Relationships: []
      }
      catalog_colleges: {
        Row: {
          code: string
          name: string
        }
        Insert: {
          code: string
          name: string
        }
        Update: {
          code?: string
          name?: string
        }
        Relationships: []
      }
      catalog_course_attributes: {
        Row: {
          attribute_id: string
          course_id: string
          id: string
          source: Database["public"]["Enums"]["ingest_source"]
          term_code: string | null
        }
        Insert: {
          attribute_id: string
          course_id: string
          id?: string
          source: Database["public"]["Enums"]["ingest_source"]
          term_code?: string | null
        }
        Update: {
          attribute_id?: string
          course_id?: string
          id?: string
          source?: Database["public"]["Enums"]["ingest_source"]
          term_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_course_attributes_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "catalog_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_course_attributes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "catalog_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_course_attributes_term_code_fkey"
            columns: ["term_code"]
            isOneToOne: false
            referencedRelation: "catalog_terms"
            referencedColumns: ["code"]
          },
        ]
      }
      catalog_course_availability: {
        Row: {
          confidence: number
          course_id: string
          evidence_note: string | null
          is_offered: boolean
          season: Database["public"]["Enums"]["term_season"]
          source: Database["public"]["Enums"]["availability_source"]
          updated_at: string
        }
        Insert: {
          confidence?: number
          course_id: string
          evidence_note?: string | null
          is_offered?: boolean
          season: Database["public"]["Enums"]["term_season"]
          source: Database["public"]["Enums"]["availability_source"]
          updated_at?: string
        }
        Update: {
          confidence?: number
          course_id?: string
          evidence_note?: string | null
          is_offered?: boolean
          season?: Database["public"]["Enums"]["term_season"]
          source?: Database["public"]["Enums"]["availability_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_course_availability_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "catalog_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_course_prerequisites: {
        Row: {
          course_id: string
          id: string
          is_corequisite: boolean
          logic: string | null
          min_grade: string | null
          node_type: Database["public"]["Enums"]["prereq_node_type"]
          parent_id: string | null
          raw_fragment: string | null
          required_course_id: string | null
          sort_order: number
        }
        Insert: {
          course_id: string
          id?: string
          is_corequisite?: boolean
          logic?: string | null
          min_grade?: string | null
          node_type: Database["public"]["Enums"]["prereq_node_type"]
          parent_id?: string | null
          raw_fragment?: string | null
          required_course_id?: string | null
          sort_order?: number
        }
        Update: {
          course_id?: string
          id?: string
          is_corequisite?: boolean
          logic?: string | null
          min_grade?: string | null
          node_type?: Database["public"]["Enums"]["prereq_node_type"]
          parent_id?: string | null
          raw_fragment?: string | null
          required_course_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_course_prerequisites_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "catalog_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_course_prerequisites_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "catalog_course_prerequisites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_course_prerequisites_required_course_id_fkey"
            columns: ["required_course_id"]
            isOneToOne: false
            referencedRelation: "catalog_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_course_term_offerings: {
        Row: {
          course_id: string
          observed_at: string
          season: Database["public"]["Enums"]["term_season"] | null
          section_count: number
          term_code: string
        }
        Insert: {
          course_id: string
          observed_at?: string
          season?: Database["public"]["Enums"]["term_season"] | null
          section_count?: number
          term_code: string
        }
        Update: {
          course_id?: string
          observed_at?: string
          season?: Database["public"]["Enums"]["term_season"] | null
          section_count?: number
          term_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_course_term_offerings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "catalog_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_course_term_offerings_term_code_fkey"
            columns: ["term_code"]
            isOneToOne: false
            referencedRelation: "catalog_terms"
            referencedColumns: ["code"]
          },
        ]
      }
      catalog_courses: {
        Row: {
          career: Database["public"]["Enums"]["academic_career"] | null
          catalog_number: string
          code: string | null
          college_code: string | null
          credits_max: number | null
          credits_min: number | null
          description: string | null
          id: string
          last_seen_term: string | null
          prereq_parse_status: Database["public"]["Enums"]["prereq_parse_status"]
          prereq_parsed_at: string | null
          prereq_text: string | null
          source: Database["public"]["Enums"]["ingest_source"] | null
          subject_code: string
          tigercenter_course_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          career?: Database["public"]["Enums"]["academic_career"] | null
          catalog_number: string
          code?: string | null
          college_code?: string | null
          credits_max?: number | null
          credits_min?: number | null
          description?: string | null
          id?: string
          last_seen_term?: string | null
          prereq_parse_status?: Database["public"]["Enums"]["prereq_parse_status"]
          prereq_parsed_at?: string | null
          prereq_text?: string | null
          source?: Database["public"]["Enums"]["ingest_source"] | null
          subject_code: string
          tigercenter_course_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          career?: Database["public"]["Enums"]["academic_career"] | null
          catalog_number?: string
          code?: string | null
          college_code?: string | null
          credits_max?: number | null
          credits_min?: number | null
          description?: string | null
          id?: string
          last_seen_term?: string | null
          prereq_parse_status?: Database["public"]["Enums"]["prereq_parse_status"]
          prereq_parsed_at?: string | null
          prereq_text?: string | null
          source?: Database["public"]["Enums"]["ingest_source"] | null
          subject_code?: string
          tigercenter_course_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_courses_college_code_fkey"
            columns: ["college_code"]
            isOneToOne: false
            referencedRelation: "catalog_colleges"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "catalog_courses_last_seen_term_fkey"
            columns: ["last_seen_term"]
            isOneToOne: false
            referencedRelation: "catalog_terms"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "catalog_courses_subject_code_fkey"
            columns: ["subject_code"]
            isOneToOne: false
            referencedRelation: "catalog_subjects"
            referencedColumns: ["code"]
          },
        ]
      }
      catalog_programs: {
        Row: {
          catalog_year: string
          code: string | null
          college_code: string | null
          degree: string | null
          id: string
          name: string
          slug: string | null
          source: Database["public"]["Enums"]["ingest_source"] | null
          total_credits: number | null
          type: Database["public"]["Enums"]["program_type"]
          updated_at: string
        }
        Insert: {
          catalog_year: string
          code?: string | null
          college_code?: string | null
          degree?: string | null
          id?: string
          name: string
          slug?: string | null
          source?: Database["public"]["Enums"]["ingest_source"] | null
          total_credits?: number | null
          type: Database["public"]["Enums"]["program_type"]
          updated_at?: string
        }
        Update: {
          catalog_year?: string
          code?: string | null
          college_code?: string | null
          degree?: string | null
          id?: string
          name?: string
          slug?: string | null
          source?: Database["public"]["Enums"]["ingest_source"] | null
          total_credits?: number | null
          type?: Database["public"]["Enums"]["program_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_programs_college_code_fkey"
            columns: ["college_code"]
            isOneToOne: false
            referencedRelation: "catalog_colleges"
            referencedColumns: ["code"]
          },
        ]
      }
      catalog_requirement_groups: {
        Row: {
          credits: number | null
          id: string
          program_id: string
          select_count: number | null
          sort_order: number
          title: string | null
        }
        Insert: {
          credits?: number | null
          id?: string
          program_id: string
          select_count?: number | null
          sort_order?: number
          title?: string | null
        }
        Update: {
          credits?: number | null
          id?: string
          program_id?: string
          select_count?: number | null
          sort_order?: number
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_requirement_groups_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "catalog_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_requirement_slots: {
        Row: {
          category_hint: string | null
          course_id: string | null
          credits: number | null
          group_id: string | null
          id: string
          kind: Database["public"]["Enums"]["block_kind"]
          label: string | null
          notes: string | null
          program_id: string
          required_attribute_id: string | null
          season: Database["public"]["Enums"]["term_season"] | null
          sort_order: number
          year_number: number
        }
        Insert: {
          category_hint?: string | null
          course_id?: string | null
          credits?: number | null
          group_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["block_kind"]
          label?: string | null
          notes?: string | null
          program_id: string
          required_attribute_id?: string | null
          season?: Database["public"]["Enums"]["term_season"] | null
          sort_order?: number
          year_number: number
        }
        Update: {
          category_hint?: string | null
          course_id?: string | null
          credits?: number | null
          group_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["block_kind"]
          label?: string | null
          notes?: string | null
          program_id?: string
          required_attribute_id?: string | null
          season?: Database["public"]["Enums"]["term_season"] | null
          sort_order?: number
          year_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_requirement_slots_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "catalog_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_requirement_slots_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "catalog_requirement_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_requirement_slots_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "catalog_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_requirement_slots_required_attribute_id_fkey"
            columns: ["required_attribute_id"]
            isOneToOne: false
            referencedRelation: "catalog_attributes"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_subjects: {
        Row: {
          code: string
          college_code: string | null
          name: string
        }
        Insert: {
          code: string
          college_code?: string | null
          name: string
        }
        Update: {
          code?: string
          college_code?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_subjects_college_code_fkey"
            columns: ["college_code"]
            isOneToOne: false
            referencedRelation: "catalog_colleges"
            referencedColumns: ["code"]
          },
        ]
      }
      catalog_terms: {
        Row: {
          academic_year: string | null
          code: string
          description: string
          ends_on: string | null
          ingested_at: string
          is_active: boolean
          season: Database["public"]["Enums"]["term_season"] | null
          starts_on: string | null
        }
        Insert: {
          academic_year?: string | null
          code: string
          description: string
          ends_on?: string | null
          ingested_at?: string
          is_active?: boolean
          season?: Database["public"]["Enums"]["term_season"] | null
          starts_on?: string | null
        }
        Update: {
          academic_year?: string | null
          code?: string
          description?: string
          ends_on?: string | null
          ingested_at?: string
          is_active?: boolean
          season?: Database["public"]["Enums"]["term_season"] | null
          starts_on?: string | null
        }
        Relationships: []
      }
      flowchart_blocks: {
        Row: {
          category_hint: string | null
          color_override: string | null
          course_id: string | null
          created_at: string
          credit_source: string | null
          credits_override: number | null
          flowchart_id: string
          id: string
          is_user_modified: boolean
          kind: Database["public"]["Enums"]["block_kind"]
          label: string | null
          notes: string | null
          required_attribute_id: string | null
          season: Database["public"]["Enums"]["term_season"]
          sort_order: number
          source_slot_id: string | null
          status: Database["public"]["Enums"]["block_status"]
          updated_at: string
          year_number: number
        }
        Insert: {
          category_hint?: string | null
          color_override?: string | null
          course_id?: string | null
          created_at?: string
          credit_source?: string | null
          credits_override?: number | null
          flowchart_id: string
          id?: string
          is_user_modified?: boolean
          kind: Database["public"]["Enums"]["block_kind"]
          label?: string | null
          notes?: string | null
          required_attribute_id?: string | null
          season: Database["public"]["Enums"]["term_season"]
          sort_order?: number
          source_slot_id?: string | null
          status?: Database["public"]["Enums"]["block_status"]
          updated_at?: string
          year_number: number
        }
        Update: {
          category_hint?: string | null
          color_override?: string | null
          course_id?: string | null
          created_at?: string
          credit_source?: string | null
          credits_override?: number | null
          flowchart_id?: string
          id?: string
          is_user_modified?: boolean
          kind?: Database["public"]["Enums"]["block_kind"]
          label?: string | null
          notes?: string | null
          required_attribute_id?: string | null
          season?: Database["public"]["Enums"]["term_season"]
          sort_order?: number
          source_slot_id?: string | null
          status?: Database["public"]["Enums"]["block_status"]
          updated_at?: string
          year_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "flowchart_blocks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "catalog_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flowchart_blocks_flowchart_id_fkey"
            columns: ["flowchart_id"]
            isOneToOne: false
            referencedRelation: "flowcharts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flowchart_blocks_required_attribute_id_fkey"
            columns: ["required_attribute_id"]
            isOneToOne: false
            referencedRelation: "catalog_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flowchart_blocks_source_slot_id_fkey"
            columns: ["source_slot_id"]
            isOneToOne: false
            referencedRelation: "catalog_requirement_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      flowchart_programs: {
        Row: {
          flowchart_id: string
          program_id: string
          role: Database["public"]["Enums"]["program_role"]
          sort_order: number
        }
        Insert: {
          flowchart_id: string
          program_id: string
          role: Database["public"]["Enums"]["program_role"]
          sort_order?: number
        }
        Update: {
          flowchart_id?: string
          program_id?: string
          role?: Database["public"]["Enums"]["program_role"]
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "flowchart_programs_flowchart_id_fkey"
            columns: ["flowchart_id"]
            isOneToOne: false
            referencedRelation: "flowcharts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flowchart_programs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "catalog_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      flowcharts: {
        Row: {
          catalog_year: string | null
          created_at: string
          id: string
          is_archived: boolean
          name: string
          template_synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          catalog_year?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          name: string
          template_synced_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          catalog_year?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          name?: string
          template_synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ingest_documents: {
        Row: {
          content_hash: string
          endpoint: string
          fetched_at: string
          id: string
          payload: Json
          request_params: Json
          run_id: string
          source: Database["public"]["Enums"]["ingest_source"]
        }
        Insert: {
          content_hash: string
          endpoint: string
          fetched_at?: string
          id?: string
          payload: Json
          request_params?: Json
          run_id: string
          source: Database["public"]["Enums"]["ingest_source"]
        }
        Update: {
          content_hash?: string
          endpoint?: string
          fetched_at?: string
          id?: string
          payload?: Json
          request_params?: Json
          run_id?: string
          source?: Database["public"]["Enums"]["ingest_source"]
        }
        Relationships: [
          {
            foreignKeyName: "ingest_documents_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ingest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          source: Database["public"]["Enums"]["ingest_source"]
          started_at: string
          stats: Json
          status: Database["public"]["Enums"]["ingest_status"]
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          source: Database["public"]["Enums"]["ingest_source"]
          started_at?: string
          stats?: Json
          status?: Database["public"]["Enums"]["ingest_status"]
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          source?: Database["public"]["Enums"]["ingest_source"]
          started_at?: string
          stats?: Json
          status?: Database["public"]["Enums"]["ingest_status"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          primary_program_id: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          primary_program_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          primary_program_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_primary_program_id_fkey"
            columns: ["primary_program_id"]
            isOneToOne: false
            referencedRelation: "catalog_programs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      academic_career: "UGRD" | "GRAD"
      availability_source:
        | "catalog_text"
        | "observed"
        | "plan_of_study"
        | "manual"
      block_kind: "course" | "placeholder" | "coop" | "custom"
      block_status:
        | "planned"
        | "in_progress"
        | "completed"
        | "transferred"
        | "waived"
      ingest_source: "programs_api" | "tigercenter"
      ingest_status: "running" | "succeeded" | "failed"
      prereq_node_type: "group" | "course" | "unparsed"
      prereq_parse_status: "unparsed" | "parsed" | "partial" | "failed" | "none"
      program_role: "primary" | "secondary" | "minor" | "immersion" | "option"
      program_type:
        | "major"
        | "minor"
        | "immersion"
        | "option"
        | "concentration"
        | "combined"
      term_season: "fall" | "spring" | "summer" | "intersession"
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
      academic_career: ["UGRD", "GRAD"],
      availability_source: [
        "catalog_text",
        "observed",
        "plan_of_study",
        "manual",
      ],
      block_kind: ["course", "placeholder", "coop", "custom"],
      block_status: [
        "planned",
        "in_progress",
        "completed",
        "transferred",
        "waived",
      ],
      ingest_source: ["programs_api", "tigercenter"],
      ingest_status: ["running", "succeeded", "failed"],
      prereq_node_type: ["group", "course", "unparsed"],
      prereq_parse_status: ["unparsed", "parsed", "partial", "failed", "none"],
      program_role: ["primary", "secondary", "minor", "immersion", "option"],
      program_type: [
        "major",
        "minor",
        "immersion",
        "option",
        "concentration",
        "combined",
      ],
      term_season: ["fall", "spring", "summer", "intersession"],
    },
  },
} as const
