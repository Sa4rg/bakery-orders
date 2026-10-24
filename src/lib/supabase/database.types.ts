
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
                },"order_events": {
                  Row: {
                    "actor_user_id": string | null,"event_type": string,"id": string,"metadata": NonNullable<Json>,"new_value": Json | null,"occurred_at": string,"order_id": string,"order_item_id": string | null,"previous_value": Json | null,"reason": string | null
                  }
                  Insert: {
                    "actor_user_id"?: string | null,"event_type": string,"id"?: string,"metadata": NonNullable<Json>,"new_value"?: Json | null,"occurred_at"?: string,"order_id": string,"order_item_id"?: string | null,"previous_value"?: Json | null,"reason"?: string | null
                  }
                  Update: {
                    "actor_user_id"?: string | null,"event_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"new_value"?: Json | null,"occurred_at"?: string,"order_id"?: string,"order_item_id"?: string | null,"previous_value"?: Json | null,"reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_events_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_events_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "created_at": string,"id": string,"order_id": string,"prepared_quantity": number,"product_id": string,"product_name_snapshot": string,"quantity_step_snapshot": number,"requested_quantity": number,"unavailable_quantity": number,"unit_code_snapshot": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"order_id": string,"prepared_quantity"?: number,"product_id": string,"product_name_snapshot": string,"quantity_step_snapshot": number,"requested_quantity": number,"unavailable_quantity"?: number,"unit_code_snapshot": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"order_id"?: string,"prepared_quantity"?: number,"product_id"?: string,"product_name_snapshot"?: string,"quantity_step_snapshot"?: number,"requested_quantity"?: number,"unavailable_quantity"?: number,"unit_code_snapshot"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "business_id": string,"cancellation_reason": string | null,"cancelled_at": string | null,"cancelled_by_user_id": string | null,"created_at": string,"created_by_user_id": string,"customer_notes": string | null,"delivered_at": string | null,"delivered_by_user_id": string | null,"delivery_address_snapshot": string | null,"dispatched_at": string | null,"dispatched_by_user_id": string | null,"id": string,"idempotency_key": string,"order_number": number,"ready_at": string | null,"ready_by_user_id": string | null,"requested_delivery_at": string,"started_at": string | null,"started_by_user_id": string | null,"status": Database["public"]['Enums']["order_status"],"updated_at": string
                  }
                  Insert: {
                    "business_id": string,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by_user_id"?: string | null,"created_at"?: string,"created_by_user_id": string,"customer_notes"?: string | null,"delivered_at"?: string | null,"delivered_by_user_id"?: string | null,"delivery_address_snapshot"?: string | null,"dispatched_at"?: string | null,"dispatched_by_user_id"?: string | null,"id"?: string,"idempotency_key": string,"order_number"?: number,"ready_at"?: string | null,"ready_by_user_id"?: string | null,"requested_delivery_at": string,"started_at"?: string | null,"started_by_user_id"?: string | null,"status": Database["public"]['Enums']["order_status"],"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by_user_id"?: string | null,"created_at"?: string,"created_by_user_id"?: string,"customer_notes"?: string | null,"delivered_at"?: string | null,"delivered_by_user_id"?: string | null,"delivery_address_snapshot"?: string | null,"dispatched_at"?: string | null,"dispatched_by_user_id"?: string | null,"id"?: string,"idempotency_key"?: string,"order_number"?: number,"ready_at"?: string | null,"ready_by_user_id"?: string | null,"requested_delivery_at"?: string,"started_at"?: string | null,"started_by_user_id"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_cancelled_by_user_id_fkey"
      columns: ["cancelled_by_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_created_by_user_id_fkey"
      columns: ["created_by_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_delivered_by_user_id_fkey"
      columns: ["delivered_by_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_dispatched_by_user_id_fkey"
      columns: ["dispatched_by_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_ready_by_user_id_fkey"
      columns: ["ready_by_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_started_by_user_id_fkey"
      columns: ["started_by_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
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
            "cancel_customer_order":
{ Args: { "p_order_id": string,"p_reason": string }; Returns: undefined
                           },
"create_order":
{ Args: { "p_business_id": string,"p_customer_notes": string,"p_idempotency_key": string,"p_items": Json,"p_requested_delivery_at": string }; Returns: string
                           },
"get_kitchen_order_business_names":
{ Args: { "p_business_ids": (string)[] }; Returns: {
              "id": string,"name": string
            }[]
                           },
"set_product_availability":
{ Args: { "p_available": boolean,"p_product_id": string }; Returns: boolean
                           },
"start_order":
{ Args: { "p_order_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "app_role": "CUSTOMER"|"KITCHEN"|"MANAGER","order_status": "RECEIVED"|"IN_PROGRESS"|"READY"|"DISPATCHED"|"DELIVERED"|"CANCELLED"
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
            "app_role": ["CUSTOMER", "KITCHEN", "MANAGER"],"order_status": ["RECEIVED", "IN_PROGRESS", "READY", "DISPATCHED", "DELIVERED", "CANCELLED"]
          }
        }
} as const
