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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activity: {
        Row: {
          actor_id: string
          created_at: string
          group_id: string
          id: string
          kind: string
          rating: number | null
          title_id: number | null
          watchlist_id: string | null
        }
        Insert: {
          actor_id: string
          created_at?: string
          group_id: string
          id?: string
          kind: string
          rating?: number | null
          title_id?: number | null
          watchlist_id?: string | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          group_id?: string
          id?: string
          kind?: string
          rating?: number | null
          title_id?: number | null
          watchlist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_notes: {
        Row: {
          body: string
          entry_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          entry_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          entry_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_notes_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "log_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favourites: {
        Row: {
          position: number
          title_id: number
          user_id: string
        }
        Insert: {
          position?: number
          title_id: number
          user_id: string
        }
        Update: {
          position?: number
          title_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favourites_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favourites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followee_id_fkey"
            columns: ["followee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      log_entries: {
        Row: {
          created_at: string
          id: string
          rating: number | null
          season_number: number | null
          title_id: number
          user_id: string
          watched_on: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          rating?: number | null
          season_number?: number | null
          title_id: number
          user_id: string
          watched_on?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          rating?: number | null
          season_number?: number | null
          title_id?: number
          user_id?: string
          watched_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "log_entries_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          country: string
          created_at: string
          id: string
          language: string
          theme: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          country?: string
          created_at?: string
          id: string
          language?: string
          theme?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          country?: string
          created_at?: string
          id?: string
          language?: string
          theme?: string
          username?: string
        }
        Relationships: []
      }
      swipe_candidates: {
        Row: {
          position: number
          session_id: string
          title_id: number
        }
        Insert: {
          position: number
          session_id: string
          title_id: number
        }
        Update: {
          position?: number
          session_id?: string
          title_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "swipe_candidates_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "swipe_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipe_candidates_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      swipe_participants: {
        Row: {
          joined_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          session_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swipe_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "swipe_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipe_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      swipe_sessions: {
        Row: {
          created_at: string
          created_by: string
          decided_at: string | null
          decided_title_id: number | null
          filters: Json
          group_id: string | null
          id: string
          status: string
          watchlist_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          decided_at?: string | null
          decided_title_id?: number | null
          filters?: Json
          group_id?: string | null
          id?: string
          status?: string
          watchlist_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          decided_at?: string | null
          decided_title_id?: number | null
          filters?: Json
          group_id?: string | null
          id?: string
          status?: string
          watchlist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "swipe_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipe_sessions_decided_title_id_fkey"
            columns: ["decided_title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipe_sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipe_sessions_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      swipes: {
        Row: {
          created_at: string
          liked: boolean
          session_id: string
          title_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          liked: boolean
          session_id: string
          title_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          liked?: boolean
          session_id?: string
          title_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swipes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "swipe_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipes_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      title_certifications: {
        Row: {
          certification: string
          country: string
          title_id: number
        }
        Insert: {
          certification: string
          country: string
          title_id: number
        }
        Update: {
          certification?: string
          country?: string
          title_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "title_certifications_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      title_providers: {
        Row: {
          country: string
          fetched_at: string
          logo_path: string | null
          offer_type: string
          provider_id: number
          provider_name: string
          title_id: number
        }
        Insert: {
          country: string
          fetched_at?: string
          logo_path?: string | null
          offer_type: string
          provider_id: number
          provider_name: string
          title_id: number
        }
        Update: {
          country?: string
          fetched_at?: string
          logo_path?: string | null
          offer_type?: string
          provider_id?: number
          provider_name?: string
          title_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "title_providers_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      title_translations: {
        Row: {
          fetched_at: string
          language: string
          name: string
          overview: string | null
          title_id: number
        }
        Insert: {
          fetched_at?: string
          language: string
          name: string
          overview?: string | null
          title_id: number
        }
        Update: {
          fetched_at?: string
          language?: string
          name?: string
          overview?: string | null
          title_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "title_translations_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      titles: {
        Row: {
          backdrop_path: string | null
          director: string | null
          fetched_at: string
          genres: string[]
          id: number
          imdb_id: string | null
          media_type: string
          poster_path: string | null
          runtime_minutes: number | null
          seasons: number | null
          tmdb_id: number
          trailer_key: string | null
          year: number | null
        }
        Insert: {
          backdrop_path?: string | null
          director?: string | null
          fetched_at?: string
          genres?: string[]
          id?: never
          imdb_id?: string | null
          media_type: string
          poster_path?: string | null
          runtime_minutes?: number | null
          seasons?: number | null
          tmdb_id: number
          trailer_key?: string | null
          year?: number | null
        }
        Update: {
          backdrop_path?: string | null
          director?: string | null
          fetched_at?: string
          genres?: string[]
          id?: never
          imdb_id?: string | null
          media_type?: string
          poster_path?: string | null
          runtime_minutes?: number | null
          seasons?: number | null
          tmdb_id?: number
          trailer_key?: string | null
          year?: number | null
        }
        Relationships: []
      }
      watchlist_items: {
        Row: {
          added_at: string
          added_by: string | null
          title_id: number
          watchlist_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          title_id: number
          watchlist_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          title_id?: number
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_items_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_items_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_items_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_members: {
        Row: {
          role: string
          user_id: string
          watchlist_id: string
        }
        Insert: {
          role?: string
          user_id: string
          watchlist_id: string
        }
        Update: {
          role?: string
          user_id?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_members_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          created_at: string
          description: string | null
          group_id: string | null
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlists_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlists_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_watchlist: { Args: { wid: string }; Returns: boolean }
      can_read_watchlist: { Args: { wid: string }; Returns: boolean }
      is_group_admin: { Args: { gid: string }; Returns: boolean }
      is_group_member: { Args: { gid: string }; Returns: boolean }
      is_session_participant: { Args: { sid: string }; Returns: boolean }
      purge_stale_tmdb_cache: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
