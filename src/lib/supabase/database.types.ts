
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "public": {
          Tables: {
            "business_memberships": {
                  Row: {
                    "active": boolean,"business_id": string,"created_at": string,"id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "active"?: boolean,"business_id": string,"created_at"?: string,"id"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active"?: boolean,"business_id"?: string,"created_at"?: string,"id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_memberships_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "business_memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"businesses": {
                  Row: {
                    "active": boolean,"contact_name": string | null,"contact_phone": string | null,"created_at": string,"delivery_address": string | null,"id": string,"name": string,"notes": string | null,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"contact_name"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"delivery_address"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"contact_name"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"delivery_address"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"categories": {
                  Row: {
                    "active": boolean,"created_at": string,"description": string | null,"display_order": number,"id": string,"name": string,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"description"?: string | null,"display_order"?: number,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"description"?: string | null,"display_order"?: number,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"products": {
                  Row: {
                    "active": boolean,"availability_updated_at": string | null,"availability_updated_by": string | null,"available": boolean,"category_id": string,"created_at": string,"description": string | null,"id": string,"image_path": string | null,"name": string,"quantity_step": number,"unit_code": string,"updated_at": string
                  }
                  Insert: {
                    "active": boolean,"availability_updated_at"?: string | null,"availability_updated_by"?: string | null,"available": boolean,"category_id": string,"created_at"?: string,"description"?: string | null,"id"?: string,"image_path"?: string | null,"name": string,"quantity_step": number,"unit_code": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"availability_updated_at"?: string | null,"availability_updated_by"?: string | null,"available"?: boolean,"category_id"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"image_path"?: string | null,"name"?: string,"quantity_step"?: number,"unit_code"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_availability_updated_by_fkey"
      columns: ["availability_updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active": boolean,"created_at": string,"display_name": string,"id": string,"role": Database["public"]['Enums']["app_role"],"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"display_name": string,"id": string,"role": Database["public"]['Enums']["app_role"],"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"display_name"?: string,"id"?: string,"role"?: Database["public"]['Enums']["app_role"],"updated_at"?: string
                  }
                  Relationships: [

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
            "app_role": "CUSTOMER"|"KITCHEN"|"MANAGER"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "app_role": ["CUSTOMER", "KITCHEN", "MANAGER"]
          }
        }
} as const
