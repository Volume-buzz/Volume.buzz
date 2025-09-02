"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    // Check if user has a saved preference
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    
    if (savedTheme === "light" || (!savedTheme && !prefersDark)) {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    } else {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    
    if (newTheme) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium text-foreground">Theme</p>
        <p className="text-sm text-muted-foreground">
          Choose between light and dark mode
        </p>
      </div>
      <Button 
        onClick={toggleTheme}
        variant="outline" 
        size="sm"
        className="flex items-center gap-2"
      >
        <i className={`fas ${isDark ? "fa-sun" : "fa-moon"}`} />
        {isDark ? "Light Mode" : "Dark Mode"}
      </Button>
    </div>
  );
}