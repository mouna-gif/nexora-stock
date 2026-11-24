import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function SuppliersPage() {
  return (
    <div className="p-6">
      <Link to="/app/purchases" className="flex items-center gap-2 text-navy-500 hover:text-navy-700 mb-6 text-sm transition-colors">
        <ArrowLeft className="w-4 h-4" /> Voir la page Achats pour les fournisseurs
      </Link>
    </div>
  );
}
