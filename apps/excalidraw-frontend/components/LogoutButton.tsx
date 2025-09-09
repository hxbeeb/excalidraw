"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
    const router = useRouter();

    const handleLogout = () => {
        // Clear localStorage
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        
        // Clear cookie
        document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        
        // Redirect to home page
        router.push("/");
    };

    return (
        <button
            onClick={handleLogout}
            className="text-muted-foreground hover:text-foreground transition-smooth"
        >
            Sign out
        </button>
    );
}
