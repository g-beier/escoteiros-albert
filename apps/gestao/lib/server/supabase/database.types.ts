
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "accounts": {
                  Row: {
                    "active": boolean,"bank": string | null,"branch": string | null,"created_at": string,"group_id": string,"id": string,"kind": Database["public"]['Enums']["account_kind"],"ledger_code": string | null,"name": string,"number": string | null,"opening_balance_cents": number,"opening_date": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"bank"?: string | null,"branch"?: string | null,"created_at"?: string,"group_id": string,"id"?: string,"kind"?: Database["public"]['Enums']["account_kind"],"ledger_code"?: string | null,"name": string,"number"?: string | null,"opening_balance_cents"?: number,"opening_date"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"bank"?: string | null,"branch"?: string | null,"created_at"?: string,"group_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["account_kind"],"ledger_code"?: string | null,"name"?: string,"number"?: string | null,"opening_balance_cents"?: number,"opening_date"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "accounts_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"associate_functions": {
                  Row: {
                    "associate_id": string,"created_at": string,"created_by": string | null,"ended_on": string | null,"group_id": string,"id": string,"kind": Database["public"]['Enums']["associate_function_kind"],"started_on": string | null,"title": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "associate_id": string,"created_at"?: string,"created_by"?: string | null,"ended_on"?: string | null,"group_id": string,"id"?: string,"kind": Database["public"]['Enums']["associate_function_kind"],"started_on"?: string | null,"title"?: string | null
                  }
                  Update: {
                    "associate_id"?: string,"created_at"?: string,"created_by"?: string | null,"ended_on"?: string | null,"group_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["associate_function_kind"],"started_on"?: string | null,"title"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "associate_functions_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "associate_functions_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associate_functions_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associate_functions_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associate_functions_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"associate_movements": {
                  Row: {
                    "associate_id": string,"created_at": string,"created_by": string | null,"group_id": string,"id": string,"kind": Database["public"]['Enums']["associate_movement_kind"],"movement_date": string,"reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "associate_id": string,"created_at"?: string,"created_by"?: string | null,"group_id": string,"id"?: string,"kind": Database["public"]['Enums']["associate_movement_kind"],"movement_date": string,"reason"?: string | null
                  }
                  Update: {
                    "associate_id"?: string,"created_at"?: string,"created_by"?: string | null,"group_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["associate_movement_kind"],"movement_date"?: string,"reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "associate_movements_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "associate_movements_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associate_movements_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associate_movements_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associate_movements_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"associate_moves": {
                  Row: {
                    "associate_id": string,"created_at": string,"created_by": string | null,"from_branch": Database["public"]['Enums']["scout_branch"],"from_section_id": string | null,"group_id": string,"id": string,"move_date": string,"to_branch": Database["public"]['Enums']["scout_branch"],"to_patrol_id": string | null,"to_section_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "associate_id": string,"created_at"?: string,"created_by"?: string | null,"from_branch": Database["public"]['Enums']["scout_branch"],"from_section_id"?: string | null,"group_id": string,"id"?: string,"move_date": string,"to_branch": Database["public"]['Enums']["scout_branch"],"to_patrol_id"?: string | null,"to_section_id"?: string | null
                  }
                  Update: {
                    "associate_id"?: string,"created_at"?: string,"created_by"?: string | null,"from_branch"?: Database["public"]['Enums']["scout_branch"],"from_section_id"?: string | null,"group_id"?: string,"id"?: string,"move_date"?: string,"to_branch"?: Database["public"]['Enums']["scout_branch"],"to_patrol_id"?: string | null,"to_section_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "associate_moves_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "associate_moves_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associate_moves_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associate_moves_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associate_moves_from_section_id_fkey"
      columns: ["from_section_id"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associate_moves_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associate_moves_to_patrol_id_fkey"
      columns: ["to_patrol_id"]
isOneToOne: false
      referencedRelation: "patrols"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associate_moves_to_section_id_fkey"
      columns: ["to_section_id"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["id"]
    }
                  ]
                },"associates": {
                  Row: {
                    "active": boolean,"birth_date": string | null,"branch": Database["public"]['Enums']["scout_branch"],"created_at": string,"group_id": string,"id": string,"joined_on": string | null,"name": string,"notes": string | null,"patrol_id": string | null,"promise_date": string | null,"review_status": string,"reviewed_at": string | null,"reviewed_by": string | null,"section_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"birth_date"?: string | null,"branch": Database["public"]['Enums']["scout_branch"],"created_at"?: string,"group_id": string,"id"?: string,"joined_on"?: string | null,"name": string,"notes"?: string | null,"patrol_id"?: string | null,"promise_date"?: string | null,"review_status"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"section_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"birth_date"?: string | null,"branch"?: Database["public"]['Enums']["scout_branch"],"created_at"?: string,"group_id"?: string,"id"?: string,"joined_on"?: string | null,"name"?: string,"notes"?: string | null,"patrol_id"?: string | null,"promise_date"?: string | null,"review_status"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"section_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "associates_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associates_patrol_fkey"
      columns: ["patrol_id","section_id"]
isOneToOne: false
      referencedRelation: "patrols"
      referencedColumns: ["id","section_id"]
    },{
      foreignKeyName: "associates_section_fkey"
      columns: ["section_id","group_id","branch"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["id","group_id","branch"]
    }
                  ]
                },"audit_events": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"details": NonNullable<Json>,"entity_id": string | null,"entity_type": string,"group_id": string,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type": string,"group_id": string,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type"?: string,"group_id"?: string,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_events_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "active": boolean,"code": string | null,"created_at": string,"group_id": string,"id": string,"kind": Database["public"]['Enums']["category_kind"] | null,"ledger_code": string | null,"name": string,"parent_id": string | null,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code"?: string | null,"created_at"?: string,"group_id": string,"id"?: string,"kind"?: Database["public"]['Enums']["category_kind"] | null,"ledger_code"?: string | null,"name": string,"parent_id"?: string | null,"position"?: number
                  }
                  Update: {
                    "active"?: boolean,"code"?: string | null,"created_at"?: string,"group_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["category_kind"] | null,"ledger_code"?: string | null,"name"?: string,"parent_id"?: string | null,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"control_item_audiences": {
                  Row: {
                    "audience": Database["public"]['Enums']["control_audience"],"group_id": string,"initial_status": Database["public"]['Enums']["control_status"] | null,"item_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audience": Database["public"]['Enums']["control_audience"],"group_id": string,"initial_status"?: Database["public"]['Enums']["control_status"] | null,"item_id": string
                  }
                  Update: {
                    "audience"?: Database["public"]['Enums']["control_audience"],"group_id"?: string,"initial_status"?: Database["public"]['Enums']["control_status"] | null,"item_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "control_item_audiences_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "control_item_audiences_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "control_items"
      referencedColumns: ["id"]
    }
                  ]
                },"control_items": {
                  Row: {
                    "active": boolean,"created_at": string,"directorate": Database["public"]['Enums']["directorate"],"group_id": string,"id": string,"kind": Database["public"]['Enums']["control_item_kind"],"name": string,"position": number,"remove_on_leave": boolean,"updated_at": string,"validity_months": number | null,"value_kind": Database["public"]['Enums']["control_value_kind"]
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"directorate": Database["public"]['Enums']["directorate"],"group_id": string,"id"?: string,"kind": Database["public"]['Enums']["control_item_kind"],"name": string,"position"?: number,"remove_on_leave"?: boolean,"updated_at"?: string,"validity_months"?: number | null,"value_kind"?: Database["public"]['Enums']["control_value_kind"]
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"directorate"?: Database["public"]['Enums']["directorate"],"group_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["control_item_kind"],"name"?: string,"position"?: number,"remove_on_leave"?: boolean,"updated_at"?: string,"validity_months"?: number | null,"value_kind"?: Database["public"]['Enums']["control_value_kind"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "control_items_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"control_statuses": {
                  Row: {
                    "associate_id": string | null,"group_id": string,"id": string,"item_id": string,"note": string | null,"relative_id": string | null,"status": Database["public"]['Enums']["control_status"],"status_date": string | null,"updated_at": string,"updated_by": string | null,"valid_until": string | null,"value_year": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "associate_id"?: string | null,"group_id": string,"id"?: string,"item_id": string,"note"?: string | null,"relative_id"?: string | null,"status": Database["public"]['Enums']["control_status"],"status_date"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"valid_until"?: string | null,"value_year"?: number | null
                  }
                  Update: {
                    "associate_id"?: string | null,"group_id"?: string,"id"?: string,"item_id"?: string,"note"?: string | null,"relative_id"?: string | null,"status"?: Database["public"]['Enums']["control_status"],"status_date"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"valid_until"?: string | null,"value_year"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "control_statuses_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "control_statuses_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "control_statuses_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "control_statuses_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "control_statuses_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "control_statuses_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "control_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "control_statuses_relative_id_fkey"
      columns: ["relative_id"]
isOneToOne: false
      referencedRelation: "relatives"
      referencedColumns: ["id"]
    }
                  ]
                },"debt_payments": {
                  Row: {
                    "amount_cents": number,"debt_id": string,"entry_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"debt_id": string,"entry_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"debt_id"?: string,"entry_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "debt_payments_debt_id_fkey"
      columns: ["debt_id"]
isOneToOne: false
      referencedRelation: "debts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_payments_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "entry_split_rows"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "debt_payments_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "fee_split_candidates"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "debt_payments_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "ledger_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_payments_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "ledger_entry_rows"
      referencedColumns: ["entry_id"]
    }
                  ]
                },"debts": {
                  Row: {
                    "agreement": string | null,"amount_cents": number,"associate_id": string,"created_at": string,"created_by": string | null,"debt_date": string,"description": string,"group_id": string,"id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agreement"?: string | null,"amount_cents": number,"associate_id": string,"created_at"?: string,"created_by"?: string | null,"debt_date": string,"description": string,"group_id": string,"id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "agreement"?: string | null,"amount_cents"?: number,"associate_id"?: string,"created_at"?: string,"created_by"?: string | null,"debt_date"?: string,"description"?: string,"group_id"?: string,"id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "debts_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "debts_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debts_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debts_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debts_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"entry_attachments": {
                  Row: {
                    "content_type": string,"created_at": string,"entry_id": string,"file_name": string,"group_id": string,"id": string,"size_bytes": number,"storage_path": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "content_type": string,"created_at"?: string,"entry_id": string,"file_name": string,"group_id": string,"id"?: string,"size_bytes": number,"storage_path": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "content_type"?: string,"created_at"?: string,"entry_id"?: string,"file_name"?: string,"group_id"?: string,"id"?: string,"size_bytes"?: number,"storage_path"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "entry_attachments_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "entry_split_rows"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "entry_attachments_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "fee_split_candidates"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "entry_attachments_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "ledger_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entry_attachments_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "ledger_entry_rows"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "entry_attachments_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"entry_splits": {
                  Row: {
                    "amount_cents": number,"associate_id": string | null,"category_id": string,"created_at": string,"description": string,"entry_id": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"associate_id"?: string | null,"category_id": string,"created_at"?: string,"description": string,"entry_id": string,"id"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"associate_id"?: string | null,"category_id"?: string,"created_at"?: string,"description"?: string,"entry_id"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entry_splits_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "entry_splits_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entry_splits_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entry_splits_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entry_splits_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entry_splits_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "entry_split_rows"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "entry_splits_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "fee_split_candidates"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "entry_splits_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "ledger_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entry_splits_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "ledger_entry_rows"
      referencedColumns: ["entry_id"]
    }
                  ]
                },"fee_associate_prices": {
                  Row: {
                    "associate_id": string,"group_id": string,"id": string,"monthly_cents": number,"reason": string,"updated_at": string,"updated_by": string | null,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "associate_id": string,"group_id": string,"id"?: string,"monthly_cents": number,"reason": string,"updated_at"?: string,"updated_by"?: string | null,"year": number
                  }
                  Update: {
                    "associate_id"?: string,"group_id"?: string,"id"?: string,"monthly_cents"?: number,"reason"?: string,"updated_at"?: string,"updated_by"?: string | null,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "fee_associate_prices_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "fee_associate_prices_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_associate_prices_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_associate_prices_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_associate_prices_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"fee_exemptions": {
                  Row: {
                    "associate_id": string,"group_id": string,"id": string,"reason": string,"updated_at": string,"updated_by": string | null,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "associate_id": string,"group_id": string,"id"?: string,"reason": string,"updated_at"?: string,"updated_by"?: string | null,"year": number
                  }
                  Update: {
                    "associate_id"?: string,"group_id"?: string,"id"?: string,"reason"?: string,"updated_at"?: string,"updated_by"?: string | null,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "fee_exemptions_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "fee_exemptions_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_exemptions_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_exemptions_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_exemptions_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"fee_record_splits": {
                  Row: {
                    "fee_record_id": string,"split_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fee_record_id": string,"split_id": string
                  }
                  Update: {
                    "fee_record_id"?: string,"split_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fee_record_splits_fee_record_id_fkey"
      columns: ["fee_record_id"]
isOneToOne: false
      referencedRelation: "fee_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_record_splits_split_id_fkey"
      columns: ["split_id"]
isOneToOne: false
      referencedRelation: "entry_split_rows"
      referencedColumns: ["split_id"]
    },{
      foreignKeyName: "fee_record_splits_split_id_fkey"
      columns: ["split_id"]
isOneToOne: false
      referencedRelation: "entry_splits"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_record_splits_split_id_fkey"
      columns: ["split_id"]
isOneToOne: false
      referencedRelation: "fee_split_candidates"
      referencedColumns: ["split_id"]
    }
                  ]
                },"fee_records": {
                  Row: {
                    "associate_id": string,"group_id": string,"id": string,"month": number,"note": string | null,"status": Database["public"]['Enums']["fee_status"],"updated_at": string,"updated_by": string | null,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "associate_id": string,"group_id": string,"id"?: string,"month": number,"note"?: string | null,"status": Database["public"]['Enums']["fee_status"],"updated_at"?: string,"updated_by"?: string | null,"year": number
                  }
                  Update: {
                    "associate_id"?: string,"group_id"?: string,"id"?: string,"month"?: number,"note"?: string | null,"status"?: Database["public"]['Enums']["fee_status"],"updated_at"?: string,"updated_by"?: string | null,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "fee_records_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "fee_records_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_records_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_records_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_records_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"fee_settings": {
                  Row: {
                    "category_id": string | null,"due_day": number,"due_rule": Database["public"]['Enums']["fee_due_rule"],"group_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"due_day"?: number,"due_rule"?: Database["public"]['Enums']["fee_due_rule"],"group_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "category_id"?: string | null,"due_day"?: number,"due_rule"?: Database["public"]['Enums']["fee_due_rule"],"group_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fee_settings_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_settings_group_id_fkey"
      columns: ["group_id"]
isOneToOne: true
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"fee_year_settings": {
                  Row: {
                    "annual_deadline": string | null,"annual_discount_pct": number,"group_id": string,"monthly_cents": number,"updated_at": string,"updated_by": string | null,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "annual_deadline"?: string | null,"annual_discount_pct"?: number,"group_id": string,"monthly_cents": number,"updated_at"?: string,"updated_by"?: string | null,"year": number
                  }
                  Update: {
                    "annual_deadline"?: string | null,"annual_discount_pct"?: number,"group_id"?: string,"monthly_cents"?: number,"updated_at"?: string,"updated_by"?: string | null,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "fee_year_settings_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"groups": {
                  Row: {
                    "created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"import_profiles": {
                  Row: {
                    "created_at": string,"created_by": string | null,"format": string,"group_id": string,"header_signature": string | null,"id": string,"name": string,"settings": NonNullable<Json>,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"format": string,"group_id": string,"header_signature"?: string | null,"id"?: string,"name": string,"settings"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"format"?: string,"group_id"?: string,"header_signature"?: string | null,"id"?: string,"name"?: string,"settings"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_profiles_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_counts": {
                  Row: {
                    "group_id": string,"id": string,"location_id": string,"material_id": string,"notes": string | null,"quantity": number,"recorded_at": string,"recorded_by": string | null,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "group_id": string,"id"?: string,"location_id": string,"material_id": string,"notes"?: string | null,"quantity": number,"recorded_at"?: string,"recorded_by"?: string | null,"year": number
                  }
                  Update: {
                    "group_id"?: string,"id"?: string,"location_id"?: string,"material_id"?: string,"notes"?: string | null,"quantity"?: number,"recorded_at"?: string,"recorded_by"?: string | null,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_counts_group_id_location_id_fkey"
      columns: ["group_id","location_id"]
isOneToOne: false
      referencedRelation: "inventory_locations"
      referencedColumns: ["group_id","id"]
    },{
      foreignKeyName: "inventory_counts_group_id_material_id_fkey"
      columns: ["group_id","material_id"]
isOneToOne: false
      referencedRelation: "inventory_material_rows"
      referencedColumns: ["group_id","id"]
    },{
      foreignKeyName: "inventory_counts_group_id_material_id_fkey"
      columns: ["group_id","material_id"]
isOneToOne: false
      referencedRelation: "inventory_materials"
      referencedColumns: ["group_id","id"]
    }
                  ]
                },"inventory_families": {
                  Row: {
                    "active": boolean,"code": string | null,"created_at": string,"group_id": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code"?: string | null,"created_at"?: string,"group_id": string,"id"?: string,"name": string
                  }
                  Update: {
                    "active"?: boolean,"code"?: string | null,"created_at"?: string,"group_id"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_families_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_locations": {
                  Row: {
                    "active": boolean,"created_at": string,"description": string | null,"group_id": string,"id": string,"name": string,"parent_id": string | null,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"description"?: string | null,"group_id": string,"id"?: string,"name": string,"parent_id"?: string | null,"position"?: number
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"description"?: string | null,"group_id"?: string,"id"?: string,"name"?: string,"parent_id"?: string | null,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_locations_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_locations_group_id_parent_id_fkey"
      columns: ["group_id","parent_id"]
isOneToOne: false
      referencedRelation: "inventory_locations"
      referencedColumns: ["group_id","id"]
    }
                  ]
                },"inventory_lots": {
                  Row: {
                    "acquired_on": string | null,"condition": Database["public"]['Enums']["inventory_condition"] | null,"created_at": string,"expires_on": string | null,"group_id": string,"id": string,"invoice": string | null,"location_id": string,"material_id": string,"notes": string | null,"origin": Database["public"]['Enums']["inventory_origin"],"quantity": number,"supplier": string | null,"unit_value_cents": number | null,"updated_at": string,"variant": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acquired_on"?: string | null,"condition"?: Database["public"]['Enums']["inventory_condition"] | null,"created_at"?: string,"expires_on"?: string | null,"group_id": string,"id"?: string,"invoice"?: string | null,"location_id": string,"material_id": string,"notes"?: string | null,"origin"?: Database["public"]['Enums']["inventory_origin"],"quantity": number,"supplier"?: string | null,"unit_value_cents"?: number | null,"updated_at"?: string,"variant"?: string | null
                  }
                  Update: {
                    "acquired_on"?: string | null,"condition"?: Database["public"]['Enums']["inventory_condition"] | null,"created_at"?: string,"expires_on"?: string | null,"group_id"?: string,"id"?: string,"invoice"?: string | null,"location_id"?: string,"material_id"?: string,"notes"?: string | null,"origin"?: Database["public"]['Enums']["inventory_origin"],"quantity"?: number,"supplier"?: string | null,"unit_value_cents"?: number | null,"updated_at"?: string,"variant"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_lots_group_id_location_id_fkey"
      columns: ["group_id","location_id"]
isOneToOne: false
      referencedRelation: "inventory_locations"
      referencedColumns: ["group_id","id"]
    },{
      foreignKeyName: "inventory_lots_group_id_material_id_fkey"
      columns: ["group_id","material_id"]
isOneToOne: false
      referencedRelation: "inventory_material_rows"
      referencedColumns: ["group_id","id"]
    },{
      foreignKeyName: "inventory_lots_group_id_material_id_fkey"
      columns: ["group_id","material_id"]
isOneToOne: false
      referencedRelation: "inventory_materials"
      referencedColumns: ["group_id","id"]
    }
                  ]
                },"inventory_materials": {
                  Row: {
                    "active": boolean,"consumable": boolean,"created_at": string,"created_by": string | null,"description": string | null,"family_id": string | null,"group_id": string,"id": string,"minimum_quantity": number | null,"name": string,"tracking": Database["public"]['Enums']["inventory_tracking"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"consumable"?: boolean,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"family_id"?: string | null,"group_id": string,"id"?: string,"minimum_quantity"?: number | null,"name": string,"tracking": Database["public"]['Enums']["inventory_tracking"],"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"consumable"?: boolean,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"family_id"?: string | null,"group_id"?: string,"id"?: string,"minimum_quantity"?: number | null,"name"?: string,"tracking"?: Database["public"]['Enums']["inventory_tracking"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_materials_group_id_family_id_fkey"
      columns: ["group_id","family_id"]
isOneToOne: false
      referencedRelation: "inventory_families"
      referencedColumns: ["group_id","id"]
    },{
      foreignKeyName: "inventory_materials_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_movements": {
                  Row: {
                    "channel": string,"created_at": string,"created_by": string | null,"details": NonNullable<Json>,"from_condition": Database["public"]['Enums']["inventory_condition"] | null,"from_location_id": string | null,"group_id": string,"id": number,"kind": Database["public"]['Enums']["inventory_movement_kind"],"lot_id": string | null,"material_id": string,"notes": string | null,"quantity": number | null,"review_notes": string | null,"review_status": Database["public"]['Enums']["inventory_review_status"],"reviewed_at": string | null,"reviewed_by": string | null,"to_condition": Database["public"]['Enums']["inventory_condition"] | null,"to_location_id": string | null,"unit_id": string | null,"write_off_reason": Database["public"]['Enums']["inventory_write_off_reason"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "channel"?: string,"created_at"?: string,"created_by"?: string | null,"details"?: NonNullable<Json>,"from_condition"?: Database["public"]['Enums']["inventory_condition"] | null,"from_location_id"?: string | null,"group_id": string,"id"?: never,"kind": Database["public"]['Enums']["inventory_movement_kind"],"lot_id"?: string | null,"material_id": string,"notes"?: string | null,"quantity"?: number | null,"review_notes"?: string | null,"review_status": Database["public"]['Enums']["inventory_review_status"],"reviewed_at"?: string | null,"reviewed_by"?: string | null,"to_condition"?: Database["public"]['Enums']["inventory_condition"] | null,"to_location_id"?: string | null,"unit_id"?: string | null,"write_off_reason"?: Database["public"]['Enums']["inventory_write_off_reason"] | null
                  }
                  Update: {
                    "channel"?: string,"created_at"?: string,"created_by"?: string | null,"details"?: NonNullable<Json>,"from_condition"?: Database["public"]['Enums']["inventory_condition"] | null,"from_location_id"?: string | null,"group_id"?: string,"id"?: never,"kind"?: Database["public"]['Enums']["inventory_movement_kind"],"lot_id"?: string | null,"material_id"?: string,"notes"?: string | null,"quantity"?: number | null,"review_notes"?: string | null,"review_status"?: Database["public"]['Enums']["inventory_review_status"],"reviewed_at"?: string | null,"reviewed_by"?: string | null,"to_condition"?: Database["public"]['Enums']["inventory_condition"] | null,"to_location_id"?: string | null,"unit_id"?: string | null,"write_off_reason"?: Database["public"]['Enums']["inventory_write_off_reason"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_movements_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_group_id_lot_id_fkey"
      columns: ["group_id","lot_id"]
isOneToOne: false
      referencedRelation: "inventory_lots"
      referencedColumns: ["group_id","id"]
    },{
      foreignKeyName: "inventory_movements_group_id_material_id_fkey"
      columns: ["group_id","material_id"]
isOneToOne: false
      referencedRelation: "inventory_material_rows"
      referencedColumns: ["group_id","id"]
    },{
      foreignKeyName: "inventory_movements_group_id_material_id_fkey"
      columns: ["group_id","material_id"]
isOneToOne: false
      referencedRelation: "inventory_materials"
      referencedColumns: ["group_id","id"]
    },{
      foreignKeyName: "inventory_movements_group_id_unit_id_fkey"
      columns: ["group_id","unit_id"]
isOneToOne: false
      referencedRelation: "inventory_units"
      referencedColumns: ["group_id","id"]
    }
                  ]
                },"inventory_units": {
                  Row: {
                    "acquired_on": string | null,"condition": Database["public"]['Enums']["inventory_condition"] | null,"created_at": string,"description": string | null,"group_id": string,"id": string,"invoice": string | null,"legacy_code": string | null,"location_id": string,"material_id": string,"notes": string | null,"origin": Database["public"]['Enums']["inventory_origin"],"supplier": string | null,"tag": string | null,"unit_value_cents": number | null,"updated_at": string,"write_off_reason": Database["public"]['Enums']["inventory_write_off_reason"] | null,"written_off_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acquired_on"?: string | null,"condition"?: Database["public"]['Enums']["inventory_condition"] | null,"created_at"?: string,"description"?: string | null,"group_id": string,"id"?: string,"invoice"?: string | null,"legacy_code"?: string | null,"location_id": string,"material_id": string,"notes"?: string | null,"origin"?: Database["public"]['Enums']["inventory_origin"],"supplier"?: string | null,"tag"?: string | null,"unit_value_cents"?: number | null,"updated_at"?: string,"write_off_reason"?: Database["public"]['Enums']["inventory_write_off_reason"] | null,"written_off_at"?: string | null
                  }
                  Update: {
                    "acquired_on"?: string | null,"condition"?: Database["public"]['Enums']["inventory_condition"] | null,"created_at"?: string,"description"?: string | null,"group_id"?: string,"id"?: string,"invoice"?: string | null,"legacy_code"?: string | null,"location_id"?: string,"material_id"?: string,"notes"?: string | null,"origin"?: Database["public"]['Enums']["inventory_origin"],"supplier"?: string | null,"tag"?: string | null,"unit_value_cents"?: number | null,"updated_at"?: string,"write_off_reason"?: Database["public"]['Enums']["inventory_write_off_reason"] | null,"written_off_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_units_group_id_location_id_fkey"
      columns: ["group_id","location_id"]
isOneToOne: false
      referencedRelation: "inventory_locations"
      referencedColumns: ["group_id","id"]
    },{
      foreignKeyName: "inventory_units_group_id_material_id_fkey"
      columns: ["group_id","material_id"]
isOneToOne: false
      referencedRelation: "inventory_material_rows"
      referencedColumns: ["group_id","id"]
    },{
      foreignKeyName: "inventory_units_group_id_material_id_fkey"
      columns: ["group_id","material_id"]
isOneToOne: false
      referencedRelation: "inventory_materials"
      referencedColumns: ["group_id","id"]
    }
                  ]
                },"ledger_entries": {
                  Row: {
                    "account_id": string,"created_at": string,"created_by": string,"document": string | null,"document_filed": boolean,"entry_date": string,"group_id": string,"id": string,"name": string,"notes": string | null,"outside_statement": boolean,"payment_method_id": string,"review_status": string,"reviewed_at": string | null,"reviewed_by": string | null,"total_cents": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"created_by": string,"document"?: string | null,"document_filed"?: boolean,"entry_date": string,"group_id": string,"id"?: string,"name": string,"notes"?: string | null,"outside_statement"?: boolean,"payment_method_id": string,"review_status"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"total_cents": number,"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"created_by"?: string,"document"?: string | null,"document_filed"?: boolean,"entry_date"?: string,"group_id"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"outside_statement"?: boolean,"payment_method_id"?: string,"review_status"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"total_cents"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_entries_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_payment_method_id_fkey"
      columns: ["payment_method_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "activities_role": string | null,"associates_role": Database["public"]['Enums']["associates_role"],"created_at": string,"group_id": string,"inventory_role": Database["public"]['Enums']["inventory_role"],"role": Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activities_role"?: string | null,"associates_role"?: Database["public"]['Enums']["associates_role"],"created_at"?: string,"group_id": string,"inventory_role"?: Database["public"]['Enums']["inventory_role"],"role"?: Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  Update: {
                    "activities_role"?: string | null,"associates_role"?: Database["public"]['Enums']["associates_role"],"created_at"?: string,"group_id"?: string,"inventory_role"?: Database["public"]['Enums']["inventory_role"],"role"?: Database["public"]['Enums']["member_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"patrols": {
                  Row: {
                    "active": boolean,"created_at": string,"group_id": string,"id": string,"name": string,"section_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"group_id": string,"id"?: string,"name": string,"section_id": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"group_id"?: string,"id"?: string,"name"?: string,"section_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "patrols_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "patrols_section_id_group_id_fkey"
      columns: ["section_id","group_id"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["id","group_id"]
    }
                  ]
                },"payment_methods": {
                  Row: {
                    "active": boolean,"created_at": string,"default_account_id": string | null,"group_id": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"default_account_id"?: string | null,"group_id": string,"id"?: string,"name": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"default_account_id"?: string | null,"group_id"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_methods_default_account_id_fkey"
      columns: ["default_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_methods_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"reconciliation_links": {
                  Row: {
                    "amount_cents": number,"created_at": string,"created_by": string | null,"id": string,"ledger_entry_id": string,"link_set_id": string,"statement_line_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"ledger_entry_id": string,"link_set_id"?: string,"statement_line_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"ledger_entry_id"?: string,"link_set_id"?: string,"statement_line_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reconciliation_links_ledger_entry_id_fkey"
      columns: ["ledger_entry_id"]
isOneToOne: false
      referencedRelation: "entry_split_rows"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "reconciliation_links_ledger_entry_id_fkey"
      columns: ["ledger_entry_id"]
isOneToOne: false
      referencedRelation: "fee_split_candidates"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "reconciliation_links_ledger_entry_id_fkey"
      columns: ["ledger_entry_id"]
isOneToOne: false
      referencedRelation: "ledger_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reconciliation_links_ledger_entry_id_fkey"
      columns: ["ledger_entry_id"]
isOneToOne: false
      referencedRelation: "ledger_entry_rows"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "reconciliation_links_statement_line_id_fkey"
      columns: ["statement_line_id"]
isOneToOne: false
      referencedRelation: "statement_lines"
      referencedColumns: ["id"]
    }
                  ]
                },"reconciliation_rejections": {
                  Row: {
                    "ledger_entry_id": string,"rejected_at": string,"rejected_by": string | null,"statement_line_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ledger_entry_id": string,"rejected_at"?: string,"rejected_by"?: string | null,"statement_line_id": string
                  }
                  Update: {
                    "ledger_entry_id"?: string,"rejected_at"?: string,"rejected_by"?: string | null,"statement_line_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reconciliation_rejections_ledger_entry_id_fkey"
      columns: ["ledger_entry_id"]
isOneToOne: false
      referencedRelation: "entry_split_rows"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "reconciliation_rejections_ledger_entry_id_fkey"
      columns: ["ledger_entry_id"]
isOneToOne: false
      referencedRelation: "fee_split_candidates"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "reconciliation_rejections_ledger_entry_id_fkey"
      columns: ["ledger_entry_id"]
isOneToOne: false
      referencedRelation: "ledger_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reconciliation_rejections_ledger_entry_id_fkey"
      columns: ["ledger_entry_id"]
isOneToOne: false
      referencedRelation: "ledger_entry_rows"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "reconciliation_rejections_statement_line_id_fkey"
      columns: ["statement_line_id"]
isOneToOne: false
      referencedRelation: "statement_lines"
      referencedColumns: ["id"]
    }
                  ]
                },"relative_links": {
                  Row: {
                    "associate_id": string,"created_at": string,"financial": boolean,"group_id": string,"id": string,"kinship": Database["public"]['Enums']["relative_kinship"],"kinship_note": string | null,"legal": boolean,"position": number,"relative_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "associate_id": string,"created_at"?: string,"financial"?: boolean,"group_id": string,"id"?: string,"kinship": Database["public"]['Enums']["relative_kinship"],"kinship_note"?: string | null,"legal"?: boolean,"position"?: number,"relative_id": string
                  }
                  Update: {
                    "associate_id"?: string,"created_at"?: string,"financial"?: boolean,"group_id"?: string,"id"?: string,"kinship"?: Database["public"]['Enums']["relative_kinship"],"kinship_note"?: string | null,"legal"?: boolean,"position"?: number,"relative_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "relative_links_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "relative_links_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relative_links_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relative_links_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relative_links_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relative_links_relative_id_fkey"
      columns: ["relative_id"]
isOneToOne: false
      referencedRelation: "relatives"
      referencedColumns: ["id"]
    }
                  ]
                },"relatives": {
                  Row: {
                    "associate_id": string | null,"created_at": string,"group_id": string,"id": string,"name": string,"notes": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "associate_id"?: string | null,"created_at"?: string,"group_id": string,"id"?: string,"name": string,"notes"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "associate_id"?: string | null,"created_at"?: string,"group_id"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "relatives_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "relatives_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relatives_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relatives_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relatives_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"sections": {
                  Row: {
                    "active": boolean,"branch": Database["public"]['Enums']["scout_branch"],"created_at": string,"group_id": string,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"branch": Database["public"]['Enums']["scout_branch"],"created_at"?: string,"group_id": string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"branch"?: Database["public"]['Enums']["scout_branch"],"created_at"?: string,"group_id"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sections_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"statement_imports": {
                  Row: {
                    "account_id": string,"closing_balance_cents": number | null,"duplicate_count": number,"file_name": string,"group_id": string,"id": string,"imported_at": string,"imported_by": string | null,"line_count": number,"opening_balance_cents": number | null,"period_from": string,"period_to": string,"profile_id": string | null,"profile_settings": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"closing_balance_cents"?: number | null,"duplicate_count"?: number,"file_name": string,"group_id": string,"id"?: string,"imported_at"?: string,"imported_by"?: string | null,"line_count"?: number,"opening_balance_cents"?: number | null,"period_from": string,"period_to": string,"profile_id"?: string | null,"profile_settings"?: Json | null
                  }
                  Update: {
                    "account_id"?: string,"closing_balance_cents"?: number | null,"duplicate_count"?: number,"file_name"?: string,"group_id"?: string,"id"?: string,"imported_at"?: string,"imported_by"?: string | null,"line_count"?: number,"opening_balance_cents"?: number | null,"period_from"?: string,"period_to"?: string,"profile_id"?: string | null,"profile_settings"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "statement_imports_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_imports_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_imports_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "import_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"statement_lines": {
                  Row: {
                    "account_id": string,"amount_cents": number,"balance_cents": number | null,"check_number": string | null,"counterparty": string | null,"created_at": string,"description": string,"external_id": string | null,"fingerprint": string,"group_id": string,"id": string,"ignored_reason": string | null,"import_id": string,"kind": string | null,"line_date": string,"payee": string | null,"reference": string | null,"status": Database["public"]['Enums']["statement_line_status"],"trn_type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount_cents": number,"balance_cents"?: number | null,"check_number"?: string | null,"counterparty"?: string | null,"created_at"?: string,"description": string,"external_id"?: string | null,"fingerprint": string,"group_id": string,"id"?: string,"ignored_reason"?: string | null,"import_id": string,"kind"?: string | null,"line_date": string,"payee"?: string | null,"reference"?: string | null,"status"?: Database["public"]['Enums']["statement_line_status"],"trn_type"?: string | null
                  }
                  Update: {
                    "account_id"?: string,"amount_cents"?: number,"balance_cents"?: number | null,"check_number"?: string | null,"counterparty"?: string | null,"created_at"?: string,"description"?: string,"external_id"?: string | null,"fingerprint"?: string,"group_id"?: string,"id"?: string,"ignored_reason"?: string | null,"import_id"?: string,"kind"?: string | null,"line_date"?: string,"payee"?: string | null,"reference"?: string | null,"status"?: Database["public"]['Enums']["statement_line_status"],"trn_type"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "statement_lines_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_lines_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_lines_import_id_fkey"
      columns: ["import_id"]
isOneToOne: false
      referencedRelation: "statement_imports"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "associate_audiences": {
                  Row: {
                    "associate_id": string,"audience": Database["public"]['Enums']["control_audience"] | null,"group_id": string
                  }
                  ComputedFields: never
                  Insert: {
                           "associate_id"?: string | null,"audience"?: never,"group_id"?: string | null
                         }
                        Update: {
                           "associate_id"?: string | null,"audience"?: never,"group_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "associates_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"associate_function_rows": {
                  Row: {
                    "active": boolean | null,"associate_id": string,"associate_name": string,"created_at": string,"ended_on": string | null,"group_id": string,"id": string,"kind": Database["public"]['Enums']["associate_function_kind"],"started_on": string | null,"title": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "associate_functions_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "associate_functions_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associate_functions_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associate_functions_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associate_functions_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"associate_profile_rows": {
                  Row: {
                    "active": boolean,"birth_date": string | null,"branch": Database["public"]['Enums']["scout_branch"],"created_at": string,"group_id": string,"id": string,"joined_on": string | null,"left_on": string | null,"name": string,"notes": string | null,"patrol": string | null,"patrol_id": string | null,"promise_date": string | null,"review_status": string,"section": string | null,"section_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "associates_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associates_patrol_fkey"
      columns: ["patrol_id","section_id"]
isOneToOne: false
      referencedRelation: "patrols"
      referencedColumns: ["id","section_id"]
    },{
      foreignKeyName: "associates_section_fkey"
      columns: ["section_id","group_id","branch"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["id","group_id","branch"]
    }
                  ]
                },"associate_rows": {
                  Row: {
                    "active": boolean,"branch": Database["public"]['Enums']["scout_branch"],"created_at": string,"group_id": string,"id": string,"name": string,"patrol": string | null,"patrol_id": string | null,"section": string | null,"section_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "associates_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "associates_patrol_fkey"
      columns: ["patrol_id","section_id"]
isOneToOne: false
      referencedRelation: "patrols"
      referencedColumns: ["id","section_id"]
    },{
      foreignKeyName: "associates_section_fkey"
      columns: ["section_id","group_id","branch"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["id","group_id","branch"]
    }
                  ]
                },"control_status_rows": {
                  Row: {
                    "associate_id": string | null,"effective_status": Database["public"]['Enums']["control_status"] | null,"group_id": string,"id": string,"item_id": string,"note": string | null,"relative_id": string | null,"status": Database["public"]['Enums']["control_status"],"status_date": string | null,"updated_at": string,"updated_by": string | null,"valid_until": string | null,"value_year": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "associate_id"?: string | null,"effective_status"?: never,"group_id"?: string | null,"id"?: string | null,"item_id"?: string | null,"note"?: string | null,"relative_id"?: string | null,"status"?: Database["public"]['Enums']["control_status"] | null,"status_date"?: string | null,"updated_at"?: string | null,"updated_by"?: string | null,"valid_until"?: string | null,"value_year"?: number | null
                         }
                        Update: {
                           "associate_id"?: string | null,"effective_status"?: never,"group_id"?: string | null,"id"?: string | null,"item_id"?: string | null,"note"?: string | null,"relative_id"?: string | null,"status"?: Database["public"]['Enums']["control_status"] | null,"status_date"?: string | null,"updated_at"?: string | null,"updated_by"?: string | null,"valid_until"?: string | null,"value_year"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "control_statuses_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "control_statuses_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "control_statuses_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "control_statuses_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "control_statuses_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "control_statuses_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "control_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "control_statuses_relative_id_fkey"
      columns: ["relative_id"]
isOneToOne: false
      referencedRelation: "relatives"
      referencedColumns: ["id"]
    }
                  ]
                },"entry_split_rows": {
                  Row: {
                    "account_id": string,"account_ledger_code": string | null,"account_name": string,"amount_cents": number,"associate_id": string | null,"associate_name": string | null,"category_code": string | null,"category_id": string,"category_kind": Database["public"]['Enums']["category_kind"] | null,"category_ledger_code": string | null,"category_name": string,"description": string,"document": string | null,"document_filed": boolean,"entry_date": string,"entry_id": string,"entry_name": string,"entry_total_cents": number,"external_ids": (string)[] | null,"group_id": string,"outside_statement": boolean,"payment_method_id": string,"payment_method_name": string,"reconciled": boolean | null,"review_status": string,"search_text": string | null,"split_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "entry_splits_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "entry_splits_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entry_splits_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entry_splits_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entry_splits_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_payment_method_id_fkey"
      columns: ["payment_method_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["id"]
    }
                  ]
                },"fee_split_candidates": {
                  Row: {
                    "amount_cents": number,"associate_id": string | null,"description": string,"entry_date": string,"entry_id": string,"entry_name": string,"group_id": string,"linked_periods": (number)[] | null,"split_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "entry_splits_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "entry_splits_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entry_splits_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entry_splits_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_location_paths": {
                  Row: {
                    "active": boolean | null,"ancestors": (string)[] | null,"depth": number | null,"group_id": string | null,"id": string | null,"name": string | null,"parent_id": string | null,"path": string | null,"sort_key": (number)[] | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"inventory_material_rows": {
                  Row: {
                    "active": boolean,"below_minimum": boolean | null,"consumable": boolean,"description": string | null,"estimated_value_cents": number | null,"family_code": string | null,"family_id": string | null,"family_name": string | null,"group_id": string,"id": string,"lots": number | null,"minimum_quantity": number | null,"name": string,"next_expiry": string | null,"quantity": number | null,"search_text": string | null,"tracking": Database["public"]['Enums']["inventory_tracking"],"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "inventory_materials_group_id_family_id_fkey"
      columns: ["group_id","family_id"]
isOneToOne: false
      referencedRelation: "inventory_families"
      referencedColumns: ["group_id","id"]
    },{
      foreignKeyName: "inventory_materials_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_stock_by_location": {
                  Row: {
                    "conditions": Json | null,"group_id": string | null,"location_id": string | null,"material_id": string | null,"max_unit_cents": number | null,"min_unit_cents": number | null,"next_expiry": string | null,"quantity": number | null,"value_cents": number | null,"worst_condition": Database["public"]['Enums']["inventory_condition"] | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"ledger_entry_rows": {
                  Row: {
                    "account_id": string,"account_ledger_code": string | null,"account_name": string,"associate_ids": (string)[] | null,"category_ids": (string)[] | null,"created_at": string,"document": string | null,"document_filed": boolean,"entry_date": string,"entry_id": string,"external_ids": (string)[] | null,"group_id": string,"has_split_without_associate": boolean | null,"name": string,"outside_statement": boolean,"payment_method_id": string,"payment_method_name": string,"reconciled": boolean | null,"review_status": string,"search_text": string | null,"split_count": number | null,"total_cents": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "ledger_entries_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_payment_method_id_fkey"
      columns: ["payment_method_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["id"]
    }
                  ]
                },"reconciliation_link_rows": {
                  Row: {
                    "account_id": string,"amount_cents": number,"created_at": string,"entry_date": string,"entry_name": string,"entry_total_cents": number,"group_id": string,"ledger_entry_id": string,"line_amount_cents": number,"line_counterparty": string | null,"line_date": string,"line_description": string,"line_external_id": string | null,"line_kind": string | null,"line_trn_type": string | null,"link_id": string,"link_set_id": string,"statement_line_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "reconciliation_links_ledger_entry_id_fkey"
      columns: ["ledger_entry_id"]
isOneToOne: false
      referencedRelation: "entry_split_rows"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "reconciliation_links_ledger_entry_id_fkey"
      columns: ["ledger_entry_id"]
isOneToOne: false
      referencedRelation: "fee_split_candidates"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "reconciliation_links_ledger_entry_id_fkey"
      columns: ["ledger_entry_id"]
isOneToOne: false
      referencedRelation: "ledger_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reconciliation_links_ledger_entry_id_fkey"
      columns: ["ledger_entry_id"]
isOneToOne: false
      referencedRelation: "ledger_entry_rows"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "reconciliation_links_statement_line_id_fkey"
      columns: ["statement_line_id"]
isOneToOne: false
      referencedRelation: "statement_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_lines_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "statement_lines_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"relative_link_rows": {
                  Row: {
                    "associate_id": string,"financial": boolean,"group_id": string,"id": string,"kinship": Database["public"]['Enums']["relative_kinship"],"kinship_note": string | null,"legal": boolean,"position": number,"relative_associate_id": string | null,"relative_id": string,"relative_name": string,"sibling_count": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "relative_links_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "relative_links_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relative_links_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relative_links_associate_id_fkey"
      columns: ["associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relative_links_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relative_links_relative_id_fkey"
      columns: ["relative_id"]
isOneToOne: false
      referencedRelation: "relatives"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relatives_associate_id_fkey"
      columns: ["relative_associate_id"]
isOneToOne: false
      referencedRelation: "associate_audiences"
      referencedColumns: ["associate_id"]
    },{
      foreignKeyName: "relatives_associate_id_fkey"
      columns: ["relative_associate_id"]
isOneToOne: false
      referencedRelation: "associate_profile_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relatives_associate_id_fkey"
      columns: ["relative_associate_id"]
isOneToOne: false
      referencedRelation: "associate_rows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "relatives_associate_id_fkey"
      columns: ["relative_associate_id"]
isOneToOne: false
      referencedRelation: "associates"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "account_balance_before":
{ Args: { "p_account_id": string,"p_date": string }; Returns: Json
                           },
"account_snapshot":
{ Args: { "p_account_id": string }; Returns: Json
                           },
"add_associate_movement":
{ Args: { "p_associate_id": string,"p_date": string,"p_kind": Database["public"]['Enums']["associate_movement_kind"],"p_reason": string }; Returns: string
                           },
"add_entry_attachment":
{ Args: { "p_entry_id": string,"p_file_name": string,"p_storage_path": string }; Returns: string
                           },
"admin_bootstrap_group":
{ Args: { "p_admin_email": string,"p_group_name": string }; Returns: string
                           },
"admin_change_associates_role":
{ Args: { "p_group_id": string,"p_role": Database["public"]['Enums']["associates_role"],"p_user_id": string }; Returns: undefined
                           },
"admin_change_inventory_role":
{ Args: { "p_group_id": string,"p_role": Database["public"]['Enums']["inventory_role"],"p_user_id": string }; Returns: undefined
                           },
"admin_change_member_role":
{ Args: { "p_group_id": string,"p_role": Database["public"]['Enums']["member_role"],"p_user_id": string }; Returns: undefined
                           },
"admin_remove_member":
{ Args: { "p_group_id": string,"p_user_id": string }; Returns: undefined
                           },
"associate_audience_of":
{ Args: { "p_associate_id": string }; Returns: Database["public"]['Enums']["control_audience"]
                           },
"associate_function_snapshot":
{ Args: { "p_function_id": string }; Returns: Json
                           },
"associate_snapshot":
{ Args: { "p_associate_id": string }; Returns: Json
                           },
"associates_add_function":
{ Args: { "p_associate_id": string,"p_kind": Database["public"]['Enums']["associate_function_kind"],"p_started_on": string,"p_title": string }; Returns: string
                           },
"associates_check_details":
{ Args: { "p_birth_date": string,"p_joined_on": string,"p_name": string,"p_notes": string,"p_promise_date": string }; Returns: string
                           },
"associates_check_placement":
{ Args: { "p_branch": Database["public"]['Enums']["scout_branch"],"p_group_id": string,"p_patrol_id": string,"p_section_id": string }; Returns: undefined
                           },
"associates_create":
{ Args: { "p_birth_date": string,"p_branch": Database["public"]['Enums']["scout_branch"],"p_group_id": string,"p_joined_on": string,"p_name": string,"p_notes": string,"p_patrol_id": string,"p_promise_date": string,"p_section_id": string }; Returns: string
                           },
"associates_create_quick":
{ Args: { "p_birth_date": string,"p_branch": Database["public"]['Enums']["scout_branch"],"p_group_id": string,"p_joined_on": string,"p_name": string,"p_notes": string,"p_patrol_id": string,"p_promise_date": string,"p_section_id": string }; Returns: string
                           },
"associates_delete_function":
{ Args: { "p_function_id": string }; Returns: undefined
                           },
"associates_end_function":
{ Args: { "p_ended_on": string,"p_function_id": string }; Returns: undefined
                           },
"associates_leave":
{ Args: { "p_associate_id": string,"p_date": string,"p_reason": string }; Returns: undefined
                           },
"associates_move":
{ Args: { "p_associate_id": string,"p_branch": Database["public"]['Enums']["scout_branch"],"p_date": string,"p_patrol_id": string,"p_section_id": string }; Returns: string
                           },
"associates_rejoin":
{ Args: { "p_associate_id": string,"p_date": string,"p_reason": string }; Returns: undefined
                           },
"associates_review":
{ Args: { "p_associate_ids": (string)[],"p_group_id": string }; Returns: number
                           },
"associates_role_of":
{ Args: { "p_group_id": string }; Returns: Database["public"]['Enums']["associates_role"]
                           },
"associates_seed_control_items":
{ Args: { "p_group_id": string }; Returns: number
                           },
"associates_update":
{ Args: { "p_associate_id": string,"p_birth_date": string,"p_joined_on": string,"p_name": string,"p_notes": string,"p_promise_date": string }; Returns: undefined
                           },
"attachment_path_entry":
{ Args: { "p_name": string }; Returns: Record<string, unknown>
                           },
"can_delete_attachment_object":
{ Args: { "p_name": string }; Returns: boolean
                           },
"can_edit_group":
{ Args: { "requested_group_id": string }; Returns: boolean
                           },
"can_edit_inventory":
{ Args: { "p_group_id": string }; Returns: boolean
                           },
"can_manage_associates":
{ Args: { "p_group_id": string }; Returns: boolean
                           },
"can_manage_inventory":
{ Args: { "p_group_id": string }; Returns: boolean
                           },
"can_read_attachment_object":
{ Args: { "p_name": string }; Returns: boolean
                           },
"can_write_attachment_object":
{ Args: { "p_name": string }; Returns: boolean
                           },
"category_code_key":
{ Args: { "p_code": string }; Returns: (number)[]
                           },
"category_snapshot":
{ Args: { "p_category_id": string }; Returns: Json
                           },
"category_subtree":
{ Args: { "p_category_id": string }; Returns: {
              "depth": number,"id": string
            }[]
                           },
"check_category_kind_fits":
{ Args: { "p_ids": (string)[],"p_kind": Database["public"]['Enums']["category_kind"] }; Returns: undefined
                           },
"check_category_parent":
{ Args: { "p_group_id": string,"p_height": number,"p_parent_id": string }; Returns: {
              "active": boolean,
"code": string | null,
"created_at": string,
"group_id": string,
"id": string,
"kind": Database["public"]['Enums']["category_kind"] | null,
"ledger_code": string | null,
"name": string,
"parent_id": string | null,
"position": number
            }
                          SetofOptions: {
        from: "*"
        to: "categories"
        isOneToOne: true
        isSetofReturn: false
      } },
"check_debt_allocations":
{ Args: { "p_associate_id": string,"p_debt_ids": (string)[],"p_entry_ids": (string)[] }; Returns: undefined
                           },
"confirm_fee_suggestions":
{ Args: { "p_items": Json }; Returns: number
                           },
"control_item_applies":
{ Args: { "p_audience": Database["public"]['Enums']["control_audience"],"p_item_id": string }; Returns: boolean
                           },
"control_item_check":
{ Args: { "p_audiences": Json,"p_directorate": Database["public"]['Enums']["directorate"],"p_group_id": string,"p_item_id": string,"p_kind": Database["public"]['Enums']["control_item_kind"],"p_name": string,"p_validity_months": number }; Returns: string
                           },
"control_item_create":
{ Args: { "p_audiences": Json,"p_directorate": Database["public"]['Enums']["directorate"],"p_group_id": string,"p_kind": Database["public"]['Enums']["control_item_kind"],"p_name": string,"p_remove_on_leave": boolean,"p_validity_months": number,"p_value_kind"?: Database["public"]['Enums']["control_value_kind"] }; Returns: string
                           },
"control_item_place":
{ Args: { "p_item_id": string,"p_position": number }; Returns: undefined
                           },
"control_item_save_audiences":
{ Args: { "p_audiences": Json,"p_group_id": string,"p_item_id": string }; Returns: undefined
                           },
"control_item_snapshot":
{ Args: { "p_item_id": string }; Returns: Json
                           },
"control_item_update":
{ Args: { "p_active": boolean,"p_audiences": Json,"p_directorate": Database["public"]['Enums']["directorate"],"p_item_id": string,"p_kind": Database["public"]['Enums']["control_item_kind"],"p_name": string,"p_remove_on_leave": boolean,"p_validity_months": number,"p_value_kind"?: Database["public"]['Enums']["control_value_kind"] }; Returns: undefined
                           },
"control_items_renumber":
{ Args: { "p_directorate": Database["public"]['Enums']["directorate"],"p_group_id": string }; Returns: undefined
                           },
"control_items_seed":
{ Args: { "p_group_id": string }; Returns: number
                           },
"control_status_check":
{ Args: { "p_audience": Database["public"]['Enums']["control_audience"],"p_group_id": string,"p_item_id": string,"p_note": string,"p_status": Database["public"]['Enums']["control_status"],"p_status_date": string,"p_valid_until": string,"p_value_year": number,"p_who": string }; Returns: Record<string, unknown>
                           },
"control_status_clear":
{ Args: { "p_associate_id": string,"p_item_id": string }; Returns: undefined
                           },
"control_status_clear_relative":
{ Args: { "p_item_id": string,"p_relative_id": string }; Returns: undefined
                           },
"control_status_set":
{ Args: { "p_associate_id": string,"p_item_id": string,"p_note": string,"p_status": Database["public"]['Enums']["control_status"],"p_status_date": string,"p_valid_until": string,"p_value_year"?: number }; Returns: undefined
                           },
"control_status_set_relative":
{ Args: { "p_item_id": string,"p_note": string,"p_relative_id": string,"p_status": Database["public"]['Enums']["control_status"],"p_status_date": string,"p_valid_until": string,"p_value_year"?: number }; Returns: undefined
                           },
"control_status_snapshot":
{ Args: { "p_associate_id": string,"p_item_id": string }; Returns: Json
                           },
"control_status_snapshot_relative":
{ Args: { "p_item_id": string,"p_relative_id": string }; Returns: Json
                           },
"control_statuses_init":
{ Args: { "p_associate_id": string,"p_audience": Database["public"]['Enums']["control_audience"],"p_group_id": string,"p_relative_id": string }; Returns: number
                           },
"create_account":
{ Args: { "p_bank": string,"p_branch": string,"p_group_id": string,"p_kind": Database["public"]['Enums']["account_kind"],"p_ledger_code": string,"p_name": string,"p_number": string,"p_opening_balance_cents": number,"p_opening_date": string }; Returns: string
                           },
"create_category":
{ Args: { "p_group_id": string,"p_ledger_code": string,"p_name": string,"p_parent_id": string }; Returns: string
                           },
"create_entries_from_statement_lines":
{ Args: { "p_items": Json }; Returns: number
                           },
"create_entry_from_statement_line":
{ Args: { "p_document": string,"p_document_filed": boolean,"p_entry_date": string,"p_name": string,"p_notes"?: string,"p_payment_method_id": string,"p_splits": Json,"p_statement_line_id": string,"p_total_cents": number }; Returns: string
                           },
"create_ledger_entry":
{ Args: { "p_account_id"?: string,"p_document": string,"p_document_filed": boolean,"p_entry_date": string,"p_group_id": string,"p_name": string,"p_notes"?: string,"p_payment_method_id": string,"p_splits": Json,"p_total_cents": number }; Returns: string
                           },
"create_patrol":
{ Args: { "p_name": string,"p_section_id": string }; Returns: string
                           },
"create_payment_method":
{ Args: { "p_group_id": string,"p_name": string }; Returns: string
                           },
"create_quick_ledger_entry":
{ Args: { "p_category_id": string,"p_description"?: string,"p_entry_date": string,"p_group_id": string,"p_name": string,"p_notes"?: string,"p_payment_method_id": string,"p_total_cents": number }; Returns: string
                           },
"create_section":
{ Args: { "p_branch": Database["public"]['Enums']["scout_branch"],"p_group_id": string,"p_name": string }; Returns: string
                           },
"debt_money":
{ Args: { "p_cents": number }; Returns: string
                           },
"debt_payment_cents":
{ Args: { "p_associate_id": string,"p_entry_id": string }; Returns: number
                           },
"debt_rows":
{ Args: { "p_group_id": string }; Returns: {
              "agreement": string,"amount_cents": number,"associate_id": string,"associate_name": string,"debt_date": string,"debtor_number": number,"description": string,"id": string,"paid_cents": number,"payment_mismatch": boolean,"payments": Json,"updated_at": string
            }[]
                           },
"debt_snapshot":
{ Args: { "p_id": string }; Returns: Json
                           },
"delete_associate_movement":
{ Args: { "p_movement_id": string }; Returns: undefined
                           },
"delete_debt":
{ Args: { "p_id": string }; Returns: undefined
                           },
"delete_entry_attachment":
{ Args: { "p_attachment_id": string }; Returns: string
                           },
"delete_import_profile":
{ Args: { "p_profile_id": string }; Returns: Json
                           },
"delete_ledger_entry":
{ Args: { "p_entry_id": string }; Returns: undefined
                           },
"delete_statement_import":
{ Args: { "p_import_id": string }; Returns: Json
                           },
"dissolve_reconciliation_sets":
{ Args: { "p_reason": string,"p_set_ids": (string)[] }; Returns: number
                           },
"entry_external_ids":
{ Args: { "p_entry_id": string }; Returns: (string)[]
                           },
"fallback_account":
{ Args: { "p_group_id": string }; Returns: string
                           },
"fee_category_ids":
{ Args: { "p_group_id": string }; Returns: (string)[]
                           },
"fee_record_snapshot":
{ Args: { "p_record_id": string }; Returns: Json
                           },
"ignore_statement_line":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           },
"ignore_statement_lines":
{ Args: { "p_ids": (string)[],"p_reason": string }; Returns: number
                           },
"import_associates":
{ Args: { "p_group_id": string,"p_rows": Json }; Returns: Json
                           },
"import_statement_lines":
{ Args: { "p_account_id": string,"p_closing_balance_cents": number,"p_file_name": string,"p_lines": Json,"p_opening_balance_cents": number,"p_period_from": string,"p_period_to": string,"p_profile_id": string,"p_profile_settings": Json }; Returns: Json
                           },
"inventory_add_lot":
{ Args: { "p_acquired_on": string,"p_condition": Database["public"]['Enums']["inventory_condition"],"p_expires_on": string,"p_invoice": string,"p_location_id": string,"p_material_id": string,"p_notes": string,"p_origin": Database["public"]['Enums']["inventory_origin"],"p_quantity": number,"p_supplier": string,"p_unit_value_cents": number,"p_variant"?: string }; Returns: string
                           },
"inventory_add_unit":
{ Args: { "p_acquired_on": string,"p_condition": Database["public"]['Enums']["inventory_condition"],"p_description": string,"p_invoice": string,"p_legacy_code": string,"p_location_id": string,"p_material_id": string,"p_notes": string,"p_origin": Database["public"]['Enums']["inventory_origin"],"p_supplier": string,"p_tag": string,"p_unit_value_cents": number }; Returns: string
                           },
"inventory_adjust_lot":
{ Args: { "p_lot_id": string,"p_notes": string,"p_quantity": number }; Returns: undefined
                           },
"inventory_check_location":
{ Args: { "p_group_id": string,"p_location_id": string }; Returns: undefined
                           },
"inventory_check_tag":
{ Args: { "p_group_id": string,"p_material_id": string,"p_tag": string,"p_unit_id": string }; Returns: string
                           },
"inventory_clean":
{ Args: { "p_text": string }; Returns: string
                           },
"inventory_condition_rank":
{ Args: { "c": Database["public"]['Enums']["inventory_condition"] }; Returns: number
                           },
"inventory_lock_lot":
{ Args: { "p_lot_id": string }; Returns: {
              "acquired_on": string | null,
"condition": Database["public"]['Enums']["inventory_condition"] | null,
"created_at": string,
"expires_on": string | null,
"group_id": string,
"id": string,
"invoice": string | null,
"location_id": string,
"material_id": string,
"notes": string | null,
"origin": Database["public"]['Enums']["inventory_origin"],
"quantity": number,
"supplier": string | null,
"unit_value_cents": number | null,
"updated_at": string,
"variant": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "inventory_lots"
        isOneToOne: true
        isSetofReturn: false
      } },
"inventory_lock_unit":
{ Args: { "p_unit_id": string }; Returns: {
              "acquired_on": string | null,
"condition": Database["public"]['Enums']["inventory_condition"] | null,
"created_at": string,
"description": string | null,
"group_id": string,
"id": string,
"invoice": string | null,
"legacy_code": string | null,
"location_id": string,
"material_id": string,
"notes": string | null,
"origin": Database["public"]['Enums']["inventory_origin"],
"supplier": string | null,
"tag": string | null,
"unit_value_cents": number | null,
"updated_at": string,
"write_off_reason": Database["public"]['Enums']["inventory_write_off_reason"] | null,
"written_off_at": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "inventory_units"
        isOneToOne: true
        isSetofReturn: false
      } },
"inventory_log":
{ Args: { "p_details": Json,"p_from_condition": Database["public"]['Enums']["inventory_condition"],"p_from_location": string,"p_group_id": string,"p_kind": Database["public"]['Enums']["inventory_movement_kind"],"p_lot_id": string,"p_material_id": string,"p_notes": string,"p_quantity": number,"p_reason": Database["public"]['Enums']["inventory_write_off_reason"],"p_to_condition": Database["public"]['Enums']["inventory_condition"],"p_to_location": string,"p_unit_id": string }; Returns: number
                           },
"inventory_matching_lot":
{ Args: { "p_condition": Database["public"]['Enums']["inventory_condition"],"p_except": string,"p_expires_on": string,"p_location_id": string,"p_material_id": string,"p_variant": string }; Returns: {
              "acquired_on": string | null,
"condition": Database["public"]['Enums']["inventory_condition"] | null,
"created_at": string,
"expires_on": string | null,
"group_id": string,
"id": string,
"invoice": string | null,
"location_id": string,
"material_id": string,
"notes": string | null,
"origin": Database["public"]['Enums']["inventory_origin"],
"quantity": number,
"supplier": string | null,
"unit_value_cents": number | null,
"updated_at": string,
"variant": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "inventory_lots"
        isOneToOne: true
        isSetofReturn: false
      } },
"inventory_merged_value":
{ Args: { "p_added": number,"p_added_value": number,"p_quantity": number,"p_value": number }; Returns: number
                           },
"inventory_next_location_position":
{ Args: { "p_group_id": string,"p_parent_id": string }; Returns: number
                           },
"inventory_next_tag":
{ Args: { "p_family_id": string }; Returns: string
                           },
"inventory_place_location":
{ Args: { "p_id": string,"p_place": string,"p_target": string }; Returns: undefined
                           },
"inventory_quick":
{ Args: { "p_action": string,"p_args": Json }; Returns: Json
                           },
"inventory_record_count":
{ Args: { "p_location_id": string,"p_material_id": string,"p_notes": string,"p_quantity": number,"p_year": number }; Returns: string
                           },
"inventory_review_movements":
{ Args: { "p_group_id": string,"p_ids": (number)[],"p_notes": string }; Returns: number
                           },
"inventory_role_of":
{ Args: { "p_group_id": string }; Returns: Database["public"]['Enums']["inventory_role"]
                           },
"inventory_save_family":
{ Args: { "p_active"?: boolean,"p_code": string,"p_group_id": string,"p_id": string,"p_name": string }; Returns: string
                           },
"inventory_save_location":
{ Args: { "p_active"?: boolean,"p_description": string,"p_group_id": string,"p_id": string,"p_name": string,"p_parent_id": string }; Returns: string
                           },
"inventory_save_material":
{ Args: { "p_active"?: boolean,"p_consumable": boolean,"p_description": string,"p_family_id": string,"p_group_id": string,"p_id": string,"p_minimum_quantity": number,"p_name": string,"p_tracking": Database["public"]['Enums']["inventory_tracking"] }; Returns: string
                           },
"inventory_search_normalize":
{ Args: { "p_text": string }; Returns: string
                           },
"inventory_set_lot_condition":
{ Args: { "p_condition": Database["public"]['Enums']["inventory_condition"],"p_lot_id": string,"p_notes": string,"p_quantity": number }; Returns: string
                           },
"inventory_set_unit_condition":
{ Args: { "p_condition": Database["public"]['Enums']["inventory_condition"],"p_notes": string,"p_unit_id": string }; Returns: undefined
                           },
"inventory_split_lot":
{ Args: { "p_condition": Database["public"]['Enums']["inventory_condition"],"p_location_id": string,"p_lot": Omit<Database["public"]['Tables']["inventory_lots"]['Row'], Database["public"]['Tables']["inventory_lots"]['ComputedFields']>,"p_quantity": number }; Returns: string
                           },
"inventory_transfer_lot":
{ Args: { "p_lot_id": string,"p_notes": string,"p_quantity": number,"p_to_location_id": string }; Returns: string
                           },
"inventory_transfer_unit":
{ Args: { "p_notes": string,"p_to_location_id": string,"p_unit_id": string }; Returns: undefined
                           },
"inventory_update_lot":
{ Args: { "p_acquired_on": string,"p_expires_on": string,"p_invoice": string,"p_lot_id": string,"p_notes": string,"p_origin": Database["public"]['Enums']["inventory_origin"],"p_supplier": string,"p_unit_value_cents": number,"p_variant"?: string }; Returns: undefined
                           },
"inventory_update_unit":
{ Args: { "p_acquired_on": string,"p_description": string,"p_invoice": string,"p_legacy_code": string,"p_notes": string,"p_origin": Database["public"]['Enums']["inventory_origin"],"p_supplier": string,"p_tag": string,"p_unit_id": string,"p_unit_value_cents": number }; Returns: undefined
                           },
"inventory_write_off_lot":
{ Args: { "p_lot_id": string,"p_notes": string,"p_quantity": number,"p_reason": Database["public"]['Enums']["inventory_write_off_reason"] }; Returns: undefined
                           },
"inventory_write_off_unit":
{ Args: { "p_notes": string,"p_reason": Database["public"]['Enums']["inventory_write_off_reason"],"p_unit_id": string }; Returns: undefined
                           },
"is_group_member":
{ Args: { "requested_group_id": string }; Returns: boolean
                           },
"ledger_entry_history":
{ Args: { "p_entry_id": string }; Returns: {
              "action": string,"actor_email": string,"created_at": string,"details": Json,"id": number
            }[]
                           },
"ledger_entry_snapshot":
{ Args: { "p_entry_id": string }; Returns: Json
                           },
"link_reconciliation":
{ Args: { "p_ledger_entry_ids": (string)[],"p_statement_line_ids": (string)[] }; Returns: string
                           },
"move_ledger_entries_account":
{ Args: { "p_account_id": string,"p_entry_ids": (string)[] }; Returns: Json
                           },
"next_category_position":
{ Args: { "p_parent_id": string }; Returns: number
                           },
"patrol_snapshot":
{ Args: { "p_patrol_id": string }; Returns: Json
                           },
"pay_debts":
{ Args: { "p_allocations": Json,"p_associate_id": string,"p_entry_id": string,"p_group_id": string }; Returns: undefined
                           },
"preview_statement_lines":
{ Args: { "p_account_id": string,"p_lines": Json,"p_period_from": string,"p_period_to": string }; Returns: Json
                           },
"realized_by_month":
{ Args: { "p_group_id": string,"p_year": number }; Returns: {
              "amount_cents": number,"category_id": string,"month": number
            }[]
                           },
"record_user_invite":
{ Args: { "p_group_id": string,"p_role": Database["public"]['Enums']["member_role"],"p_target_user_id": string }; Returns: undefined
                           },
"reject_reconciliation_suggestion":
{ Args: { "p_ledger_entry_id": string,"p_statement_line_id": string }; Returns: undefined
                           },
"relative_link_snapshot":
{ Args: { "p_link_id": string }; Returns: Json
                           },
"relatives_check_associate":
{ Args: { "p_associate_id": string }; Returns: string
                           },
"relatives_check_details":
{ Args: { "p_group_id": string,"p_name": string,"p_notes": string,"p_relative_associate_id": string }; Returns: string
                           },
"relatives_check_kinship":
{ Args: { "p_kinship": Database["public"]['Enums']["relative_kinship"],"p_kinship_note": string }; Returns: string
                           },
"relatives_create":
{ Args: { "p_associate_id": string,"p_financial": boolean,"p_kinship": Database["public"]['Enums']["relative_kinship"],"p_kinship_note": string,"p_legal": boolean,"p_name": string,"p_relative_associate_id": string }; Returns: string
                           },
"relatives_insert_link":
{ Args: { "p_associate_id": string,"p_financial": boolean,"p_group_id": string,"p_kinship": Database["public"]['Enums']["relative_kinship"],"p_kinship_note": string,"p_legal": boolean,"p_relative_id": string }; Returns: string
                           },
"relatives_link":
{ Args: { "p_associate_id": string,"p_financial": boolean,"p_kinship": Database["public"]['Enums']["relative_kinship"],"p_kinship_note": string,"p_legal": boolean,"p_relative_id": string }; Returns: string
                           },
"relatives_rename":
{ Args: { "p_name": string,"p_notes": string,"p_relative_associate_id": string,"p_relative_id": string }; Returns: undefined
                           },
"relatives_unlink":
{ Args: { "p_link_id": string }; Returns: undefined
                           },
"relatives_update_link":
{ Args: { "p_financial": boolean,"p_kinship": Database["public"]['Enums']["relative_kinship"],"p_kinship_note": string,"p_legal": boolean,"p_link_id": string }; Returns: undefined
                           },
"rename_import_profile":
{ Args: { "p_name": string,"p_profile_id": string }; Returns: undefined
                           },
"renumber_categories":
{ Args: { "p_group_id": string }; Returns: undefined
                           },
"reopen_statement_line":
{ Args: { "p_id": string }; Returns: undefined
                           },
"resolve_entry_account":
{ Args: { "p_account_id": string,"p_group_id": string,"p_payment_method_id": string }; Returns: string
                           },
"restrict_auth_domain":
{ Args: { "event": Json }; Returns: Json
                           },
"review_ledger_entries":
{ Args: { "p_entry_ids": (string)[],"p_group_id": string }; Returns: number
                           },
"save_category_tree":
{ Args: { "p_deleted": Json,"p_group_id": string,"p_nodes": Json }; Returns: Json
                           },
"save_debt":
{ Args: { "p_agreement": string,"p_amount_cents": number,"p_associate_id": string,"p_debt_date": string,"p_description": string,"p_group_id": string,"p_id": string,"p_payments": Json }; Returns: string
                           },
"save_import_profile":
{ Args: { "p_format": string,"p_group_id": string,"p_header_signature": string,"p_name": string,"p_profile_id": string,"p_settings": Json }; Returns: string
                           },
"section_snapshot":
{ Args: { "p_section_id": string }; Returns: Json
                           },
"seed_accounts":
{ Args: { "p_group_id": string }; Returns: undefined
                           },
"seed_categories":
{ Args: { "p_group_id": string }; Returns: undefined
                           },
"seed_payment_methods":
{ Args: { "p_group_id": string }; Returns: undefined
                           },
"set_account_active":
{ Args: { "p_account_id": string,"p_active": boolean }; Returns: undefined
                           },
"set_category_active":
{ Args: { "p_active": boolean,"p_category_id": string }; Returns: undefined
                           },
"set_entry_document_filed":
{ Args: { "p_entry_id": string,"p_filed": boolean }; Returns: undefined
                           },
"set_fee_associate_price":
{ Args: { "p_associate_id": string,"p_monthly_cents": number,"p_reason": string,"p_year": number }; Returns: undefined
                           },
"set_fee_exemption":
{ Args: { "p_associate_id": string,"p_reason": string,"p_year": number }; Returns: undefined
                           },
"set_fee_record":
{ Args: { "p_associate_id": string,"p_month": number,"p_note": string,"p_split_ids": (string)[],"p_status": Database["public"]['Enums']["fee_status"],"p_year": number }; Returns: undefined
                           },
"set_fee_settings":
{ Args: { "p_category_id": string,"p_due_day": number,"p_due_rule": Database["public"]['Enums']["fee_due_rule"],"p_group_id": string }; Returns: undefined
                           },
"set_fee_year_settings":
{ Args: { "p_deadline": string,"p_discount_pct": number,"p_group_id": string,"p_monthly_cents": number,"p_year": number }; Returns: undefined
                           },
"set_ledger_entry_account":
{ Args: { "p_account_id": string,"p_entry_id": string }; Returns: undefined
                           },
"set_ledger_entry_outside_statement":
{ Args: { "p_entry_id": string,"p_outside": boolean }; Returns: undefined
                           },
"set_payment_method_active":
{ Args: { "p_active": boolean,"p_payment_method_id": string }; Returns: undefined
                           },
"set_payment_method_default_account":
{ Args: { "p_account_id": string,"p_payment_method_id": string }; Returns: undefined
                           },
"statement_description_key":
{ Args: { "p_description": string }; Returns: string
                           },
"statement_line_fingerprint":
{ Args: { "p_account_id": string,"p_amount_cents": number,"p_date": string,"p_description": string,"p_occurrence": number }; Returns: string
                           },
"statement_line_snapshot":
{ Args: { "p_line_id": string }; Returns: Json
                           },
"unlink_reconciliation":
{ Args: { "p_statement_line_id": string }; Returns: undefined
                           },
"update_account":
{ Args: { "p_account_id": string,"p_bank": string,"p_branch": string,"p_kind": Database["public"]['Enums']["account_kind"],"p_ledger_code": string,"p_name": string,"p_number": string,"p_opening_balance_cents": number,"p_opening_date": string }; Returns: undefined
                           },
"update_category":
{ Args: { "p_category_id": string,"p_ledger_code": string,"p_name": string,"p_parent_id": string }; Returns: undefined
                           },
"update_ledger_entry":
{ Args: { "p_account_id"?: string,"p_document": string,"p_document_filed": boolean,"p_entry_date": string,"p_entry_id": string,"p_name": string,"p_notes"?: string,"p_payment_method_id": string,"p_splits": Json,"p_total_cents": number }; Returns: undefined
                           },
"update_patrol":
{ Args: { "p_active": boolean,"p_name": string,"p_patrol_id": string }; Returns: undefined
                           },
"update_payment_method":
{ Args: { "p_name": string,"p_payment_method_id": string }; Returns: undefined
                           },
"update_section":
{ Args: { "p_active": boolean,"p_name": string,"p_section_id": string }; Returns: undefined
                           },
"validate_entry_totals":
{ Args: { "p_splits": Json,"p_total_cents": number }; Returns: undefined
                           },
"write_entry_splits":
{ Args: { "p_entry_id": string,"p_group_id": string,"p_previous_splits"?: Json,"p_splits": Json }; Returns: undefined
                           }
          }
          Enums: {
            "account_kind": "corrente"|"poupanca"|"caixa"|"outro","associate_function_kind": "escotista"|"dirigente","associate_movement_kind": "entrada"|"saida","associates_role": "manager"|"viewer","category_kind": "receita"|"despesa","control_audience": "jovem"|"adulto"|"responsavel","control_item_kind": "documento"|"sistema"|"canal"|"etapa","control_status": "ok"|"pendente"|"desatualizado"|"a_verificar"|"convidado"|"nao_se_aplica"|"a_remover"|"removido","control_value_kind": "situacao"|"ano"|"data","directorate": "metodos_educativos"|"administrativa"|"financeira"|"comunicacao","fee_due_rule": "dia_fixo"|"dia_util"|"fim_do_mes","fee_status": "pago"|"atencao"|"nao_pago"|"isento","inventory_condition": "novo"|"bom"|"regular"|"ruim"|"manutencao"|"inservivel","inventory_movement_kind": "entrada"|"transferencia"|"condicao"|"ajuste"|"baixa"|"edicao","inventory_origin": "compra"|"doacao"|"fabricacao"|"nao_informada","inventory_review_status": "para_revisar"|"revisado","inventory_role": "manager"|"chief"|"viewer","inventory_tracking": "unit"|"lot","inventory_write_off_reason": "perda"|"extravio"|"descarte"|"doacao"|"consumo","member_role": "admin"|"treasurer"|"viewer","relative_kinship": "mae"|"pai"|"outro","scout_branch": "lobinho"|"escoteiro"|"senior"|"pioneiro"|"adulto","statement_line_status": "aberta"|"conciliada"|"ignorada"
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
            "account_kind": ["corrente", "poupanca", "caixa", "outro"],"associate_function_kind": ["escotista", "dirigente"],"associate_movement_kind": ["entrada", "saida"],"associates_role": ["manager", "viewer"],"category_kind": ["receita", "despesa"],"control_audience": ["jovem", "adulto", "responsavel"],"control_item_kind": ["documento", "sistema", "canal", "etapa"],"control_status": ["ok", "pendente", "desatualizado", "a_verificar", "convidado", "nao_se_aplica", "a_remover", "removido"],"control_value_kind": ["situacao", "ano", "data"],"directorate": ["metodos_educativos", "administrativa", "financeira", "comunicacao"],"fee_due_rule": ["dia_fixo", "dia_util", "fim_do_mes"],"fee_status": ["pago", "atencao", "nao_pago", "isento"],"inventory_condition": ["novo", "bom", "regular", "ruim", "manutencao", "inservivel"],"inventory_movement_kind": ["entrada", "transferencia", "condicao", "ajuste", "baixa", "edicao"],"inventory_origin": ["compra", "doacao", "fabricacao", "nao_informada"],"inventory_review_status": ["para_revisar", "revisado"],"inventory_role": ["manager", "chief", "viewer"],"inventory_tracking": ["unit", "lot"],"inventory_write_off_reason": ["perda", "extravio", "descarte", "doacao", "consumo"],"member_role": ["admin", "treasurer", "viewer"],"relative_kinship": ["mae", "pai", "outro"],"scout_branch": ["lobinho", "escoteiro", "senior", "pioneiro", "adulto"],"statement_line_status": ["aberta", "conciliada", "ignorada"]
          }
        }
} as const
