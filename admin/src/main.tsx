import "./index.css";

import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { FeedbackHost, Spinner } from "./components/ui";
import { AuthProvider, useAuth } from "./lib/auth";
import AiLab from "./pages/AiLab";
import Admins from "./pages/Admins";
import Cameras from "./pages/Cameras";
import Detections from "./pages/Detections";
import Emergencies from "./pages/Emergencies";
import HomeownerDetail from "./pages/HomeownerDetail";
import Homeowners from "./pages/Homeowners";
import Login from "./pages/Login";
import Overview from "./pages/Overview";

function Gate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.status === "loading") return <Spinner className="h-full" />;
  if (auth.status !== "admin") return <Login reason={auth.reason} />;
  return children;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Gate>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Overview />} />
              <Route path="emergencies" element={<Emergencies />} />
              <Route path="homeowners" element={<Homeowners />} />
              <Route path="homeowners/:uid" element={<HomeownerDetail />} />
              <Route path="detections" element={<Detections />} />
              <Route path="cameras" element={<Cameras />} />
              <Route path="admins" element={<Admins />} />
              <Route path="ai-lab" element={<AiLab />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Gate>
      </BrowserRouter>
      <FeedbackHost />
    </AuthProvider>
  </StrictMode>,
);
