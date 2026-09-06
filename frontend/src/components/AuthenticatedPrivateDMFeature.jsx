import { useEffect, useState } from "react";
import PrivateDMFeature from "./PrivateDMFeature.jsx";

export default function AuthenticatedPrivateDMFeature() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    function handleAuthUser(event) {
      setUser(event.detail || null);
    }

    window.addEventListener("pokinex:auth-user", handleAuthUser);
    return () => window.removeEventListener("pokinex:auth-user", handleAuthUser);
  }, []);

  if (!user) return null;

  return <PrivateDMFeature key={String(user.id)} />;
}
