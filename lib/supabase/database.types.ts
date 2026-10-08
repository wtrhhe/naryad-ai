
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "acoustic_samples": {
                  Row: {
                    "created_at": string,"duration_seconds": number,"equipment_id": string,"id": string,"kind": Database["public"]['Enums']["acoustic_kind"],"peaks": NonNullable<Json>,"recorded_at": string,"recorded_by": string | null,"rms": number,"sample_rate": number,"spectral_kurtosis": number | null,"spectrum": NonNullable<Json>,"storage_path": string | null,"work_order_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"duration_seconds": number,"equipment_id": string,"id"?: string,"kind": Database["public"]['Enums']["acoustic_kind"],"peaks"?: NonNullable<Json>,"recorded_at"?: string,"recorded_by"?: string | null,"rms": number,"sample_rate": number,"spectral_kurtosis"?: number | null,"spectrum": NonNullable<Json>,"storage_path"?: string | null,"work_order_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"duration_seconds"?: number,"equipment_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["acoustic_kind"],"peaks"?: NonNullable<Json>,"recorded_at"?: string,"recorded_by"?: string | null,"rms"?: number,"sample_rate"?: number,"spectral_kurtosis"?: number | null,"spectrum"?: NonNullable<Json>,"storage_path"?: string | null,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "acoustic_samples_equipment_id_fkey"
      columns: ["equipment_id"]
isOneToOne: false
      referencedRelation: "equipment"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acoustic_samples_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acoustic_samples_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_reviews": {
                  Row: {
                    "checks": NonNullable<Json>,"confidence": number | null,"created_at": string,"id": string,"improvements": (string)[],"master_comment": string | null,"master_decided_at": string | null,"master_explanation": string | null,"master_id": string | null,"master_rating": number | null,"master_score": number | null,"master_verdict": Database["public"]['Enums']["review_verdict"] | null,"model": string | null,"needs_master_review": boolean,"rating": number | null,"revision": number,"score": number | null,"strengths": (string)[],"updated_at": string,"used_llm": boolean,"verdict": Database["public"]['Enums']["review_verdict"] | null,"work_order_id": string,"worker_explanation": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "checks"?: NonNullable<Json>,"confidence"?: number | null,"created_at"?: string,"id"?: string,"improvements"?: (string)[],"master_comment"?: string | null,"master_decided_at"?: string | null,"master_explanation"?: string | null,"master_id"?: string | null,"master_rating"?: number | null,"master_score"?: number | null,"master_verdict"?: Database["public"]['Enums']["review_verdict"] | null,"model"?: string | null,"needs_master_review"?: boolean,"rating"?: number | null,"revision"?: number,"score"?: number | null,"strengths"?: (string)[],"updated_at"?: string,"used_llm"?: boolean,"verdict"?: Database["public"]['Enums']["review_verdict"] | null,"work_order_id": string,"worker_explanation"?: string | null
                  }
                  Update: {
                    "checks"?: NonNullable<Json>,"confidence"?: number | null,"created_at"?: string,"id"?: string,"improvements"?: (string)[],"master_comment"?: string | null,"master_decided_at"?: string | null,"master_explanation"?: string | null,"master_id"?: string | null,"master_rating"?: number | null,"master_score"?: number | null,"master_verdict"?: Database["public"]['Enums']["review_verdict"] | null,"model"?: string | null,"needs_master_review"?: boolean,"rating"?: number | null,"revision"?: number,"score"?: number | null,"strengths"?: (string)[],"updated_at"?: string,"used_llm"?: boolean,"verdict"?: Database["public"]['Enums']["review_verdict"] | null,"work_order_id"?: string,"worker_explanation"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_reviews_master_id_fkey"
      columns: ["master_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_reviews_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_usage": {
                  Row: {
                    "cache_key": string | null,"cache_read_tokens": number,"cost_usd": number,"created_at": string,"duration_ms": number | null,"error": string | null,"feature": string,"id": string,"input_tokens": number,"model": string,"output_tokens": number,"provider": string,"success": boolean,"work_order_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cache_key"?: string | null,"cache_read_tokens"?: number,"cost_usd"?: number,"created_at"?: string,"duration_ms"?: number | null,"error"?: string | null,"feature": string,"id"?: string,"input_tokens"?: number,"model": string,"output_tokens"?: number,"provider": string,"success": boolean,"work_order_id"?: string | null
                  }
                  Update: {
                    "cache_key"?: string | null,"cache_read_tokens"?: number,"cost_usd"?: number,"created_at"?: string,"duration_ms"?: number | null,"error"?: string | null,"feature"?: string,"id"?: string,"input_tokens"?: number,"model"?: string,"output_tokens"?: number,"provider"?: string,"success"?: boolean,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_usage_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_auth_id": string | null,"id": number,"new_data": Json | null,"occurred_at": string,"old_data": Json | null,"record_id": string | null,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_auth_id"?: string | null,"id"?: never,"new_data"?: Json | null,"occurred_at"?: string,"old_data"?: Json | null,"record_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_auth_id"?: string | null,"id"?: never,"new_data"?: Json | null,"occurred_at"?: string,"old_data"?: Json | null,"record_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"brigades": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name": string,"site_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"site_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"site_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "brigades_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"employee_permits": {
                  Row: {
                    "certificate_number": string,"created_at": string,"employee_id": string,"expires_on": string,"id": string,"issued_on": string,"permit_type_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "certificate_number": string,"created_at"?: string,"employee_id": string,"expires_on": string,"id"?: string,"issued_on": string,"permit_type_id": string,"updated_at"?: string
                  }
                  Update: {
                    "certificate_number"?: string,"created_at"?: string,"employee_id"?: string,"expires_on"?: string,"id"?: string,"issued_on"?: string,"permit_type_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_permits_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employee_permits_permit_type_id_fkey"
      columns: ["permit_type_id"]
isOneToOne: false
      referencedRelation: "permit_types"
      referencedColumns: ["id"]
    }
                  ]
                },"employee_sites": {
                  Row: {
                    "employee_id": string,"site_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "employee_id": string,"site_id": string
                  }
                  Update: {
                    "employee_id"?: string,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_sites_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employee_sites_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"employees": {
                  Row: {
                    "auth_user_id": string | null,"brigade_id": string | null,"created_at": string,"crew": Database["public"]['Enums']["shift_crew"] | null,"full_name": string,"grade": number | null,"id": string,"is_active": boolean,"locale": string,"on_shift": boolean,"personnel_number": string,"role": Database["public"]['Enums']["app_role"],"specialty": Database["public"]['Enums']["specialty"] | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth_user_id"?: string | null,"brigade_id"?: string | null,"created_at"?: string,"crew"?: Database["public"]['Enums']["shift_crew"] | null,"full_name": string,"grade"?: number | null,"id"?: string,"is_active"?: boolean,"locale"?: string,"on_shift"?: boolean,"personnel_number": string,"role": Database["public"]['Enums']["app_role"],"specialty"?: Database["public"]['Enums']["specialty"] | null,"updated_at"?: string
                  }
                  Update: {
                    "auth_user_id"?: string | null,"brigade_id"?: string | null,"created_at"?: string,"crew"?: Database["public"]['Enums']["shift_crew"] | null,"full_name"?: string,"grade"?: number | null,"id"?: string,"is_active"?: boolean,"locale"?: string,"on_shift"?: boolean,"personnel_number"?: string,"role"?: Database["public"]['Enums']["app_role"],"specialty"?: Database["public"]['Enums']["specialty"] | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employees_brigade_id_fkey"
      columns: ["brigade_id"]
isOneToOne: false
      referencedRelation: "brigades"
      referencedColumns: ["id"]
    }
                  ]
                },"equipment": {
                  Row: {
                    "bearing_ball_diameter_mm": number | null,"bearing_contact_angle_deg": number | null,"bearing_pitch_diameter_mm": number | null,"bearing_rolling_elements": number | null,"created_at": string,"criticality": number,"downtime_cost_per_hour": number,"equipment_type": Database["public"]['Enums']["equipment_type"],"id": string,"inventory_number": string,"is_active": boolean,"name": string,"qr_token": string,"requires_lockout": boolean,"rpm": number | null,"site_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bearing_ball_diameter_mm"?: number | null,"bearing_contact_angle_deg"?: number | null,"bearing_pitch_diameter_mm"?: number | null,"bearing_rolling_elements"?: number | null,"created_at"?: string,"criticality"?: number,"downtime_cost_per_hour"?: number,"equipment_type": Database["public"]['Enums']["equipment_type"],"id"?: string,"inventory_number": string,"is_active"?: boolean,"name": string,"qr_token"?: string,"requires_lockout"?: boolean,"rpm"?: number | null,"site_id": string,"updated_at"?: string
                  }
                  Update: {
                    "bearing_ball_diameter_mm"?: number | null,"bearing_contact_angle_deg"?: number | null,"bearing_pitch_diameter_mm"?: number | null,"bearing_rolling_elements"?: number | null,"created_at"?: string,"criticality"?: number,"downtime_cost_per_hour"?: number,"equipment_type"?: Database["public"]['Enums']["equipment_type"],"id"?: string,"inventory_number"?: string,"is_active"?: boolean,"name"?: string,"qr_token"?: string,"requires_lockout"?: boolean,"rpm"?: number | null,"site_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "equipment_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"equipment_permit_requirements": {
                  Row: {
                    "created_at": string,"equipment_type": Database["public"]['Enums']["equipment_type"] | null,"fault_category": Database["public"]['Enums']["fault_category"] | null,"id": string,"permit_type_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"equipment_type"?: Database["public"]['Enums']["equipment_type"] | null,"fault_category"?: Database["public"]['Enums']["fault_category"] | null,"id"?: string,"permit_type_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"equipment_type"?: Database["public"]['Enums']["equipment_type"] | null,"fault_category"?: Database["public"]['Enums']["fault_category"] | null,"id"?: string,"permit_type_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "equipment_permit_requirements_permit_type_id_fkey"
      columns: ["permit_type_id"]
isOneToOne: false
      referencedRelation: "permit_types"
      referencedColumns: ["id"]
    }
                  ]
                },"fault_codes": {
                  Row: {
                    "category": Database["public"]['Enums']["fault_category"],"code": string,"created_at": string,"description": string | null,"id": string,"is_active": boolean,"name": string,"required_specialty": Database["public"]['Enums']["specialty"],"standard_hours": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": Database["public"]['Enums']["fault_category"],"code": string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"required_specialty": Database["public"]['Enums']["specialty"],"standard_hours": number,"updated_at"?: string
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["fault_category"],"code"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"required_specialty"?: Database["public"]['Enums']["specialty"],"standard_hours"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"insights": {
                  Row: {
                    "created_at": string,"entity_id": string | null,"entity_type": string | null,"generated_by_llm": boolean,"id": string,"kind": string,"metrics": NonNullable<Json>,"period_end": string,"period_start": string,"recommendation": string | null,"severity": number,"summary": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"generated_by_llm"?: boolean,"id"?: string,"kind": string,"metrics"?: NonNullable<Json>,"period_end": string,"period_start": string,"recommendation"?: string | null,"severity"?: number,"summary": string
                  }
                  Update: {
                    "created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"generated_by_llm"?: boolean,"id"?: string,"kind"?: string,"metrics"?: NonNullable<Json>,"period_end"?: string,"period_start"?: string,"recommendation"?: string | null,"severity"?: number,"summary"?: string
                  }
                  Relationships: [
                    
                  ]
                },"lockouts": {
                  Row: {
                    "ai_check": Json | null,"created_at": string,"equipment_id": string,"id": string,"locked_at": string,"locked_by": string,"released_at": string | null,"released_by": string | null,"tag_photo_path": string | null,"work_order_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_check"?: Json | null,"created_at"?: string,"equipment_id": string,"id"?: string,"locked_at"?: string,"locked_by": string,"released_at"?: string | null,"released_by"?: string | null,"tag_photo_path"?: string | null,"work_order_id": string
                  }
                  Update: {
                    "ai_check"?: Json | null,"created_at"?: string,"equipment_id"?: string,"id"?: string,"locked_at"?: string,"locked_by"?: string,"released_at"?: string | null,"released_by"?: string | null,"tag_photo_path"?: string | null,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lockouts_equipment_id_fkey"
      columns: ["equipment_id"]
isOneToOne: false
      referencedRelation: "equipment"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lockouts_locked_by_fkey"
      columns: ["locked_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lockouts_released_by_fkey"
      columns: ["released_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lockouts_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"login_attempts": {
                  Row: {
                    "attempted_at": string,"id": number,"ip": unknown,"personnel_number": string,"success": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "attempted_at"?: string,"id"?: never,"ip"?: unknown,"personnel_number": string,"success": boolean
                  }
                  Update: {
                    "attempted_at"?: string,"id"?: never,"ip"?: unknown,"personnel_number"?: string,"success"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"material_norms": {
                  Row: {
                    "created_at": string,"fault_code_id": string,"id": string,"material_id": string,"qty_max": number,"qty_min": number,"qty_typical": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"fault_code_id": string,"id"?: string,"material_id": string,"qty_max": number,"qty_min": number,"qty_typical": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"fault_code_id"?: string,"id"?: string,"material_id"?: string,"qty_max"?: number,"qty_min"?: number,"qty_typical"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_norms_fault_code_id_fkey"
      columns: ["fault_code_id"]
isOneToOne: false
      referencedRelation: "fault_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_norms_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    }
                  ]
                },"material_writeoffs": {
                  Row: {
                    "created_at": string,"id": string,"material_id": string,"quantity": number,"work_order_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"material_id": string,"quantity": number,"work_order_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"material_id"?: string,"quantity"?: number,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "material_writeoffs_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "material_writeoffs_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"materials": {
                  Row: {
                    "categories": (Database["public"]['Enums']["fault_category"])[],"code": string,"created_at": string,"id": string,"is_active": boolean,"name": string,"price": number,"unit": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "categories"?: (Database["public"]['Enums']["fault_category"])[],"code": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"price"?: number,"unit": string,"updated_at"?: string
                  }
                  Update: {
                    "categories"?: (Database["public"]['Enums']["fault_category"])[],"code"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"price"?: number,"unit"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "body": string,"created_at": string,"dedupe_key": string | null,"id": string,"is_urgent": boolean,"kind": string,"payload": NonNullable<Json>,"push_sent_at": string | null,"read_at": string | null,"recipient_id": string,"title": string,"work_order_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"dedupe_key"?: string | null,"id"?: string,"is_urgent"?: boolean,"kind": string,"payload"?: NonNullable<Json>,"push_sent_at"?: string | null,"read_at"?: string | null,"recipient_id": string,"title": string,"work_order_id"?: string | null
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"dedupe_key"?: string | null,"id"?: string,"is_urgent"?: boolean,"kind"?: string,"payload"?: NonNullable<Json>,"push_sent_at"?: string | null,"read_at"?: string | null,"recipient_id"?: string,"title"?: string,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"permit_types": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"name": string,"updated_at": string,"validity_months": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"name": string,"updated_at"?: string,"validity_months"?: number | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string,"validity_months"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"photos": {
                  Row: {
                    "author_id": string | null,"created_at": string,"forced_reason": string | null,"ghost_score": number | null,"height": number | null,"id": string,"kind": Database["public"]['Enums']["photo_kind"],"mime_type": string,"phash": string | null,"received_at": string,"size_bytes": number,"storage_path": string,"taken_at": string | null,"width": number | null,"work_order_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"created_at"?: string,"forced_reason"?: string | null,"ghost_score"?: number | null,"height"?: number | null,"id"?: string,"kind": Database["public"]['Enums']["photo_kind"],"mime_type": string,"phash"?: string | null,"received_at"?: string,"size_bytes": number,"storage_path": string,"taken_at"?: string | null,"width"?: number | null,"work_order_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"created_at"?: string,"forced_reason"?: string | null,"ghost_score"?: number | null,"height"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["photo_kind"],"mime_type"?: string,"phash"?: string | null,"received_at"?: string,"size_bytes"?: number,"storage_path"?: string,"taken_at"?: string | null,"width"?: number | null,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "photos_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "photos_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"employee_id": string,"endpoint": string,"id": string,"last_used_at": string | null,"p256dh": string,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"employee_id": string,"endpoint": string,"id"?: string,"last_used_at"?: string | null,"p256dh": string,"user_agent"?: string | null
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"employee_id"?: string,"endpoint"?: string,"id"?: string,"last_used_at"?: string | null,"p256dh"?: string,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limits": {
                  Row: {
                    "bucket": string,"hits": number,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket": string,"hits"?: number,"window_start": string
                  }
                  Update: {
                    "bucket"?: string,"hits"?: number,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rating_snapshots": {
                  Row: {
                    "components": NonNullable<Json>,"created_at": string,"explanation": string | null,"id": string,"period_end": string,"period_start": string,"score": number,"subject_id": string,"subject_type": Database["public"]['Enums']["rating_subject"]
                  }
                  ComputedFields: never
                  Insert: {
                    "components": NonNullable<Json>,"created_at"?: string,"explanation"?: string | null,"id"?: string,"period_end": string,"period_start": string,"score": number,"subject_id": string,"subject_type": Database["public"]['Enums']["rating_subject"]
                  }
                  Update: {
                    "components"?: NonNullable<Json>,"created_at"?: string,"explanation"?: string | null,"id"?: string,"period_end"?: string,"period_start"?: string,"score"?: number,"subject_id"?: string,"subject_type"?: Database["public"]['Enums']["rating_subject"]
                  }
                  Relationships: [
                    
                  ]
                },"rca_cases": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"equipment_id": string,"fault_code_id": string | null,"five_whys": NonNullable<Json>,"id": string,"opened_at": string,"owner_id": string | null,"recommendation": string | null,"related_order_ids": (string)[],"root_cause": string | null,"status": Database["public"]['Enums']["rca_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"equipment_id": string,"fault_code_id"?: string | null,"five_whys"?: NonNullable<Json>,"id"?: string,"opened_at"?: string,"owner_id"?: string | null,"recommendation"?: string | null,"related_order_ids"?: (string)[],"root_cause"?: string | null,"status"?: Database["public"]['Enums']["rca_status"],"updated_at"?: string
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"equipment_id"?: string,"fault_code_id"?: string | null,"five_whys"?: NonNullable<Json>,"id"?: string,"opened_at"?: string,"owner_id"?: string | null,"recommendation"?: string | null,"related_order_ids"?: (string)[],"root_cause"?: string | null,"status"?: Database["public"]['Enums']["rca_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rca_cases_equipment_id_fkey"
      columns: ["equipment_id"]
isOneToOne: false
      referencedRelation: "equipment"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rca_cases_fault_code_id_fkey"
      columns: ["fault_code_id"]
isOneToOne: false
      referencedRelation: "fault_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rca_cases_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"reason_codes": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"is_active": boolean,"is_valid_excuse": boolean,"kind": Database["public"]['Enums']["reason_kind"],"label": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_valid_excuse"?: boolean,"kind": Database["public"]['Enums']["reason_kind"],"label": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_valid_excuse"?: boolean,"kind"?: Database["public"]['Enums']["reason_kind"],"label"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"sites": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"is_active": boolean,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"time_norms": {
                  Row: {
                    "created_at": string,"equipment_type": Database["public"]['Enums']["equipment_type"] | null,"fault_code_id": string | null,"hours": number,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"equipment_type"?: Database["public"]['Enums']["equipment_type"] | null,"fault_code_id"?: string | null,"hours": number,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"equipment_type"?: Database["public"]['Enums']["equipment_type"] | null,"fault_code_id"?: string | null,"hours"?: number,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_norms_fault_code_id_fkey"
      columns: ["fault_code_id"]
isOneToOne: false
      referencedRelation: "fault_codes"
      referencedColumns: ["id"]
    }
                  ]
                },"work_order_events": {
                  Row: {
                    "action": Database["public"]['Enums']["work_order_action"],"actor_id": string | null,"comment": string | null,"device_at": string | null,"from_status": Database["public"]['Enums']["work_order_status"] | null,"id": string,"occurred_at": string,"payload": NonNullable<Json>,"reason_code_id": string | null,"reason_text": string | null,"to_status": Database["public"]['Enums']["work_order_status"] | null,"work_order_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["work_order_action"],"actor_id"?: string | null,"comment"?: string | null,"device_at"?: string | null,"from_status"?: Database["public"]['Enums']["work_order_status"] | null,"id"?: string,"occurred_at"?: string,"payload"?: NonNullable<Json>,"reason_code_id"?: string | null,"reason_text"?: string | null,"to_status"?: Database["public"]['Enums']["work_order_status"] | null,"work_order_id": string
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["work_order_action"],"actor_id"?: string | null,"comment"?: string | null,"device_at"?: string | null,"from_status"?: Database["public"]['Enums']["work_order_status"] | null,"id"?: string,"occurred_at"?: string,"payload"?: NonNullable<Json>,"reason_code_id"?: string | null,"reason_text"?: string | null,"to_status"?: Database["public"]['Enums']["work_order_status"] | null,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_order_events_reason_code_id_fkey"
      columns: ["reason_code_id"]
isOneToOne: false
      referencedRelation: "reason_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_order_events_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"work_orders": {
                  Row: {
                    "accepted_at": string | null,"assignee_id": string | null,"brigade_id": string | null,"cancelled_at": string | null,"close_comment": string | null,"closed_at": string | null,"comment": string | null,"created_at": string,"description": string,"done_at": string | null,"downtime_cost": number | null,"downtime_ended_at": string | null,"downtime_started_at": string | null,"due_at": string | null,"equipment_id": string,"fault_code_id": string | null,"id": string,"issued_at": string,"kind": Database["public"]['Enums']["work_order_type"],"last_comment": string | null,"master_id": string,"number": number,"paused_at": string | null,"paused_seconds": number,"priority": Database["public"]['Enums']["work_order_priority"],"queue_position": number | null,"queued_at": string | null,"rejected_at": string | null,"review_started_at": string | null,"rework_count": number,"shift_crew": Database["public"]['Enums']["shift_crew"] | null,"shift_period": Database["public"]['Enums']["shift_period"],"site_id": string,"standard_hours": number | null,"started_at": string | null,"status": Database["public"]['Enums']["work_order_status"],"suggested_fault_code_id": string | null,"suggested_standard_hours": number | null,"suggestion": Json | null,"updated_at": string,"work_performed": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"assignee_id"?: string | null,"brigade_id"?: string | null,"cancelled_at"?: string | null,"close_comment"?: string | null,"closed_at"?: string | null,"comment"?: string | null,"created_at"?: string,"description": string,"done_at"?: string | null,"downtime_cost"?: number | null,"downtime_ended_at"?: string | null,"downtime_started_at"?: string | null,"due_at"?: string | null,"equipment_id": string,"fault_code_id"?: string | null,"id"?: string,"issued_at"?: string,"kind": Database["public"]['Enums']["work_order_type"],"last_comment"?: string | null,"master_id": string,"number"?: number,"paused_at"?: string | null,"paused_seconds"?: number,"priority": Database["public"]['Enums']["work_order_priority"],"queue_position"?: number | null,"queued_at"?: string | null,"rejected_at"?: string | null,"review_started_at"?: string | null,"rework_count"?: number,"shift_crew"?: Database["public"]['Enums']["shift_crew"] | null,"shift_period": Database["public"]['Enums']["shift_period"],"site_id": string,"standard_hours"?: number | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["work_order_status"],"suggested_fault_code_id"?: string | null,"suggested_standard_hours"?: number | null,"suggestion"?: Json | null,"updated_at"?: string,"work_performed"?: string | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"assignee_id"?: string | null,"brigade_id"?: string | null,"cancelled_at"?: string | null,"close_comment"?: string | null,"closed_at"?: string | null,"comment"?: string | null,"created_at"?: string,"description"?: string,"done_at"?: string | null,"downtime_cost"?: number | null,"downtime_ended_at"?: string | null,"downtime_started_at"?: string | null,"due_at"?: string | null,"equipment_id"?: string,"fault_code_id"?: string | null,"id"?: string,"issued_at"?: string,"kind"?: Database["public"]['Enums']["work_order_type"],"last_comment"?: string | null,"master_id"?: string,"number"?: number,"paused_at"?: string | null,"paused_seconds"?: number,"priority"?: Database["public"]['Enums']["work_order_priority"],"queue_position"?: number | null,"queued_at"?: string | null,"rejected_at"?: string | null,"review_started_at"?: string | null,"rework_count"?: number,"shift_crew"?: Database["public"]['Enums']["shift_crew"] | null,"shift_period"?: Database["public"]['Enums']["shift_period"],"site_id"?: string,"standard_hours"?: number | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["work_order_status"],"suggested_fault_code_id"?: string | null,"suggested_standard_hours"?: number | null,"suggestion"?: Json | null,"updated_at"?: string,"work_performed"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_orders_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_brigade_id_fkey"
      columns: ["brigade_id"]
isOneToOne: false
      referencedRelation: "brigades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_equipment_id_fkey"
      columns: ["equipment_id"]
isOneToOne: false
      referencedRelation: "equipment"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_fault_code_id_fkey"
      columns: ["fault_code_id"]
isOneToOne: false
      referencedRelation: "fault_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_master_id_fkey"
      columns: ["master_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_suggested_fault_code_id_fkey"
      columns: ["suggested_fault_code_id"]
isOneToOne: false
      referencedRelation: "fault_codes"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "attach_standard_triggers":
{ Args: { "target": unknown,"with_updated_at"?: boolean }; Returns: undefined
                           },
"can_contribute_to_work_order":
{ Args: { "order_id": string }; Returns: boolean
                           },
"can_view_work_order":
{ Args: { "order_id": string }; Returns: boolean
                           },
"current_app_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"]
                           },
"current_employee_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"has_role":
{ Args: { "roles": (Database["public"]['Enums']["app_role"])[] }; Returns: boolean
                           },
"hit_rate_limit":
{ Args: { "bucket": string,"max_hits": number,"window_seconds": number }; Returns: boolean
                           },
"login_lock_seconds":
{ Args: { "lock_minutes"?: number,"max_failures"?: number,"number": string }; Returns: number
                           },
"purge_service_tables":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"record_login_attempt":
{ Args: { "client_ip"?: unknown,"number": string,"succeeded": boolean }; Returns: undefined
                           },
"storage_order_id":
{ Args: { "object_name": string }; Returns: string
                           }
          }
          Enums: {
            "acoustic_kind": "before"|"after","app_role": "master"|"worker"|"manager"|"admin","equipment_type": "crusher"|"conveyor"|"pump"|"screen"|"mill"|"classifier"|"feeder"|"fan"|"compressor"|"other","fault_category": "mechanical"|"electrical"|"hydraulic"|"pneumatic"|"lubrication","photo_kind": "before"|"after"|"loto","rating_subject": "employee"|"brigade","rca_status": "open"|"in_progress"|"closed","reason_kind": "reject"|"pause","review_verdict": "accepted"|"accepted_with_remarks"|"rework","shift_crew": "A"|"B"|"C"|"D","shift_period": "day"|"night","specialty": "fitter"|"electrician"|"welder"|"hydraulic"|"lubricator"|"instrumentation","work_order_action": "issue"|"queue"|"accept"|"reject"|"start"|"pause"|"resume"|"complete"|"submit_review"|"approve"|"return_rework"|"reassign"|"cancel"|"change_priority"|"comment","work_order_priority": "emergency"|"high"|"normal"|"planned","work_order_status": "issued"|"queued"|"accepted"|"rejected"|"in_progress"|"paused"|"done"|"ai_review"|"closed"|"rework"|"cancelled","work_order_type": "planned"|"unplanned"
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
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "acoustic_kind": ["before", "after"],"app_role": ["master", "worker", "manager", "admin"],"equipment_type": ["crusher", "conveyor", "pump", "screen", "mill", "classifier", "feeder", "fan", "compressor", "other"],"fault_category": ["mechanical", "electrical", "hydraulic", "pneumatic", "lubrication"],"photo_kind": ["before", "after", "loto"],"rating_subject": ["employee", "brigade"],"rca_status": ["open", "in_progress", "closed"],"reason_kind": ["reject", "pause"],"review_verdict": ["accepted", "accepted_with_remarks", "rework"],"shift_crew": ["A", "B", "C", "D"],"shift_period": ["day", "night"],"specialty": ["fitter", "electrician", "welder", "hydraulic", "lubricator", "instrumentation"],"work_order_action": ["issue", "queue", "accept", "reject", "start", "pause", "resume", "complete", "submit_review", "approve", "return_rework", "reassign", "cancel", "change_priority", "comment"],"work_order_priority": ["emergency", "high", "normal", "planned"],"work_order_status": ["issued", "queued", "accepted", "rejected", "in_progress", "paused", "done", "ai_review", "closed", "rework", "cancelled"],"work_order_type": ["planned", "unplanned"]
          }
        }
} as const
