import type { Request, Response } from "express";
import type Database from "better-sqlite3";
import type { RedisClientType } from "redis";
import type { WebSocketServer } from "ws";

// === Database Row Types ===

export interface ProjectRow {
  id: string;
  name: string;
  status: string;
  current_phase: string;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: number;
  project_id: string;
  agent_id: string;
  event_type: string;
  data: string;
  created_at: string;
}

export interface BlockerRow {
  id: string;
  project_id: string;
  agent_id: string;
  question: string;
  context: string;
  priority: string;
  options: string | null;
  status: string;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}

// === Request/Response Types ===

export interface CreateProjectBody {
  name: string;
  description: string;
}

export interface ResolveBlockerBody {
  resolution: string;
  selected_option?: string;
}

export interface SendMessageBody {
  message: string;
  project_id: string;
}

// === Workflow State ===

export interface WorkflowState {
  current_phase: string;
  phases: PhaseState[];
  pending_blockers: number;
  total_events: number;
}

export interface PhaseState {
  name: string;
  status: "completed" | "active" | "pending";
  agent_id: string;
}

// === Shared Dependencies ===

export interface AppDeps {
  db: Database.Database;
  redis: RedisClientType;
  wss: WebSocketServer;
  dataDir: string;
}
