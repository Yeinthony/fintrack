import { Route, Routes } from "react-router";
import { DashboardPage } from "@renderer/features/dashboard/DashboardPage";
import { Layout } from "@renderer/components/Layout";


export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>                                                                                  
        <Route path="/" element={<DashboardPage />} />                                                                  
        {/* Aquí van tus futuras rutas */}
      </Route>                                                                       
    </Routes>  
  );
}
