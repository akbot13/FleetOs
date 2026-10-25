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
      bookings: {
        Row: {
          amount_collected: number | null
          created_at: string | null
          customer_name: string | null
          customer_phone: string | null
          dispatched_at: string | null
          driver_confirmed_at: string | null
          driver_id: number | null
          driver_stay_required: boolean | null
          drop: string | null
          estimated_hours: number | null
          fare: number | null
          id: number
          notes: string | null
          number_of_days: number | null
          odometer_end_at: string | null
          odometer_end_reading: number | null
          odometer_end_url: string | null
          odometer_start_at: string | null
          odometer_start_reading: number | null
          odometer_start_url: string | null
          org_id: string
          payment_confirmed_at: string | null
          payment_method: string | null
          pickup: string | null
          return_date: string | null
          scheduled_at: string | null
          status: string | null
          stops: string | null
          tracking_token: string
          trip_completed_at: string | null
          trip_started_at: string | null
          trip_type: string | null
        }
        Insert: {
          amount_collected?: number | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          dispatched_at?: string | null
          driver_confirmed_at?: string | null
          driver_id?: number | null
          driver_stay_required?: boolean | null
          drop?: string | null
          estimated_hours?: number | null
          fare?: number | null
          id?: number
          notes?: string | null
          number_of_days?: number | null
          odometer_end_at?: string | null
          odometer_end_reading?: number | null
          odometer_end_url?: string | null
          odometer_start_at?: string | null
          odometer_start_reading?: number | null
          odometer_start_url?: string | null
          org_id: string
          payment_confirmed_at?: string | null
          payment_method?: string | null
          pickup?: string | null
          return_date?: string | null
          scheduled_at?: string | null
          status?: string | null
          stops?: string | null
          tracking_token?: string
          trip_completed_at?: string | null
          trip_started_at?: string | null
          trip_type?: string | null
        }
        Update: {
          amount_collected?: number | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          dispatched_at?: string | null
          driver_confirmed_at?: string | null
          driver_id?: number | null
          driver_stay_required?: boolean | null
          drop?: string | null
          estimated_hours?: number | null
          fare?: number | null
          id?: number
          notes?: string | null
          number_of_days?: number | null
          odometer_end_at?: string | null
          odometer_end_reading?: number | null
          odometer_end_url?: string | null
          odometer_start_at?: string | null
          odometer_start_reading?: number | null
          odometer_start_url?: string | null
          org_id?: string
          payment_confirmed_at?: string | null
          payment_method?: string | null
          pickup?: string | null
          return_date?: string | null
          scheduled_at?: string | null
          status?: string | null
          stops?: string | null
          tracking_token?: string
          trip_completed_at?: string | null
          trip_started_at?: string | null
          trip_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      "bookings table": {
        Row: {
          amount_collected: number | null
          country_code: string | null
          created_at: string | null
          customer_name: string | null
          customer_phone: string | null
          driver_id: number | null
          driver_stay_required: boolean | null
          drop: string | null
          estimated_hours: number | null
          fare: number | null
          id: number
          notes: string | null
          number_of_days: number | null
          payment_confirmed_at: string | null
          payment_method: string | null
          pickup: string | null
          return_date: string | null
          scheduled_at: string
          source: string | null
          status: string | null
          stops: string | null
          trip_type: string | null
        }
        Insert: {
          amount_collected?: number | null
          country_code?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          driver_id?: number | null
          driver_stay_required?: boolean | null
          drop?: string | null
          estimated_hours?: number | null
          fare?: number | null
          id?: never
          notes?: string | null
          number_of_days?: number | null
          payment_confirmed_at?: string | null
          payment_method?: string | null
          pickup?: string | null
          return_date?: string | null
          scheduled_at?: string
          source?: string | null
          status?: string | null
          stops?: string | null
          trip_type?: string | null
        }
        Update: {
          amount_collected?: number | null
          country_code?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          driver_id?: number | null
          driver_stay_required?: boolean | null
          drop?: string | null
          estimated_hours?: number | null
          fare?: number | null
          id?: never
          notes?: string | null
          number_of_days?: number | null
          payment_confirmed_at?: string | null
          payment_method?: string | null
          pickup?: string | null
          return_date?: string | null
          scheduled_at?: string
          source?: string | null
          status?: string | null
          stops?: string | null
          trip_type?: string | null
        }
        Relationships: []
      }
      call_recordings: {
        Row: {
          called_at: string
          customer_phone: string | null
          driver_id: number | null
          duration_seconds: number | null
          id: number
          recording_url: string | null
          trip_id: number | null
        }
        Insert: {
          called_at?: string
          customer_phone?: string | null
          driver_id?: number | null
          duration_seconds?: number | null
          id?: number
          recording_url?: string | null
          trip_id?: number | null
        }
        Update: {
          called_at?: string
          customer_phone?: string | null
          driver_id?: number | null
          duration_seconds?: number | null
          id?: number
          recording_url?: string | null
          trip_id?: number | null
        }
        Relationships: []
      }
      cash_handovers: {
        Row: {
          admin_approved: boolean | null
          admin_notes: string | null
          amount: number
          date: string | null
          driver_id: number | null
          handed_over_at: string | null
          id: number
          note: string | null
        }
        Insert: {
          admin_approved?: boolean | null
          admin_notes?: string | null
          amount: number
          date?: string | null
          driver_id?: number | null
          handed_over_at?: string | null
          id?: never
          note?: string | null
        }
        Update: {
          admin_approved?: boolean | null
          admin_notes?: string | null
          amount?: number
          date?: string | null
          driver_id?: number | null
          handed_over_at?: string | null
          id?: never
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_handovers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "Drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_handovers_v2: {
        Row: {
          admin_approved: boolean | null
          admin_notes: string | null
          amount: number
          driver_id: number
          handed_over_at: string | null
          id: number
          org_id: string
        }
        Insert: {
          admin_approved?: boolean | null
          admin_notes?: string | null
          amount: number
          driver_id: number
          handed_over_at?: string | null
          id?: number
          org_id: string
        }
        Update: {
          admin_approved?: boolean | null
          admin_notes?: string | null
          amount?: number
          driver_id?: number
          handed_over_at?: string | null
          id?: number
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_handovers_v2_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_handovers_v2_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_handovers_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_cash_entries: {
        Row: {
          amount: number
          booking_id: number | null
          category: string | null
          created_at: string
          driver_id: number
          id: number
          kind: string
          label: string | null
          method: string | null
          note: string | null
          org_id: string
        }
        Insert: {
          amount: number
          booking_id?: number | null
          category?: string | null
          created_at?: string
          driver_id: number
          id?: number
          kind: string
          label?: string | null
          method?: string | null
          note?: string | null
          org_id: string
        }
        Update: {
          amount?: number
          booking_id?: number | null
          category?: string | null
          created_at?: string
          driver_id?: number
          id?: number
          kind?: string
          label?: string | null
          method?: string | null
          note?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_cash_entries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_cash_entries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_cash_entries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_cash_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_pins: {
        Row: {
          driver_id: number
          failed_attempts: number
          locked_until: string | null
          pin_hash: string
          updated_at: string
        }
        Insert: {
          driver_id: number
          failed_attempts?: number
          locked_until?: string | null
          pin_hash: string
          updated_at?: string
        }
        Update: {
          driver_id?: number
          failed_attempts?: number
          locked_until?: string | null
          pin_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_pins_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_pins_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          id: number
          is_temporary: boolean | null
          location_lat: number | null
          location_lng: number | null
          odometer_end_photo: string | null
          odometer_start_photo: string | null
          name: string | null
          odometer_required: boolean | null
          org_id: string
          phone: string | null
          plate_number: string | null
          status: string | null
          vehicle_model: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          id?: number
          is_temporary?: boolean | null
          location_lat?: number | null
          location_lng?: number | null
          odometer_end_photo?: string | null
          odometer_start_photo?: string | null
          name?: string | null
          odometer_required?: boolean | null
          org_id: string
          phone?: string | null
          plate_number?: string | null
          status?: string | null
          vehicle_model?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          id?: number
          is_temporary?: boolean | null
          location_lat?: number | null
          location_lng?: number | null
          odometer_end_photo?: string | null
          odometer_start_photo?: string | null
          name?: string | null
          odometer_required?: boolean | null
          org_id?: string
          phone?: string | null
          plate_number?: string | null
          status?: string | null
          vehicle_model?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      Drivers: {
        Row: {
          aggregator: string | null
          auth_user_id: string | null
          created_at: string
          id: number
          is_temporary: boolean | null
          location_lat: number | null
          location_lng: number | null
          name: string | null
          odometer_end_photo: string | null
          odometer_start_photo: string | null
          phone: string | null
          plate_number: string | null
          status: string | null
          vehicle_model: string | null
        }
        Insert: {
          aggregator?: string | null
          auth_user_id?: string | null
          created_at?: string
          id?: number
          is_temporary?: boolean | null
          location_lat?: number | null
          location_lng?: number | null
          name?: string | null
          odometer_end_photo?: string | null
          odometer_start_photo?: string | null
          phone?: string | null
          plate_number?: string | null
          status?: string | null
          vehicle_model?: string | null
        }
        Update: {
          aggregator?: string | null
          auth_user_id?: string | null
          created_at?: string
          id?: number
          is_temporary?: boolean | null
          location_lat?: number | null
          location_lng?: number | null
          name?: string | null
          odometer_end_photo?: string | null
          odometer_start_photo?: string | null
          phone?: string | null
          plate_number?: string | null
          status?: string | null
          vehicle_model?: string | null
        }
        Relationships: []
      }
      fixed_routes: {
        Row: {
          destination: string | null
          fixed_fare: number | null
          id: number
          origin: string | null
          per_km_rate: number | null
        }
        Insert: {
          destination?: string | null
          fixed_fare?: number | null
          id?: number
          origin?: string | null
          per_km_rate?: number | null
        }
        Update: {
          destination?: string | null
          fixed_fare?: number | null
          id?: number
          origin?: string | null
          per_km_rate?: number | null
        }
        Relationships: []
      }
      fixed_routes_v2: {
        Row: {
          destination: string | null
          fixed_fare: number | null
          id: number
          org_id: string
          origin: string | null
          per_km_rate: number | null
        }
        Insert: {
          destination?: string | null
          fixed_fare?: number | null
          id?: number
          org_id: string
          origin?: string | null
          per_km_rate?: number | null
        }
        Update: {
          destination?: string | null
          fixed_fare?: number | null
          id?: number
          org_id?: string
          origin?: string | null
          per_km_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_routes_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          country_code: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          id: number
          query: string | null
          status: string | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: number
          query?: string | null
          status?: string | null
        }
        Update: {
          country_code?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: number
          query?: string | null
          status?: string | null
        }
        Relationships: []
      }
      messages_log: {
        Row: {
          confidence: number | null
          created_at: string
          customer_phone: string | null
          escalated: boolean | null
          id: number
          intent: string | null
          message_in: string | null
          message_out: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          customer_phone?: string | null
          escalated?: boolean | null
          id?: number
          intent?: string | null
          message_in?: string | null
          message_out?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          customer_phone?: string | null
          escalated?: boolean | null
          id?: number
          intent?: string | null
          message_in?: string | null
          message_out?: string | null
        }
        Relationships: []
      }
      org_pricing: {
        Row: {
          airport_flat_fare: number | null
          city_per_km: number | null
          driver_stay_per_night: number | null
          id: number
          night_surcharge_pct: number | null
          org_id: string
          outstation_per_km: number | null
          sedan_multiplier: number | null
          sightseeing_per_hour: number | null
          suv_multiplier: number | null
          updated_at: string | null
          waiting_per_hour: number | null
        }
        Insert: {
          airport_flat_fare?: number | null
          city_per_km?: number | null
          driver_stay_per_night?: number | null
          id?: number
          night_surcharge_pct?: number | null
          org_id: string
          outstation_per_km?: number | null
          sedan_multiplier?: number | null
          sightseeing_per_hour?: number | null
          suv_multiplier?: number | null
          updated_at?: string | null
          waiting_per_hour?: number | null
        }
        Update: {
          airport_flat_fare?: number | null
          city_per_km?: number | null
          driver_stay_per_night?: number | null
          id?: number
          night_surcharge_pct?: number | null
          org_id?: string
          outstation_per_km?: number | null
          sedan_multiplier?: number | null
          sightseeing_per_hour?: number | null
          suv_multiplier?: number | null
          updated_at?: string | null
          waiting_per_hour?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "org_pricing_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          admin_user_id: string | null
          brand_color: string | null
          brand_logo_url: string | null
          brand_name: string
          created_at: string | null
          custom_domain: string | null
          google_drive_connected: boolean | null
          google_drive_token: Json | null
          google_review_url: string | null
          id: string
          join_code: string
          name: string
          report_frequency_days: number | null
          slug: string
          upi_id: string | null
          upi_qr_url: string | null
          whatsapp_api_key: string | null
        }
        Insert: {
          admin_user_id?: string | null
          brand_color?: string | null
          brand_logo_url?: string | null
          brand_name: string
          created_at?: string | null
          custom_domain?: string | null
          google_drive_connected?: boolean | null
          google_drive_token?: Json | null
          google_review_url?: string | null
          id?: string
          join_code: string
          name: string
          report_frequency_days?: number | null
          slug: string
          upi_id?: string | null
          upi_qr_url?: string | null
          whatsapp_api_key?: string | null
        }
        Update: {
          admin_user_id?: string | null
          brand_color?: string | null
          brand_logo_url?: string | null
          brand_name?: string
          created_at?: string | null
          custom_domain?: string | null
          google_drive_connected?: boolean | null
          google_drive_token?: Json | null
          google_review_url?: string | null
          id?: string
          join_code?: string
          name?: string
          report_frequency_days?: number | null
          slug?: string
          upi_id?: string | null
          upi_qr_url?: string | null
          whatsapp_api_key?: string | null
        }
        Relationships: []
      }
      reviews: {
        Row: {
          booking_id: number | null
          comment: string | null
          created_at: string
          customer_phone: string | null
          id: number
          rating: number | null
        }
        Insert: {
          booking_id?: number | null
          comment?: string | null
          created_at?: string
          customer_phone?: string | null
          id?: number
          rating?: number | null
        }
        Update: {
          booking_id?: number | null
          comment?: string | null
          created_at?: string
          customer_phone?: string | null
          id?: number
          rating?: number | null
        }
        Relationships: []
      }
      super_admin_users: {
        Row: {
          created_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      trips: {
        Row: {
          booking_id: number | null
          created_at: string
          driver_id: number | null
          drop_lat: number | null
          drop_lng: number | null
          end_time: string | null
          id: number
          start_time: string | null
        }
        Insert: {
          booking_id?: number | null
          created_at?: string
          driver_id?: number | null
          drop_lat?: number | null
          drop_lng?: number | null
          end_time?: string | null
          id?: number
          start_time?: string | null
        }
        Update: {
          booking_id?: number | null
          created_at?: string
          driver_id?: number | null
          drop_lat?: number | null
          drop_lng?: number | null
          end_time?: string | null
          id?: number
          start_time?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      drivers_public: {
        Row: {
          id: number | null
          name: string | null
          org_id: string | null
          status: string | null
          vehicle_model: string | null
        }
        Insert: {
          id?: number | null
          name?: string | null
          org_id?: string | null
          status?: string | null
          vehicle_model?: string | null
        }
        Update: {
          id?: number | null
          name?: string | null
          org_id?: string | null
          status?: string | null
          vehicle_model?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_customer_booking: {
        Args: { p_booking: Json; p_org_id: string }
        Returns: {
          booking_id: number
          booking_token: string
        }[]
      }
      driver_sign_in: {
        Args: { p_org_id: string; p_phone: string; p_pin: string }
        Returns: {
          driver: Json
          message: string
          ok: boolean
        }[]
      }
      drivers_with_pin: { Args: { p_org_id: string }; Returns: number[] }
      get_booking_status: {
        Args: { p_token: string }
        Returns: {
          driver_name: string
          driver_phone: string
          drop: string
          id: number
          pickup: string
          plate_number: string
          scheduled_at: string
          status: string
          vehicle_model: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_admin: { Args: { p_org: string }; Returns: boolean }
      my_driver_id: { Args: never; Returns: number }
      quote_fare: {
        Args: { p_booking: Json; p_org_id: string }
        Returns: number
      }
      register_driver: {
        Args: { p_name: string; p_org_id: string; p_phone: string }
        Returns: {
          message: string
          ok: boolean
        }[]
      }
      set_driver_pin: {
        Args: { p_driver_id: number; p_pin: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "driver"
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
      app_role: ["admin", "moderator", "user", "driver"],
    },
  },
} as const
