"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AuthPage({ isSignin }: { isSignin: boolean }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const router = useRouter();
    const searchParams = useSearchParams();

    // Check if user is already authenticated
    useEffect(() => {
        const token = localStorage.getItem("token");
        const user = localStorage.getItem("user");
        
        if (token && user) {
            const redirect = searchParams.get("redirect") || "/canvas";
            router.push(redirect);
        }
    }, [router, searchParams]);

    const signIn = async (email: string, password: string) => {
        setLoading(true);
        setError("");
        
        try {
            const response = await fetch("http://localhost:3000/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Login failed");
            }

            // Store token and user data
            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));
            
            // Also set cookie for middleware access
            document.cookie = `token=${data.token}; path=/; max-age=86400; SameSite=Lax`;
            
            console.log("Login successful:", data);
            
            // Redirect to the intended page or canvas
            const redirect = searchParams.get("redirect") || "/canvas";
            router.push(redirect);
        } catch (error) {
            console.error("Login error:", error);
            setError(error instanceof Error ? error.message : "Login failed");
        } finally {
            setLoading(false);
        }
    };

    const signUp = async (email: string, password: string, name: string) => {
        setLoading(true);
        setError("");
        
        try {
            const response = await fetch("http://localhost:3000/signup", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email, password, name }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Signup failed");
            }

            console.log("Signup successful:", data);
            // After successful signup, automatically sign in
            await signIn(email, password);
        } catch (error) {
            console.error("Signup error:", error);
            setError(error instanceof Error ? error.message : "Signup failed");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!email || !password) {
            setError("Please fill in all fields");
            return;
        }

        if (!isSignin && !name) {
            setError("Please enter your name");
            return;
        }

        if (isSignin) {
            signIn(email, password);
        } else {
            signUp(email, password, name);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="max-w-md w-full space-y-8 p-8">
                <div className="text-center">
                    <h2 className="text-3xl font-bold text-foreground">
                        {isSignin ? "Sign in to your account" : "Create your account"}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {isSignin ? "Welcome back!" : "Join us to start drawing"}
                    </p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        {!isSignin && (
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                                    Name
                                </label>
                                <input
                                    id="name"
                                    type="text"
                                    placeholder="Enter your name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                    disabled={loading}
                                />
                            </div>
                        )}

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                placeholder="Enter your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                disabled={loading}
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                                Password
                            </label>
                            <input
                                id="password"
                                type="password"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <div className="flex items-center">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2"></div>
                                {isSignin ? "Signing in..." : "Creating account..."}
                            </div>
                        ) : (
                            isSignin ? "Sign in" : "Sign up"
                        )}
                    </button>
                </form>

                <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                        {isSignin ? "Don't have an account? " : "Already have an account? "}
                        <a
                            href={isSignin ? "/signup" : "/signin"}
                            className="font-medium text-primary hover:text-primary/90"
                        >
                            {isSignin ? "Sign up" : "Sign in"}
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}