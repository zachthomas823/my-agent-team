export type { TaskAssignment, AgentEvent, AgentRole } from "../shared/types.js";

export interface AgentConfig {
  role: string;
  model: string;
  systemPromptBase: string;
  allowedTools: string[];
  produces: string[];
  consumes: string[];
}
