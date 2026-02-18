import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { ProjectView } from "./pages/ProjectView";
import { AgentChat } from "./pages/AgentChat";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/projects/:id" element={<ProjectView />} />
        <Route path="/agents/:agentId/chat" element={<AgentChat />} />
        <Route path="/agents/chat" element={<AgentChat />} />
      </Routes>
    </BrowserRouter>
  );
}
